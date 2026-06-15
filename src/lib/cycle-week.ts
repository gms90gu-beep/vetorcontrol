import { supabase } from "@/integrations/supabase/client";

export type CycleWeekInfo = {
  cycle: { id: string; number: number | null; year: number | null; name: string | null } | null;
  cycleWeek: { id: string; number: number; start_date: string; end_date: string } | null;
  se: { week: number; year: number };
};

/**
 * Semana Epidemiológica (padrão brasileiro / SINAN).
 * Semana começa no domingo e termina no sábado.
 * SE 1 = semana que contém o sábado mais próximo de 1º de janeiro.
 */
export function getEpiWeek(d: Date = new Date()): { week: number; year: number } {
  const firstSundayOfEpiYear = (y: number): Date => {
    const jan1 = new Date(y, 0, 1);
    const dow = jan1.getDay(); // 0=dom..6=sab
    const diffToSat = ((6 - dow) + 7) % 7;
    const sat = new Date(y, 0, 1 + diffToSat);
    if (diffToSat >= 4) sat.setDate(sat.getDate() - 7); // sábado mais próximo
    const sun = new Date(sat);
    sun.setDate(sun.getDate() - 6);
    return sun;
  };
  const ref = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  let year = ref.getFullYear();
  let firstSun = firstSundayOfEpiYear(year);
  if (ref < firstSun) {
    year -= 1;
    firstSun = firstSundayOfEpiYear(year);
  } else {
    const nextSun = firstSundayOfEpiYear(year + 1);
    if (ref >= nextSun) {
      year += 1;
      firstSun = nextSun;
    }
  }
  const week = Math.floor((ref.getTime() - firstSun.getTime()) / 86400000 / 7) + 1;
  return { week, year };
}

/**
 * Resolve a semana DO CICLO consultando a tabela `weeks` por intervalo de datas.
 * Não confundir com SE (epidemiológica) nem com o número do ciclo.
 */
export async function resolveCycleWeek(
  cycleId: string | null | undefined,
  date: Date = new Date(),
): Promise<{ id: string; number: number; start_date: string; end_date: string } | null> {
  if (!cycleId) return null;
  const iso = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    .toISOString()
    .split("T")[0];

  // 1) tenta achar semana que contém a data
  const { data: exact } = await supabase
    .from("weeks")
    .select("id, number, start_date, end_date")
    .eq("cycle_id", cycleId)
    .lte("start_date", iso)
    .gte("end_date", iso)
    .order("number", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (exact) return exact as any;

  // 2) fallback: última semana já iniciada (start_date <= hoje)
  const { data: prev } = await supabase
    .from("weeks")
    .select("id, number, start_date, end_date")
    .eq("cycle_id", cycleId)
    .lte("start_date", iso)
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (prev) return prev as any;

  // 3) fallback final: primeira semana do ciclo
  const { data: first } = await supabase
    .from("weeks")
    .select("id, number, start_date, end_date")
    .eq("cycle_id", cycleId)
    .order("number", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (first as any) ?? null;
}

/**
 * Formato canônico: "Ciclo 3 • Semana 6 • SE 24/2026".
 * - Ciclo: cycle.number
 * - Semana: número da semana DO CICLO (tabela `weeks`)
 * - SE: semana epidemiológica derivada da data
 */
export function formatCycleWeekLabel(info: CycleWeekInfo): string {
  const cyc = info.cycle?.number != null ? `Ciclo ${info.cycle.number}` : "Ciclo —";
  const cw = info.cycleWeek?.number != null ? `Semana ${info.cycleWeek.number}` : "Semana —";
  const se = `SE ${String(info.se.week).padStart(2, "0")}/${info.se.year}`;
  return `${cyc} • ${cw} • ${se}`;
}

export function logCycleWeekAudit(info: CycleWeekInfo) {
  console.log("[CICLO]", {
    cycle_id: info.cycle?.id ?? null,
    cycle_number: info.cycle?.number ?? null,
  });
  console.log("[SEMANA_CICLO]", {
    week_id: info.cycleWeek?.id ?? null,
    week_number: info.cycleWeek?.number ?? null,
  });
  console.log("[SE]", {
    epi_week: info.se.week,
    epi_year: info.se.year,
  });
}
