import * as React from "react";
import { cn } from "@/lib/utils";

export type StatusTone =
  | "neutral" | "primary" | "success" | "warning" | "danger" | "info" | "outline";

const toneStyles: Record<StatusTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-primary/10 text-primary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning-foreground",
  danger:  "bg-danger-soft text-danger",
  info:    "bg-info-soft text-info",
  outline: "border border-border-strong text-foreground",
};

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
  dot?: boolean;
}

export const StatusBadge = React.memo(function StatusBadge({
  tone = "neutral",
  dot,
  className,
  children,
  ...rest
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none",
        toneStyles[tone],
        className,
      )}
      {...rest}
    >
      {dot && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />}
      {children}
    </span>
  );
});
