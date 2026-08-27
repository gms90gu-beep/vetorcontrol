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

/**
 * Instante UTC (ISO 8601 com offset explícito) correspondente ao início ou
 * fim de um dia operacional (America/Sao_Paulo), a partir de uma data
 * YYYY-MM-DD. Use SEMPRE que uma data operacional precisar virar um filtro
 * de timestamp enviado diretamente ao Supabase/Postgres
 * (`.gte`/`.lte` em colunas timestamptz) — nunca envie
 * `"YYYY-MM-DDT00:00:00"` cru como filtro: essa string não carrega fuso
 * horário, então o Postgres a interpreta usando o fuso da SESSÃO DO BANCO
 * (tipicamente UTC), não o de São Paulo, deslocando o corte do dia em
 * ~3 horas e fazendo visitas feitas à noite (~21h-24h) contarem no dia
 * seguinte (ou o contrário, dependendo do lado do corte).
 *
 * Brasil não observa horário de verão desde 2019 (mesma premissa já usada
 * em getOperationalDate), então o offset -03:00 é fixo e seguro aqui.
 */
export function operationalDateBoundsUtcIso(dateOnly: string): { startIso: string; endIso: string } {
  return {
    startIso: `${dateOnly}T00:00:00-03:00`,
    endIso: `${dateOnly}T23:59:59.999-03:00`,
  };
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

/**
 * Data operacional oficial (America/Sao_Paulo), formato YYYY-MM-DD.
 *
 * Fonte única para "hoje" no frontend. Substitui todo uso de
 * `new Date().toISOString().split('T')[0]` / `.slice(0,10)` que gera UTC
 * e desloca visitas noturnas para o dia seguinte.
 *
 * Bate 1:1 com `public.operational_date(now())` no banco.
 */
export function getOperationalDate(now: Date = new Date()): string {
  // Intl trata DST corretamente. Brasil sem DST desde 2019, mas mantém robusto.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(now); // "YYYY-MM-DD"
}

/**
 * Converte um timestamp (ISO/Date) para a data operacional (YYYY-MM-DD) em
 * America/Sao_Paulo. Espelha `public.operational_date(timestamptz)` no banco
 * e substitui `String(ts).slice(0,10)` (que devolve UTC e desloca visitas
 * noturnas para o dia seguinte).
 */
export function toOperationalDate(ts: string | Date | null | undefined): string | null {
  if (!ts) return null;
  const d = ts instanceof Date ? ts : new Date(ts);
  if (isNaN(d.getTime())) return null;
  return getOperationalDate(d);
}

export interface OperationalSessionLike {
  id?: string | null;
  session_date?: string | null;
  is_retroactive?: boolean | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface OperationalVisitLike {
  field_work_session_id?: string | null;
  visit_date?: string | null;
}

/** Janela máxima (dias) para consolidar visitas recentes no dia de abertura da sessão. */
const CROSS_DAY_CONSOLIDATION_MAX_DAYS = 7;

function daysBetween(fromDateOnly: string, toDateOnly: string): number {
  const [fy, fm, fd] = fromDateOnly.split("-").map(Number);
  const [ty, tm, td] = toDateOnly.split("-").map(Number);
  return Math.round((Date.UTC(ty, (tm || 1) - 1, td || 1) - Date.UTC(fy, (fm || 1) - 1, fd || 1)) / 86400000);
}

/**
 * Resolve a Data da Produção que ainda precisa ser encerrada.
 *
 * A data de uma visita é mais forte que a data do relógio: isso permite
 * encerrar uma produção anterior que ficou aberta sem confundi-la com uma
 * sessão vazia criada hoje. Sem visitas, preserva a intenção de uma jornada
 * retroativa e, por último, usa hoje em America/Sao_Paulo.
 *
 * Consolidação de virada de dia: quando a sessão dona da visita mais recente
 * foi ABERTA em um dia anterior (quarteirão começou num dia e está sendo
 * finalizado depois), toda a produção dessa sessão é contabilizada no
 * session_date de abertura — desde que a sessão esteja em andamento e a
 * defasagem seja ≤ 7 dias. Acima disso mantém o comportamento por visita.
 */
export function resolveOperationalCloseTarget(
  sessions: OperationalSessionLike[],
  visits: OperationalVisitLike[],
  todayOperational: string = getOperationalDate(),
): { workDate: string; sessionId: string | null; source: "visit" | "session_open" | "retroactive_session" | "today_session" | "system_today" } {
  const sessionIds = new Set(sessions.map((session) => session.id).filter((id): id is string => !!id));
  const latestVisit = [...visits]
    .filter((visit) => !!visit.field_work_session_id && sessionIds.has(String(visit.field_work_session_id)) && !!toOperationalDate(visit.visit_date))
    .sort((a, b) => String(b.visit_date ?? "").localeCompare(String(a.visit_date ?? "")))[0];
  const visitDate = toOperationalDate(latestVisit?.visit_date);
  if (latestVisit && visitDate) {
    const visitSessionId = latestVisit.field_work_session_id ? String(latestVisit.field_work_session_id) : null;
    const owner = sessions.find((session) => session.id && String(session.id) === visitSessionId);
    const openedAt = owner?.session_date ?? null;
    // Sessão retroativa ("Alterar Data"): a data do formulário é soberana.
    // As visitas são digitadas hoje, mas a produção pertence ao dia informado.
    if (owner?.is_retroactive && openedAt) {
      if (openedAt !== visitDate) {
        console.log("[PRODUCTION_DATE_SOURCE]", {
          module: "resolveOperationalCloseTarget",
          source: "retroactive_session_date",
          session_date: openedAt,
          latest_visit_date: visitDate,
        });
      }
      return { workDate: openedAt, sessionId: visitSessionId, source: "retroactive_session" };
    }
    if (owner && openedAt && openedAt < visitDate) {
      const gap = daysBetween(openedAt, visitDate);
      const isOpen = !owner.status || owner.status === "in_progress";
      if (isOpen && gap <= CROSS_DAY_CONSOLIDATION_MAX_DAYS) {
        return { workDate: openedAt, sessionId: visitSessionId, source: "session_open" };
      }

      console.warn("[DAY_CLOSE_STALE_SESSION]", {
        session_id: visitSessionId,
        session_date: openedAt,
        latest_visit_date: visitDate,
        gap_days: gap,
        session_status: owner.status ?? null,
        decision: "mantido work_date pela visita mais recente",
      });
    }
    return {
      workDate: visitDate,
      sessionId: visitSessionId,
      source: "visit",
    };
  }


  const byUpdatedDesc = (a: OperationalSessionLike, b: OperationalSessionLike) =>
    String(b.updated_at ?? b.created_at ?? "").localeCompare(String(a.updated_at ?? a.created_at ?? ""));
  const retroactive = sessions
    .filter((session) => session.is_retroactive && session.session_date)
    .sort(byUpdatedDesc)[0];
  if (retroactive?.session_date) {
    return {
      workDate: retroactive.session_date,
      sessionId: retroactive.id ? String(retroactive.id) : null,
      source: "retroactive_session",
    };
  }

  const todaySession = sessions
    .filter((session) => session.session_date === todayOperational)
    .sort(byUpdatedDesc)[0];
  return {
    workDate: todayOperational,
    sessionId: todaySession?.id ? String(todaySession.id) : null,
    source: todaySession ? "today_session" : "system_today",
  };
}

/**
 * Semana e ano epidemiológicos (ISO) calculados a partir de uma data-only
 * (YYYY-MM-DD) já normalizada para America/Sao_Paulo. Uso interno de UTC
 * aqui é seguro porque a entrada é uma data de calendário, não timestamp.
 */
export function epiWeekFromDate(dateOnly: string): { week: number; year: number } {
  const [y, m, d] = dateOnly.split("-").map(Number);
  const t = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { week, year: t.getUTCFullYear() };
}
