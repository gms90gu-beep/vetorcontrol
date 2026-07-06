/**
 * cache-cleanup.ts — RC-13
 * Limpeza segura de registros órfãos do cache Dexie.
 *
 * Regras (imutáveis):
 *  - Só executa se navigator.onLine === true.
 *  - Só executa se não houver mutations pendentes (mutations.length === 0).
 *  - Só considera registros já sincronizados (sem _pending / _dirty / mutation atrelada).
 *  - Verifica existência no servidor em lotes.
 *  - Remove apenas o que o servidor confirmar como inexistente.
 *  - Nunca remove registros criados offline ou pendentes.
 */

import { db as offlineDb } from '@/lib/offline/db';
import { supabase } from '@/integrations/supabase/client';

type TableKey = 'properties' | 'boletins_rg' | 'field_work_sessions';

const TARGET_TABLES: TableKey[] = ['properties', 'boletins_rg', 'field_work_sessions'];
const BATCH_SIZE = 200;

export interface CacheCleanupReport {
  ts: number;
  perTable: Record<TableKey, { checked: number; removed: number; skipped: number }>;
  aborted?: string;
}

function isSynced(row: any): boolean {
  if (!row || !row.id) return false;
  if (row._pending || row._dirty || row._offlineCreated) return false;
  const d = row.data ?? {};
  if (d._pending || d._offlineCreated) return false;
  // IDs criados offline costumam começar com "tmp_" ou não ser UUID
  if (typeof row.id === 'string' && row.id.startsWith('tmp_')) return false;
  return true;
}

async function hasPendingMutationFor(table: TableKey, id: string): Promise<boolean> {
  const n = await offlineDb.mutations
    .where('table')
    .equals(table)
    .and((m) => {
      const p: any = m.payload ?? {};
      return p.id === id || m.pk === id;
    })
    .count();
  return n > 0;
}

async function checkServerExistence(table: TableKey, ids: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const chunk = ids.slice(i, i + BATCH_SIZE);
    const { data, error } = await (supabase as any)
      .from(table)
      .select('id')
      .in('id', chunk);
    if (error) {
      console.warn('[CACHE_CLEANUP_CHECK] erro', table, error.message);
      // Em caso de erro, considera todos como existentes (fail-safe: não remove)
      chunk.forEach((id) => found.add(id));
      continue;
    }
    (data ?? []).forEach((r: any) => found.add(r.id));
    console.log('[CACHE_CLEANUP_CHECK]', table, `${chunk.length} verificados, ${data?.length ?? 0} presentes`);
  }
  return found;
}

async function cleanupTable(
  table: TableKey,
): Promise<{ checked: number; removed: number; skipped: number }> {
  const store = (offlineDb as any)[table];
  const rows: any[] = await store.toArray();
  const syncedIds: string[] = [];
  let skipped = 0;

  for (const r of rows) {
    if (!isSynced(r)) { skipped++; continue; }
    if (await hasPendingMutationFor(table, r.id)) { skipped++; continue; }
    syncedIds.push(r.id);
  }

  if (syncedIds.length === 0) {
    return { checked: 0, removed: 0, skipped };
  }

  const serverIds = await checkServerExistence(table, syncedIds);
  const orphans = syncedIds.filter((id) => !serverIds.has(id));

  // Safety-net: nunca remover mais de 80% do que foi checado
  if (orphans.length > 0 && orphans.length > syncedIds.length * 0.8) {
    console.warn('[CACHE_CLEANUP_REMOVE] abortado (razão suspeita)', table, orphans.length, '/', syncedIds.length);
    return { checked: syncedIds.length, removed: 0, skipped };
  }

  if (orphans.length > 0) {
    await store.bulkDelete(orphans);
    console.log('[CACHE_CLEANUP_REMOVE]', table, `${orphans.length} órfão(s) removido(s)`);
  }

  return { checked: syncedIds.length, removed: orphans.length, skipped };
}

export async function cleanupOrphanCache(): Promise<CacheCleanupReport> {
  const report: CacheCleanupReport = {
    ts: Date.now(),
    perTable: {
      properties: { checked: 0, removed: 0, skipped: 0 },
      boletins_rg: { checked: 0, removed: 0, skipped: 0 },
      field_work_sessions: { checked: 0, removed: 0, skipped: 0 },
    },
  };

  console.log('[CACHE_CLEANUP_START]', { ts: report.ts });

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    report.aborted = 'offline';
    console.warn('[CACHE_CLEANUP_FINISH] abortado: offline');
    return report;
  }

  const pending = await offlineDb.mutations.count();
  if (pending > 0) {
    report.aborted = `mutations_pending:${pending}`;
    console.warn('[CACHE_CLEANUP_FINISH] abortado: mutations pendentes =', pending);
    return report;
  }

  for (const t of TARGET_TABLES) {
    try {
      report.perTable[t] = await cleanupTable(t);
    } catch (e: any) {
      console.warn('[CACHE_CLEANUP_REMOVE] falha em', t, e?.message ?? e);
    }
  }

  await offlineDb.meta.put({ key: 'cache_cleanup:last', value: report });
  console.log('[CACHE_CLEANUP_FINISH]', report);
  return report;
}

export async function getLastCacheCleanupReport(): Promise<CacheCleanupReport | null> {
  return ((await offlineDb.meta.get('cache_cleanup:last'))?.value as CacheCleanupReport) ?? null;
}

async function hasActiveSession(): Promise<boolean> {
  const rows: any[] = await offlineDb.field_work_sessions.toArray();
  return rows.some((r) => (r?.data?.status ?? r?.status) === 'in_progress');
}

/** Gatilho pós-sync: só roda se não houver mutações nem jornada ativa. */
export async function cleanupAfterSync(): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  const pending = await offlineDb.mutations.count();
  if (pending > 0) {
    console.log('[CACHE_CLEANUP_SKIPPED_PENDING_MUTATIONS]', { pending });
    return;
  }
  if (await hasActiveSession()) {
    console.log('[CACHE_CLEANUP_SKIPPED_ACTIVE_SESSION]');
    return;
  }
  await cleanupOrphanCache();
}

const BOOT_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Gatilho de inicialização: pelo menos 24h desde a última execução. */
export async function cleanupOnBoot(): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  const pending = await offlineDb.mutations.count();
  if (pending > 0) {
    console.log('[CACHE_CLEANUP_SKIPPED_PENDING_MUTATIONS]', { pending });
    return;
  }
  if (await hasActiveSession()) {
    console.log('[CACHE_CLEANUP_SKIPPED_ACTIVE_SESSION]');
    return;
  }
  const last = await getLastCacheCleanupReport();
  if (last && Date.now() - last.ts < BOOT_MIN_INTERVAL_MS) return;
  await cleanupOrphanCache();
}
