/**
 * production-integrity.ts
 *
 * Auditoria automática executada ao encerrar uma jornada.
 * Compara os totais entre camadas (snapshot local → visitas servidor →
 * daily_work_record → agregados) e reporta divergências.
 *
 * Logs:
 *   [PRODUCTION_INTEGRITY_START]
 *   [PRODUCTION_INTEGRITY_COMPARE]
 *   [PRODUCTION_INTEGRITY_ERROR]
 *   [PRODUCTION_INTEGRITY_FINISH]
 *
 * Nunca bloqueia — apenas relata.
 */
import { supabase } from "@/integrations/supabase/client";
import { isOnline } from "@/lib/offline/safe-fetch";

export interface IntegrityDivergence {
  field: string;
  expectedFrom: string;
  expectedValue: number;
  foundIn: string;
  foundValue: number;
}

export interface ProductionIntegrityReport {
  score: number; // 0–100
  totalChecks: number;
  divergences: IntegrityDivergence[];
  ok: boolean;
  generatedAt: string;
  agentId: string;
  workDate: string;
  cycleId: string | null;
}

export interface IntegritySnapshotInput {
  workedCount: number;
  closedCount: number;
  refusedCount: number;
  visitedCount: number;
  focusCount: number;
  depInspected: number;
  depByType: Record<string, number>;
  fociByType: Record<string, number>;
  strategicPointsWorked: number;
}

export interface ProductionIntegrityInput {
  agentId: string;
  workDate: string; // YYYY-MM-DD
  cycleId: string | null;
  snapshot: IntegritySnapshotInput;
}

function compare(
  field: string,
  expectedFrom: string,
  expectedValue: number,
  foundIn: string,
  foundValue: number,
  out: IntegrityDivergence[],
) {
  const a = Number(expectedValue) || 0;
  const b = Number(foundValue) || 0;
  console.log("[PRODUCTION_INTEGRITY_COMPARE]", { field, expectedFrom, expectedValue: a, foundIn, foundValue: b });
  if (a !== b) {
    const div = { field, expectedFrom, expectedValue: a, foundIn, foundValue: b };
    console.error("[PRODUCTION_INTEGRITY_ERROR]", div);
    out.push(div);
  }
}

export async function runProductionIntegrity(
  input: ProductionIntegrityInput,
): Promise<ProductionIntegrityReport> {
  const { agentId, workDate, cycleId, snapshot } = input;
  console.log("[PRODUCTION_INTEGRITY_START]", { agentId, workDate, cycleId });

  const divergences: IntegrityDivergence[] = [];
  const startOfDay = `${workDate}T00:00:00`;
  const endOfDay = `${workDate}T23:59:59.999`;
  let totalChecks = 0;

  try {
    if (!isOnline()) {
      console.warn("[PRODUCTION_INTEGRITY_ERROR]", { reason: "offline", agentId, workDate });
    } else {
      // Visitas do servidor
      let vq = supabase
        .from("visits")
        .select("id, status, has_focus, property_id")
        .eq("agent_id", agentId)
        .gte("visit_date", startOfDay)
        .lte("visit_date", endOfDay);
      if (cycleId) vq = vq.eq("cycle_id", cycleId);
      const { data: visits, error: vErr } = await vq;
      if (vErr) throw vErr;

      const v = visits || [];
      const worked = v.length;
      const closed = v.filter((x) => x.status === "closed").length;
      const refused = v.filter((x) => x.status === "refused").length;
      const visited = v.filter((x) => x.status === "visited").length;
      const focus = v.filter((x) => x.has_focus).length;

      totalChecks += 5;
      compare("properties_worked", "snapshot(local)", snapshot.workedCount, "visits(server)", worked, divergences);
      compare("properties_closed", "snapshot(local)", snapshot.closedCount, "visits(server)", closed, divergences);
      compare("properties_refused", "snapshot(local)", snapshot.refusedCount, "visits(server)", refused, divergences);
      compare("properties_visited", "snapshot(local)", snapshot.visitedCount, "visits(server)", visited, divergences);
      compare("positive_foci", "snapshot(local)", snapshot.focusCount, "visits(server)", focus, divergences);

      // Depósitos do servidor
      if (v.length > 0) {
        const { data: deps, error: dErr } = await supabase
          .from("visit_deposits")
          .select("visit_id, type_code, quantity, is_positive")
          .in("visit_id", v.map((x) => x.id));
        if (dErr) throw dErr;
        const depTotal = (deps || []).reduce((a, d) => a + (Number(d.quantity) || 0), 0);
        totalChecks += 1;
        compare("deposits_total", "snapshot(local)", snapshot.depInspected, "visit_deposits(server)", depTotal, divergences);
      }

      // Daily Work Record
      const { data: dwr } = await supabase
        .from("daily_work_records")
        .select("properties_worked, properties_closed, properties_refused, positive_foci, deposits_inspected")
        .eq("legacy_agent_id", agentId)
        .eq("work_date", workDate)
        .maybeSingle();
      if (dwr) {
        totalChecks += 5;
        compare("dwr.properties_worked", "snapshot(local)", snapshot.workedCount, "daily_work_records", dwr.properties_worked ?? 0, divergences);
        compare("dwr.properties_closed", "snapshot(local)", snapshot.closedCount, "daily_work_records", dwr.properties_closed ?? 0, divergences);
        compare("dwr.properties_refused", "snapshot(local)", snapshot.refusedCount, "daily_work_records", dwr.properties_refused ?? 0, divergences);
        compare("dwr.positive_foci", "snapshot(local)", snapshot.focusCount, "daily_work_records", dwr.positive_foci ?? 0, divergences);
        compare("dwr.deposits_inspected", "snapshot(local)", snapshot.depInspected, "daily_work_records", dwr.deposits_inspected ?? 0, divergences);
      }
    }
  } catch (e: any) {
    console.error("[PRODUCTION_INTEGRITY_ERROR]", { reason: "exception", message: e?.message });
  }

  const failed = divergences.length;
  const score = totalChecks > 0 ? Math.max(0, Math.round(((totalChecks - failed) / totalChecks) * 100)) : 100;
  const report: ProductionIntegrityReport = {
    score,
    totalChecks,
    divergences,
    ok: failed === 0,
    generatedAt: new Date().toISOString(),
    agentId,
    workDate,
    cycleId,
  };
  console.log("[PRODUCTION_INTEGRITY_FINISH]", {
    score, totalChecks, divergences: failed, ok: report.ok,
  });
  return report;
}
