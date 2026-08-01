import { describe, it, expect } from "vitest";
import { getOperationalDate, epiWeekFromDate, getOperationalVisitDate, assertProductionDate, resolveOperationalCloseTarget } from "@/lib/operational-date";

describe("getOperationalDate (America/Sao_Paulo)", () => {
  it("22:30 BRT stays on same calendar day", () => {
    // 2025-07-10 22:30 BRT = 2025-07-11 01:30 UTC
    const d = new Date("2025-07-11T01:30:00Z");
    expect(getOperationalDate(d)).toBe("2025-07-10");
  });
  it("23:59 BRT stays on same day (never rolls to next via UTC)", () => {
    const d = new Date("2025-07-11T02:59:00Z");
    expect(getOperationalDate(d)).toBe("2025-07-10");
  });
  it("00:30 BRT is next day", () => {
    const d = new Date("2025-07-11T03:30:00Z");
    expect(getOperationalDate(d)).toBe("2025-07-11");
  });
  it("format is YYYY-MM-DD", () => {
    expect(getOperationalDate(new Date("2025-01-05T15:00:00Z"))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("resolveOperationalCloseTarget", () => {
  it("prefers the date of real production over an empty session created today", () => {
    const result = resolveOperationalCloseTarget(
      [
        { id: "old", session_date: "2026-07-27", created_at: "2026-07-27T12:00:00Z" },
        { id: "today", session_date: "2026-08-01", created_at: "2026-08-01T10:00:00Z" },
      ],
      [{ field_work_session_id: "old", visit_date: "2026-07-27T16:00:00Z" }],
      "2026-08-01",
    );
    expect(result).toEqual({ workDate: "2026-07-27", sessionId: "old", source: "visit" });
  });

  it("uses today for an empty normal session", () => {
    const result = resolveOperationalCloseTarget(
      [{ id: "today", session_date: "2026-08-01" }],
      [],
      "2026-08-01",
    );
    expect(result.workDate).toBe("2026-08-01");
    expect(result.source).toBe("today_session");
  });
});

describe("epiWeekFromDate", () => {
  it("returns ISO week for a mid-year date", () => {
    const r = epiWeekFromDate("2025-07-10");
    expect(r.year).toBe(2025);
    expect(r.week).toBeGreaterThan(0);
    expect(r.week).toBeLessThan(54);
  });
  it("first week of january", () => {
    const r = epiWeekFromDate("2025-01-02");
    expect(r.week).toBe(1);
  });
});

describe("getOperationalVisitDate", () => {
  it("uses session_date when provided", () => {
    const iso = getOperationalVisitDate("2025-07-10", "test");
    expect(iso.slice(0, 10)).toBe("2025-07-10");
  });
  it("falls back to now() when session_date is null", () => {
    const iso = getOperationalVisitDate(null, "test");
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
  it("falls back on invalid session_date", () => {
    const iso = getOperationalVisitDate("garbage", "test");
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("assertProductionDate", () => {
  it("does not throw when match", () => {
    expect(() => assertProductionDate("2025-07-10", "2025-07-10T15:00:00", "m")).not.toThrow();
  });
  it("does not throw when mismatch (only logs)", () => {
    expect(() => assertProductionDate("2025-07-10", "2025-07-11T15:00:00", "m")).not.toThrow();
  });
});
