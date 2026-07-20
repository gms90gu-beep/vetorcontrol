import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/integrations/supabase/client", async () => {
  const { vi } = await import("vitest");
  const client: any = {
    from: vi.fn((_t: string) => ({
      insert: vi.fn(() => Promise.resolve({ error: { code: "500", message: "server error" } })),
      upsert: vi.fn(() => Promise.resolve({ error: { code: "500", message: "server error" } })),
    })),
    rpc: vi.fn(() => Promise.resolve({ error: null })),
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }) },
  };
  return { supabase: client };
});

import { db, enqueueMutation } from "@/lib/offline/db";
import { flushMutations } from "@/lib/offline/sync";

describe("sync: retry increments tries and caps at MAX_RETRIES", () => {
  beforeEach(async () => {
    await db.mutations.clear();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });

  it("failed mutation stays queued with tries incremented", async () => {
    await enqueueMutation({ table: "visits", op: "insert", payload: { id: "v1" } });
    const r = await flushMutations();
    expect(r.ok).toBe(0);
    expect(r.failed).toBe(1);
    const remaining = await db.mutations.toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].tries).toBe(1);
    expect(remaining[0].status).toBe("error");
  });

  it("stops retrying after MAX_RETRIES (5)", async () => {
    await enqueueMutation({ table: "visits", op: "insert", payload: { id: "v1" } });
    for (let i = 0; i < 6; i++) {
      await flushMutations();
      // O backoff mantém a mutação em "error" até nextRetryAt; aqui simulamos
      // que o prazo já passou para isolar o teto de tentativas (MAX_RETRIES)
      // do comportamento de backoff, que tem teste próprio abaixo.
      await db.mutations.toCollection().modify({ nextRetryAt: 0 });
    }
    const remaining = await db.mutations.toArray();
    expect(remaining[0].tries).toBe(5);
    expect(remaining[0].status).toBe("error");
  });

  it("does not retry before nextRetryAt (backoff)", async () => {
    await enqueueMutation({ table: "visits", op: "insert", payload: { id: "v1" } });
    await flushMutations();
    let remaining = await db.mutations.toArray();
    expect(remaining[0].tries).toBe(1);
    expect(remaining[0].nextRetryAt).toBeGreaterThan(Date.now());

    // Chamada imediata seguinte: ainda dentro da janela de backoff, não deve
    // reprocessar a mutação (tries permanece 1).
    await flushMutations();
    remaining = await db.mutations.toArray();
    expect(remaining[0].tries).toBe(1);

    // Passado o prazo do backoff, a próxima flush deve tentar de novo.
    await db.mutations.toCollection().modify({ nextRetryAt: 0 });
    await flushMutations();
    remaining = await db.mutations.toArray();
    expect(remaining[0].tries).toBe(2);
  });
});
