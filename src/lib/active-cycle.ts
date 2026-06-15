import { supabase } from "@/integrations/supabase/client";

export type ActiveCycle = {
  id: string;
  number: number | null;
  year: number | null;
  name: string | null;
  source: "by_date" | "session" | "in_progress" | "none";
};

/**
 * Resolve o ciclo operacional CORRETO.
 *
 * Nova prioridade (correção definitiva):
 *   1) Ciclo cuja data atual esteja entre start_date e end_date  (fonte da verdade: calendário)
 *   2) cycle_id da sessão de campo mais recente do usuário       (fallback contextual)
 *   3) ciclo com status='in_progress'                            (fallback final)
 */
export async function getActiveCycleForUser(userId: string | null | undefined): Promise<ActiveCycle | null> {
  const today = new Date().toISOString().slice(0, 10);

  // 1 — Ciclo pela DATA atual (regra principal)
  const { data: byDate } = await supabase
    .from("cycles")
    .select("id, number, year, name")
    .lte("start_date", today)
    .gte("end_date", today)
    .order("year", { ascending: false })
    .order("number", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (byDate) {
    const resolved: ActiveCycle = {
      id: byDate.id,
      number: (byDate as any).number ?? null,
      year: (byDate as any).year ?? null,
      name: (byDate as any).name ?? null,
      source: "by_date",
    };
    console.log(`[CICLO] Ciclo ativo carregado (por data): ${resolved.name || resolved.id}`);
    return resolved;
  }

  // 2 — Sessão do usuário
  if (userId) {
    const { data: session } = await supabase
      .from("field_work_sessions")
      .select("cycle_id")
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
        console.log(`[CICLO] Ciclo ativo carregado (sessão): ${cyc.name || cyc.id}`);
        return {
          id: cyc.id,
          number: (cyc as any).number ?? null,
          year: (cyc as any).year ?? null,
          name: (cyc as any).name ?? null,
          source: "session",
        };
      }
    }
  }

  // 3 — Fallback: in_progress
  const { data: inProg } = await supabase
    .from("cycles")
    .select("id, number, year, name")
    .eq("status", "in_progress")
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (inProg) {
    console.log(`[CICLO] Ciclo ativo carregado (in_progress fallback): ${inProg.name || inProg.id}`);
    return {
      id: inProg.id,
      number: (inProg as any).number ?? null,
      year: (inProg as any).year ?? null,
      name: (inProg as any).name ?? null,
      source: "in_progress",
    };
  }

  console.warn("[CICLO] Nenhum ciclo ativo encontrado.");
  return null;
}
