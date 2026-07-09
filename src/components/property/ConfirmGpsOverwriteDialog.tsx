import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MapPin } from "lucide-react";

interface Props {
  open: boolean;
  onDecision: (decision: "update" | "keep" | "cancel") => void;
}

/**
 * Dialogo de confirmação para sobrescrever GPS já existente.
 * 3 opções: Atualizar / Manter Atual / Cancelar.
 */
export function ConfirmGpsOverwriteDialog({ open, onDecision }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onDecision("cancel")}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-rose-500" />
            Localização já cadastrada
          </DialogTitle>
          <DialogDescription>
            Este imóvel já possui localização cadastrada. Deseja atualizar a localização?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2 flex-col sm:flex-row">
          <Button variant="ghost" onClick={() => onDecision("cancel")}>
            Cancelar
          </Button>
          <Button variant="outline" onClick={() => onDecision("keep")}>
            Manter Atual
          </Button>
          <Button onClick={() => onDecision("update")}>Atualizar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
