import { getOperationalDate } from "@/lib/operational-date";
import { readAllQueryPages } from "@/lib/query-pages";
import { supabase } from "@/integrations/supabase/client";

export interface FocusObservation {
  agente?: string;
  quarteirao: string;
  numeroImovel: string;
  endereco: string;
  tipoDeposito: string;
  quantidade: number | null;
  dataColeta: string;
  tipoImovel: string;
}

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  residence: "Residencial",
  commerce: "Comercial",
  vacant_lot: "Terreno baldio",
  strategic_point: "Ponto estratégico",
  others: "Outro",
};

function formatCollectionDate(value: string | null | undefined): string {
  if (!value) return "—";
  const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : getOperationalDate(new Date(value));
  const date = new Date(`${dateKey}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
}

export async function fetchFocusObservations(
  agentId: string,
  startDate: string,
  endDate: string,
  client?: any,
): Promise<FocusObservation[]> {
  try {
    const query = (client ?? supabase)
      .from("visits")
      .select(
        `
        visit_date,
        has_focus,
        visit_deposits (type_code, quantity, is_positive),
        properties (number, block_number, street_name, type)
      `,
      )
      .eq("agent_id", agentId)
      .gte("visit_date", `${startDate}T00:00:00-03:00`)
      .lt("visit_date", `${endDate}T23:59:59.999-03:00`)
      .order("visit_date", { ascending: true }).order("id");
    const { data, error } = client ? { data: await readAllQueryPages<any>(query), error: null } : await query;

    if (error) {
      if (client) throw error;
      console.error("[FOCUS_OBSERVATIONS] Erro ao buscar focos:", error);
      return [];
    }

    if (!data) return [];

    const observations: FocusObservation[] = [];

    data.forEach((visit: any) => {
      const property = Array.isArray(visit.properties) ? visit.properties[0] : visit.properties;
      if (!property) return;

      const positiveDeposits = (visit.visit_deposits || []).filter(
        (deposit: any) => deposit.is_positive === true,
      );
      if (positiveDeposits.length > 0) {
        positiveDeposits.forEach((deposit: any) => {
          observations.push({
            quarteirao: property.block_number || "—",
            numeroImovel: property.number || "—",
            endereco: property.street_name || "—",
            tipoDeposito: deposit.type_code || "—",
            quantidade: deposit.quantity == null ? null : Number(deposit.quantity) || 0,
            dataColeta: formatCollectionDate(visit.visit_date),
            tipoImovel: PROPERTY_TYPE_LABELS[property.type] || property.type || "—",
          });
        });
      } else if (visit.has_focus === true) {
        // Mantém rastreabilidade para registros antigos que tinham foco geral,
        // mas não possuíam o depósito positivo detalhado.
        observations.push({
          quarteirao: property.block_number || "—",
          numeroImovel: property.number || "—",
          endereco: property.street_name || "—",
          tipoDeposito: "Não informado",
          quantidade: null,
          dataColeta: formatCollectionDate(visit.visit_date),
          tipoImovel: PROPERTY_TYPE_LABELS[property.type] || property.type || "—",
        });
      }
    });

    return observations;
  } catch (err) {
    if (client) throw err;
    console.error("[FOCUS_OBSERVATIONS] Erro:", err);
    return [];
  }
}
