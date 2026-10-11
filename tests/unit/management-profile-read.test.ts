import { describe, expect, it, vi } from "vitest";
import { readManagementProfiles } from "@/lib/management-profiles";
describe("scope reads", () => {
  it("fails closed after coordinator RPC failure and never queries global profiles", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error: new Error("scope failure") }), from: vi.fn() };
    await expect(readManagementProfiles(client, "c", "coordenador")).rejects.toThrow("scope failure");
    expect(client.from).not.toHaveBeenCalled();
  });
  it("accepts an empty coordinator team without a wider fallback", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: [], error: null }), from: vi.fn() };
    expect(await readManagementProfiles(client, "c", "coordenador")).toEqual([]);
    expect(client.from).not.toHaveBeenCalled();
  });
  it("reads past the first API page for master", async () => {
    const rows = Array.from({ length: 1201 }, (_, i) => ({ id: String(i), role: "agente" }));
    const query = { select: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range: vi.fn(async (a, b) => ({ data: rows.slice(a, b + 1), error: null })) };
    expect(await readManagementProfiles({ from: () => query }, "m", "admin_master")).toHaveLength(1201);
    expect(query.range).toHaveBeenCalledTimes(3);
  });
});
