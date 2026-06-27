import React from "react";

/**
 * Boundary defensivo que captura qualquer exceção lançada DURANTE o uso
 * normal da aplicação (após o boot) — especialmente erros de rede vindos
 * de useEffect / Providers / Contexts / Queries / hooks.
 *
 * Regra de ouro:
 *  - Erros de rede NUNCA bloqueiam a tela.
 *  - Demais erros: log detalhado + render dos children (mantém UI viva).
 *
 * Log emitido: [ERROR_BOUNDARY_SOURCE]
 */

function isNetworkLike(err: unknown): boolean {
  if (!err) return false;
  const e = err as any;
  const msg = String(e?.message || e || "");
  if (/Failed to fetch|NetworkError|Network request failed|fetch failed|Load failed/i.test(msg)) return true;
  if (e?.name === "TypeError" && /fetch/i.test(msg)) return true;
  if (e?.name === "AuthRetryableFetchError") return true;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return false;
}

type State = { recovered: number };

export class PostBootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { recovered: 0 };

  static getDerivedStateFromError() {
    // Mantém o tree montado — não troca para fallback bloqueante.
    return null;
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    const network = isNetworkLike(error);
    const e = error as any;
    console.log("[ERROR_BOUNDARY_SOURCE]", {
      network,
      name: e?.name,
      message: String(e?.message || e),
      stack: String(e?.stack || "").split("\n").slice(0, 6).join("\n"),
      componentStack: String(info?.componentStack || "").split("\n").slice(0, 6).join("\n"),
      online: typeof navigator !== "undefined" ? navigator.onLine : null,
      at: Date.now(),
    });

    if (network) {
      // Recupera imediatamente — não permite que a UI fique bloqueada.
      console.log("[POST_BOOT_ERROR] rede engolido pelo boundary — auto-recover");
      this.setState((s) => ({ recovered: s.recovered + 1 }));
      return;
    }

    // Erro não-rede: ainda assim mantemos a UI; a aplicação não deve travar.
    this.setState((s) => ({ recovered: s.recovered + 1 }));
  }

  render() {
    return this.props.children;
  }
}
