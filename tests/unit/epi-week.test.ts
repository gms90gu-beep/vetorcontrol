import { describe, it, expect } from "vitest";
import { getEpiWeek } from "@/lib/cycle-week";
import { getCurrentEpiWeek, epiWeekRange, lastNWeeksRange } from "@/lib/epi-week";

describe("epi-week (SINAN)", () => {
  it("getEpiWeek returns week/year for a mid-year date", () => {
    const r = getEpiWeek(new Date(2025, 6, 10)); // 10 jul 2025
    expect(r.year).toBe(2025);
    expect(r.week).toBeGreaterThanOrEqual(27);
    expect(r.week).toBeLessThanOrEqual(29);
  });

  it("getCurrentEpiWeek returns plausible values", () => {
    const r = getCurrentEpiWeek();
    expect(r.week).toBeGreaterThanOrEqual(1);
    expect(r.week).toBeLessThanOrEqual(53);
  });

  it("epiWeekRange spans 7 days", () => {
    const r = epiWeekRange(2025, 5);
    const start = new Date(r.from);
    const end = new Date(r.to);
    const days = (end.getTime() - start.getTime()) / 86400000;
    expect(days).toBe(6);
  });

  it("lastNWeeksRange spans n * 7 - 1 days", () => {
    const r = lastNWeeksRange(4);
    const days = (new Date(r.to).getTime() - new Date(r.from).getTime()) / 86400000;
    expect(days).toBe(27); // 4 semanas inclusive
  });
});
