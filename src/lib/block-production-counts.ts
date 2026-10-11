/** Count distinct blocks, accepting both terminal statuses used by field workflows. */
export function blockProductionCounts(sessions: any[], visits: any[] = []) {
  const referenced = new Set(visits.map((v) => v.field_work_session_id).filter(Boolean));
  const identities = new Map(sessions.filter((s) => s.block_id && s.block_number != null).map((s) => [`${s.cycle_id || ""}:${s.block_number}`, s.block_id]));
  const key = (s: any) => {
    const identity = s.block_id || identities.get(`${s.cycle_id || ""}:${s.block_number}`) || (s.block_number != null ? String(s.block_number).trim() : "");
    return identity ? `${s.cycle_id || ""}:${identity}` : null;
  };
  const completed = sessions.filter((s) => ["closed", "completed"].includes(s.status));
  const worked = sessions.filter((s) => referenced.has(s.id) || ["closed", "completed"].includes(s.status));
  return {
    blocksWorked: new Set(worked.map(key).filter(Boolean)).size,
    blocksCompleted: new Set(completed.map(key).filter(Boolean)).size,
  };
}
