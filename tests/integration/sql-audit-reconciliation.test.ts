import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/offline/db";
import { reconcile } from "@/lib/offline/reconciler";

// Mock Supabase client
vi.mock("@/integrations/supabase/client", async () => {
  const { createSupabaseMock } = await import("../mocks/supabase");
  const mocked = createSupabaseMock();
  return { supabase: mocked.client, __mocked: mocked };
});

import { supabase } from "@/integrations/supabase/client";

describe("SQL Failure Audit & Preserved Closure Regression", () => {
  beforeEach(async () => {
    await db.daily_work_records.clear();
    await db.mutations.clear();
  });

  it("should preserve local record when server reconstruction fails (Migration 0011 simulation)", async () => {
    // 1. Setup local 'work' record (simulating a closure)
    const agentId = "agent-123";
    const localId = "local-dwr-1";
    await db.daily_work_records.put({
      id: localId,
      data: { agent_id: agentId, work_date: "2026-10-08", status: "completed" },
      updatedAt: new Date().toISOString(),
    });

    // 2. Setup a pending mutation for this record (protects it from deletion)
    await db.mutations.put({
      table: "daily_work_records",
      op: "upsert",
      payload: { id: localId, status: "completed" },
      ts: Date.now(),
      status: "pending",
      tries: 0
    } as any);

    // 4. Run reconciliation with an empty server result (simulating a "missing" record on server)
    const report = await reconcile({
      module: "work",
      userId: agentId,
      serverRows: [], // Server has nothing
      localStore: db.daily_work_records,
      ownerKey: "agent_id",
      mutationTables: ["daily_work_records"],
    });

    // 5. Assertions
    expect(report.preservedPending).toBe(1); // The local DWR was protected by the pending mutation
    const record = await db.daily_work_records.get(localId);
    expect(record).toBeDefined();
    expect(record?.data.status).toBe("completed");
  });

});
