export type PendencyScopeRow = {
  cycle_id?: string | null;
  week_id?: string | null;
  agent_id?: string | null;
  resolved_at?: string | null;
};

export type PendencyScope = {
  cycleId?: string | null;
  weekId?: string | null;
  agentId?: string | null;
  visibleAgentIds?: ReadonlySet<string> | null;
  onlyOpen?: boolean;
};

/**
 * Filtro único para dados remotos e para o fallback Dexie. Isso evita que a
 * tela remota mostre o ciclo atual enquanto o modo offline reintroduz linhas
 * antigas do mesmo imóvel.
 */
export function isPendencyInScope(row: PendencyScopeRow, scope: PendencyScope): boolean {
  if (scope.cycleId && row.cycle_id !== scope.cycleId) return false;
  if (scope.weekId && row.week_id !== scope.weekId) return false;
  if (scope.agentId && row.agent_id !== scope.agentId) return false;
  if (scope.visibleAgentIds && (!row.agent_id || !scope.visibleAgentIds.has(row.agent_id))) return false;
  if (scope.onlyOpen && row.resolved_at) return false;
  return true;
}

export function filterPendencies<T extends PendencyScopeRow>(rows: T[], scope: PendencyScope): T[] {
  return rows.filter((row) => isPendencyInScope(row, scope));
}
