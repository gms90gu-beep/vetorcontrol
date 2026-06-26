// useMapEvents — assina eventos do Leaflet com tipagem amigável.
import { useEffect } from "react";
import L from "leaflet";

export type MapEventHandlers = Partial<{
  onZoomEnd: (m: L.Map) => void;
  onMoveEnd: (m: L.Map) => void;
  onClick: (e: L.LeafletMouseEvent) => void;
  onContextMenu: (e: L.LeafletMouseEvent) => void;
  onReady: (m: L.Map) => void;
}>;

export function useMapEvents(map: L.Map | null, handlers: MapEventHandlers) {
  useEffect(() => {
    if (!map) return;
    const bound: Array<[string, (...args: any[]) => void]> = [];
    if (handlers.onZoomEnd) bound.push(["zoomend", () => handlers.onZoomEnd!(map)]);
    if (handlers.onMoveEnd) bound.push(["moveend", () => handlers.onMoveEnd!(map)]);
    if (handlers.onClick) bound.push(["click", (e: any) => handlers.onClick!(e)]);
    if (handlers.onContextMenu) bound.push(["contextmenu", (e: any) => handlers.onContextMenu!(e)]);
    bound.forEach(([ev, fn]) => map.on(ev as any, fn));
    handlers.onReady?.(map);
    return () => { bound.forEach(([ev, fn]) => map.off(ev as any, fn)); };
  }, [map, handlers]);
}
