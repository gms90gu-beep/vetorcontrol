/**
 * reconciler.ts — Engine genérica de reconciliação Servidor ↔ Cache Local.
 *
 * Operações (ordem determinística):
 *   1. Inserir faltantes (no servidor, ausentes localmente)
 *   2. Atualizar divergentes (updated_at do servidor vence)
 *   3. Remover órfãos (locais do mesmo userId que sumiram do servidor)
 *   4. Registrar conflitos (local mais novo que o servidor)
 *
 * Proteção offline:
 *   Registros que ainda possuem mutação pendente na fila nunca são removidos
 *   apenas porque ainda não apareceram no servidor. Isso evita perda de dados
 *   durante a janela entre a reconexão e o flush da fila.
 *
 * Uso:
 *   await reconcile({
 *     module: 'rg',
 *     userId,
 *     serverRows,
 *     localStore: offlineDb.boletins_rg,
 *     ownerKey: 'agent_id',
 *   });
 */

import type { Table } from 'dexie';
import { db as offlineDb, type CachedRow, type Mutation } from '@/lib/offline/db';

export type ReconcileModule = 'rg' | 'work' | 'pendencies' | 'properties';

export interface ReconcileConflict {
  id: string;
  module: ReconcileModule;
  reason: string;
  localUpdatedAt?: string;
  serverUpdatedAt?: string;
  ts: number;
}

export interface ReconcileReport {
  module: ReconcileModule;
  userId: string;
  server: number;
  local: number;
  inserted: number;
  updated: number;
  deleted: number;
  preservedPending: number;
  conflicts: ReconcileConflict[];
}

export interface ReconcileInput {
  module: ReconcileModule;
  userId: string;
  /** Linhas como vieram do Supabase (com id + updated_at + agent_id/user_id). */
  serverRows: any[];
  /** Store Dexie de CachedRow (id, data, updatedAt). */
  localStore: Table<CachedRow, string>;
  /** Campo em `data` que identifica o dono do registro (default: 'agent_id'). */
  ownerKey?: string;
  /**
   * Nome(s) usados pela fila de mutações para esta store. Opcional porque os
   * módulos atuais usam nomes de tabela diferentes dos nomes das stores Dexie.
   */
  mutationTables?: string[];
}

const CONFLICTS_KEY = 'reconcile:conflicts';

const MODULE_MUTATION_TABLES: Record<ReconcileModule, string[]> = {
  rg: ['rg', 'boletins_rg'],
  work: ['work', 'fieldWork', 'field_work_records', 'field_work_sessions'],
  pendencies: ['pendencies', 'pendingItems', 'pending_records', 'property_pendencies'],
  properties: ['properties', 'property'],
};

async function appendConflicts(conflicts: ReconcileConflict[]) {
  if (!conflicts.length) return;
  try {
    const existing = (await offlineDb.meta.get(CONFLICTS_KEY))?.value as
      | ReconcileConflict[]
      | undefined;
    const merged = [...(existing ?? []), ...conflicts].slice(-200);
    await offlineDb.meta.put({ key: CONFLICTS_KEY, value: merged });
  } catch (e) {
    console.warn('[RECONCILE] falha ao gravar conflitos', e);
  }
}

export async function getReconcileConflicts(): Promise<ReconcileConflict[]> {
  try {
    return ((await offlineDb.meta.get(CONFLICTS_KEY))?.value as ReconcileConflict[]) ?? [];
  } catch {
    return [];
  }
}

export async function clearReconcileConflicts(): Promise<void> {
  await offlineDb.meta.delete(CONFLICTS_KEY);
}

function sameValue(actual: unknown, expected: unknown): boolean {
  if (actual === expected) return true;
  if (actual == null || expected == null) return false;
  return String(actual) === String(expected);
}

function matchesWhere(row: CachedRow, match?: Record<string, any>): boolean {
  if (!match || Object.keys(match).length === 0) return false;
  const data = row.data ?? {};
  return Object.entries(match).every(([key, expected]) => sameValue(data[key], expected));
}

function mutationTouchesRow(
  mutation: Mutation,
  row: CachedRow,
  tableNames: Set<string>,
): boolean {
  if (!tableNames.has(String(mutation.table))) return false;

  const rowId = String(row.id);
  const payloadId = mutation.payload?.id != null ? String(mutation.payload.id) : null;
  const primaryKey = mutation.pk != null ? String(mutation.pk) : null;

  if ((mutation.op === 'insert' || mutation.op === 'upsert') && payloadId === rowId) return true;
  if ((mutation.op === 'update' || mutation.op === 'delete') && (primaryKey === rowId || payloadId === rowId)) return true;
  if (mutation.op === 'update_where' || mutation.op === 'delete_where') {
    return matchesWhere(row, mutation.match);
  }

  return false;
}

async function getPendingProtectedIds(
  module: ReconcileModule,
  localRows: CachedRow[],
  mutationTables?: string[],
): Promise<Set<string>> {
  const tableNames = new Set([
    ...MODULE_MUTATION_TABLES[module],
    ...(mutationTables ?? []),
  ]);
  const mutations = await offlineDb.mutations.toArray();
  return new Set(
    localRows
      .filter((row) => mutations.some((mutation) => mutationTouchesRow(mutation, row, tableNames)))
      .map((row) => String(row.id)),
  );
}

export async function reconcile({
  module,
  userId,
  serverRows,
  localStore,
  ownerKey = 'agent_id',
  mutationTables,
}: ReconcileInput): Promise<ReconcileReport> {
  const serverById = new Map<string, any>();
  for (const r of serverRows) {
    if (r?.id) serverById.set(String(r.id), r);
  }

  const localAll = await localStore.toArray();
  const localForUser = localAll.filter(
    (row) => row.data?.[ownerKey] && String(row.data[ownerKey]) === userId,
  );
  const protectedPendingIds = await getPendingProtectedIds(module, localForUser, mutationTables);

  const inserted: CachedRow[] = [];
  const updated: CachedRow[] = [];
  const deletedIds: string[] = [];
  const conflicts: ReconcileConflict[] = [];

  // 1 + 2: inserir / atualizar
  const localById = new Map(localForUser.map((r) => [r.id, r] as const));
  for (const [id, sRow] of serverById) {
    const lRow = localById.get(id);
    if (!lRow) {
      inserted.push({ id, data: sRow, updatedAt: sRow.updated_at });
      continue;
    }
    const sUp = sRow.updated_at ?? '';
    const lUp = lRow.updatedAt ?? lRow.data?.updated_at ?? '';
    if (sUp > lUp) {
      updated.push({ id, data: sRow, updatedAt: sUp });
    } else if (lUp > sUp) {
      conflicts.push({
        id,
        module,
        reason: 'local-mais-novo-que-servidor',
        localUpdatedAt: lUp,
        serverUpdatedAt: sUp,
        ts: Date.now(),
      });
    }
  }

  // 3: órfãos — locais deste user que não existem mais no servidor.
  // Nunca apagar uma linha que ainda está representada na fila offline.
  for (const lRow of localForUser) {
    if (!serverById.has(lRow.id) && !protectedPendingIds.has(String(lRow.id))) {
      deletedIds.push(lRow.id);
    }
  }

  if (inserted.length) await localStore.bulkPut(inserted);
  if (inserted.length && module === 'rg') inserted.forEach((row) => console.log('[RG_DEXIE_SAVE]', row.data));
  if (updated.length) await localStore.bulkPut(updated);
  if (updated.length && module === 'rg') updated.forEach((row) => console.log('[RG_DEXIE_SAVE]', row.data));
  if (deletedIds.length) await localStore.bulkDelete(deletedIds);
  if (conflicts.length) await appendConflicts(conflicts);

  const preservedPending = [...protectedPendingIds].filter((id) => !serverById.has(id)).length;
  if (preservedPending > 0) {
    console.log('[RECONCILE_PENDING_PRESERVED]', {
      module,
      userId,
      count: preservedPending,
      ids: [...protectedPendingIds].filter((id) => !serverById.has(id)),
    });
  }

  const report: ReconcileReport = {
    module,
    userId,
    server: serverById.size,
    local: localForUser.length,
    inserted: inserted.length,
    updated: updated.length,
    deleted: deletedIds.length,
    preservedPending,
    conflicts,
  };

  console.log(
    `[RECONCILE:${module}] userId=${userId} server=${report.server} local=${report.local} inserted=${report.inserted} updated=${report.updated} deleted=${report.deleted} preservedPending=${report.preservedPending} conflicts=${report.conflicts.length}`,
  );

  return report;
}
