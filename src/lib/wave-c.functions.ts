/**
 * Wave C — Admin Master executive dashboard, pendency report,
 * heatmap aggregations. Reads exclusively from daily_work_records,
 * RG (boletins_rg/properties/blocks), and property_pendencies.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function sumDepJson(j: any): number {
  if (!j || typeof j !== "object") return 0;
  return ["a1", "a2", "b", "c", "d1", "d2", "e"].reduce(
    (acc, k) => acc + (Number((j as any)[k]) || 0),
    0,
  );
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

    // Scope profiles
    let profQ = supabase
      .from("profiles")
      .select("id, full_name, city, supervisor_id, registration_number");
    if (role === "supervisor") profQ = profQ.eq("supervisor_id", userId);
    if (data.supervisorId) profQ = profQ.eq("supervisor_id", data.supervisorId);
    if (data.municipality) profQ = profQ.eq("city", data.municipality);
    const { data: profiles, error: pe } = await profQ;
    if (pe) throw new Error(pe.message);

    const profileById = new Map<string, any>((profiles ?? []).map((p: any) => [p.id, p]));

    // Supervisor names lookup
    const supIds = Array.from(
      new Set((profiles ?? []).map((p: any) => p.supervisor_id).filter(Boolean)),
    );
    const supervisorNameById = new Map<string, string>();
    if (supIds.length > 0) {
      const { data: sups } = await supabase.from("profiles").select("id, full_name").in("id", supIds);
      for (const s of (sups ?? []) as any[]) supervisorNameById.set(s.id, s.full_name || "Sem nome");
    }

    const profileIds = (profiles ?? []).map((p: any) => p.id);
    console.log("[RBAC_ROLE]", role, "[RBAC_PROFILE]", userId, "[RBAC_SCOPE]", profileIds.length);
    if (profileIds.length === 0) {
      return emptyDashboard(role, data);
    }

    let scopedProfiles = profileIds;
    if (data.agentId) scopedProfiles = scopedProfiles.filter((id) => id === data.agentId);
    if (scopedProfiles.length === 0) return emptyDashboard(role, data);

    let dwrQ = supabase
      .from("daily_work_records")
      .select("*")
      .in("agent_id", scopedProfiles)
      .gte("work_date", data.from)
      .lte("work_date", data.to);
    if (data.cycleId) dwrQ = dwrQ.eq("cycle_id", data.cycleId);
    const { data: dwr, error: de } = await dwrQ;
    if (de) throw new Error(de.message);

    // Pendencies open (no resolved_at) — agent_id é profile_id
    const { count: pendOpen } = await supabase
      .from("property_pendencies")
      .select("*", { count: "exact", head: true })
      .is("resolved_at", null)
      .in("agent_id", scopedProfiles);
    console.log("[RBAC_RESULT]", "dwr", (dwr ?? []).length, "pend_open", pendOpen ?? 0);

    const kpis = {
      daily_records: 0,
      agents_active: 0,
      properties_worked: 0,
      properties_closed: 0,
      blocks_worked: 0,
      strategic_points: 0,
      deposits_total: 0,
      deposits_treated: 0,
      deposits_eliminated: 0,
      positive_foci: 0,
      tubitos_used: 0,
      larvae_collected: 0,
      cargas_collected: 0,
      pendencies_open: pendOpen ?? 0,
    };

    const activeAgents = new Set<string>();
    const bySup = new Map<string | null, ExecutiveDashboardResult["by_supervisor"][number]>();
    const byCity = new Map<string, ExecutiveDashboardResult["by_municipality"][number]>();
    const byAgent = new Map<string, ExecutiveDashboardResult["top_agents"][number]>();

    for (const r of (dwr ?? []) as any[]) {
      const depTotal = sumDepJson(r.deposits_by_type);
      kpis.daily_records++;
      kpis.properties_worked += +r.properties_worked || 0;
      kpis.properties_closed += +r.properties_closed || 0;
      kpis.blocks_worked += +r.blocks_worked || 0;
      kpis.strategic_points += +r.strategic_points_worked || 0;
      kpis.deposits_total += depTotal;
      kpis.deposits_treated += +r.deposits_treated || 0;
      kpis.deposits_eliminated += +r.deposits_eliminated || 0;
      kpis.positive_foci += +r.positive_foci || 0;
      kpis.tubitos_used += +r.tubitos_used || 0;
      kpis.larvae_collected += +r.larvae_collected || 0;
      kpis.cargas_collected += +r.cargas_collected || 0;
      activeAgents.add(r.agent_id);

      const prof = profileById.get(r.agent_id);
      const supId = prof?.supervisor_id ?? null;
      const supKey = supId ?? "—";
      if (!bySup.has(supKey)) {
        bySup.set(supKey, {
          supervisor_id: supId,
          supervisor_name: supId ? supervisorNameById.get(supId) || "Supervisor" : "Sem supervisor",
          agents: 0,
          properties_worked: 0,
          positive_foci: 0,
          deposits_total: 0,
        });
      }
      const supRow = bySup.get(supKey)!;
      supRow.properties_worked += +r.properties_worked || 0;
      supRow.positive_foci += +r.positive_foci || 0;
      supRow.deposits_total += depTotal;

      const city = prof?.city || "—";
      if (!byCity.has(city)) byCity.set(city, { city, records: 0, properties_worked: 0, positive_foci: 0 });
      const cRow = byCity.get(city)!;
      cRow.records++;
      cRow.properties_worked += +r.properties_worked || 0;
      cRow.positive_foci += +r.positive_foci || 0;

      if (!byAgent.has(r.agent_id)) {
        byAgent.set(r.agent_id, {
          agent_id: r.agent_id,
          full_name: prof?.full_name || "Sem nome",
          properties_worked: 0,
          positive_foci: 0,
        });
      }
      const aRow = byAgent.get(r.agent_id)!;
      aRow.properties_worked += +r.properties_worked || 0;
      aRow.positive_foci += +r.positive_foci || 0;
    }

    // Count unique agents per supervisor (in scope, with records)
    const supAgentSet = new Map<string, Set<string>>();
    for (const r of (dwr ?? []) as any[]) {
      const profId = profileByAgent.get(r.agent_id);
      const prof = profId ? profileById.get(profId) : null;
      const supKey = prof?.supervisor_id ?? "—";
      if (!supAgentSet.has(supKey)) supAgentSet.set(supKey, new Set());
      supAgentSet.get(supKey)!.add(r.agent_id);
    }
    for (const [k, row] of bySup) row.agents = supAgentSet.get(k as any)?.size ?? 0;

    kpis.agents_active = activeAgents.size;

    return {
      scope: role,
      filters: {
        from: data.from,
        to: data.to,
        cycleId: data.cycleId ?? null,
        supervisorId: data.supervisorId ?? null,
        agentId: data.agentId ?? null,
        municipality: data.municipality ?? null,
      },
      kpis,
      by_supervisor: Array.from(bySup.values()).sort((a, b) => b.properties_worked - a.properties_worked),
      by_municipality: Array.from(byCity.values()).sort((a, b) => b.properties_worked - a.properties_worked),
      top_agents: Array.from(byAgent.values())
        .sort((a, b) => b.properties_worked - a.properties_worked)
        .slice(0, 10),
    };
  });

function emptyDashboard(role: string, data: any): ExecutiveDashboardResult {
  return {
    scope: role,
    filters: {
      from: data.from,
      to: data.to,
      cycleId: data.cycleId ?? null,
      supervisorId: data.supervisorId ?? null,
      agentId: data.agentId ?? null,
      municipality: data.municipality ?? null,
    },
    kpis: {
      daily_records: 0, agents_active: 0, properties_worked: 0, properties_closed: 0,
      blocks_worked: 0, strategic_points: 0, deposits_total: 0, deposits_treated: 0,
      deposits_eliminated: 0, positive_foci: 0, tubitos_used: 0, larvae_collected: 0,
      cargas_collected: 0, pendencies_open: 0,
    },
    by_supervisor: [], by_municipality: [], top_agents: [],
  };
}

// ─────────────────────────────────────────────────────────────
// PENDENCY REPORT
// ─────────────────────────────────────────────────────────────
export interface PendencyRow {
  pendency_id: string;
  property_id: string;
  property_number: string | null;
  street: string | null;
  block_number: string | null;
  agent_id: string | null;
  agent_name: string;
  current_status: string;
  reason: string | null;
  attempt_count: number;
  last_attempt_at: string | null;
  resolved_at: string | null;
}

export interface PendencyReportResult {
  total_open: number;
  total_resolved: number;
  rows: PendencyRow[];
  by_status: Record<string, number>;
}

export const getPendencyReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { supervisorId?: string | null; onlyOpen?: boolean; limit?: number }) => input)
  .handler(async ({ data, context }): Promise<PendencyReportResult> => {
    const { supabase, userId } = context;
    const role = await requireAdminOrSupervisor(supabase, userId);

    let profQ = supabase.from("profiles").select("id, full_name, supervisor_id");
    if (role === "supervisor") profQ = profQ.eq("supervisor_id", userId);
    if (data.supervisorId) profQ = profQ.eq("supervisor_id", data.supervisorId);
    const { data: profiles } = await profQ;
    const profileIds = (profiles ?? []).map((p: any) => p.id);
    const nameByProfile = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name || "Sem nome"]));

    let agentIds: string[] = [];
    const agentToProfile = new Map<string, string>();
    if (profileIds.length > 0) {
      const { data: agents } = await supabase
        .from("agents")
        .select("id, profile_id")
        .in("profile_id", profileIds);
      for (const a of (agents ?? []) as any[]) {
        agentIds.push(a.id);
        agentToProfile.set(a.id, a.profile_id);
      }
    }

    if (agentIds.length === 0) {
      return { total_open: 0, total_resolved: 0, rows: [], by_status: {} };
    }

    let q = supabase
      .from("property_pendencies")
      .select("*")
      .in("agent_id", agentIds)
      .order("last_attempt_at", { ascending: false })
      .limit(data.limit ?? 500);
    if (data.onlyOpen) q = q.is("resolved_at", null);
    const { data: pends, error } = await q;
    if (error) throw new Error(error.message);

    const propIds = Array.from(new Set((pends ?? []).map((p: any) => p.property_id).filter(Boolean)));
    const propsById = new Map<string, any>();
    if (propIds.length > 0) {
      const { data: props } = await supabase
        .from("properties")
        .select("id, number, street_name, block_number")
        .in("id", propIds);
      for (const p of (props ?? []) as any[]) propsById.set(p.id, p);
    }

    let totalOpen = 0;
    let totalResolved = 0;
    const byStatus: Record<string, number> = {};
    const rows: PendencyRow[] = [];
    for (const p of (pends ?? []) as any[]) {
      const prop = propsById.get(p.property_id) || {};
      const profId = p.agent_id ? agentToProfile.get(p.agent_id) : null;
      const status = String(p.current_status || "—");
      byStatus[status] = (byStatus[status] || 0) + 1;
      if (p.resolved_at) totalResolved++;
      else totalOpen++;
      rows.push({
        pendency_id: p.id,
        property_id: p.property_id,
        property_number: prop.number ?? null,
        street: prop.street_name ?? null,
        block_number: prop.block_number ?? null,
        agent_id: p.agent_id,
        agent_name: profId ? nameByProfile.get(profId) || "Sem nome" : "Sem agente",
        current_status: status,
        reason: p.reason ?? null,
        attempt_count: p.attempt_count ?? 0,
        last_attempt_at: p.last_attempt_at,
        resolved_at: p.resolved_at,
      });
    }

    return { total_open: totalOpen, total_resolved: totalResolved, rows, by_status: byStatus };
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
  .inputValidator((input: { from: string; to: string }) => input)
  .handler(async ({ data, context }): Promise<HeatmapResult> => {
    const { supabase, userId } = context;
    const role = await requireAdminOrSupervisor(supabase, userId);

    // For supervisor/coordenador, scope agents; admin_master sees all
    let agentIds: string[] | null = null;
    let profileIdsScope: string[] | null = null;
    if (role !== "admin_master") {
      profileIdsScope = await scopedProfileIds(supabase, userId, role as any);
      if (!profileIdsScope || profileIdsScope.length === 0) {
        agentIds = [];
      } else {
        const { data: agents } = await supabase.from("agents").select("id").in("profile_id", profileIdsScope);
        agentIds = (agents ?? []).map((a: any) => a.id);
      }
    }
    console.log("[HEATMAP_ROLE]", role, "scope_profiles", profileIdsScope?.length ?? "all", "scope_agents", agentIds?.length ?? "all");

    let dwrQ = supabase
      .from("daily_work_records")
      .select("agent_id, properties_worked, positive_foci, deposits_by_type")
      .gte("work_date", data.from)
      .lte("work_date", data.to);
    if (agentIds !== null) {
      if (agentIds.length === 0) return { from: data.from, to: data.to, points: [], totals: zeroHeat() };
      dwrQ = dwrQ.in("agent_id", agentIds);
    }
    const { data: dwr } = await dwrQ;

    // Aggregate at the agent's recent block(s). Approximation: distribute
    // by agent → blocks (via boletins_rg). For Wave C v1 we aggregate at
    // agent_id level and map to all blocks they touched in window.
    const { data: blocks } = await supabase
      .from("blocks")
      .select("number, latitude, longitude");
    const blockMap = new Map<string, any>();
    for (const b of (blocks ?? []) as any[]) blockMap.set(String(b.number), b);

    // boletins_rg.agent_id armazena profile_id
    let bolQ = supabase.from("boletins_rg").select("agent_id, block_number");
    if (profileIdsScope) bolQ = bolQ.in("agent_id", profileIdsScope);
    const { data: boletins } = await bolQ;
    const agentBlocks = new Map<string, Set<string>>();
    for (const b of (boletins ?? []) as any[]) {
      if (!b.agent_id || !b.block_number) continue;
      if (!agentBlocks.has(b.agent_id)) agentBlocks.set(b.agent_id, new Set());
      agentBlocks.get(b.agent_id)!.add(String(b.block_number));
    }

    // map agents.profile_id → agent.id (DWR.agent_id is agents.id)
    const distinctAgentIds = Array.from(new Set((dwr ?? []).map((r: any) => r.agent_id)));
    const { data: agents2 } = distinctAgentIds.length
      ? await supabase.from("agents").select("id, profile_id").in("id", distinctAgentIds)
      : { data: [] as any[] };
    const agentToProfile = new Map((agents2 ?? []).map((a: any) => [a.id, a.profile_id]));

    const byBlock = new Map<string, HeatmapPoint>();
    const totals = zeroHeat();
    for (const r of (dwr ?? []) as any[]) {
      const profId = agentToProfile.get(r.agent_id);
      const blocks = profId ? agentBlocks.get(profId) : null;
      const pw = +r.properties_worked || 0;
      const pf = +r.positive_foci || 0;
      const dt = sumDepJson(r.deposits_by_type);
      totals.properties_worked += pw;
      totals.positive_foci += pf;
      totals.deposits_total += dt;
      if (!blocks || blocks.size === 0) continue;
      // distribute equally across the agent's blocks
      const share = 1 / blocks.size;
      for (const bn of blocks) {
        if (!byBlock.has(bn)) {
          const meta = blockMap.get(bn) || {};
          byBlock.set(bn, {
            block_number: bn,
            latitude: meta.latitude ?? null,
            longitude: meta.longitude ?? null,
            properties_worked: 0,
            positive_foci: 0,
            deposits_total: 0,
          });
        }
        const point = byBlock.get(bn)!;
        point.properties_worked += Math.round(pw * share);
        point.positive_foci += Math.round(pf * share);
        point.deposits_total += Math.round(dt * share);
      }
    }

    return { from: data.from, to: data.to, points: Array.from(byBlock.values()), totals };
  });

function zeroHeat() {
  return { properties_worked: 0, positive_foci: 0, deposits_total: 0 };
}

// ─────────────────────────────────────────────────────────────
// PROPERTY-LEVEL POINTS — usa coordenadas oficiais de properties
// ─────────────────────────────────────────────────────────────
export interface PropertyMapPoint {
  id: string;
  number: string | null;
  street: string | null;
  block_number: string | null;
  locality: string | null;
  latitude: number;
  longitude: number;
  status: string | null;
  has_pendency: boolean;
  has_positive_focus: boolean;
  is_strategic: boolean;
  boletim_id: string | null;
  agent_name: string | null;
  last_visit_at: string | null;
  deposits_found: number;
  positive_foci_count: number;
  pendency_count: number;
  is_recurrent: boolean;
  risk_score: number;
  risk_level: "low" | "med" | "high";
}

export interface BlockRiskScore {
  block_number: string;
  locality: string | null;
  score: number;
  level: "low" | "med" | "high";
  props_count: number;
  focus_count: number;
  pending_count: number;
  centroid: { lat: number; lng: number };
}

export interface GpsCoverage {
  properties_total: number;
  properties_geo: number;
  coverage_pct: number;
  blocks_total: number;
  blocks_geo: number;
}

function riskLevel(score: number): "low" | "med" | "high" {
  if (score >= 6) return "high";
  if (score >= 3) return "med";
  return "low";
}

async function scopedProfileIds(
  supabase: any,
  userId: string,
  role: "admin_master" | "coordenador" | "supervisor",
): Promise<string[] | null> {
  if (role === "admin_master") return null;
  let profQ = supabase.from("profiles").select("id");
  if (role === "supervisor") {
    profQ = profQ.or(`supervisor_id.eq.${userId},id.eq.${userId}`);
  } else if (role === "coordenador") {
    // coordenador: próprios supervisores + agentes desses supervisores + ele mesmo
    const { data: sups } = await supabase
      .from("profiles").select("id").eq("coordinator_id", userId);
    const supIds = (sups ?? []).map((s: any) => s.id);
    const { data: ags } = supIds.length
      ? await supabase.from("profiles").select("id").in("supervisor_id", supIds)
      : { data: [] as any[] };
    return Array.from(new Set([userId, ...supIds, ...(ags ?? []).map((a: any) => a.id)]));
  }
  const { data: profiles } = await profQ;
  return (profiles ?? []).map((p: any) => p.id);
}

/** @deprecated kept for compat — use scopedProfileIds */
async function scopedAgentIds(
  supabase: any,
  userId: string,
  role: "admin_master" | "coordenador" | "supervisor",
): Promise<string[] | null> {
  const profileIds = await scopedProfileIds(supabase, userId, role);
  if (profileIds === null) return null;
  if (profileIds.length === 0) return [];
  const { data: agents } = await supabase
    .from("agents").select("id").in("profile_id", profileIds);
  return (agents ?? []).map((a: any) => a.id);
}

export const getPropertyMapPoints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { from: string; to: string }) => input)
  .handler(async ({ data, context }): Promise<{ points: PropertyMapPoint[] }> => {
    const { supabase, userId } = context;
    const role = await requireAdminOrSupervisor(supabase, userId);
    // boletins_rg.agent_id armazena profile_id → escopo por profile_ids
    const profileIds = await scopedProfileIds(supabase, userId, role);
    console.log("[MAP_ROLE]", role);
    console.log("[MAP_USER]", userId);
    console.log("[MAP_SCOPE_PROFILES]", profileIds?.length ?? "all");
    if (profileIds && profileIds.length === 0) {
      console.log("[MAP_EMPTY] no profiles in scope");
      return { points: [] };
    }

    let boletimIds: string[] | null = null;
    const boletimAgentMap = new Map<string, { agent_id: string | null; locality: string | null }>();
    if (profileIds) {
      const { data: boletins } = await supabase
        .from("boletins_rg")
        .select("id, agent_id, locality")
        .in("agent_id", profileIds);
      boletimIds = (boletins ?? []).map((b: any) => b.id);
      console.log("[MAP_SCOPE_BOLETINS]", boletimIds.length);
      if (boletimIds.length === 0) return { points: [] };
      for (const b of boletins ?? []) boletimAgentMap.set(b.id, { agent_id: b.agent_id, locality: b.locality });
    }

    let propQ = supabase
      .from("properties")
      .select("id, number, street_name, block_number, type, status, latitude, longitude, boletim_id")
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .limit(5000);
    if (boletimIds) propQ = propQ.in("boletim_id", boletimIds);

    const { data: props } = await propQ;
    const propList = (props ?? []) as any[];
    console.log("[MAP_TOTAL_GEOREF]", propList.length);
    if (propList.length === 0) return { points: [] };

    if (!profileIds) {
      const ids = Array.from(new Set(propList.map((p) => p.boletim_id).filter(Boolean)));
      if (ids.length > 0) {
        const { data: bs } = await supabase
          .from("boletins_rg")
          .select("id, agent_id, locality")
          .in("id", ids);
        for (const b of bs ?? []) boletimAgentMap.set(b.id, { agent_id: b.agent_id, locality: b.locality });
      }
    }

    const propIds = propList.map((p) => p.id);

    const { data: pends } = await supabase
      .from("property_pendencies")
      .select("property_id, resolved_at")
      .in("property_id", propIds);
    const pendingByProp = new Map<string, number>();
    for (const p of pends ?? []) {
      if (!p.resolved_at) pendingByProp.set(p.property_id, (pendingByProp.get(p.property_id) ?? 0) + 1);
    }

    const { data: visits } = await supabase
      .from("visits")
      .select("id, property_id, agent_id, has_focus, visit_date")
      .in("property_id", propIds)
      .gte("visit_date", data.from)
      .lte("visit_date", data.to)
      .order("visit_date", { ascending: false });

    const focusByProp = new Map<string, number>();
    const lastVisitByProp = new Map<string, string>();
    const lastAgentByProp = new Map<string, string>();
    const visitIds: string[] = [];
    for (const v of visits ?? []) {
      visitIds.push(v.id);
      if (v.has_focus) focusByProp.set(v.property_id, (focusByProp.get(v.property_id) ?? 0) + 1);
      if (!lastVisitByProp.has(v.property_id)) {
        lastVisitByProp.set(v.property_id, v.visit_date);
        if (v.agent_id) lastAgentByProp.set(v.property_id, v.agent_id);
      }
    }

    const depByProp = new Map<string, number>();
    if (visitIds.length > 0) {
      const { data: deps } = await supabase
        .from("visit_deposits")
        .select("visit_id")
        .in("visit_id", visitIds);
      const visitToProp = new Map<string, string>();
      for (const v of visits ?? []) visitToProp.set(v.id, v.property_id);
      for (const d of deps ?? []) {
        const pid = visitToProp.get(d.visit_id);
        if (pid) depByProp.set(pid, (depByProp.get(pid) ?? 0) + 1);
      }
    }

    // agent_id (em visits e boletins_rg) referencia profiles.id
    const profileIdsForName = Array.from(
      new Set(
        [
          ...lastAgentByProp.values(),
          ...Array.from(boletimAgentMap.values()).map((b) => b.agent_id),
        ].filter(Boolean) as string[],
      ),
    );
    const agentNameById = new Map<string, string>();
    if (profileIdsForName.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", profileIdsForName);
      for (const p of profs ?? []) agentNameById.set(p.id, p.full_name ?? "Agente");
    }

    const points: PropertyMapPoint[] = propList.map((p) => {
      const boletim = p.boletim_id ? boletimAgentMap.get(p.boletim_id) : null;
      const agentId = lastAgentByProp.get(p.id) || boletim?.agent_id || null;
      const foci = focusByProp.get(p.id) ?? 0;
      const pend = pendingByProp.get(p.id) ?? 0;
      const recurrent = foci >= 2;
      const isPe = p.type === "strategic_point";
      const score = foci * 3 + pend * 2 + (recurrent ? 2 : 0) + (isPe ? 1 : 0);
      return {
        id: p.id,
        number: p.number ?? null,
        street: p.street_name ?? null,
        block_number: p.block_number != null ? String(p.block_number) : null,
        locality: boletim?.locality ?? null,
        latitude: Number(p.latitude),
        longitude: Number(p.longitude),
        status: p.status ?? null,
        has_pendency: pend > 0,
        has_positive_focus: foci > 0,
        is_strategic: isPe,
        boletim_id: p.boletim_id ?? null,
        agent_name: agentId ? agentNameById.get(agentId) ?? null : null,
        last_visit_at: lastVisitByProp.get(p.id) ?? null,
        deposits_found: depByProp.get(p.id) ?? 0,
        positive_foci_count: foci,
        pendency_count: pend,
        is_recurrent: recurrent,
        risk_score: score,
        risk_level: riskLevel(score),
      };
    });

    return { points };
  });

export const getBlockRiskScores = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { from: string; to: string }) => input)
  .handler(async ({ data, context }): Promise<{ blocks: BlockRiskScore[] }> => {
    const result = await (getPropertyMapPoints as any)({ data });
    const points = (result.points ?? []) as PropertyMapPoint[];
    const byKey = new Map<
      string,
      BlockRiskScore & { latSum: number; lngSum: number }
    >();
    for (const p of points) {
      if (!p.block_number) continue;
      const key = `${p.block_number}::${p.locality ?? ""}`;
      const cur =
        byKey.get(key) ??
        ({
          block_number: p.block_number,
          locality: p.locality,
          score: 0,
          level: "low" as const,
          props_count: 0,
          focus_count: 0,
          pending_count: 0,
          centroid: { lat: 0, lng: 0 },
          latSum: 0,
          lngSum: 0,
        } as BlockRiskScore & { latSum: number; lngSum: number });
      cur.score += p.risk_score;
      cur.props_count += 1;
      cur.focus_count += p.positive_foci_count;
      cur.pending_count += p.pendency_count;
      cur.latSum += p.latitude;
      cur.lngSum += p.longitude;
      byKey.set(key, cur);
    }
    const blocks: BlockRiskScore[] = Array.from(byKey.values()).map((b) => {
      const avgScore = b.score / Math.max(1, b.props_count);
      return {
        block_number: b.block_number,
        locality: b.locality,
        score: Math.round(b.score),
        level: riskLevel(avgScore),
        props_count: b.props_count,
        focus_count: b.focus_count,
        pending_count: b.pending_count,
        centroid: { lat: b.latSum / b.props_count, lng: b.lngSum / b.props_count },
      };
    });
    return { blocks };
  });

export const getGpsCoverage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((_input: Record<string, never>) => ({}))
  .handler(async ({ context }): Promise<GpsCoverage> => {
    const { supabase, userId } = context;
    const role = await requireAdminOrSupervisor(supabase, userId);
    const agentIds = await scopedAgentIds(supabase, userId, role);

    let boletimIds: string[] | null = null;
    if (agentIds) {
      if (agentIds.length === 0)
        return { properties_total: 0, properties_geo: 0, coverage_pct: 0, blocks_total: 0, blocks_geo: 0 };
      const { data: boletins } = await supabase
        .from("boletins_rg")
        .select("id")
        .in("agent_id", agentIds);
      boletimIds = (boletins ?? []).map((b: any) => b.id);
      if (boletimIds.length === 0)
        return { properties_total: 0, properties_geo: 0, coverage_pct: 0, blocks_total: 0, blocks_geo: 0 };
    }

    let q = supabase.from("properties").select("id, latitude, longitude, block_number");
    if (boletimIds) q = q.in("boletim_id", boletimIds);
    const { data: props } = await q.limit(50000);
    const list = (props ?? []) as any[];

    const blocksTotal = new Set<string>();
    const blocksGeo = new Set<string>();
    let geo = 0;
    for (const p of list) {
      if (p.block_number != null) blocksTotal.add(String(p.block_number));
      if (p.latitude != null && p.longitude != null) {
        geo += 1;
        if (p.block_number != null) blocksGeo.add(String(p.block_number));
      }
    }
    return {
      properties_total: list.length,
      properties_geo: geo,
      coverage_pct: list.length === 0 ? 0 : Math.round((geo / list.length) * 1000) / 10,
      blocks_total: blocksTotal.size,
      blocks_geo: blocksGeo.size,
    };
  });


