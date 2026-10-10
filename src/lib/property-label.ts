export function propertyLabel(property: { number?: unknown; sequence?: unknown; complement?: unknown } | null | undefined): string {
  const parts = [`Imóvel ${String(property?.number ?? "").trim() || "—"}`];
  const sequence = String(property?.sequence ?? "").trim();
  const complement = String(property?.complement ?? "").trim();
  if (sequence && sequence !== "0") parts.push(`Seq. ${sequence}`);
  if (complement) parts.push(`Compl. ${complement}`);
  return parts.join(" · ");
}
