import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", async () => {
  const { createSupabaseMock } = await import("../mocks/supabase");
  const mocked = createSupabaseMock({
    tables: {
      weeks: {
        rows: [{
          id: "w1", number: 3,
          start_date: "2025-07-07", end_date: "2025-07-13",
        }],
      },
    },
  });
  return { supabase: mocked.client };
});

import { resolveCycleWeek, formatCycleWeekLabel, formatSinanLabel } from "@/lib/cycle-week";

describe("resolveCycleWeek", () => {
  it("returns null when no cycleId", async () => {
    const r = await resolveCycleWeek(null, new Date("2025-07-10"));
    expect(r).toBeNull();
  });
  it("returns week from server when cycleId is given", async () => {
    const r = await resolveCycleWeek("cycle-1", new Date("2025-07-10"));
    expect(r?.number).toBe(3);
  });
});

describe("cycle-week label formatting", () => {
  it("formatSinanLabel formats SE X/YYYY", () => {
    const s = formatSinanLabel({
      cycle: null, cycleWeek: null,
      se: { week: 28, year: 2025 },
    });
    expect(s).toMatch(/SE\s*28\s*\/\s*2025/);
  });

  it("formatCycleWeekLabel includes cycle number when present", () => {
    const s = formatCycleWeekLabel({
      cycle: { id: "c1", number: 4, year: 2025, name: "Ciclo 4" },
      cycleWeek: { id: "w1", number: 3, start_date: "2025-07-07", end_date: "2025-07-13" },
      se: { week: 28, year: 2025 },
    });
    expect(s.length).toBeGreaterThan(0);
  });
});
