import { describe, it, expect, vi } from "vitest";

// Mock leaflet — only the surface used by attachResilientTileLayer
vi.mock("leaflet", () => {
  type Handler = (e: any) => void;
  class FakeTileLayer {
    handlers = new Map<string, Handler>();
    constructor(public url: string, public opts: any) {}
    on(event: string, fn: Handler) { this.handlers.set(event, fn); return this; }
    off(event?: string, fn?: Handler) {
      if (!event) this.handlers.clear();
      else if (!fn || this.handlers.get(event) === fn) this.handlers.delete(event);
      return this;
    }
    addTo(_map: any) { return this; }
    fire(event: string, payload: any) { this.handlers.get(event)?.(payload); }
  }
  const tileLayer = (url: string, opts: any) => new FakeTileLayer(url, opts);
  const map = { removeLayer: vi.fn() };
  return { default: { tileLayer, Map: class {} }, tileLayer, Map: class {} , __map: map };
});

import L from "leaflet";
import { attachResilientTileLayer } from "../hooks/useResilientTileLayer";
import { TILE_PROVIDERS } from "../providers";

function makeMap() {
  return { removeLayer: vi.fn() } as unknown as L.Map;
}

describe("attachResilientTileLayer", () => {
  it("switches to the next provider after threshold errors", () => {
    const map = makeMap();
    const onChange = vi.fn();
    const handle = attachResilientTileLayer(map, { onProviderChange: onChange, errorThreshold: 3 });
    expect(handle.current.id).toBe(TILE_PROVIDERS[0].id);
    for (let i = 0; i < 3; i++) (handle.layer as any).fire("tileerror", {});
    expect(onChange).toHaveBeenCalledWith(TILE_PROVIDERS[1]);
    expect(handle.current.id).toBe(TILE_PROVIDERS[1].id);
  });

  it("calls onAllFailed after exhausting providers", () => {
    const map = makeMap();
    const onFail = vi.fn();
    const handle = attachResilientTileLayer(map, { onAllFailed: onFail, errorThreshold: 1 });
    for (let i = 0; i < TILE_PROVIDERS.length; i++) (handle.layer as any).fire("tileerror", {});
    expect(onFail).toHaveBeenCalledTimes(1);
  });

  it("ignores late errors from a provider that was already replaced", () => {
    const map = makeMap();
    const onFail = vi.fn();
    const handle = attachResilientTileLayer(map, { onAllFailed: onFail, errorThreshold: 1 });
    const firstLayer = handle.layer as any;
    firstLayer.fire("tileerror", {});
    firstLayer.fire("tileerror", {});
    expect(handle.current.id).toBe(TILE_PROVIDERS[1].id);
    expect(onFail).not.toHaveBeenCalled();
  });

  it("always passes valid subdomains to Leaflet", () => {
    const map = makeMap();
    const handle = attachResilientTileLayer(map, { startId: "esri-imagery" });
    expect((handle.layer as any).opts.subdomains).toBe("abc");
  });
});
