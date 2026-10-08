export function summarizePendencyCycles(rows: { cycle_id?: string | null; resolved_at?: string | null }[], currentCycleId: string | null) {
  const summary = new Map<string, { cycle_id: string | null; active: number; resolved: number; total: number }>();
  for (const row of rows) {
    if (currentCycleId && row.cycle_id === currentCycleId) continue;
    const key = row.cycle_id ?? "unlinked";
    const item = summary.get(key) ?? { cycle_id: row.cycle_id ?? null, active: 0, resolved: 0, total: 0 };
    item.total++;
    if (row.resolved_at) item.resolved++; else item.active++;
    summary.set(key, item);
  }
  return [...summary.values()];
}