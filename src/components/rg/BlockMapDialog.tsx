import { useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type BlockMapProperty = {
  id: string;
  number: string;
  street_name: string | null;
  type: string | null;
  latitude: number | null;
  longitude: number | null;
  had_previous_focus?: boolean | null;
  status?: string | null;
  has_pendency?: boolean | null;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  blockNumber: string | null;
  properties: BlockMapProperty[];
}

function colorFor(p: BlockMapProperty): { color: string; label: string } {
  if (p.had_previous_focus) return { color: "#ef4444", label: "Foco positivo" };
  if (p.has_pendency) return { color: "#f97316", label: "Pendência" };
  if ((p.type || "").toLowerCase() === "strategic_point") return { color: "#3b82f6", label: "Ponto estratégico" };
  return { color: "#10b981", label: "Sem foco" };
}

export function BlockMapDialog({ open, onOpenChange, blockNumber, properties }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const geo = properties.filter((p) => p.latitude != null && p.longitude != null);

  useEffect(() => {
    if (!open || !mapRef.current || geo.length === 0) return;

    // Pequeno delay para garantir que o container do dialog tenha dimensões
    const timer = setTimeout(() => {
      if (!mapRef.current) return;

      // Limpa instância anterior se existir
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }

      const center: L.LatLngExpression = [geo[0].latitude as number, geo[0].longitude as number];
      const map = L.map(mapRef.current, { center, zoom: 18 });
      mapInstance.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(map);

      const bounds = L.latLngBounds([]);
      geo.forEach((p) => {
        const { color, label } = colorFor(p);
        const pos: L.LatLngExpression = [p.latitude as number, p.longitude as number];
        const marker = L.circleMarker(pos, {
          radius: 9,
          fillColor: color,
          fillOpacity: 1,
          color: "#fff",
          weight: 2,
        }).addTo(map);
        marker.bindPopup(
          `<div style="font-family:system-ui;font-size:12px"><b>Nº ${p.number}</b><br/>${p.street_name ?? ""}<br/><span style="color:${color}">●</span> ${label}</div>`,
        );
        bounds.extend(pos);
      });

      if (geo.length > 1) map.fitBounds(bounds, { padding: [24, 24] });
      // Garante render correto após o dialog abrir
      setTimeout(() => map.invalidateSize(), 100);
    }, 50);

    return () => {
      clearTimeout(timer);
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [open, geo]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Mapa do quarteirão {blockNumber ?? "—"}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-4 text-[11px] font-bold text-slate-600 flex-wrap">
          <span><span className="inline-block w-3 h-3 rounded-full bg-emerald-500 mr-1 align-middle" /> Sem foco</span>
          <span><span className="inline-block w-3 h-3 rounded-full bg-red-500 mr-1 align-middle" /> Foco positivo</span>
          <span><span className="inline-block w-3 h-3 rounded-full bg-orange-500 mr-1 align-middle" /> Pendência</span>
          <span><span className="inline-block w-3 h-3 rounded-full bg-blue-500 mr-1 align-middle" /> Ponto estratégico</span>
          <span className="ml-auto text-slate-500">
            {geo.length} de {properties.length} georreferenciados
          </span>
        </div>
        {geo.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <Loader2 className="h-6 w-6 mb-2 opacity-40" />
            Nenhum imóvel deste quarteirão possui coordenadas registradas.
          </div>
        ) : (
          <div ref={mapRef} className="w-full h-[60vh] rounded-lg border border-slate-200 bg-slate-100" />
        )}
      </DialogContent>
    </Dialog>
  );
}
