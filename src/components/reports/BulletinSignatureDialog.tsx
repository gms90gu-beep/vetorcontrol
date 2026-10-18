import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { signAndArchiveBulletin, type BulletinForSignature } from "@/lib/bulletin-archive";

export function BulletinSignatureDialog({
  bulletin,
  onClose,
}: {
  bulletin: BulletinForSignature | null;
  onClose: () => void;
}) {
  const [typedName, setTypedName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (bulletin) {
      setTypedName("");
      setAccepted(false);
      setSaving(false);
    }
  }, [bulletin]);

  const matchesName = Boolean(
    bulletin &&
    typedName.trim().replace(/\s+/g, " ") === bulletin.agentName.trim().replace(/\s+/g, " "),
  );

  async function handleSign() {
    if (!bulletin || !accepted || !matchesName || saving) return;
    setSaving(true);
    try {
      await signAndArchiveBulletin(bulletin, typedName);
      toast.success("Boletim assinado, arquivado e baixado.");
      onClose();
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível assinar e arquivar o boletim.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={Boolean(bulletin)} onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assinar e arquivar boletim</DialogTitle>
          <DialogDescription>
            A assinatura ficará vinculada à sua conta autenticada. O PDF assinado será guardado no
            arquivo da equipe.
          </DialogDescription>
        </DialogHeader>

        {bulletin && (
          <div className="space-y-4">
            <div className="rounded-xl border bg-slate-50 p-3 text-sm">
              <p className="font-semibold text-slate-900">
                {bulletin.reportType === "daily" ? "Boletim diário" : "Boletim semanal"}
              </p>
              <p className="text-slate-600">
                Período: {bulletin.periodStart} a {bulletin.periodEnd}
              </p>
              <p className="text-slate-600">
                Agente: {bulletin.agentName} · Matrícula {bulletin.registration || "—"}
              </p>
            </div>

            <label className="block space-y-1.5 text-sm font-medium">
              <span>Digite seu nome completo para confirmar</span>
              <input
                autoComplete="name"
                className="w-full rounded-lg border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-primary"
                value={typedName}
                onChange={(event) => setTypedName(event.target.value)}
                placeholder={bulletin.agentName}
              />
            </label>

            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                className="mt-1"
                type="checkbox"
                checked={accepted}
                onChange={(event) => setAccepted(event.target.checked)}
              />
              <span>Confirmo que revisei o boletim e assumo a autoria deste registro.</span>
            </label>

            <p className="text-xs text-muted-foreground">
              O sistema registra a data, o usuário, o identificador do arquivo e seu resumo SHA-256.
              Esta assinatura eletrônica registra a confirmação dentro do VetorControl; a secretaria
              deve definir se esse formato atende às regras formais do município.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSign} disabled={!matchesName || !accepted || saving}>
            {saving ? "Registrando assinatura…" : "Assinar, arquivar e baixar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
