import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
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
  getBlockRiskScores,
  getGpsCoverage,
  type PropertyMapPoint,
  type BlockRiskScore,
} from "@/lib/wave-c.functions";
import { downloadCSV, downloadXLSX } from "@/lib/institutional-export";
import {
  currentEpiRange,
  previousEpiRange,
  lastNWeeksRange,
} from "@/lib/epi-week";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Building2,
  Download,
  FileSpreadsheet,
  FileText,
  Flame,
  Layers,
  Loader2,
  MapPin,
  Navigation2,
  Search,
  Target,
} from "lucide-react";

type Category = "focus" | "pendency" | "strategic" | "clean";

const CATEGORY_META: Record<Category, { color: string; label: string; emoji: string }> = {
  focus: { color: "#dc2626", label: "Foco positivo", emoji: "🔴" },
  pendency: { color: "#f97316", label: "Pendência", emoji: "🟠" },
  strategic: { color: "#2563eb", label: "Ponto Estratégico", emoji: "🔵" },
  clean: { color: "#16a34a", label: "Sem foco", emoji: "🟢" },
};

const RISK_META: Record<"low" | "med" | "high", { color: string; label: string }> = {
  low: { color: "#16a34a", label: "Baixo" },
  med: { color: "#eab308", label: "Médio" },
  high: { color: "#dc2626", label: "Alto" },
};

function classify(p: PropertyMapPoint): Category {
  if (p.has_positive_focus) return "focus";
  if (p.has_pendency) return "pendency";
  if (p.is_strategic) return "strategic";
  return "clean";
}

const FILTERS: { id: "all" | Category; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "focus", label: "Focos" },
  { id: "pendency", label: "Pendências" },
  { id: "strategic", label: "Pontos Estratégicos" },
  { id: "clean", label: "Sem foco" },
];

type Preset = "current" | "previous" | "last4" | "custom";

function presetRange(preset: Preset, custom: { from: string; to: string }) {
  if (preset === "current") return currentEpiRange();
  if (preset === "previous") return previousEpiRange();
  if (preset === "last4") return lastNWeeksRange(4);
  return { from: custom.from, to: custom.to, label: "Personalizado" };
}

function isValidCoord(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

export default function OperationalMapView() {
  console.log("[MAP_INIT]", { ts: Date.now() });

  const [preset, setPreset] = useState<Preset>("current");
  const initial = currentEpiRange();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [filter, setFilter] = useState<"all" | Category>("all");
  const [search, setSearch] = useState("");
  const [showHeat, setShowHeat] = useState(false);
  const [showBlocks, setShowBlocks] = useState(false);
  const mapWrapRef = useRef<HTMLDivElement>(null);

  // Global error/rejection listeners for the map page
  useEffect(() => {
    const onError = (ev: ErrorEvent) => {
      console.error("[MAP_WINDOW_ERROR]", {
        message: ev.message,
        filename: ev.filename,
        lineno: ev.lineno,
        colno: ev.colno,
        stack: ev.error?.stack,
      });
    };
    const onRej = (ev: PromiseRejectionEvent) => {
      const r = ev.reason as { message?: string; stack?: string } | undefined;
      console.error("[MAP_UNHANDLED_REJECTION]", {
        message: r?.message ?? String(ev.reason),
        stack: r?.stack,
      });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRej);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRej);
    };
  }, []);

  useEffect(() => {
    if (preset === "custom") return;
    const r = presetRange(preset, { from, to });
    setFrom(r.from);
    setTo(r.to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  const fetchProps = useServerFn(getPropertyMapPoints);
  const fetchBlocks = useServerFn(getBlockRiskScores);
  const fetchCoverage = useServerFn(getGpsCoverage);

  const props = useQuery({
    queryKey: ["op-map-points", from, to],
    queryFn: () => fetchProps({ data: { from, to } }),
  });
  const blocks = useQuery({
    queryKey: ["op-map-blocks", from, to],
    queryFn: () => fetchBlocks({ data: { from, to } }),
    enabled: showBlocks,
  });
  const coverage = useQuery({
    queryKey: ["op-map-coverage"],
    queryFn: () => fetchCoverage({ data: {} }),
  });

  if (props.error) {
    console.error("[MAP_POINTS_ERROR]", {
      message: (props.error as Error).message,
      stack: (props.error as Error).stack,
    });
  }

  const allPoints = useMemo(() => {
    const raw = props.data?.points ?? [];
    const filtered = raw.filter((p) => isValidCoord(p.latitude, p.longitude));
    if (raw.length !== filtered.length) {
      console.warn("[MAP_POINTS] descartados sem GPS válido:", raw.length - filtered.length);
    }
    console.log("[MAP_POINTS]", { total: raw.length, valid: filtered.length });
    return filtered;
  }, [props.data]);

  const visiblePoints = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allPoints.filter((p) => {
      const cat = classify(p);
      if (filter !== "all" && cat !== filter) return false;
      if (!q) return true;
      const hay = `${p.street ?? ""} ${p.number ?? ""} ${p.block_number ?? ""} ${p.locality ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [allPoints, filter, search]);

  const counts = useMemo(() => {
    const c = { focus: 0, pendency: 0, strategic: 0, clean: 0 };
    for (const p of allPoints) c[classify(p)]++;
    return c;
  }, [allPoints]);

  const kpis = useMemo(() => {
    let focos = 0;
    let pend = 0;
    let pe = 0;
    for (const p of allPoints) {
      focos += p.positive_foci_count;
      pend += p.pendency_count;
      if (p.is_strategic) pe += 1;
    }
    return { focos, pend, pe, monitored: allPoints.length };
  }, [allPoints]);

  const center = useMemo<[number, number]>(() => {
    if (visiblePoints.length === 0) return [-15.78, -47.93];
    const lat = visiblePoints.reduce((s, p) => s + p.latitude, 0) / visiblePoints.length;
    const lng = visiblePoints.reduce((s, p) => s + p.longitude, 0) / visiblePoints.length;
    return [lat, lng];
  }, [visiblePoints]);

  const head = [
    "ID","Quart.","Localidade","Endereço","Nº","Lat","Lng","Agente","Última visita",
    "Focos","Pendências","Depósitos","Risco",
  ];
  const rows = useMemo(
    () =>
      visiblePoints.map((p) => [
        p.id,
        p.block_number ?? "",
        p.locality ?? "",
        p.street ?? "",
        p.number ?? "",
        p.latitude.toFixed(6),
        p.longitude.toFixed(6),
        p.agent_name ?? "",
        p.last_visit_at ?? "",
        p.positive_foci_count,
        p.pendency_count,
        p.deposits_found,
        RISK_META[p.risk_level].label,
      ]),
    [visiblePoints],
  );

  async function exportPDF() {
    if (!mapWrapRef.current) return;
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);
      const canvas = await html2canvas(mapWrapRef.current, { useCORS: true, scale: 1.5 });
      const img = canvas.toDataURL("image/png");
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      doc.setFontSize(14);
      doc.text("Mapa Operacional — Relatório", 14, 14);
      doc.setFontSize(9);
      doc.text(`Período: ${from} a ${to}`, 14, 20);
      doc.text(
        `Focos: ${kpis.focos} · Pendências: ${kpis.pend} · PE: ${kpis.pe} · Imóveis: ${kpis.monitored} · Cobertura GPS: ${coverage.data?.coverage_pct ?? 0}%`,
        14,
        26,
      );
      const w = 270;
      const h = (canvas.height * w) / canvas.width;
      doc.addImage(img, "PNG", 14, 32, w, Math.min(h, 160));
      doc.save("mapa-operacional.pdf");
    } catch (err) {
      const e = err as Error;
      console.error("[MAP_EXPORT_PDF_ERROR]", { message: e.message, stack: e.stack });
    }
  }

  console.log("[MAP_RENDER]", {
    visible: visiblePoints.length,
    showHeat,
    showBlocks,
  });

  return (
    <div className="container mx-auto max-w-7xl p-3 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <MapPin className="h-6 w-6 text-rose-500" /> Mapa Operacional
          </h2>
          <p className="text-sm text-muted-foreground">
            Supervisão territorial, análise epidemiológica e cobertura GPS.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant={showHeat ? "default" : "outline"} onClick={() => setShowHeat((v) => !v)}>
            <Flame className="h-4 w-4 mr-1" /> Heatmap
          </Button>
          <Button size="sm" variant={showBlocks ? "default" : "outline"} onClick={() => setShowBlocks((v) => !v)}>
            <Layers className="h-4 w-4 mr-1" /> Quarteirões
          </Button>
          <Button size="sm" variant="outline" onClick={exportPDF} disabled={allPoints.length === 0}>
            <FileText className="h-4 w-4 mr-1" /> PDF
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

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <KpiCard icon={<Flame className="h-4 w-4 text-rose-500" />} label="Focos" value={kpis.focos} />
        <KpiCard icon={<AlertTriangle className="h-4 w-4 text-orange-500" />} label="Pendências" value={kpis.pend} />
        <KpiCard icon={<Target className="h-4 w-4 text-blue-500" />} label="PE" value={kpis.pe} />
        <KpiCard icon={<Building2 className="h-4 w-4 text-emerald-500" />} label="Imóveis" value={kpis.monitored} />
        <KpiCard
          icon={<MapPin className="h-4 w-4 text-violet-500" />}
          label="Cobertura GPS"
          value={`${coverage.data?.coverage_pct ?? 0}%`}
          sub={
            coverage.data
              ? `${coverage.data.properties_geo}/${coverage.data.properties_total} imóveis · ${coverage.data.blocks_geo}/${coverage.data.blocks_total} quart.`
              : ""
          }
        />
      </div>

      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            {[
              { id: "current", label: "SE Atual" },
              { id: "previous", label: "SE Anterior" },
              { id: "last4", label: "Últimas 4 semanas" },
              { id: "custom", label: "Personalizado" },
            ].map((p) => {
              const active = preset === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setPreset(p.id as Preset)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition ${
                    active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por rua, número, quarteirão ou localidade"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Input
              type="date"
              value={from}
              onChange={(e) => { setPreset("custom"); setFrom(e.target.value); }}
              className="w-40"
            />
            <Input
              type="date"
              value={to}
              onChange={(e) => { setPreset("custom"); setTo(e.target.value); }}
              className="w-40"
            />
            <Button size="sm" variant="outline" onClick={() => props.refetch()} disabled={props.isLoading}>
              {props.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Atualizar"}
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => {
              const active = filter === f.id;
              const count = f.id === "all" ? allPoints.length : counts[f.id as Category];
              return (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition ${
                    active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"
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
          <div
            ref={mapWrapRef}
            className="h-[60vh] min-h-[420px] w-full rounded-lg overflow-hidden relative"
          >
            {props.isLoading ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : props.error ? (
              <div className="flex h-full items-center justify-center p-6 text-sm text-destructive text-center">
                Erro ao carregar dados: {(props.error as Error).message}
              </div>
            ) : allPoints.length === 0 ? (
              <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground text-center">
                Nenhum imóvel georreferenciado no período.
              </div>
            ) : (
              <SafeMap
                center={center}
                visiblePoints={visiblePoints}
                showHeat={showHeat}
                showBlocks={showBlocks}
                blocks={blocks.data?.blocks ?? []}
              />
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3 text-xs">
        {(Object.keys(CATEGORY_META) as Category[]).map((k) => (
          <div key={k} className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full ring-1 ring-white" style={{ background: CATEGORY_META[k].color }} />
            <span>{CATEGORY_META[k].emoji} {CATEGORY_META[k].label}</span>
          </div>
        ))}
        <span className="text-muted-foreground">·</span>
        {(["low","med","high"] as const).map((k) => (
          <div key={k} className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full ring-1 ring-white" style={{ background: RISK_META[k].color }} />
            <span>Risco {RISK_META[k].label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SafeMap({
  center,
  visiblePoints,
  showHeat,
  showBlocks,
  blocks,
}: {
  center: [number, number];
  visiblePoints: PropertyMapPoint[];
  showHeat: boolean;
  showBlocks: boolean;
  blocks: BlockRiskScore[];
}) {
  try {
    return (
      <MapContainer
        center={center}
        zoom={15}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{y}/{x}.png"
        />
        <FitBounds points={visiblePoints} />
        {showHeat && <HeatLayer points={visiblePoints} />}
        {showBlocks &&
          blocks
            .filter((b) => isValidCoord(b.centroid?.lat, b.centroid?.lng))
            .map((b) => {
              try {
                return (
                  <CircleMarker
                    key={`${b.block_number}-${b.locality ?? ""}`}
                    center={[b.centroid.lat, b.centroid.lng]}
                    radius={Math.min(28, 8 + Math.sqrt(b.props_count) * 3)}
                    pathOptions={{
                      color: RISK_META[b.level].color,
                      weight: 2,
                      fillColor: RISK_META[b.level].color,
                      fillOpacity: 0.25,
                    }}
                  >
                    <Popup>
                      <BlockPopup block={b} />
                    </Popup>
                  </CircleMarker>
                );
              } catch (err) {
                const e = err as Error;
                console.error("[MAP_QUARTEIROES_ITEM_ERROR]", { message: e.message, stack: e.stack, block: b });
                return null;
              }
            })}
        {!showHeat &&
          visiblePoints.map((p) => {
            try {
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
            } catch (err) {
              const e = err as Error;
              console.error("[MAP_POINT_ITEM_ERROR]", { message: e.message, stack: e.stack, id: p.id });
              return null;
            }
          })}
      </MapContainer>
    );
  } catch (err) {
    const e = err as Error;
    console.error("[MAP_RENDER_ERROR]", { message: e.message, stack: e.stack });
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-destructive text-center">
        Falha ao renderizar mapa: {e.message}
      </div>
    );
  }
}

function KpiCard({
  icon, label, value, sub,
}: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon} {label}
        </div>
        <div className="text-2xl font-bold mt-1">{value}</div>
        {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function PointPopup({ point }: { point: PropertyMapPoint }) {
  const meta = CATEGORY_META[classify(point)];
  const risk = RISK_META[point.risk_level];
  const navUrl = `https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}`;
  return (
    <div className="text-xs space-y-1.5 min-w-[240px]">
      <div className="font-semibold text-sm">
        {point.street ?? "Endereço não informado"}
        {point.number ? `, ${point.number}` : ""}
      </div>
      <div className="text-muted-foreground">
        Quarteirão {point.block_number ?? "—"}
        {point.locality ? ` · ${point.locality}` : ""}
      </div>
      <div className="flex flex-wrap gap-1">
        <Badge style={{ background: meta.color, color: "#fff" }} className="border-none">
          {meta.emoji} {meta.label}
        </Badge>
        <Badge style={{ background: risk.color, color: "#fff" }} className="border-none">
          Risco {risk.label} ({point.risk_score})
        </Badge>
        {point.is_recurrent && <Badge variant="outline">Reincidente</Badge>}
      </div>
      <div className="text-muted-foreground">
        Agente: <span className="text-foreground">{point.agent_name ?? "—"}</span>
      </div>
      <div className="text-muted-foreground">
        Última visita: <span className="text-foreground">{point.last_visit_at ?? "—"}</span>
      </div>
      <div className="grid grid-cols-3 gap-1 text-center pt-1">
        <Stat label="Focos" value={point.positive_foci_count} />
        <Stat label="Depósitos" value={point.deposits_found} />
        <Stat label="Pend." value={point.pendency_count} />
      </div>
      <div className="font-mono text-[10px] text-muted-foreground">
        {point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}
      </div>
      <div className="flex flex-wrap gap-1.5 pt-1">
        <Link
          to="/properties"
          search={{ focus: point.id } as never}
          className="inline-flex items-center gap-1 bg-secondary text-secondary-foreground px-2 py-1 rounded text-[11px] hover:opacity-90"
        >
          <Building2 className="h-3 w-3" /> Imóvel
        </Link>
        {point.boletim_id && (
          <Link
            to="/rg"
            search={{ boletim: point.boletim_id } as never}
            className="inline-flex items-center gap-1 bg-secondary text-secondary-foreground px-2 py-1 rounded text-[11px] hover:opacity-90"
          >
            <FileText className="h-3 w-3" /> RG
          </Link>
        )}
        <a
          href={navUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 bg-primary text-primary-foreground px-2 py-1 rounded text-[11px] hover:opacity-90"
        >
          <Navigation2 className="h-3 w-3" /> Navegar
        </a>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-muted rounded px-1 py-0.5">
      <div className="text-[9px] text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

function BlockPopup({ block }: { block: BlockRiskScore }) {
  const risk = RISK_META[block.level];
  return (
    <div className="text-xs space-y-1 min-w-[200px]">
      <div className="font-semibold text-sm">Quarteirão {block.block_number}</div>
      {block.locality && <div className="text-muted-foreground">{block.locality}</div>}
      <Badge style={{ background: risk.color, color: "#fff" }} className="border-none">
        Risco {risk.label} ({block.score})
      </Badge>
      <div className="grid grid-cols-3 gap-1 text-center pt-1">
        <Stat label="Imóveis" value={block.props_count} />
        <Stat label="Focos" value={block.focus_count} />
        <Stat label="Pend." value={block.pending_count} />
      </div>
    </div>
  );
}

function FitBounds({ points }: { points: PropertyMapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    try {
      if (points.length === 0) return;
      const valid = points.filter((p) => isValidCoord(p.latitude, p.longitude));
      if (valid.length === 0) {
        console.warn("[MAP_FITBOUNDS] sem coordenadas válidas");
        return;
      }
      const bounds = L.latLngBounds(valid.map((p) => [p.latitude, p.longitude]));
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
      } else {
        console.warn("[MAP_FITBOUNDS] bounds inválidos");
      }
    } catch (err) {
      const e = err as Error;
      console.error("[MAP_FITBOUNDS_ERROR]", { message: e.message, stack: e.stack });
    }
  }, [points, map]);
  return null;
}

function HeatLayer({ points }: { points: PropertyMapPoint[] }) {
  const map = useMap();
  const layerRef = useRef<L.Layer | null>(null);
  useEffect(() => {
    console.log("[MAP_HEATMAP]", { points: points.length });
    try {
      const data: [number, number, number][] = points
        .filter((p) => isValidCoord(p.latitude, p.longitude))
        .map((p) => [p.latitude, p.longitude, p.has_positive_focus ? 1 : 0.3]);
      // @ts-expect-error leaflet.heat plugin
      const heatFn = L.heatLayer as ((d: unknown, o: unknown) => L.Layer) | undefined;
      if (typeof heatFn !== "function") {
        console.error("[MAP_HEATMAP_ERROR]", { message: "L.heatLayer indisponível — leaflet.heat não carregou" });
        return;
      }
      const layer = heatFn(data, {
        radius: 28,
        blur: 22,
        maxZoom: 17,
        gradient: { 0.2: "#16a34a", 0.5: "#f97316", 0.9: "#dc2626" },
      });
      layer.addTo(map);
      layerRef.current = layer;
    } catch (err) {
      const e = err as Error;
      console.error("[MAP_HEATMAP_ERROR]", { message: e.message, stack: e.stack });
    }
    return () => {
      try {
        if (layerRef.current) map.removeLayer(layerRef.current);
      } catch (err) {
        const e = err as Error;
        console.error("[MAP_HEATMAP_CLEANUP_ERROR]", { message: e.message, stack: e.stack });
      }
    };
  }, [points, map]);
  return null;
}
