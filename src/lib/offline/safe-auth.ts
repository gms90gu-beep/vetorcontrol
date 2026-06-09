// safeGetUser — substitui supabase.auth.getUser() em rotas operacionais.
// Mantém o MESMO formato de retorno: { data: { user }, error }.
// getUser() faz chamada de rede → offline lança "Failed to fetch" e quebra a rota.
// getSession() lê do localStorage e funciona offline.

import { supabase } from "@/integrations/supabase/client";
import { isNetworkError, isOnline } from "./safe-fetch";

type Result = { data: { user: any | null }; error: any | null };

export async function safeGetUser(): Promise<Result> {
  try {
    const { data: sess } = await supabase.auth.getSession();
    if (sess?.session?.user) {
      return { data: { user: sess.session.user }, error: null };
    }
  } catch (e) {
    if (!isNetworkError(e)) console.warn("[safeGetUser] getSession falhou:", e);
  }

  if (!isOnline()) {
    console.log("[OFFLINE] safeGetUser sem sessão local — retornando null sem rede");
    return { data: { user: null }, error: null };
  }

  try {
    const { data } = await supabase.auth.getUser();
    return { data: { user: data?.user ?? null }, error: null };
  } catch (e) {
    if (isNetworkError(e)) {
      console.log("[OFFLINE] safeGetUser fallback getUser bloqueado");
      return { data: { user: null }, error: null };
    }
    console.warn("[safeGetUser] getUser falhou:", e);
    return { data: { user: null }, error: e };
  }
}
