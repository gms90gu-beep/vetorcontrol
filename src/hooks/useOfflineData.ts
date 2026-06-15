/**
 * useOfflineData.ts
 * Hooks React para leitura de dados offline-first.
 *
 * Padrão:
 *   1. Lê IndexedDB imediatamente (zero latência)
 *   2. Se online, faz fetch da API em background
 *   3. Salva resultado no IndexedDB
 *   4. Re-renderiza com dados atualizados
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type RGRecord, type FieldWorkRecord, type PendingRecord, type PropertyRecord } from '@/db/database';
import { db as offlineDb } from '@/lib/offline/db';
import { supabase } from '@/auth/auth';
import { isOnline } from '@/sync/networkMonitor';

interface UseOfflineDataResult<T> {
  data: T[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  isStale: boolean;
}

// ─── RG ───────────────────────────────────────────────────────────────────────

function toRGRecord(r: any): RGRecord {
  return {
    ...r,
    id: r.id,
    userId: r.agent_id,
    title: `Boletim ${r.block_number ?? ''}`.trim(),
    description: r.locality ?? undefined,
    status: r.finalized_at ? 'finalized' : 'draft',
    data: r,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    _synced: true,
    _deletedAt: undefined,
  };
}

const RG_MIGRATION_KEY = 'rg_cache_migration_v1';

async function runOneTimeRGCleanup(userId: string) {
  try {
    if (typeof localStorage === 'undefined') return;
    if (localStorage.getItem(RG_MIGRATION_KEY) === 'done') return;

    // 1) AppDB.rg: remove sem userId + duplicados por id
    const all = await db.rg.toArray();
    const seen = new Set<string>();
    const removeIds: string[] = [];
    for (const r of all) {
      if (!r.userId) removeIds.push(r.id);
      else if (seen.has(r.id)) removeIds.push(r.id);
      else seen.add(r.id);
    }
    if (removeIds.length) await db.rg.bulkDelete(removeIds);

    // 2) offlineDb.boletins_rg: remove sem agent_id + duplicados
    const cache = await offlineDb.boletins_rg.toArray();
    const seen2 = new Set<string>();
    const removeIds2: string[] = [];
    for (const r of cache) {
      if (!r.data?.agent_id || !r.id) removeIds2.push(r.id);
      else if (seen2.has(r.id)) removeIds2.push(r.id);
      else seen2.add(r.id);
    }
    if (removeIds2.length) await offlineDb.boletins_rg.bulkDelete(removeIds2);

    localStorage.setItem(RG_MIGRATION_KEY, 'done');
    console.log('[RG_MIGRATION_v1] limpeza concluída', {
      appDbRemoved: removeIds.length,
      offlineDbRemoved: removeIds2.length,
      userId,
    });
  } catch (e) {
    console.warn('[RG_MIGRATION_v1] falhou', e);
  }
}

export function useRGRecords(userId?: string): UseOfflineDataResult<RGRecord> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(true);
  const [serverCount, setServerCount] = useState<number | null>(null);

  // Lê de AMBOS os caches Dexie e faz UNION por id, sempre filtrando por userId.
  // CRÍTICO: enquanto userId for undefined (auth não pronto), NÃO ler nada — evita vazar registros de outros usuários.
  const data = useLiveQuery(
    async () => {
      if (!userId) {
        console.log('[RG_PIPELINE] userId: undefined | authReady: false | fetchExecutado: false — aguardando auth');
        return [] as RGRecord[];
      }

      const rgRowsAll = await db.rg.filter((r) => !r._deletedAt).toArray();
      const rgRows = rgRowsAll.filter((r) => r.userId === userId);

      const trabalhoCacheRows = await offlineDb.boletins_rg.toArray();
      const trabalhoRows = trabalhoCacheRows
        .map((r) => r.data)
        .filter((r) => !r?._deletedAt && r?.agent_id === userId)
        .map(toRGRecord);

      const byId = new Map<string, RGRecord>();
      for (const r of trabalhoRows) byId.set(r.id, r);
      for (const r of rgRows) byId.set(r.id, r); // AppDB sobrescreve cache antigo
      const merged = Array.from(byId.values());

      console.log(
        `[RG_PIPELINE] Servidor: ${serverCount ?? '?'} | Dexie(AppDB.rg): ${rgRows.length} | OfflineDB(boletins_rg): ${trabalhoRows.length} | Renderizados: ${merged.length} | userId: ${userId} | authReady: true | fetchExecutado: ${serverCount !== null}`,
      );
      return merged;
    },
    [userId, serverCount],
    [] as RGRecord[]
  ) ?? [];

  const fetchFromAPI = useCallback(async () => {
    if (!userId) return;
    if (!isOnline()) return;
    setLoading(true);
    setError(null);
    try {
      await runOneTimeRGCleanup(userId);

      const { data: rows, error: apiError } = await (supabase as any)
        .from('boletins_rg')
        .select('*')
        .eq('agent_id', userId)
        .order('updated_at', { ascending: false });
      if (apiError) throw apiError;
      const count = rows?.length ?? 0;
      console.log(`[RG_SERVER] Supabase retornou ${count} boletins para ${userId}`);
      setServerCount(count);

      if (rows) {
        const serverIds = new Set<string>(rows.map((r: any) => r.id));

        // Reconcilia AppDB.rg: remove linhas deste usuário que sumiram do servidor.
        const localForUser = await db.rg.filter((r) => r.userId === userId).toArray();
        const toDelete = localForUser.filter((r) => !serverIds.has(r.id)).map((r) => r.id);
        if (toDelete.length) {
          await db.rg.bulkDelete(toDelete);
          console.log(`[RG_RECONCILE] AppDB.rg: removidas ${toDelete.length} linhas órfãs`);
        }
        await db.rg.bulkPut(rows.map(toRGRecord));

        // Reconcilia offlineDb.boletins_rg do mesmo usuário.
        const localCache = await offlineDb.boletins_rg.toArray();
        const cacheToDelete = localCache
          .filter((r) => r.data?.agent_id === userId && !serverIds.has(r.id))
          .map((r) => r.id);
        if (cacheToDelete.length) {
          await offlineDb.boletins_rg.bulkDelete(cacheToDelete);
          console.log(`[RG_RECONCILE] offlineDb.boletins_rg: removidas ${cacheToDelete.length} linhas órfãs`);
        }
        await offlineDb.boletins_rg.bulkPut(
          rows.map((r: any) => ({ id: r.id, data: r, updatedAt: r.updated_at }))
        );

        setIsStale(false);
      }
    } catch (e) {
      console.warn('[RG_QUERY] error', e);
      setError('Falha ao sincronizar. Usando dados offline.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchFromAPI();
  }, [fetchFromAPI]);

  return { data, loading, error, refresh: fetchFromAPI, isStale };
}


// ─── Field Work ───────────────────────────────────────────────────────────────

export function useFieldWorkRecords(userId?: string): UseOfflineDataResult<FieldWorkRecord> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(true);

  const data = useLiveQuery(
    () =>
      userId
        ? db.fieldWork.where('userId').equals(userId).filter((r) => !r._deletedAt).toArray()
        : db.fieldWork.filter((r) => !r._deletedAt).toArray(),
    [userId],
    [] as FieldWorkRecord[]
  ) ?? [];

  const fetchFromAPI = useCallback(async () => {
    if (!isOnline() || !userId) return;
    setLoading(true);
    try {
      const { data: rows } = await (supabase as any)
        .from('field_work_records')
        .select('*')
        .eq('user_id', userId);
      if (rows) {
        await db.fieldWork.bulkPut(rows.map((r: any) => ({
          id: r.id,
          userId: r.user_id,
          propertyId: r.property_id,
          title: r.title,
          notes: r.notes,
          status: r.status,
          data: r.data ?? {},
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          _synced: true,
          _deletedAt: undefined,
        })));

        setIsStale(false);
      }
    } catch {
      setError('Usando dados offline.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchFromAPI(); }, [fetchFromAPI]);

  return { data, loading, error, refresh: fetchFromAPI, isStale };
}

// ─── Pending ──────────────────────────────────────────────────────────────────

export function usePendingRecords(userId?: string): UseOfflineDataResult<PendingRecord> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(true);

  const data = useLiveQuery(
    () =>
      userId
        ? db.pendingItems.where('userId').equals(userId).filter((r) => !r._deletedAt).toArray()
        : db.pendingItems.filter((r) => !r._deletedAt).toArray(),
    [userId],
    [] as PendingRecord[]
  ) ?? [];

  const fetchFromAPI = useCallback(async () => {
    if (!isOnline() || !userId) return;
    setLoading(true);
    try {
      const { data: rows } = await (supabase as any)
        .from('pending_records')
        .select('*')
        .eq('user_id', userId);
      if (rows) {
        await db.pendingItems.bulkPut(rows.map((r: any) => ({
          id: r.id,
          userId: r.user_id,
          entityType: r.entity_type,
          entityId: r.entity_id,
          reason: r.reason,
          data: r.data ?? {},
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          _synced: true,
          _deletedAt: undefined,
        })));

        setIsStale(false);
      }
    } catch {
      setError('Usando dados offline.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchFromAPI(); }, [fetchFromAPI]);

  return { data, loading, error, refresh: fetchFromAPI, isStale };
}

// ─── Property ─────────────────────────────────────────────────────────────────

export function usePropertyRecords(userId?: string): UseOfflineDataResult<PropertyRecord> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(true);

  const data = useLiveQuery(
    () =>
      userId
        ? db.properties.where('userId').equals(userId).filter((r) => !r._deletedAt).toArray()
        : db.properties.filter((r) => !r._deletedAt).toArray(),
    [userId],
    [] as PropertyRecord[]
  ) ?? [];

  const fetchFromAPI = useCallback(async () => {
    if (!isOnline() || !userId) return;
    setLoading(true);
    try {
      const { data: rows } = await (supabase as any)
        .from('properties')
        .select('*')
        .eq('user_id', userId);
      if (rows) {
        await db.properties.bulkPut(
          rows.map((r: any) => ({ ...r, _synced: true, _deletedAt: undefined }))
        );
        setIsStale(false);
      }
    } catch {
      setError('Usando dados offline.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchFromAPI(); }, [fetchFromAPI]);

  return { data, loading, error, refresh: fetchFromAPI, isStale };
}

// ─── Hook de sessão ───────────────────────────────────────────────────────────

export function useLocalSession() {
  const session = useLiveQuery(() => db.sessions.get('current'), [], null);
  return {
    session,
    isAuthenticated: !!session,
    userId: session?.userId,
  };
}

// ─── Hook de status de sync ───────────────────────────────────────────────────

export function useOfflineSyncStatus() {
  const pendingCount = useLiveQuery(
    () => db.syncQueue.where('status').anyOf(['pending', 'processing']).count(),
    [],
    0
  ) ?? 0;

  const errorCount = useLiveQuery(
    () => db.syncQueue.where('status').equals('error').count(),
    [],
    0
  ) ?? 0;

  return {
    hasPending: pendingCount > 0,
    pendingCount,
    errorCount,
    isSyncing: pendingCount > 0 && isOnline(),
  };
}

export { useOfflineSyncStatus as useSyncStatus };
