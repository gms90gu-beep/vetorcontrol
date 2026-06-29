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

import { useState, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type RGRecord, type FieldWorkRecord, type PendingRecord, type PropertyRecord } from '@/db/database';
import { db as offlineDb } from '@/lib/offline/db';
import { supabase } from '@/auth/auth';
import { isOnline } from '@/sync/networkMonitor';
import { reconcile } from '@/lib/offline/reconciler';

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

const RG_MIGRATION_KEY = 'rg_cache_v2_drop_appdb';

async function logDexieRGSnapshot(context: string) {
  try {
    console.log('[DEXIE_TABLES]', offlineDb.tables.map((t) => t.name));
    console.log('[DEXIE_DB_INFO]', {
      context,
      name: offlineDb.name,
      version: offlineDb.verno,
      schema: offlineDb.tables.map((t) => ({ name: t.name, schema: t.schema.primKey.src, indexes: t.schema.indexes.map((i) => i.src) })),
    });
    const total = await offlineDb.boletins_rg.count();
    console.log('[DEXIE_RG_TOTAL]', total);
    const all = await offlineDb.boletins_rg.limit(5).toArray();
    console.log('[DEXIE_RG_SAMPLE]', all);
  } catch (e) {
    console.warn('[DEXIE_RG_DIAGNOSTIC_ERROR]', { context, error: e });
  }
}

/** One-shot: zera o cache legado AppDB.rg. A partir daqui, RG vive só em offlineDb.boletins_rg. */
async function dropLegacyAppDbRG() {
  try {
    if (typeof localStorage === 'undefined') return;
    if (localStorage.getItem(RG_MIGRATION_KEY) === 'done') return;
    const n = await db.rg.count();
    if (n > 0) await db.rg.clear();
    localStorage.setItem(RG_MIGRATION_KEY, 'done');
    console.log(`[RG_MIGRATION_v2] AppDB.rg esvaziado (${n} linhas). Cache oficial: offlineDb.boletins_rg`);
  } catch (e) {
    console.warn('[RG_MIGRATION_v2] falhou', e);
  }
}

export function useRGRecords(userId?: string): UseOfflineDataResult<RGRecord> {
  console.log('[RG_HOOK_START]', { userId, ts: Date.now() });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(true);
  const [serverCount, setServerCount] = useState<number | null>(null);

  console.log('[RG_CACHE]', 0);
  console.log('[RG_REMOTE]', serverCount ?? 0);
  console.log('[RG_MERGED]', 0);
  console.log('[RG_DUPLICATES]', { original: 0, deduplicado: 0 });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await logDexieRGSnapshot('useRGRecords:diagnostic-effect:before-cache-read');
      const rows = userId ? await offlineDb.boletins_rg.toArray() : [];
      if (cancelled) return;
      const cache = rows
        .map((r) => r.data)
        .filter((r) => r && !r._deletedAt && r.agent_id === userId)
        .map(toRGRecord);
      const remote = Array.from({ length: serverCount ?? 0 });
      const merged = cache;
      const unique = Array.from(new Map(merged.map((r) => [r.id, r])).values());

      console.log('[RG_CACHE]', cache.length);
      console.log('[RG_REMOTE]', remote.length);
      console.log('[RG_MERGED]', merged.length);
      console.log('[RG_DUPLICATES]', { original: merged.length, deduplicado: unique.length });
    })().catch((e) => console.warn('[RG_DIAGNOSTIC_LOGS] falhou', e));
    return () => { cancelled = true; };
  }, [userId, serverCount]);

  // Fonte única de verdade: offlineDb.boletins_rg, filtrado por userId.
  const data = useLiveQuery(
    async () => {
      console.log('[RG_LIVEQUERY_RUN]', { userId });
      await logDexieRGSnapshot('useRGRecords:liveQuery:before-cache-read');
      if (!userId) {
        console.log('[RG_CACHE]', 0);
        console.log('[RG_REMOTE]', serverCount ?? 0);
        console.log('[RG_MERGED]', 0);
        console.log('[RG_DUPLICATES]', { original: 0, deduplicado: 0 });
        console.log('[RG_PIPELINE] userId: undefined | authReady: false | fetchExecutado: false — aguardando auth');
        return [] as RGRecord[];
      }

      const rows = await offlineDb.boletins_rg.toArray();
      console.log('[RG_RAW_RECORDS]', rows);
      console.log('[RG_RAW_COUNT]', rows.length);

      const mineRaw = rows
        .map((r) => r.data)
        .filter((r) => r && !r._deletedAt && r.agent_id === userId)
        .map(toRGRecord);

      const totalOriginal = mineRaw.length;
      console.log('[RG_BEFORE_DEDUPE]', totalOriginal);
      console.log('[RG_DEDUPE_KEY]', 'id');
      const seen = new Map<string, ReturnType<typeof toRGRecord>>();
      const removedIds: string[] = [];
      for (const r of mineRaw) {
        if (seen.has(r.id)) removedIds.push(r.id);
        else seen.set(r.id, r);
      }
      const unique = Array.from(seen.values());
      console.log('[RG_AFTER_DEDUPE]', unique.length);
      console.log('[RG_REMOVED_IDS]', removedIds);

      console.log('[RG_CACHE]', rows.length);
      console.log('[RG_REMOTE]', serverCount ?? 0);
      console.log('[RG_MERGED]', totalOriginal);
      console.log('[RG_DUPLICATES]', { original: totalOriginal, deduplicado: unique.length });
      if (totalOriginal !== unique.length) {
        console.warn('[RG_DUPLICATES] removidos:', totalOriginal - unique.length, removedIds);
      }

      unique.forEach((r) =>
        console.log('[RG_RENDER]', r.id, (r.data as any)?.block_number, (r.data as any)?.locality),
      );

      console.log(
        `[RG_PIPELINE] Servidor: ${serverCount ?? '?'} | Local(boletins_rg): ${unique.length} | Renderizados: ${unique.length} | userId: ${userId} | authReady: true | fetchExecutado: ${serverCount !== null}`,
      );
      return unique;
    },
    [userId, serverCount],
    [] as RGRecord[],
  ) ?? [];

  const fetchFromAPI = useCallback(async () => {
    if (!userId) return;
    if (!isOnline()) return;
    setLoading(true);
    setError(null);
    try {
      await dropLegacyAppDbRG();

      console.log('[RG_SYNC_START]');
      const { data: rows, error: apiError } = await (supabase as any)
        .from('boletins_rg')
        .select('*')
        .eq('agent_id', userId)
        .order('updated_at', { ascending: false });
      if (apiError) throw apiError;

      const serverRows = rows ?? [];
      console.log('[RG_SYNC_RECEIVED]', serverRows.length);
      setServerCount(serverRows.length);

      const report = await reconcile({
        module: 'rg',
        userId,
        serverRows,
        localStore: offlineDb.boletins_rg,
        ownerKey: 'agent_id',
      });
      console.log('[RG_SYNC_WRITTEN]', report.inserted + report.updated);

      setIsStale(false);
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

  useEffect(() => {
    const onOnline = () => fetchFromAPI();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
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
