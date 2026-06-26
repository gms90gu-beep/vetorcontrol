import * as React from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

export type KPITone = "default" | "primary" | "success" | "warning" | "danger" | "info";

const toneStyles: Record<KPITone, { ring: string; icon: string; accent: string }> = {
  default: { ring: "border-border-subtle", icon: "bg-muted text-muted-foreground", accent: "text-foreground" },
  primary: { ring: "border-primary/20", icon: "bg-primary/10 text-primary", accent: "text-primary" },
  success: { ring: "border-success/20", icon: "bg-success-soft text-success", accent: "text-success" },
  warning: { ring: "border-warning/30", icon: "bg-warning-soft text-warning-foreground", accent: "text-warning-foreground" },
  danger:  { ring: "border-danger/25",  icon: "bg-danger-soft text-danger", accent: "text-danger" },
  info:    { ring: "border-info/20",    icon: "bg-info-soft text-info", accent: "text-info" },
};

export interface KPICardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  value: React.ReactNode;
  icon?: React.ReactNode;
  delta?: number | null;
  deltaLabel?: string;
  tone?: KPITone;
  hint?: React.ReactNode;
  loading?: boolean;
  interactive?: boolean;
  active?: boolean;
}

export const KPICard = React.memo(function KPICard({
  title,
  value,
  icon,
  delta,
  deltaLabel,
  tone = "default",
  hint,
  loading,
  interactive,
  active,
  className,
  ...rest
}: KPICardProps) {
  const styles = toneStyles[tone];
  const DeltaIcon = delta == null ? Minus : delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  const deltaTone =
    delta == null ? "text-muted-foreground" : delta > 0 ? "text-success" : delta < 0 ? "text-danger" : "text-muted-foreground";

  const card = (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-pressed={interactive ? active : undefined}
      className={cn(
        "group relative flex min-h-[96px] flex-col justify-between gap-3 rounded-2xl border bg-card p-4 text-card-foreground shadow-xs transition",
        styles.ring,
        interactive && "cursor-pointer shadow-elevate shadow-elevate-hover focus-visible:ring-2 focus-visible:ring-ring",
        active && "ring-2 ring-primary/40 bg-primary/5",
        className,
      )}
      {...rest}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
          {loading ? (
            <Skeleton className="mt-2 h-7 w-20" />
          ) : (
            <p className={cn("mt-1 text-2xl font-semibold tracking-tight tabular-nums", styles.accent)}>
              {value}
            </p>
          )}
        </div>
        {icon && (
          <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", styles.icon)} aria-hidden>
            {icon}
          </div>
        )}
      </div>
      {(delta != null || deltaLabel || hint) && (
        <div className="flex items-center justify-between gap-2 text-xs">
          {delta != null && (
            <span className={cn("inline-flex items-center gap-1 font-medium tabular-nums", deltaTone)}>
              <DeltaIcon className="h-3.5 w-3.5" aria-hidden />
              {Math.abs(delta).toFixed(0)}%{deltaLabel ? ` ${deltaLabel}` : ""}
            </span>
          )}
          {hint && <span className="truncate text-muted-foreground">{hint}</span>}
        </div>
      )}
    </div>
  );

  if (typeof title === "string" && hint) {
    return (
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger asChild>{card}</TooltipTrigger>
          <TooltipContent>{hint}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return card;
});

export const MetricCard = KPICard;
export const StatCard = KPICard;
