/**
 * reports-reconcile.functions.ts
 * Reconstrói totais consolidados em daily_work_records a partir de visits
 * e visit_deposits. Fonte usada pela ação "Reconstruir Relatórios" para
 * gestão e pela recuperação limitada aos próprios dados para agentes.
 *
 * Logs: [REPORT_REBUILD_START|SCAN|APPLY|ERROR|FINISH]
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getEpiWeek } from "@/lib/cycle-week";
import { getOperationalDate, operationalDateBoundsUtcIso, toOperationalDate } from "@/lib/operational-date";
import { getRebuildAuthorizationError } from "@/lib/reports-reconcile-policy";
import { readAllQueryPages } from "@/lib/query-pages";
import { confirmedFocusVisitIds } from "@/lib/confirmed-focus";
import { resolvePermittedAgentIds, normalizeOperationalRole } from "@/lib/team-scope";

interface RebuildInput {
  from: string; // yyyy-mm-dd
  to: string;   // yyyy-mm-dd
  agentId?: string;
  cycleId?: string | null;
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

    const { data: roleRow, error: roleError } = await supabase.rpc("get_user_role", { u_id: userId });
    if (roleError) throw roleError;
    const role = normalizeOperationalRole(roleRow as string);
    const permittedIds = await resolvePermittedAgentIds(supabase, userId, role, data.agentId);
    const authorizationError = getRebuildAuthorizationError({
      role,
      userId,
      agentId: data.agentId,
      from: data.from,
      to: data.to,
      today: getOperationalDate(),
      supervisedAgentIds: role === "supervisor" ? permittedIds ?? [] : undefined,
    });
    if (authorizationError) throw new Error(authorizationError);
    if (permittedIds?.length === 0) return { scanned: 0, updated: 0, rows: [] };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    try {
      // Data operacional oficial: America/Sao_Paulo (Brasil sem DST → UTC-3 fixo).
      const localDate = (iso: string) => toOperationalDate(iso);

      const fromTs = operationalDateBoundsUtcIso(data.from).startIso;
      const toTs = operationalDateBoundsUtcIso(data.to).endIso;

      let vq = supabaseAdmin
        .from("visits")
        .select("id, agent_id, property_id, visit_date, status, has_focus, treatment_amount, elimination_amount, sample_collected, tubitos_coletados, treated_deposits, is_recovered, cycle_id, week_id")
        .gte("visit_date", fromTs)
        .lte("visit_date", toTs);
      if (permittedIds) vq = vq.in("agent_id", permittedIds);
      if (data.cycleId) vq = vq.eq("cycle_id", data.cycleId);
      const visits = await readAllQueryPages(vq.order("id"));

      const vList = (visits ?? []) as any[];
      const allVisitIds = vList.map((v) => v.id);
      let depsAll: any[] = [];
      if (allVisitIds.length > 0) {
        for (let i = 0; i < allVisitIds.length; i += 500) {
          const chunk = allVisitIds.slice(i, i + 500);
          const d = await readAllQueryPages(supabaseAdmin
            .from("visit_deposits")
            .select("visit_id, type_code, quantity, is_positive, is_treated, is_eliminated")
            .in("visit_id", chunk).order("id"));
          depsAll = depsAll.concat(d ?? []);
        }
      }
      const depsByVisit = new Map<string, any[]>();
      for (const d of depsAll) {
        const arr = depsByVisit.get(d.visit_id) ?? [];
        arr.push(d);
        depsByVisit.set(d.visit_id, arr);
      }

      const groups = new Map<string, { agent_id: string; work_date: string; visits: any[]; cycle_id?: string; week_id?: string }>();
      for (const v of vList) {
        if (!v.agent_id || !v.visit_date) continue;
        const wd = localDate(v.visit_date);
        if (!wd) continue;
        const key = `${v.agent_id}__${wd}`;
        const g = groups.get(key) ?? { agent_id: v.agent_id, work_date: wd, visits: [] as any[], cycle_id: v.cycle_id, week_id: v.week_id };
        g.visits.push(v);
        if (!g.cycle_id && v.cycle_id) g.cycle_id = v.cycle_id;
        if (!g.week_id && v.week_id) g.week_id = v.week_id;
        groups.set(key, g);
      }

      console.log("[REPORT_REBUILD_SCAN]", { visits: vList.length, groups: groups.size });

      const agentIds = Array.from(new Set(Array.from(groups.values()).map((g) => g.agent_id)));
      const { data: legacyAgents, error: legacyError } = agentIds.length
        ? await supabaseAdmin.from("agents").select("id, profile_id").in("profile_id", agentIds)
        : { data: [], error: null };
      if (legacyError) throw legacyError;
      const legacyByProfile = new Map((legacyAgents ?? []).map((agent) => [agent.profile_id, agent.id]));
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
        if (!legacyByProfile.get(g.agent_id)) throw new Error("Agente sem vínculo cadastral; reconstrução bloqueada.");
        const currentRow = existingMap.get(key);
        if (data.cycleId && currentRow && currentRow.cycle_id !== data.cycleId) {
          throw new Error("Registro diário pertence a outro ciclo; reconstrução bloqueada para preservar a produção.");
        }
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
        const positiveVisitIds = confirmedFocusVisitIds(deps);
        for (const d of deps) {
          const k = String(d.type_code || "").toLowerCase();
          if ((DEP_KEYS as readonly string[]).includes(k)) {
            byType[k] += Number(d.quantity) || 0;
            if (d.is_positive && positiveVisitIds.has(d.visit_id)) fociByType[k] += Number(d.quantity) || 0;
          }
        }
        const positiveFoci = Object.values(fociByType).reduce((a, b) => a + b, 0) || positiveVisitIds.size;

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
            if (uErr) throw new Error(uErr.message);
            updated++;
            console.log("[REPORT_REBUILD_APPLY]", { work_date: g.work_date, agent_id: g.agent_id, before, after });
          }
          rows.push({ agent_id: g.agent_id, work_date: g.work_date, before, after, updated: changed });
        } else {
          const todayOp = getOperationalDate();
          const [epiY, epiM, epiD] = g.work_date.split("-").map(Number);
          const epi = getEpiWeek(new Date(epiY, epiM - 1, epiD));
          const insert = {
            ...payload,
            agent_id: g.agent_id,
            legacy_agent_id: legacyByProfile.get(g.agent_id),
            start_time: vs.map((v) => v.visit_date).sort()[0],
            end_time: vs.map((v) => v.visit_date).sort().at(-1),
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
          if (iErr) throw new Error(iErr.message);
          updated++;
          console.log("[REPORT_REBUILD_APPLY]", { work_date: g.work_date, agent_id: g.agent_id, before, after, created: true });
          rows.push({ agent_id: g.agent_id, work_date: g.work_date, before, after, updated: true });
        }
      }

      await supabaseAdmin.from("audit_log").insert({
        action: "rebuild_daily_work_records",
        entity: "system",
        actor_id: userId,
        metadata: {
          from: data.from,
          to: data.to,
          agent: data.agentId || null,
          scanned: groups.size,
          updated,
          source: "rebuildDailyRecords (TS)",
          tz: "America/Sao_Paulo",
        },
      });

      console.log("[REPORT_REBUILD_FINISH]", { scanned: groups.size, updated });
      return { scanned: groups.size, updated, rows };

    } catch (err: any) {
      const { supabaseAdmin: adminForAudit } = await import("@/integrations/supabase/client.server");
      console.error("[REPORT_REBUILD_ERROR]", err);
      await adminForAudit.from("audit_log").insert({
        action: "dwr_reconciliation_failed",
        entity: "daily_work_records",
        actor_id: userId,
        target_id: data.agentId || null,
        metadata: {
          from: data.from,
          to: data.to,
          agent_id: data.agentId || null,
          cycle_id: data.cycleId || null,
          error: err.message || String(err),
          source: "rebuildDailyRecords (TS)",
        },
      });
      throw err;
    }
  });
