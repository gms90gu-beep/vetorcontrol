export interface PropertyCycleVisit {
  id: string;
  cycle_id: string;
  visit_date: string;
  status: string;
  has_focus: boolean;
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

  for (const visit of visits) {
    if (!cycleIds.has(visit.cycle_id)) continue;
    const list = visitsByCycle.get(visit.cycle_id) ?? [];
    list.push(visit);
    visitsByCycle.set(visit.cycle_id, list);
  }

  return yearCycles.map((cycle) => ({
    cycle_id: cycle.id,
    cycle_name: cycle.name,
    cycle_number: cycle.number,
    year: selectedYear,
    status: cycle.status,
    visits: (visitsByCycle.get(cycle.id) ?? []).sort(
      (a, b) => b.visit_date.localeCompare(a.visit_date),
    ),
  }));
}
