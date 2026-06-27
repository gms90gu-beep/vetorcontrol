import { createFileRoute, redirect } from "@tanstack/react-router";
import { MunicipalIntelligence } from "@/components/coordination/MunicipalIntelligence";
import { supabase } from "@/integrations/supabase/client";
import { getCachedUserRole } from "@/lib/offline/role-cache";

export const Route = createFileRoute("/_authenticated/coordenacao")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login" });

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/login" });

    const role = await getCachedUserRole(userData.user.id);
    if (!["coordenador", "admin_master"].includes(role || "")) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: CoordinatorPage,
});

function CoordinatorPage() {
  return (
    <div className="w-full h-full pb-20">
      <MunicipalIntelligence />
    </div>
  );
}
