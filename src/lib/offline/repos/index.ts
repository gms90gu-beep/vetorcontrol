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
  | "agents"
  | "block_progress";


async function hydrate(name: DexieTableName, rows: any[]) {
  if (!rows?.length) return 0;
  const mapped: CachedRow[] = rows
    .filter((r) => r && r.id)
    .map((r) => ({ id: r.id, data: r, updatedAt: r.updated_at }));
  if (name === "boletins_rg") {
    mapped.forEach((row) => console.log("[RG_DEXIE_SAVE]", row.data));
  }
  try {
    await (db as any)[name].bulkPut(mapped);
    return mapped.length;
  } catch (e) {
    console.warn(`[OFFLINE] hydrate ${name} falhou`, e);
    return 0;
  }
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

export type DataSource = "remote" | "cache" | "empty";
export type ListResult<T> = T[] & { data: T[]; source: DataSource };

/**
 * Embala um array com metadados {data, source} mantendo 100% de compatibilidade
 * com chamadores legados (Array.prototype: map/filter/length/destructuring).
 * Não usamos subclasse de Array porque algumas iterações do Vite/SWC podem
 * perder o protótipo após transformações; anexar props no Array nativo é
 * sempre seguro.
 */
function withSource<T>(arr: T[], source: DataSource): ListResult<T> {
  const out = arr.slice() as ListResult<T>;
  Object.defineProperty(out, "data", { value: arr, enumerable: false });
  Object.defineProperty(out, "source", { value: source, enumerable: false });
  return out;
}

/**
 * Leitura genérica com fallback Dexie.
 * Retorna T[] enriquecido com { data, source } — compat total com chamadores
 * existentes que tratam o retorno como array puro.
 */
export async function listRemoteOrCache<T = any>(opts: {
  name: DexieTableName;
  remote: () => Promise<{ data: T[] | null; error: any }>;
  filter?: (r: any) => boolean;
}): Promise<ListResult<T>> {
  let source: DataSource = "empty";
  const arr = await safeFetch<T[]>(
    async () => {
      if (opts.name === "boletins_rg") console.log("[RG_SYNC_START]");
      const { data, error } = await opts.remote();
      if (error) throw error;
      const rows = (data || []) as any[];
      if (opts.name === "boletins_rg") console.log("[RG_SYNC_RECEIVED]", rows.length);
      const written = await hydrate(opts.name, rows);
      if (opts.name === "boletins_rg") console.log("[RG_SYNC_WRITTEN]", written);
      const out = (opts.filter ? rows.filter(opts.filter) : rows) as T[];
      source = out.length ? "remote" : "empty";
      console.log("[DATA_SOURCE]", { table: opts.name, source, count: out.length });
      return out;
    },
    async () => {
      const out = (await readCache(opts.name, opts.filter)) as T[];
      source = out.length ? "cache" : "empty";
      console.log("[DATA_SOURCE]", { table: opts.name, source, count: out.length });
      return out;
    },
    { label: opts.name },
  );
  return withSource(arr, source);
}

function genId() {
  // SEMPRE retorna um UUID v4 válido. Um fallback "tmp_..." faz o Postgres rejeitar
  // a inserção com "invalid input syntax for type uuid" e a mutação fica presa
  // eternamente em status "error" na fila de sincronização.
  const c: any = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // Fallback manual UUID v4
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0"));
  return `${h.slice(0,4).join("")}-${h.slice(4,6).join("")}-${h.slice(6,8).join("")}-${h.slice(8,10).join("")}-${h.slice(10,16).join("")}`;
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
