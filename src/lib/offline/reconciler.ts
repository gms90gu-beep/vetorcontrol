/**
 * reconciler.ts — Engine genérica de reconciliação Servidor ↔ Cache Local.
 *
 * Operações (ordem determinística):
 *   1. Inserir faltantes (no servidor, ausentes localmente)
 *   2. Atualizar divergentes (updated_at do servidor vence)
 *   3. Remover órfãos (locais do mesmo userId que sumiram do servidor)
 *   4. Registrar conflitos (local mais novo que o servidor)
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
import { db as offlineDb, type CachedRow } from '@/lib/offline/db';

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
}

const CONFLICTS_KEY = 'reconcile:conflicts';

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

export async function reconcile({
  module,
  userId,
  serverRows,
  localStore,
  ownerKey = 'agent_id',
}: ReconcileInput): Promise<ReconcileReport> {
  const serverById = new Map<string, any>();
  for (const r of serverRows) {
    if (r?.id) serverById.set(String(r.id), r);
  }

  const localAll = await localStore.toArray();
  const localForUser = localAll.filter(
    (row) => row.data?.[ownerKey] && String(row.data[ownerKey]) === userId,
  );

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

  // 3: órfãos — locais deste user que não existem mais no servidor
  for (const lRow of localForUser) {
    if (!serverById.has(lRow.id)) deletedIds.push(lRow.id);
  }

  if (inserted.length) await localStore.bulkPut(inserted);
  if (updated.length) await localStore.bulkPut(updated);
  if (deletedIds.length) await localStore.bulkDelete(deletedIds);
  if (conflicts.length) await appendConflicts(conflicts);

  const report: ReconcileReport = {
    module,
    userId,
    server: serverById.size,
    local: localForUser.length,
    inserted: inserted.length,
    updated: updated.length,
    deleted: deletedIds.length,
    conflicts,
  };

  console.log(
    `[RECONCILE:${module}] userId=${userId} server=${report.server} local=${report.local} inserted=${report.inserted} updated=${report.updated} deleted=${report.deleted} conflicts=${report.conflicts.length}`,
  );

  return report;
}
