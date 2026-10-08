import { describe, expect, it } from "vitest";
import { assertMasterRole, assertMasterTargetChange } from "@/lib/admin-policy";
import { settingsProductionSummary, sessionsMissingDailyRecord } from "@/lib/production-summary";

describe("master administrative rules", () => {
  it.each(["supervisor", "coordenador", "agente", "agent", "admin"])("denies privileged actions to %s", role => {
    expect(() => assertMasterRole(role)).toThrow(/Admin Master/);
  });
  it("allows a database master role", () => { expect(() => assertMasterRole("admin_master")).not.toThrow(); });
  const target = { actorId: "other", targetId: "master", targetRole: "admin_master", activeMasters: 1 };
  it("protects the last master against deletion", () => { expect(() => assertMasterTargetChange({ ...target, deleting: true })).toThrow(/último/); });
  it("protects the last master against deactivation", () => { expect(() => assertMasterTargetChange({ ...target, active: false })).toThrow(/último/); });
  it("protects the last master against demotion", () => { expect(() => assertMasterTargetChange({ ...target, nextRole: "coordenador" })).toThrow(/último/); });
  it("allows an unchanged master role", () => { expect(() => assertMasterTargetChange({ ...target, nextRole: "admin_master" })).not.toThrow(); });
  it("blocks self removal even with another master", () => { expect(() => assertMasterTargetChange({ ...target, actorId: "master", activeMasters: 2, deleting: true })).toThrow(/próprio/); });
});
describe("official production summaries", () => {
  it("uses official DWR totals and confirmed positives", () => {
    expect(settingsProductionSummary([{ properties_worked: 20, properties_closed: 5, positive_foci: 2 }], 3)).toEqual({ worked: 20, foci: 2, pending: 3, productivity: 75 });
  });
  it("flags closed sessions only when their profile/date has no daily record", () => {
    expect(sessionsMissingDailyRecord([
      { user_id: "a", session_date: "2026-10-01", status: "closed" },
      { user_id: "a", session_date: "2026-10-02", status: "paused" },
      { user_id: "a", session_date: "2026-10-03", status: "in_progress" },
      { user_id: "a", session_date: "2026-10-04", status: "completed" },
    ], [{ agent_id: "a", work_date: "2026-10-04" }])).toEqual([{ user_id: "a", session_date: "2026-10-01", status: "closed" }]);
  });
});