import { readAllQueryPages } from "@/lib/query-pages";
import { selectManagementProfiles } from "@/lib/management-metrics";
/** Database RLS remains authoritative. Server callers supply a role read from the database. */
export async function readManagementProfiles(client: any, userId: string, role: string): Promise<any[]> {
  if (!userId) return [];
  if (role === "coordenador") {
    const { data, error } = await client.rpc("get_coordinator_data", { p_user_id: userId });
    if (error) throw error; // Never substitute a wider query or cache after a scope failure.
    return selectManagementProfiles(data || [], userId, role);
  }
  if (!["admin_master", "supervisor", "agente", "agent"].includes(role)) return [];
  let query = client.from("profiles").select("*");
  if (role === "supervisor") query = query.eq("supervisor_id", userId);
  if (["agente", "agent"].includes(role)) query = query.eq("id", userId);
  return selectManagementProfiles(await readAllQueryPages(query.order("id")), userId, role);
}
