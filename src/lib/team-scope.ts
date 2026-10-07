/** Shared projection only. Server callers must pass a role read from the database. */
export function normalizeOperationalRole(role: string | null | undefined): string {
  return role === "agent" ? "agente" : role ?? "";
}

export function selectPermittedAgentIds(role: string, userId: string, teamIds: string[], requested?: string | null): string[] | null {
  const normalized = normalizeOperationalRole(role);
  const scope = normalized === "agente" ? [userId]
    : normalized === "supervisor" ? teamIds
    : ["coordenador", "admin_master"].includes(normalized) ? null : [];
  if (!requested) return scope;
  if (scope !== null && !scope.includes(requested)) throw new Error("Agente não vinculado à sua equipe ou fora do seu acesso.");
  return [requested];
}

export async function resolvePermittedAgentIds(client: any, userId: string, role: string, requested?: string | null): Promise<string[] | null> {
  let teamIds: string[] = [];
  if (normalizeOperationalRole(role) === "supervisor") {
    const { data, error } = await client.from("profiles").select("id").eq("supervisor_id", userId);
    if (error) throw error;
    teamIds = (data ?? []).map((row: { id: string }) => row.id);
  }
  return selectPermittedAgentIds(role, userId, teamIds, requested);
}