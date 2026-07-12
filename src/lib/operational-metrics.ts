/**
 * operational-metrics.ts
 *
 * Camada única de consumo de indicadores. Escolhe automaticamente entre
 * as duas fontes oficiais:
 *   • operational-block-status.ts  → jornada em andamento / tela Trabalho
 *   • daily_work_records (DWR)     → jornada encerrada / dashboards / relatórios / PDFs
 *
 * Nenhum módulo de UI deve decidir a fonte diretamente — sempre chamar as
 * funções `get*Metrics` deste arquivo.
 *
 * Logs:
 *   [METRICS_VERSION] — versão da biblioteca
 *   [METRICS_SOURCE]  — { module, source } em cada consulta
 */
import { supabase } from "@/integrations/supabase/client";
import {
  getOperationalBlockStatus,
  logBlockStatusShared,
  type OperationalBlockStats,
  type VisitLike,
} from "./operational-block-status";

export const METRICS_VERSION = "1.0.0";
try { console.info("[METRICS_VERSION]", { version: METRICS_VERSION }); } catch {}

export type MetricsSource = "operational-block-status" | "daily_work_records";

export interface MetricsAuditMeta {
  module: string;
  productionDate?: string | null;
  agentId?: string | null;
  blockId?: string | null;
  sessionId?: string | null;
}

function logSource(meta: MetricsAuditMeta, source: MetricsSource, extra: Record<string, unknown> = {}) {
  console.log("[METRICS_SOURCE]", {
    module: meta.module,
    source,
    production_date: meta.productionDate ?? null,
    agent_id: meta.agentId ?? null,
    block_id: meta.blockId ?? null,
    session_id: meta.sessionId ?? null,
    ...extra,
  });
}

/**
 * Emitir sempre que um módulo AINDA consome uma fonte direta
 * (visits / daily_work_records / operational-block-status)
 * fora das exceções permitidas (sync, reconcile, migrations, tests).
 */
export function logDirectSource(meta: {
  module: string;
  file: string;
  source: "visits" | "daily_work_records" | "operational-block-status";
  note?: string;
}) {
  console.warn("[METRICS_DIRECT_SOURCE]", { ...meta, metrics_version: METRICS_VERSION });
}

/**
 * Comparação de integridade entre módulos. Emite [METRICS_INTEGRITY_ERROR]
 * quando algum campo diverge do valor canônico.
 */
export function assertMetricsIntegrity(
  module: string,
  expected: Partial<DwrTotals>,
  found: Partial<DwrTotals>,
) {
  const diffs: Record<string, { expected: unknown; found: unknown }> = {};
  const keys = new Set([...Object.keys(expected), ...Object.keys(found)]) as Set<keyof DwrTotals>;
  for (const k of keys) {
    const e = (expected as any)[k];
    const f = (found as any)[k];
    if (e !== undefined && f !== undefined && Number(e) !== Number(f)) {
      diffs[k as string] = { expected: e, found: f };
    }
  }
  if (Object.keys(diffs).length > 0) {
    console.error("[METRICS_INTEGRITY_ERROR]", { module, diffs, metrics_version: METRICS_VERSION });
    return false;
  }
  return true;
}

// ─── Real-time (jornada em andamento / Trabalho) ─────────────────────────────

export interface OperationalMetricsInput extends MetricsAuditMeta {
  propertyIds: string[];
  visits: VisitLike[];
  fallbackTotal?: number;
}

/**
 * Métricas em tempo real do quarteirão / jornada ativa.
 * Fonte: operational-block-status.ts
 */
export function getOperationalMetrics(
  input: OperationalMetricsInput,
): OperationalBlockStats & { source: MetricsSource } {
  const stats = getOperationalBlockStatus({
    propertyIds: input.propertyIds,
    visits: input.visits,
    fallbackTotal: input.fallbackTotal,
  });
  logSource(input, "operational-block-status");
  logBlockStatusShared(
    {
      module: input.module,
      productionDate: input.productionDate,
      blockId: input.blockId,
      sessionId: input.sessionId,
    },
    stats,
  );
  return { ...stats, source: "operational-block-status" };
}

// ─── Consolidado (DWR) ───────────────────────────────────────────────────────

export interface DwrTotals {
  records: number;
  properties_worked: number;
  properties_closed: number;
  properties_refused: number;
  blocks_worked: number;
  strategic_points_worked: number;
  positive_foci: number;
  deposits_treated: number;
  deposits_eliminated: number;
  tubitos_used: number;
  tubitos_collected: number;
  larvae_collected: number;
  cargas_collected: number;
}

export interface DwrMetricsResult {
  source: MetricsSource;
  from: string;
  to: string;
  rows: any[];
  totals: DwrTotals;
}

function emptyTotals(): DwrTotals {
  return {
    records: 0,
    properties_worked: 0,
    properties_closed: 0,
    properties_refused: 0,
    blocks_worked: 0,
    strategic_points_worked: 0,
    positive_foci: 0,
    deposits_treated: 0,
    deposits_eliminated: 0,
    tubitos_used: 0,
    tubitos_collected: 0,
    larvae_collected: 0,
    cargas_collected: 0,
  };
}

function aggregate(rows: any[]): DwrTotals {
  const t = emptyTotals();
  for (const r of rows ?? []) {
    t.records += 1;
    t.properties_worked += Number(r.properties_worked) || 0;
    t.properties_closed += Number(r.properties_closed) || 0;
    t.properties_refused += Number(r.properties_refused) || 0;
    t.blocks_worked += Number(r.blocks_worked) || 0;
    t.strategic_points_worked += Number(r.strategic_points_worked) || 0;
    t.positive_foci += Number(r.positive_foci) || 0;
    t.deposits_treated += Number(r.deposits_treated) || 0;
    t.deposits_eliminated += Number(r.deposits_eliminated) || 0;
    t.tubitos_used += Number(r.tubitos_used) || 0;
    t.tubitos_collected += Number(r.tubitos_collected) || 0;
    t.larvae_collected += Number(r.larvae_collected) || 0;
    t.cargas_collected += Number(r.cargas_collected) || 0;
  }
  return t;
}

export interface DateRangeInput extends MetricsAuditMeta {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
  agentIds?: string[];
}

async function queryDwrRange(input: DateRangeInput): Promise<any[]> {
  let q = supabase
    .from("daily_work_records")
    .select("*")
    .gte("work_date", input.from)
    .lte("work_date", input.to);
  if (input.agentIds && input.agentIds.length > 0) q = q.in("agent_id", input.agentIds);
  else if (input.agentId) q = q.eq("agent_id", input.agentId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Dashboard consolidado. Fonte: DWR. */
export async function getDashboardMetrics(input: DateRangeInput): Promise<DwrMetricsResult> {
  const rows = await queryDwrRange(input);
  logSource(input, "daily_work_records", { rows: rows.length, from: input.from, to: input.to });
  return { source: "daily_work_records", from: input.from, to: input.to, rows, totals: aggregate(rows) };
}

/** Relatórios (mesma fonte do dashboard, alias semântico). */
export const getReportMetrics = getDashboardMetrics;

/** PDF/Boletim diário. Fonte: DWR (jornada encerrada). */
export async function getDailyMetrics(
  input: MetricsAuditMeta & { date: string; agentIds?: string[] },
): Promise<DwrMetricsResult> {
  return getDashboardMetrics({
    ...input,
    from: input.date,
    to: input.date,
  });
}

/** PDF/Boletim semanal (semana epidemiológica). Fonte: DWR. */
export async function getWeeklyMetrics(
  input: MetricsAuditMeta & { epiWeek: number; epiYear: number; agentIds?: string[] },
): Promise<DwrMetricsResult & { epi_week: number; epi_year: number }> {
  let q = supabase
    .from("daily_work_records")
    .select("*")
    .eq("epi_week", input.epiWeek)
    .eq("epi_year", input.epiYear);
  if (input.agentIds && input.agentIds.length > 0) q = q.in("agent_id", input.agentIds);
  else if (input.agentId) q = q.eq("agent_id", input.agentId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  logSource(input, "daily_work_records", {
    rows: rows.length,
    epi_week: input.epiWeek,
    epi_year: input.epiYear,
  });
  const first = rows[0]?.work_date ?? "";
  const last = rows[rows.length - 1]?.work_date ?? "";
  return {
    source: "daily_work_records",
    from: first,
    to: last,
    rows,
    totals: aggregate(rows),
    epi_week: input.epiWeek,
    epi_year: input.epiYear,
  };
}

// ─── Automático (jornada ativa vs encerrada) ─────────────────────────────────

export interface ProductionMetricsInput extends MetricsAuditMeta {
  /** true → jornada em andamento (usa block-status); false → encerrada (usa DWR). */
  isSessionActive: boolean;
  /** Necessário quando isSessionActive === true. */
  realtime?: { propertyIds: string[]; visits: VisitLike[]; fallbackTotal?: number };
  /** Necessário quando isSessionActive === false. */
  dwr?: { from: string; to: string; agentIds?: string[] };
}

/**
 * Escolhe automaticamente a fonte:
 *   jornada em andamento → operational-block-status
 *   jornada encerrada    → daily_work_records
 */
export async function getProductionMetrics(input: ProductionMetricsInput) {
  if (input.isSessionActive) {
    if (!input.realtime) throw new Error("getProductionMetrics: realtime input required for active session");
    return getOperationalMetrics({ ...input, ...input.realtime });
  }
  if (!input.dwr) throw new Error("getProductionMetrics: dwr input required for closed session");
  return getDashboardMetrics({ ...input, ...input.dwr });
}
