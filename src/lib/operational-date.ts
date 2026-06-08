/**
 * Operational date helpers.
 *
 * Quando o agente inicia uma jornada para uma data específica
 * (session_date) o sistema deve usar essa data como referência
 * operacional, mesmo que a data real do sistema seja diferente.
 *
 * - getOperationalVisitDate: retorna um ISO timestamp combinando
 *   a data da jornada (YYYY-MM-DD) com o horário atual local.
 * - getOperationalDayRange: retorna {start, end} ISO para filtros
 *   "do dia" baseados em uma data operacional.
 */

export function getOperationalVisitDate(sessionDate?: string | null): string {
  const now = new Date();
  if (!sessionDate) {
    console.log("[OperationalDate] Sem jornada ativa, usando data atual:", now.toISOString());
    return now.toISOString();
  }

  // sessionDate vem como YYYY-MM-DD
  const [y, m, d] = sessionDate.split("-").map(Number);
  if (!y || !m || !d) {
    console.log("[OperationalDate] session_date inválida, usando data atual:", sessionDate);
    return now.toISOString();
  }

  const combined = new Date(
    y,
    m - 1,
    d,
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
    now.getMilliseconds(),
  );

  console.log("[OperationalDate] Data atual:", now.toISOString());
  console.log("[OperationalDate] Data da jornada:", sessionDate);
  console.log("[OperationalDate] Data salva na visita:", combined.toISOString());

  return combined.toISOString();
}

export function getOperationalDayRange(sessionDate?: string | null): { start: string; end: string; dateOnly: string } {
  const base = sessionDate ? new Date(`${sessionDate}T00:00:00`) : new Date();
  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, 0, 0, 0);
  const end = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 23, 59, 59, 999);
  const dateOnly = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
  return { start: start.toISOString(), end: end.toISOString(), dateOnly };
}
