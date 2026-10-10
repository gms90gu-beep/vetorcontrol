import { describe, it, expect } from "vitest";
import { weeklyTotals, weeklyLarvicide } from "../../src/lib/weekly-bulletin";
describe("weekly bulletin", () => {
  it("sums all daily indicators and keeps zero-valued fields", () => {
    const total = weeklyTotals([{ properties_worked: 26, deposits_a2: 4, samples_collected: 2 }, { properties_worked: 25, deposits_a2: 3, samples_collected: 1 }]);
    expect(total.properties_worked).toBe(51);
    expect(total.deposits_a2).toBe(7);
    expect(total.samples_collected).toBe(3);
    expect(total.properties_closed).toBe(0);
  });
  it("never adds different larvicide units together", () => {
    expect(weeklyLarvicide([{ larvicide_amount: 10, larvicide_unit: "g" }, { larvicide_amount: 5, larvicide_unit: "g" }, { larvicide_amount: 2, larvicide_unit: "ml" }])).toBe("15 g · 2 ml");
    expect(weeklyLarvicide([])).toBe("0");
  });
});
