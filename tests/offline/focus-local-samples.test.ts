import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { saveVisitOffline } from "@/lib/offline/repos/visits";
import { db } from "@/lib/offline/db";
import { readLocalFocusSamples } from "@/lib/focus-local-samples";
beforeEach(async () => { await db.open(); await Promise.all([db.visits.clear(),db.properties.clear(),db.cycles.clear(),db.mutations.clear(),db.visit_deposits.clear()]); });
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
 it("preserves the collected deposit flag independently from positivity in cache and queue", async () => {
  const id=await saveVisitOffline(null,{property_id:"p",agent_id:"a",cycle_id:"c",status:"visited",activity_type:"survey",visit_date:"2026-10-06T12:00:00-03:00",has_focus:true,sample_collected:false},[
    {visit_id:"",type_code:"C",quantity:1,focus_found:true,is_positive:false},
    {visit_id:"",type_code:"A1",quantity:1,focus_found:false,is_positive:false},
    {visit_id:"",type_code:"D1",quantity:2,focus_found:false,is_positive:false},
  ]);
  expect((await db.visits.get(id))?.data.sample_collected).toBe(true);
  const deposits=await db.visit_deposits.toArray();expect(deposits.filter(d=>d.data.focus_found).map(d=>d.data.type_code)).toEqual(["C"]);
  const queue=await db.mutations.toArray();expect(queue.filter(m=>m.table==="visit_deposits" && m.payload.focus_found).map(m=>m.payload.type_code)).toEqual(["C"]);
  expect(deposits.every(d=>d.data.is_positive===false)).toBe(true);
 });
});
