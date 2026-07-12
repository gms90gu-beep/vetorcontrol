// SharedRouteLayer — desenha uma polyline conectando pontos na ordem operacional.
// Regra: nenhum consumidor fora de shared/ importa Leaflet diretamente.
import { useEffect } from "react";
import L from "leaflet";
import { useSharedMap } from "./context";

export type RoutePoint = { lat: number; lng: number };

interface Props {
  points: RoutePoint[];
  color?: string;
  weight?: number;
  opacity?: number;
  dashArray?: string;
}

export function SharedRouteLayer({
  points,
  color = "#3b82f6",
  weight = 3,
  opacity = 0.7,
  dashArray = "6 6",
}: Props) {
  const map = useSharedMap();

  useEffect(() => {
    if (!map || points.length < 2) return;
    const latLngs = points.map((p) => L.latLng(p.lat, p.lng));
    const line = L.polyline(latLngs, {
      color,
      weight,
      opacity,
      dashArray,
      lineJoin: "round",
      lineCap: "round",
    }).addTo(map);
    return () => {
      line.remove();
    };
  }, [map, points, color, weight, opacity, dashArray]);

  return null;
}
