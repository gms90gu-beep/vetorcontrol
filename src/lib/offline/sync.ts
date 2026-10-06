// SyncEngine — drena a fila de mutações para o Supabase quando online.
import { supabase } from "@/integrations/supabase/client";
import { db, type Mutation } from "./db";
import { isJourneyPermissionError, journeyPermissionMessage } from "@/lib/journey-permission-error";

let running = false;
let activeFlush: Promise<{ ok: number; failed: number }> | null = null;
const MAX_RETRIES = 5;
// Backoff exponencial por mutação — evita que uma falha transitória (rede
// instável em campo) esgote as 5 tentativas em menos de um minuto só porque
// o app troca de foco/visibilidade com frequência (cada troca dispara um
// flush). Índice = tries-1 (capado no último valor).
const RETRY_DELAYS = [2_000, 5_000, 15_000, 30_000, 60_000];
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
  // "weeks" TEM updated_at no servidor (ao contrário das demais desta lista) —
  // não incluir aqui, senão updateOffline/createOffline nessa tabela descartam
  // o campo silenciosamente antes de enviar ao Supabase.
]);

function stripUpdatedAt(table: string, payload: any): any {
  if (!payload || typeof payload !== "object") return payload;
  if (!TABLES_WITHOUT_UPDATED_AT.has(table)) return payload;
  if (Array.isArray(payload)) return payload.map((p) => { const { updated_at, ...rest } = p || {}; return rest; });
  const { updated_at, ...rest } = payload;
  return rest;
}

/**
 * As mutações offline podem sobreviver a um refresh mesmo quando a mutação
 * que criava o registro-pai já saiu da fila. Antes disso, uma visita era
 * reenviada diretamente e ficava presa para sempre na FK
 * visits_field_work_session_id_fkey.
 *
 * Recuperamos apenas dependências que ainda existem no cache local. A inserção
 * é idempotente (23505 é sucesso), portanto a rotina também é segura quando
 * outra aba já sincronizou o pai entre a consulta e a inserção.
 */
async function remoteRowExists(table: "field_work_sessions" | "visits", id: string): Promise<boolean> {
  const { data, error } = await supabase.from(table).select("id").eq("id", id).maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

async function restoreCachedRow(table: "field_work_sessions" | "visits", id: string): Promise<void> {
  if (await remoteRowExists(table, id)) return;

  const cached = await (db as any)[table].get(id);
  const row = cached?.data;
  if (!row) {
    throw new Error(
      `[SYNC_DEPENDENCY] ${table} ${id} não existe no servidor nem no cache local; ` +
      "a jornada precisa ser reaberta para vincular as visitas.",
    );
  }

  if (table === "visits" && row.field_work_session_id) {
    await restoreCachedRow("field_work_sessions", String(row.field_work_session_id));
  }

  const { error } = await supabase.from(table as any).insert(stripUpdatedAt(table, row));
  if (error && !isDuplicateKey(error)) throw error;
}

async function ensureMutationDependencies(m: Mutation): Promise<void> {
  if (m.op !== "insert" && m.op !== "upsert" && m.op !== "update") return;
  const payload = m.payload as any;
  if (m.table === "visits" && payload?.field_work_session_id) {
    await restoreCachedRow("field_work_sessions", String(payload.field_work_session_id));
  }
  if (m.table === "visit_deposits" && payload?.visit_id) {
    await restoreCachedRow("visits", String(payload.visit_id));
  }
  if (m.table === "property_recovery_attempts" && payload?.visit_id) {
    await restoreCachedRow("visits", String(payload.visit_id));
  }
}

async function applyMutation(m: Mutation): Promise<void> {
  const table = m.table as any;
  const payload = stripUpdatedAt(m.table, m.payload);
  await ensureMutationDependencies(m);
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

async function runFlushMutations(options?: { retryErroredImmediately?: boolean }): Promise<{ ok: number; failed: number }> {
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
    const now = Date.now();
    await db.mutations
      .where("status").equals("error")
      .and((m) =>
        (m.tries || 0) < MAX_RETRIES &&
        (options?.retryErroredImmediately || !m.nextRetryAt || m.nextRetryAt <= now),
      )
      .modify({ status: "pending", ...(options?.retryErroredImmediately ? { nextRetryAt: undefined } : {}) });

    // FIFO — apenas pending agora
    const pending = await db.mutations
      .where("status").equals("pending")
      .sortBy("createdAt");

    if (pending.length > 0) console.log(`[SYNC] Pendências locais: ${pending.length}`);

    for (const m of pending) {
      if (typeof navigator !== "undefined" && !navigator.onLine) break;

      // Claim atômico: outra aba pode ter lido a mesma lista de "pending" e já
      // começado a processar esta mutação. A transação Dexie/IndexedDB serializa
      // leitura+escrita entre abas na mesma origem, então só uma aba consegue
      // marcar "syncing" com sucesso — a outra vê status !== "pending" e pula.
      const claimed = await db.transaction("rw", db.mutations, async () => {
        const fresh = await db.mutations.get(m.id!);
        if (!fresh || fresh.status !== "pending") return false;
        await db.mutations.update(m.id!, { status: "syncing" });
        return true;
      });
      if (!claimed) continue;

      try {
        await applyMutation(m);
        await db.mutations.delete(m.id!); // só remove após confirmação do Supabase
        ok++;
      } catch (e: any) {
        failed++;
        const tries = (m.tries || 0) + 1;
        // Bloqueio por vínculo de equipe/área (RLS) vira mensagem explicativa,
        // em vez do texto cru do banco.
        const isJourneyTable =
          m.table === "field_work_sessions" || m.table === "daily_work_records";
        const lastError = isJourneyTable && isJourneyPermissionError(e)
          ? journeyPermissionMessage()
          : e?.message || String(e);
        await db.mutations.update(m.id!, {
          status: "error",
          tries,
          lastError,
          nextRetryAt: Date.now() + RETRY_DELAYS[Math.min(tries - 1, RETRY_DELAYS.length - 1)],
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
  if (failed > 0) {
    console.warn("[SYNC_ENGINE_ERROR]", { ok, failed, lastSyncAt });
  } else {
    console.log("[SYNC_ENGINE_SUCCESS]", { ok, lastSyncAt });
    console.log("[SYNC_SUCCESS]", { ok, lastSyncAt });
    // Gatilho 1: limpeza automática pós-sync (com todas as guardas internas)
    try {
      const { cleanupAfterSync } = await import("./cache-cleanup");
      void cleanupAfterSync();
    } catch (e) {
      console.warn("[CACHE_CLEANUP] falha ao agendar pós-sync", e);
    }
  }
  return { ok, failed };
}

export function flushMutations(options?: { retryErroredImmediately?: boolean }): Promise<{ ok: number; failed: number }> {
  // A close can start while the background poll is already flushing. Returning
  // `{0,0}` here made the close read the server too early and clear the local
  // journey before its DWR mutation had actually been attempted. Wait for the
  // active pass, then run one more pass so mutations queued during it are sent.
  if (activeFlush) {
    return activeFlush.then(() => flushMutations(options));
  }
  const flush = runFlushMutations(options);
  const wrapped = flush.finally(() => {
    if (activeFlush === wrapped) activeFlush = null;
  });
  activeFlush = wrapped;
  return wrapped;
}

export async function pendingMutationCount(): Promise<number> {
  return db.mutations.count();
}

/**
 * 🔧 FORCE RETRY: Tenta enviar mutações com erro novamente
 * Usado quando: agente precisa fechar expediente e há erros de sync
 */
export async function forceRetryFailedMutations(): Promise<{ retried: number; synced: number }> {
  console.log("[FORCE_RETRY_START] Reenviando mutações com erro...");
  
  const failed = await db.mutations
    .where("status").equals("error")
    .toArray();

  console.log(`[FORCE_RETRY] Encontradas ${failed.length} mutações com erro`);

  // Reseta TODAS para pending (independente de tries)
  for (const m of failed) {
    await db.mutations.update(m.id!, {
      status: "pending",
      tries: 0, // Reseta contador
      lastError: undefined,
      nextRetryAt: undefined,
    });
  }

  // Tenta sync
  const result = await flushMutations();
  
  console.log(`[FORCE_RETRY_DONE] ${result.ok} ok, ${result.failed} ainda falhando`);
  return { retried: failed.length, synced: result.ok };
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
    .modify({ status: "pending", tries: 0, lastError: undefined, nextRetryAt: undefined });
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

/**
 * Um reload recria o módulo JS, mas a fila Dexie permanece. Mutação que ficou
 * em "syncing" durante o reload ou em "error" aguardando backoff precisa ser
 * rearmada para que o próximo boot tente novamente imediatamente.
 */
async function prepareMutationsAfterReload() {
  await db.mutations
    .where("status")
    .equals("syncing")
    .modify({ status: "pending" });
  await db.mutations
    .where("status")
    .equals("error")
    .and((m) => (m.tries || 0) < MAX_RETRIES)
    .modify({ status: "pending", nextRetryAt: undefined });
  console.log("[SYNC_RELOAD_RECOVERY]", { pending: await db.mutations.count() });
}
export function bootSyncEngine() {
  if (booted || typeof window === "undefined") return;
  booted = true;

  const tryFlush = () => { void flushMutations(); };
  const flushAfterReload = async () => {
    try {
      await prepareMutationsAfterReload();
      await flushMutations({ retryErroredImmediately: true });
    } catch (e) {
      console.warn("[SYNC_RELOAD_RECOVERY_FAIL]", e);
    }
  };

  window.addEventListener("online", tryFlush);
  window.addEventListener("focus", tryFlush);
  window.addEventListener("pageshow", tryFlush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") tryFlush();
  });
  // Última chance antes de o app ir para background/fechar (mobile mata a aba
  // sem disparar "beforeunload" de forma confiável — "pagehide" cobre os dois).
  window.addEventListener("pagehide", tryFlush);

  // Boot inicial: reabre mutações interrompidas por refresh e envia
  // imediatamente quando a rede já estiver disponível.
  void flushAfterReload();
  setTimeout(tryFlush, 1500);
  // Gatilho 3: limpeza no boot (24h + guardas)
  setTimeout(() => {
    import("./cache-cleanup").then(({ cleanupOnBoot }) => void cleanupOnBoot()).catch(() => {});
  }, 8000);
  // Polling defensivo
  intervalId = setInterval(tryFlush, 15_000);
}

export function stopSyncEngine() {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
  booted = false;
}
