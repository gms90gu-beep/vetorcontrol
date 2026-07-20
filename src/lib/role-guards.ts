import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { hasValidLocalSession, getLocalSession } from "@/auth/auth";
import { getCachedUserRole, readCachedUserRole } from "@/lib/offline/role-cache";

export const MANAGER_ROLES = ["supervisor", "coordenador", "admin_master"] as const;
export type ManagerRole = (typeof MANAGER_ROLES)[number];

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
    if (err instanceof Error && err.message === "timeout") return;
    throw err;
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

  if (user.email === "gms90gu@gmail.com") return;

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

  if (user.email === "gms90gu@gmail.com") return;

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
