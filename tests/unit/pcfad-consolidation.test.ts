import { describe, expect, it } from "vitest";
import { groupPcfadDays, pcfadLarvicide, pcfadIip, sumPcfadRows } from "../../src/lib/pcfad-week";
const empty = sumPcfadRows([]);
describe("PCFAD consolidation", () => {
  it("consolidates the same day across agents and keeps chronological order", () => {
    const rows = groupPcfadDays([
      { ...empty, work_date: "2026-10-09", worked: 20, a1: 3, propertiesByType: { ...empty.propertiesByType, residence: 20 } },
      { ...empty, work_date: "2026-10-08", worked: 10 },
      { ...empty, work_date: "2026-10-09", worked: 25, a1: 2, propertiesByType: { ...empty.propertiesByType, residence: 25 } },
    ]);
    expect(rows.map((r) => r.work_date)).toEqual(["2026-10-08", "2026-10-09"]);
    expect(rows[1].worked).toBe(45);
    expect(rows[1].a1).toBe(5);
    expect(rows[1].propertiesByType.residence).toBe(45);
    expect(sumPcfadRows(rows).worked).toBe(55);
  });
  it("keeps units separate across both daily and weekly totals", () => {
    const rows = groupPcfadDays([{ ...empty, work_date: "2026-10-09", larvicideUnit: "g", larvicideAmount: 10, larvicideByUnit: undefined }, { ...empty, work_date: "2026-10-09", larvicideUnit: "ml", larvicideAmount: 5, larvicideByUnit: undefined }]);
    expect(pcfadLarvicide(sumPcfadRows(rows))).toBe("10 g · 5 ml");
    expect(pcfadIip(3, 100)).toBe("3,0%");
  });
});
