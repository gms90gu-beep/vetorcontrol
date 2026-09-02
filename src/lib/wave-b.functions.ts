/**
 * Wave B — Server functions for Supervisor production ranking and
 * Weekly comparison. Reads exclusively from daily_work_records.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { epiWeekToDateRange, getEpiWeek } from "@/lib/cycle-week";

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

  let profileQuery = supabase.from("profiles").select("id, full_name, registration_number, supervisor_id");
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
    const { role, profiles } = await resolveScopedAgents(supabase, userId);

    const profilesById = new Map<string, any>((profiles ?? []).map((p: any) => [p.id, p]));
    let profileIds = (profiles as any[]).map((p) => p.id);
    if (data.agentId) profileIds = profileIds.filter((id: string) => id === data.agentId);

    if (profileIds.length === 0) {
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
      .in("agent_id", profileIds)
      .gte("work_date", data.from)
      .lte("work_date", data.to);
    if (error) throw new Error(error.message);
    console.log("[RBAC_RESULT]", "dwr", (dwr ?? []).length);

    const byAgent = new Map<string, AgentProductionRow>();
    for (const p of profiles as any[]) {
      byAgent.set(p.id, {
        agent_id: p.id,
        profile_id: p.id,
        full_name: p.full_name || "Sem nome",
        registration: p.registration_number ?? null,
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
    void profilesById;

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
  // Calcula a SE anterior por aritmética de datas real (não assume 52 semanas —
  // alguns anos SINAN têm 53), voltando 7 dias a partir do início da SE atual.
  const { start } = epiWeekToDateRange(week, year);
  const [y, m, d] = start.split("-").map(Number);
  const prevStart = new Date(y, m - 1, d);
  prevStart.setDate(prevStart.getDate() - 7);
  return getEpiWeek(prevStart);
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
      // próprio profile_id (DWR.agent_id == profile_id)
      agentIds = [userId];
    } else {
      const { profiles } = await resolveScopedAgents(supabase, userId);
      agentIds = (profiles as any[]).map((p) => p.id);
      if (data.agentId) agentIds = agentIds.filter((id) => id === data.agentId);
    }

    const cur = { week: data.epiWeek, year: data.epiYear };
    const prv = prevEpiWeek(cur.week, cur.year);

    const fetchWeek = async (week: number, year: number) => {
      const totals = emptyWeeklyTotals();
      if (agentIds.length === 0) return totals;
      // Filtra por work_date (intervalo domingo-sábado da SE), não por epi_week/epi_year:
      // essas colunas são recalculadas por trigger no banco usando semana ISO
      // (segunda-domingo), divergente do padrão SINAN usado aqui e no restante do app.
      const { start, end } = epiWeekToDateRange(week, year);
      const { data: rows, error } = await supabase
        .from("daily_work_records")
        .select("*")
        .in("agent_id", agentIds)
        .gte("work_date", start)
        .lte("work_date", end);
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

/* ─────────── Relatório Semanal da Equipe (por agente e por bairro) ─────────── */

export interface TeamWeeklyAgentRow {
  agent_id: string;
  full_name: string;
  registration: string | null;
  records: number;
  properties_worked: number;
  properties_closed: number;
  blocks_worked: number;
  positive_foci: number;
  deposits_treated: number;
  deposits_eliminated: number;
}

export interface TeamWeeklyNeighborhoodRow {
  neighborhood: string;
  visits: number;
  properties: number;
  visited: number;
  closed: number;
  refused: number;
  foci: number;
  treated: number;
}

export interface TeamWeeklyResult {
  epi_week: number;
  epi_year: number;
  from: string;
  to: string;
  agents: TeamWeeklyAgentRow[];
  neighborhoods: TeamWeeklyNeighborhoodRow[];
  totals: {
    records: number;
    properties_worked: number;
    properties_closed: number;
    blocks_worked: number;
    positive_foci: number;
    deposits_treated: number;
    deposits_eliminated: number;
  };
}

export const getTeamWeeklyProduction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { epiWeek: number; epiYear: number }) => input)
  .handler(async ({ data, context }): Promise<TeamWeeklyResult> => {
    const { supabase, userId } = context;
    const { profiles } = await resolveScopedAgents(supabase, userId);
    const profileIds = (profiles as any[]).map((p) => p.id);
    const { start, end } = epiWeekToDateRange(data.epiWeek, data.epiYear);

    const empty: TeamWeeklyResult = {
      epi_week: data.epiWeek,
      epi_year: data.epiYear,
      from: start,
      to: end,
      agents: [],
      neighborhoods: [],
      totals: {
        records: 0,
        properties_worked: 0,
        properties_closed: 0,
        blocks_worked: 0,
        positive_foci: 0,
        deposits_treated: 0,
        deposits_eliminated: 0,
      },
    };
    if (profileIds.length === 0) return empty;

    // ── Produção por agente (fonte: daily_work_records) ──
    const { data: dwr, error: dwrErr } = await supabase
      .from("daily_work_records")
      .select("agent_id, properties_worked, properties_closed, blocks_worked, positive_foci, deposits_treated, deposits_eliminated")
      .in("agent_id", profileIds)
      .gte("work_date", start)
      .lte("work_date", end);
    if (dwrErr) throw new Error(dwrErr.message);

    const byAgent = new Map<string, TeamWeeklyAgentRow>();
    const profileById = new Map<string, any>((profiles as any[]).map((p) => [p.id, p]));
    for (const r of (dwr ?? []) as any[]) {
      const id = r.agent_id as string;
      let row = byAgent.get(id);
      if (!row) {
        const p = profileById.get(id);
        row = {
          agent_id: id,
          full_name: p?.full_name || "Agente",
          registration: p?.registration_number ?? null,
          records: 0,
          properties_worked: 0,
          properties_closed: 0,
          blocks_worked: 0,
          positive_foci: 0,
          deposits_treated: 0,
          deposits_eliminated: 0,
        };
        byAgent.set(id, row);
      }
      row.records += 1;
      row.properties_worked += Number(r.properties_worked) || 0;
      row.properties_closed += Number(r.properties_closed) || 0;
      row.blocks_worked += Number(r.blocks_worked) || 0;
      row.positive_foci += Number(r.positive_foci) || 0;
      row.deposits_treated += Number(r.deposits_treated) || 0;
      row.deposits_eliminated += Number(r.deposits_eliminated) || 0;
    }
    const agents = [...byAgent.values()].sort((a, b) => b.properties_worked - a.properties_worked);
    const totals = { ...empty.totals };
    for (const a of agents) {
      totals.records += a.records;
      totals.properties_worked += a.properties_worked;
      totals.properties_closed += a.properties_closed;
      totals.blocks_worked += a.blocks_worked;
      totals.positive_foci += a.positive_foci;
      totals.deposits_treated += a.deposits_treated;
      totals.deposits_eliminated += a.deposits_eliminated;
    }

    // ── Produção por bairro (fonte: visits + properties.neighborhood) ──
    // visits.agent_id pode referenciar profiles.id ou agents.id (legado):
    // resolvemos os dois conjuntos de identificadores.
    const agentIds = new Set<string>(profileIds);
    const { data: agentRows } = await supabase
      .from("agents")
      .select("id, profile_id")
      .in("profile_id", profileIds);
    for (const a of (agentRows ?? []) as any[]) if (a?.id) agentIds.add(a.id as string);

    const ids = [...agentIds];
    const visitRows: any[] = [];
    for (let i = 0; i < ids.length; i += 150) {
      const chunk = ids.slice(i, i + 150);
      const { data: vs, error: vErr } = await supabase
        .from("visits")
        .select("property_id, status, has_focus, treatment_applied, properties!inner(neighborhood)")
        .in("agent_id", chunk)
        .gte("visit_date", start)
        .lte("visit_date", end);
      if (vErr) throw new Error(vErr.message);
      visitRows.push(...((vs ?? []) as any[]));
    }

    const byHood = new Map<string, TeamWeeklyNeighborhoodRow & { _props: Set<string> }>();
    for (const v of visitRows) {
      const hood = (v.properties?.neighborhood as string | null)?.trim() || "Sem bairro";
      let row = byHood.get(hood);
      if (!row) {
        row = {
          neighborhood: hood,
          visits: 0,
          properties: 0,
          visited: 0,
          closed: 0,
          refused: 0,
          foci: 0,
          treated: 0,
          _props: new Set<string>(),
        };
        byHood.set(hood, row);
      }
      row.visits += 1;
      if (v.property_id) row._props.add(v.property_id as string);
      if (v.status === "visited") row.visited += 1;
      else if (v.status === "closed") row.closed += 1;
      else if (v.status === "refused") row.refused += 1;
      if (v.has_focus) row.foci += 1;
      if (v.treatment_applied) row.treated += 1;
    }
    const neighborhoods = [...byHood.values()]
      .map(({ _props, ...r }) => ({ ...r, properties: _props.size }))
      .sort((a, b) => b.properties - a.properties);

    return { ...empty, agents, neighborhoods, totals };
  });
