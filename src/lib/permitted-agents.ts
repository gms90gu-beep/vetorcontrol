import { supabase } from "@/integrations/supabase/client";
import { listRemoteOrCache } from "@/lib/offline/repos";
import { normalizeOperationalRole } from "@/lib/team-scope";
import { readManagementProfiles } from "@/lib/management-profiles";

/** Presentation scope. Coordinator errors fail closed; database RLS remains authoritative. */
export async function listPermittedAgentProfiles(userId: string, role: string) {
  const normalized = normalizeOperationalRole(role);
  if (normalized === "coordenador") {
    return (await readManagementProfiles(supabase, userId, normalized)).filter((p) => ["agent", "agente"].includes(p.role));
  }
  const allowed = (p: any) => normalized === "agente" ? p.id === userId
    : normalized === "supervisor" ? p.supervisor_id === userId : normalized === "admin_master";
  return listRemoteOrCache<any>({ name: "profiles",
    remote: async () => ({ data: await readManagementProfiles(supabase, userId, normalized), error: null }),
    filter: (p) => allowed(p) && ["agent", "agente"].includes(p.role),
  });
}
