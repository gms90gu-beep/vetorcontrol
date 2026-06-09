// IndexedDB local (Dexie) — espelho mínimo do Supabase para modo offline.
import Dexie, { type Table } from "dexie";

export type MutationOp = "insert" | "update" | "delete";
export type MutationStatus = "pending" | "syncing" | "error";

export interface Mutation {
  id?: number;
  table: string;
  op: MutationOp;
  payload: Record<string, any>;
  pk?: string;
  createdAt: number;
  tries: number;
  status: MutationStatus;
  lastError?: string;
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
  field_work_sessions!: Table<CachedRow, string>;
  daily_work_records!: Table<CachedRow, string>;
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
  }
}

export const db = new VetorDB();

export async function enqueueMutation(m: Omit<Mutation, "id" | "createdAt" | "tries" | "status">) {
  return db.mutations.add({
    ...m,
    createdAt: Date.now(),
    tries: 0,
    status: "pending",
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
    db.field_work_sessions.clear(),
    db.daily_work_records.clear(),
    db.meta.clear(),
  ]);
}
