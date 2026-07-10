/**
 * Integração: fechamento da jornada gera DWR com onConflict correto.
 * Foca na semântica do repositório (upsertOffline) que o DailyWorkCloser usa.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/integrations/supabase/client", async () => {
  const { createSupabaseMock } = await import("../mocks/supabase");
  const mocked = createSupabaseMock();
  return { supabase: mocked.client, __mocked: mocked };
});

import { db } from "@/lib/offline/db";
import { upsertOffline } from "@/lib/offline/repos";

describe("DWR close: upsertOffline uses legacy_agent_id,work_date conflict target", () => {
  beforeEach(async () => {
    await db.mutations.clear();
    await db.daily_work_records.clear();
  });

  it("enqueues upsert mutation with the correct onConflict", async () => {
    const payload = {
      agent_id: "u1",
      legacy_agent_id: "u1",
      work_date: "2025-07-10",
      status: "completed",
      end_time: new Date().toISOString(),
      properties_worked: 3,
    };
    await upsertOffline("daily_work_records", payload, { onConflict: "legacy_agent_id,work_date" });

    const muts = await db.mutations.toArray();
    expect(muts).toHaveLength(1);
    expect(muts[0].op).toBe("upsert");
    expect(muts[0].table).toBe("daily_work_records");
    expect(muts[0].on_conflict).toBe("legacy_agent_id,work_date");
    expect(muts[0].payload.status).toBe("completed");
    expect(muts[0].payload.end_time).toBeTruthy();
    expect(muts[0].payload.work_date).toBe("2025-07-10");
  });

  it("second upsert on same (legacy_agent_id, work_date) reuses local id", async () => {
    const base = {
      agent_id: "u1", legacy_agent_id: "u1", work_date: "2025-07-10",
      status: "completed", properties_worked: 3,
    };
    const first = await upsertOffline("daily_work_records", { ...base }, { onConflict: "legacy_agent_id,work_date" });
    const second = await upsertOffline("daily_work_records", { ...base, properties_worked: 5 }, { onConflict: "legacy_agent_id,work_date" });
    expect(second.id).toBe(first.id);
  });
});
