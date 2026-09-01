import { createFileRoute, redirect } from "@tanstack/react-router";
import { safeGetUser } from "@/lib/offline/safe-auth";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { OfflineNotAvailable } from "@/components/OfflineNotAvailable";
import { SupervisionDashboard } from "@/components/supervision/SupervisionDashboard";
import { OperationalDashboard } from "@/components/supervision/OperationalDashboard";
import { AgentProductionRanking } from "@/components/supervision/AgentProductionRanking";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { getCachedUserRole } from "@/lib/offline/role-cache";

type SupervisionTab = "equipe" | "operacional" | "producao";

export const Route = createFileRoute("/_authenticated/supervision")({
  validateSearch: (search: Record<string, unknown>): { tab?: SupervisionTab } => {
    const tab = String(search?.tab ?? "");
    return tab === "operacional" || tab === "producao" || tab === "equipe"
      ? { tab: tab as SupervisionTab }
      : {};
  },
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login" });
    const { data: userData } = await safeGetUser();
    if (!userData.user) throw redirect({ to: "/login" });
    const role = await getCachedUserRole(userData.user.id);
    if (!role || !["supervisor", "coordenador", "admin_master"].includes(role)) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: SupervisionPage,
});

function SupervisionPage() {
  const { online } = useSyncStatus();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const activeTab: SupervisionTab = tab ?? "equipe";

  // ⛔ Bloquear acesso offline: Supervision requer conexão
  if (!online) {
    return <OfflineNotAvailable feature="Dashboard de Supervisão" />;
  }
  return (
    <div className="w-full h-full pb-20">
      <Tabs
        value={activeTab}
        onValueChange={(v) => navigate({ search: { tab: v as SupervisionTab }, replace: true })}
        className="w-full"
      >
        <div className="px-4 pt-4 bg-[#0b1520]">
          <TabsList className="grid grid-cols-3 w-full bg-white/5 border border-white/10">
            <TabsTrigger value="equipe" className="text-xs data-[state=active]:bg-white data-[state=active]:text-slate-900 text-white/70">
              Equipe
            </TabsTrigger>
            <TabsTrigger value="operacional" className="text-xs data-[state=active]:bg-white data-[state=active]:text-slate-900 text-white/70">
              Operacional
            </TabsTrigger>
            <TabsTrigger value="producao" className="text-xs data-[state=active]:bg-white data-[state=active]:text-slate-900 text-white/70">
              Produção (DWR)
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="equipe" className="mt-0">
          <SupervisionDashboard />
        </TabsContent>
        <TabsContent value="operacional" className="mt-0 px-4 py-5 bg-[#f4f5f7] min-h-screen">
          <OperationalDashboard />
        </TabsContent>
        <TabsContent value="producao" className="mt-0 px-4 py-5 bg-[#f4f5f7] min-h-screen">
          <AgentProductionRanking />
        </TabsContent>
      </Tabs>
    </div>
  );
}
