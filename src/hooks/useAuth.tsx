import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

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

async function getVerifiedAuthState() {
  console.debug("[Auth] Restaurando sessão persistida...");
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

  if (sessionError) {
    console.error("[Auth] Erro ao restaurar sessão:", sessionError);
  }

  if (!sessionData.session) {
    console.debug("[Auth] Nenhuma sessão persistida encontrada.");
    return { session: null, user: null };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    console.warn("[Auth] Sessão encontrada, mas o usuário não foi validado:", userError);
    return { session: null, user: null };
  }

  console.debug("[Auth] Sessão validada para:", userData.user.email ?? userData.user.id);
  return { session: sessionData.session, user: userData.user };
}

async function getRoleForUser(userId: string) {
  console.debug("[Auth Role] Buscando role via RPC para:", userId);
  const { data, error } = await supabase.rpc("get_user_role", { u_id: userId });

  if (error) {
    console.error("[Auth Role] Erro ao buscar role via RPC:", error);
    return null;
  }

  const role = typeof data === "string" ? data : null;
  console.debug("[Auth Role] Role encontrado via RPC:", role);
  return role;
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