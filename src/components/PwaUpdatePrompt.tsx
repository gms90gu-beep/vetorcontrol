import { useEffect, useState } from "react";
import {
  applyPwaUpdate,
  dismissPwaUpdate,
  getPwaUpdateState,
  subscribePwaUpdate,
} from "@/lib/pwa/update-state";
import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";

/**
 * Aviso discreto de nova versão do PWA.
 * - Sem jornada ativa: oferece "Atualizar agora" / "Depois".
 * - Com jornada ativa: avisa que a atualização será aplicada após finalizar.
 */
export function PwaUpdatePrompt() {
  const [, force] = useState(0);

  useEffect(() => subscribePwaUpdate(() => force((n) => n + 1)), []);

  const { hasUpdate, journeyActive, canApply } = getPwaUpdateState();
  if (!hasUpdate || !canApply) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 left-1/2 z-[70] w-[min(92vw,420px)] -translate-x-1/2 rounded-xl border border-border bg-background/95 p-3 shadow-lg backdrop-blur md:bottom-6"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-md bg-primary/10 p-2 text-primary">
          <Download className="h-4 w-4" />
        </div>
        <div className="flex-1 text-sm">
          <p className="font-medium text-foreground">Nova versão disponível</p>
          {journeyActive ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Será aplicada após finalizar a jornada ou ao reabrir o aplicativo.
              Seu trabalho não será interrompido.
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Correções e melhorias foram instaladas.
            </p>
          )}
          <div className="mt-2 flex justify-end gap-2">
            {!journeyActive && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8"
                onClick={() => dismissPwaUpdate()}
              >
                Depois
              </Button>
            )}
            {!journeyActive && (
              <Button
                size="sm"
                className="h-8"
                onClick={() => {
                  void applyPwaUpdate();
                }}
              >
                Atualizar agora
              </Button>
            )}
            {journeyActive && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8"
                aria-label="Fechar aviso"
                onClick={() => dismissPwaUpdate()}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
