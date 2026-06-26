import { useState } from "react";
import { Menu } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useOperationalDate } from "@/hooks/useOperationalDate";
import { useAuth } from "@/hooks/useAuth";
import { buildNavItems } from "./navigation-config";
import { useNavBadges } from "./use-nav-badges";
import { NavigationItem } from "./NavigationItem";
import { NavigationDrawer } from "./NavigationDrawer";
import { NavigationBadge } from "./NavigationBadge";

export function BottomNavigation({ onLogout }: { onLogout: () => void }) {
  const isMobile = useIsMobile();
  const { userRole } = useOperationalDate();
  const { user } = useAuth();
  const badges = useNavBadges();
  const [open, setOpen] = useState(false);

  if (!isMobile) return null;

  const items = buildNavItems(userRole);
  const primary = items.filter((i) => i.primary).slice(0, 4);

  // Total badge count not represented by a primary item — surfaced on "Menu".
  const primaryBadgeKeys = new Set(primary.map((p) => p.badge).filter(Boolean));
  const overflowBadge =
    (primaryBadgeKeys.has("pendencias") ? 0 : badges.pendencias) +
    (primaryBadgeKeys.has("weekly") ? 0 : badges.weekly) +
    (primaryBadgeKeys.has("sync") ? 0 : badges.sync);

  return (
    <>
      <nav
        aria-label="Navegação principal"
        className="fixed bottom-0 left-0 right-0 z-50 bg-background/85 backdrop-blur-xl border-t border-border/60 px-2 pt-1 pb-[env(safe-area-inset-bottom,0.5rem)] flex items-stretch justify-between gap-1"
      >
        {primary.map((item) => (
          <NavigationItem
            key={item.key}
            item={item}
            mode="bottom"
            badge={item.badge ? badges[item.badge] : 0}
          />
        ))}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          aria-expanded={open}
          aria-haspopup="dialog"
          className="relative flex flex-col items-center justify-center gap-1 min-h-[44px] min-w-[44px] flex-1 px-1 text-muted-foreground hover:text-foreground transition-all duration-200 ease-out active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 rounded-lg"
        >
          <span className="relative">
            <Menu className="h-6 w-6" aria-hidden />
            {overflowBadge > 0 && (
              <NavigationBadge value={overflowBadge} variant="dot" className="-top-0.5 -right-0.5" />
            )}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-tight">Menu</span>
        </button>
      </nav>

      <NavigationDrawer
        open={open}
        onOpenChange={setOpen}
        items={items}
        badges={badges}
        onLogout={onLogout}
        userLabel={user?.email ?? undefined}
      />
    </>
  );
}
