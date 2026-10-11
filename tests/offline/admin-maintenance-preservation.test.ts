import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { db as legacy } from "@/db/database";
import { db as operational } from "@/lib/offline/db";
import { requeueAdminSyncErrors } from "@/lib/admin-sync-retry";
const mocks = vi.hoisted(() => ({ pages: vi.fn() }));
vi.mock("@/lib/query-pages", () => ({ readAllQueryPages: mocks.pages }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => { const q: any = {}; for (const m of ["select", "eq", "order"]) q[m] = () => q; return q; } } }));
import { cleanupGhosts } from "@/lib/offline/cleanup-ghosts";
beforeEach(async () => { await legacy.open(); await operational.open(); });
afterEach(async () => { await legacy.delete(); await operational.delete(); vi.clearAllMocks(); });
it("requeues both queues without changing payloads, ids or deleting pending records", async () => {
  const payload = { id: "visit", deposit: "B", quantity: 3 };
  const mutationId = await operational.mutations.add({ table: "visits", op: "insert", payload, status: "error", tries: 4, createdAt: 1, lastError: "network" });
  const legacyId = await legacy.syncQueue.add({ entity: "rg", type: "CREATE", payload, tempId: "t", status: "error", retries: 4, createdAt: 1, lastError: "network" });
  await operational.mutations.add({ table: "visits", op: "insert", payload: { id: "other" }, status: "pending", tries: 2, createdAt: 1 });
  expect(await requeueAdminSyncErrors()).toEqual({ requeued: 2, legacy: 1, operational: 1, deleted: 0 });
  expect(await operational.mutations.get(mutationId)).toMatchObject({ payload, status: "pending", tries: 0, lastError: "network" });
  expect(await legacy.syncQueue.get(legacyId)).toMatchObject({ payload, status: "pending", retries: 0, lastError: "network" });
  expect(await operational.mutations.count()).toBe(2);
});
describe("cache maintenance", () => {
  it("refuses cleanup while local work remains queued", async () => {
    await operational.mutations.add({ table: "visits", op: "insert", payload: { id: "v" }, status: "error", tries: 1, createdAt: 1 });
    await operational.boletins_rg.put({ id: "rg", data: { agent_id: "a" } });
    await expect(cleanupGhosts("a")).rejects.toThrow(/preservado/);
    expect(await operational.boletins_rg.count()).toBe(1);
    expect(mocks.pages).not.toHaveBeenCalled();
  });
  it("keeps cache and legacy rows when a server read fails", async () => {
    await operational.boletins_rg.put({ id: "rg", data: { agent_id: "a" } });
    mocks.pages.mockRejectedValue(new Error("unavailable"));
    await expect(cleanupGhosts("a")).rejects.toThrow("unavailable");
    expect(await operational.boletins_rg.count()).toBe(1);
  });
  it("never deletes local rows just because a successful server read is empty", async () => {
    await operational.boletins_rg.put({ id: "rg", data: { agent_id: "a" } });
    mocks.pages.mockResolvedValue([]);
    expect(await cleanupGhosts("a")).toMatchObject({ removedOrphans: 0, clearedLegacy: 0 });
    expect(await operational.boletins_rg.count()).toBe(1);
  });
});
