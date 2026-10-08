import { expect, it } from "vitest";
import { summarizePendencyCycles } from "@/lib/pendency-summary";

it("separates current cycle from historical active, resolved and total", () => {
  expect(summarizePendencyCycles([
    { cycle_id: "current", resolved_at: null },
    { cycle_id: "old", resolved_at: null },
    { cycle_id: "old", resolved_at: "2026-10-01" },
    { cycle_id: null, resolved_at: null },
  ], "current")).toEqual([
    { cycle_id: "old", active: 1, resolved: 1, total: 2 },
    { cycle_id: null, active: 1, resolved: 0, total: 1 },
  ]);
});