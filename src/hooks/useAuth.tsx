import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getCachedUserRole } from "@/lib/offline/role-cache";
import { safeFetch } from "@/lib/offline/safe-fetch";

type AppRole = "admin_master" | "coordenador" | "supervisor" | "agente" | string;

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  isReady: boolean;
  isLoading: boolean;
  isRoleLoading: boolean;
  refreshSession: () => Promise<Session | null>;
  refreshRole: () => Promise<AppRole | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function isNetErr(e: any) {
  const msg = String(e?.message || e || "");
  return /Failed to fetch|NetworkError|fetch failed|AuthRetryableFetchError/i.test(msg) || e?.name === "AuthRetryableFetchError";
}

async function getVerifiedAuthState() {
  console.debug("[Auth] Restaurando sessão persistida...");
  let sessionData: any = null;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) console.error("[Auth] Erro ao restaurar sessão:", error);
    sessionData = data;
  } catch (e) {
    console.warn("[Auth] getSession falhou:", e);
  }

  if (!sessionData?.session) {
    console.debug("[Auth] Nenhuma sessão persistida encontrada.");
    return { session: null, user: null };
  }

  // CRÍTICO offline: se já temos sessão local, usar o user dela.
  // getUser() faz rede e quebra offline → derruba sessão e expulsa para /login.
  const sessionUser = sessionData.session.user ?? null;
  const online = typeof navigator === "undefined" ? true : navigator.onLine !== false;
  if (!online) {
    console.log("[OFFLINE] useAuth — usando user da sessão local (sem rede)");
    return { session: sessionData.session, user: sessionUser };
  }

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      if (isNetErr(userError)) {
        console.log("[OFFLINE] useAuth — getUser falhou por rede, mantendo sessão local");
        return { session: sessionData.session, user: sessionUser };
      }
      console.warn("[Auth] Sessão encontrada, mas o usuário não foi validado:", userError);
      return { session: null, user: null };
    }
    console.debug("[Auth] Sessão validada para:", userData.user.email ?? userData.user.id);
    return { session: sessionData.session, user: userData.user };
  } catch (e) {
    if (isNetErr(e)) {
      console.log("[OFFLINE] useAuth — getUser exception por rede, mantendo sessão local");
      return { session: sessionData.session, user: sessionUser };
    }
    console.warn("[Auth] getUser falhou:", e);
    return { session: null, user: null };
  }
}

async function getRoleForUser(userId: string) {
  console.debug("[Auth Role] Buscando role (offline-first) para:", userId);
  try {
    const role = await getCachedUserRole(userId);
    console.debug("[Auth Role] Role encontrado:", role);
    return role;
  } catch (error) {
    console.error("[Auth Role] Erro ao buscar role:", error);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const lastAuthUserIdRef = useRef<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isRoleLoading, setIsRoleLoading] = useState(false);

  const refreshSession = useCallback(async () => {
    setIsReady(false);
    const nextAuthState = await getVerifiedAuthState();
    setSession(nextAuthState.session);
    setUser(nextAuthState.user);
    setIsReady(true);
    return nextAuthState.session;
  }, []);

  const refreshRole = useCallback(async () => {
    if (!user?.id) {
      setRole(null);
      return null;
    }

    setIsRoleLoading(true);
    const nextRole = await getRoleForUser(user.id);
    setRole(nextRole);
    setIsRoleLoading(false);
    return nextRole;
  }, [user?.id]);

  const signOut = useCallback(async () => {
    console.debug("[Auth] Encerrando sessão...");
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setRole(null);
    setIsReady(true);
  }, []);

  useEffect(() => {
    let isMounted = true;

    getVerifiedAuthState().then((nextAuthState) => {
      if (!isMounted) return;
      setSession(nextAuthState.session);
      setUser(nextAuthState.user);
      lastAuthUserIdRef.current = nextAuthState.user?.id ?? null;
      setIsReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      console.debug("[Auth] Evento de autenticação:", event, nextSession?.user?.email ?? "sem usuário");
      if (!isMounted) return;

      const nextUser = nextSession?.user ?? null;
      const previousUserId = lastAuthUserIdRef.current;
      const nextUserId = nextUser?.id ?? null;

      setSession(nextSession);
      setUser(nextUser);
      lastAuthUserIdRef.current = nextUserId;
      setIsReady(true);

      if (!nextUser) {
        setRole(null);
        setIsRoleLoading(false);
      }

      if (event !== "INITIAL_SESSION" && previousUserId !== nextUserId) {
        router.invalidate();
        queryClient.invalidateQueries();
      }

      // [AUTOHEAL_AGENT] garante que todo usuário logado tem agent
      if (nextUser && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        supabase.rpc("autoheal_agent", { _user_id: nextUser.id }).then(({ data, error }) => {
          if (error) {
            console.warn("[AUTOHEAL_AGENT] falhou:", error.message);
          } else if (data) {
            console.debug("[AUTOHEAL_AGENT] agent_id=", data, "profile_id=", nextUser.id);
          }
        });
      }

    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [queryClient, router]);

  useEffect(() => {
    if (!isReady) return;

    if (!user?.id) {
      setRole(null);
      setIsRoleLoading(false);
      return;
    }

    let isActive = true;
    setIsRoleLoading(true);

    getRoleForUser(user.id)
      .then((nextRole) => {
        if (isActive) setRole(nextRole);
      })
      .finally(() => {
        if (isActive) setIsRoleLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [isReady, user?.id]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      role,
      isReady,
      isLoading: !isReady || isRoleLoading,
      isRoleLoading,
      refreshSession,
      refreshRole,
      signOut,
    }),
    [session, user, role, isReady, isRoleLoading, refreshSession, refreshRole, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider");
  }

  return context;
}