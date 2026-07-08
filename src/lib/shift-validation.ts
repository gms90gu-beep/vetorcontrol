/**
 * shift-validation.ts
 * Fechamento inteligente: valida consistência antes de encerrar a jornada.
 *
 * Fonte primária: Dexie (offline-first). Nunca altera dados — só relata.
 */
import { db } from "@/lib/offline/db";
import { listLocal } from "@/lib/offline/repos";

export type ShiftIssueSeverity = "error" | "warning";

export interface ShiftIssue {
  code: string;
  severity: ShiftIssueSeverity;
  message: string;
  count?: number;
  detail?: any;
}

export interface ShiftValidationScope {
  userId: string;
  sessionId?: string | null;
  blockId?: string | null;
  blockNumber?: string | null;
  workDate: string; // YYYY-MM-DD
}

export interface ShiftValidationReport {
  ok: boolean;
  issues: ShiftIssue[];
  counters: {
    propertiesInScope: number;
    visitsInScope: number;
    depositsLinked: number;
    pendingMutations: number;
    failedMutations: number;
  };
}

export async function runShiftValidation(
  scope: ShiftValidationScope,
): Promise<ShiftValidationReport> {
  const issues: ShiftIssue[] = [];

  // ── Imóveis do quarteirão ──────────────────────────────────────────────
  const allProps = await listLocal<any>("properties");
  const propsInScope = allProps.filter((p) => {
    if (scope.blockId && p.block_id) return String(p.block_id) === String(scope.blockId);
    if (scope.blockNumber && p.block_number != null)
      return String(p.block_number) === String(scope.blockNumber);
    return false;
  });
  const propIds = new Set(propsInScope.map((p) => p.id));

  if (propsInScope.length === 0) {
    issues.push({
      code: "NO_PROPERTIES_LOADED",
      severity: "error",
      message: "Nenhum imóvel carregado para o quarteirão da jornada.",
    });
  }

  // Imóveis com block_id incorreto
  if (scope.blockId) {
    const mismatched = propsInScope.filter(
      (p) => p.block_id && String(p.block_id) !== String(scope.blockId),
    );
    if (mismatched.length > 0) {
      issues.push({
        code: "PROPERTY_BLOCK_MISMATCH",
        severity: "error",
        message: `${mismatched.length} imóvel(is) com quarteirão divergente.`,
        count: mismatched.length,
      });
    }
  }

  // ── Visitas da jornada ─────────────────────────────────────────────────
  const visits = await listLocal<any>("visits", (v) => {
    if (v.agent_id !== scope.userId) return false;
    if (String(v.visit_date || "").slice(0, 10) !== scope.workDate) return false;
    if (scope.sessionId && v.field_work_session_id && v.field_work_session_id !== scope.sessionId)
      return false;
    if (propIds.size > 0 && v.property_id && !propIds.has(v.property_id)) return false;
    return true;
  });

  // Visitas órfãs (property_id sem imóvel local)
  const orphans = visits.filter((v) => v.property_id && !propIds.has(v.property_id));
  if (orphans.length > 0) {
    issues.push({
      code: "ORPHAN_VISITS",
      severity: "error",
      message: `${orphans.length} visita(s) sem imóvel vinculado.`,
      count: orphans.length,
    });
  }

  // Imóveis pendentes (sem visita hoje)
  const visitedProps = new Set(visits.map((v) => v.property_id));
  const pendingProps = propsInScope.filter((p) => !visitedProps.has(p.id));
  if (pendingProps.length > 0) {
    issues.push({
      code: "PENDING_PROPERTIES",
      severity: "warning",
      message: `${pendingProps.length} imóvel(is) pendente(s) sem visita.`,
      count: pendingProps.length,
    });
  }

  // ── Depósitos / Focos ─────────────────────────────────────────────────
  const visitIds = new Set(visits.map((v) => v.id));
  const allDeposits = await listLocal<any>("visit_deposits");
  const linkedDeposits = allDeposits.filter((d) => visitIds.has(d.visit_id));
  const unlinkedDeposits = allDeposits.filter(
    (d) => d.visit_id && !visitIds.has(d.visit_id) && d._session_id === scope.sessionId,
  );
  if (unlinkedDeposits.length > 0) {
    issues.push({
      code: "UNLINKED_DEPOSITS",
      severity: "error",
      message: `${unlinkedDeposits.length} depósito(s) sem visita vinculada.`,
      count: unlinkedDeposits.length,
    });
  }

  // Focos declarados sem depósito
  const positiveVisits = visits.filter((v) => v.has_focus);
  const focosSemDeposito = positiveVisits.filter(
    (v) => !linkedDeposits.some((d) => d.visit_id === v.id && d.is_positive),
  );
  if (focosSemDeposito.length > 0) {
    issues.push({
      code: "FOCI_WITHOUT_DEPOSIT",
      severity: "error",
      message: `${focosSemDeposito.length} foco(s) positivo(s) sem depósito registrado.`,
      count: focosSemDeposito.length,
    });
  }

  // ── Fila de sincronização ─────────────────────────────────────────────
  const pendingMutations = await db.mutations.where("status").equals("pending").count();
  const failedMutations = await db.mutations.where("status").equals("error").count();

  if (pendingMutations > 0) {
    issues.push({
      code: "PENDING_MUTATIONS",
      severity: "error",
      message: `${pendingMutations} mutação(ões) pendente(s) de sincronização.`,
      count: pendingMutations,
    });
  }
  if (failedMutations > 0) {
    issues.push({
      code: "FAILED_MUTATIONS",
      severity: "error",
      message: `${failedMutations} mutação(ões) com erro de sincronização.`,
      count: failedMutations,
    });
  }

  const report: ShiftValidationReport = {
    ok: issues.every((i) => i.severity !== "error"),
    issues,
    counters: {
      propertiesInScope: propsInScope.length,
      visitsInScope: visits.length,
      depositsLinked: linkedDeposits.length,
      pendingMutations,
      failedMutations,
    },
  };

  console.log("[SHIFT_VALIDATION]", {
    session_id: scope.sessionId,
    block: scope.blockNumber || scope.blockId,
    work_date: scope.workDate,
    ok: report.ok,
    issues: report.issues.map((i) => ({ code: i.code, sev: i.severity, count: i.count })),
    counters: report.counters,
  });

  return report;
}

export function canForceClose(role?: string | null): boolean {
  const r = (role || "").toLowerCase();
  return r === "admin_master" || r === "admin" || r === "supervisor" || r === "coordenador";
}
