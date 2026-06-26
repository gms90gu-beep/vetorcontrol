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
  ShieldCheck,
  Users,
  BarChart3
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
import { useAuth } from "@/hooks/useAuth";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

import { hasValidLocalSession } from "@/lib/auth";

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
  const { isOperational, isLoading: isOperationalLoading, userRole } = useOperationalDate();
  console.log("[SIDEBAR_RENDER]", { userRole, pathname: location.pathname, isMobileDevice, isLandscape, w: typeof window !== "undefined" ? window.innerWidth : null });

  useEffect(() => {
    if (!isReady) return;
    if (!user) {
      console.warn("[Protected Layout] Auth pronto sem usuário; redirecionando para login.");
      router.navigate({ to: "/login", replace: true });
    }
  }, [isReady, router, user]);


  if (!isReady || !user || isOperationalLoading) {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      console.log('[Offline Debug] isReady:', isReady, '| user:', !!user, '| isOperationalLoading:', isOperationalLoading);
      // continua renderizando
    } else {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
          <RefreshCw className="mr-3 h-5 w-5 animate-spin text-primary" />
          <span className="text-sm font-medium">Carregando sessão...</span>
        </div>
      );
    }
  }

  // System is now always operational
  // Removed weekend block validation

  const handleLogout = async () => {
    await signOut();
    window.location.href = "/login";
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background overflow-hidden relative">
        {!isLandscape && <AppSidebar onLogout={handleLogout} />}
        <main className="flex-1 flex flex-col min-w-0">
          {!isLandscape && !location.pathname.startsWith('/supervision') && location.pathname !== '/dashboard' && <OperationalHeader />}
          <div className={cn(
            "flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 pb-32 md:pb-8",
            isLandscape && "p-2 md:p-4 pb-4",
            (location.pathname.startsWith('/supervision') || location.pathname === '/dashboard') && "p-0 md:p-0 pb-32"
          )}>
            <Outlet />
          </div>
          {!isLandscape && !location.pathname.startsWith('/property/') && <BottomNav />}
        </main>
      </div>
    </SidebarProvider>
  );
}

function getShortPanelTitle(role: string | null) {
  switch (role) {
    case "admin_master":
      return "Admin";
    case "coordenador":
      return "Coord.";
    case "supervisor":
      return "Superv.";
    case "agente":
      return "Agente";
    default:
      return "Início";
  }
}

function BottomNav() {
  const isMobile = useIsMobile();
  const { userRole } = useOperationalDate();
  const [moreOpen, setMoreOpen] = useState(false);
  if (!isMobile) return null;

  const isManager = userRole === "supervisor" || userRole === "admin_master" || userRole === "coordenador";
  const homeTo = isManager ? "/supervision" : "/dashboard";

  const moreItems: Array<{ to: string; icon: any; label: string }> = [
    { to: "/cycles", icon: Layers, label: "Ciclos" },
    { to: "/pending", icon: AlertTriangle, label: "Pendências" },
    { to: "/weekly-comparison", icon: BarChart3, label: "Boletim Semanal" },
    { to: "/sync-status", icon: RefreshCw, label: "Sincronização" },
    { to: "/settings", icon: Settings, label: "Configurações" },
  ];
  if (isManager) {
    moreItems.unshift({ to: "/reports", icon: BarChart3, label: "Intel." });
  }

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-t border-accent/50 px-3 py-2 flex items-center justify-between pb-[env(safe-area-inset-bottom,1.5rem)]">
        <NavItem to={homeTo} icon={Home} label="Início" />
        {isManager ? (
          <>
            <NavItem to="/supervision" icon={Users} label="Equipe" />
            <NavItem to="/map" icon={MapIcon} label="Mapa" />
            <NavItem to="/admin/pendencias" icon={AlertTriangle} label="Pend." />
          </>
        ) : (
          <>
            <NavItem to="/field-work" icon={CheckSquare} label="Trabalho" />
            <NavItem to="/rg" icon={MapPin} label="RG" />
          </>
        )}
        <NavItem to="/relatorios" icon={FileText} label="Relat." />
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className="flex flex-col items-center gap-1 text-muted-foreground transition-all active:scale-90"
        >
          <Settings className="h-6 w-6" />
          <span className="text-[10px] font-bold uppercase tracking-tight">Mais</span>
        </button>
      </div>
      <MoreMenuSheet open={moreOpen} onOpenChange={setMoreOpen} items={moreItems} />
    </>
  );
}

function MoreMenuSheet({
  open,
  onOpenChange,
  items,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: Array<{ to: string; icon: any; label: string }>;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-[env(safe-area-inset-bottom,1.5rem)]">
        <SheetHeader>
          <SheetTitle>Mais opções</SheetTitle>
        </SheetHeader>
        <div className="grid grid-cols-2 gap-3 mt-4">
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to as any}
              onClick={() => onOpenChange(false)}
              className="flex items-center gap-3 rounded-xl border border-accent/40 bg-card/50 px-4 py-3 text-sm font-semibold text-foreground active:scale-95 transition"
            >
              <item.icon className="h-5 w-5 text-primary shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          ))}
        </div>
      </SheetContent>
    </Sheet>
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

function getPanelTitle(role: string | null) {
  switch (role) {
    case "admin_master":
      return "Painel Administrativo";
    case "coordenador":
      return "Painel do Coordenador";
    case "supervisor":
      return "Painel do Supervisor";
    case "agente":
      return "Painel do Agente";
    default:
      return "Dashboard";
  }
}

function AppSidebar({ onLogout }: { onLogout: () => void }) {
  const isMobile = useIsMobile();
  const { userRole } = useOperationalDate();
  const isManager = userRole === "supervisor" || userRole === "admin_master" || userRole === "coordenador";

  // Managers (supervisor/coordenador/admin_master) get a management-focused menu
  // without operational field actions (Trabalho, RG, Pendências, Ciclos, Veículos).
  const navItems = isManager
    ? [
        { label: getPanelTitle(userRole), icon: LayoutDashboard, to: "/supervision" },
        { label: "Equipe", icon: Users, to: "/supervision" },
        { label: "Boletim Semanal", icon: BarChart3, to: "/weekly-comparison" as any },
        { label: "Relatórios", icon: FileText, to: "/relatorios" },
        { label: "Intelligence", icon: BarChart3, to: "/reports" },
        { label: "Mapa", icon: MapIcon, to: "/map" },
      ]
    : [
        { label: getPanelTitle(userRole), icon: LayoutDashboard, to: "/dashboard" },
        { label: "Ciclos", icon: Layers, to: "/cycles" },
        { label: "Trabalho", icon: MapIcon, to: "/field-work" },
        { label: "RG", icon: MapPin, to: "/rg" },
        { label: "Pendências", icon: AlertTriangle, to: "/pending" },
        { label: "Boletim Semanal", icon: BarChart3, to: "/weekly-comparison" as any },
        { label: "Relatórios", icon: FileText, to: "/relatorios" },
      ];

  if (userRole === "admin_master") {
    navItems.push({ label: "Admin Master", icon: ShieldCheck, to: "/admin-master" as any });
    navItems.push({ label: "Painel Executivo", icon: BarChart3, to: "/admin/dashboard" as any });
    navItems.push({ label: "Auditoria", icon: ShieldCheck, to: "/admin/auditoria" as any });
    navItems.push({ label: "Auditoria de Ciclos", icon: ShieldCheck, to: "/admin/cycle-audit" as any });
    navItems.push({ label: "🔍 Auditoria de Dados", icon: ShieldCheck, to: "/admin/data-audit" as any });
  }

  if (isManager) {
    navItems.push({ label: "Pendências", icon: AlertTriangle, to: "/admin/pendencias" as any });
    navItems.push({ label: "Mapa Epidemiológico", icon: MapPin, to: "/heatmap" as any });
    navItems.push({ label: "Auditoria GPS", icon: MapPin, to: "/admin/georef-audit" as any });
  }

  navItems.push({ label: "Sincronização", icon: RefreshCw, to: "/sync-status" as any });

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
