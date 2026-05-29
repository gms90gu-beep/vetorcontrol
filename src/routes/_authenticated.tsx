import { createFileRoute, Outlet, Link, useRouter, useLocation, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  LayoutDashboard, 
  Map as MapIcon, 
  FileText, 
  Settings, 
  LogOut,
  RefreshCw,
  ChevronLeft,
  Layers,
  AlertTriangle,
  MapPin,
  Home,
  CheckSquare,
  Car,
  ShieldCheck
} from "lucide-react";
import { OperationalHeader } from "@/components/OperationalHeader";
import { useOperationalDate } from "@/hooks/useOperationalDate";
import { Button } from "@/components/ui/button";
import { 
  Sidebar, 
  SidebarContent, 
  SidebarFooter, 
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarTrigger
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { useOrientation } from "@/hooks/useOrientation";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw redirect({
        to: "/login",
        search: {
          redirect: location.href,
        },
      });
    }
    return { session };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const router = useRouter();
  const location = useLocation();
  const [user, setUser] = useState<any>(null);
  const isLandscape = useOrientation();
  const { isOperational, isLoading: isOperationalLoading, userRole } = useOperationalDate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user);
      }
    });
  }, []);


  if (!user || isOperationalLoading) return null;

  // System is now always operational
  // Removed weekend block validation

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background overflow-hidden relative">
        {!isLandscape && <AppSidebar onLogout={handleLogout} />}
        <main className="flex-1 flex flex-col min-w-0">
          {!isLandscape && <OperationalHeader />}
          <div className={cn(
            "flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 pb-32 md:pb-8",
            isLandscape && "p-2 md:p-4 pb-4"
          )}>
            <Outlet />
          </div>
          {!isLandscape && !location.pathname.startsWith('/property/') && <BottomNav />}
        </main>
      </div>
    </SidebarProvider>
  );
}

function BottomNav() {
  const isMobile = useIsMobile();
  const { userRole } = useOperationalDate();
  if (!isMobile) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-t border-accent/50 px-4 py-2 flex items-center justify-between pb-[env(safe-area-inset-bottom,1.5rem)]">
      <NavItem to="/dashboard" icon={LayoutDashboard} label="Início" />
      <NavItem to="/field-work" icon={CheckSquare} label="Trabalho" />
      <NavItem to="/rg" icon={MapPin} label="RG" />
      { (userRole === "supervisor" || userRole === "admin_master" || userRole === "coordenador") ? (
        <NavItem to="/supervision" icon={LayoutDashboard} label="Superv." />
      ) : (
        <NavItem to="/map" icon={MapIcon} label="Mapa" />
      )}
      <NavItem to="/reports" icon={FileText} label="Relat." />
      <NavItem to="/settings" icon={Settings} label="Ajustes" />
    </div>
  );
}

function NavItem({ to, icon: Icon, label }: any) {
  return (
    <Link 
      to={to} 
      className="flex flex-col items-center gap-1 text-muted-foreground transition-all active:scale-90"
      activeProps={{ className: "text-primary" }}
    >
      <Icon className="h-6 w-6" />
      <span className="text-[10px] font-bold uppercase tracking-tight">{label}</span>
    </Link>
  );
}

function AppSidebar({ onLogout }: { onLogout: () => void }) {
  const isMobile = useIsMobile();
  const { userRole } = useOperationalDate();

  const navItems = [
    { label: "Dashboard", icon: LayoutDashboard, to: "/dashboard" },
    { label: "Veículos", icon: Car, to: "/vehicles" },
    { label: "Ciclos", icon: Layers, to: "/cycles" },
    { label: "Trabalho", icon: MapIcon, to: "/field-work" },
    { label: "RG", icon: MapPin, to: "/rg" },
    { label: "Pendências", icon: AlertTriangle, to: "/pending" },
    { label: "Mapa", icon: MapIcon, to: "/map" },
    { label: "Relatórios", icon: FileText, to: "/reports" },
  ];

  if (userRole === "supervisor" || userRole === "admin_master" || userRole === "coordenador") {
    navItems.push({ label: "Supervisão", icon: LayoutDashboard, to: "/supervision" as any });
  }

  if (userRole === "admin_master") {
    navItems.push({ label: "Admin Master", icon: ShieldCheck, to: "/admin-master" as any });
  }

  navItems.push({ label: "Configurações", icon: Settings, to: "/settings" });

  return (
    <Sidebar variant="inset" collapsible={isMobile ? "offcanvas" : "icon"}>
      <SidebarHeader className="h-16 flex items-center px-4 border-b">
        <div className="flex items-center gap-2 font-bold text-primary">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/30">
            V
          </div>
          <span className="group-data-[collapsible=icon]:hidden">VetorControl</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu className="px-2 py-4 gap-2">
          {navItems.map((item) => (
            <SidebarMenuItem key={item.to}>
              <SidebarMenuButton asChild tooltip={item.label}>
                <Link 
                  to={item.to as any} 
                  className="flex items-center gap-3 px-3 py-2 rounded-xl transition-all hover:bg-accent active:scale-95"
                  activeProps={{ className: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20" }}
                >
                  <item.icon className="h-5 w-5" />
                  <span className="font-medium group-data-[collapsible=icon]:hidden">{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="border-t p-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton 
              onClick={onLogout}
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-destructive hover:bg-destructive/10 active:scale-95 w-full"
            >
              <LogOut className="h-5 w-5" />
              <span className="font-medium group-data-[collapsible=icon]:hidden">Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
