/**
 * daily-integrity.ts
 * Padroniza e valida JSONs de depósitos/focos antes da persistência em
 * daily_work_records. Os agrupamentos por tipo são a FONTE DE VERDADE.
 */

export const DEP_ORDER = ["a1", "a2", "b", "c", "d1", "d2", "e"] as const;
export type DepKeyLower = (typeof DEP_ORDER)[number];

export const EMPTY_DEP_JSON: Record<DepKeyLower, number> = {
  a1: 0, a2: 0, b: 0, c: 0, d1: 0, d2: 0, e: 0,
};

/** Normaliza qualquer objeto parcial garantindo a estrutura completa e a ordem oficial. */
export function normalizeDepJson(input: Record<string, unknown> | null | undefined): Record<DepKeyLower, number> {
  const out: Record<DepKeyLower, number> = { ...EMPTY_DEP_JSON };
  if (!input) return out;
  for (const k of DEP_ORDER) {
    const raw = (input as any)[k] ?? (input as any)[k.toUpperCase()];
    const n = Number(raw);
    out[k] = Number.isFinite(n) && n > 0 ? n : 0;
  }
  return out;
}

export function sumDep(json: Record<DepKeyLower, number>): number {
  return DEP_ORDER.reduce((acc, k) => acc + (json[k] || 0), 0);
}

/** Calcula percentuais por tipo (0–100, 1 casa decimal). */
export function withPercentages(json: Record<DepKeyLower, number>) {
  const total = sumDep(json);
  const result = {} as Record<DepKeyLower, { count: number; percent: number }>;
  for (const k of DEP_ORDER) {
    const count = json[k] || 0;
    const percent = total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
    result[k] = { count, percent };
  }
  return { total, byType: result };
}

export interface IntegrityReconciliation {
  depByType: Record<DepKeyLower, number>;
  fociByType: Record<DepKeyLower, number>;
  totalDeposits: number;
  totalFoci: number;
  log: {
    reconciled: boolean;
    timestamp: string;
    issues: string[];
  };
}

/**
 * Reconcilia totais com os agrupamentos por tipo (fonte de verdade).
 * Retorna JSONs sempre completos e o log de auditoria.
 */
export function reconcileIntegrity(params: {
  depByType: Record<string, unknown> | null | undefined;
  fociByType: Record<string, unknown> | null | undefined;
  declaredTotalDeposits: number;
  declaredPositiveFoci: number;
}): IntegrityReconciliation {
  const depByType = normalizeDepJson(params.depByType);
  const fociByType = normalizeDepJson(params.fociByType);
  const totalDeposits = sumDep(depByType);
  const totalFoci = sumDep(fociByType);

  const issues: string[] = [];
  if (totalDeposits !== params.declaredTotalDeposits) {
    issues.push(`total_depositos corrected from ${params.declaredTotalDeposits} to ${totalDeposits}`);
  }
  if (totalFoci !== params.declaredPositiveFoci) {
    issues.push(`positive_foci corrected from ${params.declaredPositiveFoci} to ${totalFoci}`);
  }

  return {
    depByType,
    fociByType,
    totalDeposits,
    totalFoci,
    log: {
      reconciled: issues.length > 0,
      timestamp: new Date().toISOString(),
      issues,
    },
  };
}
