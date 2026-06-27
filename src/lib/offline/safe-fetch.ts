// safeFetch — executa uma leitura remota com fallback offline.
// Pattern Repository:
//   online  → tenta Supabase, hidrata Dexie, retorna remoto
//   offline → vai direto no fallback (Dexie)
//   erro de rede (TypeError: Failed to fetch / NetworkError) → fallback Dexie
//
// Nunca propaga "Failed to fetch" — sempre cai no fallback ou retorna o valor padrão.

import { toast } from "sonner";

export function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

export function isNetworkError(err: unknown): boolean {
  if (!err) return false;
  const e = err as any;
  const msg = String(e?.message || e || "");
  if (/Failed to fetch|NetworkError|Network request failed|fetch failed|TypeError: fetch/i.test(msg)) return true;
  if (e?.name === "TypeError" && /fetch/i.test(msg)) return true;
  if (e?.code === "ECONNREFUSED" || e?.code === "ENETUNREACH") return true;
  // Supabase-js empacota erros de rede como AuthRetryableFetchError
  if (e?.name === "AuthRetryableFetchError") return true;
  return false;
}

let lastOfflineToastAt = 0;
export function notifyOfflineOnce(message = "Modo Offline Ativo — dados do armazenamento local") {
  const now = Date.now();
  if (now - lastOfflineToastAt < 8000) return;
  lastOfflineToastAt = now;
  try { toast.message(message); } catch {}
}

export async function safeFetch<T>(
  remote: () => Promise<T>,
  fallback: () => Promise<T> | T,
  opts?: { label?: string; hydrate?: (data: T) => void | Promise<void> },
): Promise<T> {
  const label = opts?.label || "dado";
  const tryFallback = async (): Promise<T> => {
    try { return await fallback(); }
    catch (e) {
      console.log("[POST_BOOT_SAFEFETCH]", { label, stage: "fallback-failed", message: String((e as any)?.message || e) });
      return undefined as unknown as T;
    }
  };
  if (!isOnline()) {
    console.log(`[OFFLINE] Lendo Dexie (${label})`);
    return await tryFallback();
  }
  try {
    const data = await remote();
    if (opts?.hydrate) {
      try { await opts.hydrate(data); } catch (e) { console.warn("[OFFLINE] hydrate falhou:", e); }
    }
    return data;
  } catch (err) {
    if (isNetworkError(err)) {
      console.log(`[POST_BOOT_SAFEFETCH] rede caiu (${label}) — usando Dexie`);
      notifyOfflineOnce();
      return await tryFallback();
    }
    // Erros não-rede: log e fallback silencioso (não bloqueia UI)
    console.log("[POST_BOOT_SAFEFETCH]", { label, stage: "remote-error", message: String((err as any)?.message || err) });
    return await tryFallback();
  }
}
