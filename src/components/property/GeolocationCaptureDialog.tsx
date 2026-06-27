import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MapPin, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { requestCurrentPosition, savePropertyLocation } from "@/lib/geolocation";
import { resolveAndApplyStreet, ENABLE_AUTO_STREET } from "@/lib/auto-street";

interface Props {
  open: boolean;
  propertyId: string;
  actorId: string | null;
  propertyLabel?: string;
  onClose: (saved: boolean) => void;
}

export function GeolocationCaptureDialog({
  open,
  propertyId,
  actorId,
  propertyLabel,
  onClose,
}: Props) {
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      const coords = await requestCurrentPosition();
      await savePropertyLocation(propertyId, coords, actorId);
      toast.success("✓ Localização do imóvel registrada com sucesso.");
      onClose(true);
    } catch (err: any) {
      const code = err?.code;
      if (code === 1) toast.error("Permissão de localização negada pelo dispositivo.");
      else if (code === 2) toast.error("Localização indisponível no momento.");
      else if (code === 3) toast.error("Tempo esgotado ao obter a localização.");
      else toast.error(err?.message || "Não foi possível obter a localização.");
      onClose(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !loading && onClose(false)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-rose-500" />
            Registrar localização do imóvel
          </DialogTitle>
          <DialogDescription className="pt-2 space-y-2">
            <span className="block">
              {propertyLabel ? <strong>{propertyLabel}</strong> : "Este imóvel"} ainda não possui
              localização cadastrada.
            </span>
            <span className="block">
              Deseja utilizar sua localização atual como localização oficial deste imóvel?
            </span>
            <span className="block text-xs text-muted-foreground pt-2">
              A captura é feita apenas uma vez. Após registrada, as visitas seguintes utilizam as
              mesmas coordenadas. Não há rastreamento do agente.
            </span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onClose(false)} disabled={loading}>
            NÃO
          </Button>
          <Button onClick={handleConfirm} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Obtendo GPS...
              </>
            ) : (
              "SIM"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
