import { useEffect, useState } from "react";
import { Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { toast } from "sonner";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

const DISMISS_KEY = "pwa_install_card_dismissed_v1";

export function InstallPromoCard() {
  const { canInstall, installed, promptInstall } = usePwaInstall();
  const online = useOnlineStatus();
  const [dismissed, setDismissed] = useState<boolean>(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (installed || dismissed || !canInstall || !online) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setDismissed(true);
  };

  const install = async () => {
    const r = await promptInstall();
    if (r === "accepted") {
      toast.success("Aplicativo instalado com sucesso.");
      try {
        localStorage.setItem(DISMISS_KEY, "1");
      } catch {}
      setDismissed(true);
    } else if (r === "dismissed") {
      toast.info("Você pode instalar posteriormente pelo botão disponível no sistema.");
    }
  };

  return (
    <div className="relative bg-gradient-to-br from-blue-600 to-blue-800 text-white rounded-2xl p-4 shadow-lg shadow-blue-600/20">
      <button
        onClick={dismiss}
        aria-label="Fechar"
        className="absolute top-2 right-2 text-white/60 hover:text-white p-1"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3">
        <div className="bg-white/15 rounded-xl p-2 shrink-0">
          <Smartphone className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-black text-sm">📲 Instale o VetorControl</h3>
          <p className="text-[11px] text-white/80 mt-0.5">Use mesmo sem internet.</p>
          <ul className="text-[11px] text-white/90 mt-2 space-y-0.5">
            <li>• Mais rápido</li>
            <li>• Funciona offline</li>
            <li>• Acesso direto na tela inicial</li>
          </ul>
          <div className="flex gap-2 mt-3">
            <Button
              size="sm"
              onClick={install}
              className="bg-white text-blue-700 hover:bg-white/90 font-bold text-xs h-9"
            >
              Instalar Aplicativo
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={dismiss}
              className="text-white hover:bg-white/10 font-bold text-xs h-9"
            >
              Agora Não
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
