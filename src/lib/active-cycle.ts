import { supabase } from "@/integrations/supabase/client";

export type ActiveCycle = {
  id: string;
  number: number | null;
  year: number | null;
  name: string | null;
  source: "session" | "in_progress" | "none";
};

/**
 * Resolve o ciclo operacional do usuário.
 * Prioridade:
 *   1) cycle_id da sessão de campo ativa do usuário (in_progress)
 *   2) cycle_id da sessão mais recente do usuário (qualquer status)
 *   3) ciclo com status = 'in_progress' no banco
 *
 * Garante que tela e relatórios sigam o ciclo em que o agente está
 * realmente trabalhando, e não um ciclo "ativo" desalinhado.
 */
export async function getActiveCycleForUser(userId: string | null | undefined): Promise<ActiveCycle | null> {
  // 1 + 2 — sessão do usuário
  if (userId) {
    const { data: session } = await supabase
      .from("field_work_sessions")
      .select("cycle_id, status, created_at")
      .eq("user_id", userId)
      .not("cycle_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (session?.cycle_id) {
      const { data: cyc } = await supabase
        .from("cycles")
        .select("id, number, year, name")
        .eq("id", session.cycle_id)
        .maybeSingle();
      if (cyc) {
        const resolved: ActiveCycle = {
          id: cyc.id,
          number: (cyc as any).number ?? null,
          year: (cyc as any).year ?? null,
          name: (cyc as any).name ?? null,
          source: "session",
        };
        console.log(`[CICLO] Ciclo ativo carregado (sessão): ${resolved.name || resolved.id}`);
        return resolved;
      }
    }
  }

  // 3 — fallback: ciclo in_progress
  const { data: inProg } = await supabase
    .from("cycles")
    .select("id, number, year, name")
    .eq("status", "in_progress")
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (inProg) {
    const resolved: ActiveCycle = {
      id: inProg.id,
      number: (inProg as any).number ?? null,
      year: (inProg as any).year ?? null,
      name: (inProg as any).name ?? null,
      source: "in_progress",
    };
    console.log(`[CICLO] Ciclo ativo carregado (in_progress): ${resolved.name || resolved.id}`);
    return resolved;
  }

  console.warn("[CICLO] Nenhum ciclo ativo encontrado.");
  return null;
}
