import { supabase } from "@/integrations/supabase/client";
import { getEpiWeek } from "@/lib/cycle-week";
import { buildPcfadWeekData, groupPcfadDays, sumPcfadRows, type PcfadRow } from "@/lib/pcfad-week";
import { fetchFocusObservations, type FocusObservation } from "@/lib/focus-observations";
import { generatePcfadWeeklyPDF } from "./PcfadWeeklyPdfGenerator";

// Export the applied dashboard dataset, rather than the manager's own production.
export async function generateFilteredOfficialBulletin(records: any[], title: string, cycleLabel: string, agentNames = new Map<string, string>()) {
  if (!records.length) throw new Error("Nenhuma diária encontrada nos filtros aplicados.");
  if (records.some((r) => r.status !== "completed" || !r.end_time)) {
    throw new Error("Há diárias não encerradas neste recorte. Finalize-as ou ajuste os filtros antes de emitir o boletim.");
  }
  const groups = new Map<string, { agentId: string; week: number; year: number; records: any[] }>();
  for (const record of records) {
    const { week, year } = getEpiWeek(new Date(`${record.work_date}T12:00:00`));
    const key = `${record.agent_id}:${year}:${week}`;
    const group = groups.get(key) ?? { agentId: record.agent_id, week, year, records: [] };
    group.records.push(record);
    groups.set(key, group);
  }
  const rows: PcfadRow[] = [];
  const observations: FocusObservation[] = [];
  for (const group of groups.values()) {
    const bulletin = await buildPcfadWeekData({ agentAuthId: group.agentId, week: group.week, year: group.year, records: group.records, client: supabase });
    rows.push(...bulletin.rows);
    for (const date of new Set(group.records.map((r) => String(r.work_date)))) {
      const cycles = new Set(group.records.filter((r) => r.work_date === date).map((r) => r.cycle_id));
      const visitIds = new Set<string>();
      // Observations are restricted to the same agent/date/cycles as the daily rows.
      const { readAllQueryPages } = await import("@/lib/query-pages");
      for (const cycle of cycles) {
        let query = supabase.from("visits").select("id").eq("agent_id", group.agentId)
          .gte("visit_date", `${date}T00:00:00-03:00`).lte("visit_date", `${date}T23:59:59.999-03:00`).order("id");
        query = cycle ? query.eq("cycle_id", cycle) : query.is("cycle_id", null);
        for (const visit of await readAllQueryPages<{ id: string }>(query)) visitIds.add(visit.id);
      }
      const found = await fetchFocusObservations(group.agentId, date, date, supabase, [...visitIds]);
      observations.push(...found.map((f) => ({ ...f, agente: agentNames.get(group.agentId) || "Agente" })));
    }
  }
  const dates = records.map((r) => String(r.work_date)).sort();
  const range = { start: dates[0], end: dates[dates.length - 1] };
  const first = [...groups.values()][0];
  const grouped = groupPcfadDays(rows);
  return generatePcfadWeeklyPDF({ agentAuthId: "", week: first.week, year: first.year,
    suppliedData: { rows: grouped, total: sumPcfadRows(grouped), range, observations, title,
      periodLabel: `Período ${range.start} a ${range.end}`, cycleLabel,
      fileName: `Boletim_Oficial_${range.start}_${range.end}.pdf` } });
}
