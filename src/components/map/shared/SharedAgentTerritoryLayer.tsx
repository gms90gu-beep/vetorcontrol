// SharedAgentTerritoryLayer — rótulo com o nome do agente no centróide da área
// dele, visível só em zoom baixo (quando não dá pra distinguir imóvel a imóvel).
// Regra da biblioteca: nenhum consumidor fora de shared/ importa Leaflet diretamente.
import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { useSharedMap } from "./context";

export type AgentTerritoryPoint = {
  lat: number;
  lng: number;
  agentLabel: string | null;
};

interface Props {
  points: AgentTerritoryPoint[];
  zoomThreshold?: number; // acima deste zoom, os rótulos somem (mostra imóvel a imóvel)
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export function SharedAgentTerritoryLayer({ points, zoomThreshold = 15 }: Props) {
  const map = useSharedMap();
  const [zoom, setZoom] = useState<number>(() => map?.getZoom() ?? 0);

  useEffect(() => {
    if (!map) return;
    const onZoom = () => setZoom(map.getZoom());
    map.on("zoomend", onZoom);
    setZoom(map.getZoom());
    return () => { map.off("zoomend", onZoom); };
  }, [map]);

  const centroids = useMemo(() => {
    const byAgent = new Map<string, { latSum: number; lngSum: number; count: number }>();
    for (const p of points) {
      const name = p.agentLabel ?? "Sem agente";
      const cur = byAgent.get(name) ?? { latSum: 0, lngSum: 0, count: 0 };
      cur.latSum += p.lat;
      cur.lngSum += p.lng;
      cur.count += 1;
      byAgent.set(name, cur);
    }
    return Array.from(byAgent.entries()).map(([name, v]) => ({
      name,
      count: v.count,
      lat: v.latSum / v.count,
      lng: v.lngSum / v.count,
    }));
  }, [points]);

  useEffect(() => {
    if (!map) return;
    const group = L.layerGroup();
    map.addLayer(group);
    if (zoom <= zoomThreshold) {
      for (const c of centroids) {
        const icon = L.divIcon({
          className: "rg-agent-territory-label",
          html: `<div style="background:rgba(15,23,42,0.85);color:#fff;padding:3px 9px;border-radius:9999px;font:700 11px system-ui;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.35)">${escapeHtml(c.name)} · ${c.count}</div>`,
          iconAnchor: [0, 0],
        });
        group.addLayer(L.marker([c.lat, c.lng], { icon, interactive: false, zIndexOffset: 2000 }));
      }
    }
    return () => {
      try { map.removeLayer(group); } catch { /* noop */ }
    };
  }, [map, zoom, zoomThreshold, centroids]);

  return null;
}
