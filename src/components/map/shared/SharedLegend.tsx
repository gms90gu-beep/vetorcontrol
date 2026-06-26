import { MARKER_COLORS } from "./providers";
import { cn } from "@/lib/utils";

export type LegendEntry = { color: string; label: string };

export const DEFAULT_LEGEND: LegendEntry[] = [
  { color: MARKER_COLORS.clean, label: "Sem foco" },
  { color: MARKER_COLORS.focus, label: "Foco positivo" },
  { color: MARKER_COLORS.pendency, label: "Pendência" },
  { color: MARKER_COLORS.strategic, label: "Ponto estratégico" },
  { color: MARKER_COLORS.case, label: "Caso confirmado" },
];

export function SharedLegend({
  entries = DEFAULT_LEGEND,
  className,
  trailing,
}: {
  entries?: LegendEntry[];
  className?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-center gap-4 text-[11px] font-bold text-slate-600 flex-wrap", className)}>
      {entries.map((e) => (
        <span key={e.label} className="inline-flex items-center">
          <span
            className="inline-block w-3 h-3 rounded-full mr-1 align-middle"
            style={{ background: e.color }}
            aria-hidden
          />
          {e.label}
        </span>
      ))}
      {trailing && <span className="ml-auto text-slate-500 font-normal">{trailing}</span>}
    </div>
  );
}
