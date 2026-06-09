import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  User, 
  MapPin, 
  Calendar, 
  Settings, 
  LogOut, 
  Camera, 
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  ChevronDown
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { useOperationalDate } from "@/hooks/useOperationalDate";
import { useAuth } from "@/hooks/useAuth";
import { getActiveCycleForUser } from "@/lib/active-cycle";
import { Button } from "@/components/ui/button";
import { ConnectivityBadge } from "@/components/ConnectivityBadge";
import { CycleWeekBadge } from "@/components/CycleWeekBadge";

function getPanelTitle(role: string | null) {
  switch (role) {
    case "admin_master":
      return "Painel Administrativo";
    case "coordenador":
      return "Painel do Coordenador";
    case "supervisor":
      return "Painel do Supervisor";
    case "agente":
      return "Painel do Agente";
    default:
      return "Dashboard";
  }
}

export function OperationalHeader() {
  const [agent, setAgent] = useState<any>(null);
  const [activeCycle, setActiveCycle] = useState<any>(null);
  const [activeWeek, setActiveWeek] = useState<any>(null);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [todayStats, setTodayStats] = useState({ worked: 0, pending: 0, progress: 0 });
  const [workStatus, setWorkStatus] = useState<string>('available');
  const navigate = useNavigate();
  const { allowWeekend } = useOperationalDate();
  const { role } = useAuth();

  useEffect(() => {
    fetchHeaderData();
  }, []);

  const fetchHeaderData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Get agent profile
      const { data: agentData } = await supabase
        .from("agents")
        .select("*")
        .eq("profile_id", user.id)
        .maybeSingle();
      
      if (agentData) {
        setAgent(agentData);
        setWorkStatus(agentData.work_status || 'available');
      }

      // 2. Get active session
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
      }

      // 3. Get current cycle (sessão do usuário > in_progress)
      const cycle = await getActiveCycleForUser(user.id);
      
      if (cycle) {
        setActiveCycle(cycle);
        console.log(`[CICLO] OperationalHeader usando ciclo ${cycle.name || cycle.id}`);

        // 4. Get current week
        const { data: week } = await supabase
          .from("weeks")
          .select("*")
          .eq("cycle_id", cycle.id)
          .lte("start_date", new Date().toISOString().split('T')[0])
          .gte("end_date", new Date().toISOString().split('T')[0])
          .maybeSingle();
        
        if (week) setActiveWeek(week);

        // 5. Get stats for the operational date (session_date if active, else today)
        const opDateStr: string = session?.session_date
          ? session.session_date
          : new Date().toISOString().split('T')[0];
        const startOfDay = new Date(`${opDateStr}T00:00:00`);
        const endOfDay = new Date(`${opDateStr}T23:59:59.999`);

        const { data: todayVisits } = await supabase
          .from("visits")
          .select("id, status")
          .eq("agent_id", user.id)
          .eq("cycle_id", cycle.id)
          .gte("visit_date", startOfDay.toISOString())
          .lte("visit_date", endOfDay.toISOString());
        
        console.log(`[CICLO] OperationalHeader consulta visits retornou ${todayVisits?.length || 0} registros do ciclo ${cycle.name}`);

        if (todayVisits) {
          setTodayStats({
            worked: todayVisits.length,
            pending: todayVisits.filter(v => v.status === 'closed' || v.status === 'refused').length,
            progress: session?.property_count ? Math.round((todayVisits.length / session.property_count) * 100) : 0
          });
        }
      }
    } catch (error) {
      console.error("Error fetching header data:", error);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <div className="sticky top-0 z-50 w-full bg-slate-950 text-white shadow-2xl border-b border-white/5 overflow-hidden">
      {/* Upper Header: Context & User */}
      <div className="max-w-7xl mx-auto px-4 py-3 md:py-4 bg-slate-900/50 backdrop-blur-md">
        <div className="flex justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className={cn(
                  "h-2 w-2 rounded-full",
                  workStatus === 'in_work' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)] animate-pulse" : "bg-slate-500"
                )} />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-200">
                  {workStatus === 'in_work' ? "🟢 Em Trabalho" : "⚫ Expediente Encerrado"}
                </span>
              </div>
              <h1 className="text-lg font-black tracking-tight leading-none text-white">
                {agent?.name || "Agente"}
              </h1>
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-300">
                {getPanelTitle(role)}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[9px] font-bold text-slate-300 uppercase tracking-tight">{agent?.registration_id || "MATRÍCULA"}</span>
                <span className="h-1 w-1 rounded-full bg-slate-600" />
                <span className="text-[9px] font-bold text-blue-200 uppercase tracking-tight">{agent?.municipality || "Município"}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
             <div className="hidden sm:flex flex-col items-end mr-2 gap-1">
               <ConnectivityBadge />
               <CycleWeekBadge className="text-[9px] font-black text-slate-300 uppercase" />
               <span className="text-[10px] font-bold text-slate-300">{new Date().toLocaleDateString('pt-BR')}</span>
             </div>
             <div className="sm:hidden">
               <ConnectivityBadge />
             </div>
             
             <div className="flex items-center gap-1 bg-slate-800/50 p-1 rounded-full border border-white/5">
               <Button 
                 variant="ghost" 
                 size="icon" 
                 className="h-10 w-10 rounded-full text-red-400 hover:bg-red-500/10 hover:text-red-300" 
                 onClick={handleSignOut}
                 title="Sair do Sistema"
               >
                 <LogOut className="h-5 w-5" />
               </Button>

               <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="relative outline-none group active:scale-95 transition-transform">
                    <Avatar className="h-10 w-10 border-2 border-white/10 relative shadow-xl">
                      <AvatarImage src={agent?.photo_url} alt={agent?.name} className="object-cover" />
                      <AvatarFallback className="bg-slate-700 text-slate-400 font-black text-sm">
                        {agent?.name?.substring(0, 2).toUpperCase() || "AG"}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 mt-2 bg-slate-900 border-white/10 text-white p-2 rounded-2xl shadow-2xl">
                  <DropdownMenuLabel className="px-3 pt-3 pb-2 font-black text-sm uppercase tracking-tight">Menu Operacional</DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-white/5 mx-2" />
                  <DropdownMenuItem className="rounded-xl focus:bg-white/5 focus:text-white py-3 cursor-pointer" onClick={() => navigate({ to: "/settings" })}>
                    <Settings className="mr-3 h-4 w-4 text-blue-400" />
                    <span className="font-bold text-xs uppercase tracking-widest">Configurações</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="rounded-xl focus:bg-red-500/10 focus:text-red-400 text-red-400 py-3 cursor-pointer" onClick={handleSignOut}>
                    <LogOut className="mr-3 h-4 w-4" />
                    <span className="font-bold text-xs uppercase tracking-widest">Sair da Conta</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
             </div>
          </div>
        </div>
      </div>

      {/* Lower Header: Progress & Territory */}
      <div className="bg-slate-950 px-4 py-2 border-t border-white/5">
        <div className="max-w-7xl mx-auto flex flex-col gap-2">
          {activeSession ? (
            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-end">
                <div className="flex flex-col">
                  <span className="text-[8px] font-black text-slate-300 uppercase tracking-[0.2em]">Território Atual</span>
                  <span className="text-xs font-black text-blue-300 uppercase tracking-tight">
                    Quarteirão {activeSession.block_number} • {activeSession.street_name}
                  </span>
                </div>
                <span className="text-[10px] font-black text-slate-100">{todayStats.progress}%</span>
              </div>
              <Progress value={todayStats.progress} className="h-1.5 bg-slate-900" indicatorClassName="bg-blue-500" />
              <p className="text-[9px] font-bold text-slate-200">
                {Math.round((todayStats.progress / 100) * (activeSession.property_count || 45))} de {activeSession.property_count || 45} imóveis trabalhados
              </p>
            </div>
          ) : (
             <div className="flex items-center justify-center py-2">
               <span className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em]">Nenhuma sessão de trabalho ativa</span>
             </div>
          )}
        </div>
      </div>

      {/* Mini Resumo Operacional */}
      <div className="bg-slate-900/30 flex divide-x divide-white/5">
         <div className="flex-1 px-4 py-2 flex flex-col items-center justify-center">
            <span className="text-[8px] font-black text-slate-300 uppercase tracking-tighter">Trabalhados</span>
            <span className="text-sm font-black text-emerald-500">{todayStats.worked}</span>
         </div>
         <div className="flex-1 px-4 py-2 flex flex-col items-center justify-center">
            <span className="text-[8px] font-black text-slate-300 uppercase tracking-tighter">Fechados</span>
            <span className="text-sm font-black text-amber-500">{todayStats.pending}</span>
         </div>
         <div className="flex-1 px-4 py-2 flex flex-col items-center justify-center">
            <span className="text-[8px] font-black text-slate-300 uppercase tracking-tighter">Focos (+)</span>
            <span className="text-sm font-black text-red-500">0</span>
         </div>
      </div>
    </div>
  );
}
