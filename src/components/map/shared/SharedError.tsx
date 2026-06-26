import { Button } from "@/components/ui/button";
import { AlertTriangle, Inbox, MapPinOff, RefreshCw, TimerReset } from "lucide-react";
import type { ReactNode } from "react";

export type SharedErrorVariant = "tile" | "data" | "no-geo" | "no-data" | "timeout";

const PRESETS: Record<SharedErrorVariant, {
  icon: ReactNode; title: string; description: string; tone: "default" | "danger";
}> = {
  tile: {
    icon: <AlertTriangle className="h-6 w-6" />,
    title: "Falha ao carregar o mapa",
    description: "Todos os provedores de mapas estão indisponíveis no momento.",
    tone: "danger",
  },
  data: {
    icon: <AlertTriangle className="h-6 w-6" />,
    title: "Não foi possível carregar os dados",
    description: "Erro ao consultar a base.",
    tone: "danger",
  },
  "no-geo": {
    icon: <MapPinOff className="h-6 w-6" />,
    title: "Sem coordenadas registradas",
    description: "Os registros encontrados não possuem coordenadas para exibir no mapa.",
    tone: "default",
  },
  "no-data": {
    icon: <Inbox className="h-6 w-6" />,
    title: "Nenhum registro encontrado",
    description: "Não há dados para exibir com os filtros atuais.",
    tone: "default",
  },
  timeout: {
    icon: <TimerReset className="h-6 w-6" />,
    title: "Tempo esgotado",
    description: "A consulta demorou demais. Tente novamente.",
    tone: "danger",
  },
};

interface Props {
  variant: SharedErrorVariant;
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  action?: ReactNode;
}

export function SharedError({ variant, title, description, onRetry, retryLabel = "Tentar novamente", action }: Props) {
  const preset = PRESETS[variant];
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-50/95 text-center px-6 animate-in fade-in duration-200">
      <div
        className={`grid h-12 w-12 place-items-center rounded-2xl ${
          preset.tone === "danger" ? "bg-red-100 text-red-600" : "bg-slate-200 text-slate-600"
        }`}
        aria-hidden
      >
        {preset.icon}
      </div>
      <p className="text-sm font-semibold text-slate-800">{title ?? preset.title}</p>
      <p className="text-xs text-slate-500 max-w-md">{description ?? preset.description}</p>
      {(action || onRetry) && (
        <div className="pt-2">
          {action ?? (
            <Button size="sm" variant="outline" onClick={onRetry}>
              <RefreshCw className="h-4 w-4 mr-2" /> {retryLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
