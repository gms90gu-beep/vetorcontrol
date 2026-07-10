import { describe, it, expect } from "vitest";
import { comparePropertyOrder, sortPropertiesOperational } from "@/lib/property-order";

describe("comparePropertyOrder", () => {
  it("orders by number first", () => {
    expect(comparePropertyOrder({ number: 20 }, { number: 100 })).toBeLessThan(0);
  });
  it("orders by sequence when numbers equal", () => {
    expect(comparePropertyOrder({ number: 10, sequence: 1 }, { number: 10, sequence: 2 })).toBeLessThan(0);
  });
  it("orders by complement when number+sequence equal", () => {
    expect(comparePropertyOrder({ number: 10, complement: "A" }, { number: 10, complement: "B" })).toBeLessThan(0);
  });
  it("ignores property type", () => {
    const a = { number: 10, type: "Ponto Estratégico" } as any;
    const b = { number: 5, type: "Residencial" } as any;
    expect(comparePropertyOrder(a, b)).toBeGreaterThan(0);
  });
});

describe("sortPropertiesOperational", () => {
  it("sorts a full list by number → sequence → complement", () => {
    const input = [
      { id: "c", number: 20, sequence: 1, complement: "B" },
      { id: "a", number: 10, sequence: 1, complement: "A" },
      { id: "b", number: 10, sequence: 1, complement: "B" },
      { id: "d", number: 10, sequence: 2, complement: "A" },
    ];
    const out = sortPropertiesOperational(input);
    expect(out.map((p) => p.id)).toEqual(["a", "b", "d", "c"]);
  });
  it("does not mutate input", () => {
    const input = [{ id: "b", number: 20 }, { id: "a", number: 10 }];
    sortPropertiesOperational(input);
    expect(input[0].id).toBe("b");
  });
  it("handles numeric strings in number field", () => {
    const out = sortPropertiesOperational([
      { id: "x", number: "100" as any },
      { id: "y", number: "20" as any },
    ]);
    expect(out[0].id).toBe("y");
  });
});
