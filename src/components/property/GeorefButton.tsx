import { useState } from "react";
import { MapPin, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { georeferenceProperty } from "@/lib/geolocation";
import { ConfirmGpsOverwriteDialog } from "@/components/property/ConfirmGpsOverwriteDialog";

interface Props {
  propertyId: string;
  actorId: string | null;
  hasCoords: boolean;
  size?: "sm" | "default" | "icon";
  onDone?: (lat: number, lng: number, accuracy?: number | null) => void;
  label?: string;
}

/**
 * Botão único de georreferenciamento.
 * Reutilizável em RG, Jornada e Primeira Visita.
 * Não cria visita, não altera status.
 */
export function GeorefButton({ propertyId, actorId, hasCoords, size = "sm", onDone, label }: Props) {
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function runCapture() {
    setBusy(true);
    try {
      const coords = await georeferenceProperty(propertyId, actorId);
      toast.success("Imóvel georreferenciado.");
      onDone?.(coords.latitude, coords.longitude, coords.accuracy ?? null);
    } catch (err: any) {
      toast.error(err?.message || "Falha ao georreferenciar.");
    } finally {
      setBusy(false);
    }
  }

  function handleClick() {
    if (busy) return;
    if (hasCoords) {
      console.log("[GPS_ALREADY_EXISTS]", { propertyId });
      setConfirmOpen(true);
      return;
    }
    void runCapture();
  }

  function handleDecision(decision: "update" | "keep" | "cancel") {
    setConfirmOpen(false);
    if (decision === "update") {
      console.log("[GPS_UPDATE_ACCEPTED]", { propertyId });
      void runCapture();
    } else {
      console.log("[GPS_UPDATE_CANCELLED]", { propertyId, decision });
    }
  }

  return (
    <>
      <Button
        type="button"
        size={size}
        variant={hasCoords ? "outline" : "default"}
        onClick={handleClick}
        disabled={busy}
        className="gap-1.5"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : hasCoords ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
        ) : (
          <MapPin className="h-3.5 w-3.5" />
        )}
        {label ?? (hasCoords ? "Georreferenciado" : "Georreferenciar")}
      </Button>
      <ConfirmGpsOverwriteDialog open={confirmOpen} onDecision={handleDecision} />
    </>
  );
}
