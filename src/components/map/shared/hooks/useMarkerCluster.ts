// useMarkerCluster — cria e mantém um cluster sincronizado com pontos/layers.
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet.markercluster";

export type ClusterOptions = {
  enabled?: boolean;
  maxClusterRadius?: number;
  chunkedLoading?: boolean;
  showCoverageOnHover?: boolean;
  spiderfyOnMaxZoom?: boolean;
};

export function useMarkerCluster(
  map: L.Map | null,
  buildLayers: () => L.Layer[],
  deps: ReadonlyArray<unknown>,
  opts: ClusterOptions = {},
) {
  const groupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!map) return;
    const enabled = opts.enabled !== false;
    const group: L.LayerGroup = enabled
      ? ((L as any).markerClusterGroup({
          maxClusterRadius: opts.maxClusterRadius ?? 40,
          chunkedLoading: opts.chunkedLoading ?? true,
          showCoverageOnHover: opts.showCoverageOnHover ?? false,
          spiderfyOnMaxZoom: opts.spiderfyOnMaxZoom ?? true,
        }) as L.LayerGroup)
      : L.layerGroup();

    buildLayers().forEach((layer) => group.addLayer(layer));
    map.addLayer(group);
    groupRef.current = group;
    return () => {
      try { map.removeLayer(group); } catch { /* noop */ }
      groupRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, ...deps]);

  return groupRef;
}
