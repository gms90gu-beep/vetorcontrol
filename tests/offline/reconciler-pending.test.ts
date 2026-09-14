import { beforeEach, describe, expect, it } from "vitest";
import { db, enqueueMutation } from "@/lib/offline/db";
import { reconcile } from "@/lib/offline/reconciler";

describe("reconcile: proteção de mutações offline pendentes", () => {
  beforeEach(async () => {
    await db.mutations.clear();
    await db.boletins_rg.clear();
  });

  it("preserva registro local criado offline até o flush da fila", async () => {
    const row = {
      id: "rg-offline-1",
      data: {
        id: "rg-offline-1",
        agent_id: "agent-1",
        block_number: "12",
        updated_at: "2026-09-14T08:00:00.000Z",
      },
      updatedAt: "2026-09-14T08:00:00.000Z",
    };

    await db.boletins_rg.put(row);
    await enqueueMutation({
      table: "boletins_rg",
      op: "insert",
      payload: row.data,
    });

    const report = await reconcile({
      module: "rg",
      userId: "agent-1",
      serverRows: [],
      localStore: db.boletins_rg,
      ownerKey: "agent_id",
    });

    expect(report.deleted).toBe(0);
    expect(report.preservedPending).toBe(1);
    expect(await db.boletins_rg.get(row.id)).toBeDefined();
  });

  it("remove do cache apenas o órfão sem mutação pendente", async () => {
    const row = {
      id: "rg-synced-1",
      data: {
        id: "rg-synced-1",
        agent_id: "agent-1",
        updated_at: "2026-09-13T08:00:00.000Z",
      },
      updatedAt: "2026-09-13T08:00:00.000Z",
    };

    await db.boletins_rg.put(row);

    const report = await reconcile({
      module: "rg",
      userId: "agent-1",
      serverRows: [],
      localStore: db.boletins_rg,
      ownerKey: "agent_id",
    });

    expect(report.deleted).toBe(1);
    expect(report.preservedPending).toBe(0);
    expect(await db.boletins_rg.get(row.id)).toBeUndefined();
  });
});
