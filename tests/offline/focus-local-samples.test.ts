import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { db } from "@/lib/offline/db";
import { readLocalFocusSamples } from "@/lib/focus-local-samples";
beforeEach(async () => { await db.open(); await Promise.all([db.visits.clear(),db.properties.clear(),db.cycles.clear(),db.mutations.clear()]); });
afterEach(async () => { await db.delete(); });
describe("local collection visibility", () => {
 it("shows unsent focus for owner even without legacy collection flag and preserves error payload", async () => {
  await db.visits.put({ id:"v", data:{ id:"v", agent_id:"a", property_id:"p", has_focus:true, sample_collected:false } });
  await db.properties.put({ id:"p", data:{ number:"2",block_number:"4.3" } });
  const payload={id:"v",agent_id:"a",has_focus:true,sample_collected:false};
  await db.mutations.add({table:"visits",op:"insert",payload,status:"error",createdAt:1,tries:2,lastError:"failed to fetch"});
  const result=await readLocalFocusSamples("a");expect(result.samples).toHaveLength(1);expect(result.samples[0].property_number).toBe("2");expect(result.samples[0].sync_error).toBe("failed to fetch");
  expect((await readLocalFocusSamples("other")).samples).toEqual([]);expect((await db.mutations.toArray())[0].payload).toEqual(payload);
 });
 it("does not turn a confirmed result back into pending or duplicate a queued visit", async () => {
  await db.visits.put({id:"v",data:{agent_id:"a",has_focus:true,focus_analysis_status:"negative"}});
  await db.mutations.add({table:"visits",op:"update",pk:"v",payload:{notes:"x",focus_analysis_status:null},status:"pending",createdAt:1,tries:0});
  expect((await readLocalFocusSamples("a")).samples).toEqual([]);
 });
});
