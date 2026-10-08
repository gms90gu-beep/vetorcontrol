import { expect, it } from "vitest";
import { mapVisitInPeriod } from "@/lib/map-visit-period";

const from = "2026-10-01T03:00:00.000Z";
const to = "2026-10-02T02:59:59.999Z";
it("includes unlinked focus visits inside the operational period", () => {
  expect(mapVisitInPeriod({ cycle_id: null, visit_date: "2026-10-01T12:00:00.000Z" }, from, to, ["current"])).toBe(true);
});
it("excludes another linked cycle and out-of-period unlinked visits", () => {
  expect(mapVisitInPeriod({ cycle_id: "old", visit_date: "2026-10-01T12:00:00.000Z" }, from, to, ["current"])).toBe(false);
  expect(mapVisitInPeriod({ cycle_id: null, visit_date: "2026-09-30T12:00:00.000Z" }, from, to, ["current"])).toBe(false);
});