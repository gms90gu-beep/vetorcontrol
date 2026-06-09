// Helpers de domínio para visitas offline-first.
// Garante que visit + visit_deposits sejam gravados localmente e enfileirados.

import {
  createOffline,
  updateOffline,
  deleteWhereOffline,
} from "./index";

export interface VisitPayload {
  id?: string;
  property_id: string;
  agent_id: string;
  cycle_id: string;
  week_id?: string | null;
  status: string;
  activity_type: string;
  visit_date: string;
  has_focus?: boolean;
  sample_collected?: boolean;
  tubitos_coletados?: number;
  treatment_applied?: boolean;
  treatment_amount?: number;
  larvicide_unit?: string | null;
  treated_deposits?: number;
  elimination_done?: boolean;
  elimination_amount?: number;
  guidance_given?: boolean;
  is_recovered?: boolean;
  notes?: string;
  year?: number;
}

export interface DepositPayload {
  visit_id: string;
  type_code: string;
  description?: string | null;
  quantity: number;
  is_positive?: boolean;
  is_treated?: boolean;
  is_eliminated?: boolean;
}

export async function saveVisitOffline(
  existingId: string | null,
  visit: VisitPayload,
  deposits: DepositPayload[],
) {
  let visitId = existingId;

  if (!visitId) {
    const created = await createOffline("visits", { ...visit, updated_at: new Date().toISOString() });
    visitId = created.id;
  } else {
    await updateOffline("visits", visitId, { ...visit, updated_at: new Date().toISOString() });
  }

  // Substitui depósitos existentes da visita
  await deleteWhereOffline("visit_deposits", { visit_id: visitId });
  for (const d of deposits) {
    await createOffline("visit_deposits", {
      ...d,
      visit_id: visitId,
      updated_at: new Date().toISOString(),
    });
  }

  return visitId as string;
}
