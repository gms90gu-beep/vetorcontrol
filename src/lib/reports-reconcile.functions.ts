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

    // 1. Buscar DWRs no intervalo
    let dwrQuery = supabaseAdmin
      .from("daily_work_records")
      .select("*")
      .gte("work_date", data.from)
      .lte("work_date", data.to);
    if (data.agentId) dwrQuery = dwrQuery.eq("agent_id", data.agentId);
    const { data: dwrs, error: dwrErr } = await dwrQuery;
    if (dwrErr) throw new Error(dwrErr.message);

    console.log("[REPORT_REBUILD_SCAN]", { dwrs: (dwrs ?? []).length });

    const rows: RebuildRow[] = [];
    let updated = 0;

    for (const r of (dwrs ?? []) as any[]) {
      // Faixa do dia local (UTC-3) — usar dia inteiro em UTC para simplificar
      const dayStart = `${r.work_date}T00:00:00.000Z`;
      const dayEnd = `${r.work_date}T23:59:59.999Z`;

      const { data: visits, error: vErr } = await supabaseAdmin
        .from("visits")
        .select("id, property_id, status, has_focus, treatment_applied, treatment_amount, elimination_done, elimination_amount, sample_collected, tubitos_coletados, treated_deposits, is_recovered")
        .eq("agent_id", r.agent_id)
        .gte("visit_date", dayStart)
        .lte("visit_date", dayEnd);
      if (vErr) throw new Error(vErr.message);

      const vList = visits ?? [];
      const visitIds = vList.map((v: any) => v.id);

      let deps: any[] = [];
      if (visitIds.length > 0) {
        const { data: d, error: dErr } = await supabaseAdmin
          .from("visit_deposits")
          .select("visit_id, type_code, quantity, is_positive, is_treated, is_eliminated")
          .in("visit_id", visitIds);
        if (dErr) throw new Error(dErr.message);
        deps = d ?? [];
      }

      const uniqueProps = new Set(vList.map((v: any) => v.property_id).filter(Boolean));
      const worked = uniqueProps.size;
      const closed = vList.filter((v: any) => v.status === "closed").length;
      const refused = vList.filter((v: any) => v.status === "refused").length;
      const recovered = vList.filter((v: any) => v.is_recovered).length;
      const focus = vList.filter((v: any) => v.has_focus).length;
      const samples = vList.filter((v: any) => v.sample_collected).length;
      const tubitos = vList.reduce((a: number, v: any) => a + (Number(v.tubitos_coletados) || 0), 0);
      const treatedFromVisits = vList.reduce((a: number, v: any) => a + (Number(v.treated_deposits) || 0), 0);
      const larvicideAmount = vList.reduce((a: number, v: any) => a + (Number(v.treatment_amount) || 0), 0);
      const elimAmount = vList.reduce((a: number, v: any) => a + (Number(v.elimination_amount) || 0), 0);

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
      const positiveFoci = Object.values(fociByType).reduce((a, b) => a + b, 0) || vList.filter((v: any) => v.has_focus).length;

      const before = {
        properties_worked: Number(r.properties_worked) || 0,
        properties_closed: Number(r.properties_closed) || 0,
        deposits_inspected: Number(r.deposits_inspected) || 0,
        deposits_treated: Number(r.deposits_treated) || 0,
        positive_foci: Number(r.positive_foci) || 0,
      };
      const after = {
        properties_worked: worked,
        properties_closed: closed,
        deposits_inspected: depsInspected,
        deposits_treated: depsTreated,
        positive_foci: positiveFoci,
      };

      const changed = (Object.keys(after) as (keyof typeof after)[]).some((k) => before[k] !== after[k]);
      if (changed) {
        const { error: uErr } = await supabaseAdmin
          .from("daily_work_records")
          .update({
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
          })
          .eq("id", r.id);
        if (uErr) {
          console.error("[REPORT_REBUILD_ERROR]", { dwr_id: r.id, message: uErr.message });
          throw new Error(uErr.message);
        }
        updated++;
        console.log("[REPORT_REBUILD_APPLY]", { work_date: r.work_date, agent_id: r.agent_id, before, after });
      }

      rows.push({ agent_id: r.agent_id, work_date: r.work_date, before, after, updated: changed });
    }

    console.log("[REPORT_REBUILD_FINISH]", { scanned: (dwrs ?? []).length, updated });
    return { scanned: (dwrs ?? []).length, updated, rows };
  });
