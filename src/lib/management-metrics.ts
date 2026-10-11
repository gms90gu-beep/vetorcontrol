/** Shared read-only definitions for managerial dashboards and official production. */
export function isClosedDaily(record: any): boolean {
  return record.status === "completed" && !!record.end_time;
}
export function productionTotals(records: any[]) {
  const closed = records.filter(isClosedDaily);
  const sum = (key: string) => closed.reduce((n, r) => n + (Number(r[key]) || 0), 0);
  return { dailyCount: closed.length, worked: sum("properties_worked"), closed: sum("properties_closed"),
    refused: sum("properties_refused"), positive: sum("positive_foci"), blocksWorked: sum("blocks_worked"),
    blocksCompleted: sum("blocks_completed"), unfinished: records.length - closed.length };
}
export function visitActivity(visits: any[]) {
  const unique = new Set(visits.map((v) => v.property_id || v.id));
  const positive = (v: any) => v.focus_analysis_status === "positive" || (!v.focus_analysis_status && (v.visit_deposits || []).some((d: any) => d.is_positive));
  const found = visits.filter((v) => v.has_focus || v.sample_collected || positive(v));
  return { visits: visits.length, uniqueProperties: unique.size,
    workedVisits: visits.filter((v) => v.status === "visited").length,
    closedVisits: visits.filter((v) => v.status === "closed").length,
    refusedVisits: visits.filter((v) => v.status === "refused").length,
    found: found.length, positive: visits.filter(positive).length,
    pending: visits.filter((v) => v.sample_collected && (!v.focus_analysis_status || v.focus_analysis_status === "pending") && !positive(v)).length,
    negative: visits.filter((v) => v.focus_analysis_status === "negative").length,
    inconclusive: visits.filter((v) => v.focus_analysis_status === "inconclusive").length };
}
export function sessionActivity(sessions: any[], today: string) {
  return { hasAnyToday: sessions.some((s) => s.session_date === today),
    hasOpenSession: sessions.some((s) => ["active", "in_progress", "paused"].includes(s.status)),
    hasFuture: sessions.some((s) => s.session_date > today) };
}
export function selectManagementProfiles(profiles: any[], userId: string, role: string): any[] {
  if (role === "admin_master") return profiles;
  if (role === "supervisor") return profiles.filter((p) => p.supervisor_id === userId && ["agente", "agent"].includes(p.role));
  if (["agente", "agent"].includes(role)) return profiles.filter((p) => p.id === userId);
  if (role !== "coordenador") return [];
  const supervisors = new Set(profiles.filter((p) => p.role === "supervisor" && p.coordinator_id === userId).map((p) => p.id));
  return profiles.filter((p) => p.role === "supervisor" ? supervisors.has(p.id)
    : ["agente", "agent"].includes(p.role) && (p.coordinator_id === userId || supervisors.has(p.supervisor_id)));
}
export function validateReportRange<T extends { from: string; to: string }>(input: T): T {
  const valid = (s: string) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)
    && !Number.isNaN(Date.parse(`${s}T12:00:00Z`)) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s;
  if (!valid(input.from) || !valid(input.to) || input.from > input.to) throw new Error("Período inválido: confira as datas inicial e final.");
  return input;
}
export function dailyDepositTotal(record: any): number {
  const keys = ["a1", "a2", "b", "c", "d1", "d2", "e"];
  const typed = keys.reduce((n, k) => n + (Number(record[`deposits_${k}`]) || 0), 0);
  return typed || keys.reduce((n, k) => n + (Number(record.deposits_by_type?.[k] ?? record.deposits_by_type?.[k.toUpperCase()]) || 0), 0);
}
export function reconcileIssueCount(preview: any): number {
  if (!preview) return 0;
  return (preview.rows || []).filter((r: any) => r.status !== "ok").length + (preview.orphanBlocks || []).length;
}
