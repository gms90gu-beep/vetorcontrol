// Barrel oficial da biblioteca de mapas.
// Regra: nenhum componente fora desta pasta deve importar `leaflet` diretamente.
export * from "./providers";
export * from "./base-layers";
export * from "./logger";
export * from "./context";
export * from "./SharedMap";
export * from "./SharedMapControls";
export * from "./SharedMarkerLayer";
export * from "./SharedAgentTerritoryLayer";
export * from "./SharedNumberedMarkerLayer";
export * from "./SharedRouteLayer";
export * from "./SharedUserLocationLayer";
export * from "./SharedLegend";
export * from "./SharedLoading";
export * from "./SharedError";
export { attachResilientTileLayer } from "./hooks/useResilientTileLayer";
export { useFitBounds } from "./hooks/useFitBounds";
export { useMapResize } from "./hooks/useMapResize";
export { useMarkerCluster } from "./hooks/useMarkerCluster";
export { useMapEvents } from "./hooks/useMapEvents";
