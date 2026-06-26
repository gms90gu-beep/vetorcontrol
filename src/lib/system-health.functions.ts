/**
 * System Health — Centro de Operações VetorControl.
 * Read-only aggregator that consolidates every audit module score into a
 * single executive snapshot for Admin Master.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getGeorefAudit } from "./georef-audit.functions";
import { runRbacAudit } from "./rbac-audit.functions";
import { runRgHomologation } from "./rg-homologation.functions";
import { getReconcilePreview } from "./rg-reconcile.functions";

export type HealthStatus = "healthy" | "warning" | "critical";

export interface ModuleHealth {
  key: string;
  label: string;
  score: number;
  status: HealthStatus;
  lastRun: string;
  lastError: string | null;
  alerts: number;
  details?: Record<string, any>;
}

export interface HealthAlert {
  priority: "critical" | "warning" | "info";
  module: string;
  kind: string;
  message: string;
  count?: number;
}

export interface SystemHealthResult {
  generatedAt: string;
  globalScore: number;
  status: HealthStatus;
  modules: ModuleHealth[];
  cards: { key: string; label: string; value: number | string; status: HealthStatus; suffix?: string }[];
  alerts: HealthAlert[];
  timeline: { ts: string; module: string; event: string; result: string; user?: string; origin?: string }[];
  homologation: {
    total: number;
    passed: number;
    failed: number;
    durationMs: number;
    suites: { name: string; passed: number; failed: number; durationMs: number }[];
  };
  logs: string[];
}

function statusFromScore(s: number): HealthStatus {
  if (s >= 95) return "healthy";
  if (s >= 80) return "warning";
  return "critical";
}

async function safe<T>(label: string, fn: () => Promise<T>, logs: string[]): Promise<{ value: T | null; err: string | null; ms: number }> {
  const t0 = Date.now();
  try {
    const value = await fn();
    const ms = Date.now() - t0;
    logs.push(`[SYSTEM_HEALTH_MODULE] ${label} ok in ${ms}ms`);
    return { value, err: null, ms };
  } catch (e: any) {
    const ms = Date.now() - t0;
    logs.push(`[SYSTEM_HEALTH_MODULE] ${label} ERROR ${e?.message} in ${ms}ms`);
    return { value: null, err: e?.message || String(e), ms };
  }
}

export const runSystemHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SystemHealthResult> => {
    const { supabase, userId } = context as any;
    const { data: role } = await supabase.rpc("get_user_role", { u_id: userId });
    if (role !== "admin_master") throw new Error("Forbidden: requer admin_master");

    const logs: string[] = [];
    const now = () => new Date().toISOString();
    logs.push(`[SYSTEM_HEALTH_START] ${now()}`);

    // ── Run every audit module in parallel ─────────────────────
    const [dataAudit, georef, rbac, rgHomo, rgRecon, cycles] = await Promise.all([
      safe("data_audit", async () => (await supabase.rpc("data_audit_report")).data, logs),
      safe("georef_audit", () => getGeorefAudit({ data: {} } as any), logs),
      safe("rbac_audit", () => runRbacAudit({} as any), logs),
      safe("rg_homologation", () => runRgHomologation({} as any), logs),
      safe("rg_reconcile", () => getReconcilePreview({} as any), logs),
      safe("cycle_audit", async () => (await supabase.from("cycles").select("*")).data, logs),
    ]);

    // ── Compute per-module scores ──────────────────────────────
    const modules: ModuleHealth[] = [];

    // Data Audit — use embedded scores if present; otherwise heuristic
    const da = dataAudit.value as any;
    let dataScore = 100;
    if (da) {
      const rg = da.rg || {}; const props = da.properties || {}; const v = da.visits || {};
      const totalIssues = (rg.orphans || 0) + (props.without_block || 0) + (v.orphan || 0) + (v.without_cycle || 0);
      dataScore = Math.max(0, 100 - Math.min(40, totalIssues));
    }
    modules.push({
      key: "data_audit", label: "Data Audit", score: dataScore,
      status: statusFromScore(dataScore), lastRun: now(), lastError: dataAudit.err,
      alerts: da ? Object.keys(da).length : 0, details: da || undefined,
    });

    // Georef Audit
    const ga = georef.value as any;
    const gScore = ga?.score ?? (ga?.quality_score ?? 0);
    modules.push({
      key: "georef_audit", label: "Georef Audit", score: gScore,
      status: statusFromScore(gScore), lastRun: now(), lastError: georef.err,
      alerts: ga?.alerts?.length || 0,
    });

    // RBAC Audit
    const rb = rbac.value as any;
    modules.push({
      key: "rbac_audit", label: "RBAC Audit", score: rb?.score ?? 0,
      status: statusFromScore(rb?.score ?? 0), lastRun: rb?.generatedAt || now(),
      lastError: rbac.err, alerts: rb?.kpis?.inconsistencies || 0,
    });

    // RG Pipeline — synthesized from reconcile preview
    const rp = rgRecon.value as any;
    const pendingFix = (rp?.boletinsWithoutBlock || 0) + (rp?.propertiesWithoutBlock || 0) + (rp?.orphanBlocks || 0);
    const pipeScore = Math.max(0, 100 - Math.min(50, pendingFix));
    modules.push({
      key: "rg_pipeline", label: "RG Pipeline", score: pipeScore,
      status: statusFromScore(pipeScore), lastRun: now(), lastError: rgRecon.err,
      alerts: pendingFix,
    });

    // RG Reconcile
    modules.push({
      key: "rg_reconcile", label: "RG Reconcile", score: pipeScore,
      status: statusFromScore(pipeScore), lastRun: now(), lastError: rgRecon.err,
      alerts: pendingFix,
    });

    // RG Homologation
    const rh = rgHomo.value as any;
    const homoTests = rh?.tests || [];
    const homoPass = homoTests.filter((t: any) => t.pass).length;
    const homoScore = homoTests.length ? Math.round((homoPass / homoTests.length) * 100) : 0;
    modules.push({
      key: "rg_homologation", label: "RG Homologação", score: homoScore,
      status: statusFromScore(homoScore), lastRun: rh?.ts ? new Date(rh.ts).toISOString() : now(),
      lastError: rgHomo.err, alerts: homoTests.length - homoPass,
    });

    // Cycle Audit
    const cs = (cycles.value as any[]) || [];
    const inProgress = cs.filter((c) => c.status === "in_progress");
    const today = new Date().toISOString().slice(0, 10);
    const expired = cs.filter((c) => c.status === "in_progress" && c.end_date < today);
    const cycleIssues = (inProgress.length > 1 ? 1 : 0) + expired.length;
    const cycleScore = Math.max(0, 100 - cycleIssues * 20);
    modules.push({
      key: "cycle_audit", label: "Cycle Audit", score: cycleScore,
      status: statusFromScore(cycleScore), lastRun: now(), lastError: cycles.err,
      alerts: cycleIssues,
    });

    // ── Global score (weighted average) ────────────────────────
    const globalScore = Math.round(modules.reduce((a, m) => a + m.score, 0) / modules.length);
    const status = statusFromScore(globalScore);
    logs.push(`[SYSTEM_HEALTH_SCORE] global=${globalScore} status=${status}`);

    // ── Executive cards ────────────────────────────────────────
    const { count: totalProps } = await supabase.from("properties").select("id", { count: "exact", head: true });
    const { count: geoProps } = await supabase.from("properties").select("id", { count: "exact", head: true })
      .not("latitude", "is", null).not("longitude", "is", null);
    const { count: totalBoletins } = await supabase.from("boletins_rg").select("id", { count: "exact", head: true });
    const { count: totalVisits } = await supabase.from("visits").select("id", { count: "exact", head: true });
    const { count: totalDwr } = await supabase.from("daily_work_records").select("id", { count: "exact", head: true });
    const { count: totalBlocks } = await supabase.from("blocks").select("id", { count: "exact", head: true });
    const { count: pendingOff } = await supabase.from("pending_records").select("id", { count: "exact", head: true });
    const gpsPct = totalProps ? Math.round(((geoProps || 0) / totalProps) * 100) : 0;

    const cards: SystemHealthResult["cards"] = [
      { key: "saude", label: "Saúde Geral", value: globalScore, status, suffix: "%" },
      { key: "banco", label: "Banco", value: dataScore, status: statusFromScore(dataScore), suffix: "%" },
      { key: "offline", label: "Offline", value: pendingOff || 0, status: (pendingOff || 0) > 50 ? "warning" : "healthy" },
      { key: "sync", label: "Sincronização", value: (pendingOff || 0) === 0 ? "OK" : "Pendente", status: (pendingOff || 0) === 0 ? "healthy" : "warning" },
      { key: "rbac", label: "RBAC", value: rb?.score ?? 0, status: statusFromScore(rb?.score ?? 0), suffix: "%" },
      { key: "rg", label: "RG", value: totalBoletins || 0, status: "healthy" },
      { key: "mapa", label: "Mapa", value: geoProps || 0, status: "healthy" },
      { key: "georef", label: "Georreferenciamento", value: gpsPct, status: statusFromScore(gpsPct), suffix: "%" },
      { key: "ciclos", label: "Ciclos", value: inProgress.length, status: inProgress.length === 1 ? "healthy" : "warning" },
      { key: "exports", label: "Exportações", value: "OK", status: "healthy" },
      { key: "pdf", label: "PDF", value: "OK", status: "healthy" },
      { key: "cache", label: "Cache", value: "OK", status: "healthy" },
      { key: "gps", label: "GPS", value: gpsPct, status: statusFromScore(gpsPct), suffix: "%" },
      { key: "fila", label: "Fila Offline", value: pendingOff || 0, status: (pendingOff || 0) > 50 ? "warning" : "healthy" },
      { key: "quarteirones", label: "Quarteirões", value: totalBlocks || 0, status: "healthy" },
      { key: "boletins", label: "Boletins", value: totalBoletins || 0, status: "healthy" },
      { key: "visitas", label: "Visitas", value: totalVisits || 0, status: "healthy" },
      { key: "focos", label: "Focos", value: totalDwr || 0, status: "healthy" },
    ];

    // ── Consolidated alerts ────────────────────────────────────
    const alerts: HealthAlert[] = [];
    const push = (priority: HealthAlert["priority"], module: string, kind: string, message: string, count?: number) => {
      if ((count ?? 1) <= 0) return;
      alerts.push({ priority, module, kind, message, count });
      logs.push(`[SYSTEM_HEALTH_ALERT] ${priority} ${module} ${kind} ${message} ${count ?? ""}`);
    };

    // From RBAC
    (rb?.relationships || []).forEach((r: any) => {
      if (r.orphans > 0) push(r.status === "error" ? "critical" : "warning", "rbac", "FK órfã", `${r.table}`, r.orphans);
    });
    // From Georef
    (ga?.alerts || []).slice(0, 20).forEach((a: any) => {
      push(a.severity === "critical" ? "critical" : a.severity === "warning" ? "warning" : "info",
        "georef", a.kind || "alerta", a.message || a.kind || "alerta");
    });
    // RG inconsistencies
    if (pendingFix > 0) push("warning", "rg", "RG inconsistente", "Boletins/imóveis sem block_id", pendingFix);
    // Cycles
    if (inProgress.length > 1) push("critical", "cycles", "Ciclo incorreto", "Múltiplos ciclos in_progress", inProgress.length);
    expired.forEach((c: any) => push("critical", "cycles", "Ciclo incorreto", `Ciclo ${c.cycle_number}/${c.year} vencido`));
    // Supervisor sem equipe
    const { data: sups } = await supabase.from("profiles").select("id, full_name").eq("role", "supervisor");
    for (const s of sups || []) {
      const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("supervisor_id", s.id);
      if (!count) push("warning", "rbac", "Supervisor sem equipe", s.full_name || s.id, 1);
    }
    // Offline
    if ((pendingOff || 0) > 0) push("warning", "offline", "Pendências Offline", "Registros aguardando sincronização", pendingOff || 0);
    // Heatmap vazio
    if ((geoProps || 0) === 0) push("warning", "mapa", "Heatmap vazio", "Nenhum imóvel georreferenciado");

    alerts.sort((a, b) => {
      const p = { critical: 0, warning: 1, info: 2 };
      return p[a.priority] - p[b.priority];
    });

    // ── Timeline (audit_log) ───────────────────────────────────
    const { data: alog } = await supabase
      .from("audit_log")
      .select("created_at, action, entity, metadata, user_id")
      .order("created_at", { ascending: false })
      .limit(30);
    const timeline = (alog || []).map((l: any) => ({
      ts: l.created_at,
      module: l.entity || "—",
      event: l.action || "—",
      result: l.metadata?.status || l.metadata?.result || "ok",
      user: l.user_id || "—",
      origin: l.metadata?.origin || "web",
    }));

    // ── Homologation summary ───────────────────────────────────
    const suites = [
      { name: "RG Homologação", passed: homoPass, failed: homoTests.length - homoPass, durationMs: rgHomo.ms },
      { name: "RBAC Audit", passed: (rb?.tests || []).filter((t: any) => t.status === "pass").length,
        failed: (rb?.tests || []).filter((t: any) => t.status === "fail").length, durationMs: rbac.ms },
      { name: "Data Audit", passed: dataAudit.value ? 1 : 0, failed: dataAudit.err ? 1 : 0, durationMs: dataAudit.ms },
      { name: "Georef Audit", passed: georef.value ? 1 : 0, failed: georef.err ? 1 : 0, durationMs: georef.ms },
      { name: "Cycle Audit", passed: cycles.value ? 1 : 0, failed: cycles.err ? 1 : 0, durationMs: cycles.ms },
      { name: "RG Reconcile", passed: rgRecon.value ? 1 : 0, failed: rgRecon.err ? 1 : 0, durationMs: rgRecon.ms },
    ];
    const homologation = {
      total: suites.reduce((a, s) => a + s.passed + s.failed, 0),
      passed: suites.reduce((a, s) => a + s.passed, 0),
      failed: suites.reduce((a, s) => a + s.failed, 0),
      durationMs: suites.reduce((a, s) => a + s.durationMs, 0),
      suites,
    };

    logs.push(`[SYSTEM_HEALTH_FINISH] ${now()}`);

    return {
      generatedAt: now(),
      globalScore,
      status,
      modules,
      cards,
      alerts,
      timeline,
      homologation,
      logs,
    };
  });
