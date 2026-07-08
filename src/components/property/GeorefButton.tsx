import { useState } from "react";
import { MapPin, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { georeferenceProperty } from "@/lib/geolocation";

interface Props {
  propertyId: string;
  actorId: string | null;
  hasCoords: boolean;
  size?: "sm" | "default" | "icon";
  onDone?: (lat: number, lng: number) => void;
  label?: string;
}

/**
 * Botão único de georreferenciamento.
 * Reutilizável em RG, Jornada e Primeira Visita.
 * Não cria visita, não altera status.
 */
export function GeorefButton({ propertyId, actorId, hasCoords, size = "sm", onDone, label }: Props) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (busy) return;
    if (hasCoords && !window.confirm("Substituir a localização registrada deste imóvel?")) return;
    setBusy(true);
    try {
      const coords = await georeferenceProperty(propertyId, actorId);
      toast.success("Imóvel georreferenciado.");
      onDone?.(coords.latitude, coords.longitude);
    } catch (err: any) {
      toast.error(err?.message || "Falha ao georreferenciar.");
    } finally {
      setBusy(false);
    }
  }

  return (
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
  );
}
