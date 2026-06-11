/**
 * database.ts
 * IndexedDB schema via Dexie.js — fonte primária de todos os dados offline.
 * Toda leitura de UI passa por aqui primeiro; a API é apenas canal de sync.
 */

import Dexie, { type Table } from 'dexie';

// ─── Tipos de entidade ────────────────────────────────────────────────────────

export interface LocalSession {
  id: string;            // sempre "current"
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;     // epoch ms
  createdAt: number;
}

export interface RGRecord {
  id: string;
  userId: string;
  title: string;
  description?: string;
  status: string;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  _synced: boolean;
  _deletedAt?: string;
}

export interface FieldWorkRecord {
  id: string;
  userId: string;
  propertyId?: string;
  title: string;
  notes?: string;
  status: string;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  _synced: boolean;
  _deletedAt?: string;
}

export interface PendingRecord {
  id: string;
  userId: string;
  entityType: string;
  entityId: string;
  reason: string;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  _synced: boolean;
  _deletedAt?: string;
}

export interface PropertyRecord {
  id: string;
  userId: string;
  name: string;
  address?: string;
  area?: number;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  _synced: boolean;
  _deletedAt?: string;
}

// ─── Fila de sincronização ────────────────────────────────────────────────────

export type SyncActionType = 'CREATE' | 'UPDATE' | 'DELETE';
export type SyncStatus = 'pending' | 'processing' | 'done' | 'error';
export type SyncEntity = 'rg' | 'field-work' | 'pending' | 'property';

export interface SyncQueueItem {
  id?: number;           // auto-increment
  tempId: string;        // UUID gerado offline para correlação
  entity: SyncEntity;
  type: SyncActionType;
  payload: Record<string, unknown>;
  status: SyncStatus;
  retries: number;
  lastError?: string;
  createdAt: number;     // epoch ms
  processedAt?: number;
}

// ─── Banco ────────────────────────────────────────────────────────────────────

class AppDatabase extends Dexie {
  sessions!: Table<LocalSession>;
  rg!: Table<RGRecord>;
  fieldWork!: Table<FieldWorkRecord>;
  pendingItems!: Table<PendingRecord>;
  properties!: Table<PropertyRecord>;
  syncQueue!: Table<SyncQueueItem>;

  constructor() {
    super('AppDB');

    this.version(1).stores({
      sessions:     'id, userId',
      rg:           'id, userId, status, _synced, _deletedAt',
      fieldWork:    'id, userId, propertyId, status, _synced, _deletedAt',
      pendingItems: 'id, userId, entityType, entityId, _synced, _deletedAt',
      properties:   'id, userId, _synced, _deletedAt',
      syncQueue:    '++id, tempId, entity, type, status, createdAt',
    });
  }
}

export const db = new AppDatabase();

// ─── Helpers de acesso ────────────────────────────────────────────────────────

/** Retorna todos os registros não deletados de uma tabela */
export async function getActiveRecords<T extends { _deletedAt?: string }>(
  table: Table<T>
): Promise<T[]> {
  return table.filter((r) => !r._deletedAt).toArray();
}

/** Upsert seguro — atualiza se existir, cria se não */
export async function upsert<T extends { id: string }>(
  table: Table<T>,
  record: T
): Promise<void> {
  await table.put(record);
}

/** Marca registro como deletado (soft-delete) + enfileira sync */
export async function softDelete(
  table: Table<{ id: string; _deletedAt?: string; _synced: boolean }>,
  id: string
): Promise<void> {
  await table.update(id, {
    _deletedAt: new Date().toISOString(),
    _synced: false,
  });
}
