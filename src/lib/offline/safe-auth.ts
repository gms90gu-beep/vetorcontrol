// safeGetUser — substitui supabase.auth.getUser() em rotas operacionais.
// Mantém o MESMO formato de retorno: { data: { user }, error }.
// getUser() faz chamada de rede → offline lança "Failed to fetch" e quebra a rota.
// getSession() lê do localStorage e funciona offline.

import { supabase } from "@/integrations/supabase/client";
import { getLocalSession, getPersistedSupabaseSession } from "@/lib/auth";
import { isNetworkError, isOnline } from "./safe-fetch";

type Result = { data: { user: any | null }; error: any | null };

async function getLocalUser(): Promise<any | null> {
  try {
    const persisted = getPersistedSupabaseSession();
    if (persisted?.user) return persisted.user;

    const local = await getLocalSession();
    if (!local || local.expiresAt <= Date.now() - 60_000) return null;

    return {
      id: local.userId,
      email: local.email,
      aud: "authenticated",
      role: "authenticated",
      app_metadata: {},
      user_metadata: {},
      created_at: new Date(local.createdAt).toISOString(),
    };
  } catch {
    return null;
  }
}

export async function safeGetUser(): Promise<Result> {
  try {
    const { data: sess } = await supabase.auth.getSession();
    if (sess?.session?.user) {
      return { data: { user: sess.session.user }, error: null };
    }
  } catch (e) {
    if (!isNetworkError(e)) console.warn("[safeGetUser] getSession falhou:", e);
    const localUser = await getLocalUser();
    if (localUser) {
      console.log("[OFFLINE] safeGetUser usando sessão local após falha do cliente");
      return { data: { user: localUser }, error: null };
    }
  }

  const localUser = await getLocalUser();
  if (!isOnline()) {
    console.log("[OFFLINE] safeGetUser sem sessão local — retornando null sem rede");
    return { data: { user: localUser }, error: null };
  }

  try {
    const { data } = await supabase.auth.getUser();
    return { data: { user: data?.user ?? localUser }, error: null };
  } catch (e) {
    if (isNetworkError(e) || localUser) {
      console.log("[OFFLINE] safeGetUser mantendo sessão local após falha de rede/configuração");
      return { data: { user: localUser }, error: null };
    }
    console.warn("[safeGetUser] getUser falhou:", e);
    return { data: { user: null }, error: e };
  }
}
