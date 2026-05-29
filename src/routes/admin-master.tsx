import { createFileRoute, redirect } from "@tanstack/react-router";
import { AdminMasterDashboard } from "@/components/supervision/AdminMasterDashboard";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin-master")({
  beforeLoad: async () => {
    // Note: User can choose to add a secondary password check in the component
    // but here we check the profile role first.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login" });

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (!roleData || roleData.role !== 'admin_master') {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: AdminMasterPage,
});

function AdminMasterPage() {
  return (
    <div className="w-full min-h-screen bg-slate-950 p-6">
      <AdminMasterDashboard />
    </div>
  );
}