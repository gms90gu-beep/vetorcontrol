// Registro guardado do Service Worker.
// Regras (skill/pwa):
//  - NUNCA registrar em dev, dentro de iframe, em previews da Lovable,
//    nem se a URL tiver ?sw=off.
//  - Em qualquer contexto recusado, fazer unregister de SWs antigos em /sw.js.
//
// Estratégia de atualização ATÔMICA:
//  - Workbox configurado com skipWaiting:false / clientsClaim:false.
//  - O novo SW só assume após install completo (todos os assets precacheados)
//    E após uma navegação/reload do usuário. Enquanto isso, a versão antiga
//    continua servindo a aplicação — garante que o app funcione offline mesmo
//    durante uma atualização parcial.

const APP_SW_URL = "/sw.js";

function isRefusedContext(): boolean {
  if (typeof window === "undefined") return true;
  if (!import.meta.env.PROD) return true;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  const host = window.location.hostname;
  if (
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev")
  ) {
    return true;
  }
  if (new URL(window.location.href).searchParams.get("sw") === "off") return true;
  return false;
}

async function unregisterAppSw() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) {
      const url = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "";
      if (url.endsWith(APP_SW_URL)) {
        await r.unregister();
        console.log("[SW_ROLLBACK]", { url, reason: "refused-context" });
      }
    }
  } catch (e) {
    console.warn("[SW_ROLLBACK] Falha ao desregistrar SW antigo:", e);
  }
}

function attachLifecycleLogs(reg: ServiceWorkerRegistration) {
  const log = (sw: ServiceWorker | null, label: string) => {
    if (!sw) return;
    console.log(label, { state: sw.state, scriptURL: sw.scriptURL });
    sw.addEventListener("statechange", () => {
      console.log(label, { state: sw.state, scriptURL: sw.scriptURL });
      if (sw.state === "installed" && navigator.serviceWorker.controller) {
        console.log("[SW_WAITING]", {
          message: "Nova versão pronta. Será ativada no próximo reload.",
        });
      }
      if (sw.state === "activated") {
        console.log("[SW_ACTIVATE]", { scriptURL: sw.scriptURL });
      }
    });
  };

  log(reg.installing, "[SW_INSTALL]");
  log(reg.waiting, "[SW_WAITING]");
  log(reg.active, "[SW_ACTIVATE]");

  reg.addEventListener("updatefound", () => {
    console.log("[SW_INSTALL]", { stage: "updatefound" });
    log(reg.installing, "[SW_INSTALL]");
  });
}

export async function registerPwa(): Promise<void> {
  // Auditoria do manifest (independente do contexto)
  try {
    const res = await fetch("/manifest.webmanifest", { cache: "no-cache" });
    if (!res.ok) {
      console.warn("[PWA_MANIFEST_ERROR]", { status: res.status });
    } else {
      const m = await res.json();
      const has192 = Array.isArray(m.icons) && m.icons.some((i: any) => String(i.sizes || "").includes("192x192"));
      const has512 = Array.isArray(m.icons) && m.icons.some((i: any) => String(i.sizes || "").includes("512x512"));
      const ok = !!(m.name && m.short_name && m.start_url && m.scope && m.display && has192 && has512);
      console.log(ok ? "[PWA_MANIFEST_OK]" : "[PWA_MANIFEST_ERROR]", {
        name: m.name,
        short_name: m.short_name,
        start_url: m.start_url,
        scope: m.scope,
        display: m.display,
        has192,
        has512,
      });
    }
  } catch (e) {
    console.warn("[PWA_MANIFEST_ERROR]", { message: String((e as any)?.message || e) });
  }

  if (isRefusedContext()) {
    await unregisterAppSw();
    return;
  }
  if (!("serviceWorker" in navigator)) return;
  try {
    const { registerSW } = await import("virtual:pwa-register");
    const { setPwaUpdateAvailable } = await import("./update-state");
    const updateSW = registerSW({
      immediate: true,
      onRegisteredSW(swUrl, reg) {
        console.log("[SW_VERSION]", { swUrl });
        console.log("[PWA_SW_REGISTER]", { swUrl, scope: reg?.scope });
        if (reg?.active) console.log("[PWA_SW_ACTIVE]", { scriptURL: reg.active.scriptURL });
        if (navigator.serviceWorker.controller) {
          console.log("[PWA_CACHE_HIT]", { scriptURL: navigator.serviceWorker.controller.scriptURL });
        } else {
          console.log("[PWA_CACHE_MISS]", { reason: "no-controller-yet" });
        }
        if (reg) {
          attachLifecycleLogs(reg);
          reg.addEventListener("updatefound", () => {
            console.log("[PWA_UPDATE_FOUND]");
            const sw = reg.installing;
            sw?.addEventListener("statechange", () => {
              if (sw.state === "installed" && navigator.serviceWorker.controller) {
                console.log("[PWA_UPDATE_WAITING]");
              }
            });
          });
        }
      },
      onNeedRefresh() {
        console.log("[SW_WAITING]", { needRefresh: true });
        // Expõe ao app: aplica = skipWaiting + reload automático (virtual:pwa-register
        // escuta controllerchange e dispara window.location.reload()).
        setPwaUpdateAvailable(async () => {
          await updateSW(true);
        });
      },
      onOfflineReady() {
        console.log("[SW_CACHE]", { offlineReady: true });
        console.log("[PWA_CACHE_INSTALL]", { offlineReady: true });
      },
      onRegisterError(err) {
        console.warn("[SW_ROLLBACK]", { stage: "register-error", message: String((err as any)?.message || err) });
        console.warn("[PWA_SW_ERROR]", { message: String((err as any)?.message || err) });
      },
    });
    // expõe util para forçar atualização manualmente, se necessário
    (window as any).__applySwUpdate = () => updateSW(true);
  } catch (e) {
    console.warn("[SW_ROLLBACK] Falha ao registrar SW:", e);
  }
}
