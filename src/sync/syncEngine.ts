/**
 * syncEngine.ts
 * Motor de sincronização offline-first.
 */

import { db, type SyncQueueItem, type SyncEntity, type SyncActionType } from '../db/database';
import { supabase } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';

const MAX_RETRIES = 5;
const RETRY_DELAYS = [2_000, 5_000, 15_000, 30_000, 60_000];

const ENTITY_TABLE: Record<SyncEntity, string> = {
  'rg': 'rg_records',
  'field-work': 'field_work_records',
  'pending': 'pending_records',
  'property': 'properties',
};

export async function enqueue(
  entity: SyncEntity,
  type: SyncActionType,
  payload: Record<string, unknown>
): Promise<string> {
  const tempId = uuidv4();
  await db.syncQueue.add({
    tempId,
    entity,
    type,
    payload,
    status: 'pending',
    retries: 0,
    createdAt: Date.now(),
  });
  return tempId;
}

let isProcessing = false;

export async function processQueue(): Promise<void> {
  if (isProcessing) return;
  if (!navigator.onLine) return;
  isProcessing = true;
  try {
    const pending = await db.syncQueue
      .where('status').anyOf(['pending', 'error']).toArray();
    for (const item of pending) {
      if (item.retries >= MAX_RETRIES) {
        await db.syncQueue.update(item.id!, {
          status: 'error',
          lastError: `Máximo de tentativas atingido (${MAX_RETRIES})`,
        });
        continue;
      }
      await processItem(item);
      await sleep(100);
    }
  } finally {
    isProcessing = false;
  }
}

async function processItem(item: SyncQueueItem): Promise<void> {
  await db.syncQueue.update(item.id!, { status: 'processing' });
  try {
    const tableName = ENTITY_TABLE[item.entity];
    let error: unknown = null;
    const sb = supabase as any;

    if (item.type === 'CREATE') {
      const result = await sb.from(tableName).insert(item.payload);
      error = result.error;
    } else if (item.type === 'UPDATE') {
      const { id, ...rest } = item.payload as { id: string; [k: string]: unknown };
      const result = await sb.from(tableName).update(rest).eq('id', id);
      error = result.error;
    } else if (item.type === 'DELETE') {
      const { id } = item.payload as { id: string };
      const result = await sb.from(tableName).delete().eq('id', id);
      error = result.error;
    }

    if (error) throw error;

    await db.syncQueue.update(item.id!, { status: 'done', processedAt: Date.now() });
    await markEntitySynced(item.entity, item.payload as { id: string });
  } catch (err) {
    const retries = item.retries + 1;
    const delay = RETRY_DELAYS[Math.min(retries - 1, RETRY_DELAYS.length - 1)];
    await db.syncQueue.update(item.id!, {
      status: 'error',
      retries,
      lastError: String(err),
    });
    setTimeout(() => {
      db.syncQueue.update(item.id!, { status: 'pending' }).catch(() => {});
    }, delay);
  }
}

async function markEntitySynced(entity: SyncEntity, payload: { id: string }): Promise<void> {
  const tableMap = {
    'rg': db.rg,
    'field-work': db.fieldWork,
    'pending': db.pendingItems,
    'property': db.properties,
  } as const;
  const table = tableMap[entity];
  if (table && payload.id) {
    // @ts-expect-error generic table update
    await table.update(payload.id, { _synced: true });
  }
}

export async function pullFromServer(userId: string): Promise<void> {
  if (!navigator.onLine) return;
  await Promise.allSettled([
    pullEntity('rg', userId),
    pullEntity('field-work', userId),
    pullEntity('pending', userId),
    pullEntity('property', userId),
  ]);
}

async function pullEntity(entity: SyncEntity, userId: string): Promise<void> {
  const tableName = ENTITY_TABLE[entity];
  const { data, error } = await (supabase as any)
    .from(tableName).select('*').eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error || !data) return;

  const tableMap = {
    'rg': db.rg,
    'field-work': db.fieldWork,
    'pending': db.pendingItems,
    'property': db.properties,
  } as const;

  await tableMap[entity].bulkPut(
    data.map((row: Record<string, unknown>) => ({
      ...row, _synced: true, _deletedAt: undefined,
    })) as never[]
  );
}

export async function getQueueStats() {
  const all = await db.syncQueue.toArray();
  return {
    pending: all.filter((i) => i.status === 'pending' || i.status === 'processing').length,
    error: all.filter((i) => i.status === 'error').length,
    done: all.filter((i) => i.status === 'done').length,
  };
}

export async function clearDoneItems(): Promise<void> {
  await db.syncQueue.where('status').equals('done').delete();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
