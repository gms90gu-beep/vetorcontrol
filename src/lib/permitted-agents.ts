import { supabase } from "@/integrations/supabase/client";
import { listRemoteOrCache } from "@/lib/offline/repos";
import { normalizeOperationalRole } from "@/lib/team-scope";

/** Presentation/cache scope; database policies and server checks remain authoritative. */
export async function listPermittedAgentProfiles(userId: string, role: string) {
  const normalized = normalizeOperationalRole(role);
  const allowed = (p: any) => {
    if (normalized === "agente") return p.id === userId;
    if (normalized === "supervisor") return p.supervisor_id === userId;
    return ["coordenador", "admin_master"].includes(normalized);
  };
  return listRemoteOrCache<any>({
    name: "profiles",
    remote: async () => {
      let query = supabase.from("profiles").select("id, full_name, role, supervisor_id");
      if (normalized === "supervisor") query = query.eq("supervisor_id", userId);
      else if (normalized === "agente") query = query.eq("id", userId);
      else if (!["coordenador", "admin_master"].includes(normalized)) return { data: [], error: null };
      return await query;
    },
    filter: (p) => allowed(p) && ["agent", "agente"].includes(p.role),
  });
}