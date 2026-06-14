import { createFileRoute, redirect } from "@tanstack/react-router";
import { SupervisionDashboard } from "@/components/supervision/SupervisionDashboard";
import { OperationalDashboard } from "@/components/supervision/OperationalDashboard";
import { AgentProductionRanking } from "@/components/supervision/AgentProductionRanking";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/supervision")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login" });
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/login" });
    const { data: role } = await supabase.rpc("get_user_role", { u_id: userData.user.id });
    if (!role || !["supervisor", "coordenador", "admin_master"].includes(role)) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: SupervisionPage,
});

function SupervisionPage() {
  return (
    <div className="w-full h-full pb-20">
      <Tabs defaultValue="equipe" className="w-full">
        <div className="px-4 pt-4 bg-[#0b1520]">
          <TabsList className="grid grid-cols-2 w-full bg-white/5 border border-white/10">
            <TabsTrigger value="equipe" className="text-xs data-[state=active]:bg-white data-[state=active]:text-slate-900 text-white/70">
              Equipe
            </TabsTrigger>
            <TabsTrigger value="operacional" className="text-xs data-[state=active]:bg-white data-[state=active]:text-slate-900 text-white/70">
              Dashboard Operacional
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="equipe" className="mt-0">
          <SupervisionDashboard />
        </TabsContent>
        <TabsContent value="operacional" className="mt-0 px-4 py-5 bg-[#f4f5f7] min-h-screen">
          <OperationalDashboard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
