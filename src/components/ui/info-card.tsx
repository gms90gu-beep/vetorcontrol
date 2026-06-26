import * as React from "react";
import { cn } from "@/lib/utils";

export type InfoCardVariant = "default" | "primary" | "success" | "warning" | "danger" | "glass";

const variantStyles: Record<InfoCardVariant, string> = {
  default: "bg-card border-border-subtle",
  primary: "bg-primary/5 border-primary/20",
  success: "bg-success-soft border-success/25",
  warning: "bg-warning-soft border-warning/30",
  danger:  "bg-danger-soft border-danger/25",
  glass:   "bg-white/60 backdrop-blur-md border-white/40 dark:bg-white/5 dark:border-white/10",
};

export interface InfoCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: InfoCardVariant;
  interactive?: boolean;
}

export const InfoCard = React.forwardRef<HTMLDivElement, InfoCardProps>(function InfoCard(
  { variant = "default", interactive, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-2xl border p-4 shadow-xs transition",
        variantStyles[variant],
        interactive && "shadow-elevate shadow-elevate-hover cursor-pointer",
        className,
      )}
      {...rest}
    />
  );
});
