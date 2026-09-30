import { describe, it, expect } from "vitest";
import { TILE_PROVIDERS, getProvider, classifyProperty, MARKER_COLORS } from "../providers";

describe("map providers", () => {
  it("OpenStreetMap is the default provider", () => {
    expect(TILE_PROVIDERS[0].id).toBe("osm");
  });
  it("fallback order includes OSM and Esri without an unkeyed CARTO layer", () => {
    expect(TILE_PROVIDERS.map((p) => p.id)).toEqual(["osm", "esri-imagery"]);
  });
  it("getProvider returns default for unknown id", () => {
    expect(getProvider("nope").id).toBe("osm");
  });
});

describe("classifyProperty", () => {
  it("flags focus first", () => {
    expect(classifyProperty({ had_previous_focus: true, has_pendency: true }).color)
      .toBe(MARKER_COLORS.focus);
  });
  it("flags pendency when no focus", () => {
    expect(classifyProperty({ has_pendency: true }).color).toBe(MARKER_COLORS.pendency);
  });
  it("flags strategic point", () => {
    expect(classifyProperty({ type: "strategic_point" }).color).toBe(MARKER_COLORS.strategic);
  });
  it("falls back to clean", () => {
    expect(classifyProperty({}).color).toBe(MARKER_COLORS.clean);
  });
});
