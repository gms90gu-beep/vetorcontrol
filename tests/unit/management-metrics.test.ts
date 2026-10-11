import { describe, expect, it } from "vitest";
import { productionTotals, visitActivity, sessionActivity, selectManagementProfiles, validateReportRange, dailyDepositTotal, reconcileIssueCount } from "@/lib/management-metrics";

describe("management production definitions", () => {
  it("counts completed daily records and keeps worked/closed/refused separate", () => {
    expect(productionTotals([
      { status: "completed", end_time: "17:00", properties_worked: 26, properties_closed: 5, properties_refused: 2, positive_foci: 1 },
      { status: "draft", end_time: null, properties_worked: 100 },
      { status: "completed", end_time: null, properties_worked: 50 },
    ])).toMatchObject({ worked: 26, closed: 5, refused: 2, positive: 1, dailyCount: 1, unfinished: 2 });
  });
  it("distinguishes visit attempts, unique houses, collected focus and lab results", () => {
    const visits = [
      { id: "1", property_id: "p1", status: "closed" },
      { id: "2", property_id: "p1", status: "visited", has_focus: true, sample_collected: true, focus_analysis_status: "pending" },
      { id: "3", property_id: "p2", status: "refused" },
      { id: "4", property_id: "p3", status: "visited", has_focus: true, focus_analysis_status: "negative", visit_deposits: [{ is_positive: true }] },
      { id: "5", property_id: "p4", status: "visited", focus_analysis_status: "positive" },
      { id: "6", property_id: "p5", status: "visited", visit_deposits: [{ is_positive: true }] },
      { id: "7", property_id: "p6", status: "visited", focus_analysis_status: "inconclusive" },
    ];
    expect(visitActivity(visits)).toMatchObject({ visits: 7, uniqueProperties: 6, workedVisits: 5, closedVisits: 1, refusedVisits: 1, positive: 2, pending: 1, negative: 1, inconclusive: 1 });
  });
  it("keeps future work and old paused sessions apart from today's activity", () => {
    expect(sessionActivity([{ session_date: "2026-10-12", status: "active" }, { session_date: "2026-10-10", status: "paused" }], "2026-10-11"))
      .toEqual({ hasAnyToday: false, hasOpenSession: true, hasFuture: true });
  });
  it("never adds a second copy of typed deposits and supports legacy JSON", () => {
    expect(dailyDepositTotal({ deposits_a1: 2, deposits_b: 3, deposits_by_type: { a1: 2, b: 3 } })).toBe(5);
    expect(dailyDepositTotal({ deposits_a1: 0, deposits_by_type: { A1: 2, B: 3 } })).toBe(5);
  });
  it("counts actual reconcile rows and arrays without producing NaN", () => {
    expect(reconcileIssueCount({ rows: [{ status: "ok" }, { status: "missing_block_id" }], orphanBlocks: [{ id: "o" }] })).toBe(2);
  });
});
describe("scope and period", () => {
  const profiles = [
    { id: "s1", role: "supervisor", coordinator_id: "c1" }, { id: "s2", role: "supervisor", coordinator_id: null },
    { id: "a1", role: "agente", supervisor_id: "s1" }, { id: "a2", role: "agente", supervisor_id: "s2" },
    { id: "a3", role: "agente", supervisor_id: null }, { id: "a4", role: "agente", coordinator_id: "c1" },
  ];
  it("accepts only explicit coordinator links, even if an older RPC returns more rows", () => {
    expect(selectManagementProfiles(profiles, "c1", "coordenador").map((p) => p.id)).toEqual(["s1", "a1", "a4"]);
    expect(selectManagementProfiles(profiles, "c2", "coordenador")).toEqual([]);
  });
  it("restricts supervisor and rejects unknown roles", () => {
    expect(selectManagementProfiles(profiles, "s1", "supervisor").map((p) => p.id)).toEqual(["a1"]);
    expect(selectManagementProfiles(profiles, "s1", "unknown")).toEqual([]);
  });
  it.each([{ from: "2026-02-30", to: "2026-03-01" }, { from: "2026-10-12", to: "2026-10-11" }, { from: "", to: "2026-10-11" }])("rejects invalid or inverted dates %j", (range) => {
    expect(() => validateReportRange(range)).toThrow(/Período/);
  });
});
