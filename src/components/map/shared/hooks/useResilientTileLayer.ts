// useResilientTileLayer — attaches a TileLayer with automatic provider fallback.
// On tileerror it falls through TILE_PROVIDERS in order; reports failures to mapLogger.

import L from "leaflet";
import { TILE_PROVIDERS, TileProvider } from "../providers";
import { mapLogger } from "../logger";

export type TileLayerHandle = {
  layer: L.TileLayer;
  current: TileProvider;
  destroy: () => void;
};

export function attachResilientTileLayer(
  map: L.Map,
  opts?: {
    startId?: string;
    onProviderChange?: (p: TileProvider) => void;
    onAllFailed?: () => void;
    errorThreshold?: number;
  },
): TileLayerHandle {
  const threshold = opts?.errorThreshold ?? 6;
  const startIdx = Math.max(
    0,
    TILE_PROVIDERS.findIndex((p) => p.id === opts?.startId),
  );
  let idx = startIdx === -1 ? 0 : startIdx;
  const attempted = new Set<number>();
  let layer: L.TileLayer;
  let destroyed = false;

  const build = (provider: TileProvider) => {
    let localErrors = 0;
    const next = L.tileLayer(provider.url, {
      maxZoom: provider.maxZoom,
      maxNativeZoom: provider.maxNativeZoom,
      // Leaflet tries to read `.length` from `subdomains`. Passing undefined
      // crashes providers whose URL has no `{s}` placeholder (for example Esri).
      subdomains: (provider.subdomains ?? "abc") as any,
      attribution: provider.attribution,
      crossOrigin: true,
    });
    const onTileError = (e: L.TileErrorEvent) => {
      // Requests from a replaced provider may finish after fallback. They must
      // not count as failures of the provider that is active now.
      if (destroyed || next !== layer) return;
      localErrors += 1;
      mapLogger.warn("tile-error", "tile failed", {
        provider: provider.id,
        errors: localErrors,
        coords: e?.coords,
      });
      if (localErrors >= threshold) {
        attempted.add(idx);
        if (attempted.size < TILE_PROVIDERS.length) {
          let nextIdx = (idx + 1) % TILE_PROVIDERS.length;
          while (attempted.has(nextIdx)) nextIdx = (nextIdx + 1) % TILE_PROVIDERS.length;
          idx = nextIdx;
          mapLogger.warn("tile-fallback", "switching provider", {
            to: TILE_PROVIDERS[idx].id,
          });
          next.off("tileerror", onTileError);
          map.removeLayer(layer);
          layer = build(TILE_PROVIDERS[idx]);
          layer.addTo(map);
          opts?.onProviderChange?.(TILE_PROVIDERS[idx]);
        } else {
          mapLogger.error("tile-exhausted", "all providers failed");
          opts?.onAllFailed?.();
        }
      }
    };
    next.on("tileerror", onTileError);
    return next;
  };

  layer = build(TILE_PROVIDERS[idx]);
  layer.addTo(map);

  return {
    get layer() { return layer; },
    get current() { return TILE_PROVIDERS[idx]; },
    destroy: () => {
      destroyed = true;
      try { layer.off(); } catch { /* noop */ }
      try { map.removeLayer(layer); } catch { /* noop */ }
    },
  };
}
