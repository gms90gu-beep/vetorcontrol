// Captura global de erros de rede para evitar que "Failed to fetch"
// quebre a tela quando o usuário estiver offline.
//
// Estratégia:
//  - Intercepta window.error e unhandledrejection
//  - Se for erro de rede (TypeError: Failed to fetch / NetworkError), engole
//    e mostra um toast amigável "Modo Offline Ativo".
//  - Demais erros seguem o fluxo normal.

import { isNetworkError, notifyOfflineOnce } from "./safe-fetch";

let installed = false;

export function installNetworkGuard() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("unhandledrejection", (event) => {
    const reason = (event as PromiseRejectionEvent).reason;
    if (isNetworkError(reason)) {
      console.log("[OFFLINE] unhandledrejection de rede engolido:", (reason as any)?.message || reason);
      notifyOfflineOnce();
      event.preventDefault();
    }
  });

  window.addEventListener("error", (event) => {
    const err = (event as ErrorEvent).error;
    if (isNetworkError(err) || isNetworkError((event as ErrorEvent).message)) {
      console.log("[OFFLINE] window.error de rede engolido");
      notifyOfflineOnce();
      event.preventDefault();
    }
  });

  // Listener informativo para troca de status
  window.addEventListener("online", () => {
    console.log("[SYNC] Conexão restabelecida — tentando sincronizar");
  });
  window.addEventListener("offline", () => {
    console.log("[OFFLINE] Conexão perdida — modo offline ativo");
    // Não exibe toast bloqueante; o OfflineBanner já indica visualmente.
  });
}
