import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { runSystemHealth, type SystemHealthResult, type HealthStatus } from "@/lib/system-health.functions";
import { supabase } from "@/integrations/supabase/client";
import { getCachedUserRole } from "@/lib/offline/role-cache";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Activity, AlertTriangle, Download, Play, FileText, FileSpreadsheet } from "lucide-react";
import { generateInstitutionalPDF, downloadCSV, downloadXLSX } from "@/lib/institutional-export";

export const Route = createFileRoute("/_authenticated/admin/system-health")({
  component: SystemHealthPage,
});

function statusClass(s: HealthStatus) {
  if (s === "healthy") return "bg-emerald-500/10 text-emerald-600 border-emerald-500/30";
  if (s === "warning") return "bg-amber-500/10 text-amber-700 border-amber-500/30";
  return "bg-rose-500/10 text-rose-700 border-rose-500/30";
}
function dot(s: HealthStatus) {
  if (s === "healthy") return "🟢";
  if (s === "warning") return "🟡";
  return "🔴";
}

function SystemHealthPage() {
  const run = useServerFn(runSystemHealth);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SystemHealthResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { setAllowed(false); return; }
      const r = await getCachedUserRole(u.user.id);
      setAllowed(r === "admin_master" || u.user.email === "gms90gu@gmail.com");
    })();
  }, []);

  const execute = async () => {
    setLoading(true); setError(null); setProgress(10);
    console.log("[SYSTEM_HEALTH_START]");
    const tick = setInterval(() => setProgress((p) => Math.min(90, p + 7)), 400);
    try {
      const res = await run({});
      setData(res);
      res.logs.forEach((l) => console.log(l));
      console.log("[SYSTEM_HEALTH_FINISH]");
    } catch (e: any) { setError(e.message); }
    finally { clearInterval(tick); setProgress(100); setLoading(false); }
  };

  useEffect(() => { if (allowed) execute(); /* eslint-disable-next-line */ }, [allowed]);

  const exportPDF = () => {
    if (!data) return;
    generateInstitutionalPDF(
      `system-health-${Date.now()}.pdf`,
      { title: "Centro de Operações — VetorControl", subtitle: `Saúde Geral ${data.globalScore}% · ${data.status.toUpperCase()}`, issuedBy: "Admin Master" },
      [
        { title: "Módulos", head: ["Módulo", "Score", "Status", "Alertas", "Última Execução"],
          body: data.modules.map((m) => [m.label, `${m.score}%`, m.status, m.alerts, new Date(m.lastRun).toLocaleString("pt-BR")]) },
        { title: "Alertas", head: ["Prioridade", "Módulo", "Tipo", "Mensagem", "Qtd"],
          body: data.alerts.map((a) => [a.priority, a.module, a.kind, a.message, a.count ?? ""]) },
        { title: "Homologação", head: ["Suite", "Aprovados", "Falhas", "Tempo (ms)"],
          body: data.homologation.suites.map((s) => [s.name, s.passed, s.failed, s.durationMs]) },
      ],
    );
  };

  const exportCSV = () => {
    if (!data) return;
    downloadCSV(`system-health-${Date.now()}.csv`,
      ["Módulo", "Score", "Status", "Alertas", "Última Execução"],
      data.modules.map((m) => [m.label, m.score, m.status, m.alerts, m.lastRun]));
  };
  const exportXLSX = () => {
    if (!data) return;
    downloadXLSX(`system-health-${Date.now()}`, "Modules",
      ["Módulo", "Score", "Status", "Alertas", "Última Execução"],
      data.modules.map((m) => [m.label, m.score, m.status, m.alerts, m.lastRun]));
  };

  if (allowed === false) return <div className="p-8 text-center text-muted-foreground">Acesso restrito ao Admin Master.</div>;
  if (allowed === null) return <div className="p-8 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Validando…</div>;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Activity className="h-6 w-6" /> Centro de Operações</h1>
          <p className="text-sm text-muted-foreground">Consolidação automática de todas as auditorias do VetorControl.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={execute} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Executar Diagnóstico Completo
          </Button>
          <Button variant="outline" onClick={exportPDF} disabled={!data} className="gap-2"><FileText className="h-4 w-4" />PDF</Button>
          <Button variant="outline" onClick={exportCSV} disabled={!data} className="gap-2"><Download className="h-4 w-4" />CSV</Button>
          <Button variant="outline" onClick={exportXLSX} disabled={!data} className="gap-2"><FileSpreadsheet className="h-4 w-4" />XLSX</Button>
        </div>
      </header>

      {loading && (
        <Card><CardContent className="pt-6 space-y-2">
          <div className="text-sm text-muted-foreground">Executando auditorias em paralelo…</div>
          <Progress value={progress} />
        </CardContent></Card>
      )}
      {error && <Card className="border-rose-500/30"><CardContent className="pt-6 text-rose-600 text-sm">{error}</CardContent></Card>}

      {data && (
        <>
          {/* Global Score */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Saúde Geral do Sistema</div>
                  <div className="text-5xl font-bold">{data.globalScore}%</div>
                  <Badge variant="outline" className={`mt-2 ${statusClass(data.status)}`}>{dot(data.status)} {data.status.toUpperCase()}</Badge>
                </div>
                <div className="flex-1 md:max-w-md">
                  <Progress value={data.globalScore} className="h-4" />
                  <div className="text-xs text-muted-foreground mt-2">Gerado em {new Date(data.generatedAt).toLocaleString("pt-BR")}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Executive cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {data.cards.map((c) => (
              <Card key={c.key} className={statusClass(c.status)}>
                <CardContent className="pt-4">
                  <div className="text-xs uppercase opacity-70">{c.label}</div>
                  <div className="text-2xl font-bold mt-1">{c.value}{c.suffix || ""}</div>
                  <div className="text-xs mt-1">{dot(c.status)}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Tabs defaultValue="modulos">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="modulos">Módulos</TabsTrigger>
              <TabsTrigger value="alertas">Alertas ({data.alerts.length})</TabsTrigger>
              <TabsTrigger value="timeline">Linha do Tempo</TabsTrigger>
              <TabsTrigger value="homologacao">Homologação</TabsTrigger>
            </TabsList>

            <TabsContent value="modulos">
              <Card><CardContent className="pt-4 overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Módulo</TableHead><TableHead>Score</TableHead><TableHead>Status</TableHead>
                    <TableHead>Alertas</TableHead><TableHead>Última Execução</TableHead><TableHead>Erro</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {data.modules.map((m) => (
                      <TableRow key={m.key}>
                        <TableCell className="font-medium">{m.label}</TableCell>
                        <TableCell>{m.score}%</TableCell>
                        <TableCell><Badge variant="outline" className={statusClass(m.status)}>{dot(m.status)} {m.status}</Badge></TableCell>
                        <TableCell>{m.alerts}</TableCell>
                        <TableCell className="text-xs">{new Date(m.lastRun).toLocaleString("pt-BR")}</TableCell>
                        <TableCell className="text-xs text-rose-600">{m.lastError || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="alertas">
              <Card><CardContent className="pt-4 overflow-x-auto">
                {data.alerts.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-6">Nenhum alerta ativo.</div>
                ) : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Prioridade</TableHead><TableHead>Módulo</TableHead><TableHead>Tipo</TableHead>
                      <TableHead>Mensagem</TableHead><TableHead>Qtd</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {data.alerts.map((a, i) => (
                        <TableRow key={i}>
                          <TableCell><Badge variant="outline" className={
                            a.priority === "critical" ? "bg-rose-500/10 text-rose-700 border-rose-500/30" :
                            a.priority === "warning" ? "bg-amber-500/10 text-amber-700 border-amber-500/30" :
                            "bg-sky-500/10 text-sky-700 border-sky-500/30"
                          }><AlertTriangle className="h-3 w-3 mr-1 inline" />{a.priority}</Badge></TableCell>
                          <TableCell>{a.module}</TableCell>
                          <TableCell>{a.kind}</TableCell>
                          <TableCell className="text-xs">{a.message}</TableCell>
                          <TableCell>{a.count ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="timeline">
              <Card><CardContent className="pt-4 overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Data/Hora</TableHead><TableHead>Módulo</TableHead><TableHead>Evento</TableHead>
                    <TableHead>Resultado</TableHead><TableHead>Usuário</TableHead><TableHead>Origem</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {data.timeline.map((t, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{new Date(t.ts).toLocaleString("pt-BR")}</TableCell>
                        <TableCell>{t.module}</TableCell>
                        <TableCell>{t.event}</TableCell>
                        <TableCell>{t.result}</TableCell>
                        <TableCell className="text-xs">{t.user}</TableCell>
                        <TableCell className="text-xs">{t.origin}</TableCell>
                      </TableRow>
                    ))}
                    {data.timeline.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Sem eventos.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="homologacao">
              <Card>
                <CardHeader><CardTitle className="text-base">Homologação Geral</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Total de Testes</div><div className="text-2xl font-bold">{data.homologation.total}</div></CardContent></Card>
                    <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Aprovados</div><div className="text-2xl font-bold text-emerald-600">{data.homologation.passed}</div></CardContent></Card>
                    <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Falhas</div><div className="text-2xl font-bold text-rose-600">{data.homologation.failed}</div></CardContent></Card>
                    <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Tempo</div><div className="text-2xl font-bold">{(data.homologation.durationMs / 1000).toFixed(1)}s</div></CardContent></Card>
                  </div>
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Suite</TableHead><TableHead>Aprovados</TableHead><TableHead>Falhas</TableHead><TableHead>Tempo (ms)</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {data.homologation.suites.map((s) => (
                        <TableRow key={s.name}>
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell className="text-emerald-600">{s.passed}</TableCell>
                          <TableCell className="text-rose-600">{s.failed}</TableCell>
                          <TableCell>{s.durationMs}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
