import { createFileRoute } from "@tanstack/react-router";
import { ReportsDashboard } from "@/components/reports/ReportsDashboard";
import { useOrientation } from "@/hooks/useOrientation";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/reports")({
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
