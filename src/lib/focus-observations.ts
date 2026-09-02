import { supabase } from "@/integrations/supabase/client";

export interface FocusObservation {
  quarteirão: string;
  imóvel: string;
  tipoDepósito: string;
  data: string;
  tipoImóvel: string;
}

export async function fetchFocusObservations(
  agentId: string,
  startDate: string,
  endDate: string
): Promise<FocusObservation[]> {
  try {
    const { data, error } = await supabase
      .from('visits')
      .select(`
        visit_date,
        has_focus,
        visit_deposits (type_code),
        properties (block_number, address, property_type)
      `)
      .eq('agent_id', agentId)
      .eq('has_focus', true)
      .gte('visit_date', startDate)
      .lte('visit_date', endDate)
      .order('visit_date', { ascending: true });

    if (error) {
      console.error('[FOCUS_OBSERVATIONS] Erro ao buscar focos:', error);
      return [];
    }

    if (!data) return [];

    // Transformar dados em FocusObservation
    const observations: FocusObservation[] = [];
    
    data.forEach((visit: any) => {
      if (visit.visit_deposits && visit.properties) {
        visit.visit_deposits.forEach((deposit: any) => {
          observations.push({
            quarteirão: visit.properties.block_number || '-',
            imóvel: visit.properties.address || '-',
            tipoDepósito: deposit.type_code || '-',
            data: new Date(visit.visit_date).toLocaleDateString('pt-BR'),
            tipoImóvel: visit.properties.property_type || '-',
          });
        });
      }
    });

    return observations;
  } catch (err) {
    console.error('[FOCUS_OBSERVATIONS] Erro:', err);
    return [];
  }
}
