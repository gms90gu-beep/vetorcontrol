import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Floating panel used over the map. Glass surface, soft elevation,
 * consistent radius and padding so every overlay matches.
 */
export interface MapPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "inline";
  width?: string;
}

export const MapPanel = React.forwardRef<HTMLDivElement, MapPanelProps>(function MapPanel(
  { position = "inline", width, className, style, ...rest },
  ref,
) {
  const pos =
    position === "top-left" ? "top-3 left-3" :
    position === "top-right" ? "top-3 right-3" :
    position === "bottom-left" ? "bottom-3 left-3" :
    position === "bottom-right" ? "bottom-3 right-3" : "";
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-2xl border border-white/40 bg-white/85 p-3 shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-white/5",
        position !== "inline" && `absolute z-[var(--z-overlay)] ${pos}`,
        className,
      )}
      style={{ width, ...style }}
      {...rest}
    />
  );
});

export interface MapLegendItem {
  label: string;
  color: string;
  count?: number;
}

export function MapLegend({ items, title = "Legenda" }: { items: MapLegendItem[]; title?: string }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <ul className="space-y-1.5">
        {items.map((it) => (
          <li key={it.label} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-full ring-2 ring-background"
                style={{ backgroundColor: it.color }}
              />
              <span className="text-foreground">{it.label}</span>
            </span>
            {it.count != null && (
              <span className="tabular-nums text-muted-foreground">{it.count}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
