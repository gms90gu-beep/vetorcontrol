import { describe, it, expect, beforeEach, vi } from "vitest";

// Supabase mock: track call log
vi.mock("@/integrations/supabase/client", async () => {
  const { createSupabaseMock } = await import("../mocks/supabase");
  const mocked = createSupabaseMock();
  return { supabase: mocked.client, __mocked: mocked };
});

import { db, enqueueMutation } from "@/lib/offline/db";
import { flushMutations, pendingMutationCount } from "@/lib/offline/sync";

async function reset() {
  await db.mutations.clear();
}

describe("Dexie queue (offline)", () => {
  beforeEach(async () => {
    await reset();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });

  it("enqueueMutation increments count", async () => {
    await enqueueMutation({ table: "visits", op: "insert", payload: { id: "v1" } });
    expect(await pendingMutationCount()).toBe(1);
  });

  it("flush removes items on success", async () => {
    await enqueueMutation({ table: "visits", op: "insert", payload: { id: "v1" } });
    const r = await flushMutations();
    expect(r.ok).toBe(1);
    expect(await pendingMutationCount()).toBe(0);
  });

  it("flush is a no-op when offline", async () => {
    await enqueueMutation({ table: "visits", op: "insert", payload: { id: "v1" } });
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    const r = await flushMutations();
    expect(r).toEqual({ ok: 0, failed: 0 });
    expect(await pendingMutationCount()).toBe(1);
  });
});
