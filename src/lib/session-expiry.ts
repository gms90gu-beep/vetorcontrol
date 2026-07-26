// Rede de segurança central para o auto-fechamento de jornadas expiradas.
//
// Problema corrigido: `closeExpiredInProgressSessions()` só era chamada em
// duas rotas de campo e apenas se o app estivesse online NAQUELE instante.
// Se o agente abrisse o app offline (cenário normal em campo) ou entrasse
// por outra rota (Minhas Jornadas, painel operacional), a sessão nunca era
// fechada e ficava presa em `in_progress` para sempre.
//
// Estratégia:
//  - Um único ponto de entrada: `ensureExpiredSessionsClosed(userId)`.
//  - Se offline, guarda a intenção (flag em localStorage) e registra um
//    listener 'online' (mesmo padrão do Sync Engine) para tentar de novo.
//  - Deduplicação por (userId + Data da Produção) para não bater no banco a
//    cada navegação; a intenção pendente sempre força nova tentativa.

import { closeExpiredInProgressSessions } from "@/lib/session-state";
import { getOperationalDate } from "@/lib/operational-date";
import { isOnline } from "@/lib/offline/safe-fetch";

const DONE_KEY = "vc.session-expiry.lastRun"; // `${userId}:${operationalDate}`
const PENDING_KEY = "vc.session-expiry.pending"; // userId aguardando conectividade

let inFlight: Promise<number> | null = null;
let listenerInstalled = false;

function read(key: string): string | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (typeof localStorage === "undefined") return;
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage indisponível — degrada para verificação por sessão */
  }
}

function installOnlineListener() {
  if (listenerInstalled || typeof window === "undefined") return;
  listenerInstalled = true;
  const retry = () => {
    const userId = read(PENDING_KEY);
    if (!userId || !isOnline()) return;
    console.log("[SESSION_EXPIRY_RETRY] conectividade restabelecida", { userId });
    void ensureExpiredSessionsClosed(userId, { force: true });
  };
  window.addEventListener("online", retry);
  window.addEventListener("focus", retry);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") retry();
  });
}

/**
 * Fecha jornadas `in_progress` de Datas da Produção anteriores.
 * Seguro para chamar em qualquer boot/rota — deduplica e trata offline.
 */
export async function ensureExpiredSessionsClosed(
  userId: string | undefined | null,
  opts: { force?: boolean } = {},
): Promise<number> {
  if (!userId || typeof window === "undefined") return 0;
  installOnlineListener();

  const today = getOperationalDate();
  const stamp = `${userId}:${today}`;
  const pending = read(PENDING_KEY) === userId;

  if (!opts.force && !pending && read(DONE_KEY) === stamp) return 0;

  if (!isOnline()) {
    // Guarda a intenção: será reexecutada quando a conectividade voltar.
    write(PENDING_KEY, userId);
    console.log("[SESSION_EXPIRY_DEFERRED] offline — tentativa adiada", { userId, today });
    return 0;
  }

  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const closed = await closeExpiredInProgressSessions(userId, today);
      write(DONE_KEY, stamp);
      write(PENDING_KEY, null);
      console.log("[SESSION_EXPIRY_OK]", { userId, today, closed });
      return closed;
    } catch (e: any) {
      // Mantém a intenção pendente para nova tentativa.
      write(PENDING_KEY, userId);
      console.warn("[SESSION_EXPIRY_ERR]", e?.message || e);
      return 0;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Chamado no logout/login para permitir nova verificação do próximo usuário. */
export function resetSessionExpiryGuard() {
  write(DONE_KEY, null);
  write(PENDING_KEY, null);
}
