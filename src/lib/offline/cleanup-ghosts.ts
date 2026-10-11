import { readAllQueryPages } from "@/lib/query-pages";
/** Safe refresh of RG cache. Never deletes legacy or unsynchronized records. */

import { db as offlineDb } from '@/lib/offline/db';
import { db as appDb } from '@/db/database';
import { supabase } from '@/integrations/supabase/client';

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

export async function cleanupGhosts(userId: string): Promise<GhostReport> {
  if (!userId) throw new Error('cleanupGhosts requer userId');
  const queued = await offlineDb.mutations.count() + await appDb.syncQueue.where('status').anyOf('pending', 'processing', 'error').count();
  if (queued) throw new Error('Cache preservado: existem operações pendentes ou com erro neste dispositivo. Sincronize antes da manutenção.');
  const legacyUnsynced = await appDb.rg.filter((r) => !r._synced).count();
  if (legacyUnsynced) throw new Error('Cache preservado: há RGs locais ainda não sincronizados.');
  // Fetch the complete canonical rows before touching any local state.
  const serverRows = await readAllQueryPages<any>(supabase.from('boletins_rg').select('*').eq('agent_id', userId).order('id'));
  const local = await offlineDb.boletins_rg.toArray();
  const byId = new Map(local.map((r) => [r.id, r]));
  const fresh = serverRows.filter((r) => !byId.has(r.id) || (r.updated_at || '') > (byId.get(r.id)?.updatedAt || byId.get(r.id)?.data?.updated_at || ''));
  if (fresh.length) await offlineDb.boletins_rg.bulkPut(fresh.map((r) => ({ id: r.id, data: r, updatedAt: r.updated_at })));
  // Absence, optional fields or ownership ambiguity never authorize automatic deletion.
  const report: GhostReport = { removedNoOwner: 0, removedDuplicates: 0, removedOrphans: 0, removedInconsistent: 0, clearedLegacy: 0, ts: Date.now() };
  await offlineDb.meta.put({ key: CLEANUP_KEY, value: report });
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
