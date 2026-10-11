import { describe, expect, it } from "vitest";
import { scopeMapPendencies } from "@/lib/map-pendency-scope";

const rows = [{ id: "old", cycle_id: "4" }, { id: "current", cycle_id: "5" }, { id: "unlinked", cycle_id: null }];
function query() {
  return { rows: [...rows], in(column: string, values: string[]) {
    this.rows = this.rows.filter(row => values.includes(String(row[column as "cycle_id"])));
    return this;
  } };
}
describe("map pending cycle scope", () => {
  it("epidemiological cycle 5 excludes older and unlinked pending returns", () => {
    expect(scopeMapPendencies(query(), ["5"])?.rows.map(row => row.id)).toEqual(["current"]);
  });
  it("operational map retains pending returns from all cycles explicitly", () => {
    expect(scopeMapPendencies(query(), ["5"], "all_open")?.rows).toEqual(rows);
  });
  it("an empty cycle selection cannot become an all-cycle query", () => {
    expect(scopeMapPendencies(query(), [])).toBeNull();
  });
  it("all cycles and year selections keep their distinct meanings", () => {
    expect(scopeMapPendencies(query(), null)?.rows).toEqual(rows);
    expect(scopeMapPendencies(query(), ["4", "5"])?.rows.map(row => row.id)).toEqual(["old", "current"]);
  });
});
