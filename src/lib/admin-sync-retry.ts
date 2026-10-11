import { db as legacyDb } from "@/db/database";
import { db as operationalDb } from "@/lib/offline/db";
/** Requeues failed operations on this device. Payload, identifiers and error evidence are preserved. */
export async function requeueAdminSyncErrors(legacy = legacyDb, operational = operationalDb) {
  const legacyCount = await legacy.syncQueue.where("status").equals("error")
    .modify({ status: "pending", retries: 0 });
  const operationalCount = await operational.mutations.where("status").equals("error")
    .modify({ status: "pending", tries: 0, nextRetryAt: undefined });
  return { requeued: legacyCount + operationalCount, legacy: legacyCount, operational: operationalCount, deleted: 0 };
}
