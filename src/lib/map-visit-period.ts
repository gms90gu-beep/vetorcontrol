/** A missing cycle never erases dated production; existing links still respect the selected cycle. */
export function mapVisitInPeriod(row: { cycle_id?: string | null; visit_date: string }, fromIso: string, toIso: string, cycleIds?: string[] | null) {
  if (row.visit_date < fromIso || row.visit_date > toIso) return false;
  return !row.cycle_id || !cycleIds?.length || cycleIds.includes(row.cycle_id);
}