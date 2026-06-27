import { createFileRoute, Outlet, useRouter, useLocation, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LogOut, RefreshCw } from "lucide-react";
import { OperationalHeader } from "@/components/OperationalHeader";
import { useOperationalDate } from "@/hooks/useOperationalDate";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { useOrientation } from "@/hooks/useOrientation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { hasValidLocalSession } from "@/lib/auth";
import {
  buildNavItems,
  groupNavItems,
  NAV_GROUP_LABEL,
  type NavItem,
} from "@/components/navigation/navigation-config";
import { useNavBadges } from "@/components/navigation/use-nav-badges";
import { NavigationItem } from "@/components/navigation/NavigationItem";
import { BottomNavigation } from "@/components/navigation/BottomNavigation";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const valid = await hasValidLocalSession();
    if (!valid) {
      console.warn("[Protected Guard] Sem sessão local válida, redirecionando para login.");
      throw redirect({ to: "/login" });
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const router = useRouter();
  const location = useLocation();
  const { user, isReady, signOut } = useAuth();
  const isMobileDevice = useIsMobile();
  const isLandscapeRaw = useOrientation();
  const isLandscape = isMobileDevice && isLandscapeRaw;
  const { isLoading: isOperationalLoading, userRole } = useOperationalDate();

  useEffect(() => {
    if (!isReady) return;
    if (!user) {
      console.warn("[Protected Layout] Auth pronto sem usuário; redirecionando para login.");
      router.navigate({ to: "/login", replace: true });
    }
  }, [isReady, router, user]);

  if (!isReady || !user || isOperationalLoading) {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      // continua renderizando
    } else {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
          <RefreshCw className="mr-3 h-5 w-5 animate-spin text-primary" aria-hidden />
          <span className="text-sm font-medium">Carregando sessão...</span>
        </div>
      );
    }
  }

  const handleLogout = async () => {
    await signOut();
    window.location.href = "/login";
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background overflow-hidden relative">
        {!isLandscape && <AppSidebar userRole={userRole} onLogout={handleLogout} />}
        <main className="flex-1 flex flex-col min-w-0">
          {!isLandscape && !location.pathname.startsWith("/supervision") && location.pathname !== "/dashboard" && <OperationalHeader />}
          <div
            className={cn(
              "flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 pb-32 md:pb-8",
              isLandscape && "p-2 md:p-4 pb-4",
              (location.pathname.startsWith("/supervision") || location.pathname === "/dashboard") && "p-0 md:p-0 pb-32",
            )}
          >
            <Outlet />
          </div>
          {!isLandscape && !location.pathname.startsWith("/property/") && (
            <BottomNavigation onLogout={handleLogout} />
          )}
        </main>
      </div>
    </SidebarProvider>
  );
}

function AppSidebar({ userRole, onLogout }: { userRole: string | null; onLogout: () => void }) {
  const isMobile = useIsMobile();
  const items: NavItem[] = buildNavItems(userRole);
  const badges = useNavBadges();
  const groups = groupNavItems(items);

  return (
    <Sidebar variant="inset" collapsible={isMobile ? "offcanvas" : "icon"}>
      <SidebarHeader className="h-16 flex items-center px-4 border-b">
        <div className="flex items-center gap-2 font-bold text-primary">
          <div
            aria-hidden
            className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/30"
          >
            V
          </div>
          <span className="group-data-[collapsible=icon]:hidden">VetorControl</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu className="px-2 py-4 gap-4">
          {groups.map(({ group, items }) => (
            <div key={group} className="space-y-1">
              <div className="px-3 pb-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground group-data-[collapsible=icon]:hidden">
                {NAV_GROUP_LABEL[group]}
              </div>
              {items.map((item) => (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton asChild tooltip={item.label}>
                    <NavigationItem
                      item={item}
                      mode="sidebar"
                      badge={item.badge ? badges[item.badge] : 0}
                    />
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </div>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="border-t p-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={onLogout}
              aria-label="Sair da conta"
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-destructive hover:bg-destructive/10 active:scale-95 w-full"
            >
              <LogOut className="h-5 w-5" aria-hidden />
              <span className="font-medium group-data-[collapsible=icon]:hidden">Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
