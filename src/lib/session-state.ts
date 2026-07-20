/**
 * session-state.ts
 * Fonte única do estado das jornadas (field_work_sessions).
 *
 * Toda decisão sobre criar / continuar / encerrar jornadas deve passar por aqui.
 * Não altera Sync Engine, Dexie, SafeFetch, Repositórios, RLS.
 *
 * Auditoria:
 *   [SESSION_STATE_START]
 *   [SESSION_STATE_FOUND]
 *   [SESSION_STATE_CREATE]
 *   [SESSION_STATE_CONTINUE]
 *   [SESSION_STATE_CLOSE]
 *   [SESSION_STATE_INTEGRITY]
 *   [SESSION_STATE_ERROR]
 */

import { supabase } from "@/integrations/supabase/client";

export type SessionStatus = "in_progress" | "completed" | "cancelled" | string;

export type IntegrityStatus =
  | "CONSISTENTE"
  | "INCONSISTENTE"
  | "ORFA"
  | "SEM_PRODUCAO"
  | "SEM_VISITAS"
  | "SEM_RG";

export interface SessionRow {
  id: string;
  user_id: string;
  session_date: string; // YYYY-MM-DD
  block_number: string | null;
  block_id: string | null;
  cycle_id: string | null;
  week_id: string | null;
  status: SessionStatus;
  created_at?: string;
  updated_at?: string;
}

export interface SessionLookup {
  userId: string;
  sessionDate: string;
  blockNumber?: string | null;
  blockId?: string | null;
}

export interface DecisionResult {
  allowed: boolean;
  reason?: string;
  existing?: SessionRow | null;
}

function logStart(scope: string, ctx: Record<string, unknown>) {
  console.log("[SESSION_STATE_START]", { scope, ...ctx });
}
function logErr(scope: string, ctx: Record<string, unknown>) {
  console.error("[SESSION_STATE_ERROR]", { scope, ...ctx });
}

/* ─── Consulta ─────────────────────────────────────────────────────────── */

export async function findSession(lookup: SessionLookup): Promise<SessionRow | null> {
  logStart("findSession", { ...lookup });
  try {
    let q = supabase
      .from("field_work_sessions")
      .select("id,user_id,session_date,block_number,block_id,cycle_id,week_id,status,created_at,updated_at")
      .eq("user_id", lookup.userId)
      .eq("session_date", lookup.sessionDate);

    if (lookup.blockId) q = q.eq("block_id", lookup.blockId);
    else if (lookup.blockNumber) q = q.eq("block_number", lookup.blockNumber);

    const { data, error } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    console.log("[SESSION_STATE_FOUND]", { lookup, session_id: data?.id ?? null, status: data?.status ?? null });
    return (data as SessionRow) ?? null;
  } catch (e: any) {
    logErr("findSession", { lookup, error: e?.message });
    return null;
  }
}

/**
 * Fecha automaticamente sessões "in_progress" cuja Data da Produção (session_date)
 * já ficou no passado em relação à data operacional (America/Sao_Paulo) atual.
 *
 * Cada jornada pertence a UMA única Data da Produção — não existe "carregar"
 * uma jornada aberta de um dia para o outro (ver resolveOperationalSession /
 * assessSessionForResume, que já bloqueiam retomada quando session_date !=
 * data operacional). Porém, se o agente nunca clicar em "Encerrar Jornada"
 * (app fechado, sem sinal, esqueceu), a linha continua com status
 * 'in_progress' para sempre — uma jornada "fantasma" que:
 *   1. o field-work-list.tsx tratava como "jornada ativa hoje" mesmo sendo
 *      de outro dia (bug: consulta sem filtro de session_date);
 *   2. voltava a aparecer no modal "Jornada em andamento" toda vez que o
 *      agente tentava iniciar uma jornada nova para o mesmo quarteirão.
 *
 * Esta função fecha (status='closed') qualquer sessão nessas condições no
 * boot das telas de campo, antes de qualquer decisão de "jornada ativa".
 * Só roda online (chamada direta ao Supabase) — não enfileira no Sync
 * Engine porque é uma correção de estado, não um dado de produção do agente.
 */
export async function closeExpiredInProgressSessions(
  userId: string,
  todayOperational: string,
): Promise<number> {
  if (!userId || !todayOperational) return 0;
  try {
    const { data, error } = await supabase
      .from("field_work_sessions")
      .update({ status: "closed", updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("status", "in_progress")
      .lt("session_date", todayOperational)
      .select("id, session_date, block_number, block_id");
    if (error) throw error;
    const closed = data ?? [];
    if (closed.length > 0) {
      console.warn("[SESSION_STATE_AUTO_EXPIRE]", {
        userId,
        todayOperational,
        closed_count: closed.length,
        closed_sessions: closed,
      });
    }
    return closed.length;
  } catch (e: any) {
    logErr("closeExpiredInProgressSessions", { userId, todayOperational, error: e?.message });
    return 0;
  }
}

export async function findInProgressSession(userId: string): Promise<SessionRow | null> {
  const { data, error } = await supabase
    .from("field_work_sessions")
    .select("id,user_id,session_date,block_number,block_id,cycle_id,week_id,status,created_at,updated_at")
    .eq("user_id", userId)
    .eq("status", "in_progress")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    logErr("findInProgressSession", { userId, error: error.message });
    return null;
  }
  return (data as SessionRow) ?? null;
}

/* ─── Decisões ─────────────────────────────────────────────────────────── */

export async function canCreateSession(lookup: SessionLookup): Promise<DecisionResult> {
  if (!lookup.userId || !lookup.sessionDate || (!lookup.blockId && !lookup.blockNumber)) {
    logErr("canCreateSession", { lookup, reason: "campos obrigatórios ausentes" });
    return { allowed: false, reason: "Dados obrigatórios ausentes (user_id, session_date, block)" };
  }
  const existing = await findSession(lookup);
  if (existing) {
    return {
      allowed: false,
      reason: "Já existe jornada deste agente/quarteirão nesta Data da Produção",
      existing,
    };
  }
  console.log("[SESSION_STATE_CREATE]", { lookup, allowed: true });
  return { allowed: true };
}

export async function canContinueSession(lookup: SessionLookup): Promise<DecisionResult> {
  const existing = await findSession(lookup);
  if (!existing) return { allowed: false, reason: "Nenhuma jornada encontrada", existing: null };
  const allowed = existing.status === "in_progress";
  console.log("[SESSION_STATE_CONTINUE]", { session_id: existing.id, status: existing.status, allowed });
  return {
    allowed,
    reason: allowed ? undefined : `Jornada não está em andamento (status=${existing.status})`,
    existing,
  };
}

/**
 * Resolve a jornada operacional para o agente/data/quarteirão.
 * Retorna a existente (continuar) ou indica que deve criar uma nova.
 */
export async function resolveOperationalSession(
  lookup: SessionLookup,
): Promise<{ action: "continue" | "create" | "blocked"; session?: SessionRow | null; reason?: string }> {
  const existing = await findSession(lookup);
  if (existing && existing.status === "in_progress") {
    console.log("[SESSION_STATE_CONTINUE]", { session_id: existing.id });
    return { action: "continue", session: existing };
  }
  if (existing) {
    return { action: "blocked", session: existing, reason: `Jornada já encerrada (status=${existing.status})` };
  }
  console.log("[SESSION_STATE_CREATE]", { lookup });
  return { action: "create", session: null };
}

/* ─── Encerramento ─────────────────────────────────────────────────────── */

export interface CloseSnapshot {
  visits: number;
  properties: number;
  rgRecords: number;
  pendencies: number;
}

export async function canCloseSession(sessionId: string): Promise<DecisionResult & { snapshot?: CloseSnapshot }> {
  logStart("canCloseSession", { sessionId });
  const { data: s, error } = await supabase
    .from("field_work_sessions")
    .select("id,user_id,session_date,block_number,block_id,cycle_id,week_id,status")
    .eq("id", sessionId)
    .maybeSingle();
  if (error || !s) {
    logErr("canCloseSession", { sessionId, error: error?.message });
    return { allowed: false, reason: "Jornada não encontrada" };
  }
  if (s.status !== "in_progress") {
    return { allowed: false, reason: `Jornada já está ${s.status}`, existing: s as SessionRow };
  }

  const [{ count: visits }, { count: props }, { count: rg }, { count: pend }] = await Promise.all([
    supabase.from("visits").select("id", { count: "exact", head: true }).eq("field_work_session_id", sessionId),
    s.block_number
      ? supabase.from("properties").select("id", { count: "exact", head: true }).eq("block_number", s.block_number)
      : Promise.resolve({ count: 0 } as any),
    supabase
      .from("boletins_rg")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", s.user_id)
      .eq("block_number", s.block_number ?? ""),
    supabase
      .from("property_pendencies")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", s.user_id),
  ]);

  const snapshot: CloseSnapshot = {
    visits: visits ?? 0,
    properties: props ?? 0,
    rgRecords: rg ?? 0,
    pendencies: pend ?? 0,
  };

  const allowed = (snapshot.visits ?? 0) > 0;
  console.log("[SESSION_STATE_CLOSE]", { sessionId, allowed, snapshot });
  return {
    allowed,
    reason: allowed ? undefined : "Jornada sem visitas — não pode ser encerrada",
    existing: s as SessionRow,
    snapshot,
  };
}

/* ─── Integridade ──────────────────────────────────────────────────────── */

export interface IntegrityReport {
  status: IntegrityStatus;
  problems: string[];
  session: SessionRow;
  snapshot: CloseSnapshot;
}

export async function validateSessionIntegrity(sessionId: string): Promise<IntegrityReport | null> {
  const check = await canCloseSession(sessionId);
  if (!check.existing) return null;
  const s = check.existing;
  const snap = check.snapshot ?? { visits: 0, properties: 0, rgRecords: 0, pendencies: 0 };
  const problems: string[] = [];
  let status: IntegrityStatus = "CONSISTENTE";

  if (snap.properties === 0) { status = "ORFA"; problems.push("Sem imóveis no quarteirão"); }
  if (snap.visits === 0) { status = "SEM_VISITAS"; problems.push("Sem visitas registradas"); }
  if (snap.rgRecords === 0) { status = status === "CONSISTENTE" ? "SEM_RG" : status; problems.push("Sem RG vinculado"); }
  if (snap.visits > 0 && snap.properties > 0 && snap.visits > snap.properties) {
    status = "INCONSISTENTE";
    problems.push(`Visitas (${snap.visits}) > imóveis (${snap.properties})`);
  }
  if (!s.cycle_id || !s.week_id) {
    status = "INCONSISTENTE";
    problems.push("Ciclo/semana não resolvidos na jornada");
  }

  console.log("[SESSION_STATE_INTEGRITY]", {
    session_id: s.id,
    session_date: s.session_date,
    block_id: s.block_id,
    status,
    problems,
    snapshot: snap,
  });

  return { status, problems, session: s, snapshot: snap };
}

/* ─── Diagnóstico agregado ─────────────────────────────────────────────── */

export interface SessionDiagnosis {
  session: SessionRow | null;
  production: { date: string | null; cycleId: string | null; weekId: string | null };
  visits: number;
  rg: number;
  dwr: { exists: boolean; workDate: string | null };
  status: SessionStatus | "unknown";
  integrity: IntegrityStatus | "unknown";
  problems: string[];
}

export async function diagnoseSession(sessionId: string): Promise<SessionDiagnosis> {
  const { data: s } = await supabase
    .from("field_work_sessions")
    .select("id,user_id,session_date,block_number,block_id,cycle_id,week_id,status,created_at,updated_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (!s) {
    return {
      session: null,
      production: { date: null, cycleId: null, weekId: null },
      visits: 0, rg: 0,
      dwr: { exists: false, workDate: null },
      status: "unknown",
      integrity: "unknown",
      problems: ["Jornada inexistente"],
    };
  }

  const [{ count: visits }, { count: rg }, { data: dwr }] = await Promise.all([
    supabase.from("visits").select("id", { count: "exact", head: true }).eq("field_work_session_id", sessionId),
    supabase.from("boletins_rg").select("id", { count: "exact", head: true })
      .eq("agent_id", (s as any).user_id).eq("block_number", (s as any).block_number ?? ""),
    supabase.from("daily_work_records").select("work_date")
      .eq("agent_id", (s as any).user_id).eq("work_date", (s as any).session_date).maybeSingle(),
  ]);

  const integrity = await validateSessionIntegrity(sessionId);

  return {
    session: s as SessionRow,
    production: { date: (s as any).session_date, cycleId: (s as any).cycle_id, weekId: (s as any).week_id },
    visits: visits ?? 0,
    rg: rg ?? 0,
    dwr: { exists: !!dwr, workDate: (dwr as any)?.work_date ?? null },
    status: (s as any).status,
    integrity: integrity?.status ?? "unknown",
    problems: integrity?.problems ?? [],
  };
}

/* ─── Estado consolidado ───────────────────────────────────────────────── */

export async function getSessionState(sessionId: string) {
  return diagnoseSession(sessionId);
}

export async function validateSession(lookup: SessionLookup) {
  const s = await findSession(lookup);
  if (!s) return { exists: false as const };
  const integrity = await validateSessionIntegrity(s.id);
  return { exists: true as const, session: s, integrity };
}
