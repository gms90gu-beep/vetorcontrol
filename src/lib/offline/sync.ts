// SyncEngine — drena a fila de mutações para o Supabase quando online.
import { supabase } from "@/integrations/supabase/client";
import { db, type Mutation } from "./db";

let running = false;
const MAX_RETRIES = 5;
let intervalId: ReturnType<typeof setInterval> | null = null;
let syncingFlag = false;
let lastSyncAt: number | null = null;
const listeners = new Set<() => void>();

export function onSyncChange(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function isSyncing() {
  return syncingFlag;
}

export function getLastSyncAt() {
  return lastSyncAt;
}

function notify() {
  listeners.forEach((cb) => {
    try { cb(); } catch {}
  });
}

function isDuplicateKey(e: any): boolean {
  const code = e?.code || e?.details?.code;
  if (code === "23505") return true;
  const msg = String(e?.message || "").toLowerCase();
  return msg.includes("duplicate key") || msg.includes("already exists");
}

function isInvalidUuid(e: any): boolean {
  const msg = String(e?.message || "").toLowerCase();
  return msg.includes("invalid input syntax for type uuid");
}

// Tabelas que NÃO possuem coluna updated_at no servidor.
// Enviar esse campo causa: "Could not find the 'updated_at' column ... in the schema cache".
const TABLES_WITHOUT_UPDATED_AT = new Set([
  "visits",
  "visit_deposits",
  "properties",
  "blocks",
  "property_recovery_attempts",
  "weeks",
]);

function stripUpdatedAt(table: string, payload: any): any {
  if (!payload || typeof payload !== "object") return payload;
  if (!TABLES_WITHOUT_UPDATED_AT.has(table)) return payload;
  if (Array.isArray(payload)) return payload.map((p) => { const { updated_at, ...rest } = p || {}; return rest; });
  const { updated_at, ...rest } = payload;
  return rest;
}

async function applyMutation(m: Mutation): Promise<void> {
  const table = m.table as any;
  const payload = stripUpdatedAt(m.table, m.payload);
  if (m.op === "rpc") {
    if (!m.rpc_name) throw new Error("rpc sem rpc_name");
    const { error } = await supabase.rpc(m.rpc_name as any, m.payload as any);
    if (error) throw error;
    return;
  }
  if (m.op === "insert") {
    const { error } = await supabase.from(table).insert(payload);
    if (error) {
      if (isDuplicateKey(error)) {
        console.warn(`[SYNC] insert ${table} já existia no servidor — tratando como sucesso.`);
        return;
      }
      throw error;
    }
    return;
  }
  if (m.op === "upsert") {
    const opts = m.on_conflict ? { onConflict: m.on_conflict } : undefined;
    const { error } = await supabase.from(table).upsert(payload, opts as any);
    if (error) throw error;
    return;
  }
  if (m.op === "update") {
    if (!m.pk) throw new Error("update sem pk");
    const { error } = await supabase.from(table).update(payload).eq("id", m.pk);
    if (error) throw error;
    return;
  }
  if (m.op === "delete") {
    if (!m.pk) throw new Error("delete sem pk");
    const { error } = await supabase.from(table).delete().eq("id", m.pk);
    if (error) throw error;
    return;
  }
  if (m.op === "delete_where") {
    const match = m.match || {};
    if (!Object.keys(match).length) throw new Error("delete_where sem match");
    const { error } = await supabase.from(table).delete().match(match);
    if (error) throw error;
    return;
  }
  if (m.op === "update_where") {
    const match = m.match || {};
    if (!Object.keys(match).length) throw new Error("update_where sem match");
    const { error } = await supabase.from(table).update(payload).match(match);
    if (error) throw error;
    return;
  }
  throw new Error(`op desconhecida: ${m.op}`);
}

/**
 * Migra mutações antigas que possuem IDs inválidos (prefixo "tmp_" de uma versão
 * anterior do gerador). Sem isso, ficam presas para sempre com
 * "invalid input syntax for type uuid".
 */
async function purgeInvalidTmpMutations(): Promise<number> {
  const all = await db.mutations.toArray();
  let removed = 0;
  const hasTmp = (v: any): boolean => {
    if (typeof v === "string") return v.startsWith("tmp_");
    if (v && typeof v === "object") return Object.values(v).some(hasTmp);
    return false;
  };
  for (const m of all) {
    if (
      (typeof m.pk === "string" && m.pk.startsWith("tmp_")) ||
      hasTmp(m.payload) ||
      hasTmp(m.match)
    ) {
      await db.mutations.delete(m.id!);
      removed++;
    }
  }
  if (removed > 0) console.warn(`[SYNC] Removidas ${removed} mutações antigas com IDs inválidos (tmp_).`);
  return removed;
}

export async function flushMutations(): Promise<{ ok: number; failed: number }> {
  if (running) return { ok: 0, failed: 0 };
  if (typeof navigator !== "undefined" && !navigator.onLine) return { ok: 0, failed: 0 };
  running = true;
  syncingFlag = true;
  console.log("[SYNC_ENGINE_START]", { ts: Date.now() });
  notify();
  let ok = 0;
  let failed = 0;
  try {
    // Limpa IDs inválidos legados (tmp_...) antes de tentar sincronizar.
    await purgeInvalidTmpMutations();

    // Reseta itens travados em "syncing" (crash/refresh) — esses NÃO consumiram
    // tentativa. Itens em "error" só voltam a "pending" se ainda tiverem retries
    // disponíveis (caso contrário ficam parados, com lastError visível no modal,
    // até o operador resolver a causa raiz — evita loop infinito de retentativa).
    await db.mutations
      .where("status").equals("syncing")
      .modify({ status: "pending" });
    await db.mutations
      .where("status").equals("error")
      .and((m) => (m.tries || 0) < MAX_RETRIES)
      .modify({ status: "pending" });

    // FIFO — apenas pending agora
    const pending = await db.mutations
      .where("status").equals("pending")
      .sortBy("createdAt");

    if (pending.length > 0) console.log(`[SYNC] Pendências locais: ${pending.length}`);

    for (const m of pending) {
      if (typeof navigator !== "undefined" && !navigator.onLine) break;
      try {
        await db.mutations.update(m.id!, { status: "syncing" });
        await applyMutation(m);
        await db.mutations.delete(m.id!); // só remove após confirmação do Supabase
        ok++;
      } catch (e: any) {
        failed++;
        await db.mutations.update(m.id!, {
          status: "error",
          tries: (m.tries || 0) + 1,
          lastError: e?.message || String(e),
        });
        console.warn(`[SYNC] Falha em ${m.op} ${m.table}:`, e?.message || e);
      }
      notify();
    }
  } finally {
    running = false;
    syncingFlag = false;
    lastSyncAt = Date.now();
    notify();
  }
  if (ok > 0 || failed > 0) console.log(`[SYNC] Sincronização concluída — ${ok} ok, ${failed} falhou`);
  return { ok, failed };
}

export async function pendingMutationCount(): Promise<number> {
  return db.mutations.count();
}

export async function pendingByTable(): Promise<Record<string, number>> {
  const all = await db.mutations.toArray();
  const out: Record<string, number> = {};
  for (const m of all) {
    const key = m.op === "rpc" ? `rpc:${m.rpc_name}` : m.table;
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

export interface FailedMutationInfo {
  id: number;
  table: string;
  op: string;
  tries: number;
  lastError?: string;
  createdAt: number;
}

export async function listFailedMutations(): Promise<FailedMutationInfo[]> {
  const all = await db.mutations.where("status").equals("error").toArray();
  return all
    .filter((m) => (m.tries || 0) >= MAX_RETRIES)
    .map((m) => ({
      id: m.id!,
      table: m.op === "rpc" ? `rpc:${m.rpc_name}` : m.table,
      op: m.op,
      tries: m.tries || 0,
      lastError: m.lastError,
      createdAt: m.createdAt,
    }));
}

/** Reseta contador de tentativas para reenviar mutações que esgotaram retries. */
export async function retryFailedMutations(): Promise<number> {
  const n = await db.mutations
    .where("status").equals("error")
    .modify({ status: "pending", tries: 0, lastError: undefined });
  notify();
  void flushMutations();
  return n;
}

/** Remove definitivamente mutações que não querem ser sincronizadas. */
export async function discardFailedMutation(id: number): Promise<void> {
  await db.mutations.delete(id);
  notify();
}


let booted = false;
export function bootSyncEngine() {
  if (booted || typeof window === "undefined") return;
  booted = true;

  const tryFlush = () => { void flushMutations(); };

  window.addEventListener("online", tryFlush);
  window.addEventListener("focus", tryFlush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") tryFlush();
  });
  // Boot inicial
  setTimeout(tryFlush, 1500);
  // Polling defensivo
  intervalId = setInterval(tryFlush, 15_000);
}

export function stopSyncEngine() {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
  booted = false;
}
