import { describe, it, expect, beforeEach, vi } from "vitest";

// Force insert into `visits` to return duplicate key error (23505)
vi.mock("@/integrations/supabase/client", async () => {
  const { vi } = await import("vitest");
  const client: any = {
    from: vi.fn((_t: string) => {
      const chain: any = {
        insert: vi.fn(() => Promise.resolve({ error: { code: "23505", message: "duplicate key value" } })),
        upsert: vi.fn(() => Promise.resolve({ error: null })),
        update: vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) })),
        delete: vi.fn(() => ({ eq: () => Promise.resolve({ error: null }), match: () => Promise.resolve({ error: null }) })),
      };
      return chain;
    }),
    rpc: vi.fn(() => Promise.resolve({ error: null })),
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }) },
  };
  return { supabase: client };
});

import { db, enqueueMutation } from "@/lib/offline/db";
import { flushMutations, pendingMutationCount } from "@/lib/offline/sync";

describe("sync: duplicate key (23505) is treated as success", () => {
  beforeEach(async () => {
    await db.mutations.clear();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });

  it("insert with 23505 removes the mutation and counts as ok", async () => {
    await enqueueMutation({ table: "visits", op: "insert", payload: { id: "v-dup" } });
    const r = await flushMutations();
    expect(r.ok).toBe(1);
    expect(r.failed).toBe(0);
    expect(await pendingMutationCount()).toBe(0);
  });
});
