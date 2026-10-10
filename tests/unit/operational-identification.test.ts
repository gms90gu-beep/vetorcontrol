import { describe, expect, it } from "vitest";
import { compareBlockNumbers } from "../../src/lib/block-order";
import { propertyLabel } from "../../src/lib/property-label";
describe("operational identification", () => {
  it("keeps subdivisions beside their parent and sorts their parts numerically", () => {
    expect(["10", "4.10", "5", "4/3", "4", "4.2", "2"].sort(compareBlockNumbers))
      .toEqual(["2", "4", "4.2", "4/3", "4.10", "5", "10"]);
    expect(compareBlockNumbers("4.3", "5")).toBeLessThan(0);
    expect(compareBlockNumbers("4/3", "4/10")).toBeLessThan(0);
  });
  it("distinguishes houses sharing a number without inventing a complement", () => {
    expect(propertyLabel({ number: 2 })).toBe("Imóvel 2");
    expect(propertyLabel({ number: 2, sequence: 1 })).toBe("Imóvel 2 · Seq. 1");
    expect(propertyLabel({ number: 2, complement: "A" })).toBe("Imóvel 2 · Compl. A");
    expect(propertyLabel({ number: 2, sequence: 1, complement: "B" })).toBe("Imóvel 2 · Seq. 1 · Compl. B");
  });
});
