export function settingsProductionSummary(records: { properties_worked?: number | null; properties_closed?: number | null; positive_foci?: number | null }[], pending: number) {
  const worked = records.reduce((sum, r) => sum + Number(r.properties_worked ?? 0), 0);
  const closed = records.reduce((sum, r) => sum + Number(r.properties_closed ?? 0), 0);
  const foci = records.reduce((sum, r) => sum + Number(r.positive_foci ?? 0), 0);
  return { worked, foci, pending, productivity: worked > 0 ? Math.round(((worked - closed) / worked) * 100) : 0 };
}

export function sessionsMissingDailyRecord(sessions: { user_id: string; session_date: string; status: string }[], records: { agent_id: string; work_date: string }[]) {
  const keys = new Set(records.map(r => `${r.agent_id}|${r.work_date}`));
  return sessions.filter(s => ["completed", "complete", "closed", "encerrada", "finished"].includes(s.status.toLowerCase()) && !keys.has(`${s.user_id}|${s.session_date}`));
}