import { toOperationalDate } from "@/lib/operational-date";

export interface PropertyCycleVisit {
  id: string;
  cycle_id: string | null;
  visit_date: string;
  status: string;
  has_focus: boolean;
  focus_analysis_status: "pending" | "positive" | "negative" | "inconclusive" | null;
  activity_type: string;
  notes: string | null;
  treatment_amount: number | null;
  elimination_amount: number | null;
  treated_deposits: number | null;
  sample_collected: boolean | null;
  is_recovered: boolean | null;
}

export interface PropertyCycleHistory {
  cycle_id: string;
  cycle_name: string;
  cycle_number: number | null;
  year: number;
  status: string;
  visits: PropertyCycleVisit[];
}

interface CycleRow {
  id: string;
  name: string;
  number: number | null;
  year: number | null;
  status: string;
  start_date?: string;
  end_date?: string;
}

export function buildPropertyCycleHistory(
  cycles: CycleRow[],
  visits: PropertyCycleVisit[],
  selectedYear: number,
): PropertyCycleHistory[] {
  const yearCycles = cycles
    .filter((cycle) => cycle.year === selectedYear)
    .sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
  const cycleIds = new Set(yearCycles.map((cycle) => cycle.id));
  const visitsByCycle = new Map<string, PropertyCycleVisit[]>();
  const unlinked: PropertyCycleVisit[] = [];

  for (const visit of visits) {
    const date = toOperationalDate(visit.visit_date);
    const cycleId = visit.cycle_id ?? yearCycles.find((cycle) => date && cycle.start_date && cycle.end_date && date >= cycle.start_date && date <= cycle.end_date)?.id;
    if (!cycleId) {
      if (date?.startsWith(`${selectedYear}-`)) unlinked.push(visit);
      continue;
    }
    if (!cycleIds.has(cycleId)) continue;
    const list = visitsByCycle.get(cycleId) ?? [];
    list.push(visit);
    visitsByCycle.set(cycleId, list);
  }

  const history: PropertyCycleHistory[] = yearCycles.map((cycle) => ({
    cycle_id: cycle.id,
    cycle_name: cycle.name,
    cycle_number: cycle.number,
    year: selectedYear,
    status: cycle.status,
    visits: (visitsByCycle.get(cycle.id) ?? []).sort(
      (a, b) => b.visit_date.localeCompare(a.visit_date),
    ),
  }));
  if (unlinked.length) history.push({ cycle_id: "unlinked", cycle_name: "Sem vínculo com ciclo", cycle_number: null, year: selectedYear, status: "finished", visits: unlinked.sort((a, b) => b.visit_date.localeCompare(a.visit_date)) });
  return history;
}
