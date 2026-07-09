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
import { MapPin, Loader2, Signal, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { requestCurrentPosition, savePropertyLocation, type Coords } from "@/lib/geolocation";

interface Props {
  open: boolean;
  propertyId: string;
  actorId: string | null;
  propertyLabel?: string;
  /** Callback recebe coords para que a tela decida sugerir o logradouro do quarteirão. */
  onClose: (saved: boolean, coords?: Coords) => void;
}

const ACCURACY_LIMIT_M = 25;

export function GeolocationCaptureDialog({
  open,
  propertyId,
  actorId,
  propertyLabel,
  onClose,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<Coords | null>(null);

  async function capture() {
    setLoading(true);
    try {
      const coords = await requestCurrentPosition();
      const acc = Math.round(coords.accuracy ?? 0);
      console.log("[GPS_PRECISION]", {
        accuracy: acc,
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
      if (acc > ACCURACY_LIMIT_M) {
        console.log("[GPS_LOW_PRECISION]", {
          accuracy: acc,
          limit: ACCURACY_LIMIT_M,
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
      }
      setPending(coords);
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

  async function persist(coords: Coords) {
    setLoading(true);
    try {
      await savePropertyLocation(propertyId, coords, actorId);
      toast.success("✓ Localização do imóvel registrada com sucesso.");
      setPending(null);
      onClose(true, coords);
    } catch (err: any) {
      toast.error(err?.message || "Falha ao salvar a localização.");
      onClose(false);
    } finally {
      setLoading(false);
    }
  }

  function handleCloseRequest() {
    if (loading) return;
    setPending(null);
    onClose(false);
  }

  const acc = pending?.accuracy != null ? Math.round(pending.accuracy) : null;
  const lowPrecision = acc != null && acc > ACCURACY_LIMIT_M;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleCloseRequest()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-rose-500" />
            Registrar localização do imóvel
          </DialogTitle>
          {!pending && (
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
          )}
        </DialogHeader>

        {pending && (
          <div className="space-y-3 py-2">
            <div
              className={`flex items-center gap-3 rounded-xl border p-3 ${
                lowPrecision
                  ? "border-amber-300 bg-amber-50 text-amber-900"
                  : "border-emerald-200 bg-emerald-50 text-emerald-900"
              }`}
            >
              {lowPrecision ? (
                <AlertTriangle className="h-5 w-5" />
              ) : (
                <Signal className="h-5 w-5" />
              )}
              <div className="text-sm">
                <div className="font-semibold">Precisão</div>
                <div>{acc} metros</div>
              </div>
            </div>
            {lowPrecision && (
              <p className="text-sm text-amber-800">
                Precisão baixa. Deseja capturar novamente?
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {!pending ? (
            <>
              <Button variant="outline" onClick={handleCloseRequest} disabled={loading}>
                NÃO
              </Button>
              <Button onClick={capture} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Obtendo GPS...
                  </>
                ) : (
                  "SIM"
                )}
              </Button>
            </>
          ) : lowPrecision ? (
            <>
              <Button variant="outline" onClick={capture} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Capturando...
                  </>
                ) : (
                  "Capturar Novamente"
                )}
              </Button>
              <Button onClick={() => persist(pending)} disabled={loading}>
                Continuar Assim Mesmo
              </Button>
            </>
          ) : (
            <Button onClick={() => persist(pending)} disabled={loading} className="w-full">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...
                </>
              ) : (
                "Confirmar localização"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
