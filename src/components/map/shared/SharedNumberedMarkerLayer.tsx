// SharedNumberedMarkerLayer — marcadores com número (sequência) e halo de seleção.
// Uso operacional: mapa do RG, jornada de campo, etc.
// Regra da biblioteca: nenhum consumidor fora de shared/ importa Leaflet diretamente.
import { useEffect, useMemo } from "react";
import L from "leaflet";
import { useSharedMap } from "./context";
import { useFitBounds } from "./hooks/useFitBounds";
import { useMarkerCluster } from "./hooks/useMarkerCluster";

export type NumberedPoint = {
  id: string;
  lat: number;
  lng: number;
  label: string | number; // conteúdo do marcador (sequência)
  color: string;          // cor semântica
  popupHtml?: string;
  tooltip?: string;
};

interface Props {
  points: NumberedPoint[];
  selectedId?: string | null;
  nextId?: string | null;
  cluster?: boolean;
  fitToPoints?: boolean;
  onClick?: (id: string) => void;
}

let __cssInjected = false;
function ensureCss() {
  if (__cssInjected || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.setAttribute("data-shared-numbered-marker", "");
  style.textContent = `
    @keyframes rg-marker-pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.18)} }
    @keyframes rg-next-pulse { 0%,100%{box-shadow:0 0 0 6px rgba(249,115,22,.35),0 2px 6px rgba(0,0,0,.35)} 50%{box-shadow:0 0 0 12px rgba(249,115,22,.15),0 2px 6px rgba(0,0,0,.35)} }
    .rg-num-marker { background: transparent !important; border: none !important; }
  `;
  document.head.appendChild(style);
  __cssInjected = true;
}

function buildIcon(color: string, label: string | number, kind: "default" | "selected" | "next"): L.DivIcon {
  const size = kind === "default" ? 28 : 36;
  const font = kind === "default" ? 11 : 13;
  const ring =
    kind === "selected"
      ? "box-shadow:0 0 0 6px rgba(59,130,246,.30),0 2px 6px rgba(0,0,0,.35);animation:rg-marker-pulse 1.4s ease-in-out infinite;"
      : kind === "next"
        ? "animation:rg-next-pulse 1.4s ease-in-out infinite;"
        : "box-shadow:0 1px 3px rgba(0,0,0,.35);";
  return L.divIcon({
    className: "rg-num-marker",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font:800 ${font}px system-ui;border:2px solid #fff;${ring}">${label}</div>`,
  });
}

export function SharedNumberedMarkerLayer({
  points, selectedId, nextId, cluster = true, fitToPoints = true, onClick,
}: Props) {
  const map = useSharedMap();

  useEffect(() => { ensureCss(); }, []);

  const latLngs = useMemo(
    () => points.map((p) => [p.lat, p.lng] as [number, number]),
    [points],
  );
  useFitBounds(map, latLngs, { enabled: fitToPoints });

  useMarkerCluster(
    map,
    () =>
      points.map((p) => {
        const marker = L.marker([p.lat, p.lng], {
          icon: buildIcon(p.color, p.label, p.id === selectedId),
          zIndexOffset: p.id === selectedId ? 1000 : 0,
        });
        if (p.popupHtml) marker.bindPopup(p.popupHtml);
        if (p.tooltip) marker.bindTooltip(p.tooltip, { direction: "top", offset: [0, -14] });
        if (onClick) marker.on("click", () => onClick(p.id));
        return marker;
      }),
    [points, selectedId, cluster],
    { enabled: cluster, maxClusterRadius: 35 },
  );

  // Centraliza no imóvel selecionado (sincronização bidirecional).
  useEffect(() => {
    if (!map || !selectedId) return;
    const sel = points.find((p) => p.id === selectedId);
    if (!sel) return;
    const current = map.getZoom();
    map.setView([sel.lat, sel.lng], Math.max(current, 17), { animate: true });
  }, [map, selectedId, points]);

  return null;
}
