/**
 * reports-reconcile.functions.ts
 * Reconstrói totais consolidados em daily_work_records a partir de visits
 * e visit_deposits. Fonte usada apenas pela ação "Reconstruir Relatórios"
 * do Admin/Supervisor — Reports continuam consumindo somente DWR.
 *
 * Logs: [REPORT_REBUILD_START|SCAN|APPLY|ERROR|FINISH]
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

interface RebuildInput {
  from: string; // yyyy-mm-dd
  to: string;   // yyyy-mm-dd
  agentId?: string;
}

interface RebuildRow {
  agent_id: string;
  work_date: string;
  before: Record<string, number>;
  after: Record<string, number>;
  updated: boolean;
}

interface RebuildResult {
  scanned: number;
  updated: number;
  rows: RebuildRow[];
}

const DEP_KEYS = ["a1", "a2", "b", "c", "d1", "d2", "e"] as const;

export const rebuildDailyRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: RebuildInput) => {
    if (!input?.from || !input?.to) throw new Error("from/to obrigatórios");
    return input;
  })
  .handler(async ({ data, context }): Promise<RebuildResult> => {
    const { supabase, userId } = context;
    console.log("[REPORT_REBUILD_START]", { from: data.from, to: data.to, agentId: data.agentId ?? null, by: userId });

    const { data: roleRow } = await supabase.rpc("get_user_role", { u_id: userId });
    const role = (roleRow as string) || "agente";
    if (!["admin_master", "coordenador", "supervisor"].includes(role)) {
      throw new Error("Forbidden: requer supervisor ou admin_master");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Data operacional oficial: America/Sao_Paulo (Brasil sem DST → UTC-3 fixo).
    // Precisa bater com public.operational_date() no banco.
    const localDate = (iso: string) => {
      const d = new Date(iso);
      const saoPaulo = new Date(d.getTime() - 3 * 60 * 60 * 1000);
      return saoPaulo.toISOString().slice(0, 10);
    };

    // Range as timestamps covering local days (UTC-3): pad ±1 day for safety.
    const fromTs = `${data.from}T00:00:00.000Z`;
    const toTs = `${data.to}T23:59:59.999Z`;

    let vq = supabaseAdmin
      .from("visits")
      .select("id, agent_id, property_id, visit_date, status, has_focus, treatment_amount, elimination_amount, sample_collected, tubitos_coletados, treated_deposits, is_recovered, cycle_id, week_id")
      .gte("visit_date", fromTs)
      .lte("visit_date", toTs);
    if (data.agentId) vq = vq.eq("agent_id", data.agentId);
    const { data: visits, error: vErr } = await vq;
    if (vErr) throw new Error(vErr.message);

    const vList = (visits ?? []) as any[];
    const allVisitIds = vList.map((v) => v.id);
    let depsAll: any[] = [];
    if (allVisitIds.length > 0) {
      // Batch fetch (chunks of 500 to avoid URL limit)
      for (let i = 0; i < allVisitIds.length; i += 500) {
        const chunk = allVisitIds.slice(i, i + 500);
        const { data: d, error: dErr } = await supabaseAdmin
          .from("visit_deposits")
          .select("visit_id, type_code, quantity, is_positive, is_treated, is_eliminated")
          .in("visit_id", chunk);
        if (dErr) throw new Error(dErr.message);
        depsAll = depsAll.concat(d ?? []);
      }
    }
    const depsByVisit = new Map<string, any[]>();
    for (const d of depsAll) {
      const arr = depsByVisit.get(d.visit_id) ?? [];
      arr.push(d);
      depsByVisit.set(d.visit_id, arr);
    }

    // Group visits by (agent_id, local work_date)
    const groups = new Map<string, { agent_id: string; work_date: string; visits: any[]; cycle_id?: string; week_id?: string }>();
    for (const v of vList) {
      if (!v.agent_id || !v.visit_date) continue;
      const wd = localDate(v.visit_date);
      const key = `${v.agent_id}__${wd}`;
      const g = groups.get(key) ?? { agent_id: v.agent_id, work_date: wd, visits: [] as any[], cycle_id: v.cycle_id, week_id: v.week_id };
      g.visits.push(v);
      if (!g.cycle_id && v.cycle_id) g.cycle_id = v.cycle_id;
      if (!g.week_id && v.week_id) g.week_id = v.week_id;
      groups.set(key, g);
    }

    console.log("[REPORT_REBUILD_SCAN]", { visits: vList.length, groups: groups.size });

    // Preload existing DWRs matching those keys
    const agentIds = Array.from(new Set(Array.from(groups.values()).map((g) => g.agent_id)));
    let existing: any[] = [];
    if (agentIds.length > 0) {
      const { data: exist, error: eErr } = await supabaseAdmin
        .from("daily_work_records")
        .select("*")
        .in("agent_id", agentIds)
        .gte("work_date", data.from)
        .lte("work_date", data.to);
      if (eErr) throw new Error(eErr.message);
      existing = exist ?? [];
    }
    const existingMap = new Map<string, any>();
    for (const r of existing) existingMap.set(`${r.agent_id}__${r.work_date}`, r);

    const rows: RebuildRow[] = [];
    let updated = 0;

    for (const [key, g] of groups) {
      const vs = g.visits;
      const uniqueProps = new Set(vs.map((v) => v.property_id).filter(Boolean));
      const worked = uniqueProps.size;
      const closed = vs.filter((v) => v.status === "closed").length;
      const refused = vs.filter((v) => v.status === "refused").length;
      const recovered = vs.filter((v) => v.is_recovered).length;
      const samples = vs.filter((v) => v.sample_collected).length;
      const tubitos = vs.reduce((a, v) => a + (Number(v.tubitos_coletados) || 0), 0);
      const treatedFromVisits = vs.reduce((a, v) => a + (Number(v.treated_deposits) || 0), 0);
      const larvicideAmount = vs.reduce((a, v) => a + (Number(v.treatment_amount) || 0), 0);
      const elimAmount = vs.reduce((a, v) => a + (Number(v.elimination_amount) || 0), 0);

      const deps: any[] = [];
      for (const v of vs) {
        const dd = depsByVisit.get(v.id);
        if (dd) deps.push(...dd);
      }
      const depsInspected = deps.reduce((a, d) => a + (Number(d.quantity) || 0), 0);
      const depsTreated = deps.filter((d) => d.is_treated).reduce((a, d) => a + (Number(d.quantity) || 0), 0) + treatedFromVisits;
      const depsEliminated = deps.filter((d) => d.is_eliminated).reduce((a, d) => a + (Number(d.quantity) || 0), 0) + elimAmount;

      const byType: Record<string, number> = { a1: 0, a2: 0, b: 0, c: 0, d1: 0, d2: 0, e: 0 };
      const fociByType: Record<string, number> = { a1: 0, a2: 0, b: 0, c: 0, d1: 0, d2: 0, e: 0 };
      for (const d of deps) {
        const k = String(d.type_code || "").toLowerCase();
        if ((DEP_KEYS as readonly string[]).includes(k)) {
          byType[k] += Number(d.quantity) || 0;
          if (d.is_positive) fociByType[k] += Number(d.quantity) || 0;
        }
      }
      const positiveFoci = Object.values(fociByType).reduce((a, b) => a + b, 0) || vs.filter((v) => v.has_focus).length;

      const payload: any = {
        properties_worked: worked,
        properties_closed: closed,
        properties_refused: refused,
        properties_recovered: recovered,
        deposits_inspected: depsInspected,
        deposits_treated: depsTreated,
        deposits_eliminated: depsEliminated,
        positive_foci: positiveFoci,
        samples_collected: samples,
        tubitos_collected: tubitos,
        larvicide_amount: larvicideAmount,
        deposits_a1: byType.a1,
        deposits_a2: byType.a2,
        deposits_b: byType.b,
        deposits_c: byType.c,
        deposits_d1: byType.d1,
        deposits_d2: byType.d2,
        deposits_e: byType.e,
        deposits_by_type: byType,
        foci_by_type: fociByType,
        updated_at: new Date().toISOString(),
      };

      const existingRow = existingMap.get(key);
      const before = {
        properties_worked: Number(existingRow?.properties_worked) || 0,
        properties_closed: Number(existingRow?.properties_closed) || 0,
        deposits_inspected: Number(existingRow?.deposits_inspected) || 0,
        deposits_treated: Number(existingRow?.deposits_treated) || 0,
        positive_foci: Number(existingRow?.positive_foci) || 0,
      };
      const after = {
        properties_worked: worked,
        properties_closed: closed,
        deposits_inspected: depsInspected,
        deposits_treated: depsTreated,
        positive_foci: positiveFoci,
      };

      if (existingRow) {
        const changed = (Object.keys(after) as (keyof typeof after)[]).some((k) => before[k] !== after[k]);
        if (changed) {
          const { error: uErr } = await supabaseAdmin
            .from("daily_work_records")
            .update(payload)
            .eq("id", existingRow.id);
          if (uErr) {
            console.error("[REPORT_REBUILD_ERROR]", { dwr_id: existingRow.id, message: uErr.message });
            throw new Error(uErr.message);
          }
          updated++;
          console.log("[REPORT_REBUILD_APPLY]", { work_date: g.work_date, agent_id: g.agent_id, before, after });
        }
        rows.push({ agent_id: g.agent_id, work_date: g.work_date, before, after, updated: changed });
      } else {
        // Missing DWR: create one. Data operacional derivada 100% em America/Sao_Paulo.
        const todayOp = localDate(new Date().toISOString());
        const epi = epiWeekFromDate(g.work_date);
        const insert = {
          ...payload,
          agent_id: g.agent_id,
          legacy_agent_id: g.agent_id,
          work_date: g.work_date,
          cycle_id: g.cycle_id ?? null,
          week_id: g.week_id ?? null,
          status: "completed",
          is_retroactive: g.work_date < todayOp,
          epi_week: epi.week,
          epi_year: epi.year,
        };
        const { error: iErr } = await supabaseAdmin
          .from("daily_work_records")
          .insert(insert);
        if (iErr) {
          console.error("[REPORT_REBUILD_ERROR]", { work_date: g.work_date, agent_id: g.agent_id, message: iErr.message });
          throw new Error(iErr.message);
        }
        updated++;
        console.log("[REPORT_REBUILD_APPLY]", { work_date: g.work_date, agent_id: g.agent_id, before, after, created: true });
        rows.push({ agent_id: g.agent_id, work_date: g.work_date, before, after, updated: true });
      }
    }

    console.log("[REPORT_REBUILD_FINISH]", { scanned: groups.size, updated });
    return { scanned: groups.size, updated, rows };
  });

