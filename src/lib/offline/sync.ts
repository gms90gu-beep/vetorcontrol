// SyncEngine — drena a fila de mutações para o Supabase quando online.
import { supabase } from "@/integrations/supabase/client";
import { db, type Mutation } from "./db";

let running = false;
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

async function applyMutation(m: Mutation): Promise<void> {
  const table = m.table as any;
  if (m.op === "rpc") {
    if (!m.rpc_name) throw new Error("rpc sem rpc_name");
    const { error } = await supabase.rpc(m.rpc_name as any, m.payload as any);
    if (error) throw error;
    return;
  }
  if (m.op === "insert") {
    const { error } = await supabase.from(table).insert(m.payload);
    if (error) {
      // Linha já existe no servidor (re-tentativa). Considera sucesso para
      // não travar a fila eternamente.
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
    const { error } = await supabase.from(table).upsert(m.payload, opts as any);
    if (error) throw error;
    return;
  }
  if (m.op === "update") {
    if (!m.pk) throw new Error("update sem pk");
    const { error } = await supabase.from(table).update(m.payload).eq("id", m.pk);
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
    const { error } = await supabase.from(table).update(m.payload).match(match);
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
  for (const m of all) {
    const idVal = m.pk || m.payload?.id || m.payload?.visit_id;
    if (typeof idVal === "string" && idVal.startsWith("tmp_")) {
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
  notify();
  let ok = 0;
  let failed = 0;
  try {
    // Limpa IDs inválidos legados (tmp_...) antes de tentar sincronizar.
    await purgeInvalidTmpMutations();

    // FIFO
    const pending = await db.mutations
      .where("status")
      .anyOf("pending", "error")
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

let booted = false;
export function bootSyncEngine() {
  if (booted || typeof window === "undefined") return;
  booted = true;

  const tryFlush = () => { void flushMutations(); };

  window.addEventListener("online", tryFlush);
  // Boot inicial
  setTimeout(tryFlush, 1500);
  // Polling defensivo
  intervalId = setInterval(tryFlush, 30_000);
}

export function stopSyncEngine() {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
  booted = false;
}
