import { beforeEach, describe, expect, it, vi } from "vitest";

const remote = vi.hoisted(() => ({ rows: new Map<string, Set<string>>(), writes: [] as string[] }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => ({
    select: () => ({ eq: (_key: string, id: string) => ({ maybeSingle: async () => ({ data: remote.rows.get(table)?.has(id) ? { id } : null, error: null }) }) }),
    insert: async (row: { id: string }) => {
      remote.writes.push(table);
      const ids = remote.rows.get(table) ?? new Set<string>();
      ids.add(row.id); remote.rows.set(table, ids);
      return { error: null };
    },
  }),
  rpc: async () => ({ error: null }),
} }));
vi.mock("@/lib/offline/cache-cleanup", () => ({ cleanupAfterSync: async () => undefined }));

import { db, enqueueMutation } from "@/lib/offline/db";
import { saveRecoveryAttemptOffline } from "@/lib/offline/repos/recovery";
import { flushMutations } from "@/lib/offline/sync";

describe("cycle-scoped offline recovery", () => {
  beforeEach(async () => {
    await Promise.all([db.mutations.clear(), db.property_pendencies.clear(), db.property_recovery_attempts.clear(), db.visits.clear(), db.field_work_sessions.clear()]);
    remote.rows.clear(); remote.writes.length = 0;
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
  });

  it("queues recovery offline and updates only the matching cycle", async () => {
    await db.property_pendencies.bulkPut([
      { id: "old", data: { id: "old", property_id: "p", cycle_id: "old-cycle", attempt_count: 2, resolved_at: null } },
      { id: "current", data: { id: "current", property_id: "p", cycle_id: "current-cycle", attempt_count: 1, resolved_at: null } },
    ]);
    const attempt = await saveRecoveryAttemptOffline({ property_id: "p", agent_id: "a", cycle_id: "current-cycle", week_id: "w", result: "visited" });
    expect((await db.property_pendencies.get("old"))?.data.attempt_count).toBe(2);
    expect((await db.property_pendencies.get("current"))?.data.resolved_at).toBe(attempt.attempted_at);
    expect(await db.mutations.count()).toBe(1);
    expect(await flushMutations()).toEqual({ ok: 0, failed: 0 });
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    expect(await flushMutations()).toEqual({ ok: 1, failed: 0 });
    expect(await db.mutations.count()).toBe(0);
    expect(remote.rows.get("property_recovery_attempts")?.has(attempt.id)).toBe(true);
  });

  it("restores session and visit before synchronizing a linked recovery", async () => {
    await db.field_work_sessions.put({ id: "s", data: { id: "s", user_id: "a" } });
    await db.visits.put({ id: "v", data: { id: "v", field_work_session_id: "s" } });
    await enqueueMutation({ table: "property_recovery_attempts", op: "insert", payload: { id: "r", visit_id: "v" } });
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    expect(await flushMutations()).toEqual({ ok: 1, failed: 0 });
    expect(remote.writes).toEqual(["field_work_sessions", "visits", "property_recovery_attempts"]);
  });

  it("preserves the queue when a required parent is unavailable", async () => {
    await enqueueMutation({ table: "visits", op: "insert", payload: { id: "v", field_work_session_id: "missing" } });
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    expect(await flushMutations()).toEqual({ ok: 0, failed: 1 });
    expect((await db.mutations.toArray())[0]?.status).toBe("error");
    expect(remote.writes).toEqual([]);
  });
});