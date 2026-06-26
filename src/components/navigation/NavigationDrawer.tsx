import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { LogOut } from "lucide-react";
import { groupNavItems, type BadgeKey, type NavItem } from "./navigation-config";
import { NavigationSection } from "./NavigationSection";

export function NavigationDrawer({
  open,
  onOpenChange,
  items,
  badges,
  onLogout,
  userLabel,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: NavItem[];
  badges: Record<BadgeKey, number>;
  onLogout: () => void;
  userLabel?: string;
}) {
  const groups = groupNavItems(items);
  const close = () => onOpenChange(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl pb-[env(safe-area-inset-bottom,1.5rem)] max-h-[85vh] overflow-y-auto data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom duration-300"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="text-xl font-black">Menu</SheetTitle>
          {userLabel && (
            <SheetDescription className="text-xs text-muted-foreground">
              {userLabel}
            </SheetDescription>
          )}
        </SheetHeader>

        <div className="mt-5 space-y-6">
          {groups.map(({ group, items }) => (
            <NavigationSection
              key={group}
              group={group}
              items={items}
              badges={badges}
              onNavigate={close}
            />
          ))}

          <section className="space-y-2" aria-label="Conta">
            <h3 className="px-3 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              Conta
            </h3>
            <button
              type="button"
              onClick={() => {
                close();
                onLogout();
              }}
              aria-label="Sair da conta"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 min-h-[44px] text-sm font-semibold text-destructive hover:bg-destructive/10 transition-all duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
            >
              <LogOut className="h-5 w-5 shrink-0" aria-hidden />
              <span className="flex-1 text-left">Sair</span>
            </button>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
