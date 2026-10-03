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

  it("waits for an active flush and sends mutations queued during it", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    let releaseFirst: (() => void) | undefined;
    const firstBlocked = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const insert = vi.fn()
      .mockImplementationOnce(async () => {
        await firstBlocked;
        return { error: null };
      })
      .mockResolvedValue({ error: null });
    vi.mocked(supabase.from).mockReturnValue({ insert } as any);

    await enqueueMutation({ table: "visits", op: "insert", payload: { id: "first" } });
    const backgroundFlush = flushMutations();
    await vi.waitFor(() => expect(insert).toHaveBeenCalledTimes(1));

    await enqueueMutation({ table: "daily_work_records", op: "insert", payload: { id: "close" } });
    const closeFlush = flushMutations();
    releaseFirst?.();

    await backgroundFlush;
    const result = await closeFlush;
    expect(result.ok).toBe(1);
    expect(insert).toHaveBeenCalledTimes(2);
    expect(await pendingMutationCount()).toBe(0);
  });
});
