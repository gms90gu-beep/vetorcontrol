import { createFileRoute, redirect } from "@tanstack/react-router";
import { ReportsDashboard } from "@/components/reports/ReportsDashboard";
import { useOrientation } from "@/hooks/useOrientation";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { getCachedUserRole } from "@/lib/offline/role-cache";

export const Route = createFileRoute("/_authenticated/reports")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login" });
    const role = await getCachedUserRole(session.user.id);
    if (!role || !["supervisor", "coordenador", "admin_master"].includes(role)) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: ReportsPage,
});

function ReportsPage() {
  const isLandscape = useOrientation();

  return (
    <div className={cn(
      "w-full h-full animate-in fade-in duration-700",
      isLandscape ? "px-2" : "px-0"
    )}>
      <ReportsDashboard />
    </div>
  );
}
