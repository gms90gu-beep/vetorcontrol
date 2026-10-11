export type MapPendencyScope = "selected_cycles" | "all_open";

/** Null means no selected cycles: do not issue a broad pending query. */
export function scopeMapPendencies<T extends { in: (column: string, values: string[]) => T }>(
  query: T, cycleIds?: string[] | null, scope: MapPendencyScope = "selected_cycles",
): T | null {
  if (scope === "all_open" || cycleIds == null) return query;
  return cycleIds.length ? query.in("cycle_id", cycleIds) : null;
}
