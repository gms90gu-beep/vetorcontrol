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

export function useRGRecords(userId?: string): UseOfflineDataResult<RGRecord> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(true);
  const fetchedRef = useRef(false);

  const data = useLiveQuery(
    () =>
      userId
        ? db.rg.where('userId').equals(userId).filter((r) => !r._deletedAt).toArray()
        : db.rg.filter((r) => !r._deletedAt).toArray(),
    [userId],
    [] as RGRecord[]
  ) ?? [];

  const fetchFromAPI = useCallback(async () => {
    if (!isOnline() || !userId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: rows, error: apiError } = await (supabase as any)
        .from('rg_records')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });
      if (apiError) throw apiError;
      if (rows) {
        await db.rg.bulkPut(
          rows.map((r: any) => ({ ...r, _synced: true, _deletedAt: undefined }))
        );
        setIsStale(false);
      }
    } catch {
      setError('Falha ao sincronizar. Usando dados offline.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      fetchFromAPI();
    }
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
        await db.fieldWork.bulkPut(
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
        await db.pendingItems.bulkPut(
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
