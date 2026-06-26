// SharedMap — componente raiz oficial. Internamente cria a instância Leaflet,
// aplica tiles resilientes, gerencia fases, expõe a instância via contexto.
import { useEffect, useRef, useState, type ReactNode } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cn } from "@/lib/utils";
import { SharedMapContext } from "./context";
import { attachResilientTileLayer } from "./hooks/useResilientTileLayer";
import { useMapResize } from "./hooks/useMapResize";
import { SharedMapSkeleton } from "./SharedLoading";
import { SharedError } from "./SharedError";
import { SharedLegend, DEFAULT_LEGEND, type LegendEntry } from "./SharedLegend";
import { mapLogger } from "./logger";
import type { TileProvider } from "./providers";

export type SharedMapPhase =
  | "loading-data" | "data-error" | "no-data" | "mounting" | "ready" | "tile-error";

export interface SharedMapProps {
  // Estado dos dados (controlado pelo consumidor)
  loading?: boolean;
  loadError?: string | null;
  isEmpty?: boolean;             // sem registros (para "no-data")
  onRetryLoad?: () => void;

  // Configuração do mapa
  center?: L.LatLngExpression;
  zoom?: number;
  tileProviderId?: string;
  onProviderChange?: (p: TileProvider) => void;

  // Legenda
  legend?: ReactNode | "default" | "none";
  legendEntries?: LegendEntry[];
  legendTrailing?: ReactNode;

  // Eventos
  onReady?: (map: L.Map) => void;

  // UI
  className?: string;
  height?: number | string;
  emptyVariant?: "no-data" | "no-geo";
  children?: ReactNode; // <SharedMarkerLayer/>, <SharedPolygonLayer/>, etc.
}

export function SharedMap({
  loading = false,
  loadError = null,
  isEmpty = false,
  onRetryLoad,
  center = [-15.78, -47.93],
  zoom = 13,
  tileProviderId,
  onProviderChange,
  legend = "default",
  legendEntries,
  legendTrailing,
  onReady,
  className,
  height = "60vh",
  emptyVariant = "no-data",
  children,
}: SharedMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<ReturnType<typeof attachResilientTileLayer> | null>(null);
  const [map, setMap] = useState<L.Map | null>(null);
  const [provider, setProvider] = useState<TileProvider | null>(null);
  const [phase, setPhase] = useState<SharedMapPhase>("mounting");
  const [renderToken, setRenderToken] = useState(0);

  useMapResize(map, containerRef);

  // Determina fase quando entradas mudam
  useEffect(() => {
    if (loading) { setPhase("loading-data"); return; }
    if (loadError) { setPhase("data-error"); return; }
    if (isEmpty) { setPhase(emptyVariant === "no-geo" ? "no-data" : "no-data"); return; }
    setPhase((prev) => (prev === "ready" ? "ready" : "mounting"));
  }, [loading, loadError, isEmpty, emptyVariant]);

  // Cria a instância Leaflet quando estamos em "mounting"
  useEffect(() => {
    if (!containerRef.current || phase === "loading-data" || phase === "data-error" || phase === "no-data") return;
    if (mapRef.current) return; // já montado

    try {
      const inst = L.map(containerRef.current, { center, zoom, preferCanvas: true });
      mapRef.current = inst;
      tileRef.current = attachResilientTileLayer(inst, {
        startId: tileProviderId,
        onProviderChange: (p) => { setProvider(p); onProviderChange?.(p); },
        onAllFailed: () => setPhase("tile-error"),
      });
      setProvider(tileRef.current.current);
      setMap(inst);
      setPhase("ready");
      onReady?.(inst);
    } catch (err) {
      mapLogger.error("shared-map-init", "map init failed", { error: (err as Error)?.message });
      setPhase("tile-error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, renderToken]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      tileRef.current?.destroy();
      mapRef.current?.remove();
      mapRef.current = null;
      tileRef.current = null;
      setMap(null);
    };
  }, []);

  const retry = () => {
    tileRef.current?.destroy();
    mapRef.current?.remove();
    mapRef.current = null;
    tileRef.current = null;
    setMap(null);
    setRenderToken((n) => n + 1);
    setPhase("mounting");
  };

  const showMap = phase === "ready" || phase === "mounting";
  const legendNode =
    legend === "none" ? null :
    legend === "default" ? <SharedLegend entries={legendEntries ?? DEFAULT_LEGEND} trailing={legendTrailing} /> :
    legend;

  return (
    <div className={cn("space-y-2", className)}>
      {legendNode}
      <div
        className="relative w-full rounded-lg border border-slate-200 bg-slate-100 overflow-hidden"
        style={{ height }}
      >
        <div
          ref={containerRef}
          className={cn(
            "absolute inset-0 transition-opacity duration-300",
            phase === "ready" ? "opacity-100" : "opacity-0 pointer-events-none",
          )}
          aria-hidden={phase !== "ready"}
        />
        {phase === "mounting" && <SharedMapSkeleton />}
        {phase === "loading-data" && <SharedMapSkeleton />}
        {phase === "data-error" && <SharedError variant="data" description={loadError ?? undefined} onRetry={onRetryLoad} />}
        {phase === "no-data" && <SharedError variant={emptyVariant} />}
        {phase === "tile-error" && <SharedError variant="tile" onRetry={retry} />}

        {showMap && map && (
          <SharedMapContext.Provider value={{ map }}>{children}</SharedMapContext.Provider>
        )}
      </div>
      {provider && phase === "ready" && (
        <p className="text-[10px] text-slate-400 text-right">Fonte: {provider.name}</p>
      )}
    </div>
  );
}
