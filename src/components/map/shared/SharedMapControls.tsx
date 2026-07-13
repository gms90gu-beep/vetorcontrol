// SharedMapControls — botões flutuantes de controle do mapa:
// alternância de camadas cartográficas, zoom, minha localização,
// centralizar todos os pontos, atualizar.
import { useEffect, useMemo, useRef, useState } from "react";
import { Layers, Plus, Minus, LocateFixed, Maximize2, RotateCw, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSharedMapContext } from "./context";
import { BASE_LAYERS, BASE_LAYER_ORDER, autoBaseLayerForTime, type BaseLayerId } from "./base-layers";

export interface SharedMapControlsProps {
  /** Pontos [lat, lng] para o botão "Centralizar Quarteirão". */
  fitPoints?: Array<[number, number]>;
  /** Callback para o botão "Atualizar" (refetch). */
  onRefresh?: () => void;
  /** Mostrar/ocultar botões individuais. */
  showZoom?: boolean;
  showLocate?: boolean;
  showFit?: boolean;
  showRefresh?: boolean;
  showLayers?: boolean;
  /** Ativar noturno automaticamente após 18h. */
  autoNight?: boolean;
  className?: string;
}

export function SharedMapControls({
  fitPoints,
  onRefresh,
  showZoom = true,
  showLocate = true,
  showFit = true,
  showRefresh = true,
  showLayers = true,
  autoNight = false,
  className,
}: SharedMapControlsProps) {
  const { map, activeBaseLayerId, changeBaseLayer } = useSharedMapContext();
  const [menuOpen, setMenuOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const autoAppliedRef = useRef(false);

  // Auto-noturno após 18h (apenas uma vez após montar).
  useEffect(() => {
    if (!autoNight || autoAppliedRef.current) return;
    if (!changeBaseLayer) return;
    const pick = autoBaseLayerForTime();
    if (pick === "night" && activeBaseLayerId !== "night") {
      changeBaseLayer("night");
    }
    autoAppliedRef.current = true;
  }, [autoNight, changeBaseLayer, activeBaseLayerId]);

  // Fecha menu ao clicar fora.
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const currentLayer = useMemo<BaseLayerId>(
    () => activeBaseLayerId ?? "operational",
    [activeBaseLayerId],
  );

  const handleLocate = () => {
    if (!map || typeof navigator === "undefined" || !navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.setView(
          [pos.coords.latitude, pos.coords.longitude],
          Math.max(map.getZoom(), 17),
          { animate: true },
        );
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 },
    );
  };

  const handleFit = () => {
    if (!map || !fitPoints || fitPoints.length === 0) return;
    if (fitPoints.length === 1) {
      map.setView(fitPoints[0], Math.max(map.getZoom(), 17), { animate: true });
      return;
    }
    // dynamic import via any to avoid pulling Leaflet symbols in this consumer file
    const L = (map as any).constructor.prototype.constructor as any;
    // fallback: use map.eachLayer bounds using LatLngBounds via map's internal L
    const anyMap = map as any;
    const LGlobal = anyMap._container ? (anyMap._container.ownerDocument.defaultView as any).L : null;
    const LL = LGlobal ?? L;
    if (LL?.latLngBounds) {
      const bounds = LL.latLngBounds(fitPoints.map((p: [number, number]) => LL.latLng(p[0], p[1])));
      map.fitBounds(bounds, { padding: [32, 32], maxZoom: 18 });
    }
  };

  return (
    <>
      <div className={cn("absolute top-2 right-2 z-[500] flex flex-col gap-1.5", className)}>
        {showZoom && (
          <>
            <ControlButton title="Aproximar" onClick={() => map?.zoomIn()}>
              <Plus className="h-4 w-4" />
            </ControlButton>
            <ControlButton title="Afastar" onClick={() => map?.zoomOut()}>
              <Minus className="h-4 w-4" />
            </ControlButton>
          </>
        )}
        {showLocate && (
          <ControlButton
            title="Minha localização"
            onClick={handleLocate}
            active={locating}
          >
            <LocateFixed className={cn("h-4 w-4", locating && "animate-pulse")} />
          </ControlButton>
        )}
        {showFit && fitPoints && fitPoints.length > 0 && (
          <ControlButton title="Centralizar quarteirão" onClick={handleFit}>
            <Maximize2 className="h-4 w-4" />
          </ControlButton>
        )}
        {showRefresh && onRefresh && (
          <ControlButton title="Atualizar" onClick={onRefresh}>
            <RotateCw className="h-4 w-4" />
          </ControlButton>
        )}
        {showLayers && changeBaseLayer && (
          <div ref={menuRef} className="relative">
            <ControlButton
              title="Camadas"
              onClick={() => setMenuOpen((v) => !v)}
              active={menuOpen}
            >
              <Layers className="h-4 w-4" />
            </ControlButton>
            {menuOpen && (
              <div className="absolute right-full top-0 mr-1.5 w-52 rounded-lg border border-slate-200 bg-white shadow-lg overflow-hidden">
                <div className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-100">
                  Camadas do mapa
                </div>
                <ul>
                  {BASE_LAYER_ORDER.map((id) => {
                    const l = BASE_LAYERS[id];
                    const active = currentLayer === id;
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          onClick={() => {
                            changeBaseLayer(id);
                            setMenuOpen(false);
                          }}
                          className={cn(
                            "w-full flex items-start gap-2 px-3 py-2 text-left transition text-xs",
                            active ? "bg-blue-50 text-blue-900" : "hover:bg-slate-50 text-slate-700",
                          )}
                        >
                          <span className="text-base leading-none pt-0.5">{l.emoji}</span>
                          <span className="flex-1 min-w-0">
                            <span className="block font-bold truncate">{l.name}</span>
                            <span className="block text-[10px] text-slate-500 truncate">
                              {l.description}
                            </span>
                          </span>
                          {active && <Check className="h-3.5 w-3.5 mt-0.5 text-blue-600" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function ControlButton({
  children, onClick, title, active,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        "h-9 w-9 flex items-center justify-center rounded-md border shadow-sm transition",
        active
          ? "bg-blue-600 text-white border-blue-600"
          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-slate-900",
      )}
    >
      {children}
    </button>
  );
}
