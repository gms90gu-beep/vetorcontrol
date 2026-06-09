// SyncEngine — drena a fila de mutações para o Supabase quando online.
import { supabase } from "@/integrations/supabase/client";
import { db, type Mutation } from "./db";

let running = false;
let intervalId: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

export function onSyncChange(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notify() {
  listeners.forEach((cb) => {
    try { cb(); } catch {}
  });
}

async function applyMutation(m: Mutation): Promise<void> {
  const table = m.table as any;
  if (m.op === "insert") {
    const { error } = await supabase.from(table).insert(m.payload);
    if (error) throw error;
  } else if (m.op === "update") {
    if (!m.pk) throw new Error("update sem pk");
    const { error } = await supabase.from(table).update(m.payload).eq("id", m.pk);
    if (error) throw error;
  } else if (m.op === "delete") {
    if (!m.pk) throw new Error("delete sem pk");
    const { error } = await supabase.from(table).delete().eq("id", m.pk);
    if (error) throw error;
  }
}

export async function flushMutations(): Promise<{ ok: number; failed: number }> {
  if (running) return { ok: 0, failed: 0 };
  if (typeof navigator !== "undefined" && !navigator.onLine) return { ok: 0, failed: 0 };
  running = true;
  let ok = 0;
  let failed = 0;
  try {
    // FIFO
    const pending = await db.mutations
      .where("status")
      .anyOf("pending", "error")
      .sortBy("createdAt");

    for (const m of pending) {
      if (typeof navigator !== "undefined" && !navigator.onLine) break;
      try {
        await db.mutations.update(m.id!, { status: "syncing" });
        await applyMutation(m);
        await db.mutations.delete(m.id!);
        ok++;
      } catch (e: any) {
        failed++;
        await db.mutations.update(m.id!, {
          status: "error",
          tries: (m.tries || 0) + 1,
          lastError: e?.message || String(e),
        });
      }
      notify();
    }
  } finally {
    running = false;
    notify();
  }
  return { ok, failed };
}

export async function pendingMutationCount(): Promise<number> {
  return db.mutations.count();
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
