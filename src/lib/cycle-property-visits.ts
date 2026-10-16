/** Helpers for showing the most recent valid field visit for each property in a cycle. */

const WORKED_STATUSES = new Set([
  "visited",
  "closed",
  "refused",
  "abandoned",
  "treated",
  "partial",
  "partially_visited",
]);

const operationalDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function operationalDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return operationalDateFormatter.format(date);
}

export interface CyclePropertyVisit {
  id?: string | null;
  property_id?: string | null;
  agent_id?: string | null;
  cycle_id?: string | null;
  status?: string | null;
  visit_date?: string | null;
  [key: string]: unknown;
}

export interface CycleVisitScope {
  propertyIds: string[];
  agentId: string;
  cycleId: string;
  cycleStartDate?: string | null;
  cycleEndDate?: string | null;
}

function belongsToCycle(visit: CyclePropertyVisit, scope: CycleVisitScope): boolean {
  if (String(visit.cycle_id ?? "") === scope.cycleId) return true;

  // Legacy records without cycle_id are assigned by their operational date.
  // A visit explicitly linked to another cycle must never leak into this one.
  if (visit.cycle_id || !scope.cycleStartDate || !scope.cycleEndDate) return false;
  const date = operationalDate(visit.visit_date);
  return !!date && date >= scope.cycleStartDate && date <= scope.cycleEndDate;
}

export function isWorkedVisitStatus(status: string | null | undefined): boolean {
  return WORKED_STATUSES.has(
    String(status ?? "")
      .trim()
      .toLowerCase(),
  );
}

/**
 * Returns one latest completed/worked visit per property for the requested
 * agent and cycle. Empty/pending activity rows do not mask a real visit.
 */
export function selectLatestWorkedVisits<T extends CyclePropertyVisit>(
  visits: T[],
  scope: CycleVisitScope,
): T[] {
  const propertyIds = new Set(scope.propertyIds.map(String));
  const latest = new Map<string, T>();

  for (const visit of visits) {
    const propertyId = String(visit.property_id ?? "");
    if (!propertyIds.has(propertyId)) continue;
    if (String(visit.agent_id ?? "") !== scope.agentId) continue;
    if (!belongsToCycle(visit, scope) || !isWorkedVisitStatus(visit.status)) continue;

    const current = latest.get(propertyId);
    const visitTime = new Date(visit.visit_date ?? "").getTime();
    const currentTime = current
      ? new Date(current.visit_date ?? "").getTime()
      : Number.NEGATIVE_INFINITY;
    if (!current || (Number.isFinite(visitTime) && visitTime >= currentTime))
      latest.set(propertyId, visit);
  }

  return [...latest.values()];
}
