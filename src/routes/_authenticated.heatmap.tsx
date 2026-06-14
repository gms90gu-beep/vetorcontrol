import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getHeatmapData } from "@/lib/wave-c.functions";
import { downloadCSV, downloadXLSX } from "@/lib/institutional-export";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet, Loader2, MapPin } from "lucide-react";

export const Route = createFileRoute("/_authenticated/heatmap")({
  component: HeatmapPage,
});

function isoOffset(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function HeatmapPage() {
  const [from, setFrom] = useState(isoOffset(-30));
  const [to, setTo] = useState(isoOffset(0));
  const fetchHeat = useServerFn(getHeatmapData);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["heatmap", from, to],
    queryFn: () => fetchHeat({ data: { from, to } }),
  });

  const head = ["Quart.", "Lat", "Lng", "Imóveis", "Focos+", "Depósitos"];
  const rows = (data?.points ?? []).map((p) => [
    p.block_number,
    p.latitude ?? "",
    p.longitude ?? "",
    p.properties_worked,
    p.positive_foci,
    p.deposits_total,
  ]);
  const geocoded = (data?.points ?? []).filter((p) => p.latitude != null && p.longitude != null);
  const maxFoci = Math.max(1, ...geocoded.map((p) => p.positive_foci));

  return (
    <div className="container mx-auto max-w-7xl p-3 sm:p-6 space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <MapPin className="h-5 w-5 text-rose-500" />
            Mapa Epidemiológico — agregação por quarteirão
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_auto_auto_auto] gap-2 items-end">
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
            <Button size="sm" variant="outline" onClick={() => downloadXLSX("heatmap.xls", "Heatmap", head, rows)} disabled={!data}>
              <FileSpreadsheet className="h-4 w-4 mr-1" /> XLSX
            </Button>
            <Button size="sm" variant="outline" onClick={() => downloadCSV("heatmap.csv", head, rows)} disabled={!data}>
              <Download className="h-4 w-4 mr-1" /> CSV
            </Button>
          </div>
          {data && (
            <div className="grid grid-cols-3 gap-2 text-sm">
              <Stat label="Imóveis" value={data.totals.properties_worked} />
              <Stat label="Focos+" value={data.totals.positive_foci} />
              <Stat label="Depósitos" value={data.totals.deposits_total} />
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Pré-visualização (sem biblioteca de mapa)</CardTitle></CardHeader>
            <CardContent>
              {geocoded.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">
                  Nenhum quarteirão geocodificado no período. Cadastre latitude/longitude em <code>blocks</code> para visualizar o mapa.
                </p>
              ) : (
                <div className="relative h-72 bg-muted/40 rounded-lg overflow-hidden border">
                  {geocoded.map((p, i) => {
                    const intensity = Math.min(1, p.positive_foci / maxFoci);
                    return (
                      <div
                        key={i}
                        className="absolute h-3 w-3 rounded-full -translate-x-1/2 -translate-y-1/2"
                        style={{
                          left: `${(((p.longitude as number) + 180) / 360) * 100}%`,
                          top: `${100 - (((p.latitude as number) + 90) / 180) * 100}%`,
                          background: `rgba(244,63,94,${0.3 + intensity * 0.7})`,
                          boxShadow: `0 0 ${4 + intensity * 12}px rgba(244,63,94,${intensity})`,
                        }}
                        title={`Quart. ${p.block_number}: ${p.positive_foci} focos+`}
                      />
                    );
                  })}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground mt-2">
                Preparado para integração futura com Leaflet. Os pontos já estão agregados por quarteirão e prontos para uma camada de calor.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/60"><tr>{head.map((h) => <th key={h} className="p-2 text-left">{h}</th>)}</tr></thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={head.length} className="p-6 text-center text-muted-foreground">Sem agregações no período.</td></tr>
                  ) : rows.map((r, i) => (
                    <tr key={i} className="border-t">{r.map((c, j) => <td key={j} className="p-2 tabular-nums">{c}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
      <p className="text-xs text-muted-foreground">
        Fonte: <code>daily_work_records</code> distribuído pelos quarteirões oficiais do agente (<code>boletins_rg</code>).
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-3 text-center">
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
