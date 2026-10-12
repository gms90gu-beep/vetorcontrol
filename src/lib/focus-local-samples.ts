import { db } from "@/lib/offline/db";
/** Read-only view of unsent visits on this device; never changes queue payloads. */
export async function readLocalFocusSamples(userId: string) {
  const [mutations, visits, properties, cycles] = await Promise.all([
    db.mutations.toArray(), db.visits.toArray(), db.properties.toArray(), db.cycles.toArray(),
  ]);
  const saved = new Map(visits.map(row => [row.id, row.data]));
  const props = new Map(properties.map(row => [row.id, row.data]));
  const rows = new Map<string, any>();
  for (const mutation of mutations) {
    if (mutation.table !== "visits" || !["insert", "upsert", "update"].includes(mutation.op)) continue;
    const id = mutation.pk ?? mutation.payload.id;
    if (!id) continue;
    if (["positive", "negative", "inconclusive"].includes(saved.get(String(id))?.focus_analysis_status)) continue;
    const visit: Record<string, any> = { ...saved.get(String(id)), ...mutation.payload, id: String(id) };
    if (visit.agent_id !== userId || !(visit.has_focus || visit.sample_collected)) continue;
    if (["positive", "negative", "inconclusive"].includes(visit.focus_analysis_status)) continue;
    const property = props.get(visit.property_id);
    rows.set(String(id), { ...visit, property_number: property?.number ?? "—", street: property?.street_name ?? "", block_number: property?.block_number ?? "—", sync_error: mutation.status === "error" ? mutation.lastError : undefined });
  }
  return { samples: [...rows.values()], cycles: cycles.map(row => row.data) };
}
