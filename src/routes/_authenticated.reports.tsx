import { createFileRoute, redirect } from "@tanstack/react-router";
import { ReportsDashboard } from "@/components/reports/ReportsDashboard";
import { useOrientation } from "@/hooks/useOrientation";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { OfflineNotAvailable } from "@/components/OfflineNotAvailable";
import { cn } from "@/lib/utils";
import { getCachedUserRole } from "@/lib/offline/role-cache";
import { safeGetUser } from "@/lib/offline/safe-auth";

export const Route = createFileRoute("/_authenticated/reports")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data: userData } = await safeGetUser();
    if (!userData.user) throw redirect({ to: "/login" });
    const role = await getCachedUserRole(userData.user.id);
    if (!role || !["supervisor", "coordenador", "admin_master"].includes(role)) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: ReportsPage,
});

function ReportsPage() {
  const isLandscape = useOrientation();
  const { online } = useSyncStatus();

  // ⛔ Bloquear acesso offline: Relatórios requerem conexão
  if (!online) {
    return <OfflineNotAvailable feature="Relatórios" />;
  }

  return (
    <div className={cn(
      "w-full h-full animate-in fade-in duration-700",
      isLandscape ? "px-2" : "px-0"
    )}>
      <ReportsDashboard />
    </div>
  );
}
