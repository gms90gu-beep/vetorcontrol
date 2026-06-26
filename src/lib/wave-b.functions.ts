/**
 * Wave B — Server functions for Supervisor production ranking and
 * Weekly comparison. Reads exclusively from daily_work_records.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface AgentProductionRow {
  agent_id: string;
  profile_id: string | null;
  full_name: string;
  registration: string | null;
  records: number;
  blocks_worked: number;
  properties_worked: number;
  properties_closed: number;
  strategic_points_worked: number;
  deposits_treated: number;
  deposits_eliminated: number;
  positive_foci: number;
  tubitos_used: number;
  tubitos_collected: number;
  larvae_collected: number;
  cargas_collected: number;
  deposits_total: number;
}

export interface AgentProductionResult {
  scope: "admin_master" | "supervisor";
  from: string;
  to: string;
  rows: AgentProductionRow[];
  totals: Omit<AgentProductionRow, "agent_id" | "profile_id" | "full_name" | "registration">;
}

async function resolveScopedAgents(supabase: any, userId: string) {
  const { data: roleRow } = await supabase.rpc("get_user_role", { u_id: userId });
  const role = (roleRow as string) || "agente";
  if (role !== "admin_master" && role !== "supervisor" && role !== "coordenador") {
    throw new Error("Forbidden: requer supervisor ou admin_master");
  }

  let profileQuery = supabase.from("profiles").select("id, full_name, registration_id, supervisor_id");
  if (role === "supervisor") profileQuery = profileQuery.eq("supervisor_id", userId);
  const { data: profiles, error: profErr } = await profileQuery;
  if (profErr) throw new Error(profErr.message);

  console.log("[RBAC_ROLE]", role, "[RBAC_PROFILE]", userId, "[RBAC_SCOPE]", (profiles ?? []).length);
  // profile_id é a identidade canônica; DWR.agent_id == profile_id
  return { role: role as "supervisor" | "admin_master" | "coordenador", profiles: profiles ?? [] };
}

function emptyTotals() {
  return {
    records: 0,
    blocks_worked: 0,
    properties_worked: 0,
    properties_closed: 0,
    strategic_points_worked: 0,
    deposits_treated: 0,
    deposits_eliminated: 0,
    positive_foci: 0,
    tubitos_used: 0,
    tubitos_collected: 0,
    larvae_collected: 0,
    cargas_collected: 0,
    deposits_total: 0,
  };
}

function sumDepositsJson(j: any): number {
  if (!j || typeof j !== "object") return 0;
  return ["a1", "a2", "b", "c", "d1", "d2", "e"].reduce(
    (acc, k) => acc + (Number((j as any)[k]) || 0),
    0,
  );
}

export const getAgentProduction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { from: string; to: string; agentId?: string }) => input)
  .handler(async ({ data, context }): Promise<AgentProductionResult> => {
    const { supabase, userId } = context;
    const { role, profiles, agents } = await resolveScopedAgents(supabase, userId);

    const profilesById = new Map<string, any>((profiles ?? []).map((p: any) => [p.id, p]));
    let agentIds = agents.map((a: any) => a.id);
    if (data.agentId) agentIds = agentIds.filter((id: string) => id === data.agentId);

    if (agentIds.length === 0) {
      return {
        scope: role === "admin_master" ? "admin_master" : "supervisor",
        from: data.from,
        to: data.to,
        rows: [],
        totals: emptyTotals(),
      };
    }

    const { data: dwr, error } = await supabase
      .from("daily_work_records")
      .select("*")
      .in("agent_id", agentIds)
      .gte("work_date", data.from)
      .lte("work_date", data.to);
    if (error) throw new Error(error.message);

    const byAgent = new Map<string, AgentProductionRow>();
    for (const a of agents) {
      const prof = profilesById.get(a.profile_id);
      byAgent.set(a.id, {
        agent_id: a.id,
        profile_id: a.profile_id,
        full_name: prof?.full_name || "Sem nome",
        registration: prof?.registration_id ?? null,
        ...emptyTotals(),
      });
    }

    for (const r of (dwr ?? []) as any[]) {
      const row = byAgent.get(r.agent_id);
      if (!row) continue;
      row.records += 1;
      row.blocks_worked += Number(r.blocks_worked) || 0;
      row.properties_worked += Number(r.properties_worked) || 0;
      row.properties_closed += Number(r.properties_closed) || 0;
      row.strategic_points_worked += Number(r.strategic_points_worked) || 0;
      row.deposits_treated += Number(r.deposits_treated) || 0;
      row.deposits_eliminated += Number(r.deposits_eliminated) || 0;
      row.positive_foci += Number(r.positive_foci) || 0;
      row.tubitos_used += Number(r.tubitos_used) || 0;
      row.tubitos_collected += Number(r.tubitos_collected) || 0;
      row.larvae_collected += Number(r.larvae_collected) || 0;
      row.cargas_collected += Number(r.cargas_collected) || 0;
      row.deposits_total += sumDepositsJson(r.deposits_by_type);
    }

    const rows = Array.from(byAgent.values())
      .filter((r) => r.records > 0)
      .sort((a, b) => b.properties_worked - a.properties_worked);

    const totals = emptyTotals();
    for (const r of rows) {
      for (const k of Object.keys(totals) as (keyof typeof totals)[]) {
        (totals as any)[k] += (r as any)[k];
      }
    }

    return {
      scope: role === "admin_master" ? "admin_master" : "supervisor",
      from: data.from,
      to: data.to,
      rows,
      totals,
    };
  });

export interface WeeklyComparisonTotals {
  records: number;
  properties_worked: number;
  properties_closed: number;
  blocks_worked: number;
  strategic_points_worked: number;
  positive_foci: number;
  deposits_total: number;
  deposits_treated: number;
  deposits_eliminated: number;
  tubitos_used: number;
  tubitos_collected: number;
  larvae_collected: number;
  cargas_collected: number;
}

export interface WeeklyComparisonResult {
  current: { epi_week: number; epi_year: number; totals: WeeklyComparisonTotals };
  previous: { epi_week: number; epi_year: number; totals: WeeklyComparisonTotals };
  delta: Record<keyof WeeklyComparisonTotals, { abs: number; pct: number | null }>;
  agents_scope: number;
}

function emptyWeeklyTotals(): WeeklyComparisonTotals {
  return {
    records: 0,
    properties_worked: 0,
    properties_closed: 0,
    blocks_worked: 0,
    strategic_points_worked: 0,
    positive_foci: 0,
    deposits_total: 0,
    deposits_treated: 0,
    deposits_eliminated: 0,
    tubitos_used: 0,
    tubitos_collected: 0,
    larvae_collected: 0,
    cargas_collected: 0,
  };
}

function prevEpiWeek(week: number, year: number): { week: number; year: number } {
  if (week > 1) return { week: week - 1, year };
  // approx — assume previous year had 52 weeks
  return { week: 52, year: year - 1 };
}

export const getWeeklyComparison = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { epiWeek: number; epiYear: number; agentId?: string; scope?: "self" | "team" }) => input,
  )
  .handler(async ({ data, context }): Promise<WeeklyComparisonResult> => {
    const { supabase, userId } = context;
    const scope = data.scope ?? "team";

    let agentIds: string[] = [];
    if (scope === "self") {
      const { data: a } = await supabase
        .from("agents")
        .select("id")
        .eq("profile_id", userId)
        .maybeSingle();
      if (a?.id) agentIds = [a.id];
    } else {
      const { agents } = await resolveScopedAgents(supabase, userId);
      agentIds = agents.map((a: any) => a.id);
      if (data.agentId) agentIds = agentIds.filter((id) => id === data.agentId);
    }

    const cur = { week: data.epiWeek, year: data.epiYear };
    const prv = prevEpiWeek(cur.week, cur.year);

    const fetchWeek = async (week: number, year: number) => {
      const totals = emptyWeeklyTotals();
      if (agentIds.length === 0) return totals;
      const { data: rows, error } = await supabase
        .from("daily_work_records")
        .select("*")
        .in("agent_id", agentIds)
        .eq("epi_week", week)
        .eq("epi_year", year);
      if (error) throw new Error(error.message);
      for (const r of (rows ?? []) as any[]) {
        totals.records += 1;
        totals.properties_worked += Number(r.properties_worked) || 0;
        totals.properties_closed += Number(r.properties_closed) || 0;
        totals.blocks_worked += Number(r.blocks_worked) || 0;
        totals.strategic_points_worked += Number(r.strategic_points_worked) || 0;
        totals.positive_foci += Number(r.positive_foci) || 0;
        totals.deposits_treated += Number(r.deposits_treated) || 0;
        totals.deposits_eliminated += Number(r.deposits_eliminated) || 0;
        totals.tubitos_used += Number(r.tubitos_used) || 0;
        totals.tubitos_collected += Number(r.tubitos_collected) || 0;
        totals.larvae_collected += Number(r.larvae_collected) || 0;
        totals.cargas_collected += Number(r.cargas_collected) || 0;
        totals.deposits_total += sumDepositsJson(r.deposits_by_type);
      }
      return totals;
    };

    const [curT, prvT] = await Promise.all([fetchWeek(cur.week, cur.year), fetchWeek(prv.week, prv.year)]);

    const delta = {} as WeeklyComparisonResult["delta"];
    for (const k of Object.keys(curT) as (keyof WeeklyComparisonTotals)[]) {
      const abs = (curT[k] as number) - (prvT[k] as number);
      const pct = (prvT[k] as number) > 0 ? Math.round((abs / (prvT[k] as number)) * 1000) / 10 : null;
      delta[k] = { abs, pct };
    }

    return {
      current: { epi_week: cur.week, epi_year: cur.year, totals: curT },
      previous: { epi_week: prv.week, epi_year: prv.year, totals: prvT },
      delta,
      agents_scope: agentIds.length,
    };
  });
