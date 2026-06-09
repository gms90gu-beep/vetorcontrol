// safeGetUser — substitui supabase.auth.getUser() em rotas operacionais.
// getUser() faz chamada de rede → offline lança "Failed to fetch" e quebra a rota.
// getSession() lê do localStorage e funciona offline.
//
// Estratégia:
//   1) Tenta getSession() (local, instantâneo).
//   2) Se houver sessão, retorna session.user — sem rede.
//   3) Se NÃO houver sessão e estiver online, tenta getUser() como fallback.
//   4) Em qualquer falha de rede, retorna { user: null } sem lançar.

import { supabase } from "@/integrations/supabase/client";
import { isNetworkError, isOnline } from "./safe-fetch";

export async function safeGetUser(): Promise<{ user: any | null }> {
  try {
    const { data: sess } = await supabase.auth.getSession();
    if (sess?.session?.user) {
      return { user: sess.session.user };
    }
  } catch (e) {
    if (!isNetworkError(e)) console.warn("[safeGetUser] getSession falhou:", e);
  }

  if (!isOnline()) {
    console.log("[OFFLINE] safeGetUser sem sessão local — retornando null sem rede");
    return { user: null };
  }

  try {
    const { data } = await supabase.auth.getUser();
    return { user: data?.user ?? null };
  } catch (e) {
    if (isNetworkError(e)) {
      console.log("[OFFLINE] safeGetUser fallback getUser bloqueado");
      return { user: null };
    }
    console.warn("[safeGetUser] getUser falhou:", e);
    return { user: null };
  }
}
