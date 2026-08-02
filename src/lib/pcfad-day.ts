import { supabase } from "@/integrations/supabase/client";
import { normalizeDepJson, DEP_ORDER } from "@/lib/daily-integrity";
import { operationalDateBoundsUtcIso } from "@/lib/operational-date";
import {
  computePropertyTypeComposition,
  type PropertyTypeComposition,
} from "@/lib/property-composition";

/**
 * FONTE ÚNICA dos dados da visão "RESUMO DIÁRIO DO SERVIÇO ANTIVETORIAL"
 * (formulário oficial em papel — PNCD/PCFAD, versão DIÁRIA).
 * Usada tanto pela tela (PcfadDailyLandscape) quanto pelo PDF em paisagem —
 * tela e PDF nunca podem divergir.
 *
 * Fonte: daily_work_records (snapshot do encerramento) + visits do dia
 * (quarteirões trabalhados) + block_progress (quarteirões concluídos).
 */

export const PCFAD_DAY_DASH = "—";

export type PcfadDayData = {
  recordId: string;
  workDate: string;
  cycleId: string | null;
  agentAuthId: string;
  /** Nº imóveis trabalhados por tipo */
  types: PropertyTypeComposition;
  typesTotal: number;
  /** Nº imóveis */
  inspected: number;
  closed: number;
  refused: number;
  pending: number;
  /** Nº depósitos inspecionados por tipo */
  dep: { a1: number; a2: number; b: number; c: number; d1: number; d2: number; e: number };
  depTotal: number;
  /** Nº depósitos */
  depTreated: number;
  depEliminated: number;
  /** Larvicida (1) */
  larvicideType: string;
  larvicideTreatedDeposits: number;
  larvicideGrams: number;
  /** Demais coletas */
  samples: number;
  tubitos: number;
  recovered: number;
  /** Quarteirões */
  blocksWorked: string[];
  blocksCompleted: string[];
};

function n(v: any) {
  return Number(v) || 0;
}

function sortBlocks(list: Iterable<string>) {
  return Array.from(new Set(Array.from(list).filter(Boolean))).sort((a, b) => {
    const na = Number(a), nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return String(a).localeCompare(String(b), "pt-BR", { numeric: true });
  });
}

export function pcfadDayBlockLabel(list: string[]) {
  return list.length ? list.join(", ") : PCFAD_DAY_DASH;
}

export async function buildPcfadDayData(recordId: string): Promise<PcfadDayData | null> {
  const { data: rec, error } = await supabase
    .from("daily_work_records")
    .select("*")
    .eq("id", recordId)
    .maybeSingle();
  if (error) console.warn("[PCFAD_DAY_QUERY_ERROR]", error);
  if (!rec) return null;

  const r: any = rec;
  const workDate: string = r.work_date;
  const agentAuthId: string = r.agent_id;
  const cycleId: string | null = r.cycle_id ?? null;

  // Composição por tipo de imóvel (mesma consulta do boletim semanal/diário atual)
  let types: PropertyTypeComposition = {
    residence: 0, commerce: 0, vacant_lot: 0, strategic_point: 0, others: 0,
  };
  let typesTotal = 0;
  try {
    const comp = await computePropertyTypeComposition({
      agentAuthId,
      workDates: [workDate],
      cycleId,
    });
    types = comp.propTypes;
    typesTotal = comp.totalTypes;
  } catch (e) {
    console.warn("[PCFAD_DAY_COMPOSITION_ERROR]", e);
  }

  // Depósitos por tipo: colunas dedicadas, com fallback para o JSON agregado.
  const json = normalizeDepJson(r.deposits_by_type);
  const colMap: Record<string, number> = {
    a1: n(r.deposits_a1), a2: n(r.deposits_a2), b: n(r.deposits_b),
    c: n(r.deposits_c), d1: n(r.deposits_d1), d2: n(r.deposits_d2),
    e: n(r.deposits_e),
  };
  const dep = DEP_ORDER.reduce((acc, k) => {
    (acc as any)[k] = colMap[k] || json[k] || 0;
    return acc;
  }, {} as PcfadDayData["dep"]);
  const depTotal = DEP_ORDER.reduce((a, k) => a + ((dep as any)[k] || 0), 0);

  // Quarteirões trabalhados no dia (via visitas da data operacional)
  const blocksWorkedSet = new Set<string>();
  try {
    const { startIso, endIso } = operationalDateBoundsUtcIso(workDate);
    const { data: visits } = await supabase
      .from("visits")
      .select("block_id, blocks(number), properties(block_number)")
      .eq("agent_id", agentAuthId)
      .gte("visit_date", startIso)
      .lte("visit_date", endIso);
    for (const v of (visits as any[]) || []) {
      const num = v?.blocks?.number ?? v?.properties?.block_number;
      if (num != null && String(num).trim() !== "") blocksWorkedSet.add(String(num).trim());
    }
  } catch (e) {
    console.warn("[PCFAD_DAY_BLOCKS_ERROR]", e);
  }

  // Quarteirões concluídos (block_progress — mesma camada de progresso do ciclo)
  const blocksCompletedSet = new Set<string>();
  try {
    let q = supabase
      .from("block_progress")
      .select("block_number, status, last_operational_date")
      .eq("agent_id", agentAuthId)
      .eq("status", "completed");
    if (cycleId) q = q.eq("cycle_id", cycleId);
    const { data: bp } = await q;
    for (const b of (bp as any[]) || []) {
      const num = String(b.block_number ?? "").trim();
      if (!num) continue;
      // Concluídos NO DIA: quando a última data operacional do bloco é a do boletim.
      if (b.last_operational_date && b.last_operational_date !== workDate) continue;
      blocksCompletedSet.add(num);
    }
  } catch (e) {
    console.warn("[PCFAD_DAY_BLOCK_PROGRESS_ERROR]", e);
  }

  return {
    recordId,
    workDate,
    cycleId,
    agentAuthId,
    types,
    typesTotal,
    inspected: n(r.properties_worked),
    closed: n(r.properties_closed),
    refused: n(r.properties_refused),
    pending: n(r.pending_visits),
    dep,
    depTotal,
    depTreated: n(r.deposits_treated),
    depEliminated: n(r.deposits_eliminated),
    larvicideType: r.larvicide_unit ? String(r.larvicide_unit) : PCFAD_DAY_DASH,
    larvicideTreatedDeposits: n(r.deposits_treated),
    larvicideGrams: n(r.larvicide_amount),
    samples: n(r.samples_collected),
    tubitos: n(r.tubitos_collected),
    recovered: n(r.properties_recovered),
    blocksWorked: sortBlocks(blocksWorkedSet),
    blocksCompleted: sortBlocks(blocksCompletedSet),
  };
}
