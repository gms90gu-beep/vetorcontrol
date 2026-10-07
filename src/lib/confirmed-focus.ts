export function confirmedFocusVisitIds(deposits: { visit_id: string; is_positive?: boolean | null }[]): Set<string> {
  return new Set(deposits.filter((deposit) => deposit.is_positive === true).map((deposit) => deposit.visit_id));
}