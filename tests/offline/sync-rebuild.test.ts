import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/integrations/supabase/client", async () => {
  const { vi } = await import("vitest");
  const client: any = {
    from: vi.fn(() => ({ insert: vi.fn(() => Promise.resolve({ error: null })) })),
    rpc: vi.fn(() => Promise.resolve({ error: null })),
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }) },
  };
  return { supabase: client };
});

import { db, enqueueMutation } from "@/lib/offline/db";
import { flushMutations, pendingMutationCount } from "@/lib/offline/sync";

describe("sync: purgeInvalidTmpMutations", () => {
  beforeEach(async () => {
    await db.mutations.clear();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });

  it("removes mutations with tmp_ prefix ids in payload before syncing", async () => {
    await enqueueMutation({ table: "visits", op: "insert", payload: { id: "tmp_abc123", property_id: "p1" } });
    await enqueueMutation({ table: "visits", op: "insert", payload: { id: "valid-id", property_id: "p2" } });
    expect(await pendingMutationCount()).toBe(2);
    const r = await flushMutations();
    expect(await pendingMutationCount()).toBe(0);
    expect(r.ok).toBe(1); // apenas o válido é enviado
  });

  it("removes mutations with tmp_ prefix pk", async () => {
    await enqueueMutation({ table: "visits", op: "update", pk: "tmp_zzz", payload: { note: "x" } });
    await flushMutations();
    expect(await pendingMutationCount()).toBe(0);
  });
});
