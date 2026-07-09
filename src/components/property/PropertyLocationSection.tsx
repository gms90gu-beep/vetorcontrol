import { useState } from "react";
import { MapPin, RefreshCw, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { isManagerRole } from "@/lib/role-guards";
import { georeferenceProperty } from "@/lib/geolocation";
import { ConfirmGpsOverwriteDialog } from "@/components/property/ConfirmGpsOverwriteDialog";

interface Props {
  property: {
    id: string;
    latitude?: number | null;
    longitude?: number | null;
    geocoded_at?: string | null;
  };
  role?: string | null;
  actorId: string | null;
  onUpdated?: (lat: number, lng: number) => void;
}

export function PropertyLocationSection({ property, role, actorId, onUpdated }: Props) {
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const canEdit = isManagerRole(role);
  const lat = property.latitude != null ? Number(property.latitude) : null;
  const lng = property.longitude != null ? Number(property.longitude) : null;
  const hasCoords = lat != null && lng != null;

  async function runCapture() {
    setBusy(true);
    try {
      const coords = await georeferenceProperty(property.id, actorId);
      toast.success("Localização atualizada.");
      onUpdated?.(coords.latitude, coords.longitude);
    } catch (err: any) {
      toast.error(err?.message || "Falha ao atualizar localização.");
    } finally {
      setBusy(false);
    }
  }

  function handleUpdate() {
    if (!canEdit) return;
    if (hasCoords) {
      console.log("[GPS_ALREADY_EXISTS]", { propertyId: property.id });
      setConfirmOpen(true);
      return;
    }
    void runCapture();
  }

  function handleDecision(decision: "update" | "keep" | "cancel") {
    setConfirmOpen(false);
    if (decision === "update") {
      console.log("[GPS_UPDATE_ACCEPTED]", { propertyId: property.id });
      void runCapture();
    } else {
      console.log("[GPS_UPDATE_CANCELLED]", { propertyId: property.id, decision });
    }
  }


  return (
    <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-3">
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-rose-500" />
        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
          Localização
        </h3>
      </div>

      {hasCoords ? (
        <>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <div className="text-[10px] uppercase text-slate-400 font-bold">Latitude</div>
              <div className="font-mono tabular-nums">{lat!.toFixed(6)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-400 font-bold">Longitude</div>
              <div className="font-mono tabular-nums">{lng!.toFixed(6)}</div>
            </div>
          </div>
          {property.geocoded_at && (
            <div className="text-xs text-slate-500">
              Georreferenciado em {new Date(property.geocoded_at).toLocaleDateString("pt-BR")}
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                window.open(
                  `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
                  "_blank",
                  "noopener,noreferrer",
                )
              }
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1" />
              Ver no mapa
            </Button>
            {canEdit && (
              <Button size="sm" variant="outline" onClick={handleUpdate} disabled={busy}>
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                )}
                Atualizar localização
              </Button>
            )}
          </div>
        </>
      ) : (
        <p className="text-xs text-slate-500">
          Imóvel ainda não georreferenciado. A localização será solicitada na primeira visita.
        </p>
      )}
    </section>
  );
}
