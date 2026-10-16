import { describe, expect, it } from "vitest";
import { isDailyWorkRecordClosed } from "@/lib/session-resume-policy";

describe("isDailyWorkRecordClosed", () => {
  it("treats a completed daily record as closed", () => {
    expect(isDailyWorkRecordClosed({ status: "completed", end_time: null })).toBe(true);
  });

  it("treats a record with an end timestamp as closed", () => {
    expect(isDailyWorkRecordClosed({ status: "in_progress", end_time: "2026-10-14T20:00:00Z" })).toBe(true);
  });

  it("keeps an unfinished daily record open", () => {
    expect(isDailyWorkRecordClosed({ status: "in_progress", end_time: null })).toBe(false);
    expect(isDailyWorkRecordClosed(null)).toBe(false);
  });
});
