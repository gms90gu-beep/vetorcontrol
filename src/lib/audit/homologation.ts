/**
 * homologation.ts — Suite final de testes (Fase de homologação).
 *
 * Executa testes 1, 2, 3, 5 e 6 do roteiro de homologação RG.
 * Testes 4 (offline real) e 7 (criar boletim) são manuais.
 */

import { supabase } from '@/integrations/supabase/client';
import { db as offlineDb } from '@/lib/offline/db';
import { OPERATIONAL_AGENTS } from '@/lib/audit/operational-agents';
import { reconcile } from '@/lib/offline/reconciler';
import { cleanupGhosts, type GhostReport } from '@/lib/offline/cleanup-ghosts';

export interface TestResult {
  id: string;
  name: string;
  pass: boolean;
  details: any;
}

export interface HomologationReport {
  ts: number;
  results: TestResult[];
  approved: boolean;
}

// ─── TEST 1 — Consistência por agente ─────────────────────────────────────────
async function test1(): Promise<TestResult> {
  const all = await offlineDb.boletins_rg.toArray();
  const rows = await Promise.all(
    OPERATIONAL_AGENTS.map(async (a) => {
      const { data: srv } = await (supabase as any)
        .from('boletins_rg').select('id').eq('agent_id', a.id);
      const local = all.filter((r) => r.data?.agent_id === a.id).length;
      const server = srv?.length ?? 0;
      return { agent: a.name, server, local, render: local, ok: server === local };
    }),
  );
  return {
    id: 'T1',
    name: 'Consistência por agente (Servidor = Local = Render)',
    pass: rows.every((r) => r.ok),
    details: rows,
  };
}

// ─── TEST 2 — Consistência territorial ────────────────────────────────────────
async function test2(): Promise<TestResult> {
  const [{ data: blocks }, { data: props }, { data: boletins }] = await Promise.all([
    (supabase as any).from('blocks').select('id'),
    (supabase as any).from('properties').select('id,block_id'),
    (supabase as any).from('boletins_rg').select('id,block_id'),
  ]);
  const blockIds = new Set(((blocks ?? []) as any[]).map((b) => b.id));
  const orphanProps = ((props ?? []) as any[]).filter((p) => p.block_id && !blockIds.has(p.block_id));
  const orphanBoletins = ((boletins ?? []) as any[]).filter((b) => b.block_id && !blockIds.has(b.block_id));
  const propBlockIds = new Set(((props ?? []) as any[]).map((p) => p.block_id).filter(Boolean));
  const emptyBlocks = [...blockIds].filter((id) => !propBlockIds.has(id));
  const pass = orphanProps.length === 0 && orphanBoletins.length === 0;
  return {
    id: 'T2',
    name: 'Consistência territorial (blocks ↔ properties ↔ boletins_rg)',
    pass,
    details: {
      blocks: blockIds.size,
      properties: (props ?? []).length,
      boletins: (boletins ?? []).length,
      orphanProperties: orphanProps.length,
      orphanBoletins: orphanBoletins.length,
      emptyBlocks: emptyBlocks.length,
    },
  };
}

// ─── TEST 3 — RG x Trabalho ───────────────────────────────────────────────────
async function test3(): Promise<TestResult> {
  const rows = await Promise.all(
    OPERATIONAL_AGENTS.map(async (a) => {
      const [{ data: rg }, { data: work }] = await Promise.all([
        (supabase as any).from('boletins_rg').select('id,block_id').eq('agent_id', a.id),
        (supabase as any).from('daily_work_records').select('id,block_id').eq('agent_id', a.id),
      ]);
      const rgBlocks = new Set(((rg ?? []) as any[]).map((r) => r.block_id).filter(Boolean));
      const workBlocks = new Set(((work ?? []) as any[]).map((r) => r.block_id).filter(Boolean));
      const onlyRg = [...rgBlocks].filter((b) => !workBlocks.has(b)).length;
      const onlyWork = [...workBlocks].filter((b) => !rgBlocks.has(b)).length;
      return {
        agent: a.name,
        rgBoletins: (rg ?? []).length,
        workRecords: (work ?? []).length,
        rgBlocks: rgBlocks.size,
        workBlocks: workBlocks.size,
        diff: onlyRg + onlyWork,
        ok: onlyRg === 0 && onlyWork === 0,
      };
    }),
  );
  return {
    id: 'T3',
    name: 'RG = Trabalho (mesmos quarteirões por agente)',
    pass: rows.every((r) => r.ok),
    details: rows,
  };
}

// ─── TEST 5 — Reconciliação sem mudanças ──────────────────────────────────────
async function test5(): Promise<TestResult> {
  const rows = await Promise.all(
    OPERATIONAL_AGENTS.map(async (a) => {
      const { data: srv } = await (supabase as any)
        .from('boletins_rg').select('*').eq('agent_id', a.id);
      const rep = await reconcile({
        module: 'rg',
        userId: a.id,
        serverRows: srv ?? [],
        localStore: offlineDb.boletins_rg,
        ownerKey: 'agent_id',
      });
      return {
        agent: a.name,
        inserted: rep.inserted,
        updated: rep.updated,
        deleted: rep.deleted,
        conflicts: rep.conflicts.length,
        ok: rep.inserted === 0 && rep.updated === 0 && rep.deleted === 0 && rep.conflicts.length === 0,
      };
    }),
  );
  return {
    id: 'T5',
    name: 'Reconciliação sem divergências',
    pass: rows.every((r) => r.ok),
    details: rows,
  };
}

// ─── TEST 6 — Limpeza ─────────────────────────────────────────────────────────
async function test6(userId: string): Promise<TestResult> {
  const rep: GhostReport = await cleanupGhosts(userId);
  const totalRemoved =
    rep.removedNoOwner + rep.removedOrphans + rep.removedInconsistent + rep.clearedLegacy;
  return {
    id: 'T6',
    name: 'Limpeza de fantasmas (idealmente 0 em segunda execução)',
    pass: totalRemoved === 0,
    details: rep,
  };
}

export async function runHomologation(userId: string): Promise<HomologationReport> {
  const results: TestResult[] = [];
  for (const fn of [test1, test2, test3, test5]) {
    try { results.push(await fn()); }
    catch (e: any) { results.push({ id: fn.name, name: fn.name, pass: false, details: String(e) }); }
  }
  try { results.push(await test6(userId)); }
  catch (e: any) { results.push({ id: 'T6', name: 'Limpeza', pass: false, details: String(e) }); }

  const report: HomologationReport = {
    ts: Date.now(),
    results,
    approved: results.every((r) => r.pass),
  };
  await offlineDb.meta.put({ key: 'homologation:last', value: report });
  console.log('[HOMOLOGATION]', report);
  return report;
}

export async function getLastHomologationReport(): Promise<HomologationReport | null> {
  return ((await offlineDb.meta.get('homologation:last'))?.value as HomologationReport) ?? null;
}
