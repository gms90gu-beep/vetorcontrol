import { describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ admin: vi.fn(), filters: [] as string[][] }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const builder: any = { middleware: () => builder, inputValidator: () => builder, handler: (handler: any) => handler };
  return builder;
} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: calls.admin } }));
import { rebuildDailyRecords } from "@/lib/reports-reconcile.functions";

function context(role: string) {
  return { userId: "self", supabase: {
    rpc: async () => ({ data: role, error: null }),
    from: () => ({ select: () => ({ eq: async () => ({ data: [{ id: "own" }], error: null }) }) }),
  } };
}

describe("server rebuild team boundary", () => {
  it("rejects a supervisor's outsider before opening privileged queries", async () => {
    calls.admin.mockClear();
    await expect((rebuildDailyRecords as any)({ data: { from: "2026-10-01", to: "2026-10-02", agentId: "other" }, context: context("supervisor") })).rejects.toThrow(/equipe/);
    expect(calls.admin).not.toHaveBeenCalled();
  });
  it.each(["agent", "agente"])("rejects another agent for %s before privileged access", async (role) => {
    calls.admin.mockClear();
    await expect((rebuildDailyRecords as any)({ data: { from: "2026-10-01", to: "2026-10-02", agentId: "other" }, context: context(role) })).rejects.toThrow(/acesso/);
    expect(calls.admin).not.toHaveBeenCalled();
  });
  it.each(["supervisor", "coordenador", "admin_master"])("applies selected agent and cycle for %s without writing empty production", async (role) => {
    calls.filters.length = 0;
    const query: any = {};
    for (const method of ["select", "gte", "lte", "order"]) query[method] = () => query;
    query.in = (_column: string, ids: string[]) => { calls.filters.push(ids); return query; };
    query.eq = (column: string, id: string) => { calls.filters.push([column, id]); return query; };
    query.range = async () => ({ data: [], error: null });
    calls.admin.mockImplementation(() => query);
    const agentId = role === "supervisor" ? "own" : "selected";
    const result = await (rebuildDailyRecords as any)({ data: { from: "2026-10-01", to: "2026-10-02", agentId, cycleId: "cycle" }, context: context(role) });
    expect(calls.filters).toContainEqual([agentId]);
    expect(calls.filters).toContainEqual(["cycle_id", "cycle"]);
    expect(result.updated).toBe(0);
  });
});