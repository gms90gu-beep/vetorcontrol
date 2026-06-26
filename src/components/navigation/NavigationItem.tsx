import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import type { NavItem } from "./navigation-config";
import { NavigationBadge } from "./NavigationBadge";

type Mode = "drawer" | "bottom" | "sidebar";

export function NavigationItem({
  item,
  mode,
  badge = 0,
  onNavigate,
}: {
  item: NavItem;
  mode: Mode;
  badge?: number;
  onNavigate?: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = pathname === item.to;
  const Icon = item.icon;
  const aria = item.ariaLabel ?? item.label;

  if (mode === "bottom") {
    return (
      <Link
        to={item.to as any}
        aria-label={aria}
        aria-current={isActive ? "page" : undefined}
        onClick={onNavigate}
        className={cn(
          "relative flex flex-col items-center justify-center gap-1 min-h-[44px] min-w-[44px] flex-1 px-1",
          "transition-all duration-200 ease-out active:scale-90",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 rounded-lg",
          isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <span
          className={cn(
            "absolute -top-2 h-1 w-8 rounded-full transition-all duration-300 ease-out",
            isActive ? "bg-primary opacity-100 scale-100" : "bg-transparent opacity-0 scale-50",
          )}
          aria-hidden
        />
        <span className="relative">
          <Icon
            className={cn("h-6 w-6 transition-transform duration-200", isActive && "scale-110")}
            aria-hidden
          />
          {badge > 0 && (
            <NavigationBadge value={badge} className="absolute -top-1.5 -right-2" />
          )}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-tight">{item.label}</span>
      </Link>
    );
  }

  if (mode === "drawer") {
    return (
      <Link
        to={item.to as any}
        onClick={onNavigate}
        aria-label={aria}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "group flex items-center gap-3 rounded-xl px-3 py-3 min-h-[44px]",
          "text-sm font-semibold transition-all duration-200 ease-out active:scale-[0.98]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          isActive
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-foreground hover:bg-accent",
        )}
      >
        <Icon
          className={cn(
            "h-5 w-5 shrink-0 transition-transform duration-200 group-hover:scale-110",
            isActive ? "text-primary-foreground" : "text-primary",
          )}
          aria-hidden
        />
        <span className="flex-1 truncate text-left">{item.label}</span>
        {badge > 0 && <NavigationBadge value={badge} />}
      </Link>
    );
  }

  // sidebar
  return (
    <Link
      to={item.to as any}
      aria-label={aria}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 active:scale-95",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        isActive
          ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20"
          : "hover:bg-accent text-foreground",
      )}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden />
      <span className="font-medium truncate group-data-[collapsible=icon]:hidden flex-1">
        {item.label}
      </span>
      {badge > 0 && (
        <NavigationBadge value={badge} className="group-data-[collapsible=icon]:hidden" />
      )}
    </Link>
  );
}
