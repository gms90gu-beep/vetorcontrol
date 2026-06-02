import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

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

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return; // _authenticated layout will redirect to /login

  const { data: role } = await supabase.rpc("get_user_role", { u_id: session.user.id });
  if (isManagerRole(role)) {
    throw redirect({ to: "/supervision", replace: true });
  }
}
