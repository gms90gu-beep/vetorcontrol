/**
 * useOfflineMutation.ts
 * Hook para criar/editar/deletar dados com suporte offline completo.
 * 1. Escreve imediatamente no IndexedDB
 * 2. Enfileira ação no syncQueue
 * 3. Se online, tenta sync imediato em background
 */

import { useCallback, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { db, type SyncEntity } from '@/db/database';
import { enqueue, processQueue } from '@/sync/syncEngine';
import { isOnline } from '@/sync/networkMonitor';
import { useLocalSession } from '@/hooks/useOfflineData';

interface MutationOptions {
  entity: SyncEntity;
  onSuccess?: () => void;
  onError?: (err: unknown) => void;
}

interface MutationState {
  loading: boolean;
  error: string | null;
}

// ─── CREATE ───────────────────────────────────────────────────────────────────

export function useCreateRecord<T extends Record<string, unknown>>(options: MutationOptions) {
  const { session } = useLocalSession();
  const [state, setState] = useState<MutationState>({ loading: false, error: null });

  const create = useCallback(async (
    data: Omit<T, 'id' | 'userId' | 'createdAt' | 'updatedAt' | '_synced'>
  ) => {
    if (!session) { setState({ loading: false, error: 'Sessão não encontrada' }); return; }
    setState({ loading: true, error: null });

    const now = new Date().toISOString();
    const record = { ...data, id: uuidv4(), userId: session.userId, createdAt: now, updatedAt: now, _synced: false };

    try {
      const tableMap = { 'rg': db.rg, 'field-work': db.fieldWork, 'pending': db.pendingItems, 'property': db.properties };
      await (tableMap[options.entity] as typeof db.rg).put(record as never);
      await enqueue(options.entity, 'CREATE', record as Record<string, unknown>);
      if (isOnline()) processQueue().catch(() => {});
      setState({ loading: false, error: null });
      options.onSuccess?.();
      return record;
    } catch (err) {
      setState({ loading: false, error: String(err) });
      options.onError?.(err);
    }
  }, [session, options]);

  return { create, ...state };
}

// ─── UPDATE ───────────────────────────────────────────────────────────────────

export function useUpdateRecord<T extends { id: string }>(options: MutationOptions) {
  const [state, setState] = useState<MutationState>({ loading: false, error: null });

  const update = useCallback(async (id: string, changes: Partial<T>) => {
    setState({ loading: true, error: null });
    const updatedChanges = { ...changes, updatedAt: new Date().toISOString(), _synced: false };
    try {
      const tableMap = { 'rg': db.rg, 'field-work': db.fieldWork, 'pending': db.pendingItems, 'property': db.properties };
      await (tableMap[options.entity] as typeof db.rg).update(id, updatedChanges as never);
      await enqueue(options.entity, 'UPDATE', { id, ...updatedChanges });
      if (isOnline()) processQueue().catch(() => {});
      setState({ loading: false, error: null });
      options.onSuccess?.();
    } catch (err) {
      setState({ loading: false, error: String(err) });
      options.onError?.(err);
    }
  }, [options]);

  return { update, ...state };
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export function useDeleteRecord(options: MutationOptions) {
  const [state, setState] = useState<MutationState>({ loading: false, error: null });

  const remove = useCallback(async (id: string) => {
    setState({ loading: true, error: null });
    try {
      const tableMap = { 'rg': db.rg, 'field-work': db.fieldWork, 'pending': db.pendingItems, 'property': db.properties };
      await (tableMap[options.entity] as typeof db.rg).update(id, {
        _deletedAt: new Date().toISOString(), _synced: false,
      } as never);
      await enqueue(options.entity, 'DELETE', { id });
      if (isOnline()) processQueue().catch(() => {});
      setState({ loading: false, error: null });
      options.onSuccess?.();
    } catch (err) {
      setState({ loading: false, error: String(err) });
      options.onError?.(err);
    }
  }, [options]);

  return { remove, ...state };
}
