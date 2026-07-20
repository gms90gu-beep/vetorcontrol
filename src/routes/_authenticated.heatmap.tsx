import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getHeatmapData, getPropertyMapPoints, type PropertyMapPoint } from "@/lib/wave-c.functions";
import { downloadCSV, downloadXLSX } from "@/lib/institutional-export";
import { getOperationalDate } from "@/lib/operational-date";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet, Loader2, MapPin } from "lucide-react";
import {
  SharedMap,
  SharedMarkerLayer,
  SharedAgentTerritoryLayer,
  classifyProperty,
  type SharedMarkerPoint,
} from "@/components/map/shared";

export const Route = createFileRoute("/_authenticated/heatmap")({
  component: HeatmapPage,
});

function isoOffset(days: number) {
  const today = getOperationalDate();
  const [y, m, d] = today.split("-").map(Number);
  const local = new Date(y, m - 1, d);
  local.setDate(local.getDate() + days);
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
}

function classify(p: PropertyMapPoint) {
  return classifyProperty({
    had_previous_focus: p.has_positive_focus,
    has_pendency: p.has_pendency,
    type: p.is_strategic ? "strategic_point" : null,
  });
}

function isValidCoord(lat: unknown, lng: unknown) {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
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
  const allPoints = props.data?.points ?? [];
  const geoPoints = useMemo(
    () => allPoints.filter((p) => isValidCoord(p.latitude, p.longitude)),
    [allPoints],
  );

  const rows = useMemo(
    () =>
      geoPoints.map((p) => [
        p.id,
        p.block_number ?? "",
        p.street ?? "",
        p.number ?? "",
        p.latitude.toFixed(6),
        p.longitude.toFixed(6),
        classify(p).label,
      ]),
    [geoPoints],
  );

  const markers: SharedMarkerPoint[] = useMemo(
    () =>
      geoPoints.map((p) => {
        const c = classify(p);
        return {
          id: p.id,
          lat: p.latitude,
          lng: p.longitude,
          status: c.status,
          tooltip: `${p.street ?? "Imóvel"} ${p.number ?? ""}`,
          popupHtml: `
            <div style="font-family:system-ui;font-size:12px;min-width:180px">
              <div style="font-weight:600">${p.street ?? "Imóvel"} ${p.number ?? ""}</div>
              <div>Quarteirão: <b>${p.block_number ?? "—"}</b></div>
              <div>Localidade: ${p.locality ?? "—"}</div>
              <div style="margin-top:4px">
                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c.color};margin-right:4px"></span>
                <b>${c.label}</b>
              </div>
            </div>
          `,
          data: p,
        };
      }),
    [geoPoints],
  );

  const territoryPoints = useMemo(
    () => geoPoints.map((p) => ({ lat: p.latitude, lng: p.longitude, agentLabel: p.agent_name ?? null })),
    [geoPoints],
  );

  const isLoading = blocks.isLoading || props.isLoading;
  const isError = blocks.isError || props.isError;
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

          {blocks.data && (
            <div className="grid grid-cols-4 gap-2 text-sm">
              <Stat label="Imóveis no mapa" value={geoPoints.length} />
              <Stat label="Trabalhados (período)" value={blocks.data.totals.properties_worked} />
              <Stat label="Focos+" value={blocks.data.totals.positive_foci} />
              <Stat label="Depósitos" value={blocks.data.totals.deposits_total} />
            </div>
          )}
          {props.data?.truncated && (
            <p className="text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              Limite de 5.000 imóveis atingido — resultado truncado. Reduza o período pra ver todos.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Imóveis ({geoPoints.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <SharedMap
            height="60vh"
            loading={isLoading}
            loadError={isError ? "Falha ao carregar dados do período." : null}
            onRetryLoad={refetchAll}
            isEmpty={geoPoints.length === 0}
            emptyVariant={allPoints.length === 0 ? "no-data" : "no-geo"}
          >
            <SharedMarkerLayer
              points={markers}
              cluster={false}
              onClick={(m) => setSelected((m.data as PropertyMapPoint) ?? null)}
            />
            <SharedAgentTerritoryLayer points={territoryPoints} />
          </SharedMap>
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
