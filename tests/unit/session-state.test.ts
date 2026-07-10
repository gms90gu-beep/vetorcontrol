import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/integrations/supabase/client", async () => {
  const { createSupabaseMock } = await import("../mocks/supabase");
  const mocked = createSupabaseMock({
    tables: {
      field_work_sessions: { rows: [] },
      visits: { rows: [] },
      daily_work_records: { rows: [] },
    },
  });
  return { supabase: mocked.client, __mocked: mocked };
});

import { findInProgressSession, canCreateSession } from "@/lib/session-state";

describe("session-state", () => {
  beforeEach(() => vi.clearAllMocks());

  it("findInProgressSession returns null when no rows", async () => {
    const r = await findInProgressSession("user-1");
    expect(r).toBeNull();
  });

  it("canCreateSession allows when no existing session", async () => {
    const r = await canCreateSession({
      userId: "user-1",
      sessionDate: "2025-07-10",
      blockNumber: "42",
    });
    expect(r.allowed).toBe(true);
  });
});
