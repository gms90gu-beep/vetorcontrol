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
    if (profileIds.length === 0) {
      return emptyDashboard(role, data);
    }

    const { data: agents } = await supabase
      .from("agents")
      .select("id, profile_id")
      .in("profile_id", profileIds);
    const agentList = (agents ?? []) as { id: string; profile_id: string }[];
    let agentIds = agentList.map((a) => a.id);
    if (data.agentId) agentIds = agentIds.filter((id) => id === data.agentId);
    const profileByAgent = new Map(agentList.map((a) => [a.id, a.profile_id]));

    if (agentIds.length === 0) return emptyDashboard(role, data);

    let dwrQ = supabase
      .from("daily_work_records")
      .select("*")
      .in("agent_id", agentIds)
      .gte("work_date", data.from)
      .lte("work_date", data.to);
    if (data.cycleId) dwrQ = dwrQ.eq("cycle_id", data.cycleId);
    const { data: dwr, error: de } = await dwrQ;
    if (de) throw new Error(de.message);

    // Pendencies open (no resolved_at)
    const { count: pendOpen } = await supabase
      .from("property_pendencies")
      .select("*", { count: "exact", head: true })
      .is("resolved_at", null)
      .in("agent_id", agentIds);

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

      const profId = profileByAgent.get(r.agent_id);
      const prof = profId ? profileById.get(profId) : null;
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
    if (role !== "admin_master") {
      let profQ = supabase.from("profiles").select("id");
      if (role === "supervisor") profQ = profQ.eq("supervisor_id", userId);
      const { data: profiles } = await profQ;
      const profileIds = (profiles ?? []).map((p: any) => p.id);
      if (profileIds.length === 0) agentIds = [];
      else {
        const { data: agents } = await supabase.from("agents").select("id").in("profile_id", profileIds);
        agentIds = (agents ?? []).map((a: any) => a.id);
      }
    }

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

    // Properties per block via boletins_rg (each boletim has agent + block)
    const { data: boletins } = await supabase
      .from("boletins_rg")
      .select("agent_id, block_number");
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
