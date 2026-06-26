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
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
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
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
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
  Maximize2,
  Minimize2,
  Navigation2,
  RefreshCw,
  Search,
  SlidersHorizontal,
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
  { id: "strategic", label: "PE" },
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
  const [showBlocks, setShowBlocks] = useState(false);
  const [showProperties, setShowProperties] = useState(true);
  const [baseLayer, setBaseLayer] = useState<BaseLayerId>("carto");
  const [fullscreen, setFullscreen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
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
      const hay = `${p.street ?? ""} ${p.number ?? ""} ${p.block_number ?? ""} ${p.locality ?? ""}`.toLowerCase();
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

  const PanelContent = (
    <div className="space-y-4">
      <SummarySection counts={counts} total={allPoints.length} />
      <LayersSection
        showProperties={showProperties}
        setShowProperties={setShowProperties}
        showBlocks={showBlocks}
        setShowBlocks={setShowBlocks}
        showHeat={showHeat}
        setShowHeat={setShowHeat}
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
      <ExportSection
        exportPDF={exportPDF}
        head={head}
        rows={rows}
      />
    </div>
  );

  return (
    <div className={fullscreen ? "fixed inset-0 z-50 bg-background" : "h-[calc(100vh-64px)] w-full"}>
      <div className="flex flex-col h-full">
        {/* TOP BAR */}
        <header className="border-b bg-card/60 backdrop-blur-md px-4 py-3 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-rose-500 to-orange-500 text-white shadow-sm">
              <MapPin className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold leading-tight truncate">
                Mapa de Inteligência Territorial
              </h1>
              <p className="text-[11px] text-muted-foreground leading-tight">
                Última sincronização: {lastSync}
              </p>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2 ml-2">
            <Pill icon={<Building2 className="h-3.5 w-3.5" />} label="Imóveis" value={allPoints.length} />
            <Pill icon={<Layers className="h-3.5 w-3.5" />} label="Quarteirões" value={territorialCounts.blocks} />
            <Pill icon={<Target className="h-3.5 w-3.5" />} label="Localidades" value={territorialCounts.localities} />
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
            {/* Mobile sheet trigger */}
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button size="sm" variant="default" className="lg:hidden">
                  <SlidersHorizontal className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-[85vh] overflow-y-auto">
                <div className="pt-4">{PanelContent}</div>
              </SheetContent>
            </Sheet>
          </div>
        </header>

        {/* MAIN SPLIT */}
        <div className="flex-1 min-h-0 flex">
          {/* MAP AREA */}
          <main className="flex-1 min-w-0 p-3">
            <div
              ref={mapWrapRef}
              className="relative h-full w-full rounded-2xl overflow-hidden border shadow-sm bg-muted/30"
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
                    showBlocks={showBlocks}
                    showProperties={showProperties}
                    blocks={blocks.data?.blocks ?? []}
                    baseLayer={baseLayer}
                  />
                  {/* Floating mini legend */}
                  <div className="absolute bottom-3 left-3 z-[400] bg-card/90 backdrop-blur-md border rounded-xl px-3 py-2 shadow-md hidden sm:flex items-center gap-3 text-[11px]">
                    {(Object.keys(CATEGORY_META) as Category[]).map((k) => (
                      <span key={k} className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: CATEGORY_META[k].color }} />
                        {CATEGORY_META[k].label}
                      </span>
                    ))}
                  </div>
                  {/* Cobertura GPS pill */}
                  <div className="absolute top-3 right-3 z-[400] bg-card/90 backdrop-blur-md border rounded-xl px-3 py-2 shadow-md text-[11px] flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-violet-500" />
                    <span className="font-semibold">{coverage.data?.coverage_pct ?? 0}%</span>
                    <span className="text-muted-foreground">cobertura GPS</span>
                  </div>
                </>
              )}
            </div>
          </main>

          {/* RIGHT PANEL — desktop */}
          <aside className="hidden lg:block w-[340px] xl:w-[380px] shrink-0 border-l bg-card/40 overflow-y-auto p-4">
            {PanelContent}
          </aside>
        </div>
      </div>
    </div>
  );
}

/* ============= Panel sub-sections ============= */

function Pill({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/60 border text-[11px]">
      {icon}
      <span className="text-muted-foreground">{label}</span>
      <span className="font-bold">{value.toLocaleString("pt-BR")}</span>
    </div>
  );
}

function SummarySection({
  counts, total,
}: { counts: Record<Category, number>; total: number }) {
  const items = [
    { label: "Total", value: total, color: "from-slate-500/15 to-slate-500/5", text: "text-slate-700 dark:text-slate-200", icon: <Building2 className="h-4 w-4" /> },
    { label: "Sem foco", value: counts.clean, color: "from-emerald-500/20 to-emerald-500/5", text: "text-emerald-700 dark:text-emerald-300", icon: <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> },
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
            <div className="text-xl font-bold mt-1">{it.value.toLocaleString("pt-BR")}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function LayersSection({
  showProperties, setShowProperties,
  showBlocks, setShowBlocks,
  showHeat, setShowHeat,
  baseLayer, setBaseLayer,
}: {
  showProperties: boolean; setShowProperties: (v: boolean) => void;
  showBlocks: boolean; setShowBlocks: (v: boolean) => void;
  showHeat: boolean; setShowHeat: (v: boolean) => void;
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
        <SlidersHorizontal className="h-3.5 w-3.5" /> Filtros rápidos
      </h3>
      <Card>
        <CardContent className="p-3 space-y-2.5">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar rua, nº, quarteirão…"
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
              <span className="text-muted-foreground text-xs">{counts[k]}</span>
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
  showBlocks,
  showProperties,
  blocks,
  baseLayer,
}: {
  center: [number, number];
  visiblePoints: PropertyMapPoint[];
  showHeat: boolean;
  showBlocks: boolean;
  showProperties: boolean;
  blocks: BlockRiskScore[];
  baseLayer: BaseLayerId;
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
        {showHeat && <HeatLayer points={visiblePoints} />}
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
              >
                <Popup>
                  <BlockPopup block={b} />
                </Popup>
              </CircleMarker>
            ))}
        {!showHeat && showProperties && (
          <ClusterLayer points={visiblePoints} />
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

function ClusterLayer({ points }: { points: PropertyMapPoint[] }) {
  const map = useMap();
  const groupRef = useRef<L.MarkerClusterGroup | null>(null);

  useEffect(() => {
    const group = (L as unknown as { markerClusterGroup: (o?: unknown) => L.MarkerClusterGroup })
      .markerClusterGroup({
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: true,
        maxClusterRadius: 50,
        iconCreateFunction: (cluster: { getChildCount: () => number }) => {
          const n = cluster.getChildCount();
          const size = n < 10 ? 32 : n < 100 ? 38 : 46;
          return L.divIcon({
            html: `<div style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:9999px;background:rgba(37,99,235,0.85);color:#fff;font-weight:700;font-size:12px;border:3px solid rgba(255,255,255,0.9);box-shadow:0 2px 8px rgba(0,0,0,0.25)">${n}</div>`,
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
      const icon = L.divIcon({
        html: `<div style="width:14px;height:14px;border-radius:9999px;background:${meta.color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4)"></div>`,
        className: "rg-marker-icon",
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      const m = L.marker([p.latitude, p.longitude], { icon, title: `${p.street ?? ""} ${p.number ?? ""}`.trim() });
      m.bindPopup(() => {
        const div = document.createElement("div");
        renderPointPopupHTML(div, p);
        return div;
      });
      markers.push(m);
    }
    group.addLayers(markers);
  }, [points]);

  return null;
}

function renderPointPopupHTML(container: HTMLElement, p: PropertyMapPoint) {
  const cat = classify(p);
  const meta = CATEGORY_META[cat];
  const risk = RISK_META[p.risk_level];
  const navUrl = `https://www.google.com/maps/search/?api=1&query=${p.latitude},${p.longitude}`;
  container.innerHTML = `
    <div style="font-family:system-ui;font-size:12px;min-width:240px">
      <div style="font-weight:600;font-size:13px">${escapeHtml(p.street ?? "Endereço não informado")}${p.number ? `, ${escapeHtml(String(p.number))}` : ""}</div>
      <div style="color:#64748b;margin-top:2px">Quarteirão ${escapeHtml(p.block_number ?? "—")}${p.locality ? ` · ${escapeHtml(p.locality)}` : ""}</div>
      <div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap">
        <span style="background:${meta.color};color:#fff;padding:2px 6px;border-radius:6px;font-size:10px">${meta.emoji} ${meta.label}</span>
        <span style="background:${risk.color};color:#fff;padding:2px 6px;border-radius:6px;font-size:10px">Risco ${risk.label} (${p.risk_score})</span>
      </div>
      <div style="margin-top:6px;color:#64748b">Agente: <span style="color:#0f172a">${escapeHtml(p.agent_name ?? "—")}</span></div>
      <div style="color:#64748b">Última visita: <span style="color:#0f172a">${escapeHtml(p.last_visit_at ?? "—")}</span></div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;text-align:center;margin-top:6px">
        <div style="background:#f1f5f9;border-radius:4px;padding:2px"><div style="font-size:9px;color:#64748b">Focos</div><div style="font-weight:600">${p.positive_foci_count}</div></div>
        <div style="background:#f1f5f9;border-radius:4px;padding:2px"><div style="font-size:9px;color:#64748b">Depósitos</div><div style="font-weight:600">${p.deposits_found}</div></div>
        <div style="background:#f1f5f9;border-radius:4px;padding:2px"><div style="font-size:9px;color:#64748b">Pend.</div><div style="font-weight:600">${p.pendency_count}</div></div>
      </div>
      <div style="margin-top:6px"><a href="${navUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#2563eb;color:#fff;padding:4px 8px;border-radius:6px;font-size:11px;text-decoration:none">↗ Navegar</a></div>
    </div>
  `;
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

function HeatLayer({ points }: { points: PropertyMapPoint[] }) {
  const map = useMap();
  const layerRef = useRef<L.Layer | null>(null);
  useEffect(() => {
    try {
      const data: [number, number, number][] = points
        .filter((p) => isValidCoord(p.latitude, p.longitude))
        .map((p) => [p.latitude, p.longitude, p.has_positive_focus ? 1 : 0.3]);
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
  }, [points, map]);
  return null;
}

// Unused import suppression — preserved for type completeness
void Link;
