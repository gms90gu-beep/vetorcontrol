import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getWeeklyComparison, type WeeklyComparisonTotals } from "@/lib/wave-b.functions";
import { getEpiWeek } from "@/lib/cycle-week";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowDown, ArrowUp, Loader2, Minus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/weekly-comparison")({
  component: WeeklyComparisonPage,
});

const FIELDS: { key: keyof WeeklyComparisonTotals; label: string; inverse?: boolean }[] = [
  { key: "records", label: "Diárias encerradas" },
  { key: "properties_worked", label: "Imóveis trabalhados" },
  { key: "properties_closed", label: "Imóveis fechados" },
  { key: "blocks_worked", label: "Quarteirões" },
  { key: "strategic_points_worked", label: "Pontos estratégicos" },
  { key: "positive_foci", label: "Focos positivos", inverse: true },
  { key: "deposits_total", label: "Depósitos (Σ tipos)" },
  { key: "deposits_treated", label: "Depósitos tratados" },
  { key: "deposits_eliminated", label: "Depósitos eliminados" },
  { key: "tubitos_used", label: "Tubitos utilizados" },
  { key: "tubitos_collected", label: "Tubitos coletados" },
  { key: "larvae_collected", label: "Larvas coletadas" },
  { key: "cargas_collected", label: "Cargas coletadas" },
];

function WeeklyComparisonPage() {
  const now = getEpiWeek();
  const [epiWeek, setEpiWeek] = useState<number>(now.week);
  const [epiYear, setEpiYear] = useState<number>(now.year);
  const [scope, setScope] = useState<"team" | "self">("team");
  const fetchCompare = useServerFn(getWeeklyComparison);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["weekly-comparison", epiWeek, epiYear, scope],
    queryFn: () => fetchCompare({ data: { epiWeek, epiYear, scope } }),
  });

  return (
    <div className="container mx-auto max-w-5xl p-3 sm:p-6 space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Boletim Semanal — comparativo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
            <label className="text-xs">
              <div className="text-muted-foreground mb-1">SE (semana)</div>
              <Input type="number" min={1} max={53} value={epiWeek} onChange={(e) => setEpiWeek(Number(e.target.value))} />
            </label>
            <label className="text-xs">
              <div className="text-muted-foreground mb-1">Ano</div>
              <Input type="number" value={epiYear} onChange={(e) => setEpiYear(Number(e.target.value))} />
            </label>
            <Tabs value={scope} onValueChange={(v) => setScope(v as any)}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="self" className="text-xs">Eu</TabsTrigger>
                <TabsTrigger value="team" className="text-xs">Equipe</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button size="sm" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Atualizar"}
            </Button>
          </div>
          {data && (
            <p className="text-xs text-muted-foreground">
              Comparando SE <strong>{data.current.epi_week}/{data.current.epi_year}</strong> com SE{" "}
              <strong>{data.previous.epi_week}/{data.previous.epi_year}</strong> · {data.agents_scope} agente(s) no escopo
            </p>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !data ? null : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60">
                <tr className="text-left">
                  <th className="p-2">Métrica</th>
                  <th className="p-2 text-right">SE anterior</th>
                  <th className="p-2 text-right">SE atual</th>
                  <th className="p-2 text-right">Δ</th>
                  <th className="p-2 text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {FIELDS.map(({ key, label, inverse }) => {
                  const cur = data.current.totals[key] as number;
                  const prv = data.previous.totals[key] as number;
                  const d = data.delta[key];
                  const isUp = d.abs > 0;
                  const isDown = d.abs < 0;
                  const positive = inverse ? isDown : isUp;
                  const negative = inverse ? isUp : isDown;
                  const color = positive ? "text-emerald-600" : negative ? "text-rose-600" : "text-muted-foreground";
                  const Icon = isUp ? ArrowUp : isDown ? ArrowDown : Minus;
                  return (
                    <tr key={key} className="border-t">
                      <td className="p-2">{label}</td>
                      <td className="p-2 text-right tabular-nums">{prv}</td>
                      <td className="p-2 text-right tabular-nums font-semibold">{cur}</td>
                      <td className={`p-2 text-right tabular-nums font-medium ${color}`}>
                        <span className="inline-flex items-center justify-end gap-1">
                          <Icon className="h-3.5 w-3.5" />
                          {d.abs > 0 ? `+${d.abs}` : d.abs}
                        </span>
                      </td>
                      <td className={`p-2 text-right tabular-nums ${color}`}>
                        {d.pct === null ? "—" : `${d.pct > 0 ? "+" : ""}${d.pct}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Fonte: <code>daily_work_records</code> (epi_week + epi_year). Sem recálculo a partir de visitas.
      </p>
    </div>
  );
}
