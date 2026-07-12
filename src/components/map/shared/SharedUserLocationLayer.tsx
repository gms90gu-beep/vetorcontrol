// SharedUserLocationLayer — marcador do agente + círculo de precisão + seta opcional.
// Regra: nenhum consumidor fora de shared/ importa Leaflet diretamente.
import { useEffect } from "react";
import L from "leaflet";
import { useSharedMap } from "./context";

interface Props {
  lat: number | null | undefined;
  lng: number | null | undefined;
  accuracy?: number | null;
  bearingDeg?: number | null; // rumo até o próximo imóvel (0 = norte)
  color?: string;
}

let __cssInjected = false;
function ensureCss() {
  if (__cssInjected || typeof document === "undefined") return;
  const s = document.createElement("style");
  s.setAttribute("data-shared-user-loc", "");
  s.textContent = `
    .rg-user-loc { background: transparent !important; border: none !important; }
    @keyframes rg-user-pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.25)} }
  `;
  document.head.appendChild(s);
  __cssInjected = true;
}

function buildIcon(color: string, bearing: number | null | undefined): L.DivIcon {
  const size = 24;
  const arrow = bearing == null
    ? ""
    : `<div style="position:absolute;top:-14px;left:50%;transform:translateX(-50%) rotate(${bearing}deg);transform-origin:50% 22px;">
         <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:10px solid ${color};filter:drop-shadow(0 1px 1px rgba(0,0,0,.4))"></div>
       </div>`;
  return L.divIcon({
    className: "rg-user-loc",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `
      <div style="position:relative;width:${size}px;height:${size}px">
        ${arrow}
        <div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 0 0 4px ${color}33,0 2px 4px rgba(0,0,0,.35);animation:rg-user-pulse 1.8s ease-in-out infinite"></div>
      </div>`,
  });
}

export function SharedUserLocationLayer({
  lat, lng, accuracy, bearingDeg, color = "#2563eb",
}: Props) {
  const map = useSharedMap();

  useEffect(() => { ensureCss(); }, []);

  useEffect(() => {
    if (!map || lat == null || lng == null) return;
    const marker = L.marker([lat, lng], {
      icon: buildIcon(color, bearingDeg ?? null),
      zIndexOffset: 2000,
      interactive: false,
      keyboard: false,
    }).addTo(map);
    let circle: L.Circle | null = null;
    if (accuracy != null && accuracy > 0) {
      circle = L.circle([lat, lng], {
        radius: accuracy,
        color,
        weight: 1,
        opacity: 0.4,
        fillColor: color,
        fillOpacity: 0.08,
        interactive: false,
      }).addTo(map);
    }
    return () => {
      marker.remove();
      circle?.remove();
    };
  }, [map, lat, lng, accuracy, bearingDeg, color]);

  return null;
}
