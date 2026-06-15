import { useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

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

// 🟢 sem foco | 🔴 foco positivo | 🟠 pendência | 🔵 PE | 🟣 caso confirmado
function colorFor(p: BlockMapProperty): { color: string; label: string } {
  if (p.had_previous_focus) return { color: "#ef4444", label: "Foco positivo" };
  if (p.has_pendency) return { color: "#f97316", label: "Pendência" };
  if ((p.type || "").toLowerCase() === "strategic_point") return { color: "#3b82f6", label: "Ponto estratégico" };
  return { color: "#10b981", label: "Sem foco" };
}

declare global {
  interface Window {
    __rgInitBlockMap?: () => void;
    google?: any;
  }
}

function loadMapsApi(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.maps?.Map) return resolve();
    const existing = document.querySelector<HTMLScriptElement>("script[data-rg-gmaps]");
    if (existing) {
      const i = setInterval(() => {
        if (window.google?.maps?.Map) { clearInterval(i); resolve(); }
      }, 100);
      setTimeout(() => { clearInterval(i); reject(new Error("Timeout carregando Google Maps")); }, 15000);
      return;
    }
    window.__rgInitBlockMap = () => resolve();
    const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
    const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID || "";
    if (!key) return reject(new Error("Google Maps key não configurada"));
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=__rgInitBlockMap${channel ? `&channel=${channel}` : ""}`;
    s.async = true;
    s.setAttribute("data-rg-gmaps", "true");
    s.onerror = () => reject(new Error("Falha ao carregar Google Maps"));
    document.head.appendChild(s);
  });
}

export function BlockMapDialog({ open, onOpenChange, blockNumber, properties }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const geo = properties.filter((p) => p.latitude != null && p.longitude != null);

  useEffect(() => {
    if (!open || !mapRef.current || geo.length === 0) return;
    let cancelled = false;
    loadMapsApi()
      .then(() => {
        if (cancelled || !mapRef.current) return;
        const center = { lat: geo[0].latitude as number, lng: geo[0].longitude as number };
        const map = new window.google.maps.Map(mapRef.current, {
          center,
          zoom: 18,
          mapTypeId: "hybrid",
        });
        const bounds = new window.google.maps.LatLngBounds();
        geo.forEach((p) => {
          const { color, label } = colorFor(p);
          const pos = { lat: p.latitude as number, lng: p.longitude as number };
          const marker = new window.google.maps.Marker({
            position: pos,
            map,
            title: `Nº ${p.number} — ${label}`,
            icon: {
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 9,
              fillColor: color,
              fillOpacity: 1,
              strokeColor: "#fff",
              strokeWeight: 2,
            },
          });
          const info = new window.google.maps.InfoWindow({
            content: `<div style="font-family:system-ui;font-size:12px"><b>Nº ${p.number}</b><br/>${p.street_name ?? ""}<br/><span style="color:${color}">●</span> ${label}</div>`,
          });
          marker.addListener("click", () => info.open({ anchor: marker, map }));
          bounds.extend(pos);
        });
        if (geo.length > 1) map.fitBounds(bounds);
      })
      .catch((e) => console.error("[BlockMapDialog]", e));
    return () => { cancelled = true; };
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
