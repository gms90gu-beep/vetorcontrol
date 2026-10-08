// IndexedDB local (Dexie) — espelho mínimo do Supabase para modo offline.
import Dexie, { type Table } from "dexie";
import { mutationDedupeKey, mergeMutationPayload } from "./mutation-dedupe";

export type MutationOp = "insert" | "update" | "delete" | "upsert" | "delete_where" | "update_where" | "rpc";
export type MutationStatus = "pending" | "syncing" | "error";

export interface Mutation {
  id?: number;
  table: string;            // tabela alvo (para op=rpc, usar string vazia ou nome lógico)
  op: MutationOp;
  payload: Record<string, any>;
  pk?: string;              // chave primária para update/delete
  rpc_name?: string;        // nome da RPC quando op === "rpc"
  on_conflict?: string;     // para upsert (ex.: "agent_id,work_date")
  match?: Record<string, any>; // para delete_where
  createdAt: number;
  tries: number;
  status: MutationStatus;
  lastError?: string;
  nextRetryAt?: number;    // backoff — não reenviar antes deste timestamp (ms)
  dedupeKey?: string;
}

export interface CachedRow {
  id: string;
  data: Record<string, any>;
  updatedAt?: string;
}

export interface MetaRow {
  key: string;
  value: any;
}

class VetorDB extends Dexie {
  mutations!: Table<Mutation, number>;
  properties!: Table<CachedRow, string>;
  blocks!: Table<CachedRow, string>;
  boletins_rg!: Table<CachedRow, string>;
  visits!: Table<CachedRow, string>;
  visit_deposits!: Table<CachedRow, string>;
  property_pendencies!: Table<CachedRow, string>;
  property_recovery_attempts!: Table<CachedRow, string>;
  field_work_sessions!: Table<CachedRow, string>;
  daily_work_records!: Table<CachedRow, string>;
  cycles!: Table<CachedRow, string>;
  weeks!: Table<CachedRow, string>;
  profiles!: Table<CachedRow, string>;
  agents!: Table<CachedRow, string>;
  block_progress!: Table<CachedRow, string>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super("vetorcontrol-offline");
    this.version(1).stores({
      mutations: "++id, table, status, createdAt",
      properties: "id, updatedAt",
      blocks: "id, updatedAt",
      boletins_rg: "id, updatedAt",
      visits: "id, updatedAt",
      visit_deposits: "id, updatedAt",
      property_pendencies: "id, updatedAt",
      field_work_sessions: "id, updatedAt",
      daily_work_records: "id, updatedAt",
      meta: "key",
    });
    this.version(2).stores({
      property_recovery_attempts: "id, updatedAt",
      cycles: "id, updatedAt",
      weeks: "id, updatedAt",
      profiles: "id, updatedAt",
      agents: "id, updatedAt",
    });
    this.version(3).stores({
      block_progress: "id, updatedAt",
    });
    this.version(4).stores({
      mutations: "++id, table, status, createdAt, dedupeKey",
    }).upgrade(async tx => {
      await tx.table("mutations").toCollection().modify((row: Mutation) => {
        row.dedupeKey = mutationDedupeKey(row);
      });
    });
  }
}

export const db = new VetorDB();

export async function enqueueMutation(m: Omit<Mutation, "id" | "createdAt" | "tries" | "status">) {
  const dedupeKey = mutationDedupeKey(m);
  return db.transaction("rw", db.mutations, async () => {
    const matches = dedupeKey ? await db.mutations.where("dedupeKey").equals(dedupeKey).sortBy("createdAt") : [];
    // A syncing item is immutable. Never merge across an intervening operation.
    const all = await db.mutations.orderBy("createdAt").toArray();
    const last = all.at(-1);
    const pending = matches.filter(row => row.status === "pending");
    const candidate = pending.at(-1);
    if (candidate?.id !== undefined && last?.id === candidate.id) {
      await db.mutations.update(candidate.id, { payload: mergeMutationPayload(candidate.payload, m.payload), tries: 0, lastError: undefined, nextRetryAt: undefined });
      return candidate.id;
    }
    return db.mutations.add({ ...m, dedupeKey, createdAt: Date.now(), tries: 0, status: "pending" });
  });
}

export async function clearOfflineDB() {
  await Promise.all([
    db.mutations.clear(),
    db.properties.clear(),
    db.blocks.clear(),
    db.boletins_rg.clear(),
    db.visits.clear(),
    db.visit_deposits.clear(),
    db.property_pendencies.clear(),
    db.property_recovery_attempts.clear(),
    db.field_work_sessions.clear(),
    db.daily_work_records.clear(),
    db.cycles.clear(),
    db.weeks.clear(),
    db.profiles.clear(),
    db.agents.clear(),
    db.block_progress.clear(),
    db.meta.clear(),
  ]);
}
