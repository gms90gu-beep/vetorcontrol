import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getAgentProduction } from "@/lib/wave-b.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trophy, Loader2, Download } from "lucide-react";
import { toast } from "sonner";

function isoDays(offsetDaysFromMonday: number, base = new Date()) {
  const d = new Date(base);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - (day - 1) + offsetDaysFromMonday);
  return d.toISOString().slice(0, 10);
}

export function AgentProductionRanking() {
  const [from, setFrom] = useState(isoDays(0));
  const [to, setTo] = useState(isoDays(6));
  const fetchProduction = useServerFn(getAgentProduction);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["agent-production", from, to],
    queryFn: () => fetchProduction({ data: { from, to } }),
  });

  const rows = data?.rows ?? [];
  const totals = data?.totals;

  const exportCsv = () => {
    if (!rows.length) return;
    const header = [
      "Agente", "Matrícula", "Diárias", "Quart.", "Imóveis Trab.", "Fechados",
      "P. Estratégicos", "Depósitos", "Tratados", "Eliminados", "Focos+",
      "Tubitos Util.", "Tubitos Col.", "Larvas", "Cargas",
    ];
    const body = rows.map((r) => [
      r.full_name, r.registration ?? "", r.records, r.blocks_worked, r.properties_worked,
      r.properties_closed, r.strategic_points_worked, r.deposits_total, r.deposits_treated,
      r.deposits_eliminated, r.positive_foci, r.tubitos_used, r.tubitos_collected,
      r.larvae_collected, r.cargas_collected,
    ]);
    const csv = [header, ...body].map((l) => l.join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `producao_agentes_${from}_${to}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado");
  };

  const podium = useMemo(() => rows.slice(0, 3), [rows]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            Produção por agente — consolidado oficial
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-2 items-end">
            <label className="text-xs">
              <div className="text-muted-foreground mb-1">De</div>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="text-xs">
              <div className="text-muted-foreground mb-1">Até</div>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
            <Button size="sm" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Atualizar"}
            </Button>
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={!rows.length}>
              <Download className="h-4 w-4 mr-1" /> CSV
            </Button>
          </div>
          {data && (
            <p className="text-xs text-muted-foreground">
              Escopo: <strong>{data.scope === "admin_master" ? "Admin Master (global)" : "Supervisor (equipe)"}</strong>
              {" · "}Fonte: <code>daily_work_records</code>
            </p>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          Nenhuma diária encerrada no período.
        </CardContent></Card>
      ) : (
        <>
          {podium.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {podium.map((r, i) => (
                <Card key={r.agent_id} className={i === 0 ? "border-amber-400" : ""}>
                  <CardContent className="p-3">
                    <div className="text-xs text-muted-foreground">#{i + 1}</div>
                    <div className="font-semibold truncate">{r.full_name}</div>
                    <div className="text-2xl font-bold tabular-nums">{r.properties_worked}</div>
                    <div className="text-xs text-muted-foreground">imóveis · {r.positive_foci} focos+</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/60 sticky top-0">
                  <tr className="text-left">
                    <th className="p-2">#</th>
                    <th className="p-2">Agente</th>
                    <th className="p-2 text-right">Diárias</th>
                    <th className="p-2 text-right">Quart.</th>
                    <th className="p-2 text-right">Trab.</th>
                    <th className="p-2 text-right">Fech.</th>
                    <th className="p-2 text-right">Depósitos</th>
                    <th className="p-2 text-right">Focos+</th>
                    <th className="p-2 text-right">Tubitos</th>
                    <th className="p-2 text-right">Larvas</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.agent_id} className="border-t">
                      <td className="p-2 text-muted-foreground">{i + 1}</td>
                      <td className="p-2 font-medium">{r.full_name}</td>
                      <td className="p-2 text-right tabular-nums">{r.records}</td>
                      <td className="p-2 text-right tabular-nums">{r.blocks_worked}</td>
                      <td className="p-2 text-right tabular-nums font-semibold">{r.properties_worked}</td>
                      <td className="p-2 text-right tabular-nums">{r.properties_closed}</td>
                      <td className="p-2 text-right tabular-nums">{r.deposits_total}</td>
                      <td className="p-2 text-right tabular-nums text-rose-600">{r.positive_foci}</td>
                      <td className="p-2 text-right tabular-nums">{r.tubitos_used}</td>
                      <td className="p-2 text-right tabular-nums">{r.larvae_collected}</td>
                    </tr>
                  ))}
                  {totals && (
                    <tr className="border-t bg-muted/40 font-semibold">
                      <td className="p-2" colSpan={2}>TOTAL</td>
                      <td className="p-2 text-right tabular-nums">{totals.records}</td>
                      <td className="p-2 text-right tabular-nums">{totals.blocks_worked}</td>
                      <td className="p-2 text-right tabular-nums">{totals.properties_worked}</td>
                      <td className="p-2 text-right tabular-nums">{totals.properties_closed}</td>
                      <td className="p-2 text-right tabular-nums">{totals.deposits_total}</td>
                      <td className="p-2 text-right tabular-nums text-rose-600">{totals.positive_foci}</td>
                      <td className="p-2 text-right tabular-nums">{totals.tubitos_used}</td>
                      <td className="p-2 text-right tabular-nums">{totals.larvae_collected}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
