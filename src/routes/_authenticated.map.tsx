import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import {
  getPropertyMapPoints,
  type PropertyMapPoint,
} from "@/lib/wave-c.functions";
import { downloadCSV, downloadXLSX } from "@/lib/institutional-export";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  FileSpreadsheet,
  Flame,
  Loader2,
  MapPin,
  Navigation2,
  Search,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/map")({
  component: OperationalMapPage,
});

type Category = "focus" | "pendency" | "strategic" | "clean";

const CATEGORY_META: Record<
  Category,
  { color: string; label: string; emoji: string }
> = {
  focus: { color: "#dc2626", label: "Foco positivo", emoji: "🔴" },
  pendency: { color: "#f97316", label: "Pendência", emoji: "🟠" },
  strategic: { color: "#2563eb", label: "Ponto Estratégico", emoji: "🔵" },
  clean: { color: "#16a34a", label: "Sem foco", emoji: "🟢" },
};

function classify(p: PropertyMapPoint): Category {
  if (p.has_positive_focus) return "focus";
  if (p.has_pendency) return "pendency";
  if (p.is_strategic) return "strategic";
  return "clean";
}

function isoOffset(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const FILTERS: { id: "all" | Category; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "focus", label: "Focos" },
  { id: "pendency", label: "Pendências" },
  { id: "strategic", label: "Pontos Estratégicos" },
  { id: "clean", label: "Sem foco" },
];

function OperationalMapPage() {
  const [from, setFrom] = useState(isoOffset(-90));
  const [to, setTo] = useState(isoOffset(0));
  const [filter, setFilter] = useState<"all" | Category>("all");
  const [search, setSearch] = useState("");
  const [showHeat, setShowHeat] = useState(false);

  const fetchProps = useServerFn(getPropertyMapPoints);
  const props = useQuery({
    queryKey: ["op-map-points", from, to],
    queryFn: () => fetchProps({ data: { from, to } }),
  });

  const allPoints = props.data?.points ?? [];

  const visiblePoints = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allPoints.filter((p) => {
      const cat = classify(p);
      if (filter !== "all" && cat !== filter) return false;
      if (!q) return true;
      const hay = `${p.street ?? ""} ${p.number ?? ""} ${p.block_number ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [allPoints, filter, search]);

  const counts = useMemo(() => {
    const c = { focus: 0, pendency: 0, strategic: 0, clean: 0 };
    for (const p of allPoints) c[classify(p)]++;
    return c;
  }, [allPoints]);

  const center = useMemo<[number, number]>(() => {
    if (visiblePoints.length === 0) return [-15.78, -47.93]; // Brasil fallback
    const lat = visiblePoints.reduce((s, p) => s + p.latitude, 0) / visiblePoints.length;
    const lng = visiblePoints.reduce((s, p) => s + p.longitude, 0) / visiblePoints.length;
    return [lat, lng];
  }, [visiblePoints]);

  const head = ["ID", "Quart.", "Endereço", "Nº", "Lat", "Lng", "Situação"];
  const rows = useMemo(
    () =>
      visiblePoints.map((p) => [
        p.id,
        p.block_number ?? "",
        p.street ?? "",
        p.number ?? "",
        p.latitude.toFixed(6),
        p.longitude.toFixed(6),
        CATEGORY_META[classify(p)].label,
      ]),
    [visiblePoints],
  );

  return (
    <div className="container mx-auto max-w-7xl p-3 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <MapPin className="h-6 w-6 text-rose-500" /> Mapa Operacional
          </h2>
          <p className="text-sm text-muted-foreground">
            Imóveis georreferenciados — clique no marcador para detalhes e navegação por GPS.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={showHeat ? "default" : "outline"}
            onClick={() => setShowHeat((v) => !v)}
          >
            <Flame className="h-4 w-4 mr-1" /> Heatmap
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => downloadXLSX("mapa-operacional.xls", "Imoveis", head, rows)}
            disabled={rows.length === 0}
          >
            <FileSpreadsheet className="h-4 w-4 mr-1" /> XLSX
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => downloadCSV("mapa-operacional.csv", head, rows)}
            disabled={rows.length === 0}
          >
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por rua, número ou quarteirão"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-40"
            />
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-40"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => props.refetch()}
              disabled={props.isLoading}
            >
              {props.isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Atualizar"
              )}
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => {
              const active = filter === f.id;
              const count =
                f.id === "all"
                  ? allPoints.length
                  : counts[f.id as Category];
              return (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted"
                  }`}
                >
                  {f.label} <span className="opacity-70 ml-1">{count}</span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="h-[60vh] min-h-[420px] w-full rounded-lg overflow-hidden relative">
            {props.isLoading ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : allPoints.length === 0 ? (
              <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground text-center">
                Nenhum imóvel georreferenciado no período. As coordenadas são
                capturadas na primeira visita.
              </div>
            ) : (
              <MapContainer
                center={center}
                zoom={15}
                scrollWheelZoom
                style={{ height: "100%", width: "100%" }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{y}/{x}.png"
                />
                <FitBounds points={visiblePoints} />
                {showHeat && <HeatLayer points={visiblePoints} />}
                {!showHeat &&
                  visiblePoints.map((p) => {
                    const cat = classify(p);
                    const meta = CATEGORY_META[cat];
                    return (
                      <CircleMarker
                        key={p.id}
                        center={[p.latitude, p.longitude]}
                        radius={8}
                        pathOptions={{
                          color: "#fff",
                          weight: 2,
                          fillColor: meta.color,
                          fillOpacity: 0.9,
                        }}
                      >
                        <Popup>
                          <PointPopup point={p} />
                        </Popup>
                      </CircleMarker>
                    );
                  })}
              </MapContainer>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3 text-xs">
        {(Object.keys(CATEGORY_META) as Category[]).map((k) => (
          <div key={k} className="flex items-center gap-1.5">
            <span
              className="h-3 w-3 rounded-full ring-1 ring-white"
              style={{ background: CATEGORY_META[k].color }}
            />
            <span>
              {CATEGORY_META[k].emoji} {CATEGORY_META[k].label}
            </span>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Coordenadas oficiais de <code>properties.latitude/longitude</code>.
        Visualização escopada por perfil: supervisores veem apenas seus
        agentes; coordenadores e admin master veem todo o território
        permitido.
      </p>
    </div>
  );
}

function PointPopup({ point }: { point: PropertyMapPoint }) {
  const meta = CATEGORY_META[classify(point)];
  const url = `https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}`;
  return (
    <div className="text-xs space-y-1 min-w-[200px]">
      <div className="font-semibold text-sm">
        {point.street ?? "Endereço não informado"}
        {point.number ? `, ${point.number}` : ""}
      </div>
      <div className="text-muted-foreground">
        Quarteirão {point.block_number ?? "—"}
      </div>
      <div>
        <Badge
          style={{ background: meta.color, color: "#fff" }}
          className="border-none"
        >
          {meta.emoji} {meta.label}
        </Badge>
      </div>
      {point.status && (
        <div className="text-muted-foreground">Status: {point.status}</div>
      )}
      <div className="font-mono text-[10px] text-muted-foreground">
        {point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-xs font-medium hover:opacity-90"
      >
        <Navigation2 className="h-3.5 w-3.5" /> Navegar
      </a>
    </div>
  );
}

function FitBounds({ points }: { points: PropertyMapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points.map((p) => [p.latitude, p.longitude]));
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
    }
  }, [points, map]);
  return null;
}

function HeatLayer({ points }: { points: PropertyMapPoint[] }) {
  const map = useMap();
  const layerRef = useRef<L.Layer | null>(null);
  useEffect(() => {
    const data: [number, number, number][] = points.map((p) => [
      p.latitude,
      p.longitude,
      p.has_positive_focus ? 1 : 0.3,
    ]);
    // @ts-expect-error leaflet.heat plugin
    const layer = L.heatLayer(data, {
      radius: 28,
      blur: 22,
      maxZoom: 17,
      gradient: { 0.2: "#16a34a", 0.5: "#f97316", 0.9: "#dc2626" },
    });
    layer.addTo(map);
    layerRef.current = layer;
    return () => {
      if (layerRef.current) map.removeLayer(layerRef.current);
    };
  }, [points, map]);
  return null;
}
