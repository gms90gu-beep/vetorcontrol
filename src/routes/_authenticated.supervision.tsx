import { createFileRoute, redirect } from "@tanstack/react-router";
import { SupervisionDashboard } from "@/components/supervision/SupervisionDashboard";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/supervision")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;

    console.debug("[Supervision Guard] Verificando sessão e role...");
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) console.error("[Supervision Guard] Erro ao restaurar sessão:", sessionError);
    if (!session) throw redirect({ to: "/login" });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      console.warn("[Supervision Guard] Sessão inválida ou expirada:", userError);
      throw redirect({ to: "/login" });
    }

    const { data: role, error: roleError } = await supabase.rpc("get_user_role", { u_id: userData.user.id });
    console.debug("[Supervision Guard] Role via RPC:", role);
    if (roleError) console.error("[Supervision Guard] Erro RPC:", roleError);

    if (!role || !['supervisor', 'coordenador', 'admin_master'].includes(role)) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: SupervisionPage,
});

function SupervisionPage() {
  return (
    <div className="w-full h-full pb-20">
      <SupervisionDashboard />
    </div>
  );
}