export type HeatMode = "count" | "focus" | "observed" | "positive" | "pendency";
export const HEAT_LABELS: Record<HeatMode, string> = {
  count: "Concentração de imóveis",
  focus: "Concentração de focos e alertas",
  observed: "Concentração de focos encontrados",
  positive: "Concentração de focos positivos",
  pendency: "Concentração de pendências abertas",
};
interface HeatPoint {
  latitude: number; longitude: number;
  has_observed_focus?: boolean | null;
  has_positive_focus?: boolean | null;
  has_pendency?: boolean | null;
}
/** Each qualifying property contributes once; healthy properties never generate focus heat. */
export function buildMapHeatData(points: HeatPoint[], mode: HeatMode): [number, number, number][] {
  return points.filter(p => Number.isFinite(p.latitude) && Number.isFinite(p.longitude)
    && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180
    && (mode === "count" || (mode === "focus" && (p.has_observed_focus || p.has_positive_focus))
      || (mode === "observed" && p.has_observed_focus)
      || (mode === "positive" && p.has_positive_focus)
      || (mode === "pendency" && p.has_pendency)))
    .map((p): [number, number, number] => [p.latitude, p.longitude, 1]);
}
/** Relative density at the current zoom, with headroom to avoid saturation of dense cells. */
export function mapHeatOptions(zoom: number, projected: { x: number; y: number; weight: number }[]) {
  const radius = zoom < 13 ? 10 : zoom < 16 ? 14 : 18;
  const blur = zoom < 13 ? 8 : 12;
  const cellSize = (radius + blur) / 2;
  const cells = new Map<string, number>();
  for (const p of projected) {
    const key = `${Math.floor(p.x / cellSize)}:${Math.floor(p.y / cellSize)}`;
    cells.set(key, (cells.get(key) ?? 0) + p.weight);
  }
  const peak = Math.max(0, ...cells.values());
  return { radius, blur, maxZoom: zoom, max: Math.max(3, peak * 1.5), minOpacity: 0.08,
    gradient: { 0.15: "#2563eb", 0.4: "#22c55e", 0.65: "#facc15", 0.85: "#f97316", 1: "#dc2626" } };
}
