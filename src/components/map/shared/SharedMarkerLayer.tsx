// SharedMarkerLayer — renderiza pontos com classificação semântica e cluster opcional.
import { useEffect, useMemo } from "react";
import L from "leaflet";
import { useSharedMap } from "./context";
import { useMarkerCluster } from "./hooks/useMarkerCluster";
import { classifyProperty, MARKER_COLORS, type MarkerStatus } from "./providers";
import { useFitBounds } from "./hooks/useFitBounds";

export type SharedMarkerPoint = {
  id: string;
  lat: number;
  lng: number;
  status?: MarkerStatus;
  // Para classificação automática quando status não é informado
  had_previous_focus?: boolean | null;
  has_pendency?: boolean | null;
  type?: string | null;
  // Conteúdo HTML do popup/tooltip
  popupHtml?: string;
  tooltip?: string;
  data?: unknown;
};

interface Props {
  points: SharedMarkerPoint[];
  cluster?: boolean;
  fitToPoints?: boolean;
  radius?: number;
  onClick?: (p: SharedMarkerPoint) => void;
}

export function SharedMarkerLayer({
  points, cluster = true, fitToPoints = true, radius = 9, onClick,
}: Props) {
  const map = useSharedMap();

  const latLngs = useMemo<Array<[number, number]>>(
    () => points.map((p) => [p.lat, p.lng] as [number, number]),
    [points],
  );

  useFitBounds(map, latLngs, { enabled: fitToPoints });

  useMarkerCluster(
    map,
    () =>
      points.map((p) => {
        const cls = p.status
          ? { color: MARKER_COLORS[p.status], label: p.status }
          : classifyProperty({
              had_previous_focus: p.had_previous_focus,
              has_pendency: p.has_pendency,
              type: p.type,
            });
        const m = L.circleMarker([p.lat, p.lng], {
          radius,
          fillColor: cls.color,
          fillOpacity: 1,
          color: "#fff",
          weight: 2,
        });
        if (p.popupHtml) m.bindPopup(p.popupHtml);
        if (p.tooltip) m.bindTooltip(p.tooltip, { direction: "top", offset: [0, -8] });
        if (onClick) m.on("click", () => onClick(p));
        return m;
      }),
    [points, radius, cluster],
    { enabled: cluster },
  );

  // Render nada — efeitos colaterais via Leaflet
  useEffect(() => undefined, []);
  return null;
}
