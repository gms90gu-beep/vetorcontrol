import { Button } from "@/components/ui/button";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { Smartphone, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  className?: string;
  fullWidth?: boolean;
}

export function InstallAppButton({ className, fullWidth = true }: Props) {
  const { canInstall, installed, promptInstall } = usePwaInstall();

  if (installed) {
    return (
      <Button
        disabled
        variant="outline"
        className={`${fullWidth ? "w-full" : ""} ${className ?? ""} gap-2`}
      >
        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        Aplicativo Instalado
      </Button>
    );
  }

  if (!canInstall) return null;

  const onClick = async () => {
    const r = await promptInstall();
    if (r === "accepted") toast.success("Aplicativo instalado com sucesso.");
    else if (r === "dismissed")
      toast.info("Você pode instalar posteriormente pelo botão disponível no sistema.");
    else toast.info("Instalação não disponível neste navegador no momento.");
  };

  return (
    <Button
      onClick={onClick}
      className={`${fullWidth ? "w-full" : ""} ${className ?? ""} gap-2 bg-blue-600 hover:bg-blue-700 text-white`}
    >
      <Smartphone className="h-4 w-4" />
      📲 Instalar Aplicativo
    </Button>
  );
}

export function RunningAsAppBadge() {
  const { installed } = usePwaInstall();
  if (!installed) return null;
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 text-[10px] font-black uppercase tracking-widest border border-emerald-500/20">
      <Smartphone className="h-3 w-3" />
      📱 Executando como aplicativo
    </div>
  );
}
