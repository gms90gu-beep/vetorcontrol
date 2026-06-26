import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  getGeorefAudit,
  type GeorefAuditResult,
  type GeorefAlert,
} from "@/lib/georef-audit.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, Download,
  ExternalLink, FileSpreadsheet, FileText, Loader2, MapPin, Minus,
  Navigation2, RefreshCw, Search, ShieldCheck,
} from "lucide-react";
import {
  downloadCSV, downloadXLSX, generateInstitutionalPDF,
} from "@/lib/institutional-export";
import { toast } from "sonner";

const AuditMap = lazy(() => import("@/components/map/GeorefAuditMap"));

export const Route = createFileRoute("/_authenticated/admin/georef-audit")({
  component: GeorefAuditPage,
});

function statusBadge(status: string) {
  switch (status) {
    case "valid": return <Badge className="bg-green-600">🟢 Válido</Badge>;
    case "missing": return <Badge variant="secondary">🟡 Sem GPS</Badge>;
    case "invalid": return <Badge variant="destructive">🔴 Inválido</Badge>;
    case "duplicated": return <Badge className="bg-purple-600">🟣 Duplicado</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

function scoreBadge(pct: number) {
  if (pct >= 95) return <Badge className="bg-green-600">🟢 Excelente</Badge>;
  if (pct >= 80) return <Badge className="bg-yellow-500">🟡 Atenção</Badge>;
  return <Badge variant="destructive">🔴 Crítico</Badge>;
}

function severityBadge(s: GeorefAlert["severity"]) {
  if (s === "critical") return <Badge variant="destructive">🔴 Crítico</Badge>;
  if (s === "warning") return <Badge className="bg-orange-500">🟠 Atenção</Badge>;
  return <Badge variant="secondary">🟡 Info</Badge>;
}

function trendIcon(curr: number, prev: number) {
  const diff = curr - prev;
  if (Math.abs(diff) < 1) return <Minus className="h-4 w-4 text-muted-foreground" />;
  if (diff > 0) return <ArrowUpRight className="h-4 w-4 text-green-600" />;
  return <ArrowDownRight className="h-4 w-4 text-destructive" />;
}

function GeorefAuditPage() {
  const [locality, setLocality] = useState("");
  const [agentId, setAgentId] = useState("");
  const [supervisorId, setSupervisorId] = useState("");
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [search, setSearch] = useState("");

  const audit = useServerFn(getGeorefAudit);
  const query = useQuery<GeorefAuditResult>({
    queryKey: ["georef-audit", locality, agentId, supervisorId, onlyIssues],
    queryFn: () =>
      audit({
        data: {
          locality: locality || null,
          agentId: agentId || null,
          supervisorId: supervisorId || null,
          onlyIssues,
        },
      }),
  });

  const data = query.data;

  if (data) {
    console.log("[GEOREF_SCORE]", data.quality_score);
    console.log("[GEOREF_ALERTS]", data.alerts.length);
    console.log("[GEOREF_TEAM]", supervisorId);
    console.log("[GEOREF_WEEK]", data.weekly_coverage.map((w) => w.label));
    console.log("[GEOREF_HISTORY]", data.history_sample.length);
  }

  const filteredProps = useMemo(() => {
    if (!data) return [];
    const s = search.toLowerCase();
    if (!s) return data.properties;
    return data.properties.filter((p) =>
      [p.street_name, p.number, p.block_number, p.locality, p.agent_name, p.id]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s)),
    );
  }, [data, search]);

  function exportCSV() {
    if (!data) return;
    console.log("[GEOREF_EXPORT]", "csv");
    const header = ["id", "endereco", "numero", "quarteirao", "localidade", "agente", "latitude", "longitude", "geocoded_at", "status"];
    const rows = data.properties.map((p) => [
      p.id, p.street_name || "", p.number || "", p.block_number || "", p.locality || "",
      p.agent_name || "", p.latitude ?? "", p.longitude ?? "", p.geocoded_at || "", p.status,
    ]);
    downloadCSV(`georef-audit-${new Date().toISOString().slice(0, 10)}.csv`, header, rows);
  }

  function exportXLSX() {
    if (!data) return;
    console.log("[GEOREF_EXPORT]", "xlsx");
    const header = ["id", "endereço", "nº", "quarteirão", "localidade", "agente", "lat", "lng", "data GPS", "status"];
    const rows = data.properties.map((p) => [
      p.id, p.street_name || "", p.number || "", p.block_number || "", p.locality || "",
      p.agent_name || "", p.latitude ?? "", p.longitude ?? "", p.geocoded_at || "", p.status,
    ]);
    downloadXLSX(`georef-audit-${new Date().toISOString().slice(0, 10)}.xls`, "Auditoria", header, rows);
  }

  function exportPDF() {
    if (!data) return;
    console.log("[GEOREF_EXPORT]", "pdf");
    generateInstitutionalPDF(
      `georef-audit-${new Date().toISOString().slice(0, 10)}.pdf`,
      {
        title: "Centro de Qualidade Territorial",
        subtitle: `Gerado em ${new Date(data.generated_at).toLocaleString("pt-BR")} · Índice ${data.quality_score}%`,
      },
      [
        {
          title: "Resumo Executivo",
          head: ["Indicador", "Valor"],
          body: [
            ["Índice de Qualidade Territorial", `${data.quality_score}%`],
            ["Cobertura GPS", `${data.kpis.coverage_pct}%`],
            ["Imóveis totais", String(data.kpis.total_properties)],
            ["Georreferenciados", String(data.kpis.georeferenced)],
            ["Sem GPS", String(data.kpis.without_gps)],
            ["Inválidos", String(data.kpis.invalid_coords)],
            ["Duplicados", String(data.kpis.duplicated_coords)],
            ["Quarteirões completos", String(data.kpis.blocks_full_coverage)],
            ["Quarteirões parciais", String(data.kpis.blocks_partial)],
            ["Quarteirões sem GPS", String(data.kpis.blocks_none)],
          ],
        },
        {
          title: "Cobertura por Semana Epidemiológica",
          head: ["Semana", "Período", "Visitados", "Geo", "Cobertura"],
          body: data.weekly_coverage.map((w) => [
            w.label, `${w.from} → ${w.to}`, String(w.visited), String(w.georeferenced), `${w.coverage_pct}%`,
          ]),
        },
        {
          title: "Ranking por Agente",
          head: ["Agente", "Supervisor", "Visitados", "Geo", "Cobertura"],
          body: data.agents_ranking.slice(0, 30).map((a) => [
            a.agent_name, a.supervisor_name || "—", String(a.visited),
            String(a.georeferenced), `${a.coverage_pct}%`,
          ]),
        },
        {
          title: "Ranking por Supervisor",
          head: ["Supervisor", "Equipe", "Total", "Cobertura", "Score"],
          body: data.supervisors_ranking.map((s) => [
            s.supervisor_name, String(s.team_size), String(s.total),
            `${s.coverage_pct}%`, `${s.score}%`,
          ]),
        },
        {
          title: "Alertas",
          head: ["Severidade", "Tipo", "Mensagem"],
          body: data.alerts.slice(0, 100).map((a) => [a.severity, a.kind, a.message]),
        },
        {
          title: "Histórico (últimas capturas)",
          head: ["Quando", "Por", "Origem"],
          body: data.history_sample.slice(0, 30).map((h) => [
            h.geocoded_at ? new Date(h.geocoded_at).toLocaleString("pt-BR") : "—",
            h.geocoded_by_name || h.geocoded_by || "—",
            h.source,
          ]),
        },
      ],
    );
    toast.success("PDF institucional gerado");
  }

  const curWeek = data?.weekly_coverage[3];
  const prevWeek = data?.weekly_coverage[2];

  return (
    <div className="container mx-auto p-4 space-y-4 max-w-7xl">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6" /> Centro de Qualidade Territorial
          </h1>
          <p className="text-sm text-muted-foreground">
            Auditoria 100% read-only. Coordenadas, geocoded_at e geocoded_by nunca são alterados aqui.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={!data}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportXLSX} disabled={!data}>
            <FileSpreadsheet className="h-4 w-4 mr-1" /> XLSX
          </Button>
          <Button variant="outline" size="sm" onClick={exportPDF} disabled={!data}>
            <FileText className="h-4 w-4 mr-1" /> PDF
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <Label className="text-xs">Localidade</Label>
            <Input value={locality} onChange={(e) => setLocality(e.target.value)} placeholder="Ex: Centro" />
          </div>
          <div>
            <Label className="text-xs">Supervisor (id)</Label>
            <Input value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Agente (id)</Label>
            <Input value={agentId} onChange={(e) => setAgentId(e.target.value)} />
          </div>
          <div className="flex items-end gap-2">
            <Switch id="issues" checked={onlyIssues} onCheckedChange={setOnlyIssues} />
            <Label htmlFor="issues" className="text-xs">Apenas inconsistências</Label>
          </div>
          <div className="col-span-2 md:col-span-1">
            <Label className="text-xs">Busca</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="endereço, agente…" />
            </div>
          </div>
        </CardContent>
      </Card>

      {query.isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}

      {query.error && (
        <Card>
          <CardContent className="pt-4 text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> {String((query.error as any)?.message || query.error)}
          </CardContent>
        </Card>
      )}

      {data && (
        <Tabs defaultValue="dashboard">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="coverage">Cobertura</TabsTrigger>
            <TabsTrigger value="teams">Equipes</TabsTrigger>
            <TabsTrigger value="alerts">Alertas ({data.alerts.length})</TabsTrigger>
            <TabsTrigger value="properties">Imóveis</TabsTrigger>
            <TabsTrigger value="blocks">Quarteirões</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
            <TabsTrigger value="map">Mapa</TabsTrigger>
          </TabsList>

          {/* ============ DASHBOARD ============ */}
          <TabsContent value="dashboard" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Índice de Qualidade Territorial</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-5xl font-bold">{data.quality_score}%</div>
                  {scoreBadge(data.quality_score)}
                </div>
                <Progress value={data.quality_score} className="h-3" />
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs mt-4">
                  <div className="border rounded p-2">
                    <div className="text-muted-foreground">Cobertura</div>
                    <div className="font-semibold">{data.score_breakdown.coverage}%</div>
                  </div>
                  <div className="border rounded p-2">
                    <div className="text-muted-foreground">Duplicidades</div>
                    <div className="font-semibold">{data.score_breakdown.duplicates_penalty}%</div>
                  </div>
                  <div className="border rounded p-2">
                    <div className="text-muted-foreground">Inválidos</div>
                    <div className="font-semibold">{data.score_breakdown.invalid_penalty}%</div>
                  </div>
                  <div className="border rounded p-2">
                    <div className="text-muted-foreground">Órfãos</div>
                    <div className="font-semibold">{data.score_breakdown.orphans_penalty}%</div>
                  </div>
                  <div className="border rounded p-2">
                    <div className="text-muted-foreground">Offline</div>
                    <div className="font-semibold">{data.score_breakdown.offline_health}%</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard label="Imóveis" value={data.kpis.total_properties} />
              <KpiCard label="Cobertura GPS" value={`${data.kpis.coverage_pct}%`} extra={scoreBadge(data.kpis.coverage_pct)} />
              <KpiCard label="Duplicidades" value={data.kpis.duplicated_coords} highlight={data.kpis.duplicated_coords > 0} />
              <KpiCard label="Órfãos" value={data.orphans.properties_without_block + data.orphans.properties_without_boletim} highlight />
              <KpiCard label="RG sem imóveis" value={data.kpis.rg_without_properties} />
              <KpiCard label="Imóveis sem RG" value={data.kpis.properties_without_rg} />
              <KpiCard label="Quarteirões completos" value={data.kpis.blocks_full_coverage} />
              <KpiCard label="Quarteirões incompletos" value={data.kpis.blocks_partial + data.kpis.blocks_none} />
              <KpiCard
                label="Última captura GPS"
                value={data.kpis.last_geocoded_at ? new Date(data.kpis.last_geocoded_at).toLocaleDateString("pt-BR") : "—"}
              />
              <KpiCard
                label="Última sincronização"
                value={data.kpis.last_sync_at ? new Date(data.kpis.last_sync_at).toLocaleDateString("pt-BR") : "—"}
              />
            </div>
          </TabsContent>

          {/* ============ COBERTURA ============ */}
          <TabsContent value="coverage" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cobertura por Semana Epidemiológica</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.weekly_coverage.map((w) => (
                  <div key={w.label} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">
                        {w.label} <span className="text-muted-foreground text-xs">({w.from} → {w.to})</span>
                      </span>
                      <span className="font-mono">
                        {w.georeferenced}/{w.visited} · {w.coverage_pct}%
                      </span>
                    </div>
                    <Progress value={w.coverage_pct} />
                  </div>
                ))}
                {curWeek && prevWeek && (
                  <div className="border-t pt-3 mt-3 flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Tendência:</span>
                    {trendIcon(curWeek.coverage_pct, prevWeek.coverage_pct)}
                    <span className="font-medium">
                      {curWeek.coverage_pct - prevWeek.coverage_pct > 0 ? "+" : ""}
                      {curWeek.coverage_pct - prevWeek.coverage_pct} pp vs SE anterior
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============ EQUIPES ============ */}
          <TabsContent value="teams" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Ranking por Agente</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Agente</TableHead>
                      <TableHead>Supervisor</TableHead>
                      <TableHead>Visitados</TableHead>
                      <TableHead>Geo</TableHead>
                      <TableHead>Sem GPS</TableHead>
                      <TableHead>Cobertura</TableHead>
                      <TableHead>Última sync</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.agents_ranking.slice(0, 100).map((a, i) => (
                      <TableRow key={a.agent_id}>
                        <TableCell className="font-mono">{i + 1}</TableCell>
                        <TableCell className="font-medium">{a.agent_name}</TableCell>
                        <TableCell>{a.supervisor_name || "—"}</TableCell>
                        <TableCell>{a.visited}</TableCell>
                        <TableCell>{a.georeferenced}</TableCell>
                        <TableCell>{a.without_gps}</TableCell>
                        <TableCell className="min-w-[140px]">
                          <div className="flex items-center gap-2">
                            <Progress value={a.coverage_pct} className="w-20" />
                            <span className="text-xs">{a.coverage_pct}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          {a.last_sync_at ? new Date(a.last_sync_at).toLocaleDateString("pt-BR") : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {data.agents_ranking.length === 0 && (
                      <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Sem dados.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Ranking por Supervisor</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Supervisor</TableHead>
                      <TableHead>Equipe</TableHead>
                      <TableHead>Imóveis</TableHead>
                      <TableHead>Cobertura</TableHead>
                      <TableHead>Pendências</TableHead>
                      <TableHead>Duplicidades</TableHead>
                      <TableHead>Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.supervisors_ranking.map((s, i) => (
                      <TableRow key={s.supervisor_id}>
                        <TableCell className="font-mono">{i + 1}</TableCell>
                        <TableCell className="font-medium">{s.supervisor_name}</TableCell>
                        <TableCell>{s.team_size}</TableCell>
                        <TableCell>{s.total}</TableCell>
                        <TableCell>{s.coverage_pct}%</TableCell>
                        <TableCell>{s.pendencies}</TableCell>
                        <TableCell>{s.duplicates}</TableCell>
                        <TableCell>{scoreBadge(s.score)}</TableCell>
                      </TableRow>
                    ))}
                    {data.supervisors_ranking.length === 0 && (
                      <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Sem dados.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============ ALERTAS ============ */}
          <TabsContent value="alerts">
            <Card>
              <CardContent className="pt-4 space-y-2">
                {data.alerts.length === 0 && (
                  <div className="flex items-center gap-2 text-muted-foreground py-6 justify-center">
                    <CheckCircle2 className="h-5 w-5 text-green-600" /> Nenhum alerta.
                  </div>
                )}
                {data.alerts.slice(0, 200).map((a) => (
                  <div key={a.id} className="border rounded p-3 flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {severityBadge(a.severity)}
                        <code className="text-[10px] text-muted-foreground">{a.kind}</code>
                      </div>
                      <p className="text-sm">{a.message}</p>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      {a.property_id && (
                        <Button asChild size="sm" variant="outline">
                          <Link to="/properties/$id" params={{ id: a.property_id }}>
                            <ExternalLink className="h-3 w-3 mr-1" /> Imóvel
                          </Link>
                        </Button>
                      )}
                      {a.rg_id && (
                        <Button asChild size="sm" variant="outline">
                          <Link to="/rg/boletim/$id" params={{ id: a.rg_id }}>
                            <ExternalLink className="h-3 w-3 mr-1" /> RG
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {data.alerts.length > 200 && (
                  <div className="text-xs text-muted-foreground">Exibindo 200 de {data.alerts.length}. Exporte para ver todos.</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============ IMÓVEIS ============ */}
          <TabsContent value="properties">
            <Card>
              <CardContent className="pt-4 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Endereço</TableHead>
                      <TableHead>Nº</TableHead>
                      <TableHead>Quarteirão</TableHead>
                      <TableHead>Localidade</TableHead>
                      <TableHead>Agente</TableHead>
                      <TableHead>Lat</TableHead>
                      <TableHead>Lng</TableHead>
                      <TableHead>Data GPS</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProps.slice(0, 300).map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="max-w-[200px] truncate">{p.street_name || "—"}</TableCell>
                        <TableCell>{p.number || "—"}</TableCell>
                        <TableCell>{p.block_number || "—"}</TableCell>
                        <TableCell>{p.locality || "—"}</TableCell>
                        <TableCell className="max-w-[140px] truncate">{p.agent_name || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{p.latitude?.toFixed(5) ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{p.longitude?.toFixed(5) ?? "—"}</TableCell>
                        <TableCell className="text-xs">{p.geocoded_at ? new Date(p.geocoded_at).toLocaleDateString("pt-BR") : "—"}</TableCell>
                        <TableCell>{statusBadge(p.status)}</TableCell>
                      </TableRow>
                    ))}
                    {filteredProps.length === 0 && (
                      <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">Nenhum imóvel.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
                {filteredProps.length > 300 && (
                  <div className="text-xs text-muted-foreground p-2">Exibindo 300 de {filteredProps.length}. Exporte para ver todos.</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============ QUARTEIRÕES ============ */}
          <TabsContent value="blocks">
            <Card>
              <CardContent className="pt-4 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Quarteirão</TableHead>
                      <TableHead>Localidade</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Geo</TableHead>
                      <TableHead>Pendentes</TableHead>
                      <TableHead>Cobertura</TableHead>
                      <TableHead>RG</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.blocks.slice(0, 500).map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">{b.number}</TableCell>
                        <TableCell>{b.locality || "—"}</TableCell>
                        <TableCell>{b.total}</TableCell>
                        <TableCell>{b.geo}</TableCell>
                        <TableCell>{b.pending}</TableCell>
                        <TableCell className="min-w-[140px]">
                          <div className="flex items-center gap-2">
                            <Progress value={b.coverage_pct} className="w-24" />
                            <span className="text-xs">{b.coverage_pct}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs font-mono">{b.rg_id ? b.rg_id.slice(0, 8) : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============ HISTÓRICO ============ */}
          <TabsContent value="history">
            <Card>
              <CardContent className="pt-4 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data / Hora</TableHead>
                      <TableHead>Agente</TableHead>
                      <TableHead>Imóvel</TableHead>
                      <TableHead>Evento</TableHead>
                      <TableHead>Origem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.history_sample.map((h) => (
                      <TableRow key={h.property_id + (h.geocoded_at || "")}>
                        <TableCell className="text-xs">{h.geocoded_at ? new Date(h.geocoded_at).toLocaleString("pt-BR") : "—"}</TableCell>
                        <TableCell>{h.geocoded_by_name || h.geocoded_by || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">
                          <Link to="/properties/$id" params={{ id: h.property_id }} className="underline">
                            {h.property_id.slice(0, 8)}
                          </Link>
                        </TableCell>
                        <TableCell>Captura GPS</TableCell>
                        <TableCell className="text-xs">{h.source}</TableCell>
                      </TableRow>
                    ))}
                    {data.history_sample.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Sem histórico.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============ MAPA ============ */}
          <TabsContent value="map">
            <Card>
              <CardContent className="pt-4">
                <div className="flex flex-wrap gap-2 text-xs mb-2">
                  <Badge className="bg-green-600">🟢 GPS válido</Badge>
                  <Badge variant="secondary">🟡 Sem GPS</Badge>
                  <Badge variant="destructive">🔴 Inválido</Badge>
                  <Badge className="bg-purple-600">🟣 Duplicado</Badge>
                  <Badge className="bg-blue-600">🔵 Estratégico</Badge>
                  <Badge className="bg-black text-white">⚫ Foco</Badge>
                </div>
                <Suspense fallback={<div className="h-[500px] flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
                  <AuditMap properties={data.properties} />
                </Suspense>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function KpiCard({ label, value, extra, highlight }: { label: string; value: any; extra?: React.ReactNode; highlight?: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">{label}</CardTitle></CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className={`text-2xl font-bold ${highlight && Number(value) > 0 ? "text-destructive" : ""}`}>{value}</div>
          {extra}
        </div>
      </CardContent>
    </Card>
  );
}

// Re-export marker icon helpers
export { Navigation2, MapPin };
