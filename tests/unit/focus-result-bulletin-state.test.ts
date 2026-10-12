import { describe, it, expect, vi } from "vitest";
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => { const builder: any = { middleware: () => builder, inputValidator: () => builder, handler: (fn: any) => fn }; return builder; } }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
import { recordFocusResult, getFocusSampleCycles } from "@/lib/focus-results.functions";
const input = { visitId: "v", status: "negative", positiveDepositIds: [], reference: "L", analysisDate: "2026-10-01", reason: "", version: 0, requestId: "r" };
function client(active: boolean, count: number, error: any = null) {
  const rpc = vi.fn().mockResolvedValue({ data: 1, error: null });
  return { rpc, from(table: string) {
    const result = table === "profiles" ? { data: { is_active: active }, error: null } : table === "visits" ? { data: { agent_id: "a", cycle_id: "c", visit_date: "2026-10-02T01:30:00Z" }, error: null } : { count, error };
    const q: any = { select: () => q, eq: () => q, is: () => q, single: () => Promise.resolve(result), then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject) }; return q;
  } };
}
describe("confirmed sample and bulletin follow-up", () => {
  it("reports missing daily without failing an already saved result", async () => {
    const db = client(true, 0); const result = await (recordFocusResult as any)({ data: input, context: { supabase: db, userId: "u" } });
    expect(result).toEqual({ version: 1, bulletinState: "missing" }); expect(db.rpc).toHaveBeenCalledOnce();
  });
  it("reports unknown if the daily read fails after commit", async () => {
    expect(await (recordFocusResult as any)({ data: input, context: { supabase: client(true, 0, { message: "offline" }), userId: "u" } })).toEqual({ version: 1, bulletinState: "unknown" });
  });
  it("reports an existing daily", async () => {
    expect((await (recordFocusResult as any)({ data: input, context: { supabase: client(true, 1), userId: "u" } })).bulletinState).toBe("present");
  });
  it("rejects inactive user before RPC", async () => {
    const db = client(false, 0);
    await expect((recordFocusResult as any)({ data: input, context: { supabase: db, userId: "u" } })).rejects.toThrow("desativada"); expect(db.rpc).not.toHaveBeenCalled();
  });
});

describe("sample cycles independent from result RPC", () => {
  it("loads cycles without requesting samples or laboratory functions", async () => {
    const db = client(true, 0);
    const original = db.from;
    const cycles = [{ id: "c", name: "Ciclo 5", year: 2026, number: 5 }];
    db.from = (table: string): any => {
      if (table !== "cycles") return original(table);
      const q: any = { select: () => q, order: () => q, range: () => Promise.resolve({ data: cycles, error: null }) }; return q;
    };
    expect(await (getFocusSampleCycles as any)({ context: { supabase: db, userId: "u" } })).toEqual(cycles);
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("blocks inactive identity before reading cycles", async () => {
    await expect((getFocusSampleCycles as any)({ context: { supabase: client(false, 0), userId: "u" } })).rejects.toThrow("desativada");
  });
});
