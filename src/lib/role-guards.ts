import { redirect, isRedirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { hasValidLocalSession, getLocalSession } from "@/auth/auth";
import { getCachedUserRole, readCachedUserRole } from "@/lib/offline/role-cache";

export const MANAGER_ROLES = ["supervisor", "coordenador", "admin_master"] as const;
export type ManagerRole = (typeof MANAGER_ROLES)[number];

/**
 * ATENCAO — bypass hardcoded por e-mail.
 *
 * Isso concede acesso de admin_master no CLIENTE para esta conta especifica,
 * independente do que estiver em profiles.role. E' uma rede de seguranca para
 * nao trancar o dono do projeto fora das telas /admin/* caso a role no banco
 * fique dessincronizada — mas e' fragil (duplicada por varios arquivos antes
 * desta refatoracao) e um risco se este e-mail for reaproveitado por outra
 * conta. As RPCs server-side (assert_admin_master, etc.) continuam validando
 * a role de verdade, entao isso nao expande acesso a dados — so a navegacao
 * do lado do cliente. Se a role admin_master no banco esta confiavel, o ideal
 * e remover esse bypass.
 */
const OWNER_BYPASS_EMAIL = "gms90gu@gmail.com";

export function isOwnerBypass(email: string | null | undefined): boolean {
  return !!email && email === OWNER_BYPASS_EMAIL;
}

export function isManagerRole(role: string | null | undefined): boolean {
  return !!role && (MANAGER_ROLES as readonly string[]).includes(role);
}

/**
 * Route guard for operational/field routes that should NOT be accessible
 * to managers (supervisor/coordenador/admin_master). Redirects them to /supervision.
 *
 * Only runs in the browser — TanStack SSR/prerender has no session so we just no-op.
 */
export async function blockManagersGuard() {
  if (typeof window === "undefined") return;
  console.log('[Guard Debug] online:', navigator.onLine);

  if (!navigator.onLine) {
    await hasValidLocalSession();
    const sess = await getLocalSession();
    const cachedRole = sess ? readCachedUserRole(sess.userId) : null;
    if (isManagerRole(cachedRole)) {
      throw redirect({ to: "/supervision", replace: true });
    }
    return;
  }

  try {
    const { data: sessionData } = await Promise.race([
      supabase.auth.getSession(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
    ]);
    if (!sessionData?.session) throw redirect({ to: "/login", replace: true });

    const role = await Promise.race([
      getCachedUserRole(sessionData.session.user.id),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
    ]);
    if (isManagerRole(role)) {
      throw redirect({ to: "/supervision", replace: true });
    }
  } catch (err) {
    // Redirects thrown by TanStack Router (throw redirect({...}) above) must always
    // propagate untouched, or the intended redirect never happens.
    if (isRedirect(err)) throw err;
    if (err instanceof Error && err.message === "timeout") return;
    // Anything else (Dexie/IndexedDB hiccup, getCachedUserRole failing, a flaky
    // Supabase call, etc.) used to re-throw here, which made navigate() reject
    // silently with zero feedback for the user — this guard runs on every
    // navigation inside /rg/* (it's the parent layout's beforeLoad), so any
    // transient error here broke "Ver"/"Editar" clicks: the loading toast
    // appeared and then nothing happened, no error shown either. This guard's
    // job is just to steer managers to /supervision, not to be a hard security
    // boundary — so an inability to determine the role should not block a
    // legitimate agent's navigation. Fail open instead.
    console.warn("[blockManagersGuard] erro inesperado ao verificar cargo; liberando navegação", err);
    return;
  }
}

/**
 * Route guard for admin_master-only tooling (RG reconciliation, RBAC audit,
 * system health, data audit, etc). Mirrors the check already used in
 * /admin-master, but reusable across every /admin/* screen. Without this,
 * any authenticated user could open these routes directly by URL — the
 * underlying data was still protected server-side, but the pages themselves
 * (and their loading states) were not gated at all.
 */
export async function requireAdminMasterGuard() {
  if (typeof window === "undefined") return;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    throw redirect({ to: "/login", replace: true });
  }

  const { data: verifiedUser } = await supabase.auth.getUser();
  const user = verifiedUser?.user;
  if (!user) {
    throw redirect({ to: "/login", replace: true });
  }

  if (isOwnerBypass(user.email)) return;

  let role: string | null = null;
  try {
    role = await getCachedUserRole(user.id);
  } catch {
    throw redirect({ to: "/dashboard", replace: true });
  }

  if (role !== "admin_master") {
    throw redirect({ to: "/dashboard", replace: true });
  }
}

/**
 * Route guard for manager-level tooling (executive dashboard, pendency
 * report, georef audit) whose server functions already accept
 * supervisor/coordenador/admin_master. Blocks field agents from opening
 * pages that would otherwise just render empty/forbidden states for them.
 */
export async function requireManagerGuard() {
  if (typeof window === "undefined") return;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    throw redirect({ to: "/login", replace: true });
  }

  const { data: verifiedUser } = await supabase.auth.getUser();
  const user = verifiedUser?.user;
  if (!user) {
    throw redirect({ to: "/login", replace: true });
  }

  if (isOwnerBypass(user.email)) return;

  let role: string | null = null;
  try {
    role = await getCachedUserRole(user.id);
  } catch {
    throw redirect({ to: "/dashboard", replace: true });
  }

  if (!isManagerRole(role)) {
    throw redirect({ to: "/dashboard", replace: true });
  }
}
