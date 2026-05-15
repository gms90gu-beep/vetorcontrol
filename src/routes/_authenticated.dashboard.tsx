import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  Users, 
  Home, 
  MapPin, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle,
  TrendingUp,
  Calendar,
  ChevronRight,
  FileText,
  CalendarCheck,
  BarChart3,
  AlertCircle,
  RefreshCw,
  Search,
  Plus,
  Target
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function ActionCard({ title, description, icon: Icon, color, to, onClick, className }: any) {
  const content = (
    <div className={cn(
      "flex flex-col h-full p-6 rounded-[2.5rem] transition-all duration-300 active:scale-95 shadow-xl hover:shadow-2xl border-none text-white relative overflow-hidden group",
      color,
      className
    )}>
      <div className="absolute -right-4 -top-4 bg-white/10 h-24 w-24 rounded-full blur-2xl group-hover:bg-white/20 transition-all duration-500" />
      
      <div className="bg-white/20 backdrop-blur-md p-3.5 rounded-2xl w-fit mb-5 group-hover:scale-110 transition-transform duration-500">
        <Icon className="h-6 w-6" />
      </div>
      <div className="relative z-10">
        <h3 className="text-xl font-black leading-tight mb-1 tracking-tight">{title}</h3>
        <p className="text-[10px] text-white/90 font-bold uppercase tracking-wider leading-relaxed">{description}</p>
      </div>
    </div>
  );

  if (to) {
    return (
      <Link to={to} className="h-44 block">
        {content}
      </Link>
    );
  }

  return (
    <button onClick={onClick} className="h-44 text-left w-full block">
      {content}
    </button>
  );
}

function DashboardPage() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
  const [activeCycle, setActiveCycle] = useState<any>(null);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [coverageData, setCoverageData] = useState<any>(null);
  const [blockProgress, setBlockProgress] = useState(0);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  const [stats, setStats] = useState({
    worked: 0,
    visited: 0,
    closed: 0,
    refused: 0,
    eliminated: 0,
    treated: 0,
    focus: 0,
    progress: 0,
  });

  useEffect(() => {
    fetchCurrentStatus();
  }, []);

  async function fetchCurrentStatus() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Get current cycle
      const currentYearVal = new Date().getFullYear();
      setCurrentYear(currentYearVal);

      const { data: cycle } = await supabase
        .from("cycles")
        .select("*")
        .eq("status", "in_progress")
        .eq("year", currentYearVal)
        .order("number", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (cycle) {
        setActiveCycle(cycle);
        
        // 2. Get coverage for this cycle
        const { data: coverage } = await supabase
          .from("cycle_coverage_summary")
          .select("*")
          .eq("cycle_id", cycle.id)
          .maybeSingle();
        
        if (coverage) setCoverageData(coverage);

        // 3. Get visit stats for this cycle
        const { data: visits } = await supabase
          .from("visits")
          .select("id, status")
          .eq("cycle_id", cycle.id);
        
        if (visits) {
          setStats(prev => ({
            ...prev,
            worked: visits.length,
            closed: visits.filter(v => v.status === 'closed').length,
            refused: visits.filter(v => v.status === 'refused').length,
          }));
        }
      }

      // 4. Get current session
      const { data: session } = await supabase
        .from("field_work_sessions")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "in_progress")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (session) {
        setActiveSession(session);
        
        // Calculate block progress
        const { data: blockProps } = await supabase
          .from("properties")
          .select("id")
          .eq("block_number", session.block_number);
        
        if (blockProps && blockProps.length > 0 && session.cycle_id) {
          const { data: sessionVisits } = await supabase
            .from("visits")
            .select("id")
            .eq("cycle_id", session.cycle_id)
            .in("property_id", blockProps.map(p => p.id));
          
          if (sessionVisits) {
            setBlockProgress(Math.round((sessionVisits.length / blockProps.length) * 100));
          }
        }
      }
    } catch (error) {
      console.error("Error fetching status:", error);
    }
  }

  const handleSync = () => {
    setIsSyncing(true);
    toast.info("Sincronizando dados...");
    
    setTimeout(() => {
      setIsSyncing(false);
      setLastSync(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
      fetchCurrentStatus();
      toast.success("Dados sincronizados com sucesso!");
    }, 2000);
  };

  return (
    <div className="pb-8 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header Info */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-800">VetorControl</h2>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest border-slate-200 text-slate-500 py-0 h-4">
              Ano {currentYear}
            </Badge>
            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-[0.2em] font-mono">Unidade Operacional</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary" className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 border-none font-bold">
            <Calendar className="mr-1 h-3.5 w-3.5" />
            {new Date().toLocaleDateString('pt-BR')}
          </Badge>
        </div>
      </div>

      {/* Cycle Coverage Card */}
      <Card className="border-none shadow-xl bg-slate-900 text-white rounded-[2.5rem] overflow-hidden relative group">
        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-700">
          <TrendingUp className="h-32 w-32" />
        </div>
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">Cobertura do Ciclo</p>
              <CardTitle className="text-3xl font-black tracking-tighter">
                {coverageData ? `${coverageData.coverage_percentage}%` : "0%"}
              </CardTitle>
            </div>
            <div className="bg-white/10 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest backdrop-blur-md border border-white/10">
              {activeCycle ? activeCycle.name : "Nenhum Ciclo Ativo"}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Progresso Geral</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              {coverageData ? `${coverageData.worked_properties}/${coverageData.total_properties}` : "0/0"} imóveis
            </span>
          </div>
          <Progress value={coverageData?.coverage_percentage || 0} className="h-2 bg-white/10" />
        </CardContent>
      </Card>

      {/* Active Session Progress */}
      {activeSession && (
        <Card className="border-none shadow-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-primary-foreground overflow-hidden relative rounded-[2rem] animate-in slide-in-from-top-4 duration-500">
          <div className="absolute top-0 right-0 p-6 opacity-20">
            <Target className="h-20 w-20" />
          </div>
          <CardHeader className="pb-2">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/70 mb-1">Trabalho em Andamento</p>
            <CardTitle className="text-xl font-black">Quarteirão {activeSession.block_number}</CardTitle>
          </CardHeader>
          <CardContent>
             <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold opacity-90">{blockProgress}% do quarteirão</span>
              <span className="text-xs font-bold opacity-70 underline underline-offset-4 decoration-white/30">{activeSession.street_name}</span>
            </div>
            <Progress value={blockProgress} className="h-2 bg-white/20" />
          </CardContent>
        </Card>
      )}

      {/* Main Grid Actions */}
      <div className="grid grid-cols-2 gap-4">
        <ActionCard 
          title="Diário" 
          description="Iniciar jornada" 
          icon={CalendarCheck} 
          color="bg-emerald-500 shadow-emerald-200"
          to="/field-work"
        />
        <ActionCard 
          title="RG" 
          description="Cadastro de imóveis" 
          icon={MapPin} 
          color="bg-blue-500 shadow-blue-200"
          to="/rg"
        />
        <ActionCard 
          title="Boletim" 
          description="Resumo operacional" 
          icon={BarChart3} 
          color="bg-indigo-600 shadow-indigo-200"
          to="/reports"
        />
        <ActionCard 
          title="Pendências" 
          description="Recuperar visitas" 
          icon={AlertCircle} 
          color="bg-red-500 shadow-red-200"
          to="/pending"
        />
        <div className="col-span-2">
          <ActionCard 
            title="Sincronizar" 
            description={isSyncing ? "Enviando dados..." : `Sync: ${lastSync}`}
            icon={RefreshCw} 
            color="bg-slate-800 shadow-slate-200"
            onClick={handleSync}
            className={isSyncing ? "animate-spin duration-[3s]" : ""}
          />
        </div>
      </div>

      {/* Quick Summary Section */}
      <div className="pt-2">
        <div className="flex items-center justify-between mb-4 px-1">
          <h3 className="text-lg font-black text-slate-800 uppercase tracking-tighter">Produção do Ciclo</h3>
          <Button variant="ghost" size="sm" className="text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-700 p-0 h-auto">Ver Detalhes</Button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col items-center text-center">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Trabalhados</p>
            <p className="text-3xl font-black text-slate-800">{stats.worked}</p>
          </div>
          <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col items-center text-center">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Fechados</p>
            <p className="text-3xl font-black text-blue-600">{stats.closed}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
