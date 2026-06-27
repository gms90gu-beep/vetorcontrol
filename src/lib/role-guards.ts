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
    await getLocalSession();
    return;
  }

  try {
    const { data: sessionData } = await Promise.race([
      supabase.auth.getSession(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
    ]);
    if (!sessionData?.session) throw redirect({ to: "/login", replace: true });

    const { data: role } = await Promise.race([
      supabase.rpc("get_user_role", { u_id: sessionData.session.user.id }),
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
