import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getGeorefAudit, type GeorefAuditResult } from "@/lib/georef-audit.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  AlertTriangle, CheckCircle2, Download, FileSpreadsheet, FileText,
  Loader2, MapPin, RefreshCw, Search,
} from "lucide-react";
import { downloadCSV, downloadXLSX, generateInstitutionalPDF } from "@/lib/institutional-export";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/georef-audit")({
  component: GeorefAuditPage,
});

function statusBadge(status: string) {
  switch (status) {
    case "valid":
      return <Badge className="bg-green-600">🟢 Válido</Badge>;
    case "missing":
      return <Badge variant="secondary">🟡 Sem GPS</Badge>;
    case "invalid":
      return <Badge variant="destructive">🔴 Inválido</Badge>;
    case "duplicated":
      return <Badge className="bg-orange-500">⚠ Duplicado</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function healthBadge(pct: number) {
  if (pct >= 95) return <Badge className="bg-green-600">🟢 Excelente</Badge>;
  if (pct >= 80) return <Badge className="bg-yellow-500">🟡 Atenção</Badge>;
  return <Badge variant="destructive">🔴 Crítico</Badge>;
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

  // Logs
  if (data) {
    console.log("[GEOREF_TOTAL]", data.kpis.total_properties);
    console.log("[GEOREF_VALID]", data.kpis.georeferenced);
    console.log("[GEOREF_INVALID]", data.kpis.invalid_coords);
    console.log("[GEOREF_ORPHANS]", data.orphans);
    console.log("[GEOREF_SYNC]", { last: data.kpis.last_geocoded_at });
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
    downloadCSV(
      `georef-audit-${new Date().toISOString().slice(0, 10)}.csv`,
      data.properties.map((p) => ({
        id: p.id,
        endereco: p.street_name || "",
        numero: p.number || "",
        quarteirao: p.block_number || "",
        localidade: p.locality || "",
        agente: p.agent_name || "",
        latitude: p.latitude ?? "",
        longitude: p.longitude ?? "",
        geocoded_at: p.geocoded_at || "",
        status: p.status,
      })),
    );
  }

  function exportXLSX() {
    if (!data) return;
    downloadXLSX(`georef-audit-${new Date().toISOString().slice(0, 10)}.xlsx`, [
      { name: "KPIs", rows: [data.kpis] },
      { name: "Imóveis", rows: data.properties },
      { name: "Quarteirões", rows: data.blocks },
      { name: "Órfãos", rows: [data.orphans] },
    ]);
  }

  function exportPDF() {
    if (!data) return;
    generateInstitutionalPDF({
      title: "Auditoria de Georreferenciamento",
      subtitle: `Gerado em ${new Date(data.generated_at).toLocaleString("pt-BR")}`,
      sections: [
        {
          title: "Indicadores",
          rows: Object.entries(data.kpis).map(([k, v]) => [k, String(v ?? "—")]),
        },
        {
          title: "Inconsistências",
          rows: Object.entries(data.orphans).map(([k, v]) => [k, String(v)]),
        },
      ],
    });
    toast.success("PDF gerado");
  }

  return (
    <div className="container mx-auto p-4 space-y-4 max-w-7xl">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MapPin className="h-6 w-6" /> Auditoria de Georreferenciamento
          </h1>
          <p className="text-sm text-muted-foreground">
            Diagnóstico read-only. Nenhuma coordenada é alterada automaticamente.
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
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Imóveis</CardTitle></CardHeader>
              <CardContent className="text-2xl font-bold">{data.kpis.total_properties}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Georreferenciados</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.kpis.georeferenced}</div>
                <div className="text-xs text-muted-foreground">{data.kpis.without_gps} sem GPS · {data.kpis.invalid_coords} inválidos</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Cobertura GPS</CardTitle></CardHeader>
              <CardContent>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-2xl font-bold">{data.kpis.coverage_pct}%</div>
                  {healthBadge(data.kpis.coverage_pct)}
                </div>
                <Progress value={data.kpis.coverage_pct} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Quarteirões</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.kpis.blocks_total}</div>
                <div className="text-xs text-muted-foreground">
                  <CheckCircle2 className="inline h-3 w-3 text-green-600" /> {data.kpis.blocks_full_coverage} ·{" "}
                  🟡 {data.kpis.blocks_partial} · 🔴 {data.kpis.blocks_none}
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="properties">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="properties">Imóveis</TabsTrigger>
              <TabsTrigger value="blocks">Quarteirões</TabsTrigger>
              <TabsTrigger value="orphans">Relacionamentos</TabsTrigger>
              <TabsTrigger value="history">Histórico</TabsTrigger>
            </TabsList>

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
                      {data.blocks.map((b) => (
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

            <TabsContent value="orphans">
              <Card>
                <CardContent className="pt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(data.orphans).map(([k, v]) => (
                    <div key={k} className="border rounded p-3">
                      <div className="text-xs text-muted-foreground capitalize">{k.replace(/_/g, " ")}</div>
                      <div className={`text-2xl font-bold ${v > 0 ? "text-destructive" : ""}`}>{v}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history">
              <Card>
                <CardContent className="pt-4 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Imóvel</TableHead>
                        <TableHead>Capturado por</TableHead>
                        <TableHead>Em</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.history_sample.map((h) => (
                        <TableRow key={h.property_id}>
                          <TableCell className="font-mono text-xs">{h.property_id.slice(0, 8)}</TableCell>
                          <TableCell>{h.geocoded_by_name || h.geocoded_by || "—"}</TableCell>
                          <TableCell className="text-xs">{h.geocoded_at ? new Date(h.geocoded_at).toLocaleString("pt-BR") : "—"}</TableCell>
                        </TableRow>
                      ))}
                      {data.history_sample.length === 0 && (
                        <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Sem histórico.</TableCell></TableRow>
                      )}
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
