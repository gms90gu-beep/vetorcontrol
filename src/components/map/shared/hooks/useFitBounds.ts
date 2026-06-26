// useFitBounds — chama map.fitBounds quando os pontos mudam.
import { useEffect } from "react";
import L from "leaflet";

export function useFitBounds(
  map: L.Map | null,
  latLngs: Array<[number, number]>,
  opts?: { padding?: [number, number]; maxZoom?: number; enabled?: boolean },
) {
  useEffect(() => {
    if (!map || opts?.enabled === false || latLngs.length === 0) return;
    if (latLngs.length === 1) {
      map.setView(latLngs[0], Math.min(opts?.maxZoom ?? 18, map.getZoom() || 18));
      return;
    }
    const bounds = L.latLngBounds(latLngs.map((p) => L.latLng(p[0], p[1])));
    map.fitBounds(bounds, { padding: opts?.padding ?? [24, 24], maxZoom: opts?.maxZoom });
  }, [map, latLngs, opts?.padding, opts?.maxZoom, opts?.enabled]);
}
