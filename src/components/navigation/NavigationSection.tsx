import { NAV_GROUP_LABEL, type NavGroup, type NavItem, type BadgeKey } from "./navigation-config";
import { NavigationItem } from "./NavigationItem";

export function NavigationSection({
  group,
  items,
  badges,
  onNavigate,
}: {
  group: NavGroup;
  items: NavItem[];
  badges: Record<BadgeKey, number>;
  onNavigate?: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-2" aria-label={NAV_GROUP_LABEL[group]}>
      <h3 className="px-3 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
        {NAV_GROUP_LABEL[group]}
      </h3>
      <div className="flex flex-col gap-1">
        {items.map((item) => (
          <NavigationItem
            key={item.key}
            item={item}
            mode="drawer"
            badge={item.badge ? badges[item.badge] : 0}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </section>
  );
}
