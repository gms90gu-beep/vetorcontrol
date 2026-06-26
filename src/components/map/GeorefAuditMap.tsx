import { useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
} from "react-leaflet";
import { Link } from "@tanstack/react-router";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { Navigation2, ExternalLink } from "lucide-react";

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

const COLOR: Record<string, string> = {
  valid: "#16a34a",
  missing: "#eab308",
  invalid: "#dc2626",
  duplicated: "#9333ea",
  focus: "#000000",
};

function isValid(n: any) {
  return typeof n === "number" && Number.isFinite(n) && n !== 0;
}

export default function GeorefAuditMap({ properties }: { properties: AuditProp[] }) {
  const points = useMemo(
    () =>
      properties.filter(
        (p) =>
          isValid(p.latitude) &&
          isValid(p.longitude) &&
          Math.abs(p.latitude!) <= 90 &&
          Math.abs(p.longitude!) <= 180,
      ),
    [properties],
  );

  const center: [number, number] = points.length
    ? [
        points.reduce((s, p) => s + (p.latitude || 0), 0) / points.length,
        points.reduce((s, p) => s + (p.longitude || 0), 0) / points.length,
      ]
    : [-15.78, -47.93];

  console.log("[GEOREF_MAP]", { points: points.length });

  return (
    <div className="h-[500px] w-full rounded overflow-hidden border">
      <MapContainer
        center={center}
        zoom={points.length ? 14 : 5}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {points.map((p) => {
          const color = p.has_focus ? COLOR.focus : COLOR[p.status] || COLOR.missing;
          return (
            <CircleMarker
              key={p.id}
              center={[p.latitude!, p.longitude!]}
              radius={7}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.85, weight: 1 }}
            >
              <Popup>
                <div className="space-y-1 text-xs">
                  <div className="font-semibold">{p.street_name || "Imóvel"} {p.number || ""}</div>
                  <div>Quarteirão: <b>{p.block_number || "—"}</b></div>
                  <div>Localidade: {p.locality || "—"}</div>
                  <div>Agente: {p.agent_name || "—"}</div>
                  <div>Status: {p.status}</div>
                  {p.has_focus && <div className="text-red-600 font-semibold">⚫ Foco confirmado</div>}
                  {p.has_pendency && <div className="text-orange-600">Possui pendência</div>}
                  <div>Última captura: {p.geocoded_at ? new Date(p.geocoded_at).toLocaleString("pt-BR") : "—"}</div>
                  <div className="font-mono">{p.latitude?.toFixed(5)}, {p.longitude?.toFixed(5)}</div>
                  <div className="flex flex-wrap gap-1 pt-1">
                    <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                      <Link to="/properties/$id" params={{ id: p.id }}>
                        <ExternalLink className="h-3 w-3 mr-1" /> Imóvel
                      </Link>
                    </Button>
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 border rounded px-2 py-1 text-xs"
                    >
                      <Navigation2 className="h-3 w-3" /> Navegar
                    </a>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
