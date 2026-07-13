// Modos cartográficos disponíveis no mapa. Cada modo pode combinar uma camada
// base (imagem/vetor) e uma camada de overlay (rótulos, ruas). Usado pelo
// SharedMapControls para alternar sem recarregar o mapa.

export type BaseLayerId = "operational" | "satellite" | "hybrid" | "terrain" | "night";

export type BaseLayerDef = {
  id: BaseLayerId;
  name: string;
  emoji: string;
  description: string;
  baseUrl: string;
  baseAttribution: string;
  baseSubdomains?: string;
  maxZoom: number;
  overlayUrl?: string;
  overlayAttribution?: string;
  overlaySubdomains?: string;
};

export const BASE_LAYERS: Record<BaseLayerId, BaseLayerDef> = {
  operational: {
    id: "operational",
    name: "Operacional",
    emoji: "🗺",
    description: "OpenStreetMap — ideal para trabalho de campo",
    baseUrl: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    baseAttribution: "© OpenStreetMap",
    baseSubdomains: "abc",
    maxZoom: 19,
  },
  satellite: {
    id: "satellite",
    name: "Satélite",
    emoji: "🛰",
    description: "Esri World Imagery — imagens reais da superfície",
    baseUrl:
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    baseAttribution: "© Esri, Maxar, Earthstar Geographics",
    maxZoom: 19,
  },
  hybrid: {
    id: "hybrid",
    name: "Híbrido",
    emoji: "🌐",
    description: "Satélite com nomes de ruas",
    baseUrl:
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    baseAttribution: "© Esri, Maxar, Earthstar Geographics",
    maxZoom: 19,
    overlayUrl:
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
    overlayAttribution: "Rótulos © Esri",
  },
  terrain: {
    id: "terrain",
    name: "Terreno",
    emoji: "⛰",
    description: "OpenTopoMap — relevo e áreas rurais",
    baseUrl: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    baseAttribution: "© OpenStreetMap, © OpenTopoMap (CC-BY-SA)",
    baseSubdomains: "abc",
    maxZoom: 17,
  },
  night: {
    id: "night",
    name: "Noturno",
    emoji: "🌙",
    description: "Carto Dark — visualização em baixa luz",
    baseUrl: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    baseAttribution: "© OpenStreetMap, © CARTO",
    baseSubdomains: "abcd",
    maxZoom: 19,
  },
};

export const BASE_LAYER_ORDER: BaseLayerId[] = [
  "operational",
  "satellite",
  "hybrid",
  "terrain",
  "night",
];

/** Retorna "night" se estivermos após as 18h ou antes das 6h. */
export function autoBaseLayerForTime(now: Date = new Date()): BaseLayerId {
  const h = now.getHours();
  return h >= 18 || h < 6 ? "night" : "operational";
}
