import { describe, expect, it } from "vitest";
import { buildPropertyCycleHistory, type PropertyCycleVisit } from "@/lib/map-cycle-history";

const visit = (overrides: Partial<PropertyCycleVisit> & Pick<PropertyCycleVisit, "id" | "cycle_id" | "visit_date">): PropertyCycleVisit => ({
  status: "visited",
  has_focus: false,
  activity_type: "survey",
  notes: null,
  treatment_amount: null,
  elimination_amount: null,
  treated_deposits: null,
  sample_collected: null,
  is_recovered: null,
  ...overrides,
});

describe("buildPropertyCycleHistory", () => {
  it("starts the selected year clean while preserving the prior year's visits", () => {
    const history = buildPropertyCycleHistory(
      [
        { id: "2025-c1", name: "Ciclo 1/2025", number: 1, year: 2025, status: "finished" },
        { id: "2026-c1", name: "Ciclo 1/2026", number: 1, year: 2026, status: "in_progress" },
        { id: "2026-c2", name: "Ciclo 2/2026", number: 2, year: 2026, status: "not_started" },
      ],
      [
        visit({ id: "old-visit", cycle_id: "2025-c1", visit_date: "2025-11-12", status: "closed" }),
        visit({ id: "current-visit", cycle_id: "2026-c1", visit_date: "2026-02-15", has_focus: true }),
      ],
      2026,
    );

    expect(history.map((cycle) => cycle.cycle_id)).toEqual(["2026-c1", "2026-c2"]);
    expect(history[0]?.visits.map((item) => item.id)).toEqual(["current-visit"]);
    expect(history[1]?.visits).toEqual([]);
  });

  it("shows every visit in a cycle from newest to oldest", () => {
    const history = buildPropertyCycleHistory(
      [{ id: "c1", name: "Ciclo 1", number: 1, year: 2026, status: "in_progress" }],
      [
        visit({ id: "older", cycle_id: "c1", visit_date: "2026-01-04" }),
        visit({ id: "newer", cycle_id: "c1", visit_date: "2026-02-03" }),
      ],
      2026,
    );

    expect(history[0]?.visits.map((item) => item.id)).toEqual(["newer", "older"]);
  });
});
