import { describe, expect, it } from "vitest";
import { readAllQueryPages } from "@/lib/query-pages";

describe("operational pagination", () => {
  it("reads beyond the default row cap and preserves the map limit", async () => {
    const records = Array.from({ length: 1133 }, (_, id) => ({ id }));
    const query = { range: async (from: number, to: number) => ({ data: records.slice(from, to + 1), error: null }) };
    expect((await readAllQueryPages(query)).length).toBe(1133);
    expect((await readAllQueryPages(query, 500)).length).toBe(500);
  });
  it("does not return partial data after a query error", async () => {
    await expect(readAllQueryPages({ range: async () => ({ data: null, error: new Error("denied") }) })).rejects.toThrow("denied");
  });
});