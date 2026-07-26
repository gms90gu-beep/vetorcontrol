import { supabase } from "@/integrations/supabase/client";
import { getOperationalDate } from "@/lib/operational-date";

export interface PropertyTypeComposition {
  residence: number;
  commerce: number;
  vacant_lot: number;
  strategic_point: number;
  others: number;
}

export interface PropertyCompositionResult {
  propTypes: PropertyTypeComposition;
  totalTypes: number;
  uniquePropertiesCount: number;
  totalVisitsFound: number;
}

function emptyPropTypes(): PropertyTypeComposition {
  return { residence: 0, commerce: 0, vacant_lot: 0, strategic_point: 0, others: 0 };
}

/**
 * Calcula a composição da produção imobiliária por tipo de imóvel
 * (Residencial / Comercial / Terreno Baldio / Ponto Estratégico / Outros)
 * a partir de `visits` (join em `properties.type`), para um agente e um
 * conjunto de datas operacionais (work_date de daily_work_records).
 *
 * 1 imóvel = 1 registro: quando há revisita no período, considera apenas a
 * visita mais recente (por visit_date, desempate por created_at).
 *
 * Extraído de WeeklyReportGenerator.tsx (onde essa lógica já existia para o
 * boletim semanal) para ser reaproveitado também pelo boletim diário — o
 * boletim diário nunca teve essa distribuição por não fazer essa consulta.
 */
export async function computePropertyTypeComposition(params: {
  agentAuthId: string;
  workDates: string[];
  cycleId?: string | null;
}): Promise<PropertyCompositionResult> {
  const propTypes = emptyPropTypes();
  const workDates = Array.from(new Set(params.workDates)).filter(Boolean).sort();

  if (workDates.length === 0) {
    return { propTypes, totalTypes: 0, uniquePropertiesCount: 0, totalVisitsFound: 0 };
  }

  const minDate = workDates[0];
  const maxDate = workDates[workDates.length - 1];
  // visit_date é timestamptz — filtrar por range e casar via operational_date (America/Sao_Paulo)
  const startIso = `${minDate}T00:00:00-03:00`;
  const endIso = `${maxDate}T23:59:59.999-03:00`;

  let vq = supabase
    .from("visits")
    // ATENÇÃO: não incluir `visit_type` aqui — essa coluna não existe em `visits`.
    // Um select com coluna inexistente falha por completo (PostgREST 42703),
    // devolve data=null e zera toda a composição por tipo de imóvel.
    .select("id, property_id, status, visit_date, created_at, properties(type, block_id, number, sequence, complement)")
    .eq("agent_id", params.agentAuthId)
    .gte("visit_date", startIso)
    .lte("visit_date", endIso);
  if (params.cycleId) vq = vq.eq("cycle_id", params.cycleId);

  const { data, error } = await vq;
  if (error) console.warn("[PROPERTY_COMPOSITION_VISITS_QUERY_ERROR]", error);


  const workDateSet = new Set(workDates);
  const vrows = ((data as any[]) || []).filter((r) => {
    const opDate = getOperationalDate(new Date(r.visit_date));
    return workDateSet.has(opDate);
  });

  const workedStatuses = new Set(["visited", "refused", "treated", "closed", "abandoned"]);
  const workedVisits = vrows.filter((r) => workedStatuses.has(String(r.status)));
  const totalVisitsFound = workedVisits.length;

  // Agrupar por property_id (fallback: block_id+number+sequence+complement)
  const groups = new Map<string, any[]>();
  for (const r of workedVisits) {
    const p = r.properties || {};
    const key =
      r.property_id ||
      `${p.block_id ?? ""}|${p.number ?? ""}|${p.sequence ?? ""}|${p.complement ?? ""}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  for (const [, visits] of groups) {
    visits.sort((a, b) => {
      const d = String(b.visit_date).localeCompare(String(a.visit_date));
      if (d !== 0) return d;
      return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
    });
    const chosen = visits[0];
    // Tipo vem de properties.type (fonte vigente); sem tipo → "outros"
    const rawType = chosen.properties?.type ?? null;

    const type = String(rawType || "others");
    if (type in propTypes) (propTypes as any)[type] += 1;
    else propTypes.others += 1;
  }

  const uniquePropertiesCount = groups.size;
  const totalTypes =
    propTypes.residence + propTypes.commerce + propTypes.vacant_lot +
    propTypes.strategic_point + propTypes.others;

  return { propTypes, totalTypes, uniquePropertiesCount, totalVisitsFound };
}
