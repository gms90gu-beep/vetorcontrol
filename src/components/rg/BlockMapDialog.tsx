import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Inbox, Loader2, MapPinOff, RefreshCw } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { attachResilientTileLayer } from "@/components/map/shared/hooks/useResilientTileLayer";
import { MARKER_COLORS, classifyProperty, TileProvider } from "@/components/map/shared/providers";
import { mapLogger } from "@/components/map/shared/logger";

export type BlockMapProperty = {
  id: string;
  number: string;
  street_name: string | null;
  type: string | null;
  latitude: number | null;
  longitude: number | null;
  had_previous_focus?: boolean | null;
  status?: string | null;
  has_pendency?: boolean | null;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  blockNumber: string | null;
  properties: BlockMapProperty[];
  loading?: boolean;
  loadError?: string | null;
  onRetryLoad?: () => void;
}

type Phase =
  | "loading-data"        // consulta de imóveis em andamento
  | "data-error"          // erro ao carregar imóveis
  | "no-properties"       // nenhum imóvel encontrado
  | "no-geo"              // imóveis sem coordenadas
  | "mounting"            // skeleton enquanto o mapa monta
  | "ready"               // mapa carregado
  | "tile-error";         // todos os provedores falharam

export function BlockMapDialog({
  open,
  onOpenChange,
  blockNumber,
  properties,
  loading = false,
  loadError = null,
  onRetryLoad,
}: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const tileHandleRef = useRef<ReturnType<typeof attachResilientTileLayer> | null>(null);
  const [phase, setPhase] = useState<Phase>("mounting");
  const [provider, setProvider] = useState<TileProvider | null>(null);
  const [renderToken, setRenderToken] = useState(0);

  const geo = properties.filter((p) => p.latitude != null && p.longitude != null);

  // Determina a fase a partir das entradas
  useEffect(() => {
    if (!open) return;
    if (loading) { setPhase("loading-data"); return; }
    if (loadError) { setPhase("data-error"); return; }
    if (properties.length === 0) { setPhase("no-properties"); return; }
    if (geo.length === 0) { setPhase("no-geo"); return; }
    setPhase("mounting");
  }, [open, loading, loadError, properties.length, geo.length, renderToken]);

  // Monta o mapa quando estamos prontos para renderizar
  useEffect(() => {
    if (!open || phase !== "mounting" || !mapRef.current || geo.length === 0) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled || !mapRef.current) return;
      try {
        if (mapInstance.current) {
          tileHandleRef.current?.destroy();
          mapInstance.current.remove();
          mapInstance.current = null;
        }

        const center: L.LatLngExpression = [geo[0].latitude as number, geo[0].longitude as number];
        const map = L.map(mapRef.current, { center, zoom: 18, preferCanvas: true });
        mapInstance.current = map;

        tileHandleRef.current = attachResilientTileLayer(map, {
          onProviderChange: (p) => setProvider(p),
          onAllFailed: () => setPhase("tile-error"),
        });
        setProvider(tileHandleRef.current.current);

        const cluster = (L as any).markerClusterGroup({
          showCoverageOnHover: false,
          spiderfyOnMaxZoom: true,
          chunkedLoading: true,
          maxClusterRadius: 40,
        }) as L.LayerGroup;

        const bounds = L.latLngBounds([]);
        geo.forEach((p) => {
          const { color, label } = classifyProperty(p);
          const pos: L.LatLngExpression = [p.latitude as number, p.longitude as number];
          const marker = L.circleMarker(pos, {
            radius: 9,
            fillColor: color,
            fillOpacity: 1,
            color: "#fff",
            weight: 2,
          });
          marker.bindPopup(
            `<div style="font-family:system-ui;font-size:12px"><b>Nº ${p.number}</b><br/>${
              p.street_name ?? ""
            }<br/><span style="color:${color}">●</span> ${label}</div>`,
          );
          cluster.addLayer(marker);
          bounds.extend(pos);
        });

        map.addLayer(cluster);
        if (geo.length > 1) map.fitBounds(bounds, { padding: [24, 24] });
        setTimeout(() => map.invalidateSize(), 80);
        setPhase("ready");
      } catch (err) {
        mapLogger.error("render-failed", "block map render failed", {
          error: (err as Error)?.message,
          block: blockNumber,
        });
        setPhase("tile-error");
      }
    }, 60);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, phase, renderToken]);

  // Cleanup ao fechar
  useEffect(() => {
    if (open) return;
    tileHandleRef.current?.destroy();
    tileHandleRef.current = null;
    mapInstance.current?.remove();
    mapInstance.current = null;
    setProvider(null);
  }, [open]);

  const retry = () => {
    tileHandleRef.current?.destroy();
    tileHandleRef.current = null;
    mapInstance.current?.remove();
    mapInstance.current = null;
    setRenderToken((n) => n + 1);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Mapa do quarteirão {blockNumber ?? "—"}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-4 text-[11px] font-bold text-slate-600 flex-wrap">
          <Legend color={MARKER_COLORS.clean} label="Sem foco" />
          <Legend color={MARKER_COLORS.focus} label="Foco positivo" />
          <Legend color={MARKER_COLORS.pendency} label="Pendência" />
          <Legend color={MARKER_COLORS.strategic} label="Ponto estratégico" />
          <span className="ml-auto text-slate-500 font-normal">
            {geo.length} de {properties.length} georreferenciados
            {provider && phase === "ready" ? ` · ${provider.name}` : ""}
          </span>
        </div>

        <div className="relative w-full h-[60vh] rounded-lg border border-slate-200 bg-slate-100 overflow-hidden">
          {/* Map container — sempre montado para que o Leaflet tenha o div */}
          <div
            ref={mapRef}
            className={`absolute inset-0 transition-opacity duration-300 ${
              phase === "ready" ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
            aria-hidden={phase !== "ready"}
          />

          {phase === "mounting" && <SkeletonMap />}
          {phase === "loading-data" && (
            <Overlay icon={<Loader2 className="h-6 w-6 animate-spin" />} title="Carregando imóveis…" />
          )}
          {phase === "data-error" && (
            <Overlay
              tone="danger"
              icon={<AlertTriangle className="h-6 w-6" />}
              title="Não foi possível carregar os imóveis"
              description={loadError ?? "Erro ao consultar a base."}
              action={
                onRetryLoad && (
                  <Button size="sm" variant="outline" onClick={onRetryLoad}>
                    <RefreshCw className="h-4 w-4 mr-2" /> Tentar novamente
                  </Button>
                )
              }
            />
          )}
          {phase === "no-properties" && (
            <Overlay
              icon={<Inbox className="h-6 w-6" />}
              title="Nenhum imóvel encontrado"
              description="Este quarteirão ainda não possui imóveis cadastrados."
            />
          )}
          {phase === "no-geo" && (
            <Overlay
              icon={<MapPinOff className="h-6 w-6" />}
              title="Sem coordenadas registradas"
              description="Nenhum imóvel deste quarteirão possui coordenadas. Capture a localização nas próximas visitas."
            />
          )}
          {phase === "tile-error" && (
            <Overlay
              tone="danger"
              icon={<AlertTriangle className="h-6 w-6" />}
              title="Falha ao carregar o mapa"
              description="Todos os provedores de mapas estão indisponíveis no momento."
              action={
                <Button size="sm" variant="outline" onClick={retry}>
                  <RefreshCw className="h-4 w-4 mr-2" /> Tentar novamente
                </Button>
              }
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center">
      <span className="inline-block w-3 h-3 rounded-full mr-1 align-middle" style={{ background: color }} />
      {label}
    </span>
  );
}

function SkeletonMap() {
  return (
    <div className="absolute inset-0 p-3 space-y-2 animate-in fade-in duration-200">
      <Skeleton className="h-full w-full rounded-md" />
    </div>
  );
}

function Overlay({
  icon, title, description, action, tone = "default",
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-50/95 text-center px-6 animate-in fade-in duration-200">
      <div
        className={`grid h-12 w-12 place-items-center rounded-2xl ${
          tone === "danger" ? "bg-red-100 text-red-600" : "bg-slate-200 text-slate-600"
        }`}
        aria-hidden
      >
        {icon}
      </div>
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {description && <p className="text-xs text-slate-500 max-w-md">{description}</p>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}
