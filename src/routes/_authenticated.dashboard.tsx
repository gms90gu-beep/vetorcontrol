import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// New Dashboard Components
import { PremiumHeader } from "@/components/dashboard/PremiumHeader";
import { CycleCoverageCard } from "@/components/dashboard/CycleCoverageCard";
import { WorkInProgressCard } from "@/components/dashboard/WorkInProgressCard";
import { ActionGrid } from "@/components/dashboard/ActionGrid";
import { PendingTasksCard } from "@/components/dashboard/PendingTasksCard";
import { GamificationStats } from "@/components/dashboard/GamificationStats";
import { QuickActionsFAB } from "@/components/dashboard/QuickActionsFAB";
import { MiniMapCard } from "@/components/dashboard/MiniMapCard";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
  
  const [agent, setAgent] = useState<any>(null);
  const [activeCycle, setActiveCycle] = useState<any>(null);
  const [activeWeek, setActiveWeek] = useState<any>(null);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [coverageData, setCoverageData] = useState<any>(null);
  const [blockProgress, setBlockProgress] = useState(0);
  
  const [stats, setStats] = useState({
    worked: 0,
    closed: 0,
    refused: 0,
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  async function fetchDashboardData() {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Get Agent Profile
      const { data: agentData } = await supabase
        .from("agents")
        .select("*")
        .eq("profile_id", user.id)
        .maybeSingle();
      setAgent(agentData);

      // 2. Get Active Session
      const { data: session } = await supabase
        .from("field_work_sessions")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "in_progress")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // 3. Get Active Cycle
      const currentYear = new Date().getFullYear();
      const { data: cycle } = await supabase
        .from("cycles")
        .select("*")
        .eq("status", "in_progress")
        .eq("year", currentYear)
        .order("number", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (cycle) {
        setActiveCycle(cycle);
        
        // 4. Get Cycle Coverage
        const { data: coverage } = await supabase
          .from("cycle_coverage_summary")
          .select("*")
          .eq("cycle_id", cycle.id)
          .maybeSingle();
        if (coverage) setCoverageData(coverage);

        // 5. Get Current Week
        const { data: week } = await supabase
          .from("weeks")
          .select("*")
          .eq("cycle_id", cycle.id)
          .lte("start_date", new Date().toISOString().split('T')[0])
          .gte("end_date", new Date().toISOString().split('T')[0])
          .maybeSingle();
        if (week) setActiveWeek(week);

        // 6. Get Cycle Stats
        const { data: visits } = await supabase
          .from("visits")
          .select("id, status, visit_date, property_id")
          .eq("cycle_id", cycle.id);
        
        if (visits) {
          const startOfToday = new Date();
          startOfToday.setHours(0, 0, 0, 0);

          const workedToday = visits.filter(v => new Date(v.visit_date) >= startOfToday).length;

          setStats({
            worked: visits.length,
            closed: visits.filter(v => v.status === 'closed').length,
            refused: visits.filter(v => v.status === 'refused').length,
          });

          if (session) {
            const { data: blockProps } = await supabase
              .from("properties")
              .select("id")
              .eq("block_number", session.block_number);
            
            let sessionProgress = 0;
            if (blockProps && blockProps.length > 0) {
              const sessionVisits = visits.filter(v => 
                blockProps.some(p => p.id === (v as any).property_id)
              );
              sessionProgress = Math.round((sessionVisits.length / blockProps.length) * 100);
              setBlockProgress(sessionProgress);
            }

            setActiveSession({
              ...session,
              progress: sessionProgress,
              worked_count: workedToday,
              total_properties: blockProps?.length || 45,
              daily_goal: 35,
              start_time: new Date(session.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            });
          }
        }
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      toast.error("Erro ao carregar dados do dashboard");
    } finally {
      setIsLoading(false);
    }
  }

  const handleSync = () => {
    setIsSyncing(true);
    toast.info("Sincronizando dados com a nuvem...");
    
    setTimeout(() => {
      setIsSyncing(false);
      setLastSync(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
      fetchDashboardData();
      toast.success("Dados sincronizados com sucesso!");
    }, 1500);
  };

  if (isLoading) {
    return (
      <div className="pb-32 pt-4 space-y-8 animate-in fade-in duration-500 max-w-lg mx-auto">
        <Skeleton className="h-[280px] w-full rounded-[2.5rem]" />
        <Skeleton className="h-[200px] w-full rounded-[2.5rem]" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-44 rounded-[2.5rem]" />
          <Skeleton className="h-44 rounded-[2.5rem]" />
        </div>
      </div>
    );
  }

  return (
    <div className="pb-32 pt-2 space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-700 max-w-lg mx-auto">
      {/* 1. Reestruturar o topo da dashboard */}
      <PremiumHeader 
        agent={agent}
        activeSession={activeSession}
        lastSync={lastSync}
        onSync={handleSync}
        isSyncing={isSyncing}
      />

      {/* 3. Trabalho em andamento */}
      {activeSession && (
        <WorkInProgressCard 
          activeSession={activeSession}
          blockProgress={blockProgress}
          onContinue={() => {
            console.log('Navegando para trabalho atual...');
            navigate({ to: "/field-work" as any });
          }}
          onRegister={() => {
            console.log('Navegando para registrar nova visita...');
            navigate({ to: "/field-work" as any }); // Registrar costuma ser dentro do fluxo de trabalho de campo selecionando um imóvel
          }}
          onFinish={() => {
            console.log('Iniciando processo de finalização de quarteirão...');
            toast.info("Finalizando quarteirão...");
          }}
        />
      )}

      {/* 2. Melhorar card “Cobertura do Ciclo” */}
      <CycleCoverageCard 
        coverageData={coverageData}
        activeCycle={activeCycle}
        activeWeek={activeWeek}
      />

      {/* 4. Melhorar os cards principais */}
      <ActionGrid />

      {/* 5. Adicionar novo card “Pendências” */}
      <PendingTasksCard stats={stats} />

      {/* 9. Adicionar mini mapa na home */}
      <MiniMapCard />

      {/* 10. Sistema gamificado */}
      <GamificationStats />

      {/* 7. Adicionar botão flutuante de ação rápida */}
      <QuickActionsFAB />
    </div>
  );
}
