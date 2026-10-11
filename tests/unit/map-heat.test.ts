import { expect, it } from "vitest";
import { buildMapHeatData, mapHeatOptions } from "@/lib/map-heat";
const healthy = { latitude: -10, longitude: -38 };
const observed = { ...healthy, latitude: -10.1, has_observed_focus: true };
const positive = { ...healthy, latitude: -10.2, has_positive_focus: true, has_observed_focus: true };
const pending = { ...healthy, latitude: -10.3, has_pendency: true };
it("excludes healthy houses from occurrence heat and counts each property once", () => {
  const points = [healthy, observed, positive, pending];
  expect(buildMapHeatData(points, "focus")).toEqual([[-10.1, -38, 1], [-10.2, -38, 1]]);
  expect(buildMapHeatData(points, "positive")).toEqual([[-10.2, -38, 1]]);
  expect(buildMapHeatData(points, "observed")).toHaveLength(2);
  expect(buildMapHeatData(points, "pendency")).toEqual([[-10.3, -38, 1]]);
  expect(buildMapHeatData(points, "count")).toHaveLength(4);
});
it("has no false heat when there are no occurrences and excludes invalid coordinates", () => {
  expect(buildMapHeatData([healthy], "focus")).toEqual([]);
  expect(buildMapHeatData([{ latitude: NaN, longitude: -38 }, { latitude: 91, longitude: 0 }], "count")).toEqual([]);
});
it("adapts radius to zoom and retains headroom for a thousand overlapping houses", () => {
  const dense = Array.from({ length: 1020 }, () => ({ x: 100, y: 100, weight: 1 }));
  const options = mapHeatOptions(10, dense);
  expect(options.max).toBeGreaterThan(1020);
  expect(options.radius).toBeLessThan(mapHeatOptions(17, dense).radius);
  expect(options.maxZoom).toBe(10);
  expect(mapHeatOptions(17, []).max).toBe(3);
});
