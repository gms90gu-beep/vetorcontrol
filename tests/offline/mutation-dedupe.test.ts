import { beforeEach, describe, expect, it } from "vitest";
import { db, enqueueMutation } from "@/lib/offline/db";
describe("v4 queue coalescing", () => {
  beforeEach(async () => { await db.mutations.clear(); });
  it("indexes dedupeKey in version 4", () => { expect(db.verno).toBe(4); expect(db.mutations.schema.indexes.some(i => i.name === "dedupeKey")).toBe(true); });
  it("deduplicates repeated pending inserts", async () => {
    await enqueueMutation({ table: "visits", op: "insert", payload: { id: "v1", notes: "a" } });
    await enqueueMutation({ table: "visits", op: "insert", payload: { id: "v1", has_focus: true } });
    expect(await db.mutations.count()).toBe(1);
    expect((await db.mutations.toArray())[0].payload).toEqual({ id: "v1", notes: "a", has_focus: true });
  });
  it("preserves fields and explicit null across concurrent updates", async () => {
    await Promise.all([
      enqueueMutation({ table: "properties", op: "update", pk: "p", payload: { latitude: 12, notes: "old" } }),
      enqueueMutation({ table: "properties", op: "update", pk: "p", payload: { longitude: 13, notes: null } }),
    ]);
    expect(await db.mutations.count()).toBe(1);
    expect((await db.mutations.toArray())[0].payload).toEqual({ latitude: 12, longitude: 13, notes: null });
  });
  it("never replaces syncing payload", async () => {
    const id = await enqueueMutation({ table: "properties", op: "update", pk: "p", payload: { latitude: 12 } });
    await db.mutations.update(id, { status: "syncing" });
    await enqueueMutation({ table: "properties", op: "update", pk: "p", payload: { longitude: 13 } });
    expect(await db.mutations.count()).toBe(2);
    expect((await db.mutations.get(id))?.payload).toEqual({ latitude: 12 });
    expect((await db.mutations.get(id))?.status).toBe("syncing");
  });
  it("uses the canonical profile/date conflict key", async () => {
    for (const payload of [{ agent_id: "profile", work_date: "2026-10-01", properties_worked: 20 }, { agent_id: "profile", work_date: "2026-10-01", positive_foci: 2 }]) await enqueueMutation({ table: "daily_work_records", op: "upsert", on_conflict: "agent_id,work_date", payload });
    expect(await db.mutations.count()).toBe(1);
    expect((await db.mutations.toArray())[0].payload.properties_worked).toBe(20);
  });
  it("keeps destructive operations as ordering barriers", async () => {
    await enqueueMutation({ table: "properties", op: "update", pk: "p", payload: { notes: "before" } });
    await enqueueMutation({ table: "properties", op: "delete", pk: "p", payload: {} });
    await enqueueMutation({ table: "properties", op: "update", pk: "p", payload: { notes: "after" } });
    expect(await db.mutations.count()).toBe(3);
  });
  it("coalesces updates separated by another record without losing either", async () => {
    await enqueueMutation({ table: "properties", op: "update", pk: "p", payload: { latitude: 12 } });
    await enqueueMutation({ table: "properties", op: "update", pk: "other", payload: { notes: "other" } });
    await enqueueMutation({ table: "properties", op: "update", pk: "p", payload: { longitude: 13 } });
    const rows = await db.mutations.toArray();
    expect(rows).toHaveLength(2);
    expect(rows.find(row => row.pk === "p")?.payload).toEqual({ latitude: 12, longitude: 13 });
    expect(rows.find(row => row.pk === "other")?.payload).toEqual({ notes: "other" });
  });
});