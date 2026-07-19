// Shared map infrastructure (Leaflet/OSM) — single source of truth.
// Used by OperationalMapView, GeorefAuditMap.

export type TileProvider = {
  id: string;
  name: string;
  url: string;
  attribution: string;
  maxZoom: number;
  subdomains?: string;
};

// Order = fallback priority. First entry is the default for thematic maps.
export const TILE_PROVIDERS: TileProvider[] = [
  {
    id: "carto-positron",
    name: "Carto Positron",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: "© OpenStreetMap, © CARTO",
    maxZoom: 19,
    subdomains: "abcd",
  },
  {
    id: "osm",
    name: "OpenStreetMap",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap",
    maxZoom: 19,
  },
  {
    id: "esri-imagery",
    name: "Esri World Imagery",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "© Esri, Maxar, Earthstar Geographics",
    maxZoom: 19,
  },
];

export function getProvider(id: string): TileProvider {
  return TILE_PROVIDERS.find((p) => p.id === id) ?? TILE_PROVIDERS[0];
}

// Shared semantic colors for property markers across the app.
export const MARKER_COLORS = {
  focus: "#ef4444",      // foco positivo
  pendency: "#f97316",   // pendência
  strategic: "#3b82f6",  // ponto estratégico
  clean: "#10b981",      // sem foco
  case: "#a855f7",       // caso confirmado
  // Auditoria de georreferenciamento
  valid: "#16a34a",
  missing: "#eab308",
  invalid: "#dc2626",
  duplicated: "#9333ea",
  unknown: "#94a3b8",
} as const;

export type MarkerStatus = keyof typeof MARKER_COLORS;

export function classifyProperty(p: {
  had_previous_focus?: boolean | null;
  has_pendency?: boolean | null;
  type?: string | null;
}): { status: MarkerStatus; color: string; label: string } {
  if (p.had_previous_focus) return { status: "focus", color: MARKER_COLORS.focus, label: "Foco positivo" };
  if (p.has_pendency) return { status: "pendency", color: MARKER_COLORS.pendency, label: "Pendência" };
  if ((p.type || "").toLowerCase() === "strategic_point")
    return { status: "strategic", color: MARKER_COLORS.strategic, label: "Ponto estratégico" };
  return { status: "clean", color: MARKER_COLORS.clean, label: "Sem foco" };
}
