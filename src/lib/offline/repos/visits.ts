// Helpers de domínio para visitas offline-first.
// Garante que visit + visit_deposits sejam gravados localmente e enfileirados.
// Também atualiza a camada única BLOCK_PROGRESS após cada visita.

import {
  createOffline,
  updateOffline,
  removeOffline,
  upsertOffline,
  listLocal,
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

    // Sincroniza depósitos da visita (BUG CORRIGIDO — ver auditoria):
    // antes isso era "apaga todos + insere todos de novo" em duas operações
    // SEPARADAS na fila offline. Se a sincronização processava essas duas
    // mutações fora de ordem (ou o delete se perdia numa falha de rede
    // pontual), a exclusão nunca acontecia mas a inserção sim — sobrava o
    // depósito antigo (ex.: "não positivo") ao lado do novo ("positivo"),
    // duplicando type_code para a mesma visita. Isso já aconteceu de verdade
    // em produção (21 visitas, 31 linhas duplicadas encontradas e limpas).
    //
    // Agora: só remove os depósitos cujo type_code deixou de existir na
    // seleção atual (delta, não "apaga tudo"), e faz UPSERT por
    // (visit_id, type_code) — idempotente mesmo se a mutação for reprocessada
    // ou reordenada pela fila de sincronização. Requer a constraint unique
    // visit_deposits_visit_type_unique (visit_id, type_code) no banco.
    const currentDeposits = await listLocal<any>("visit_deposits", (r) => r.visit_id === visitId);
    const newTypeCodes = new Set(deposits.map((d) => d.type_code));
    const obsolete = currentDeposits.filter((r: any) => !newTypeCodes.has(r.type_code));
    for (const r of obsolete) {
      console.log("[SAVE_VISIT_DEPOSIT_REMOVE]", { visitId, type_code: r.type_code, id: r.id });
      await removeOffline("visit_deposits", r.id);
    }
    for (const d of deposits) {
      const dp = { ...d, visit_id: visitId, updated_at: new Date().toISOString() };
      console.log("[SAVE_VISIT_CREATE_OFFLINE]", { table: "visit_deposits", op: "upsert", payload: dp });
      const c = await upsertOffline("visit_deposits", dp, { onConflict: "visit_id,type_code" });
      console.log("[SAVE_VISIT_DEXIE_OK]", { id: c.id, table: "visit_deposits", updatedAt: dp.updated_at });
      console.log("[SAVE_VISIT_QUEUE_OK]", { id: c.id, table: "visit_deposits", op: "upsert" });
    }

    // BLOCK_PROGRESS — camada única (independente da Produção Diária).
    try {
      const propRow = await db.properties.get(visit.property_id);
      const block_number = (propRow?.data as any)?.block_number as string | undefined;
      if (block_number && visit.cycle_id && visit.agent_id) {
        await applyLocalVisitDelta({
          cycle_id: visit.cycle_id,
          block_number: String(block_number),
          agent_id: visit.agent_id,
          status: visit.status,
          property_id: visit.property_id,
          is_recovery: visit.is_recovered,
          visit_date: visit.visit_date,
        });
        await enqueueRecomputeBlockProgress({
          cycle_id: visit.cycle_id,
          block_number: String(block_number),
          agent_id: visit.agent_id,
        });
      }
    } catch (e) {
      console.warn("[BLOCK_PROGRESS_UPDATE_FAIL]", e);
    }

    console.log("[SAVE_VISIT_FINISH]", { visitId, depositsSaved: deposits.length });
    return visitId as string;
  } catch (error: any) {
    console.error("[SAVE_VISIT_ERROR]", { message: error?.message, stack: error?.stack, payload: { existingId, visit, deposits } });
    throw error;
  }
}
