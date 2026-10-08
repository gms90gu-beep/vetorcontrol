import type { Mutation } from "./db";

type Input = Omit<Mutation, "id" | "createdAt" | "tries" | "status">;
function stable(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map(v => JSON.parse(stable(v))));
  if (value && typeof value === "object") return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, v === undefined ? null : JSON.parse(stable(v))])));
  return JSON.stringify(value ?? null);
}
export function mutationDedupeKey(m: Input): string | undefined {
  if (Array.isArray(m.payload)) return undefined;
  if (m.op === "rpc") return `rpc:${m.rpc_name}:${stable(m.payload)}`;
  if (m.op.endsWith("_where")) return m.match ? `${m.table}:${m.op}:${stable(m.match)}` : undefined;
  if (m.on_conflict) {
    const keys = m.on_conflict.split(",").map(k => k.trim());
    if (keys.every(k => m.payload[k] !== undefined)) return `${m.table}:${m.op}:${stable(keys.map(k => [k, m.payload[k]]))}`;
  }
  const id = m.pk ?? m.payload.id;
  return id ? `${m.table}:${m.op}:${String(id)}` : undefined;
}

export function mergeMutationPayload(previous: Record<string, any>, next: Record<string, any>): Record<string, any> {
  // Columns are atomic values; omitted columns survive, explicit null clears them.
  return { ...previous, ...Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined)) };
}