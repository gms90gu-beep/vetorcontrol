import { cn } from "@/lib/utils";

export function NavigationBadge({
  value,
  className,
  variant = "default",
}: {
  value: number;
  className?: string;
  variant?: "default" | "dot";
}) {
  if (!value || value <= 0) return null;

  if (variant === "dot") {
    return (
      <span
        aria-label={`${value} notificações`}
        className={cn(
          "absolute top-1 right-1 h-2 w-2 rounded-full bg-destructive ring-2 ring-background",
          className,
        )}
      />
    );
  }

  const display = value > 99 ? "99+" : String(value);
  return (
    <span
      aria-label={`${value} pendentes`}
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-destructive text-destructive-foreground",
        "text-[10px] font-bold leading-none px-1.5 min-w-[18px] h-[18px]",
        "shadow-sm",
        className,
      )}
    >
      {display}
    </span>
  );
}
