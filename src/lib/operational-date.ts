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

export const MAX_FUTURE_PRODUCTION_DAYS = 1;

function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day;
}

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
  if (!isValidDateOnly(sessionDate) || !y || !m || !d) {
    console.error("[PRODUCTION_DATE_ERROR]", {
      module: moduleName,
      reason: "session_date inválida",
      raw: sessionDate,
      fallback: now.toISOString(),
    });
    return now.toISOString();
  }

  // `new Date(y, m - 1, d, ...)` usa o fuso local do dispositivo. Em um
  // celular configurado em UTC, ou no intervalo 21:00–23:59 BRT, o
  // `toISOString()` podia avançar o dia e gravar a visita na data seguinte.
  // A Data da Produção é brasileira; preserve-a explicitamente com o offset
  // de America/Sao_Paulo (-03:00). O horário atual é convertido para BRT
  // antes de ser combinado com a data da sessão.
  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => clock.find((p) => p.type === type)?.value ?? "00";
  const localBrazilTimestamp = `${sessionDate}T${part("hour")}:${part("minute")}:${part("second")}.${String(now.getMilliseconds()).padStart(3, "0")}-03:00`;
  // Preserve the explicit -03:00 representation. Converting immediately to
  // UTC would produce `2025-07-11T02:30:00Z` for 23:30 BRT and make legacy
  // consumers that read the date prefix believe it was the next day.
  const iso = localBrazilTimestamp;

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

/** Confere se uma Data da Produção está dentro da janela permitida. */
export function isOperationalDateInWindow(
  dateOnly: string | null | undefined,
  referenceDate: string,
  maxPastDays: number,
  maxFutureDays = 0,
): boolean {
  const parse = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return Number.NaN;
    const [year, month, day] = value.split("-").map(Number);
    const timestamp = Date.UTC(year, month - 1, day);
    const parsed = new Date(timestamp);
    return parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
      ? timestamp
      : Number.NaN;
  };
  if (!dateOnly) return false;
  const target = parse(dateOnly);
  const reference = parse(referenceDate);
  if (!Number.isFinite(target) || !Number.isFinite(reference)) return false;
  const daysFromReference = Math.round((target - reference) / 86400000);
  return daysFromReference >= -maxPastDays && daysFromReference <= maxFutureDays;
}

export function getOperationalDayRange(sessionDate?: string | null): { start: string; end: string; dateOnly: string } {
  const dateOnly = sessionDate && isValidDateOnly(sessionDate)
    ? sessionDate
    : getOperationalDate();
  const { startIso, endIso } = operationalDateBoundsUtcIso(dateOnly);
  return { start: startIso, end: endIso, dateOnly };
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

/**
 * Resolve a Data da Produção que ainda precisa ser encerrada.
 *
 * A data de uma visita é mais forte que a data do relógio: isso permite
 * encerrar uma produção anterior que ficou aberta sem confundi-la com uma
 * sessão vazia criada hoje. Sem visitas, preserva a intenção de uma jornada
 * retroativa ou futura e, por último, usa hoje em America/Sao_Paulo.
 *
 * Uma sessão pode atravessar a meia-noite, mas a produção pertence à data
 * operacional de cada visita. A data da sessão só prevalece em jornadas
 * explicitamente retroativas.
 */
export function resolveOperationalCloseTarget(
  sessions: OperationalSessionLike[],
  visits: OperationalVisitLike[],
  todayOperational: string = getOperationalDate(),
): { workDate: string; sessionId: string | null; source: "visit" | "retroactive_session" | "future_session" | "today_session" | "system_today" } {
  // Quando existe jornada retroativa aberta, ela é a intenção explícita do
  // usuário: só as visitas dessa jornada podem definir o alvo do fechamento.
  const futureSessions = sessions.filter((session) =>
    !session.is_retroactive &&
    session.session_date &&
    session.session_date !== todayOperational &&
    isOperationalDateInWindow(session.session_date, todayOperational, 0, MAX_FUTURE_PRODUCTION_DAYS)
  );
  const futureIds = new Set(futureSessions.filter((session) => session.id).map((session) => String(session.id)));
  const retroactiveIds = new Set(
    sessions.filter((s) => s.is_retroactive && s.id).map((s) => String(s.id)),
  );
  const candidateIds = futureIds.size > 0
    ? futureIds
    : retroactiveIds.size > 0
      ? retroactiveIds
      : new Set(sessions.map((session) => session.id).filter((id): id is string => !!id).map(String));
  const latestVisit = [...visits]
    .filter((visit) => !!visit.field_work_session_id && candidateIds.has(String(visit.field_work_session_id)) && !!toOperationalDate(visit.visit_date))
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
      const gap = Math.round((Date.parse(`${visitDate}T00:00:00Z`) - Date.parse(`${openedAt}T00:00:00Z`)) / 86400000);
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
  const futureSession = futureSessions.sort(byUpdatedDesc)[0];
  if (futureSession?.session_date) {
    return {
      workDate: futureSession.session_date,
      sessionId: futureSession.id ? String(futureSession.id) : null,
      source: "future_session",
    };
  }

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
