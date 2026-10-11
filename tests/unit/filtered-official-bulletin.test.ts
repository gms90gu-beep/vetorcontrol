import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ build: vi.fn(), pdf: vi.fn(), observations: vi.fn(), pages: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
  const q: any = {}; for (const method of ["select", "eq", "gte", "lte", "order", "is"]) q[method] = () => q;
  return q;
} } }));
vi.mock("@/lib/pcfad-week", async (original) => ({ ...(await original<any>()), buildPcfadWeekData: mocks.build }));
vi.mock("@/lib/focus-observations", () => ({ fetchFocusObservations: mocks.observations }));
vi.mock("@/lib/query-pages", () => ({ readAllQueryPages: mocks.pages }));
vi.mock("../../src/components/reports/PcfadWeeklyPdfGenerator", () => ({ generatePcfadWeeklyPDF: mocks.pdf }));
import { generateFilteredOfficialBulletin } from "../../src/components/reports/FilteredOfficialBulletin";
import { sumPcfadRows } from "../../src/lib/pcfad-week";
const daily = (agent: string, date: string, worked: number) => ({ agent_id: agent, work_date: date, properties_worked: worked, cycle_id: "cycle5", status: "completed", end_time: "18:00" });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.observations.mockResolvedValue([]);
  mocks.pages.mockResolvedValue([{ id: "visit-in-selected-cycle" }]);
  mocks.pdf.mockResolvedValue({ fileName: "bulletin.pdf" });
  mocks.build.mockImplementation(async ({ records }) => ({ rows: records.map((r: any) => ({ ...sumPcfadRows([]), work_date: r.work_date, worked: r.properties_worked })) }));
});
describe("official dashboard bulletin", () => {
  it("blocks empty or unfinished daily records before creating a PDF", async () => {
    await expect(generateFilteredOfficialBulletin([], "Equipe", "Ciclo 5")).rejects.toThrow("Nenhuma diária");
    await expect(generateFilteredOfficialBulletin([{ ...daily("a", "2026-10-08", 26), end_time: null }], "Equipe", "Ciclo 5")).rejects.toThrow("não encerradas");
    expect(mocks.pdf).not.toHaveBeenCalled();
  });
  it("keeps the selected historical dates and sums all selected agents", async () => {
    const records = [daily("a", "2026-09-29", 26), daily("b", "2026-09-29", 25), daily("a", "2026-10-08", 20)];
    await generateFilteredOfficialBulletin(records, "Equipe selecionada", "Ciclo 5");
    const supplied = mocks.pdf.mock.calls[0][0].suppliedData;
    expect(supplied.range).toEqual({ start: "2026-09-29", end: "2026-10-08" });
    expect(supplied.rows.map((r: any) => r.worked)).toEqual([51, 20]);
    expect(supplied.total.worked).toBe(71);
    expect(supplied.cycleLabel).toBe("Ciclo 5");
    expect(mocks.build.mock.calls.map(([p]) => p.agentAuthId)).toEqual(["a", "b", "a"]);
  });
  it("restricts focus observations to the selected visits and identifies the agent", async () => {
    mocks.observations.mockResolvedValue([{ numeroImovel: "2", tipoDeposito: "B" }]);
    await generateFilteredOfficialBulletin([daily("a", "2026-10-08", 26)], "Equipe", "Ciclo 5", new Map([["a", "Gustavo"]]));
    expect(mocks.observations.mock.calls[0][4]).toEqual(["visit-in-selected-cycle"]);
    expect(mocks.pdf.mock.calls[0][0].suppliedData.observations[0].agente).toBe("Gustavo");
  });
});
