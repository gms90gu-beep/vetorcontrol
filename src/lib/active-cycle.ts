import { supabase } from "@/integrations/supabase/client";
import { getOperationalDate } from "@/lib/operational-date";
import { safeFetch } from "@/lib/offline/safe-fetch";
import { listLocal } from "@/lib/offline/repos";

type CycleRow = { id: string; number?: number | null; year?: number | null; name?: string | null; start_date?: string; end_date?: string; status?: string };

/** Todos os ciclos: remoto quando online, Dexie quando offline. */
async function loadCycles(): Promise<CycleRow[]> {
  return await safeFetch<CycleRow[]>(
    async () => {
      const { data, error } = await supabase
        .from("cycles")
        .select("id, number, year, name, start_date, end_date, status");
      if (error) throw error;
      return (data || []) as CycleRow[];
    },
    async () => (await listLocal<CycleRow>("cycles")) || [],
    { label: "cycles" },
  ) || [];
}

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
  const today = getOperationalDate();
  const cycles = await loadCycles();

  const pick = (c: CycleRow, source: ActiveCycle["source"]): ActiveCycle => ({
    id: c.id,
    number: c.number ?? null,
    year: c.year ?? null,
    name: c.name ?? null,
    source,
  });

  // 1 — Ciclo pela DATA atual (regra principal)
  const byDate = cycles
    .filter((c) => c.start_date && c.end_date && c.start_date <= today && c.end_date >= today)
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || (a.number ?? 0) - (b.number ?? 0))[0];
  if (byDate) {
    console.log(`[CICLO] Ciclo ativo carregado (por data): ${byDate.name || byDate.id}`);
    return pick(byDate, "by_date");
  }

  // 2 — Sessão do usuário (offline: lê sessões cacheadas no Dexie)
  if (userId) {
    const sessions = await safeFetch<any[]>(
      async () => {
        const { data, error } = await supabase
          .from("field_work_sessions")
          .select("cycle_id, created_at, user_id")
          .eq("user_id", userId)
          .not("cycle_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(1);
        if (error) throw error;
        return (data || []) as any[];
      },
      async () =>
        ((await listLocal<any>("field_work_sessions", (r) => r.user_id === userId && !!r.cycle_id)) || []).sort(
          (a: any, b: any) => String(b.created_at || "").localeCompare(String(a.created_at || "")),
        ),
      { label: "field_work_sessions" },
    );
    const cycleId = sessions?.[0]?.cycle_id;
    if (cycleId) {
      const cyc = cycles.find((c) => c.id === cycleId);
      if (cyc) {
        console.log(`[CICLO] Ciclo ativo carregado (sessão): ${cyc.name || cyc.id}`);
        return pick(cyc, "session");
      }
    }
  }

  // 3 — Fallback: in_progress
  const inProg = cycles
    .filter((c) => c.status === "in_progress")
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0))[0];
  if (inProg) {
    console.log(`[CICLO] Ciclo ativo carregado (in_progress fallback): ${inProg.name || inProg.id}`);
    return pick(inProg, "in_progress");
  }

  console.warn("[CICLO] Nenhum ciclo ativo encontrado.");
  return null;
}
