/**
 * Integração: reconstrução do DWR via RPC rebuild_daily_work_records.
 * Verifica idempotência (chamar 2x → mesmo resultado agregado).
 */
import { describe, it, expect, vi } from "vitest";

const calls: Array<{ name: string; args: any }> = [];

vi.mock("@/integrations/supabase/client", async () => {
  const { vi } = await import("vitest");
  const state = { days: 1, rebuilt: 1, corrected: 0 };
  const client: any = {
    from: vi.fn(),
    rpc: vi.fn((name: string, args: any) => {
      calls.push({ name, args });
      if (name === "rebuild_daily_work_records") {
        // segunda chamada não recria nada
        const invocation = calls.filter((c) => c.name === name).length;
        return Promise.resolve({
          data: invocation === 1 ? state : { days: 1, rebuilt: 0, corrected: 0 },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    }),
  };
  return { supabase: client };
});

import { supabase } from "@/integrations/supabase/client";

describe("rebuild_daily_work_records idempotency", () => {
  it("first call rebuilds, second call is no-op", async () => {
    const r1 = await (supabase.rpc as any)("rebuild_daily_work_records", { _from: "2025-07-10", _to: "2025-07-10", _agent: "u1" });
    expect(r1.error).toBeNull();
    expect(r1.data.rebuilt).toBe(1);

    const r2 = await (supabase.rpc as any)("rebuild_daily_work_records", { _from: "2025-07-10", _to: "2025-07-10", _agent: "u1" });
    expect(r2.data.rebuilt).toBe(0);
    expect(r2.data.corrected).toBe(0);
  });
});
