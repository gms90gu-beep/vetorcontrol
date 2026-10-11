import { PcfadWeeklyLandscape } from "@/components/agent/PcfadWeeklyLandscape";
import { generatePcfadWeeklyPDF } from "@/components/reports/PcfadWeeklyPdfGenerator";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getTeamWeeklyProduction, getTeamPcfadWeekly } from "@/lib/wave-b.functions";
import { getEpiWeek } from "@/lib/cycle-week";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileDown, Loader2, MapPin, Users } from "lucide-react";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { OfflineNotAvailable } from "@/components/OfflineNotAvailable";

export const Route = createFileRoute("/_authenticated/relatorio-semanal-equipe")({
  head: () => ({
    meta: [
      { title: "Relatório Semanal da Equipe — VetorControl" },
      {
        name: "description",
        content:
          "Produção semanal da equipe de campo por agente e por bairro, com focos, imóveis trabalhados e tratamentos.",
      },
      { property: "og:title", content: "Relatório Semanal da Equipe — VetorControl" },
      {
        property: "og:description",
        content: "Consolidado da semana epidemiológica por agente e por bairro.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TeamWeeklyReportPage,
});

function csvCell(value: unknown): string {
  return '"' + String(value ?? "").replace(/"/g, '""') + '"';
}

function downloadCsv(filename: string, rows: unknown[][]) {
  const csv = rows.map((row) => row.map(csvCell).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function TeamWeeklyReportPage() {
  const now = getEpiWeek();
  const { online } = useSyncStatus();
  const [epiWeek, setEpiWeek] = useState(now.week);
  const [epiYear, setEpiYear] = useState(now.year);
  const [selectedTeam, setSelectedTeam] = useState("all");
  const [selectedArea, setSelectedArea] = useState("all");
  const [selectedAgent, setSelectedAgent] = useState("all");
  const [neighborhoodFilter, setNeighborhoodFilter] = useState("");
  const fetchWeekly = useServerFn(getTeamWeeklyProduction);

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["team-weekly-production", epiWeek, epiYear],
    queryFn: () => fetchWeekly({ data: { epiWeek, epiYear } }),
    enabled: online,
  });

  const fetchPcfad = useServerFn(getTeamPcfadWeekly);
  const pcfadQuery = useQuery({
    queryKey: ["team-pcfad", epiWeek, epiYear, selectedAgent, selectedTeam, selectedArea],
    queryFn: () => fetchPcfad({ data: { week: epiWeek, year: epiYear, agentId: selectedAgent === "all" ? undefined : selectedAgent, supervisorId: selectedTeam === "all" ? undefined : selectedTeam, areaId: selectedArea === "all" ? undefined : selectedArea } }),
    enabled: online,
  });

  if (!online) return <OfflineNotAvailable feature="Relatório Semanal da Equipe" />;

  const visibleNeighborhoods = (data?.neighborhoods ?? []).filter((row) =>
    row.neighborhood.toLocaleLowerCase("pt-BR").includes(neighborhoodFilter.trim().toLocaleLowerCase("pt-BR")),
  );

  const selected = data?.agents.find((a) => a.agent_id === selectedAgent);
  const scopeTitle = selectedAgent !== "all" ? pcfadQuery.data?.agents.find((a) => a.id === selectedAgent)?.name || "Agente selecionado" : selectedTeam !== "all" ? pcfadQuery.data?.teams.find((t) => t.id === selectedTeam)?.name || "Equipe selecionada" : "Equipes autorizadas";
  const detailTitle = scopeTitle + (selectedArea !== "all" ? ` · Área ${pcfadQuery.data?.areas.find((a) => a.id === selectedArea)?.name || "selecionada"}` : "");
  const exportDetailedPdf = async () => {
    if (!pcfadQuery.data) return;
    const result = await generatePcfadWeeklyPDF({ agentAuthId: selectedAgent === "all" ? "" : selectedAgent, week: epiWeek, year: epiYear, suppliedData: { ...pcfadQuery.data, title: detailTitle } });
    result?.pdf.save(result.fileName);
  };

  const exportAgents = () => {
    if (!data) return;
    downloadCsv("relatorio-geral-agentes-SE" + data.epi_week + "-" + data.epi_year + ".csv", [
      ["Agente", "Matrícula", "Diárias", "Imóveis trabalhados", "Imóveis fechados", "Quarteirões", "Focos", "Depósitos tratados"],
      ...data.agents.map((a) => [
        a.full_name,
        a.registration ?? "",
        a.records,
        a.properties_worked,
        a.properties_closed,
        a.blocks_worked,
        a.positive_foci,
        a.deposits_treated,
      ]),
    ]);
  };

  const exportNeighborhoods = () => {
    if (!data) return;
    downloadCsv("relatorio-bairros-SE" + data.epi_week + "-" + data.epi_year + ".csv", [
      ["Bairro", "Imóveis", "Visitas", "Inspecionados", "Fechados", "Recusados", "Focos", "Tratados"],
      ...visibleNeighborhoods.map((n) => [
        n.neighborhood,
        n.properties,
        n.visits,
        n.visited,
        n.closed,
        n.refused,
        n.foci,
        n.treated,
      ]),
    ]);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4 pb-24">
      <header className="space-y-1">
        <Badge className="bg-blue-600 text-white font-black text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-md">
          Boletim Semanal
        </Badge>
        <h1 className="text-3xl font-black tracking-tight text-slate-900">
          Relatório Semanal da Equipe
        </h1>
        <p className="text-sm text-slate-500 font-medium">
          O que a equipe produziu na semana — por agente e por bairro.
        </p>
      </header>

      <Card className="rounded-3xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Período</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
            <label className="text-xs">
              <div className="text-muted-foreground mb-1">SE (semana)</div>
              <Input
                type="number"
                min={1}
                max={53}
                value={epiWeek}
                onChange={(e) => setEpiWeek(Number(e.target.value))}
              />
            </label>
            <label className="text-xs">
              <div className="text-muted-foreground mb-1">Ano</div>
              <Input
                type="number"
                value={epiYear}
                onChange={(e) => setEpiYear(Number(e.target.value))}
              />
            </label>
            <Button size="sm" onClick={() => { refetch(); pcfadQuery.refetch(); }} disabled={isFetching}>
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Atualizar"}
            </Button>
          </div>
          {data && (
            <p className="text-xs text-muted-foreground">
              SE <strong>{data.epi_week}/{data.epi_year}</strong> · {data.from} a {data.to} ·{" "}
              {data.agents.length} agente(s) com produção
            </p>
          )}
        </CardContent>
      </Card>

      {error && <p role="alert" className="text-sm text-red-700">Não foi possível carregar o boletim. Tente atualizar novamente.</p>}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !data ? null : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Imóveis trabalhados" value={data.totals.properties_worked} />
            <Kpi label="Imóveis fechados" value={data.totals.properties_closed} />
            <Kpi label="Quarteirões" value={data.totals.blocks_worked} />
            <Kpi label="Focos positivos" value={data.totals.positive_foci} />
          </div>

          <Card className="rounded-3xl">
            <CardHeader><CardTitle className="text-base">Boletim semanal — Resumo dos Trabalhos de Campo</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-sm">Agente<select aria-label="Agente do boletim" className="block w-full border rounded-xl p-2" value={selectedAgent} onChange={(e) => setSelectedAgent(e.target.value)}><option value="all">Todos os agentes</option>{pcfadQuery.data?.agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
                <label className="text-sm">Equipe<select aria-label="Equipe do boletim" className="block w-full border rounded-xl p-2" value={selectedTeam} onChange={(e) => { setSelectedTeam(e.target.value); setSelectedAgent("all"); }}><option value="all">Todas as equipes autorizadas</option>{pcfadQuery.data?.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
                <label className="text-sm">Área<select aria-label="Área do boletim" className="block w-full border rounded-xl p-2" value={selectedArea} onChange={(e) => setSelectedArea(e.target.value)}><option value="all">Todas as áreas</option>{pcfadQuery.data?.areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
              </div>
              <Button variant="outline" onClick={exportDetailedPdf} disabled={!pcfadQuery.data || pcfadQuery.isFetching || !pcfadQuery.data.rows.length}>PDF do boletim PCFAD</Button>
              {pcfadQuery.isFetching ? <p>Carregando boletim PCFAD…</p> : pcfadQuery.error ? <p role="alert" className="text-red-700">{pcfadQuery.error.message}</p> : pcfadQuery.data ? <>
                <p className="text-xs text-muted-foreground">{pcfadQuery.data.dailyCount} diária(s) encerrada(s). Equipe e área consolidam os indicadores por dia. Valores de larvicida separados por unidade.</p>
                <PcfadWeeklyLandscape agentAuthId={selectedAgent} week={epiWeek} year={epiYear} agentName={detailTitle} registration={selected?.registration || "—"} municipality={selectedArea === "all" ? (pcfadQuery.data.agents.find((a) => a.id === selectedAgent)?.municipality || "") : pcfadQuery.data.areas.find((a) => a.id === selectedArea)?.name || ""} suppliedData={pcfadQuery.data} />
              </> : null}
            </CardContent>
          </Card>

          <Tabs defaultValue="agentes">
            <TabsList className="grid grid-cols-2 w-full max-w-md">
              <TabsTrigger value="agentes" className="text-xs">
                <Users className="h-3.5 w-3.5 mr-1" /> Geral / agente
              </TabsTrigger>
              <TabsTrigger value="bairros" className="text-xs">
                <MapPin className="h-3.5 w-3.5 mr-1" /> Por bairro
              </TabsTrigger>
            </TabsList>

            <TabsContent value="agentes" className="mt-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Visão geral consolidada a partir dos registros diários encerrados.
                </p>
                <Button size="sm" variant="outline" onClick={exportAgents} disabled={!data.agents.length}>
                  <FileDown className="h-3.5 w-3.5 mr-1" /> CSV geral
                </Button>
              </div>
              <Card className="rounded-3xl">
                <CardContent className="p-0 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/60">
                      <tr className="text-left">
                        <th className="p-2">Agente</th>
                        <th className="p-2 text-right">Diárias</th>
                        <th className="p-2 text-right">Trabalhados</th>
                        <th className="p-2 text-right">Fechados</th>
                        <th className="p-2 text-right">Quarteirões</th>
                        <th className="p-2 text-right">Focos</th>
                        <th className="p-2 text-right">Tratados</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.agents.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-muted-foreground text-xs">
                            Nenhuma produção registrada nesta semana.
                          </td>
                        </tr>
                      ) : (
                        data.agents.map((a) => (
                          <tr key={a.agent_id} className="border-t">
                            <td className="p-2 font-medium">
                              <button className="text-blue-700 underline text-left" onClick={() => setSelectedAgent(a.agent_id)} title="Ver boletim semanal detalhado">{a.full_name}</button>
                              {a.registration ? (
                                <span className="text-muted-foreground text-xs"> · {a.registration}</span>
                              ) : null}
                            </td>
                            <td className="p-2 text-right tabular-nums">{a.records}</td>
                            <td className="p-2 text-right tabular-nums font-semibold">
                              {a.properties_worked}
                            </td>
                            <td className="p-2 text-right tabular-nums">{a.properties_closed}</td>
                            <td className="p-2 text-right tabular-nums">{a.blocks_worked}</td>
                            <td className="p-2 text-right tabular-nums">{a.positive_foci}</td>
                            <td className="p-2 text-right tabular-nums">{a.deposits_treated}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="bairros" className="mt-3">
              <div className="mb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Input
                    value={neighborhoodFilter}
                    onChange={(event) => setNeighborhoodFilter(event.target.value)}
                    placeholder="Filtrar bairro ou área"
                    className="h-9 w-full sm:w-64 text-xs"
                    aria-label="Filtrar bairro ou área"
                  />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {visibleNeighborhoods.length} área(s)
                  </span>
                </div>
                <Button size="sm" variant="outline" onClick={exportNeighborhoods} disabled={!visibleNeighborhoods.length}>
                  <FileDown className="h-3.5 w-3.5 mr-1" /> CSV por bairro
                </Button>
              </div>
              <p className="mb-2 text-xs text-muted-foreground">
                Agrupamento pelo bairro cadastrado no imóvel; registros sem bairro aparecem como “Sem bairro”.
              </p>
              <Card className="rounded-3xl">
                <CardContent className="p-0 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/60">
                      <tr className="text-left">
                        <th className="p-2">Bairro</th>
                        <th className="p-2 text-right">Imóveis</th>
                        <th className="p-2 text-right">Visitas</th>
                        <th className="p-2 text-right">Inspecionados</th>
                        <th className="p-2 text-right">Fechados</th>
                        <th className="p-2 text-right">Recusados</th>
                        <th className="p-2 text-right">Focos</th>
                        <th className="p-2 text-right">Tratados</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleNeighborhoods.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-6 text-center text-muted-foreground text-xs">
                            Nenhuma visita registrada nesta semana.
                          </td>
                        </tr>
                      ) : (
                        visibleNeighborhoods.map((n) => (
                          <tr key={n.neighborhood} className="border-t">
                            <td className="p-2 font-medium">{n.neighborhood}</td>
                            <td className="p-2 text-right tabular-nums font-semibold">
                              {n.properties}
                            </td>
                            <td className="p-2 text-right tabular-nums">{n.visits}</td>
                            <td className="p-2 text-right tabular-nums">{n.visited}</td>
                            <td className="p-2 text-right tabular-nums">{n.closed}</td>
                            <td className="p-2 text-right tabular-nums">{n.refused}</td>
                            <td className="p-2 text-right tabular-nums">{n.foci}</td>
                            <td className="p-2 text-right tabular-nums">{n.treated}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-4">
        <p className="text-[10px] uppercase tracking-widest font-black text-slate-400">{label}</p>
        <p className="text-2xl font-black tabular-nums text-slate-900">{value}</p>
      </CardContent>
    </Card>
  );
}
