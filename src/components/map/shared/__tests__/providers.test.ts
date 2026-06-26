import { describe, it, expect } from "vitest";
import { TILE_PROVIDERS, getProvider, classifyProperty, MARKER_COLORS } from "../providers";

describe("map providers", () => {
  it("Carto Positron is the default provider", () => {
    expect(TILE_PROVIDERS[0].id).toBe("carto-positron");
  });
  it("fallback order includes OSM and Esri", () => {
    expect(TILE_PROVIDERS.map((p) => p.id)).toEqual([
      "carto-positron", "osm", "esri-imagery",
    ]);
  });
  it("getProvider returns default for unknown id", () => {
    expect(getProvider("nope").id).toBe("carto-positron");
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
