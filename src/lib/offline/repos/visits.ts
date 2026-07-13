// Helpers de domínio para visitas offline-first.
// Garante que visit + visit_deposits sejam gravados localmente e enfileirados.
// Também atualiza a camada única BLOCK_PROGRESS após cada visita.

import {
  createOffline,
  updateOffline,
  deleteWhereOffline,
} from "./index";
import {
  applyLocalVisitDelta,
  enqueueRecomputeBlockProgress,
} from "./blockProgress";
import { db } from "../db";

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
  console.log("[SAVE_VISIT_ENTER]", { existingId, visit, depositsCount: deposits.length });
  try {
    let visitId = existingId;

    if (!visitId) {
      const payload = { ...visit, updated_at: new Date().toISOString() };
      console.log("[SAVE_VISIT_CREATE_OFFLINE]", { table: "visits", op: "insert", payload });
      const created = await createOffline("visits", payload);
      console.log("[SAVE_VISIT_DEXIE_OK]", { id: created.id, table: "visits", updatedAt: payload.updated_at });
      console.log("[SAVE_VISIT_QUEUE_OK]", { id: created.id, table: "visits", op: "insert" });
      visitId = created.id;
    } else {
      const payload = { ...visit, updated_at: new Date().toISOString() };
      console.log("[SAVE_VISIT_CREATE_OFFLINE]", { table: "visits", op: "update", id: visitId, payload });
      await updateOffline("visits", visitId, payload);
      console.log("[SAVE_VISIT_DEXIE_OK]", { id: visitId, table: "visits", updatedAt: payload.updated_at });
      console.log("[SAVE_VISIT_QUEUE_OK]", { id: visitId, table: "visits", op: "update" });
    }

    // Substitui depósitos existentes da visita
    await deleteWhereOffline("visit_deposits", { visit_id: visitId });
    for (const d of deposits) {
      const dp = { ...d, visit_id: visitId, updated_at: new Date().toISOString() };
      console.log("[SAVE_VISIT_CREATE_OFFLINE]", { table: "visit_deposits", op: "insert", payload: dp });
      const c = await createOffline("visit_deposits", dp);
      console.log("[SAVE_VISIT_DEXIE_OK]", { id: c.id, table: "visit_deposits", updatedAt: dp.updated_at });
      console.log("[SAVE_VISIT_QUEUE_OK]", { id: c.id, table: "visit_deposits", op: "insert" });
    }

    console.log("[SAVE_VISIT_FINISH]", { visitId, depositsSaved: deposits.length });
    return visitId as string;
  } catch (error: any) {
    console.error("[SAVE_VISIT_ERROR]", { message: error?.message, stack: error?.stack, payload: { existingId, visit, deposits } });
    throw error;
  }
}
