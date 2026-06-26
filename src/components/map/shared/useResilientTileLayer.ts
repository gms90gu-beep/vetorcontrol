// useResilientTileLayer — attaches a TileLayer with automatic provider fallback.
// On tileerror it falls through TILE_PROVIDERS in order; reports failures to mapLogger.

import L from "leaflet";
import { TILE_PROVIDERS, TileProvider } from "./providers";
import { mapLogger } from "./logger";

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
  let errors = 0;
  let layer: L.TileLayer;

  const build = (provider: TileProvider) => {
    const next = L.tileLayer(provider.url, {
      maxZoom: provider.maxZoom,
      subdomains: provider.subdomains as any,
      attribution: provider.attribution,
      crossOrigin: true,
    });
    next.on("tileerror", (e) => {
      errors += 1;
      mapLogger.warn("tile-error", "tile failed", {
        provider: provider.id,
        errors,
        coords: (e as any)?.coords,
      });
      if (errors >= threshold) {
        if (idx < TILE_PROVIDERS.length - 1) {
          idx += 1;
          errors = 0;
          mapLogger.warn("tile-fallback", "switching provider", {
            to: TILE_PROVIDERS[idx].id,
          });
          map.removeLayer(layer);
          layer = build(TILE_PROVIDERS[idx]);
          layer.addTo(map);
          opts?.onProviderChange?.(TILE_PROVIDERS[idx]);
        } else {
          mapLogger.error("tile-exhausted", "all providers failed");
          opts?.onAllFailed?.();
        }
      }
    });
    return next;
  };

  layer = build(TILE_PROVIDERS[idx]);
  layer.addTo(map);

  return {
    get layer() { return layer; },
    get current() { return TILE_PROVIDERS[idx]; },
    destroy: () => {
      try { map.removeLayer(layer); } catch { /* noop */ }
    },
  };
}
