import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/offline/safe-fetch", () => ({ isOnline: () => true }));

vi.mock("@/integrations/supabase/client", async () => {
  const { createSupabaseMock } = await import("../mocks/supabase");
  const mocked = createSupabaseMock({
    tables: {
      visits: {
        rows: [
          { id: "v1", status: "closed", has_focus: false, property_id: "p1" },
          { id: "v2", status: "refused", has_focus: false, property_id: "p2" },
          { id: "v3", status: "visited", has_focus: true, property_id: "p3" },
        ],
      },
      visit_deposits: { rows: [{ visit_id: "v3", type_code: "A1", quantity: 2, is_positive: true }] },
      daily_work_records: {
        rows: [{
          properties_worked: 3, properties_closed: 1, properties_refused: 1,
          positive_foci: 1, deposits_inspected: 2,
        }],
      },
    },
  });
  return { supabase: mocked.client };
});

import { runProductionIntegrity } from "@/lib/production-integrity";

describe("production-integrity", () => {
  it("returns score 100 when snapshots match server", async () => {
    const r = await runProductionIntegrity({
      agentId: "a1",
      workDate: "2025-07-10",
      cycleId: "c1",
      snapshot: {
        workedCount: 3, closedCount: 1, refusedCount: 1, visitedCount: 1,
        focusCount: 1, depInspected: 2, depByType: {}, fociByType: {}, strategicPointsWorked: 0,
      },
    });
    expect(r.score).toBe(100);
    expect(r.divergences).toHaveLength(0);
    expect(r.ok).toBe(true);
  });

  it("reports divergences when snapshot differs", async () => {
    const r = await runProductionIntegrity({
      agentId: "a1",
      workDate: "2025-07-10",
      cycleId: "c1",
      snapshot: {
        workedCount: 999, closedCount: 0, refusedCount: 0, visitedCount: 0,
        focusCount: 0, depInspected: 0, depByType: {}, fociByType: {}, strategicPointsWorked: 0,
      },
    });
    expect(r.ok).toBe(false);
    expect(r.divergences.length).toBeGreaterThan(0);
    expect(r.score).toBeLessThan(100);
  });
});
