import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getHeatmapData, getPropertyMapPoints, type PropertyMapPoint } from "@/lib/wave-c.functions";
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

type Category = "focus" | "pendency" | "strategic" | "clean";

function classify(p: PropertyMapPoint): { cat: Category; color: string; label: string } {
  if (p.has_positive_focus) return { cat: "focus", color: "#dc2626", label: "Foco positivo" };
  if (p.has_pendency) return { cat: "pendency", color: "#f97316", label: "Pendente" };
  if (p.is_strategic) return { cat: "strategic", color: "#2563eb", label: "Ponto Estratégico" };
  return { cat: "clean", color: "#16a34a", label: "Sem foco" };
}

function HeatmapPage() {
  const [from, setFrom] = useState(isoOffset(-30));
  const [to, setTo] = useState(isoOffset(0));
  const [selected, setSelected] = useState<PropertyMapPoint | null>(null);
  const fetchHeat = useServerFn(getHeatmapData);
  const fetchProps = useServerFn(getPropertyMapPoints);

  const blocks = useQuery({
    queryKey: ["heatmap", from, to],
    queryFn: () => fetchHeat({ data: { from, to } }),
  });

  const props = useQuery({
    queryKey: ["heatmap-props", from, to],
    queryFn: () => fetchProps({ data: { from, to } }),
  });

  const head = ["ID", "Quart.", "Endereço", "Nº", "Lat", "Lng", "Status"];
  const rows = useMemo(
    () =>
      (props.data?.points ?? []).map((p) => [
        p.id,
        p.block_number ?? "",
        p.street ?? "",
        p.number ?? "",
        p.latitude.toFixed(6),
        p.longitude.toFixed(6),
        classify(p).label,
      ]),
    [props.data],
  );

  const points = props.data?.points ?? [];
  const bounds = useMemo(() => {
    if (points.length === 0) return null;
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const p of points) {
      if (p.latitude < minLat) minLat = p.latitude;
      if (p.latitude > maxLat) maxLat = p.latitude;
      if (p.longitude < minLng) minLng = p.longitude;
      if (p.longitude > maxLng) maxLng = p.longitude;
    }
    // padding
    const padLat = (maxLat - minLat) * 0.1 || 0.001;
    const padLng = (maxLng - minLng) * 0.1 || 0.001;
    return { minLat: minLat - padLat, maxLat: maxLat + padLat, minLng: minLng - padLng, maxLng: maxLng + padLng };
  }, [points]);

  const isLoading = blocks.isLoading || props.isLoading;
  const refetchAll = () => {
    blocks.refetch();
    props.refetch();
  };

  return (
    <div className="container mx-auto max-w-7xl p-3 sm:p-6 space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <MapPin className="h-5 w-5 text-rose-500" />
            Mapa Epidemiológico — imóveis georreferenciados
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
            <Button size="sm" onClick={refetchAll} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Atualizar"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => downloadXLSX("mapa-imoveis.xls", "Imoveis", head, rows)} disabled={rows.length === 0}>
              <FileSpreadsheet className="h-4 w-4 mr-1" /> XLSX
            </Button>
            <Button size="sm" variant="outline" onClick={() => downloadCSV("mapa-imoveis.csv", head, rows)} disabled={rows.length === 0}>
              <Download className="h-4 w-4 mr-1" /> CSV
            </Button>
          </div>

          <div className="flex flex-wrap gap-3 text-xs pt-1">
            <Legend color="#16a34a" label="🟢 Sem foco" />
            <Legend color="#dc2626" label="🔴 Foco positivo" />
            <Legend color="#f97316" label="🟠 Pendente" />
            <Legend color="#2563eb" label="🔵 Ponto Estratégico" />
          </div>

          {blocks.data && (
            <div className="grid grid-cols-4 gap-2 text-sm">
              <Stat label="Imóveis no mapa" value={points.length} />
              <Stat label="Trabalhados (período)" value={blocks.data.totals.properties_worked} />
              <Stat label="Focos+" value={blocks.data.totals.positive_foci} />
              <Stat label="Depósitos" value={blocks.data.totals.deposits_total} />
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Imóveis ({points.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {points.length === 0 || !bounds ? (
                <p className="text-xs text-muted-foreground py-6 text-center">
                  Nenhum imóvel georreferenciado neste período. As coordenadas são capturadas na primeira visita.
                </p>
              ) : (
                <div className="relative h-96 bg-muted/40 rounded-lg overflow-hidden border">
                  {points.map((p) => {
                    const c = classify(p);
                    const left = ((p.longitude - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 100;
                    const top = 100 - ((p.latitude - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * 100;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setSelected(p)}
                        className="absolute h-3 w-3 rounded-full -translate-x-1/2 -translate-y-1/2 ring-2 ring-white hover:scale-150 transition-transform"
                        style={{ left: `${left}%`, top: `${top}%`, background: c.color }}
                        title={`${c.label} — ${p.street ?? ""} ${p.number ?? ""}`}
                      />
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {selected && (
            <Card>
              <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-sm">
                    {selected.street ?? "Endereço não informado"} {selected.number ? `nº ${selected.number}` : ""}
                  </CardTitle>
                  <div className="text-xs text-muted-foreground mt-1">
                    Quarteirão {selected.block_number ?? "—"} · {classify(selected).label} ·
                    {" "}
                    <span className="font-mono">{selected.latitude.toFixed(6)}, {selected.longitude.toFixed(6)}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" asChild>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${selected.latitude},${selected.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Abrir no mapa
                    </a>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>Fechar</Button>
                </div>
              </CardHeader>
            </Card>
          )}

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/60"><tr>{head.map((h) => <th key={h} className="p-2 text-left">{h}</th>)}</tr></thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={head.length} className="p-6 text-center text-muted-foreground">Sem imóveis georreferenciados.</td></tr>
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
        Coordenadas oficiais dos imóveis (<code>properties.latitude/longitude</code>), capturadas apenas na primeira visita. Sem rastreamento do agente.
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

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      <span>{label}</span>
    </div>
  );
}
