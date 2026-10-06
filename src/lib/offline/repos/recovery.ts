import { db } from "../db";
import { createOffline } from "./index";

type RecoveryAttemptInput = {
  property_id: string;
  visit_id?: string | null;
  agent_id: string;
  cycle_id?: string | null;
  week_id?: string | null;
  result: string;
  notes?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  attempted_at?: string;
};

/**
 * Salva a tentativa no cache e na fila. A pendência remota é atualizada pelo
 * trigger do banco quando a mutação chegar ao Supabase; o cache local também
 * é atualizado para o agente não precisar repetir a visita enquanto estiver
 * sem conexão.
 */
export async function saveRecoveryAttemptOffline(input: RecoveryAttemptInput) {
  const attempt = await createOffline("property_recovery_attempts", {
    ...input,
    attempted_at: input.attempted_at ?? new Date().toISOString(),
  });

  const cached = await (db as any).property_pendencies.toArray();
  const local = cached.find((row: any) => {
    const p = row?.data;
    return p?.property_id === input.property_id &&
      (p?.cycle_id === input.cycle_id || (!p?.cycle_id && !input.cycle_id));
  });

  if (local?.data) {
    const resolved = ["visited", "unoccupied", "demolished"].includes(input.result);
    const timestamp = attempt.attempted_at;
    const next = {
      ...local.data,
      cycle_id: input.cycle_id ?? local.data.cycle_id ?? null,
      week_id: input.week_id ?? local.data.week_id ?? null,
      agent_id: input.agent_id,
      current_status: input.result,
      reason: input.notes ?? null,
      attempt_count: Number(local.data.attempt_count ?? 0) + 1,
      last_attempt_at: timestamp,
      resolved_at: resolved ? timestamp : null,
      resolved_status: resolved ? input.result : null,
      updated_at: timestamp,
    };
    await (db as any).property_pendencies.put({
      ...local,
      data: next,
      updatedAt: timestamp,
    });
  }

  return attempt;
}
