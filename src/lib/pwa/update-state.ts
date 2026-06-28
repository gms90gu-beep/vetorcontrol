// Estado reativo da atualização do PWA.
// - hasUpdate: existe uma nova versão em "waiting"
// - journeyActive: jornada de campo em andamento (não interromper)
// - apply(): efetiva a atualização (skipWaiting + reload)
//
// O reload é executado pelo virtual:pwa-register quando o novo SW assume o
// controle (controllerchange). Sessão, Dexie, fila e rascunhos persistem
// porque vivem em IndexedDB / localStorage — não são perdidos no reload.

type Listener = () => void;

const state = {
  hasUpdate: false,
  journeyActive: false,
  applyFn: null as null | (() => Promise<void>),
};

const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => {
    try { l(); } catch {}
  });
}

export function getPwaUpdateState() {
  return {
    hasUpdate: state.hasUpdate,
    journeyActive: state.journeyActive,
    canApply: !!state.applyFn,
  };
}

export function subscribePwaUpdate(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function setPwaUpdateAvailable(apply: () => Promise<void>) {
  state.applyFn = apply;
  state.hasUpdate = true;
  console.log("[PWA_UPDATE_AVAILABLE]", { journeyActive: state.journeyActive });
  // Atualização silenciosa: se não há jornada ativa e o app acabou de abrir,
  // aplicamos automaticamente (caso de "fechou e reabriu com nova versão").
  if (!state.journeyActive && document.visibilityState === "hidden") {
    console.log("[PWA_UPDATE_ACCEPTED]", { silent: true });
    void applyPwaUpdate();
  }
  emit();
}

export async function applyPwaUpdate(): Promise<void> {
  if (!state.applyFn) return;
  if (state.journeyActive) {
    console.log("[PWA_UPDATE_DEFERRED]", { reason: "journey-active" });
    return;
  }
  console.log("[PWA_UPDATE_ACCEPTED]");
  try {
    await state.applyFn();
    console.log("[PWA_UPDATE_ACTIVATED]");
    // O reload é disparado pelo virtual:pwa-register em controllerchange.
    console.log("[PWA_UPDATE_RELOAD]");
  } catch (e) {
    console.warn("[PWA_UPDATE_ROLLBACK]", { message: String((e as any)?.message || e) });
  }
}

export function dismissPwaUpdate() {
  state.hasUpdate = false;
  console.log("[PWA_UPDATE_DEFERRED]", { reason: "user-dismissed" });
  emit();
}

/**
 * Marca/desmarca jornada ativa. Enquanto ativa, atualizações pendentes
 * não são aplicadas automaticamente nem podem ser forçadas pelo usuário —
 * serão aplicadas ao finalizar a jornada ou no próximo abrir do app.
 */
export function setJourneyActive(active: boolean) {
  if (state.journeyActive === active) return;
  state.journeyActive = active;
  if (!active && state.hasUpdate && state.applyFn) {
    console.log("[PWA_UPDATE_ACCEPTED]", { trigger: "journey-finished" });
    void applyPwaUpdate();
  }
  emit();
}

if (typeof window !== "undefined") {
  (window as any).__vcSetJourneyActive = setJourneyActive;
}
