// debug-console.ts — silencia console.log/console.debug em produção por padrão.
//
// Este app usa console.log com profusão para diagnóstico offline/PWA
// (tags como [RG_SYNC_*], [PWA_*], [DAY_CLOSE_*] — ver PwaManagerSection e
// os módulos de sync/offline). É valioso ao investigar um problema pontual
// em campo, mas em uso normal de produção vira ruído constante no console
// do navegador — inclusive expondo dados operacionais ([RG_DEXIE_SAVE] loga
// o registro inteiro a cada sincronização) — e tem custo de performance
// mensurável em telas com muitos registros.
//
// console.warn/console.error continuam sempre ativos (sinal de problema
// real, não diagnóstico de rotina).
//
// Reative o log verboso quando precisar depurar algo em produção:
//   - abra a URL com ?debug=1 (fica salvo, sobrevive a reload/fechar o app)
//   - ou rode window.__vcEnableDebugLogs() no console do navegador
// Desative com ?debug=0 ou window.__vcDisableDebugLogs().

const STORAGE_KEY = "vc:debug_logs";

function isDebugEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get("debug");
    if (flag === "1") {
      localStorage.setItem(STORAGE_KEY, "1");
      return true;
    }
    if (flag === "0") {
      localStorage.removeItem(STORAGE_KEY);
      return false;
    }
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    // localStorage indisponível (modo privado etc.) — não bloqueia o boot,
    // só assume debug desligado.
    return false;
  }
}

export function installProductionConsoleGate(): void {
  if (typeof window === "undefined") return;
  if (!import.meta.env.PROD) return; // dev/preview sempre verboso
  if (isDebugEnabled()) return;

  const noop = () => {};
  const originalLog = console.log.bind(console);
  const originalDebug = console.debug.bind(console);

  console.log = noop;
  console.debug = noop;

  (window as any).__vcEnableDebugLogs = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {}
    console.log = originalLog;
    console.debug = originalDebug;
    originalLog("[DEBUG_LOGS] reativados. Recarregue a página para capturar também os logs de boot.");
  };

  (window as any).__vcDisableDebugLogs = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    console.log = noop;
    console.debug = noop;
  };
}

installProductionConsoleGate();
