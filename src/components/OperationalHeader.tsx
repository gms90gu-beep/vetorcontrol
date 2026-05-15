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

export function OperationalHeader() {
  const [agent, setAgent] = useState<any>(null);
  const [activeCycle, setActiveCycle] = useState<any>(null);
  const [activeWeek, setActiveWeek] = useState<any>(null);
  const [todayStats, setTodayStats] = useState({ worked: 0, pending: 0, progress: 0 });
  const [workStatus, setWorkStatus] = useState<string>('available');
  const navigate = useNavigate();

  useEffect(() => {
    fetchHeaderData();
  }, []);

  async function fetchHeaderData() {
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

      // 2. Get current cycle
      const { data: cycle } = await supabase
        .from("cycles")
        .select("*")
        .eq("status", "in_progress")
        .eq("year", new Date().getFullYear())
        .limit(1)
        .maybeSingle();
      
      if (cycle) {
        setActiveCycle(cycle);

        // 3. Get current week
        const { data: week } = await supabase
          .from("weeks")
          .select("*")
          .eq("cycle_id", cycle.id)
          .lte("start_date", new Date().toISOString().split('T')[0])
          .gte("end_date", new Date().toISOString().split('T')[0])
          .maybeSingle();
        
        if (week) setActiveWeek(week);

        // 4. Get today's stats
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        
        const { data: todayVisits } = await supabase
          .from("visits")
          .select("id, status")
          .eq("cycle_id", cycle.id)
          .gte("visit_date", startOfDay.toISOString());
        
        if (todayVisits) {
          setTodayStats({
            worked: todayVisits.length,
            pending: todayVisits.filter(v => v.status === 'closed' || v.status === 'refused').length,
            progress: 78 // Mocked as requested in example
          });
        }
      }
    } catch (error) {
      console.error("Error fetching header data:", error);
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <div className="sticky top-0 z-50 w-full bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white shadow-2xl border-b border-white/5 animate-in fade-in slide-in-from-top-4 duration-500">
      <div className="max-w-7xl mx-auto px-4 py-4 md:py-6">
        <div className="flex justify-between items-start gap-4">
          {/* Left Side: Professional Info */}
          <div className="flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <div className="flex items-center gap-1.5 text-blue-400">
                <MapPin className="h-3 w-3" />
                <span className="text-[10px] font-black uppercase tracking-widest">{agent?.municipality || "São Paulo"}</span>
              </div>
              <div className="h-1 w-1 rounded-full bg-slate-600 hidden md:block" />
              <div className="flex items-center gap-1.5 text-slate-400">
                <Calendar className="h-3 w-3" />
                <span className="text-[10px] font-bold tracking-widest uppercase">{new Date().toLocaleDateString('pt-BR')}</span>
              </div>
            </div>

            <div className="space-y-0.5">
              <h1 className="text-xl md:text-2xl font-black tracking-tight leading-none group flex items-center gap-2">
                {agent?.name || "Agente"}
                <Badge variant="outline" className="text-[8px] font-black tracking-tighter border-white/10 text-slate-400 py-0 h-4 uppercase">
                  {agent?.registration_id || "ID-0000"}
                </Badge>
              </h1>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <Badge className="bg-primary/20 hover:bg-primary/30 text-primary-foreground border-none font-black text-[9px] uppercase tracking-widest h-5">
                  Ciclo {activeCycle?.number || "-"}/{activeCycle?.year || "-"}
                </Badge>
                <Badge variant="outline" className="border-white/10 text-slate-400 font-bold text-[9px] uppercase tracking-widest h-5">
                  Semana {activeWeek?.number || "-"}
                </Badge>
              </div>
            </div>

            {/* Quick Pulse Indicators */}
            <div className="flex gap-4 pt-1">
              <div className="flex flex-col">
                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Trabalhados Hoje</span>
                <span className="text-sm font-black text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> {todayStats.worked}
                </span>
              </div>
              <div className="flex flex-col border-l border-white/10 pl-4">
                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Pendências</span>
                <span className="text-sm font-black text-orange-400 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> {todayStats.pending}
                </span>
              </div>
              <div className="flex-1 flex flex-col border-l border-white/10 pl-4 max-w-[120px]">
                <div className="flex justify-between items-center mb-0.5">
                  <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Cobertura</span>
                  <span className="text-[9px] font-black text-blue-400">{todayStats.progress}%</span>
                </div>
                <Progress value={todayStats.progress} className="h-1 bg-white/5" />
              </div>
            </div>
          </div>

          {/* Right Side: Avatar & Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="relative outline-none group">
                <div className="absolute -inset-0.5 bg-gradient-to-tr from-primary to-blue-500 rounded-full blur opacity-25 group-hover:opacity-50 transition duration-500" />
                <Avatar className="h-12 w-12 md:h-14 md:w-14 border-2 border-white/10 relative shadow-xl">
                  <AvatarImage src={agent?.photo_url} alt={agent?.name} className="object-cover" />
                  <AvatarFallback className="bg-slate-700 text-slate-300 font-black text-lg">
                    {agent?.name?.substring(0, 2).toUpperCase() || "AG"}
                  </AvatarFallback>
                </Avatar>
                <div className={cn(
                  "absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-slate-900 shadow-lg flex items-center justify-center",
                  workStatus === 'in_work' ? "bg-emerald-500" : 
                  workStatus === 'work_completed' ? "bg-blue-500" : "bg-slate-500"
                )}>
                  <div className={cn(
                    "h-1.5 w-1.5 bg-white rounded-full",
                    workStatus === 'in_work' && "animate-pulse"
                  )} />
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 mt-2 bg-slate-900 border-white/10 text-white p-2 rounded-[1.5rem] shadow-2xl">
              <DropdownMenuLabel className="px-3 pt-3 pb-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-black tracking-tight">{agent?.name}</span>
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{agent?.registration_id}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-white/5 mx-2" />
              <DropdownMenuItem 
                className="rounded-xl focus:bg-white/5 focus:text-white cursor-pointer py-3"
                onClick={() => navigate({ to: "/settings" })}
              >
                <Camera className="mr-3 h-4 w-4 text-blue-400" />
                <span className="font-bold text-xs uppercase tracking-widest">Alterar Foto</span>
              </DropdownMenuItem>
              <DropdownMenuItem 
                className="rounded-xl focus:bg-white/5 focus:text-white cursor-pointer py-3"
                onClick={() => navigate({ to: "/settings" })}
              >
                <User className="mr-3 h-4 w-4 text-blue-400" />
                <span className="font-bold text-xs uppercase tracking-widest">Visualizar Perfil</span>
              </DropdownMenuItem>
              <DropdownMenuItem 
                className="rounded-xl focus:bg-white/5 focus:text-white cursor-pointer py-3"
                onClick={() => navigate({ to: "/settings" })}
              >
                <Settings className="mr-3 h-4 w-4 text-blue-400" />
                <span className="font-bold text-xs uppercase tracking-widest">Configurações</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-white/5 mx-2" />
              <DropdownMenuItem 
                className="rounded-xl focus:bg-red-500/10 focus:text-red-400 text-red-400 cursor-pointer py-3"
                onClick={handleSignOut}
              >
                <LogOut className="mr-3 h-4 w-4" />
                <span className="font-bold text-xs uppercase tracking-widest">Sair da Conta</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
