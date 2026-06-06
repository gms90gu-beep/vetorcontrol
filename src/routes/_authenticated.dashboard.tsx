import { createFileRoute } from "@tanstack/react-router";
import { createFileRoute as _, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  LogOut,
  PlayCircle,
  CalendarCheck,
  MapPin,
  BarChart3,
  AlertTriangle,
  History,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AgentDashboard } from "@/components/agent/AgentDashboard";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { role, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f5f7]">
        <p className="text-sm text-slate-400">Carregando...</p>
      </div>
    );
  }

  // Managers vão para os painéis específicos
  if (role === "supervisor") {
    if (typeof window !== "undefined") window.location.replace("/supervision");
    return null;
  }
  if (role === "coordenador" || role === "admin_master") {
    if (typeof window !== "undefined") window.location.replace("/coordenacao");
    return null;
  }

  // Agente (default)
  return <AgentDashboard />;
}
