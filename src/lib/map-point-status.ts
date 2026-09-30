export type MapPointCategory =
  | "focus"
  | "focus_found"
  | "pendency"
  | "closed"
  | "refused"
  | "abandoned"
  | "strategic"
  | "clean"
  | "unvisited";

export const MAP_POINT_CATEGORY_META: Record<MapPointCategory, { color: string; label: string }> = {
  focus: { color: "#dc2626", label: "Foco positivo" },
  focus_found: { color: "#eab308", label: "Foco encontrado · alerta" },
  pendency: { color: "#f97316", label: "Pendência aberta" },
  closed: { color: "#f97316", label: "Fechada" },
  refused: { color: "#f97316", label: "Recusa" },
  abandoned: { color: "#f97316", label: "Abandonada" },
  strategic: { color: "#2563eb", label: "Ponto estratégico" },
  clean: { color: "#16a34a", label: "Visitado sem foco" },
  unvisited: { color: "#64748b", label: "Sem visita no período" },
};

export interface MapPointClassificationInput {
  has_positive_focus?: boolean | null;
  has_observed_focus?: boolean | null;
  has_pendency?: boolean | null;
  is_strategic?: boolean | null;
  last_visit_status?: string | null;
}

/** Applies the same precedence and period semantics in both supervisor maps. */
export function classifyMapPoint(point: MapPointClassificationInput): MapPointCategory {
  if (point.has_positive_focus) return "focus";
  if (point.has_observed_focus) return "focus_found";
  if (point.has_pendency) return "pendency";

  const visitStatus = String(point.last_visit_status ?? "").toLowerCase();
  if (visitStatus === "closed" || visitStatus === "refused" || visitStatus === "abandoned") {
    return visitStatus;
  }
  if (point.is_strategic) return "strategic";
  if (visitStatus === "visited") return "clean";
  return "unvisited";
}
