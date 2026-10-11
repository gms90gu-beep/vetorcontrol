import { describe, expect, it } from "vitest";
import { blockProductionCounts } from "../../src/lib/block-production-counts";
describe("block production counts", () => {
  it("counts both closed and completed without duplicating a block", () => {
    expect(blockProductionCounts([{ id: "a", block_number: "4.3", status: "closed" }, { id: "b", block_number: "4/3", status: "completed" }, { id: "c", block_number: "4.3", status: "completed" }]).blocksCompleted).toBe(2);
  });
  it("distinguishes worked blocks from completed blocks", () => {
    expect(blockProductionCounts([{ id: "a", block_number: "1", status: "paused" }, { id: "b", block_number: "2", status: "closed" }], [{ field_work_session_id: "a" }])).toEqual({ blocksWorked: 2, blocksCompleted: 1 });
  });
});
