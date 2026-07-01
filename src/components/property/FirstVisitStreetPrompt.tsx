import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapPin, Loader2, Compass, History, PencilLine } from "lucide-react";
import { toast } from "sonner";
import {
  type BlockStreetInfo,
  detectFromGPS,
  confirmBlockStreet,
  propagateToEmptyProperties,
  isSameStreet,
} from "@/lib/current-street";
import { requestCurrentPosition } from "@/lib/geolocation";

interface Props {
  open: boolean;
  blockId: string;
  actorId: string | null;
  info: BlockStreetInfo | null;
  coords?: { latitude: number; longitude: number } | null;
  /** Modo: pedido inicial (sem rua confirmada) vs. mudança de rua detectada. */
  mode: "first-visit" | "change-detected";
  detectedStreet?: string | null; // pré-detectada (no modo change-detected)
  onClose: (confirmedStreet: string | null) => void;
}

export function FirstVisitStreetPrompt({
  open,
  blockId,
  actorId,
  info,
  coords,
  mode,
  detectedStreet,
  onClose,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detected, setDetected] = useState<string | null>(detectedStreet ?? null);
  const [manual, setManual] = useState("");

  useEffect(() => {
    if (open) {
      setDetected(detectedStreet ?? null);
      setManual("");
    }
  }, [open, detectedStreet]);

  async function handleDetectGps() {
    console.log("[GPS_BUTTON_CLICK]", { hasCoords: !!coords, blockId });
    setDetecting(true);
    try {
      // Permissões
      try {
        const perm: any =
          (navigator as any).permissions &&
          (await (navigator as any).permissions.query({ name: "geolocation" }));
        console.log("[GPS_PERMISSION]", { state: perm?.state ?? "unknown" });
        if (perm?.state === "denied") {
          toast.error("Permissão de localização negada. Ative-a nas configurações do navegador.");
          return;
        }
      } catch (e) {
        console.log("[GPS_PERMISSION]", { state: "query_unsupported" });
      }

      // Captura coordenadas (usa as passadas ou requisita novas)
      let useCoords = coords ?? null;
      if (!useCoords) {
        try {
          useCoords = await requestCurrentPosition();
        } catch (err: any) {
          console.warn("[GPS_POSITION]", { error: err?.message, code: err?.code });
          const code = err?.code;
          if (code === 1) toast.error("Permissão de localização negada.");
          else if (code === 2) toast.error("Localização indisponível no momento.");
          else if (code === 3) toast.error("Tempo esgotado ao obter GPS.");
          else toast.error("Não foi possível obter a localização.");
          return;
        }
      }
      console.log("[GPS_POSITION]", {
        latitude: useCoords.latitude,
        longitude: useCoords.longitude,
        accuracy: (useCoords as any).accuracy ?? null,
      });

      // Reverse geocoding
      const r = await detectFromGPS(useCoords);
      if (r.street) {
        setDetected(r.street);
        setManual(r.street);
        console.log("[GPS_AUTOSTREET_FILLED]", {
          street: r.street,
          source: r.source,
          latitude: useCoords.latitude,
          longitude: useCoords.longitude,
        });
        toast.success(`Rua detectada: ${r.street}`);
      } else {
        toast.info("Não foi possível detectar a rua pelo GPS agora.");
      }
    } finally {
      setDetecting(false);
    }
  }

  async function confirm(street: string) {
    if (!street.trim()) return;
    setBusy(true);
    try {
      await confirmBlockStreet({ blockId, street, actorId });
      const n = await propagateToEmptyProperties(blockId, street);
      toast.success(
        n > 0 ? `Rua confirmada e aplicada a ${n} imóvel(is).` : "Rua confirmada.",
      );
      if (mode === "change-detected") console.log("[CURRENT_STREET_CHANGED]", street);
      onClose(street);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao confirmar a rua.");
    } finally {
      setBusy(false);
    }
  }

  const history = info?.history ?? [];
  const current = info?.currentStreet ?? null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-rose-500" />
            {mode === "change-detected"
              ? "Nova rua detectada"
              : "Logradouro do Quarteirão"}
          </DialogTitle>
          <DialogDescription>
            {mode === "change-detected" ? (
              <>
                Rua atual: <strong>{current || "—"}</strong>
                <br />
                Detectada agora: <strong>{detected}</strong>
                <br />
                Deseja alterar a Rua Atual deste quarteirão?
              </>
            ) : (
              <>Confirme a rua deste quarteirão. Os próximos imóveis herdam automaticamente.</>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {mode === "first-visit" && history.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                <History className="h-3.5 w-3.5" /> Histórico do quarteirão
              </div>
              <div className="flex flex-col gap-1">
                {history.map((s) => (
                  <Button
                    key={s}
                    variant="outline"
                    className="justify-start"
                    onClick={() => {
                      console.log("[CURRENT_STREET_HISTORY_SELECTED]", s);
                      confirm(s);
                    }}
                    disabled={busy}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </section>
          )}

          {detected && (
            <section className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                <Compass className="h-3.5 w-3.5" /> Detectado por GPS
              </div>
              <Button
                className="w-full justify-start"
                onClick={() => confirm(detected)}
                disabled={busy}
              >
                {detected}
              </Button>
            </section>
          )}

          {mode === "first-visit" && !detected && (
            <Button
              variant="secondary"
              className="w-full"
              onClick={handleDetectGps}
              disabled={detecting || busy}
            >
              {detecting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Detectando pelo GPS…
                </>
              ) : (
                <>
                  <Compass className="h-4 w-4 mr-2" /> Detectar pelo GPS
                </>
              )}
            </Button>
          )}

          {mode === "first-visit" && (
            <section className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                <PencilLine className="h-3.5 w-3.5" /> Informar manualmente
              </div>
              <div className="flex gap-2">
                <Input
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                  placeholder="Ex.: Rua José Bonifácio"
                  disabled={busy}
                />
                <Button onClick={() => confirm(manual)} disabled={busy || !manual.trim()}>
                  Usar
                </Button>
              </div>
            </section>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {mode === "change-detected" ? (
            <>
              <Button variant="outline" onClick={() => onClose(null)} disabled={busy}>
                Permanecer
              </Button>
              <Button onClick={() => detected && confirm(detected)} disabled={busy || !detected}>
                Alterar
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={() => onClose(null)} disabled={busy}>
              Agora não
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { isSameStreet };
