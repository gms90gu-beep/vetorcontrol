import { describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const b: any = { middleware: () => b, inputValidator: () => b, handler: (h: any) => h }; return b;
} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
import { getTeamPcfadWeekly } from "@/lib/wave-b.functions";
function ctx() {
  const values: Record<string, any[]> = {
    profiles: [{ id: "own", full_name: "Agente", role: "agente", supervisor_id: "self" }],
    areas: [{ id: "area1", name: "Área 1" }],
    daily_work_records: [{ id: "dwr", work_date: "2026-10-09", cycle_id: "cycle", properties_worked: 2 }],
    visits: ["area1", "area2"].map((id) => ({ properties: { blocks: { subareas: { localities: { area_id: id } } } } })),
  };
  return { userId: "self", supabase: {
    rpc: async () => ({ data: "supervisor", error: null }),
    from: (table: string) => {
      const q: any = {};
      for (const m of ["select", "eq", "in", "gte", "lte", "not", "order"]) q[m] = () => q;
      q.range = async () => ({ data: values[table] || [], error: null });
      q.then = (resolve: any) => Promise.resolve({ data: values[table] || [], error: null }).then(resolve);
      return q;
    },
  } };
}
describe("team PCFAD scope", () => {
  it("rejects an agent outside the supervisor team", async () => {
    await expect((getTeamPcfadWeekly as any)({ data: { week: 41, year: 2026, agentId: "outsider" }, context: ctx() })).rejects.toThrow("Agente fora do seu acesso");
  });
  it("does not assign a mixed-area daily total to one area", async () => {
    await expect((getTeamPcfadWeekly as any)({ data: { week: 41, year: 2026, areaId: "area1" }, context: ctx() })).rejects.toThrow("abrange mais de uma área");
  });
});
