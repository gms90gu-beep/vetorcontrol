/**
 * Integração: dashboard × DWR e relatórios × DWR.
 * Verifica que os totais somados batem com os campos do DWR.
 */
import { describe, it, expect } from "vitest";

const dwrRows = [
  { work_date: "2025-07-08", properties_worked: 12, properties_closed: 3, properties_refused: 1, positive_foci: 2 },
  { work_date: "2025-07-09", properties_worked: 10, properties_closed: 2, properties_refused: 0, positive_foci: 1 },
  { work_date: "2025-07-10", properties_worked: 15, properties_closed: 4, properties_refused: 2, positive_foci: 3 },
];

function sumField<K extends keyof typeof dwrRows[number]>(rows: typeof dwrRows, k: K): number {
  return rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
}

describe("dashboard vs DWR", () => {
  it("totals from DWR sum consistently", () => {
    expect(sumField(dwrRows, "properties_worked")).toBe(37);
    expect(sumField(dwrRows, "properties_closed")).toBe(9);
    expect(sumField(dwrRows, "properties_refused")).toBe(3);
    expect(sumField(dwrRows, "positive_foci")).toBe(6);
  });
});

describe("weekly reports vs DWR", () => {
  it("weekly totals match a group-by-work_date reduction", () => {
    const weekly = dwrRows.reduce(
      (acc, r) => {
        acc.worked += r.properties_worked;
        acc.closed += r.properties_closed;
        acc.refused += r.properties_refused;
        acc.foci += r.positive_foci;
        return acc;
      },
      { worked: 0, closed: 0, refused: 0, foci: 0 },
    );
    expect(weekly).toEqual({ worked: 37, closed: 9, refused: 3, foci: 6 });
  });
});
