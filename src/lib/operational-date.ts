/**
 * Operational date helpers.
 *
 * Fonte única e imutável da Data da Produção.
 * Toda gravação (visits, daily_work_records, boletins_rg) deve derivar de
 * field_work_sessions.session_date via getOperationalVisitDate.
 *
 * Auditoria:
 *   [PRODUCTION_DATE_SOURCE]      — origem escolhida (session vs. sistema)
 *   [PRODUCTION_DATE_PROPAGATION] — data efetivamente gravada num módulo
 *   [PRODUCTION_DATE_CHANGE]      — divergência detectada entre camadas
 *   [PRODUCTION_DATE_ERROR]       — session_date inválida/ausente
 */

export function getOperationalVisitDate(
  sessionDate?: string | null,
  moduleName: string = "unknown",
): string {
  const now = new Date();

  if (!sessionDate) {
    console.warn("[PRODUCTION_DATE_ERROR]", {
      module: moduleName,
      reason: "session_date ausente",
      fallback: now.toISOString(),
    });
    console.log("[PRODUCTION_DATE_SOURCE]", { module: moduleName, source: "system_now", value: now.toISOString() });
    return now.toISOString();
  }

  const [y, m, d] = sessionDate.split("-").map(Number);
  if (!y || !m || !d) {
    console.error("[PRODUCTION_DATE_ERROR]", {
      module: moduleName,
      reason: "session_date inválida",
      raw: sessionDate,
      fallback: now.toISOString(),
    });
    return now.toISOString();
  }

  const combined = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  const iso = combined.toISOString();

  console.log("[PRODUCTION_DATE_SOURCE]", {
    module: moduleName,
    source: "field_work_sessions.session_date",
    session_date: sessionDate,
  });
  console.log("[PRODUCTION_DATE_PROPAGATION]", {
    module: moduleName,
    session_date: sessionDate,
    written: iso,
    date_only: iso.slice(0, 10),
  });

  if (iso.slice(0, 10) !== sessionDate) {
    console.error("[PRODUCTION_DATE_CHANGE]", {
      module: moduleName,
      expected: sessionDate,
      actual: iso.slice(0, 10),
      reason: "divergência entre session_date e ISO gerado (TZ?)",
    });
  }

  return iso;
}

export function getOperationalDayRange(sessionDate?: string | null): { start: string; end: string; dateOnly: string } {
  const base = sessionDate ? new Date(`${sessionDate}T00:00:00`) : new Date();
  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, 0, 0, 0);
  const end = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 23, 59, 59, 999);
  const dateOnly = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
  return { start: start.toISOString(), end: end.toISOString(), dateOnly };
}

/**
 * Assert que uma data derivada bate com a session_date. Loga divergência
 * mas nunca lança — usada em pontos de propagação (DWR, RG, etc).
 */
export function assertProductionDate(
  expectedSessionDate: string | null | undefined,
  usedDate: string | null | undefined,
  moduleName: string,
): void {
  if (!expectedSessionDate || !usedDate) return;
  const used = usedDate.slice(0, 10);
  if (used !== expectedSessionDate) {
    console.error("[PRODUCTION_DATE_CHANGE]", {
      module: moduleName,
      expected: expectedSessionDate,
      actual: used,
    });
  } else {
    console.log("[PRODUCTION_DATE_PROPAGATION]", {
      module: moduleName,
      session_date: expectedSessionDate,
      used,
      match: true,
    });
  }
}
