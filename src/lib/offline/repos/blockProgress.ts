/**
 * blockProgress.ts
 * Camada única de progresso do quarteirão (BLOCK_PROGRESS).
 *
 * Regra:
 *   Nenhum consumidor deve recalcular o progresso do quarteirão a partir de
 *   `visits`. Sempre consultar `block_progress` (mirror local + servidor).
 *
 * Logs:
 *   [BLOCK_PROGRESS_UPDATE]        — delta local aplicado após visita
 *   [BLOCK_PROGRESS_SYNC]          — refresh do servidor
 *   [BLOCK_PROGRESS_COMPLETED]     — bloco atingiu 0 pendentes
 *   [BLOCK_PROGRESS_PAUSED]        — expediente encerrado com pendências
 *   [BLOCK_PROGRESS_RESUMED]       — jornada retomada
 *   [BLOCK_PROGRESS_RECALCULATED]  — RPC recompute concluída
 *   [BLOCK_PROGRESS_INTEGRITY_ERROR] — visited+pending !== total
 *   [BLOCK_PROGRESS_READ]          — módulo consumiu o hook
 */
import { supabase } from "@/integrations/supabase/client";
import { db, enqueueMutation, type CachedRow } from "../db";
import { safeFetch } from "../safe-fetch";

export type BlockProgressStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "PAUSED"
  | "COMPLETED";

export interface BlockProgress {
  id: string;
  cycle_id: string;
  block_number: string;
  agent_id: string;
  status: BlockProgressStatus;
  completion_percentage: number;
  total_properties: number;
  visited_properties: number;
  pending_properties: number;
  closed_properties: number;
  recovered_properties: number;
  positive_focus: number;
  negative_focus: number;
  tb_properties: number;
  pe_properties: number;
  started_at: string | null;
  completed_at: string | null;
  last_visit_at: string | null;
  last_operational_date: string | null;
  last_sync: string | null;
  updated_at: string;
}

const TABLE = "block_progress" as const;

function log(tag: string, data?: any) {
  try { console.log(`[${tag}]`, data ?? ""); } catch {}
}

function keyOf(cycle_id: string, block_number: string, agent_id: string) {
  return `${cycle_id}::${block_number}::${agent_id}`;
}

/** Verifica visited+pending == total. Emite log e retorna boolean. */
export function checkIntegrity(row: BlockProgress, origin: string): boolean {
  const expected = row.total_properties;
  const found = (row.visited_properties || 0) +
    (row.closed_properties || 0) +
    (row.pending_properties || 0);
  if (row.total_properties > 0 && expected !== found) {
    log("BLOCK_PROGRESS_INTEGRITY_ERROR", {
      origin,
      cycle_id: row.cycle_id,
      block_number: row.block_number,
      expected,
      found,
      visited: row.visited_properties,
      closed: row.closed_properties,
      pending: row.pending_properties,
      total: row.total_properties,
    });
    return false;
  }
  return true;
}

async function hydrateLocal(rows: BlockProgress[]) {
  if (!rows?.length) return;
  const mapped: CachedRow[] = rows
    .filter((r) => r && r.id)
    .map((r) => ({ id: r.id, data: r, updatedAt: r.updated_at }));
  await db.block_progress.bulkPut(mapped);
}

async function readLocalByKey(
  cycle_id: string,
  block_number: string,
  agent_id: string,
): Promise<BlockProgress | null> {
  const all = await db.block_progress.toArray();
  const hit = all.find(
    (r) =>
      r.data?.cycle_id === cycle_id &&
      String(r.data?.block_number) === String(block_number) &&
      r.data?.agent_id === agent_id,
  );
  return (hit?.data as BlockProgress) ?? null;
}

/** Busca o progresso — online: Supabase + hidrata Dexie; offline: cache. */
export async function getBlockProgress(
  cycle_id: string,
  block_number: string,
  agent_id: string,
): Promise<BlockProgress | null> {
  if (!cycle_id || !block_number || !agent_id) return null;
  const result = await safeFetch<BlockProgress | null>(
    async () => {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .eq("cycle_id", cycle_id)
        .eq("block_number", String(block_number))
        .eq("agent_id", agent_id)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        await hydrateLocal([data as BlockProgress]);
        log("BLOCK_PROGRESS_SYNC", { source: "remote", key: keyOf(cycle_id, block_number, agent_id) });
        checkIntegrity(data as BlockProgress, "getBlockProgress");
      }
      return (data as BlockProgress) ?? null;
    },
    async () => readLocalByKey(cycle_id, block_number, agent_id),
    { label: TABLE },
  );
  return result;
}

/** Lista todos os progressos de um agente (para dashboards do próprio agente). */
export async function listBlockProgress(agent_id: string): Promise<BlockProgress[]> {
  if (!agent_id) return [];
  return safeFetch<BlockProgress[]>(
    async () => {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .eq("agent_id", agent_id);
      if (error) throw error;
      const rows = (data || []) as BlockProgress[];
      await hydrateLocal(rows);
      log("BLOCK_PROGRESS_SYNC", { source: "remote", agent_id, count: rows.length });
      return rows;
    },
    async () => {
      const all = await db.block_progress.toArray();
      return all
        .map((r) => r.data as BlockProgress)
        .filter((r) => r?.agent_id === agent_id);
    },
    { label: `${TABLE}:list` },
  );
}

/**
 * Lote em cache/servidor para dashboards com múltiplos quarteirões/agentes.
 * Se `block_numbers` for omitido, retorna todos os blocos do agente/ciclo.
 */
export async function getBlockProgressBatch(input: {
  cycle_id?: string | null;
  agent_ids?: string[];
  block_numbers?: string[];
}): Promise<BlockProgress[]> {
  const { cycle_id, agent_ids, block_numbers } = input;
  return safeFetch<BlockProgress[]>(
    async () => {
      let q = supabase.from(TABLE).select("*");
      if (cycle_id) q = q.eq("cycle_id", cycle_id);
      if (agent_ids && agent_ids.length) q = q.in("agent_id", agent_ids);
      if (block_numbers && block_numbers.length)
        q = q.in("block_number", block_numbers.map(String));
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data || []) as BlockProgress[];
      await hydrateLocal(rows);
      log("BLOCK_PROGRESS_SYNC", {
        source: "remote",
        scope: "batch",
        count: rows.length,
        cycle_id: cycle_id ?? null,
        agents: agent_ids?.length ?? 0,
        blocks: block_numbers?.length ?? 0,
      });
      return rows;
    },
    async () => {
      const all = await db.block_progress.toArray();
      return all
        .map((r) => r.data as BlockProgress)
        .filter((r) => {
          if (!r) return false;
          if (cycle_id && r.cycle_id !== cycle_id) return false;
          if (agent_ids && agent_ids.length && !agent_ids.includes(r.agent_id)) return false;
          if (block_numbers && block_numbers.length &&
              !block_numbers.map(String).includes(String(r.block_number))) return false;
          return true;
        });
    },
    { label: `${TABLE}:batch` },
  );
}

/**
 * Aplica delta local imediatamente após uma visita — não espera sync.
 * Mantém pending = max(0, total - visited - closed).
 */
export async function applyLocalVisitDelta(input: {
  cycle_id: string;
  block_number: string;
  agent_id: string;
  status: "visited" | "closed" | "refused" | string;
  property_id: string;
  is_recovery?: boolean;
  visit_date?: string;
}): Promise<BlockProgress | null> {
  const { cycle_id, block_number, agent_id, status, is_recovery, visit_date } = input;
  if (!cycle_id || !block_number || !agent_id) return null;

  const now = new Date().toISOString();
  const existing = await readLocalByKey(cycle_id, block_number, agent_id);
  const base: BlockProgress = existing ?? {
    id: crypto.randomUUID(),
    cycle_id,
    block_number: String(block_number),
    agent_id,
    status: "IN_PROGRESS",
    completion_percentage: 0,
    total_properties: 0,
    visited_properties: 0,
    pending_properties: 0,
    closed_properties: 0,
    recovered_properties: 0,
    positive_focus: 0,
    negative_focus: 0,
    tb_properties: 0,
    pe_properties: 0,
    started_at: now,
    completed_at: null,
    last_visit_at: visit_date ?? now,
    last_operational_date: null,
    last_sync: null,
    updated_at: now,
  };

  // Incremento otimista — o servidor recalcula o valor exato via trigger.
  const patch: BlockProgress = { ...base };
  if (status === "visited") patch.visited_properties = (base.visited_properties || 0) + 1;
  else if (status === "closed") patch.closed_properties = (base.closed_properties || 0) + 1;
  if (is_recovery) patch.recovered_properties = (base.recovered_properties || 0) + 1;

  const doneNow = (patch.visited_properties || 0) + (patch.closed_properties || 0);
  if (patch.total_properties > 0) {
    patch.pending_properties = Math.max(0, patch.total_properties - doneNow);
    patch.completion_percentage = Math.round((doneNow / patch.total_properties) * 100 * 100) / 100;
  }
  patch.last_visit_at = visit_date ?? now;
  patch.started_at = base.started_at ?? now;
  patch.status = patch.pending_properties === 0 && patch.total_properties > 0
    ? "COMPLETED"
    : "IN_PROGRESS";
  if (patch.status === "COMPLETED") {
    patch.completed_at = base.completed_at ?? now;
    log("BLOCK_PROGRESS_COMPLETED", { cycle_id, block_number, agent_id });
  }
  patch.updated_at = now;

  await db.block_progress.put({ id: patch.id, data: patch, updatedAt: now });
  log("BLOCK_PROGRESS_UPDATE", {
    cycle_id,
    block_number,
    agent_id,
    operational_date: patch.last_operational_date,
    total: patch.total_properties,
    visitados: patch.visited_properties,
    pendentes: patch.pending_properties,
    percentual: patch.completion_percentage,
    status: patch.status,
  });
  checkIntegrity(patch, "applyLocalVisitDelta");
  return patch;
}

/** Enfileira a recomputação canônica no servidor (idempotente). */
export async function enqueueRecomputeBlockProgress(input: {
  cycle_id: string;
  block_number: string;
  agent_id: string;
}) {
  await enqueueMutation({
    table: "",
    op: "rpc",
    rpc_name: "recompute_block_progress",
    payload: {
      _cycle_id: input.cycle_id,
      _block_number: String(input.block_number),
      _agent_id: input.agent_id,
    },
  });
  log("BLOCK_PROGRESS_RECALCULATED", { enqueued: true, ...input });
}

/** Marca o bloco como PAUSED (encerramento de expediente com pendências). */
export async function pauseBlockProgress(input: {
  cycle_id: string;
  block_number: string;
  agent_id: string;
}) {
  const existing = await readLocalByKey(input.cycle_id, input.block_number, input.agent_id);
  if (existing && existing.pending_properties > 0) {
    const now = new Date().toISOString();
    const patch = { ...existing, status: "PAUSED" as const, updated_at: now };
    await db.block_progress.put({ id: patch.id, data: patch, updatedAt: now });
  }
  try {
    await supabase
      .from(TABLE)
      .update({ status: "PAUSED" })
      .eq("cycle_id", input.cycle_id)
      .eq("block_number", String(input.block_number))
      .eq("agent_id", input.agent_id);
  } catch (e) {
    console.warn("[BLOCK_PROGRESS_PAUSED_REMOTE_FAIL]", e);
  }
  log("BLOCK_PROGRESS_PAUSED", input);
}

/** Log padronizado ao retomar uma jornada consultando block_progress. */
export function logResumeDecision(input: {
  cycle_id: string;
  block_number: string;
  agent_id: string;
  status: BlockProgressStatus | null;
  decision: "resumed" | "blocked_by_completed" | "not_found";
}) {
  log("BLOCK_PROGRESS_RESUMED", input);
}
