/**
 * journey-permission-error.ts
 *
 * Traduz erros de permissão (RLS) das jornadas em mensagens claras.
 * A validação real acontece no servidor (políticas de RLS + can_supervise_user);
 * aqui apenas explicamos o motivo para o usuário.
 */

const PERMISSION_CODES = new Set(["42501", "PGRST301"]);

export function isJourneyPermissionError(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code && PERMISSION_CODES.has(e.code)) return true;
  const msg = (e.message ?? "").toLowerCase();
  return msg.includes("row-level security") || msg.includes("violates row-level security policy");
}

/**
 * Mensagem única para bloqueios de jornada por vínculo de equipe/área.
 */
export function journeyPermissionMessage(context?: { agentName?: string | null }): string {
  const who = context?.agentName ? ` de ${context.agentName}` : "";
  return (
    `Operação bloqueada: você só pode criar, alterar, pausar, retomar ou encerrar jornadas` +
    ` dos agentes vinculados à sua equipe/área. Se a jornada${who} pertence a outra equipe,` +
    ` ou se o agente ainda não tem supervisor/equipe vinculada, peça ao coordenador para` +
    ` ajustar o vínculo antes de continuar.`
  );
}

/**
 * Converte qualquer erro de escrita de jornada em mensagem exibível.
 */
export function describeJourneyWriteError(
  error: unknown,
  context?: { agentName?: string | null },
): string {
  if (isJourneyPermissionError(error)) return journeyPermissionMessage(context);
  const e = error as { message?: string } | null;
  return e?.message ?? "Não foi possível salvar a jornada. Tente novamente.";
}
