/**
 * cleanup-ghosts.ts — Migração one-shot para remover registros fantasmas
 * do cache local (Fase E do plano de estabilização offline).
 *
 * Etapas (em ordem):
 *   1. sem agent_id  — linhas órfãs sem dono
 *   2. duplicados    — mantém a de updated_at mais novo
 *   3. órfãos        — IDs locais ausentes no servidor (delega ao reconciler)
 *   4. inconsistentes — sem block_id ou sem record_date
 *   5. legado        — esvazia AppDB.rg
 *
 * Resultado persistido em offlineDb.meta chave "cleanup:last".
 */

import { db as offlineDb, type CachedRow } from '@/lib/offline/db';
import { db as appDb } from '@/db/database';
import { supabase } from '@/integrations/supabase/client';
import { reconcile } from '@/lib/offline/reconciler';

export interface GhostReport {
  removedNoOwner: number;
  removedDuplicates: number;
  removedOrphans: number;
  removedInconsistent: number;
  clearedLegacy: number;
  ts: number;
}

const CLEANUP_KEY = 'cleanup:last';
const AUTO_FLAG = 'offline_v2_cleanup_ghosts';

// Critérios mínimos reais de corrupção — NUNCA incluir campos opcionais (ex.: record_date)
// que não existem no schema oficial de boletins_rg.
const RG_REQUIRED = ['id', 'block_id'] as const;

async function pruneNoOwner(store: any, ownerKey: string): Promise<number> {
  const rows: CachedRow[] = await store.toArray();
  const bad = rows.filter((r) => !r.data?.[ownerKey]).map((r) => r.id);
  const total = rows.length;
  console.warn('[RG_CLEANUP_DELETE]', bad.length, 'de', total, `(noOwner:${ownerKey})`);
  if (total > 0 && (bad.length === total || bad.length > total * 0.8)) {
    console.warn('[RG_CLEANUP_ABORT]', `noOwner:${ownerKey}`, bad.length, '/', total);
    return 0;
  }
  if (bad.length) await store.bulkDelete(bad);
  return bad.length;
}

async function pruneDuplicates(store: any): Promise<number> {
  const rows: CachedRow[] = await store.toArray();
  const byId = new Map<string, CachedRow>();
  const dupIds: string[] = [];
  for (const r of rows) {
    const cur = byId.get(r.id);
    if (!cur) { byId.set(r.id, r); continue; }
    const a = r.updatedAt ?? r.data?.updated_at ?? '';
    const b = cur.updatedAt ?? cur.data?.updated_at ?? '';
    if (a > b) { dupIds.push(cur.id); byId.set(r.id, r); }
    else dupIds.push(r.id);
  }
  if (dupIds.length) await store.bulkDelete(dupIds);
  return dupIds.length;
}

async function pruneInconsistentRG(): Promise<number> {
  const rows: CachedRow[] = await offlineDb.boletins_rg.toArray();
  const total = rows.length;
  console.log('[RG_CLEANUP_CHECK]', 'total=', total, 'required=', RG_REQUIRED);
  const bad = rows
    .filter((r) => {
      if (!r || !r.data || typeof r.data !== 'object') return true;
      if (!r.id) return true;
      const d: any = r.data;
      // Corrupção real: sem qualquer referência a quarteirão (nem block_id nem block_number)
      if (!d.block_id && !d.block_number) return true;
      return false;
    })
    .map((r) => r.id);
  console.warn('[RG_CLEANUP_DELETE]', bad.length, 'de', total, '(inconsistentRG)');
  if (total > 0 && (bad.length === total || bad.length > total * 0.8)) {
    console.warn('[RG_CLEANUP_ABORT]', 'inconsistentRG', bad.length, '/', total);
    return 0;
  }
  if (bad.length) await offlineDb.boletins_rg.bulkDelete(bad);
  return bad.length;
}

async function clearLegacy(): Promise<number> {
  const n = await appDb.rg.count();
  if (n > 0) await appDb.rg.clear();
  return n;
}

export async function cleanupGhosts(userId: string): Promise<GhostReport> {
  if (!userId) throw new Error('cleanupGhosts requer userId');

  const report: GhostReport = {
    removedNoOwner: 0,
    removedDuplicates: 0,
    removedOrphans: 0,
    removedInconsistent: 0,
    clearedLegacy: 0,
    ts: Date.now(),
  };

  console.log('[RG_CLEANUP_START]', { userId, ts: report.ts });

  // 1. sem agent_id

  report.removedNoOwner += await pruneNoOwner(offlineDb.boletins_rg, 'agent_id');
  report.removedNoOwner += await pruneNoOwner(offlineDb.daily_work_records, 'agent_id');

  // 2. duplicados
  report.removedDuplicates += await pruneDuplicates(offlineDb.boletins_rg);

  // 3. órfãos — apenas RG por enquanto (delega ao reconciler)
  try {
    const { data: serverRows } = await (supabase as any)
      .from('boletins_rg').select('id,agent_id,block_id,updated_at,record_date').eq('agent_id', userId);
    const rep = await reconcile({
      module: 'rg',
      userId,
      serverRows: serverRows ?? [],
      localStore: offlineDb.boletins_rg,
      ownerKey: 'agent_id',
    });
    report.removedOrphans = rep.deleted;
  } catch (e) {
    console.warn('[CLEANUP] reconcile falhou', e);
  }

  // 4. inconsistentes
  report.removedInconsistent = await pruneInconsistentRG();

  // 5. legado
  report.clearedLegacy = await clearLegacy();

  await offlineDb.meta.put({ key: CLEANUP_KEY, value: report });
  console.log('[CLEANUP_GHOSTS]', report);
  console.log('[RG_CLEANUP_FINISH]', report);
  return report;
}

export async function getLastCleanupReport(): Promise<GhostReport | null> {
  return ((await offlineDb.meta.get(CLEANUP_KEY))?.value as GhostReport) ?? null;
}

/** Executa uma única vez por boot (flag em localStorage). */
export async function maybeAutoCleanupGhosts(userId: string): Promise<void> {
  if (!userId || typeof localStorage === 'undefined') return;
  if (localStorage.getItem(AUTO_FLAG) === 'done') return;
  try {
    await cleanupGhosts(userId);
    localStorage.setItem(AUTO_FLAG, 'done');
  } catch (e) {
    console.warn('[CLEANUP_GHOSTS] auto falhou', e);
  }
}
