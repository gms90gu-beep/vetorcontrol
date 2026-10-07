const DAY_MS = 24 * 60 * 60 * 1000;
export const AGENT_REBUILD_MAX_DAYS = 90;

export interface RebuildAuthorizationInput {
  role: string;
  userId: string;
  agentId?: string;
  from: string;
  to: string;
  today: string;
  supervisedAgentIds?: string[];
}

function parseDateOnly(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : null;
}

export function getAgentRebuildRange(today: string): { from: string; to: string } {
  const todayMs = parseDateOnly(today);
  if (todayMs === null) throw new Error("Data operacional inválida.");
  const from = new Date(todayMs - (AGENT_REBUILD_MAX_DAYS - 1) * DAY_MS)
    .toISOString()
    .slice(0, 10);
  return { from, to: today };
}

export function getRebuildAuthorizationError(input: RebuildAuthorizationInput): string | null {
  const fromMs = parseDateOnly(input.from);
  const toMs = parseDateOnly(input.to);
  const todayMs = parseDateOnly(input.today);
  if (fromMs === null || toMs === null || todayMs === null || fromMs > toMs) {
    return "Intervalo de datas inválido.";
  }

  if (input.role === "agente" || input.role === "agent") {
    if (!input.agentId || input.agentId !== input.userId) {
      return "Agente só pode reconstruir os próprios boletins.";
    }
    const days = Math.floor((toMs - fromMs) / DAY_MS) + 1;
    if (days > AGENT_REBUILD_MAX_DAYS || toMs > todayMs) {
      return "Agente só pode reconstruir os próprios boletins dos últimos 90 dias.";
    }
    return null;
  }

  if (input.role === "supervisor") {
    if (!input.supervisedAgentIds || (input.agentId && !input.supervisedAgentIds.includes(input.agentId))) {
      return "Supervisor só pode reconstruir relatórios de agentes vinculados à própria equipe.";
    }
    return null;
  }
  if (["admin_master", "coordenador"].includes(input.role)) return null;
  return "Forbidden: requer agente, supervisor, coordenador ou admin_master.";
}
