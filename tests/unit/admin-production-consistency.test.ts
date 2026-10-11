import { beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ context: {} as any }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  let validate: any = (v: any) => v;
  const chain: any = { middleware: () => chain, inputValidator: (fn: any) => { validate = fn; return chain; }, handler: (fn: any) => async (arg: any = {}) => fn({ data: validate(arg.data || {}), context: fixture.context }) };
  return chain;
} }));
import { getAgentProduction } from "@/lib/wave-b.functions";
import { getExecutiveDashboard } from "@/lib/wave-c.functions";
function client(tables: Record<string, any[]>, role = "admin_master") {
  return { rpc: vi.fn(async () => ({ data: role, error: null })), from: (table: string) => {
    let rows = [...(tables[table] || [])]; let page: number[] | undefined; let head = false;
    const query: any = {
      select: (_columns: string, options?: any) => { head = !!options?.head; return query; },
      in: (field: string, ids: any[]) => { rows = rows.filter((r) => ids.includes(r[field])); return query; },
      eq: (field: string, value: any) => { rows = rows.filter((r) => r[field] === value); return query; },
      gte: (field: string, value: any) => { rows = rows.filter((r) => r[field] >= value); return query; },
      lte: (field: string, value: any) => { rows = rows.filter((r) => r[field] <= value); return query; },
      not: (field: string) => { rows = rows.filter((r) => r[field] != null); return query; },
      is: (field: string, value: any) => { rows = rows.filter((r) => (r[field] ?? null) === value); return query; },
      order: () => query,
      range: (a: number, b: number) => { page = [a, b]; return query; },
      then: (resolve: any, reject: any) => Promise.resolve({ data: head ? null : page ? rows.slice(page[0], page[1] + 1) : rows, count: rows.length, error: null }).then(resolve, reject),
    };
    return query;
  } };
}
beforeEach(() => {
  const profiles = [{ id: "a", role: "agente", supervisor_id: "s", full_name: "Gustavo", city: "Euclides" }, { id: "b", role: "agente", supervisor_id: "other", full_name: "Outro", city: "Euclides" }, { id: "s", role: "supervisor", full_name: "Supervisor" }];
  const records = Array.from({ length: 1201 }, (_, i) => ({ id: String(i), agent_id: i === 1200 ? "b" : "a", work_date: "2026-10-08", status: "completed", end_time: "17:00", properties_worked: 1, deposits_b: 2, cycle_id: "c5" }));
  records.push({ ...records[0], id: "draft", status: "draft", properties_worked: 9999, end_time: null as any });
  fixture.context = { supabase: client({ profiles, daily_work_records: records, field_work_sessions: [], property_pendencies: [] }), userId: "master" };
});
describe("admin production across server modules", () => {
  const range = { from: "2026-10-01", to: "2026-10-11" };
  it("ranking and executive totals agree beyond the first API page, excluding drafts", async () => {
    const ranking: any = await getAgentProduction({ data: range });
    const dashboard: any = await getExecutiveDashboard({ data: range });
    expect(ranking.totals.properties_worked).toBe(1201);
    expect(dashboard.kpis.properties_worked).toBe(ranking.totals.properties_worked);
    expect(dashboard.kpis.daily_records).toBe(1201);
    expect(dashboard.kpis.deposits_total).toBe(2402);
    expect(ranking.totals.deposits_total).toBe(2402);
  });
  it("supervisor sees only their team's official totals", async () => {
    const original: any = fixture.context.supabase;
    original.rpc.mockResolvedValue({ data: "supervisor", error: null });
    fixture.context.userId = "s";
    const ranking: any = await getAgentProduction({ data: range });
    const dashboard: any = await getExecutiveDashboard({ data: range });
    expect(ranking.rows.map((r: any) => r.agent_id)).toEqual(["a"]);
    expect(dashboard.kpis.properties_worked).toBe(1200);
  });
});
