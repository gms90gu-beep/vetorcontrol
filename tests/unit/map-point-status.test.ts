import { describe, expect, it } from "vitest";
import { classifyMapPoint, isPositiveMapVisit } from "@/lib/map-point-status";

describe("map point status", () => {
  it("counts a positive visit when either source marks the focus", () => {
    expect(isPositiveMapVisit(true, false)).toBe(true);
    expect(isPositiveMapVisit(false, true)).toBe(true);
    expect(isPositiveMapVisit(false, false)).toBe(false);
  });

  it("prioritizes focus and an open pendency", () => {
    expect(classifyMapPoint({
      has_positive_focus: true,
      has_pendency: true,
      last_visit_status: "closed",
    })).toBe("focus");
    expect(classifyMapPoint({
      has_pendency: true,
      last_visit_status: "closed",
    })).toBe("pendency");
  });

  it("uses visit status from the selected period before the permanent property type", () => {
    expect(classifyMapPoint({ last_visit_status: "closed", is_strategic: true })).toBe("closed");
    expect(classifyMapPoint({ last_visit_status: "refused" })).toBe("refused");
    expect(classifyMapPoint({ last_visit_status: "abandoned" })).toBe("abandoned");
    expect(classifyMapPoint({ last_visit_status: "visited", is_strategic: true })).toBe("strategic");
  });

  it("marks green only after a visit without focus in the selected period", () => {
    expect(classifyMapPoint({ last_visit_status: "visited" })).toBe("clean");
    expect(classifyMapPoint({})).toBe("unvisited");
  });
});
