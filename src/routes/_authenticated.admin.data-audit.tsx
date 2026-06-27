import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { safeFetch, isOnline } from "@/lib/offline/safe-fetch";
import { db } from "@/db/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  RefreshCw, Download, ShieldCheck, AlertTriangle, CheckCircle2, Wrench,
  MapPin, Users, Layers, Home as HomeIcon, ClipboardList, Wifi, Calendar, Bug, Activity,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/data-audit")({
  component: DataAuditPage,
});

type Report = Record<string, any>;
type ModuleKey = "rg" | "properties" | "gps" | "visits" | "foci" | "users" | "cycles" | "offline";

const MODULE_LABEL: Record<ModuleKey, string> = {
  rg: "RG", properties: "Imóveis", gps: "GPS", visits: "Visitas",
  foci: "Focos", users: "Usuários", cycles: "Ciclos", offline: "Offline",
};

function pct(part: number, total: number) {
  if (!total) return 100;
  return Math.round((part / total) * 1000) / 10;
}

function moduleScores(report: Report | null, offline: { pending: number; errors: number }) {
  const r = report || {};
  const rg = r.rg || {}, p = r.properties || {}, g = r.gps || {}, v = r.visits || {};
  const f = r.foci || {}, u = r.users || {}, c = r.cycles || {};
  const safe = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  return {
    rg: safe(rg.total_blocks ? pct(rg.blocks_with_properties, rg.total_blocks) : 100),
    properties: safe(p.total
      ? 100 - pct((p.without_block || 0) + (p.without_street || 0) + (p.without_number || 0) + (p.duplicates || 0), p.total)
      : 100),
    gps: safe(g.total ? pct(g.geocoded, g.total) : 100),
    visits: safe(v.total
      ? 100 - pct((v.without_property || 0) + (v.without_agent || 0) + (v.orphan || 0) + (v.without_cycle || 0), v.total)
      : 100),
    foci: safe(f.deposits_total
      ? 100 - pct((f.positive_without_deposit || 0) + (f.positive_deposit_without_visit || 0) + (f.deposit_without_type || 0), f.deposits_total)
      : 100),
    users: safe(u.total
      ? 100 - pct((u.agents_without_supervisor || 0) + (u.duplicated_emails || 0), u.total)
      : 100),
    cycles: (c.multiple_in_progress || (c.expired_in_progress || 0) > 0) ? 60 : 100,
    offline: offline.errors > 0 ? 60 : offline.pending > 50 ? 80 : 100,
  } as Record<ModuleKey, number>;
}

function scoreColor(score: number) {
  if (score >= 95) return { dot: "🟢", cls: "text-emerald-600", bar: "bg-emerald-500" };
  if (score >= 80) return { dot: "🟡", cls: "text-amber-600", bar: "bg-amber-500" };
  return { dot: "🔴", cls: "text-red-600", bar: "bg-red-500" };
}

type Severity = "critical" | "high" | "medium" | "low";
type Alert = { sev: Severity; module: ModuleKey; label: string; count: number };

function buildAlerts(report: Report | null, offline: { pending: number; errors: number }): Alert[] {
  const r = report || {};
  const a: Alert[] = [];
  const push = (sev: Severity, module: ModuleKey, label: string, count: number) => {
    if (count > 0) a.push({ sev, module, label, count });
  };
  push("high", "gps", "imóveis sem GPS", r.gps?.missing || 0);
  push("critical", "gps", "coordenadas inválidas", r.gps?.invalid || 0);
  push("high", "properties", "imóveis sem quarteirão", r.properties?.without_block || 0);
  push("medium", "properties", "imóveis sem agente", r.properties?.without_user || 0);
  push("medium", "properties", "imóveis duplicados", r.properties?.duplicates || 0);
  push("critical", "visits", "visitas órfãs (imóvel inexistente)", r.visits?.orphan || 0);
  push("medium", "visits", "visitas sem ciclo", r.visits?.without_cycle || 0);
  push("high", "foci", "focos positivos sem depósito", r.foci?.positive_without_deposit || 0);
  push("high", "foci", "depósito positivo sem visita", r.foci?.positive_deposit_without_visit || 0);
  push("critical", "users", "agentes sem supervisor", r.users?.agents_without_supervisor || 0);
  push("medium", "users", "emails duplicados", r.users?.duplicated_emails || 0);
  if (r.cycles?.multiple_in_progress) push("critical", "cycles", "múltiplos ciclos in_progress", 1);
  push("critical", "cycles", "ciclos vencidos ainda ativos", r.cycles?.expired_in_progress || 0);
  push("high", "offline", "registros aguardando sincronização", offline.pending);
  push("critical", "offline", "falhas de sincronização", offline.errors);
  const order: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return a.sort((x, y) => order[x.sev] - order[y.sev] || y.count - x.count);
}

const SEV_BADGE: Record<Severity, { cls: string; label: string }> = {
  critical: { cls: "bg-red-600 hover:bg-red-600", label: "CRÍTICO" },
  high: { cls: "bg-orange-500 hover:bg-orange-500", label: "ALTO" },
  medium: { cls: "bg-amber-500 hover:bg-amber-500", label: "MÉDIO" },
  low: { cls: "bg-slate-400 hover:bg-slate-400", label: "BAIXO" },
};

function downloadCSV(rows: Record<string, any>[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => JSON.stringify(r[h] ?? "")).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function ModuleScoreRow({ name, score }: { name: string; score: number }) {
  const c = scoreColor(score);
  return (
    <div className="grid grid-cols-[100px_1fr_60px] items-center gap-3 py-1.5">
      <span className="text-sm font-medium">{name}</span>
      <Progress value={score} className="h-2" indicatorClassName={c.bar} />
      <span className={`text-sm font-bold text-right ${c.cls}`}>{c.dot} {score}%</span>
    </div>
  );
}

function ExecCard({ icon: Icon, label, value, hint, cls }: { icon: any; label: string; value: any; hint?: string; cls?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">{label}</span>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className={`mt-2 text-3xl font-black ${cls ?? ""}`}>{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function DataAuditPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [offline, setOffline] = useState<{ pending: number; errors: number; last?: number }>({ pending: 0, errors: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [fixAllOpen, setFixAllOpen] = useState(false);
  const [fixAllResult, setFixAllResult] = useState<any>(null);

  async function loadOffline() {
    try {
      const pending = await db.syncQueue.where("status").equals("pending").count();
      const errors = await db.syncQueue.where("status").equals("error").count();
      const last = await db.syncQueue.orderBy("processedAt").last();
      setOffline({ pending, errors, last: last?.processedAt });
    } catch { setOffline({ pending: 0, errors: 0 }); }
  }

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.rpc("data_audit_report");
    if (error) toast.error(error.message);
    else setReport(data as Report);
    await loadOffline();
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const scores = useMemo(() => moduleScores(report, offline), [report, offline]);
  const overall = useMemo(() => {
    const vals = Object.values(scores);
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }, [scores]);
  const overallColor = scoreColor(overall);
  const alerts = useMemo(() => buildAlerts(report, offline), [report, offline]);
  const criticalCount = alerts.filter((a) => a.sev === "critical").length;

  // Cobertura territorial
  const territorial = useMemo(() => {
    const r = report || {};
    const total = r.rg?.total_blocks || 0;
    const ativos = r.rg?.blocks_with_properties || 0;
    const semCobertura = Math.max(0, total - ativos);
    const cobertura = total ? Math.round((ativos / total) * 1000) / 10 : 0;
    return { total, ativos, semCobertura, cobertura };
  }, [report]);

  async function saveSnapshot(actionsCount = 0) {
    try {
      await supabase.rpc("save_data_audit_snapshot", {
        _score: overall, _module_scores: scores as any,
        _alerts_count: alerts.length, _actions_count: actionsCount,
      } as any);
    } catch { /* silencioso */ }
  }

  async function runAction(name: string, fn: () => Promise<any>) {
    setBusy(name);
    try {
      const res = await fn();
      toast.success(`${name} executado.`);
      await supabase.from("audit_log").insert({ action: name, entity: "data_audit", metadata: res ?? {} } as any);
      await load();
    } catch (e: any) { toast.error(`${name}: ${e?.message || e}`); }
    finally { setBusy(null); }
  }

  async function runFixAll() {
    setBusy("fix_all");
    const result: Record<string, any> = {};
    try {
      result.sync_cycles = (await supabase.rpc("sync_cycle_statuses")).data;
    } catch (e: any) { result.sync_cycles = { error: e?.message }; }
    try {
      result.agent_integrity = (await supabase.rpc("agent_integrity_check", { _fix: true })).data;
    } catch (e: any) { result.agent_integrity = { error: e?.message }; }
    try {
      const removed = await db.syncQueue.where("status").equals("error").delete();
      result.offline_errors_cleared = removed;
    } catch (e: any) { result.offline_errors_cleared = { error: e?.message }; }
    try {
      await supabase.from("audit_log").insert({
        action: "fix_all", entity: "data_audit", metadata: result,
      } as any);
    } catch { /* ignore */ }
    setFixAllResult(result);
    setBusy(null);
    toast.success("Correção em lote concluída.");
    await load();
    await saveSnapshot(Object.keys(result).length);
  }

  const r = report || {};

  return (
    <div className="space-y-6 p-4 pb-24">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-6 w-6" /> Centro de Controle Operacional
          </h1>
          <p className="text-sm text-muted-foreground">Auditoria inteligente do VetorControl</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { load(); }} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <Button onClick={() => saveSnapshot(0).then(() => toast.success("Snapshot salvo"))} variant="outline" className="gap-2">
            <Activity className="h-4 w-4" /> Snapshot
          </Button>
          <Button
            variant="outline"
            onClick={() => downloadCSV(
              Object.entries(r).flatMap(([section, vals]) =>
                Object.entries(vals as object).filter(([, v]) => typeof v !== "object")
                  .map(([k, v]) => ({ section, indicator: k, value: v }))),
              `auditoria-${new Date().toISOString().slice(0, 10)}.csv`,
            )}
            className="gap-2"
          >
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button onClick={() => setFixAllOpen(true)} disabled={busy !== null} className="gap-2">
            <Wrench className="h-4 w-4" /> Corrigir tudo
          </Button>
        </div>
      </div>

      {/* SEÇÃO 10 — Dashboard Executivo */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <ExecCard icon={ShieldCheck} label="Saúde geral" value={`${overall}%`}
          cls={overallColor.cls} hint={overallColor.dot} />
        <ExecCard icon={MapPin} label="Cobertura GPS" value={`${pct(r.gps?.geocoded || 0, r.gps?.total || 0)}%`}
          hint={`${r.gps?.geocoded || 0}/${r.gps?.total || 0}`} />
        <ExecCard icon={Layers} label="Cobertura Territorial" value={`${territorial.cobertura}%`}
          hint={`${territorial.ativos}/${territorial.total} quarteirões`} />
        <ExecCard icon={Wifi} label="Sincronização" value={offline.errors > 0 ? "Erro" : offline.pending > 0 ? "Pendente" : "OK"}
          cls={offline.errors ? "text-red-600" : offline.pending ? "text-amber-600" : "text-emerald-600"}
          hint={`${offline.pending} pendentes · ${offline.errors} falhas`} />
        <ExecCard icon={CheckCircle2} label="Qualidade dos dados" value={`${scores.properties}%`}
          cls={scoreColor(scores.properties).cls} />
        <ExecCard icon={AlertTriangle} label="Alertas críticos" value={criticalCount}
          cls={criticalCount ? "text-red-600" : "text-emerald-600"}
          hint={`${alerts.length} alertas no total`} />
      </div>

      {/* SEÇÃO 1 — Score por módulo */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm uppercase tracking-widest flex items-center gap-2">
            <Activity className="h-4 w-4" /> 1. Score por módulo
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(Object.keys(scores) as ModuleKey[]).map((k) => (
            <ModuleScoreRow key={k} name={MODULE_LABEL[k]} score={scores[k]} />
          ))}
        </CardContent>
      </Card>

      {/* SEÇÃO 2 — Alertas automáticos */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm uppercase tracking-widest flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> 2. Alertas Automáticos
            <Badge variant="outline" className="ml-2">{alerts.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <p className="text-sm text-emerald-600 font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Nenhum alerta. Sistema saudável.
            </p>
          ) : (
            <div className="space-y-1.5">
              {alerts.map((a, i) => (
                <div key={i} className="flex items-center gap-3 py-1.5 border-b last:border-0">
                  <Badge className={SEV_BADGE[a.sev].cls}>{SEV_BADGE[a.sev].label}</Badge>
                  <span className="text-xs uppercase text-muted-foreground w-20">{MODULE_LABEL[a.module]}</span>
                  <span className="flex-1 text-sm">{a.label}</span>
                  <span className="font-bold text-sm">{a.count}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* SEÇÃO 5 — Auditoria Territorial */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm uppercase tracking-widest flex items-center gap-2">
            <Layers className="h-4 w-4" /> 5. Auditoria Territorial
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <ExecCard icon={Layers} label="Total quarteirões" value={territorial.total} />
            <ExecCard icon={CheckCircle2} label="Com imóveis" value={territorial.ativos} cls="text-emerald-600" />
            <ExecCard icon={AlertTriangle} label="Sem imóveis"
              value={r.rg?.blocks_without_properties || 0}
              cls={(r.rg?.blocks_without_properties || 0) > 0 ? "text-red-600" : ""} />
            <ExecCard icon={MapPin} label="Cobertura" value={`${territorial.cobertura}%`}
              cls={scoreColor(territorial.cobertura).cls} />
          </div>
        </CardContent>
      </Card>

      {/* Ações corretivas individuais (mantido da Fase 1) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm uppercase tracking-widest flex items-center gap-2">
            <Wrench className="h-4 w-4" /> Ações corretivas individuais
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button disabled={busy !== null} onClick={() => runAction("sync_cycle_statuses",
            async () => (await supabase.rpc("sync_cycle_statuses")).data)} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" /> Sincronizar Ciclos
          </Button>
          <Button disabled={busy !== null} onClick={() => runAction("agent_integrity_check",
            async () => (await supabase.rpc("agent_integrity_check", { _fix: true })).data)} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" /> Corrigir Vínculos de Agente
          </Button>
          <Button disabled={busy !== null} variant="outline" className="gap-2"
            onClick={() => runAction("clear_offline_errors", async () => {
              const c = await db.syncQueue.where("status").equals("error").delete();
              return { removed: c };
            })}>
            <RefreshCw className="h-4 w-4" /> Limpar Pendências Offline
          </Button>
        </CardContent>
      </Card>

      {/* Dialog Corrigir Tudo */}
      <Dialog open={fixAllOpen} onOpenChange={(o) => { setFixAllOpen(o); if (!o) setFixAllResult(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Wrench className="h-5 w-5" /> Corrigir tudo</DialogTitle>
            <DialogDescription>
              {fixAllResult ? "Relatório de execução:" : "As seguintes ações serão executadas em sequência:"}
            </DialogDescription>
          </DialogHeader>
          {!fixAllResult ? (
            <ul className="text-sm space-y-1.5 list-disc pl-5">
              <li>Sincronizar status dos ciclos por data</li>
              <li>Recriar vínculos faltantes de agentes</li>
              <li>Limpar pendências offline com erro</li>
              <li>Registrar tudo no log de auditoria</li>
              <li>Salvar snapshot de saúde</li>
            </ul>
          ) : (
            <pre className="text-xs bg-muted rounded p-3 max-h-72 overflow-auto">
              {JSON.stringify(fixAllResult, null, 2)}
            </pre>
          )}
          <DialogFooter>
            {!fixAllResult ? (
              <>
                <Button variant="outline" onClick={() => setFixAllOpen(false)}>Cancelar</Button>
                <Button onClick={runFixAll} disabled={busy !== null} className="gap-2">
                  {busy === "fix_all" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
                  Executar agora
                </Button>
              </>
            ) : (
              <Button onClick={() => { setFixAllOpen(false); setFixAllResult(null); }}>Fechar</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
