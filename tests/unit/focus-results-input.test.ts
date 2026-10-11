import { expect, it } from "vitest";
import { focusResultInput } from "@/lib/focus-results-input";
const id = "00000000-0000-4000-8000-000000000001";
const input = { visitId: id, status: "positive", positiveDepositIds: [id], reference: "Laudo 1", analysisDate: "2026-10-10", reason: "", version: 0, requestId: id };
it("accepts a positive result with linked deposit IDs and rejects one without", () => {
  expect(focusResultInput.safeParse(input).success).toBe(true);
  expect(focusResultInput.safeParse({ ...input, positiveDepositIds: [] }).success).toBe(false);
});
it("does not accept positive deposits for negative or inconclusive results", () => {
  for (const status of ["negative", "inconclusive"]) {
    expect(focusResultInput.safeParse({ ...input, status }).success).toBe(false);
    expect(focusResultInput.safeParse({ ...input, status, positiveDepositIds: [] }).success).toBe(true);
  }
});
it("requires laboratory reference and optimistic concurrency version", () => {
  expect(focusResultInput.safeParse({ ...input, reference: " " }).success).toBe(false);
  expect(focusResultInput.safeParse({ ...input, version: -1 }).success).toBe(false);
  expect(focusResultInput.safeParse({ ...input, status: "pending" }).success).toBe(false);
});
