import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/db/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  RefreshCw, Download, ShieldCheck, AlertTriangle, CheckCircle2,
  MapPin, Users, Layers, Home as HomeIcon, ClipboardList, Wifi, Calendar, Bug,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/data-audit")({
  component: DataAuditPage,
});

type Report = Record<string, any>;

function pct(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function scoreFor(report: Report | null, offline: any) {
  if (!report) return 0;
  const scores: number[] = [];
  // RG
  const rg = report.rg || {};
  scores.push(rg.total_blocks ? pct(rg.blocks_with_properties, rg.total_blocks) : 100);
  // Properties
  const p = report.properties || {};
  const issues = (p.without_block || 0) + (p.without_street || 0) + (p.without_number || 0) + (p.duplicates || 0);
  scores.push(p.total ? Math.max(0, 100 - pct(issues, p.total)) : 100);
  // GPS
  const g = report.gps || {};
  scores.push(g.total ? pct(g.geocoded, g.total) : 100);
  // Visits
  const v = report.visits || {};
  const vissues = (v.without_property || 0) + (v.without_agent || 0) + (v.without_date || 0) + (v.orphan || 0) + (v.without_cycle || 0);
  scores.push(v.total ? Math.max(0, 100 - pct(vissues, v.total)) : 100);
  // Foci
  const f = report.foci || {};
  const fissues = (f.positive_without_deposit || 0) + (f.positive_deposit_without_visit || 0) + (f.deposit_without_type || 0);
  scores.push(f.deposits_total ? Math.max(0, 100 - pct(fissues, f.deposits_total)) : 100);
  // Users
  const u = report.users || {};
  const uissues = (u.agents_without_supervisor || 0) + (u.duplicated_emails || 0);
  scores.push(u.total ? Math.max(0, 100 - pct(uissues, u.total)) : 100);
  // Cycles
  const c = report.cycles || {};
  scores.push((c.multiple_in_progress || c.expired_in_progress > 0) ? 60 : 100);
  // Offline
  const pendingQueue = offline?.pending || 0;
  const errorQueue = offline?.errors || 0;
  scores.push(errorQueue > 0 ? 60 : pendingQueue > 50 ? 80 : 100);

  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

function scoreColor(score: number) {
  if (score >= 95) return { label: "🟢 Excelente", cls: "text-emerald-600" };
  if (score >= 80) return { label: "🟡 Atenção", cls: "text-amber-600" };
  return { label: "🔴 Crítico", cls: "text-red-600" };
}

function downloadCSV(rows: Record<string, any>[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => JSON.stringify(r[h] ?? "")).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function Metric({ label, value, danger }: { label: string; value: any; danger?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`font-bold ${danger && Number(value) > 0 ? "text-red-600" : ""}`}>{value ?? 0}</span>
    </div>
  );
}

function Section({
  icon: Icon, title, children,
}: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm uppercase tracking-widest flex items-center gap-2">
          <Icon className="h-4 w-4" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm">{children}</CardContent>
    </Card>
  );
}

function DataAuditPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [offline, setOffline] = useState<{ pending: number; errors: number; last?: number }>({ pending: 0, errors: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function loadOffline() {
    try {
      const pending = await db.syncQueue.where("status").equals("pending").count();
      const errors = await db.syncQueue.where("status").equals("error").count();
      const last = await db.syncQueue.orderBy("processedAt").last();
      setOffline({ pending, errors, last: last?.processedAt });
    } catch {
      setOffline({ pending: 0, errors: 0 });
    }
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

  const score = useMemo(() => scoreFor(report, offline), [report, offline]);
  const sc = scoreColor(score);

  async function runAction(name: string, fn: () => Promise<any>) {
    setBusy(name);
    try {
      const res = await fn();
      toast.success(`${name} executado.`);
      await supabase.from("audit_log").insert({
        action: name, entity: "data_audit", metadata: res ?? {},
      } as any);
      load();
    } catch (e: any) {
      toast.error(`${name}: ${e?.message || e}`);
    } finally {
      setBusy(null);
    }
  }

  const r = report || {};

  return (
    <div className="space-y-6 p-4 pb-24">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-6 w-6" /> Auditoria de Dados
          </h1>
          <p className="text-sm text-muted-foreground">Check-up geral do VetorControl</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <Button
            variant="outline"
            onClick={() => downloadCSV(
              Object.entries(r).flatMap(([section, vals]) =>
                Object.entries(vals as object)
                  .filter(([, v]) => typeof v !== "object")
                  .map(([k, v]) => ({ section, indicator: k, value: v }))
              ),
              `auditoria-${new Date().toISOString().slice(0, 10)}.csv`,
            )}
            className="gap-2"
          >
            <Download className="h-4 w-4" /> CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="py-6 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Saúde geral do sistema</p>
            <p className={`text-5xl font-black ${sc.cls}`}>{score}%</p>
            <p className={`text-sm font-bold ${sc.cls}`}>{sc.label}</p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <p>Auditoria executada em</p>
            <p className="font-bold text-foreground">{new Date().toLocaleString("pt-BR")}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Section icon={Layers} title="1. RG / Quarteirões">
          <Metric label="Total" value={r.rg?.total_blocks} />
          <Metric label="Com imóveis" value={r.rg?.blocks_with_properties} />
          <Metric label="Sem imóveis" value={r.rg?.blocks_without_properties} danger />
          <Metric label="Duplicados" value={r.rg?.duplicated_blocks} danger />
          <Metric label="Sem responsável" value={r.rg?.blocks_without_owner} danger />
        </Section>

        <Section icon={HomeIcon} title="2. Imóveis">
          <Metric label="Total" value={r.properties?.total} />
          <Metric label="Sem quarteirão" value={r.properties?.without_block} danger />
          <Metric label="Sem RG" value={r.properties?.without_boletim} danger />
          <Metric label="Sem logradouro" value={r.properties?.without_street} danger />
          <Metric label="Sem número" value={r.properties?.without_number} danger />
          <Metric label="Sem agente" value={r.properties?.without_user} danger />
          <Metric label="Duplicados" value={r.properties?.duplicates} danger />
        </Section>

        <Section icon={MapPin} title="3. Geográfica (GPS)">
          <Metric label="Total" value={r.gps?.total} />
          <Metric label="Georreferenciados" value={r.gps?.geocoded} />
          <Metric label="Sem coordenadas" value={r.gps?.missing} danger />
          <Metric label="Coordenadas inválidas" value={r.gps?.invalid} danger />
          <Metric label="Coordenadas duplicadas" value={r.gps?.duplicated_coords} danger />
          <Metric label="Cobertura GPS" value={`${pct(r.gps?.geocoded || 0, r.gps?.total || 0)}%`} />
        </Section>

        <Section icon={ClipboardList} title="4. Visitas">
          <Metric label="Total" value={r.visits?.total} />
          <Metric label="Sem imóvel" value={r.visits?.without_property} danger />
          <Metric label="Sem agente" value={r.visits?.without_agent} danger />
          <Metric label="Sem data" value={r.visits?.without_date} danger />
          <Metric label="Órfãs (imóvel inexistente)" value={r.visits?.orphan} danger />
          <Metric label="Sem ciclo" value={r.visits?.without_cycle} danger />
        </Section>

        <Section icon={Bug} title="5. Focos">
          <Metric label="Visitas positivas" value={r.foci?.positive_visits} />
          <Metric label="Depósitos cadastrados" value={r.foci?.deposits_total} />
          <Metric label="Positivo sem depósito" value={r.foci?.positive_without_deposit} danger />
          <Metric label="Depósito + sem visita" value={r.foci?.positive_deposit_without_visit} danger />
          <Metric label="Depósito sem tipo" value={r.foci?.deposit_without_type} danger />
          <Metric label="Positivo sem imóvel" value={r.foci?.positive_visit_without_property} danger />
        </Section>

        <Section icon={Users} title="8. Usuários">
          <Metric label="Total" value={r.users?.total} />
          <Metric label="Inativos" value={r.users?.inactive} />
          <Metric label="Agentes sem supervisor" value={r.users?.agents_without_supervisor} danger />
          <Metric label="Supervisores sem equipe" value={r.users?.supervisors_without_team} danger />
          <Metric label="Emails duplicados" value={r.users?.duplicated_emails} danger />
        </Section>

        <Section icon={Calendar} title="9. Ciclos">
          <Metric label="Ciclo por DATA" value={r.cycles?.by_date?.name || "—"} />
          <Metric label="Ciclo por STATUS" value={r.cycles?.by_status?.name || "—"} />
          <div className="mt-2">
            {r.cycles?.by_date && r.cycles?.by_status && r.cycles.by_date.id !== r.cycles.by_status.id ? (
              <Badge variant="destructive">⚠ Divergência</Badge>
            ) : (
              <Badge className="bg-emerald-500">✓ Correto</Badge>
            )}
            {r.cycles?.multiple_in_progress && (
              <Badge variant="destructive" className="ml-2">⚠ Múltiplos in_progress</Badge>
            )}
            {r.cycles?.expired_in_progress > 0 && (
              <Badge variant="destructive" className="ml-2">⚠ Vencidos</Badge>
            )}
          </div>
        </Section>

        <Section icon={Wifi} title="7. Offline / Sync">
          <Metric label="Pendentes" value={offline.pending} danger />
          <Metric label="Falhas" value={offline.errors} danger />
          <Metric
            label="Última sincronização"
            value={offline.last ? new Date(offline.last).toLocaleString("pt-BR") : "—"}
          />
          <div className="mt-2">
            {offline.errors > 0 ? (
              <Badge variant="destructive">🔴 Erro</Badge>
            ) : offline.pending > 0 ? (
              <Badge className="bg-amber-500">🟡 Sincronizando</Badge>
            ) : (
              <Badge className="bg-emerald-500">🟢 Online</Badge>
            )}
          </div>
        </Section>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-widest flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> 10. Ações Corretivas
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button disabled={busy !== null} onClick={() => runAction("sync_cycle_statuses",
            async () => (await supabase.rpc("sync_cycle_statuses")).data)} className="gap-2">
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
            <RefreshCw className="h-4 w-4" /> Limpar Pendências Órfãs (Offline)
          </Button>
          <Button disabled={busy !== null} variant="outline" className="gap-2"
            onClick={() => runAction("recompute_block_counts", async () => {
              const { data } = await supabase
                .from("blocks").select("id");
              return { blocks: data?.length || 0 };
            })}>
            <CheckCircle2 className="h-4 w-4" /> Recalcular Indicadores
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
