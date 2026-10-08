import { summarizePendencyCycles } from "@/lib/pendency-summary";
import { mapVisitInPeriod } from "@/lib/map-visit-period";
import { readAllQueryPages } from "@/lib/query-pages";
import { sessionsMissingDailyRecord } from "@/lib/production-summary";
/**
 * Wave C — Admin Master executive dashboard, pendency report,
 * heatmap aggregations. Reads exclusively from daily_work_records,
 * RG (boletins_rg/properties/blocks), and property_pendencies.
 */
import { createServerFn } from "@tanstack/react-start";
import { resolvePermittedAgentIds } from "@/lib/team-scope";
import { operationalDateBoundsUtcIso } from "@/lib/operational-date";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildPropertyCycleHistory, type PropertyCycleHistory, type PropertyCycleVisit } from "@/lib/map-cycle-history";

function sumDepJson(j: any): number {
  if (!j || typeof j !== "object") return 0;
  return ["a1", "a2", "b", "c", "d1", "d2", "e"].reduce(
    (acc, k) => acc + (Number((j as any)[k]) || 0),
    0,
  );
}

async function fetchAllPages<T>(query: any, pageSize = 1000, maxRows = 50000): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const { data, error } = await query.range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < pageSize) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

async function requireAdminOrSupervisor(supabase: any, userId: string) {
  const { data: role } = await supabase.rpc("get_user_role", { u_id: userId });
  const r = (role as string) || "";
  if (!["admin_master", "coordenador", "supervisor"].includes(r)) {
    throw new Error("Forbidden: requer supervisor ou admin_master");
  }
  return r as "admin_master" | "coordenador" | "supervisor";
}

// ─────────────────────────────────────────────────────────────
// EXECUTIVE DASHBOARD
// ─────────────────────────────────────────────────────────────
export interface ExecutiveDashboardResult {
  warnings: string[];
  scope: string;
  filters: {
    from: string;
    to: string;
    cycleId: string | null;
    supervisorId: string | null;
    agentId: string | null;
    municipality: string | null;
  };
  kpis: {
    daily_records: number;
    agents_active: number;
    properties_worked: number;
    properties_closed: number;
    blocks_worked: number;
    strategic_points: number;
    deposits_total: number;
    deposits_treated: number;
    deposits_eliminated: number;
    positive_foci: number;
    tubitos_used: number;
    larvae_collected: number;
    cargas_collected: number;
    pendencies_open: number;
  };
  by_supervisor: Array<{
    supervisor_id: string | null;
    supervisor_name: string;
    agents: number;
    properties_worked: number;
    positive_foci: number;
    deposits_total: number;
  }>;
  by_municipality: Array<{
    city: string;
    records: number;
    properties_worked: number;
    positive_foci: number;
  }>;
  top_agents: Array<{
    agent_id: string;
    full_name: string;
    properties_worked: number;
    positive_foci: number;
  }>;
}

export const getExecutiveDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      from: string;
      to: string;
      cycleId?: string | null;
      supervisorId?: string | null;
      agentId?: string | null;
      municipality?: string | null;
    }) => input,
  )
  .handler(async ({ data, context }): Promise<ExecutiveDashboardResult> => {
    const { supabase, userId } = context;
    const role = await requireAdminOrSupervisor(supabase, userId);

    const profileIdsScope = await resolvePermittedAgentIds(supabase, userId, role);
    let profQ = supabase.from("profiles").select("id, full_name, supervisor_id");
    if (profileIdsScope) profQ = profQ.in("id", profileIdsScope);
    if (data.supervisorId) profQ = profQ.eq("supervisor_id", data.supervisorId);
    const { data: profiles } = await profQ;
    const profileIds = (profiles ?? []).map((p: any) => p.id);
    const nameByProfile = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name || "Sem nome"]));

    console.log("[RBAC_ROLE]", role, "[RBAC_PROFILE]", userId, "[RBAC_SCOPE]", profileIds.length);
    if (profileIds.length === 0) {
      return { total_open: 0, total_resolved: 0, rows: [], by_status: {} };
    }

    // property_pendencies.agent_id armazena profile_id
    let q = supabase
      .from("property_pendencies")
      .select("*")
      .in("agent_id", profileIds)
      .order("last_attempt_at", { ascending: false })
      .limit(data.limit ?? 500);
    if (data.onlyOpen) q = q.is("resolved_at", null);
    if (data.cycleId) q = q.eq("cycle_id", data.cycleId);
    if (data.excludeCycleId) q = q.neq("cycle_id", data.excludeCycleId);
    if (data.excludeCycleId) q = q.or(`cycle_id.is.null,cycle_id.neq.${data.excludeCycleId}`);
    if (data.weekId) q = q.eq("week_id", data.weekId);
    const { data: pends, error } = await q;
    if (error) throw new Error(error.message);
    console.log("[RBAC_RESULT]", "pendencies", (pends ?? []).length);

    const propIds = Array.from(new Set((pends ?? []).map((p: any) => p.property_id).filter(Boolean)));
    const propsById = new Map<string, any>();
    if (propIds.length > 0) {
      const { data: props } = await supabase
        .from("properties")
        .select("id, number, street_name, block_number, type")
        .in("id", propIds);
      for (const p of (props ?? []) as any[]) propsById.set(p.id, p);
    }

    let totalOpen = 0;
    let totalResolved = 0;
    const byStatus: Record<string, number> = {};
    const rows: PendencyRow[] = [];
    for (const p of (pends ?? []) as any[]) {
      const prop = propsById.get(p.property_id) || {};
      const status = String(p.current_status || "—");
      byStatus[status] = (byStatus[status] || 0) + 1;
      if (p.resolved_at) totalResolved++;
      else totalOpen++;
      rows.push({
        pendency_id: p.id,
        property_id: p.property_id,
        property_number: prop.number ?? null,
        property_type: prop.type ?? null,
        street: prop.street_name ?? null,
        block_number: prop.block_number ?? null,
        agent_id: p.agent_id,
        cycle_id: p.cycle_id ?? null,
        week_id: p.week_id ?? null,
        agent_name: p.agent_id ? nameByProfile.get(p.agent_id) || "Sem nome" : "Sem agente",
        current_status: status,
        reason: p.reason ?? null,
        attempt_count: p.attempt_count ?? 0,
        last_attempt_at: p.last_attempt_at,
        resolved_at: p.resolved_at,
      });
    }

    return { total_open: totalOpen, total_resolved: totalResolved, rows, by_status: byStatus };
  });

export const getPendencyHistoricalSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { currentCycleId: string | null }) => input)
  .handler(async ({ data, context }) => {
    const role = await requireAdminOrSupervisor(context.supabase, context.userId);
    const ids = await resolvePermittedAgentIds(context.supabase, context.userId, role);
    if (ids?.length === 0) return [];
    let query = context.supabase.from("property_pendencies").select("id, cycle_id, resolved_at").order("id");
    if (ids) query = query.in("agent_id", ids);
    return summarizePendencyCycles(await readAllQueryPages(query), data.currentCycleId);
  });

// ─────────────────────────────────────────────────────────────
// HEATMAP (block-level aggregation)
// ─────────────────────────────────────────────────────────────
export interface HeatmapPoint {
  block_number: string;
  latitude: number | null;
  longitude: number | null;
  properties_worked: number;
  positive_foci: number;
  deposits_total: number;
}

export interface HeatmapResult {
  from: string;
  to: string;
  points: HeatmapPoint[];
  totals: { properties_worked: number; positive_foci: number; deposits_total: number };
}

export const getHeatmapData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { from: string; to: string; cycleIds?: string[] | null; agentId?: string | null }) => input)
  .handler(async ({ data, context }): Promise<HeatmapResult> => {
    const { supabase, userId } = context;
