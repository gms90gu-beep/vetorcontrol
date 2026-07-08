// Fase 2.A — Mapa operacional do quarteirão atualmente aberto.
// Usa a biblioteca oficial de mapas (@/components/map/shared) — nada de Leaflet direto.
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { SharedMap, SharedMarkerLayer, MARKER_COLORS, type MarkerStatus } from "@/components/map/shared";

type Property = {
  id: string;
  number?: string | null;
  complement?: string | null;
  street_name?: string | null;
  type?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

type Visit = {
  property_id: string;
  status?: string | null;
  has_focus?: boolean | null;
};

type FilterKey =
  | "all" | "visited" | "pending" | "focus"
  | "strategic" | "vacant" | "nogeo";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "visited", label: "Visitados" },
  { key: "pending", label: "Pendentes" },
  { key: "focus", label: "Focos" },
  { key: "strategic", label: "Pontos Estratégicos" },
  { key: "vacant", label: "Terrenos Baldios" },
  { key: "nogeo", label: "Sem GPS" },
];

const LEGEND = [
  { color: MARKER_COLORS.clean, label: "Visitado" },
  { color: MARKER_COLORS.focus, label: "Foco positivo" },
  { color: MARKER_COLORS.pendency, label: "Pendente" },
  { color: MARKER_COLORS.strategic, label: "Ponto Estratégico" },
  { color: MARKER_COLORS.unknown, label: "Não iniciado" },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  blockNumber?: string | null;
  properties: Property[];
  visits: Visit[];
  loading?: boolean;
}

function classify(p: Property, v?: Visit): { status: MarkerStatus; label: string } {
  if (v?.has_focus) return { status: "focus", label: "Foco positivo" };
  if ((p.type || "").toUpperCase() === "PE" || (p.type || "").toLowerCase() === "strategic_point")
    return { status: "strategic", label: "Ponto Estratégico" };
  if (v && (v.status === "visited" || v.status === "closed" || v.status === "refused"))
    return { status: "clean", label: "Visitado" };
  if (v) return { status: "pendency", label: "Pendente" };
  return { status: "unknown", label: "Não iniciado" };
}

export function BlockOperationalMap({
  open, onOpenChange, blockNumber, properties, visits, loading,
}: Props) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterKey>("all");

  const lastVisitByProp = useMemo(() => {
    const m = new Map<string, Visit>();
    for (const v of visits) if (v.property_id) m.set(v.property_id, v);
    return m;
  }, [visits]);

  const filteredProps = useMemo(() => {
    return properties.filter((p) => {
      const v = lastVisitByProp.get(p.id);
      const hasGeo = p.latitude != null && p.longitude != null;
      const t = (p.type || "").toUpperCase();
      switch (filter) {
        case "visited": return !!v && (v.status === "visited" || v.status === "closed" || v.status === "refused");
        case "pending": return !v;
        case "focus": return !!v?.has_focus;
        case "strategic": return t === "PE" || (p.type || "").toLowerCase() === "strategic_point";
        case "vacant": return t === "TB";
        case "nogeo": return !hasGeo;
        default: return true;
      }
    });
  }, [properties, lastVisitByProp, filter]);

  const points = useMemo(() => {
    return filteredProps
      .filter((p) => p.latitude != null && p.longitude != null)
      .map((p) => {
        const v = lastVisitByProp.get(p.id);
        const cls = classify(p, v);
        const nav = `https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}`;
        const popupHtml = `
          <div style="font-family:system-ui;font-size:12px;min-width:180px">
            <div style="font-weight:800;margin-bottom:2px">Nº ${p.number ?? "—"}${p.complement ? " · " + p.complement : ""}</div>
            <div style="color:#64748b;margin-bottom:4px">${p.street_name ?? ""}</div>
            <div style="margin-bottom:6px"><span style="color:${MARKER_COLORS[cls.status]}">●</span> ${cls.label}</div>
            <div style="display:flex;gap:6px;margin-top:6px">
              <a href="/property/${p.id}" style="flex:1;text-align:center;background:#0f172a;color:#fff;padding:6px 8px;border-radius:6px;text-decoration:none;font-weight:700">Abrir Visita</a>
              <a href="${nav}" target="_blank" rel="noopener" style="flex:1;text-align:center;background:#3b82f6;color:#fff;padding:6px 8px;border-radius:6px;text-decoration:none;font-weight:700">🧭 Navegar</a>
            </div>
          </div>
        `;
        return {
          id: p.id,
          lat: p.latitude as number,
          lng: p.longitude as number,
          status: cls.status,
          popupHtml,
          tooltip: `Nº ${p.number ?? "—"}`,
        };
      });
  }, [filteredProps, lastVisitByProp]);

  const geoCount = properties.filter((p) => p.latitude != null && p.longitude != null).length;

  const handleClick = (pt: { id: string }) => {
    onOpenChange(false);
    navigate({ to: `/property/${pt.id}` });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="text-base">
            Mapa do quarteirão {blockNumber ?? "—"}
          </DialogTitle>
        </DialogHeader>

        <div className="px-4 pb-2">
          <ScrollArea className="w-full">
            <div className="flex gap-2 pb-2">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "px-3 h-7 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition border",
                    filter === f.key
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-600 border-slate-200",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        <div className="px-4 pb-4">
          <SharedMap
            height="65vh"
            loading={loading}
            isEmpty={properties.length === 0 || points.length === 0}
            emptyVariant={properties.length === 0 ? "no-data" : "no-geo"}
            legendEntries={LEGEND}
            legendTrailing={`${geoCount} de ${properties.length} georreferenciados · ${points.length} exibidos`}
          >
            <SharedMarkerLayer points={points} onClick={handleClick} />
          </SharedMap>
        </div>
      </DialogContent>
    </Dialog>
  );
}
