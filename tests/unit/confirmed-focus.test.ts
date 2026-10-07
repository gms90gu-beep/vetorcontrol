import { describe, expect, it } from "vitest";
import { confirmedFocusVisitIds } from "@/lib/confirmed-focus";
import { classifyMapPoint } from "@/lib/map-point-status";

describe("confirmed focus", () => {
  it("does not promote an observed focus without positive deposits", () => {
    expect(confirmedFocusVisitIds([{ visit_id: "observed", is_positive: false }]).size).toBe(0);
    expect(classifyMapPoint({ has_observed_focus: true })).toBe("focus_found");
  });
  it("recognizes a positive deposit even without observed focus", () => {
    expect([...confirmedFocusVisitIds([{ visit_id: "positive", is_positive: true }])]).toEqual(["positive"]);
    expect(classifyMapPoint({ has_positive_focus: true })).toBe("focus");
  });
});