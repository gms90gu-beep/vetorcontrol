import { describe, expect, it } from "vitest";
import { isWorkedVisitStatus, selectLatestWorkedVisits } from "@/lib/cycle-property-visits";

const scope = {
  propertyIds: ["home-1", "home-2", "home-3"],
  agentId: "agent-1",
  cycleId: "cycle-2",
  cycleStartDate: "2026-10-01",
  cycleEndDate: "2026-10-31",
};

describe("cycle property visits", () => {
  it("uses the latest valid visit in the cycle and ignores pending rows", () => {
    const visits = [
      {
        id: "old",
        property_id: "home-1",
        agent_id: "agent-1",
        cycle_id: "cycle-2",
        status: "visited",
        visit_date: "2026-10-03T12:00:00Z",
      },
      {
        id: "pending",
        property_id: "home-1",
        agent_id: "agent-1",
        cycle_id: "cycle-2",
        status: "pending",
        visit_date: "2026-10-12T12:00:00Z",
      },
      {
        id: "latest",
        property_id: "home-1",
        agent_id: "agent-1",
        cycle_id: "cycle-2",
        status: "closed",
        visit_date: "2026-10-13T12:00:00Z",
      },
    ];

    expect(selectLatestWorkedVisits(visits, scope)).toEqual([visits[2]]);
  });

  it("includes legacy visits by operational date but excludes other cycles and agents", () => {
    const visits = [
      {
        id: "legacy-in",
        property_id: "home-1",
        agent_id: "agent-1",
        cycle_id: null,
        status: "refused",
        visit_date: "2026-10-02T12:00:00Z",
      },
      {
        id: "legacy-out",
        property_id: "home-2",
        agent_id: "agent-1",
        cycle_id: null,
        status: "visited",
        visit_date: "2026-09-30T12:00:00Z",
      },
      {
        id: "wrong-cycle",
        property_id: "home-2",
        agent_id: "agent-1",
        cycle_id: "cycle-1",
        status: "visited",
        visit_date: "2026-10-10T12:00:00Z",
      },
      {
        id: "wrong-agent",
        property_id: "home-3",
        agent_id: "agent-2",
        cycle_id: "cycle-2",
        status: "visited",
        visit_date: "2026-10-10T12:00:00Z",
      },
    ];

    expect(selectLatestWorkedVisits(visits, scope).map((visit) => visit.id)).toEqual(["legacy-in"]);
  });

  it("recognizes the operational outcomes as worked visits", () => {
    for (const status of ["visited", "closed", "refused", "abandoned", "treated", "partial"]) {
      expect(isWorkedVisitStatus(status)).toBe(true);
    }
    expect(isWorkedVisitStatus("pending")).toBe(false);
  });
});
