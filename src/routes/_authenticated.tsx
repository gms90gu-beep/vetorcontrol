import { createFileRoute, Outlet, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  LayoutDashboard, 
  Map as MapIcon, 
  FileText, 
  Settings, 
  LogOut,
  RefreshCw,
  ChevronLeft
} from "lucide-react";
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

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        window.location.href = "/login";
      } else {
        setUser(session.user);
      }
    });
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  if (!user) return null;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background overflow-hidden">
        <AppSidebar onLogout={handleLogout} />
        <main className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background/95 backdrop-blur px-4 md:px-6 shrink-0">
            <SidebarTrigger className="md:hidden" />
            <div className="flex-1">
              <h1 className="text-lg font-semibold tracking-tight text-foreground truncate">
                VetorControl
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="text-muted-foreground transition-transform active:rotate-180 duration-500">
                <RefreshCw className="h-5 w-5" />
              </Button>
            </div>
          </header>
          <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 pb-24 md:pb-8">
            <Outlet />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}

function AppSidebar({ onLogout }: { onLogout: () => void }) {
  const isMobile = useIsMobile();

  const navItems = [
    { label: "Dashboard", icon: LayoutDashboard, to: "/dashboard" },
    { label: "Trabalho", icon: MapIcon, to: "/field-work" },
    { label: "Pendências", icon: ChevronLeft, to: "/pending" },
    { label: "Relatórios", icon: FileText, to: "/reports" },
    { label: "Configurações", icon: Settings, to: "/settings" },
  ];

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
