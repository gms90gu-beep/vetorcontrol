import { describe, expect, it } from "vitest";
import { filterPendencies } from "@/lib/pendency-scope";

describe("pendency scope", () => {
  const rows = [
    { id: "current", property_id: "p1", cycle_id: "c-current", week_id: "w1", agent_id: "a1", resolved_at: null },
    { id: "history", property_id: "p1", cycle_id: "c-history", week_id: "w9", agent_id: "a1", resolved_at: null },
    { id: "other-agent", property_id: "p2", cycle_id: "c-current", week_id: "w1", agent_id: "a2", resolved_at: null },
    { id: "resolved", property_id: "p3", cycle_id: "c-current", week_id: "w1", agent_id: "a1", resolved_at: "2026-10-01T12:00:00Z" },
  ];

  it("separates the same property between cycles", () => {
    expect(filterPendencies(rows, { cycleId: "c-current" }).map((r) => r.id)).toEqual([
      "current", "other-agent", "resolved",
    ]);
  });

  it("applies agent, week and open filters to cached and remote rows alike", () => {
    expect(filterPendencies(rows, {
      cycleId: "c-current",
      weekId: "w1",
      agentId: "a1",
      onlyOpen: true,
    }).map((r) => r.id)).toEqual(["current"]);
  });

  it("limits manager cache fallback to visible agents", () => {
    expect(filterPendencies(rows, {
      cycleId: "c-current",
      visibleAgentIds: new Set(["a2"]),
      onlyOpen: true,
    }).map((r) => r.id)).toEqual(["other-agent"]);
  });
});
