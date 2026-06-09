// Registro guardado do Service Worker.
// Regras (skill/pwa):
//  - NUNCA registrar em dev, dentro de iframe, em previews da Lovable,
//    nem se a URL tiver ?sw=off.
//  - Em qualquer contexto recusado, fazer unregister de SWs antigos em /sw.js.

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
        console.log("[PWA] Service worker desregistrado:", url);
      }
    }
  } catch (e) {
    console.warn("[PWA] Falha ao desregistrar SW antigo:", e);
  }
}

export async function registerPwa(): Promise<void> {
  if (isRefusedContext()) {
    await unregisterAppSw();
    return;
  }
  if (!("serviceWorker" in navigator)) return;
  try {
    const { registerSW } = await import("virtual:pwa-register");
    registerSW({ immediate: true });
    console.log("[PWA] Service worker registrado");
  } catch (e) {
    console.warn("[PWA] Falha ao registrar SW:", e);
  }
}
