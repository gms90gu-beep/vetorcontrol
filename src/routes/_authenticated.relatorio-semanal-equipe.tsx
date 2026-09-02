import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getTeamWeeklyProduction } from "@/lib/wave-b.functions";
import { getEpiWeek } from "@/lib/cycle-week";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, MapPin, Users } from "lucide-react";
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

function TeamWeeklyReportPage() {
  const now = getEpiWeek();
  const { online } = useSyncStatus();
  const [epiWeek, setEpiWeek] = useState(now.week);
  const [epiYear, setEpiYear] = useState(now.year);
  const fetchWeekly = useServerFn(getTeamWeeklyProduction);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["team-weekly-production", epiWeek, epiYear],
    queryFn: () => fetchWeekly({ data: { epiWeek, epiYear } }),
    enabled: online,
  });

  if (!online) return <OfflineNotAvailable feature="Relatório Semanal da Equipe" />;

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
            <Button size="sm" onClick={() => refetch()} disabled={isFetching}>
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

          <Tabs defaultValue="agentes">
            <TabsList className="grid grid-cols-2 w-full max-w-md">
              <TabsTrigger value="agentes" className="text-xs">
                <Users className="h-3.5 w-3.5 mr-1" /> Por agente
              </TabsTrigger>
              <TabsTrigger value="bairros" className="text-xs">
                <MapPin className="h-3.5 w-3.5 mr-1" /> Por bairro
              </TabsTrigger>
            </TabsList>

            <TabsContent value="agentes" className="mt-3">
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
                              {a.full_name}
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
                      {data.neighborhoods.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-6 text-center text-muted-foreground text-xs">
                            Nenhuma visita registrada nesta semana.
                          </td>
                        </tr>
                      ) : (
                        data.neighborhoods.map((n) => (
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
