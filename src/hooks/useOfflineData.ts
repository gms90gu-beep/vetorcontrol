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

export function useRGRecords(userId?: string): UseOfflineDataResult<RGRecord> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(true);

  // Lê TODOS os registros locais não deletados — o escopo por agente já é
  // garantido na hora do fetch (eq agent_id) e por RLS no servidor.
  const data = useLiveQuery(
    async () => {
      const rgRows = await db.rg.filter((r) => !r._deletedAt).toArray();
      const trabalhoCacheRows = await offlineDb.boletins_rg.toArray();
      const trabalhoRows = trabalhoCacheRows
        .map((r) => r.data)
        .filter((r) => !r?._deletedAt && (!userId || r.agent_id === userId));
      console.log(`Dexie retornou ${rgRows.length} boletins`, { source: 'AppDB.rg', userId });
      console.log('[RG_COMPARE] useRGRecords vs FieldWorkPage', {
        useRGRecordsDexie: rgRows.length,
        fieldWorkPageDexieBoletinsRg: trabalhoRows.length,
        note: 'FieldWorkPage usa listRemoteOrCache("boletins_rg") em vetorcontrol-offline.boletins_rg',
      });
      return (rgRows.length > 0 ? rgRows : trabalhoRows.map(toRGRecord)) as RGRecord[];
    },
    [userId],
    [] as RGRecord[]
  ) ?? [];

  const fetchFromAPI = useCallback(async () => {
    if (!userId) return;
    if (!isOnline()) return;
    setLoading(true);
    setError(null);
    try {
      console.log('[RG_QUERY] agent_id:', userId);
      const { data: sessionData } = await (supabase as any).auth.getSession();
      console.log('[RG_AUTH] auth.uid():', sessionData?.session?.user?.id ?? null, '| user.id:', userId);
      const { data: rows, error: apiError } = await (supabase as any)
        .from('boletins_rg')
        .select('*')
        .eq('agent_id', userId)
        .order('updated_at', { ascending: false });
      if (apiError) throw apiError;
      console.log(`Supabase retornou ${rows?.length ?? 0} boletins`, rows);
      console.log('[RG_RESULT] count:', rows?.length ?? 0, rows);
      if (rows) {
        await db.rg.bulkPut(rows.map(toRGRecord));
        await offlineDb.boletins_rg.bulkPut(rows.map((r: any) => ({ id: r.id, data: r, updatedAt: r.updated_at })));
        const dexieCount = await db.rg.filter((r) => !r._deletedAt).count();
        console.log(`Dexie retornou ${dexieCount} boletins`, { source: 'AppDB.rg após sync' });

        setIsStale(false);
      }
    } catch (e) {
      console.warn('[RG_QUERY] error', e);
      setError('Falha ao sincronizar. Usando dados offline.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Refetch sempre que userId mudar (sem guard de ref que trava na 1ª chamada com userId undefined).
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
