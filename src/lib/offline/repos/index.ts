// Repositórios offline-first.
// Cada read passa por safeFetch: online → Supabase + hidrata Dexie; offline → Dexie.
// Cada write grava em Dexie e enfileira mutação para o SyncEngine.

import { supabase } from "@/integrations/supabase/client";
import { db, enqueueMutation, type CachedRow } from "../db";
import { safeFetch } from "../safe-fetch";

export type DexieTableName =
  | "properties"
  | "blocks"
  | "boletins_rg"
  | "visits"
  | "visit_deposits"
  | "property_pendencies"
  | "property_recovery_attempts"
  | "field_work_sessions"
  | "daily_work_records"
  | "cycles"
  | "weeks"
  | "profiles"
  | "agents";


async function hydrate(name: DexieTableName, rows: any[]) {
  if (!rows?.length) return;
  const mapped: CachedRow[] = rows
    .filter((r) => r && r.id)
    .map((r) => ({ id: r.id, data: r, updatedAt: r.updated_at }));
  try { await (db as any)[name].bulkPut(mapped); } catch (e) { console.warn(`[OFFLINE] hydrate ${name} falhou`, e); }
}

async function readCache(name: DexieTableName, filter?: (r: any) => boolean) {
  const rows = await (db as any)[name].toArray();
  const data = rows.map((r: CachedRow) => r.data);
  return filter ? data.filter(filter) : data;
}

export async function listLocal<T = any>(name: DexieTableName, filter?: (r: any) => boolean): Promise<T[]> {
  return (await readCache(name, filter)) as T[];
}

export async function getLocal<T = any>(name: DexieTableName, id: string): Promise<T | null> {
  const row = await (db as any)[name].get(id);
  return (row?.data ?? null) as T | null;
}

/** Leitura genérica com fallback Dexie. */
export async function listRemoteOrCache<T = any>(opts: {
  name: DexieTableName;
  remote: () => Promise<{ data: T[] | null; error: any }>;
  filter?: (r: any) => boolean;
}): Promise<T[]> {
  return safeFetch<T[]>(
    async () => {
      const { data, error } = await opts.remote();
      if (error) throw error;
      const rows = (data || []) as any[];
      await hydrate(opts.name, rows);
      return (opts.filter ? rows.filter(opts.filter) : rows) as T[];
    },
    async () => (await readCache(opts.name, opts.filter)) as T[],
    { label: opts.name },
  );
}

function genId() {
  return (globalThis.crypto as any)?.randomUUID?.() ?? `tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/** Insert offline-first. Persiste no Dexie e enfileira mutação. */
export async function createOffline(name: DexieTableName, row: any) {
  if (!row.id) row.id = genId();
  await (db as any)[name].put({ id: row.id, data: row, updatedAt: row.updated_at });
  await enqueueMutation({ table: name, op: "insert", payload: row });
  return row;
}

export async function updateOffline(name: DexieTableName, id: string, patch: any) {
  const existing = await (db as any)[name].get(id);
  const merged = { ...(existing?.data || {}), ...patch, id };
  await (db as any)[name].put({ id, data: merged, updatedAt: patch.updated_at });
  await enqueueMutation({ table: name, op: "update", payload: patch, pk: id });
  return merged;
}

export async function removeOffline(name: DexieTableName, id: string) {
  await (db as any)[name].delete(id);
  await enqueueMutation({ table: name, op: "delete", payload: {}, pk: id });
}

/** Upsert por chave composta (ex.: daily_work_records on agent_id,work_date). */
export async function upsertOffline(
  name: DexieTableName,
  row: any,
  opts: { onConflict: string; localKey?: (r: any) => string },
) {
  // Garante id local para acessar no Dexie
  if (!row.id) {
    // Tenta achar local existente pela chave composta
    const matches = await readCache(name, (r: any) => {
      return opts.onConflict.split(",").every((k) => String(r[k.trim()]) === String(row[k.trim()]));
    });
    if (matches[0]?.id) row.id = matches[0].id;
    else row.id = genId();
  }
  await (db as any)[name].put({ id: row.id, data: row, updatedAt: row.updated_at });
  await enqueueMutation({ table: name, op: "upsert", payload: row, on_conflict: opts.onConflict });
  return row;
}
/** Update por filtro arbitrário (offline → atualiza linhas locais que casarem; enfileira update remoto). */
export async function updateWhereOffline(
  name: DexieTableName,
  match: Record<string, any>,
  patch: any,
) {
  const all = await (db as any)[name].toArray();
  const keys = Object.keys(match);
  const toUpdate = all.filter((r: CachedRow) =>
    keys.every((k) => String(r.data?.[k]) === String(match[k])),
  );
  for (const r of toUpdate) {
    const merged = { ...r.data, ...patch };
    await (db as any)[name].put({ id: r.id, data: merged, updatedAt: patch.updated_at });
  }
  await enqueueMutation({ table: name, op: "update_where", payload: patch, match });
}


/** Delete por filtro arbitrário (offline → apaga localmente, enfileira delete remoto). */
export async function deleteWhereOffline(name: DexieTableName, match: Record<string, any>) {
  const all = await (db as any)[name].toArray();
  const keys = Object.keys(match);
  const toDelete = all.filter((r: CachedRow) =>
    keys.every((k) => String(r.data?.[k]) === String(match[k])),
  );
  for (const r of toDelete) await (db as any)[name].delete(r.id);
  await enqueueMutation({ table: name, op: "delete_where", payload: {}, match });
}

/** Enfileira chamada RPC para ser executada quando voltar a rede. */
export async function enqueueRpcOffline(rpc_name: string, payload: Record<string, any>) {
  await enqueueMutation({ table: "", op: "rpc", rpc_name, payload });
}

// Atalho de leitura genérica direta via Supabase (sem hidratar) — para telas legadas
export async function safeSupabaseRead<T>(
  fn: () => Promise<{ data: T | null; error: any }>,
  fallback: T,
  label = "supabase",
): Promise<T> {
  return safeFetch<T>(
    async () => {
      const { data, error } = await fn();
      if (error) throw error;
      return (data ?? fallback) as T;
    },
    () => fallback,
    { label },
  );
}
