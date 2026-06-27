// Migrado para a biblioteca oficial @/components/map/shared.
// Não instancia Leaflet diretamente — usa SharedMap + SharedMarkerLayer.
import { useMemo } from "react";
import {
  SharedMap,
  SharedMarkerLayer,
  MARKER_COLORS,
  type SharedMarkerPoint,
  type LegendEntry,
} from "@/components/map/shared";

type AuditProp = {
  id: string;
  street_name: string | null;
  number: string | null;
  block_number: string | null;
  locality: string | null;
  agent_name: string | null;
  latitude: number | null;
  longitude: number | null;
  geocoded_at: string | null;
  has_focus?: boolean;
  has_pendency?: boolean;
  status: "valid" | "missing" | "invalid" | "duplicated";
};

function isValid(n: unknown) {
  return typeof n === "number" && Number.isFinite(n) && n !== 0;
}

const LEGEND: LegendEntry[] = [
  { color: MARKER_COLORS.valid, label: "Válido" },
  { color: MARKER_COLORS.missing, label: "Sem coord." },
  { color: MARKER_COLORS.invalid, label: "Inválido" },
  { color: MARKER_COLORS.duplicated, label: "Duplicado" },
  { color: MARKER_COLORS.focus, label: "Foco confirmado" },
];

function popup(p: AuditProp): string {
  const status = p.has_focus ? "focus" : p.status;
  const color = MARKER_COLORS[status as keyof typeof MARKER_COLORS] ?? MARKER_COLORS.unknown;
  const captured = p.geocoded_at ? new Date(p.geocoded_at).toLocaleString("pt-BR") : "—";
  const gmaps = `https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}`;
  return `
    <div style="font-family:system-ui;font-size:12px;min-width:200px;line-height:1.45">
      <div style="font-weight:600">${p.street_name ?? "Imóvel"} ${p.number ?? ""}</div>
      <div>Quarteirão: <b>${p.block_number ?? "—"}</b></div>
      <div>Localidade: ${p.locality ?? "—"}</div>
      <div>Agente: ${p.agent_name ?? "—"}</div>
      <div style="margin-top:4px">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:4px"></span>
        <b>${status}</b>${p.has_pendency ? " · pendência" : ""}
      </div>
      <div>Última captura: ${captured}</div>
      <div style="font-family:ui-monospace,monospace;color:#64748b;margin-top:2px">
        ${p.latitude?.toFixed(5)}, ${p.longitude?.toFixed(5)}
      </div>
      <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
        <a href="/properties/${p.id}" style="border:1px solid #cbd5e1;border-radius:6px;padding:2px 6px;font-size:11px;text-decoration:none;color:inherit">Imóvel</a>
        <a href="${gmaps}" target="_blank" rel="noreferrer" style="border:1px solid #cbd5e1;border-radius:6px;padding:2px 6px;font-size:11px;text-decoration:none;color:inherit">Navegar</a>
      </div>
    </div>
  `;
}

export default function GeorefAuditMap({ properties }: { properties: AuditProp[] }) {
  const points: SharedMarkerPoint[] = useMemo(
    () =>
      properties
        .filter(
          (p) =>
            isValid(p.latitude) &&
            isValid(p.longitude) &&
            Math.abs(p.latitude!) <= 90 &&
            Math.abs(p.longitude!) <= 180,
        )
        .map((p) => ({
          id: p.id,
          lat: p.latitude!,
          lng: p.longitude!,
          status: (p.has_focus ? "focus" : p.status) as SharedMarkerPoint["status"],
          popupHtml: popup(p),
          tooltip: `${p.street_name ?? "Imóvel"} ${p.number ?? ""}`,
        })),
    [properties],
  );

  console.log("[GEOREF_MAP]", { points: points.length, total: properties.length });

  return (
    <SharedMap
      height={500}
      isEmpty={points.length === 0}
      emptyVariant="no-geo"
      legendEntries={LEGEND}
      legendTrailing={`${points.length} de ${properties.length} georreferenciados`}
    >
      <SharedMarkerLayer points={points} />
    </SharedMap>
  );
}
