import { supabase } from "@/integrations/supabase/client";
import { epiWeekToDateRange } from "@/lib/cycle-week";
import {
  computePropertyTypeComposition,
  type PropertyTypeComposition,
} from "@/lib/property-composition";

/**
 * FONTE ÚNICA dos dados da visão "P.C.F.A.D. — Resumo dos Trabalhos de Campo".
 * Usada tanto pela tela (PcfadWeeklyLandscape) quanto pelo PDF em paisagem —
 * tela e PDF nunca podem divergir.
 * Fonte: daily_work_records da SE + imóveis tratados (visits.treatment_applied).
 */

export const PCFAD_DASH = "—";

export type PcfadRow = {
  work_date: string;
  /** Nº de imóveis TRABALHADOS por tipo (independente de tratamento). */
  propertiesByType: PropertyTypeComposition;
  propertiesByTypeTotal: number;
  a1: number; a2: number; b: number; c: number; d1: number; d2: number; e: number;
  depTotal: number;
  samples: number;
  blocks: number;
  treated: PropertyTypeComposition;
  treatedTotal: number;
  depInspected: number;
  depTreated: number;
  depEliminated: number;
  larvicideUnit: string;
  larvicideAmount: number;
  worked: number;
  refused: number;
  closed: number;
  recovered: number;
  positive: number;
};


export type PcfadWeekData = {
  rows: PcfadRow[];
  total: PcfadRow;
  range: { start: string; end: string };
  week: number;
  year: number;
};

const EMPTY_TREATED: PropertyTypeComposition = {
  residence: 0, commerce: 0, vacant_lot: 0, strategic_point: 0, others: 0,
};

function n(v: any) {
  return Number(v) || 0;
}

export function pcfadIip(positive: number, inspected: number) {
  if (!inspected) return PCFAD_DASH;
  return `${((positive / inspected) * 100).toFixed(1).replace(".", ",")}%`;
}

function emptyTotal(): PcfadRow {
  return {
    work_date: "TOTAL",
    a1: 0, a2: 0, b: 0, c: 0, d1: 0, d2: 0, e: 0, depTotal: 0,
    samples: 0, blocks: 0, treated: { ...EMPTY_TREATED }, treatedTotal: 0,
    depInspected: 0, depTreated: 0, depEliminated: 0,
    larvicideUnit: "g", larvicideAmount: 0,
    worked: 0, refused: 0, closed: 0, recovered: 0, positive: 0,
  };
}

export function sumPcfadRows(rows: PcfadRow[]): PcfadRow {
  return rows.reduce<PcfadRow>((a, r) => ({
    ...a,
    a1: a.a1 + r.a1, a2: a.a2 + r.a2, b: a.b + r.b, c: a.c + r.c,
    d1: a.d1 + r.d1, d2: a.d2 + r.d2, e: a.e + r.e,
    depTotal: a.depTotal + r.depTotal,
    samples: a.samples + r.samples,
    blocks: a.blocks + r.blocks,
    treated: {
      residence: a.treated.residence + r.treated.residence,
      commerce: a.treated.commerce + r.treated.commerce,
      vacant_lot: a.treated.vacant_lot + r.treated.vacant_lot,
      strategic_point: a.treated.strategic_point + r.treated.strategic_point,
      others: a.treated.others + r.treated.others,
    },
    treatedTotal: a.treatedTotal + r.treatedTotal,
    depInspected: a.depInspected + r.depInspected,
    depTreated: a.depTreated + r.depTreated,
    depEliminated: a.depEliminated + r.depEliminated,
    larvicideUnit: r.larvicideUnit || a.larvicideUnit,
    larvicideAmount: a.larvicideAmount + r.larvicideAmount,
    worked: a.worked + r.worked,
    refused: a.refused + r.refused,
    closed: a.closed + r.closed,
    recovered: a.recovered + r.recovered,
    positive: a.positive + r.positive,
  }), emptyTotal());
}

export async function buildPcfadWeekData(params: {
  agentAuthId: string;
  week: number;
  year: number;
}): Promise<PcfadWeekData> {
  const { agentAuthId, week, year } = params;
  const range = epiWeekToDateRange(week, year);

  const { data, error } = await supabase
    .from("daily_work_records")
    .select("*")
    .eq("agent_id", agentAuthId)
    .gte("work_date", range.start)
    .lte("work_date", range.end)
    .order("work_date", { ascending: true });
  if (error) console.warn("[PCFAD_WEEK_QUERY_ERROR]", error);

  const dwr = ((data as any[]) || []).filter((r) => r.work_date);
  const rows: PcfadRow[] = [];

  for (const r of dwr) {
    let treated: PropertyTypeComposition = EMPTY_TREATED;
    let treatedTotal = 0;
    try {
      const comp = await computePropertyTypeComposition({
        agentAuthId,
        workDates: [r.work_date],
        cycleId: r.cycle_id ?? null,
        onlyTreated: true,
      });
      treated = comp.propTypes;
      treatedTotal = comp.uniquePropertiesCount;
    } catch (e) {
      console.warn("[PCFAD_TREATED_ERROR]", e);
    }
    const a1 = n(r.deposits_a1), a2 = n(r.deposits_a2), b = n(r.deposits_b);
    const c = n(r.deposits_c), d1 = n(r.deposits_d1), d2 = n(r.deposits_d2);
    const e = n(r.deposits_e);
    rows.push({
      work_date: r.work_date,
      a1, a2, b, c, d1, d2, e,
      depTotal: a1 + a2 + b + c + d1 + d2 + e,
      samples: n(r.samples_collected),
      blocks: n(r.blocks_worked),
      treated,
      treatedTotal,
      depInspected: n(r.deposits_inspected),
      depTreated: n(r.deposits_treated),
      depEliminated: n(r.deposits_eliminated),
      larvicideUnit: r.larvicide_unit || "g",
      larvicideAmount: n(r.larvicide_amount),
      worked: n(r.properties_worked),
      refused: n(r.properties_refused),
      closed: n(r.properties_closed),
      recovered: n(r.properties_recovered),
      positive: n(r.properties_positive),
    });
  }

  return { rows, total: sumPcfadRows(rows), range, week, year };
}
