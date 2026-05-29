import { createFileRoute, redirect } from "@tanstack/react-router";
import { SupervisionDashboard } from "@/components/supervision/SupervisionDashboard";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/supervision")({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login" });

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (!roleData || (roleData.role !== 'supervisor' && roleData.role !== 'admin')) {
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