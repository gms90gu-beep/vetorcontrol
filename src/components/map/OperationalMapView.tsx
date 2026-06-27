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
// CSS de Leaflet/MarkerCluster vai no shell (src/styles.css) p/ evitar chunks offline.
import "leaflet.heat";
import "leaflet.markercluster";

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
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  ArrowLeft,
  BarChart3,
  Building2,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  Flame,
  Layers,
  Loader2,
  MapPin,
  Maximize2,
  Minimize2,
  Navigation2,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Target,
  X,
} from "lucide-react";

type Category = "focus" | "pendency" | "strategic" | "clean";

const CATEGORY_META: Record<Category, { color: string; label: string; emoji: string }> = {
  focus: { color: "#dc2626", label: "Foco positivo", emoji: "🔴" },
  pendency: { color: "#f97316", label: "Pendência", emoji: "🟠" },
  strategic: { color: "#2563eb", label: "Ponto Estratégico", emoji: "🔵" },
  clean: { color: "#16a34a", label: "Regularizado", emoji: "🟢" },
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
  { id: "strategic", label: "PE" },
  { id: "clean", label: "Regular." },
];

type Preset = "current" | "previous" | "last4" | "custom";
type HeatMode = "count" | "focus" | "pendency";
type PanelView = "default" | "detail";

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

type BaseLayerId = "osm" | "carto" | "esri";
const BASE_LAYERS: Record<BaseLayerId, { name: string; url: string; attribution: string }> = {
  carto: {
    name: "Carto Positron",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: "&copy; OpenStreetMap &copy; CARTO",
  },
  osm: {
    name: "OpenStreetMap",
    url: "https://{s}.tile.openstreetmap.org/{z}/{y}/{x}.png",
    attribution: "&copy; OpenStreetMap",
  },
  esri: {
    name: "Satélite (Esri)",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
  },
};

export default function OperationalMapView() {
  console.log("[MAP_COMPONENT_MOUNT]");

  const [preset, setPreset] = useState<Preset>("current");
  const initial = currentEpiRange();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [filter, setFilter] = useState<"all" | Category>("all");
  const [search, setSearch] = useState("");
  const [showHeat, setShowHeat] = useState(false);
  const [heatMode, setHeatMode] = useState<HeatMode>("count");
  const [showBlocks, setShowBlocks] = useState(false);
  const [showProperties, setShowProperties] = useState(true);
  const [baseLayer, setBaseLayer] = useState<BaseLayerId>("carto");
  const [fullscreen, setFullscreen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selected, setSelected] = useState<PropertyMapPoint | null>(null);
  const [panelView, setPanelView] = useState<PanelView>("default");
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; ts: number } | null>(null);
  const mapWrapRef = useRef<HTMLDivElement>(null);

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

  const allPoints = useMemo(() => {
    const raw = props.data?.points ?? [];
    return raw.filter((p) => isValidCoord(p.latitude, p.longitude));
  }, [props.data]);

  const visiblePoints = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allPoints.filter((p) => {
      const cat = classify(p);
      if (filter !== "all" && cat !== filter) return false;
      if (!q) return true;
      const hay = `${p.street ?? ""} ${p.number ?? ""} ${p.block_number ?? ""} ${p.locality ?? ""} ${p.agent_name ?? ""} ${p.id ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [allPoints, filter, search]);

  const counts = useMemo(() => {
    const c = { focus: 0, pendency: 0, strategic: 0, clean: 0 };
    for (const p of allPoints) c[classify(p)]++;
    return c;
  }, [allPoints]);

  const territorialCounts = useMemo(() => {
    const blocksSet = new Set<string>();
    const locSet = new Set<string>();
    for (const p of allPoints) {
      if (p.block_number) blocksSet.add(`${p.block_number}|${p.locality ?? ""}`);
      if (p.locality) locSet.add(p.locality);
    }
    return { blocks: blocksSet.size, localities: locSet.size };
  }, [allPoints]);

  const distributions = useMemo(() => {
    const byLocality = new Map<string, number>();
    const byBlock = new Map<string, number>();
    const byAgent = new Map<string, number>();
    for (const p of allPoints) {
      const loc = p.locality ?? "—";
      byLocality.set(loc, (byLocality.get(loc) ?? 0) + 1);
      const blk = p.block_number ? `Q ${p.block_number}` : "—";
      byBlock.set(blk, (byBlock.get(blk) ?? 0) + 1);
      const ag = p.agent_name ?? "—";
      byAgent.set(ag, (byAgent.get(ag) ?? 0) + 1);
    }
    const top = (m: Map<string, number>, n = 5) =>
      [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
    return {
      locality: top(byLocality),
      block: top(byBlock),
      agent: top(byAgent),
    };
  }, [allPoints]);

  const center = useMemo<[number, number]>(() => {
    if (visiblePoints.length === 0) return [-15.78, -47.93];
    const lat = visiblePoints.reduce((s, p) => s + p.latitude, 0) / visiblePoints.length;
    const lng = visiblePoints.reduce((s, p) => s + p.longitude, 0) / visiblePoints.length;
    return [lat, lng];
  }, [visiblePoints]);

  const lastSync = useMemo(() => {
    if (!props.dataUpdatedAt) return "—";
    return new Date(props.dataUpdatedAt).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  }, [props.dataUpdatedAt]);

  const cov = coverage.data;
  const withoutCoords = Math.max(0, (cov?.properties_total ?? 0) - (cov?.properties_geo ?? 0));

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
      doc.text("Mapa de Inteligência Territorial", 14, 14);
      doc.setFontSize(9);
      doc.text(`Período: ${from} a ${to}`, 14, 20);
      const w = 270;
      const h = (canvas.height * w) / canvas.width;
      doc.addImage(img, "PNG", 14, 26, w, Math.min(h, 170));
      doc.save("mapa-inteligencia-territorial.pdf");
    } catch (err) {
      console.error("[MAP_EXPORT_PDF_ERROR]", err);
    }
  }

  function handleSelectPoint(p: PropertyMapPoint) {
    setSelected(p);
    setPanelView("detail");
    setSheetOpen(true);
    setFlyTo({ lat: p.latitude, lng: p.longitude, ts: Date.now() });
  }

  function clearSelection() {
    setSelected(null);
    setPanelView("default");
  }

  // KPI strip — clickable filters
  const kpis: Array<{
    id: string;
    label: string;
    value: number | string;
    accent: string;
    onClick?: () => void;
    active?: boolean;
    suffix?: string;
  }> = [
    { id: "total", label: "Total imóveis", value: allPoints.length, accent: "from-slate-500/15 to-slate-500/0", onClick: () => setFilter("all"), active: filter === "all" },
    { id: "clean", label: "Regularizados", value: counts.clean, accent: "from-emerald-500/25 to-emerald-500/0", onClick: () => setFilter("clean"), active: filter === "clean" },
    { id: "pendency", label: "Pendências", value: counts.pendency, accent: "from-orange-500/25 to-orange-500/0", onClick: () => setFilter("pendency"), active: filter === "pendency" },
    { id: "focus", label: "Focos", value: counts.focus, accent: "from-rose-500/25 to-rose-500/0", onClick: () => setFilter("focus"), active: filter === "focus" },
    { id: "strategic", label: "PE", value: counts.strategic, accent: "from-blue-500/25 to-blue-500/0", onClick: () => setFilter("strategic"), active: filter === "strategic" },
    { id: "nocoord", label: "Sem coordenadas", value: withoutCoords, accent: "from-amber-500/20 to-amber-500/0" },
    { id: "gps", label: "Cobertura GPS", value: cov?.coverage_pct ?? 0, suffix: "%", accent: "from-violet-500/25 to-violet-500/0" },
    { id: "blocks", label: "Quarteirões", value: territorialCounts.blocks, accent: "from-indigo-500/20 to-indigo-500/0" },
    { id: "loc", label: "Localidades", value: territorialCounts.localities, accent: "from-teal-500/20 to-teal-500/0" },
  ];

  const PanelDefault = (
    <div className="space-y-4 animate-in fade-in-50 duration-300">
      <SummarySection counts={counts} total={allPoints.length} />
      <DistributionsSection
        statusCounts={counts}
        total={allPoints.length}
        locality={distributions.locality}
        block={distributions.block}
        agent={distributions.agent}
      />
      <LayersSection
        showProperties={showProperties}
        setShowProperties={setShowProperties}
        showBlocks={showBlocks}
        setShowBlocks={setShowBlocks}
        showHeat={showHeat}
        setShowHeat={setShowHeat}
        heatMode={heatMode}
        setHeatMode={setHeatMode}
        baseLayer={baseLayer}
        setBaseLayer={setBaseLayer}
      />
      <FiltersSection
        search={search}
        setSearch={setSearch}
        filter={filter}
        setFilter={setFilter}
        counts={counts}
        total={allPoints.length}
        preset={preset}
        setPreset={setPreset}
        from={from}
        to={to}
        setFrom={setFrom}
        setTo={setTo}
      />
      <LegendSection counts={counts} />
      <ExportSection exportPDF={exportPDF} head={head} rows={rows} />
    </div>
  );

  const PanelDetail = selected && (
    <PropertyDetailPanel
      point={selected}
      onClose={clearSelection}
      onCenter={() => setFlyTo({ lat: selected.latitude, lng: selected.longitude, ts: Date.now() })}
    />
  );

  const PanelBody = panelView === "detail" && selected ? PanelDetail : PanelDefault;

  return (
    <div className={fullscreen ? "fixed inset-0 z-50 bg-background" : "h-[calc(100vh-64px)] w-full"}>
      <div className="flex flex-col h-full">
        {/* TOP BAR */}
        <header className="border-b bg-card/70 backdrop-blur-xl px-4 py-2.5 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-rose-500 via-orange-500 to-amber-400 text-white shadow-md shadow-rose-500/20">
              <MapPin className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold leading-tight truncate tracking-tight">
                Centro de Inteligência Territorial
              </h1>
              <p className="text-[11px] text-muted-foreground leading-tight">
                Última sincronização: {lastSync}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            <Button size="sm" variant="outline" onClick={() => props.refetch()} disabled={props.isFetching}>
              {props.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="hidden sm:inline ml-1.5">Atualizar</span>
            </Button>
            <Button size="sm" variant="outline" onClick={() => setFullscreen((v) => !v)}>
              {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              <span className="hidden sm:inline ml-1.5">{fullscreen ? "Sair" : "Tela cheia"}</span>
            </Button>
            <Button size="sm" variant="outline" onClick={exportPDF} disabled={allPoints.length === 0}>
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline ml-1.5">Exportar</span>
            </Button>
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button size="sm" variant="default" className="lg:hidden">
                  <SlidersHorizontal className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-[85vh] overflow-y-auto">
                <div className="pt-4">{PanelBody}</div>
              </SheetContent>
            </Sheet>
          </div>
        </header>

        {/* KPI DASHBOARD STRIP */}
        <div className="border-b bg-gradient-to-b from-background to-muted/20 px-3 py-2 overflow-x-auto">
          <div className="flex items-stretch gap-2 min-w-max">
            {kpis.map((k) => {
              const clickable = !!k.onClick;
              return (
                <button
                  key={k.id}
                  type="button"
                  onClick={k.onClick}
                  disabled={!clickable}
                  className={`group relative text-left rounded-xl border px-3 py-2 min-w-[120px] bg-gradient-to-br ${k.accent} backdrop-blur-sm transition-all ${
                    clickable ? "cursor-pointer hover:shadow-md hover:-translate-y-0.5" : "cursor-default"
                  } ${k.active ? "ring-2 ring-primary border-primary/60 shadow-md" : ""}`}
                >
                  <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {k.label}
                  </div>
                  <div className="text-lg font-bold tabular-nums leading-tight mt-0.5">
                    {typeof k.value === "number" ? k.value.toLocaleString("pt-BR") : k.value}
                    {k.suffix && <span className="text-xs font-medium text-muted-foreground ml-0.5">{k.suffix}</span>}
                  </div>
                  {k.active && (
                    <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* MAIN SPLIT */}
        <div className="flex-1 min-h-0 flex">
          <main className="flex-1 min-w-0 p-3">
            <div
              ref={mapWrapRef}
              className="relative h-full w-full rounded-2xl overflow-hidden border shadow-sm bg-muted/30"
            >
              {props.isLoading ? (
                <MapSkeleton />
              ) : props.error ? (
                <div className="flex h-full items-center justify-center p-6 text-sm text-destructive text-center">
                  Erro ao carregar dados: {(props.error as Error).message}
                </div>
              ) : allPoints.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center p-6 text-sm text-muted-foreground text-center gap-2">
                  <MapPin className="h-8 w-8 opacity-40" />
                  Nenhum imóvel georreferenciado no período.
                </div>
              ) : (
                <>
                  <SafeMap
                    center={center}
                    visiblePoints={visiblePoints}
                    showHeat={showHeat}
                    heatMode={heatMode}
                    showBlocks={showBlocks}
                    showProperties={showProperties}
                    blocks={blocks.data?.blocks ?? []}
                    baseLayer={baseLayer}
                    selectedId={selected?.id ?? null}
                    onSelectPoint={handleSelectPoint}
                    flyTo={flyTo}
                  />
                  {/* Floating glass legend */}
                  <div className="absolute bottom-3 left-3 z-[400] bg-card/80 backdrop-blur-xl border rounded-xl px-3 py-2 shadow-lg hidden sm:flex items-center gap-3 text-[11px] animate-in fade-in slide-in-from-bottom-2">
                    {(Object.keys(CATEGORY_META) as Category[]).map((k) => (
                      <span key={k} className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full ring-2 ring-white/80 shadow" style={{ background: CATEGORY_META[k].color }} />
                        {CATEGORY_META[k].label}
                      </span>
                    ))}
                  </div>
                  {/* Counter pill */}
                  <div className="absolute top-3 left-3 z-[400] bg-card/80 backdrop-blur-xl border rounded-xl px-3 py-1.5 shadow-md text-[11px] flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                    <Building2 className="h-3.5 w-3.5 text-primary" />
                    <span className="font-semibold tabular-nums">{visiblePoints.length}</span>
                    <span className="text-muted-foreground">de {allPoints.length} visíveis</span>
                  </div>
                </>
              )}
            </div>
          </main>

          <aside className="hidden lg:block w-[360px] xl:w-[400px] shrink-0 border-l bg-card/40 backdrop-blur-sm overflow-y-auto p-4">
            {PanelBody}
          </aside>
        </div>
      </div>
    </div>
  );
}

/* ============= Detail panel ============= */

function PropertyDetailPanel({
  point, onClose, onCenter,
}: { point: PropertyMapPoint; onClose: () => void; onCenter: () => void }) {
  const cat = classify(point);
  const meta = CATEGORY_META[cat];
  const risk = RISK_META[point.risk_level];
  const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${point.latitude},${point.longitude}`;

  return (
    <div className="space-y-3 animate-in fade-in-50 slide-in-from-right-2 duration-300">
      <div className="flex items-center justify-between">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar
        </button>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition cursor-pointer">
          <X className="h-4 w-4" />
        </button>
      </div>

      <Card className="overflow-hidden">
        <div
          className="h-1.5"
          style={{ background: `linear-gradient(90deg, ${meta.color}, ${risk.color})` }}
        />
        <CardContent className="p-4 space-y-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Imóvel</div>
            <div className="text-base font-bold leading-tight mt-0.5">
              {point.street ?? "Endereço não informado"}
              {point.number ? `, ${point.number}` : ""}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Quarteirão {point.block_number ?? "—"} {point.locality ? `· ${point.locality}` : ""}
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Badge style={{ background: meta.color, color: "#fff" }} className="border-none">
              {meta.label}
            </Badge>
            <Badge style={{ background: risk.color, color: "#fff" }} className="border-none">
              Risco {risk.label} ({point.risk_score})
            </Badge>
            {point.is_recurrent && (
              <Badge variant="outline" className="border-rose-300 text-rose-700 dark:text-rose-300">
                Recorrente
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="Focos" value={point.positive_foci_count} accent="text-rose-600" />
            <MiniStat label="Depósitos" value={point.deposits_found} accent="text-amber-600" />
            <MiniStat label="Pend." value={point.pendency_count} accent="text-orange-600" />
          </div>

          <div className="space-y-1.5 text-xs">
            <DetailRow label="Agente" value={point.agent_name ?? "—"} />
            <DetailRow label="Última visita" value={point.last_visit_at ?? "—"} />
            <DetailRow
              label="Coordenadas"
              value={`${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}`}
              mono
            />
            <DetailRow label="ID" value={point.id} mono />
          </div>

          <div className="grid grid-cols-2 gap-1.5 pt-1">
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onCenter}>
              <Target className="h-3.5 w-3.5 mr-1" /> Centralizar
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" asChild>
              <a href={navUrl} target="_blank" rel="noopener noreferrer">
                <Navigation2 className="h-3.5 w-3.5 mr-1" /> Rota
              </a>
            </Button>
            {point.boletim_id && (
              <Button size="sm" variant="default" className="h-8 text-xs col-span-2" asChild>
                <a href={`/rg/boletim/${point.boletim_id}`}>
                  Abrir cadastro <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`text-right break-all ${mono ? "font-mono text-[11px]" : ""}`}>{value}</span>
    </div>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-lg bg-muted/60 border px-2 py-1.5 text-center">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className={`text-base font-bold tabular-nums ${accent ?? ""}`}>{value}</div>
    </div>
  );
}

/* ============= Skeleton ============= */

function MapSkeleton() {
  return (
    <div className="absolute inset-0 p-4 space-y-3">
      <Skeleton className="h-full w-full rounded-xl" />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="bg-card/80 backdrop-blur border rounded-xl px-4 py-2 flex items-center gap-2 text-sm shadow-md">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando inteligência territorial…
        </div>
      </div>
    </div>
  );
}

/* ============= Panel sub-sections ============= */

function SummarySection({
  counts, total,
}: { counts: Record<Category, number>; total: number }) {
  const items = [
    { label: "Total", value: total, color: "from-slate-500/15 to-slate-500/5", text: "text-slate-700 dark:text-slate-200", icon: <Building2 className="h-4 w-4" /> },
    { label: "Regular.", value: counts.clean, color: "from-emerald-500/20 to-emerald-500/5", text: "text-emerald-700 dark:text-emerald-300", icon: <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> },
    { label: "Pendências", value: counts.pendency, color: "from-orange-500/20 to-orange-500/5", text: "text-orange-700 dark:text-orange-300", icon: <span className="h-2.5 w-2.5 rounded-full bg-orange-500" /> },
    { label: "Focos", value: counts.focus, color: "from-rose-500/20 to-rose-500/5", text: "text-rose-700 dark:text-rose-300", icon: <Flame className="h-4 w-4" /> },
    { label: "PE", value: counts.strategic, color: "from-blue-500/20 to-blue-500/5", text: "text-blue-700 dark:text-blue-300", icon: <Target className="h-4 w-4" /> },
  ];
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Resumo</h3>
      <div className="grid grid-cols-2 gap-2">
        {items.map((it) => (
          <div key={it.label} className={`rounded-xl p-3 bg-gradient-to-br ${it.color} border`}>
            <div className={`flex items-center gap-1.5 text-[11px] ${it.text}`}>
              {it.icon}
              {it.label}
            </div>
            <div className="text-xl font-bold mt-1 tabular-nums">{it.value.toLocaleString("pt-BR")}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function DistributionsSection({
  statusCounts, total, locality, block, agent,
}: {
  statusCounts: Record<Category, number>;
  total: number;
  locality: [string, number][];
  block: [string, number][];
  agent: [string, number][];
}) {
  const statusRows: [string, number, string][] = [
    ["Regularizados", statusCounts.clean, CATEGORY_META.clean.color],
    ["Pendências", statusCounts.pendency, CATEGORY_META.pendency.color],
    ["Focos", statusCounts.focus, CATEGORY_META.focus.color],
    ["PE", statusCounts.strategic, CATEGORY_META.strategic.color],
  ];
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
        <BarChart3 className="h-3.5 w-3.5" /> Estatísticas
      </h3>
      <Card>
        <CardContent className="p-3 space-y-3">
          <BarBlock title="Por status" rows={statusRows.map(([l, v, c]) => ({ label: l, value: v, color: c }))} max={total} />
          <BarBlock title="Top localidades" rows={locality.map(([l, v]) => ({ label: l, value: v, color: "#0ea5e9" }))} max={total} />
          <BarBlock title="Top quarteirões" rows={block.map(([l, v]) => ({ label: l, value: v, color: "#8b5cf6" }))} max={total} />
          <BarBlock title="Top agentes" rows={agent.map(([l, v]) => ({ label: l, value: v, color: "#14b8a6" }))} max={total} />
        </CardContent>
      </Card>
    </section>
  );
}

function BarBlock({
  title, rows, max,
}: { title: string; rows: { label: string; value: number; color: string }[]; max: number }) {
  if (rows.length === 0) return null;
  const denom = Math.max(1, max);
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{title}</div>
      <div className="space-y-1">
        {rows.map((r) => {
          const pct = Math.round((r.value / denom) * 100);
          return (
            <div key={r.label} className="text-[11px]">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">{r.label}</span>
                <span className="tabular-nums text-muted-foreground shrink-0">
                  {r.value} <span className="opacity-60">({pct}%)</span>
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-0.5">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: r.color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LayersSection({
  showProperties, setShowProperties,
  showBlocks, setShowBlocks,
  showHeat, setShowHeat,
  heatMode, setHeatMode,
  baseLayer, setBaseLayer,
}: {
  showProperties: boolean; setShowProperties: (v: boolean) => void;
  showBlocks: boolean; setShowBlocks: (v: boolean) => void;
  showHeat: boolean; setShowHeat: (v: boolean) => void;
  heatMode: HeatMode; setHeatMode: (v: HeatMode) => void;
  baseLayer: BaseLayerId; setBaseLayer: (v: BaseLayerId) => void;
}) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
        <Layers className="h-3.5 w-3.5" /> Camadas
      </h3>
      <Card>
        <CardContent className="p-3 space-y-2.5">
          <LayerSwitch icon={<Building2 className="h-4 w-4 text-emerald-500" />} label="Imóveis" checked={showProperties} onChange={setShowProperties} />
          <LayerSwitch icon={<Layers className="h-4 w-4 text-blue-500" />} label="Quarteirões" checked={showBlocks} onChange={setShowBlocks} />
          <LayerSwitch icon={<Flame className="h-4 w-4 text-rose-500" />} label="Mapa de Calor" checked={showHeat} onChange={setShowHeat} />
          {showHeat && (
            <div className="pl-6 grid grid-cols-3 gap-1 animate-in fade-in slide-in-from-top-1">
              {([
                { id: "count", label: "Quantidade" },
                { id: "focus", label: "Focos" },
                { id: "pendency", label: "Pend." },
              ] as { id: HeatMode; label: string }[]).map((m) => (
                <button
                  key={m.id}
                  onClick={() => setHeatMode(m.id)}
                  className={`text-[10px] px-1.5 py-1 rounded-md border transition ${
                    heatMode === m.id ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
          <div className="pt-2 border-t">
            <div className="text-[11px] text-muted-foreground mb-1.5">Mapa base</div>
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.keys(BASE_LAYERS) as BaseLayerId[]).map((id) => (
                <button
                  key={id}
                  onClick={() => setBaseLayer(id)}
                  className={`text-[11px] px-2 py-1.5 rounded-lg border transition ${
                    baseLayer === id ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"
                  }`}
                >
                  {id === "carto" ? "Claro" : id === "osm" ? "OSM" : "Satélite"}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function LayerSwitch({
  icon, label, checked, onChange,
}: { icon: React.ReactNode; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 cursor-pointer">
      <span className="flex items-center gap-2 text-sm">
        {icon}
        {label}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function FiltersSection({
  search, setSearch, filter, setFilter, counts, total,
  preset, setPreset, from, to, setFrom, setTo,
}: {
  search: string; setSearch: (v: string) => void;
  filter: "all" | Category; setFilter: (v: "all" | Category) => void;
  counts: Record<Category, number>; total: number;
  preset: Preset; setPreset: (v: Preset) => void;
  from: string; to: string;
  setFrom: (v: string) => void; setTo: (v: string) => void;
}) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
        <SlidersHorizontal className="h-3.5 w-3.5" /> Filtros
      </h3>
      <Card>
        <CardContent className="p-3 space-y-2.5">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar rua, nº, quarteirão, localidade, agente, ID…"
              className="pl-8 h-9 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {([
              { id: "current", label: "SE Atual" },
              { id: "previous", label: "SE Anterior" },
              { id: "last4", label: "4 semanas" },
              { id: "custom", label: "Personalizado" },
            ] as { id: Preset; label: string }[]).map((p) => (
              <button
                key={p.id}
                onClick={() => setPreset(p.id)}
                className={`text-[11px] px-2 py-1.5 rounded-lg border transition ${
                  preset === p.id ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {preset === "custom" && (
            <div className="grid grid-cols-2 gap-1.5">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 text-xs" />
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 text-xs" />
            </div>
          )}

          <div className="flex flex-wrap gap-1.5 pt-1">
            {FILTERS.map((f) => {
              const active = filter === f.id;
              const count = f.id === "all" ? total : counts[f.id as Category];
              return (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition ${
                    active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"
                  }`}
                >
                  {f.label} <span className="opacity-70 ml-0.5">{count}</span>
                </button>
              );
            })}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 text-xs"
            onClick={() => { setSearch(""); setFilter("all"); setPreset("current"); }}
          >
            Limpar filtros
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}

function LegendSection({ counts }: { counts: Record<Category, number> }) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Legenda</h3>
      <Card>
        <CardContent className="p-3 space-y-1.5">
          {(Object.keys(CATEGORY_META) as Category[]).map((k) => (
            <div key={k} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full ring-2 ring-white shadow" style={{ background: CATEGORY_META[k].color }} />
                {CATEGORY_META[k].label}
              </span>
              <span className="text-muted-foreground text-xs tabular-nums">{counts[k]}</span>
            </div>
          ))}
          <div className="pt-2 border-t mt-2 space-y-1.5">
            {(["low", "med", "high"] as const).map((k) => (
              <div key={k} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: RISK_META[k].color }} />
                Risco {RISK_META[k].label}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function ExportSection({
  exportPDF, head, rows,
}: { exportPDF: () => void; head: string[]; rows: (string | number)[][] }) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Exportar</h3>
      <div className="grid grid-cols-3 gap-1.5">
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={exportPDF}>
          <FileText className="h-3.5 w-3.5 mr-1" /> PDF
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs"
          onClick={() => downloadXLSX("mapa.xls", "Imoveis", head, rows)} disabled={rows.length === 0}>
          <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> XLS
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs"
          onClick={() => downloadCSV("mapa.csv", head, rows)} disabled={rows.length === 0}>
          <Download className="h-3.5 w-3.5 mr-1" /> CSV
        </Button>
      </div>
    </section>
  );
}

/* ============= Map ============= */

function SafeMap({
  center,
  visiblePoints,
  showHeat,
  heatMode,
  showBlocks,
  showProperties,
  blocks,
  baseLayer,
  selectedId,
  onSelectPoint,
  flyTo,
}: {
  center: [number, number];
  visiblePoints: PropertyMapPoint[];
  showHeat: boolean;
  heatMode: HeatMode;
  showBlocks: boolean;
  showProperties: boolean;
  blocks: BlockRiskScore[];
  baseLayer: BaseLayerId;
  selectedId: string | null;
  onSelectPoint: (p: PropertyMapPoint) => void;
  flyTo: { lat: number; lng: number; ts: number } | null;
}) {
  try {
    const base = BASE_LAYERS[baseLayer];
    return (
      <MapContainer
        center={center}
        zoom={15}
        scrollWheelZoom
        zoomControl
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer key={baseLayer} attribution={base.attribution} url={base.url} />
        <FitBounds points={visiblePoints} />
        <FlyController target={flyTo} />
        {showHeat && <HeatLayer points={visiblePoints} mode={heatMode} />}
        {showBlocks &&
          blocks
            .filter((b) => isValidCoord(b.centroid?.lat, b.centroid?.lng))
            .map((b) => (
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
                eventHandlers={{
                  mouseover: (e) => e.target.setStyle({ fillOpacity: 0.45, weight: 3 }),
                  mouseout: (e) => e.target.setStyle({ fillOpacity: 0.25, weight: 2 }),
                }}
              >
                <Popup>
                  <BlockPopup block={b} />
                </Popup>
              </CircleMarker>
            ))}
        {!showHeat && showProperties && (
          <ClusterLayer points={visiblePoints} selectedId={selectedId} onSelect={onSelectPoint} />
        )}
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

function FlyController({ target }: { target: { lat: number; lng: number; ts: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    try {
      map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 18), { duration: 0.8 });
    } catch (err) {
      console.error("[MAP_FLY_ERROR]", err);
    }
  }, [target, map]);
  return null;
}

function ClusterLayer({
  points, selectedId, onSelect,
}: { points: PropertyMapPoint[]; selectedId: string | null; onSelect: (p: PropertyMapPoint) => void }) {
  const map = useMap();
  const groupRef = useRef<L.MarkerClusterGroup | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const group = (L as unknown as { markerClusterGroup: (o?: unknown) => L.MarkerClusterGroup })
      .markerClusterGroup({
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: true,
        maxClusterRadius: 50,
        iconCreateFunction: (cluster: { getChildCount: () => number }) => {
          const n = cluster.getChildCount();
          const size = n < 10 ? 34 : n < 100 ? 42 : 52;
          const inner = size - 8;
          return L.divIcon({
            html: `<div style="position:relative;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center">
              <div style="position:absolute;inset:0;border-radius:9999px;background:radial-gradient(circle at 30% 30%, rgba(59,130,246,0.95), rgba(37,99,235,0.85));box-shadow:0 4px 14px rgba(37,99,235,0.45),0 0 0 4px rgba(255,255,255,0.7)"></div>
              <div style="position:relative;display:flex;align-items:center;justify-content:center;width:${inner}px;height:${inner}px;color:#fff;font-weight:700;font-size:12px;font-family:system-ui">${n}</div>
            </div>`,
            className: "rg-cluster-icon",
            iconSize: [size, size],
          });
        },
      });
    groupRef.current = group;
    map.addLayer(group);
    return () => {
      try { map.removeLayer(group); } catch { /* noop */ }
      groupRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.clearLayers();
    const markers: L.Marker[] = [];
    for (const p of points) {
      const cat = classify(p);
      const meta = CATEGORY_META[cat];
      const isSel = selectedId === p.id;
      const size = isSel ? 22 : 14;
      const ring = isSel ? "3px solid #fff;box-shadow:0 0 0 3px rgba(37,99,235,0.55),0 2px 6px rgba(0,0,0,0.35)" : "2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4)";
      const icon = L.divIcon({
        html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${meta.color};border-radius:9999px;${isSel ? "" : ""};transition:all .2s;${ring.replace(/^/, "")}"></div>`,
        className: "rg-marker-icon",
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });
      const m = L.marker([p.latitude, p.longitude], {
        icon,
        title: `${p.street ?? ""} ${p.number ?? ""}`.trim(),
      });
      // Lightweight hover tooltip
      m.bindTooltip(
        `<div style="font-family:system-ui;font-size:11px;line-height:1.35">
          <div style="font-weight:600">${escapeHtml(p.id.slice(0, 8))} · ${meta.emoji} ${escapeHtml(meta.label)}</div>
          <div style="color:#475569">Quarteirão ${escapeHtml(p.block_number ?? "—")}</div>
          <div style="color:#475569">${escapeHtml(p.agent_name ?? "Sem agente")}</div>
        </div>`,
        { direction: "top", offset: [0, -6], opacity: 0.95, className: "rg-marker-tooltip" },
      );
      m.on("click", () => onSelectRef.current(p));
      markers.push(m);
    }
    group.addLayers(markers);
  }, [points, selectedId]);

  return null;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-muted rounded px-1 py-0.5">
      <div className="text-[9px] text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

function FitBounds({ points }: { points: PropertyMapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    try {
      if (points.length === 0) return;
      const valid = points.filter((p) => isValidCoord(p.latitude, p.longitude));
      if (valid.length === 0) return;
      const bounds = L.latLngBounds(valid.map((p) => [p.latitude, p.longitude]));
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
      }
    } catch (err) {
      console.error("[MAP_FITBOUNDS_ERROR]", err);
    }
  }, [points, map]);
  return null;
}

function HeatLayer({ points, mode }: { points: PropertyMapPoint[]; mode: HeatMode }) {
  const map = useMap();
  const layerRef = useRef<L.Layer | null>(null);
  useEffect(() => {
    try {
      const data: [number, number, number][] = points
        .filter((p) => isValidCoord(p.latitude, p.longitude))
        .map((p) => {
          let w = 0.3;
          if (mode === "focus") w = p.has_positive_focus ? 1 : 0.1;
          else if (mode === "pendency") w = p.has_pendency ? 0.9 : 0.1;
          else w = 0.5;
          return [p.latitude, p.longitude, w];
        });
      const heatFn = (L as unknown as { heatLayer?: (d: unknown, o: unknown) => L.Layer }).heatLayer;
      if (typeof heatFn !== "function") return;
      const layer = heatFn(data, {
        radius: 28, blur: 22, maxZoom: 17,
        gradient: { 0.2: "#16a34a", 0.5: "#f97316", 0.9: "#dc2626" },
      });
      layer.addTo(map);
      layerRef.current = layer;
    } catch (err) {
      console.error("[MAP_HEATMAP_ERROR]", err);
    }
    return () => {
      try { if (layerRef.current) map.removeLayer(layerRef.current); } catch { /* noop */ }
    };
  }, [points, mode, map]);
  return null;
}
