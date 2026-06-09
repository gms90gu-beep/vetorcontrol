// Repositórios offline-first.
// Cada read passa por safeFetch: online → Supabase + hidrata Dexie; offline → Dexie.
// Cada write grava em Dexie e enfileira mutação para o SyncEngine.

import { supabase } from "@/integrations/supabase/client";
import { db, enqueueMutation, type CachedRow } from "../db";
import { safeFetch } from "../safe-fetch";

type DexieTableName =
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


function table(name: DexieTableName) {
  return (db as any)[name] as ReturnType<typeof db["properties"]["toArray"] extends () => infer _ ? any : any>;
}

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

/** Insert offline-first. Persiste no Dexie e enfileira mutação. */
export async function createOffline(name: DexieTableName, row: any) {
  if (!row.id) row.id = (globalThis.crypto as any)?.randomUUID?.() ?? `tmp_${Date.now()}_${Math.random()}`;
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
