import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  CheckCircle2, 
  XCircle, 
  Target, 
  FileText, 
  Clock, 
  Power,
  ChevronRight,
  Printer,
  Calendar,
  Lock,
  Unlock,
  BarChart3,
  Droplets,
  Layers
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { translate } from "@/lib/translations";

interface DailyWorkCloserProps {
  stats?: {
    worked: number;
    closed: number;
    refused: number;
    eliminated: number;
    treated: number;
    focus: number;
    pending: number;
    treatedDeposits?: number;
    larvicideUsed?: number;
    progress?: number;
  };
  onGeneratePDF?: () => void;
  isLocked?: boolean;
  onReopen?: () => void;
  userRole?: string;
}

export function DailyWorkCloser({ 
  stats: externalStats, 
  onGeneratePDF, 
  isLocked, 
  onReopen,
  userRole 
}: DailyWorkCloserProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [agent, setAgent] = useState<any>(null);
  const [activeCycle, setActiveCycle] = useState<any>(null);
  const [activeWeek, setActiveWeek] = useState<any>(null);
  const [localStats, setLocalStats] = useState({
    worked: 0,
    closed: 0,
    refused: 0,
    eliminated: 0,
    treated: 0,
    focus: 0,
    pending: 0,
    treatedDeposits: 0,
    larvicideUsed: 0,
    progress: 0
  });
  const [pendingCount, setPendingCount] = useState(0);
  const [recoveredCount, setRecoveredCount] = useState(0);
  const [openBlock, setOpenBlock] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [jornadaDate, setJornadaDate] = useState<string | null>(null);

  const stats = externalStats || localStats;

  const fetchDailyContext = useCallback(async () => {
    if (externalStats) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: agentData } = await supabase
        .from("agents")
        .select("*")
        .eq("profile_id", user.id)
        .maybeSingle();
      
      if (agentData) setAgent(agentData);

      const { data: cycle } = await supabase
        .from("cycles")
        .select("*")
        .eq("status", "in_progress")
        .eq("year", new Date().getFullYear())
        .limit(1)
        .maybeSingle();
      
      if (cycle) {
        setActiveCycle(cycle);

        const { data: week } = await supabase
          .from("weeks")
          .select("*")
          .eq("cycle_id", cycle.id)
          .lte("start_date", new Date().toISOString().split('T')[0])
          .gte("end_date", new Date().toISOString().split('T')[0])
          .maybeSingle();
        
        if (week) setActiveWeek(week);

        // Considera a data da jornada ativa (se existir) como referência operacional
        const { data: activeSession } = await supabase
          .from("field_work_sessions")
          .select("id, session_date, block_number")
          .eq("user_id", user.id)
          .eq("status", "in_progress")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        setActiveSessionId(activeSession?.id ?? null);
        setOpenBlock(activeSession?.block_number ?? null);

        const opDateStr: string = activeSession?.session_date
          ? activeSession.session_date
          : new Date().toISOString().split('T')[0];
        setJornadaDate(opDateStr);
        const startOfDay = new Date(`${opDateStr}T00:00:00`);
        const endOfDay = new Date(`${opDateStr}T23:59:59.999`);

        console.log("[DailyWorkCloser] Data atual:", new Date().toISOString());
        console.log("[DailyWorkCloser] Data da jornada:", opDateStr);

        const { data: todayVisits } = await supabase
          .from("visits")
          .select("id, status, property_id, treatment_amount, treated_deposits, elimination_amount, has_focus")
          .eq("cycle_id", cycle.id)
          .eq("agent_id", user.id)
          .gte("visit_date", startOfDay.toISOString())
          .lte("visit_date", endOfDay.toISOString());
        
        if (todayVisits) {
          const totalTreatedDeposits = todayVisits.reduce((acc, v) => acc + (Number(v.treated_deposits) || 0), 0);
          const totalLarvicide = todayVisits.reduce((acc, v) => acc + (Number(v.treatment_amount) || 0), 0);
          const totalEliminated = todayVisits.reduce((acc, v) => acc + (Number(v.elimination_amount) || 0), 0);
          const totalFocus = todayVisits.filter(v => v.has_focus).length;

          setLocalStats({
            worked: todayVisits.length,
            closed: todayVisits.filter(v => v.status === 'closed').length,
            refused: todayVisits.filter(v => v.status === 'refused').length,
            eliminated: totalEliminated,
            treated: todayVisits.filter(v => v.status === 'visited' && ((Number(v.treated_deposits) || 0) > 0 || (Number(v.treatment_amount) || 0) > 0)).length,
            focus: totalFocus,
            pending: todayVisits.filter(v => v.status === 'closed' || v.status === 'refused').length,
            treatedDeposits: totalTreatedDeposits,
            larvicideUsed: totalLarvicide,
            progress: 0 
          });
        }

        // Pendências em aberto + recuperadas hoje
        const { count: pCount } = await supabase
          .from("property_pendencies")
          .select("id", { count: 'exact', head: true })
          .eq("agent_id", user.id)
          .is("resolved_at", null);
        setPendingCount(pCount || 0);

        const { count: rCount } = await supabase
          .from("property_pendencies")
          .select("id", { count: 'exact', head: true })
          .eq("agent_id", user.id)
          .gte("resolved_at", startOfDay.toISOString())
          .lte("resolved_at", endOfDay.toISOString());
        setRecoveredCount(rCount || 0);
      }
    } catch (error) {
      console.error("Error fetching daily context:", error);
    }
  }, [externalStats]);

  useEffect(() => {
    fetchDailyContext();
  }, [fetchDailyContext]);

  const handleCloseDay = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let currentAgent = agent;
      if (!currentAgent) {
        const { data: agentData } = await supabase
          .from("agents")
          .select("*")
          .eq("profile_id", user.id)
          .maybeSingle();
        currentAgent = agentData;
      }

      if (!currentAgent) throw new Error("Agent not found");

      // Usa a data da jornada ativa como work_date
      const { data: activeSessionForClose } = await supabase
        .from("field_work_sessions")
        .select("session_date")
        .eq("user_id", user.id)
        .eq("status", "in_progress")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const operationalWorkDate: string = activeSessionForClose?.session_date
        ? activeSessionForClose.session_date
        : new Date().toISOString().split('T')[0];

      console.log("[DailyWorkCloser:close] Data atual:", new Date().toISOString().split('T')[0]);
      console.log("[DailyWorkCloser:close] Data da jornada (work_date):", operationalWorkDate);

      const { data: existingRecord } = await supabase
        .from("daily_work_records")
        .select("id")
        .eq("agent_id", currentAgent.id)
        .eq("work_date", operationalWorkDate)
        .maybeSingle();

      const recordData = {
        agent_id: currentAgent.id,
        cycle_id: activeCycle?.id,
        week_id: activeWeek?.id,
        work_date: operationalWorkDate,
        status: 'completed',
        end_time: new Date().toISOString(),
        properties_worked: stats.worked,
        properties_closed: stats.closed,
        properties_refused: stats.refused,
        deposits_treated: stats.treatedDeposits || 0,
        deposits_eliminated: stats.eliminated,
        positive_foci: stats.focus,
        pending_visits: stats.pending,
        updated_at: new Date().toISOString()
      };

      if (existingRecord) {
        await supabase
          .from("daily_work_records")
          .update(recordData)
          .eq("id", existingRecord.id);
      } else {
        await supabase
          .from("daily_work_records")
          .insert(recordData);
      }

      await supabase
        .from("agents")
        .update({ work_status: 'work_completed' })
        .eq("id", currentAgent.id);

      // Encerra jornada(s) de campo em andamento
      await supabase
        .from("field_work_sessions")
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("status", "in_progress");


      toast.success("Trabalho do dia encerrado com sucesso!");
      setShowSummary(true);
      setIsOpen(false);
    } catch (error) {
      console.error("Error closing work day:", error);
      toast.error("Erro ao encerrar trabalho. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  const canReopen = userRole === 'supervisor' || userRole === 'admin';

  if (isLocked) {
    return (
      <Card className="border-none shadow-xl bg-slate-100 rounded-[2rem] overflow-hidden border-2 border-dashed border-slate-300">
        <CardContent className="p-8 flex flex-col items-center justify-center text-center space-y-4">
          <div className="h-16 w-16 bg-slate-200 rounded-full flex items-center justify-center">
            <Lock className="h-8 w-8 text-slate-400" />
          </div>
          <div>
            <h3 className="text-xl font-black text-slate-800 tracking-tight">🔒 Boletim Encerrado</h3>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
              O expediente deste dia foi finalizado.
            </p>
          </div>
          <div className="flex gap-3 w-full pt-2">
            <Button 
              onClick={onGeneratePDF}
              className="flex-1 h-12 rounded-xl bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 font-black uppercase tracking-widest text-[9px] gap-2 shadow-sm"
            >
              <Printer className="h-4 w-4 text-blue-500" /> PDF Diário
            </Button>
            {canReopen && (
              <Button 
                onClick={onReopen}
                variant="outline"
                className="flex-1 h-12 rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50 font-black uppercase tracking-widest text-[9px] gap-2"
              >
                <Unlock className="h-4 w-4" /> Reabrir
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (showSummary) {
    return (
      <Dialog open={showSummary} onOpenChange={setShowSummary}>
        <DialogContent className="max-w-md rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl bg-slate-50">
          <div className="bg-slate-900 p-8 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <CheckCircle2 className="h-24 w-24" />
            </div>
            <Badge className="mb-4 bg-emerald-500/20 text-emerald-400 border-none font-black text-[10px] uppercase tracking-widest">
              Trabalho Encerrado
            </Badge>
            <h2 className="text-3xl font-black tracking-tighter leading-none mb-1">Resumo Diário</h2>
            <p className="text-slate-400 font-bold text-xs uppercase tracking-widest flex items-center gap-2">
              <Calendar className="h-3 w-3" /> {new Date().toLocaleDateString('pt-BR')}
            </p>
          </div>
          
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <SummaryItem icon={Target} label={translate("worked")} value={stats.worked} color="text-slate-800" />
              <SummaryItem icon={XCircle} label={translate("CLOSED")} value={stats.closed} color="text-blue-600" />
              <SummaryItem icon={XCircle} label={translate("REFUSED")} value={stats.refused} color="text-red-500" />
              <SummaryItem icon={BarChart3} label="Eliminados" value={stats.eliminated} color="text-emerald-500" />
              <SummaryItem icon={Layers} label={translate("TREATED")} value={stats.treatedDeposits || stats.treated} color="text-indigo-600" />
              <SummaryItem icon={CheckCircle2} label="Focos Pos." value={stats.focus} color="text-orange-500" />
              <div className="col-span-2 md:col-span-1">
                 <SummaryItem icon={Droplets} label="Larvicida" value={`${stats.larvicideUsed || 0}g`} color="text-cyan-600" />
              </div>
              <div className="col-span-2">
                 <SummaryItem icon={BarChart3} label="Cobertura" value={`${stats.progress || 0}%`} color="text-blue-700" />
              </div>
            </div>

            <div className="pt-4 space-y-3">
              <Button 
                onClick={() => {
                  onGeneratePDF?.();
                  setShowSummary(false);
                }}
                className="w-full h-14 rounded-2xl bg-blue-600 text-white hover:bg-blue-700 font-black uppercase tracking-widest text-xs gap-3 shadow-lg shadow-blue-200"
              >
                <Printer className="h-5 w-5" /> Gerar PDF Diário
              </Button>
              <Button 
                variant="ghost"
                onClick={() => setShowSummary(false)}
                className="w-full h-12 rounded-2xl text-slate-500 font-bold uppercase tracking-widest text-[10px]"
              >
                Fechar Resumo
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          className="w-full h-16 md:h-20 lg:h-24 rounded-[1.5rem] md:rounded-[2rem] bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white shadow-2xl group relative overflow-hidden border-none transition-all duration-300 active:scale-95"
        >
          <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="flex items-center justify-between px-8 w-full relative z-10">
            <div className="flex items-center gap-5">
              <div className="bg-white/20 p-4 rounded-[1.5rem] shadow-inner backdrop-blur-sm">
                <Power className="h-8 w-8 text-white" />
              </div>
              <div className="text-left">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-200 mb-0.5">
                  Operacional · {jornadaDate ? new Date(`${jornadaDate}T12:00:00`).toLocaleDateString('pt-BR') : 'Hoje'}
                </p>
                <h3 className="text-xl font-black tracking-tight uppercase">Encerrar Jornada do Dia</h3>
              </div>
            </div>
            <ChevronRight className="h-8 w-8 text-white/50 group-hover:translate-x-2 group-hover:text-white transition-all" />
          </div>
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-md rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl">
        <div className="bg-gradient-to-br from-red-600 to-red-700 p-8 text-white">
          <div className="bg-white/20 p-4 rounded-2xl w-fit mb-4">
            <Power className="h-10 w-10" />
          </div>
          <DialogTitle className="text-3xl font-black tracking-tighter leading-tight mb-2">
            Finalizar o expediente?
          </DialogTitle>
          <DialogDescription className="text-white/80 font-bold text-xs uppercase tracking-widest leading-relaxed">
            Sua produção será consolidada e os indicadores do ciclo serão atualizados automaticamente.
          </DialogDescription>
        </div>

        <div className="p-8 space-y-6">
          {(pendingCount > 0 || openBlock) && (
            <div className="space-y-2">
              {pendingCount > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-800">
                  <p className="text-xs font-black uppercase tracking-widest mb-1">⚠️ Pendências em aberto</p>
                  <p className="text-[11px] font-bold">Existem {pendingCount} imóveis pendentes de recuperação. Deseja encerrar mesmo assim?</p>
                </div>
              )}
              {openBlock && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-800">
                  <p className="text-xs font-black uppercase tracking-widest mb-1">⚠️ Quarteirão em andamento</p>
                  <p className="text-[11px] font-bold">O quarteirão {openBlock} ainda está aberto. Deseja encerrar mesmo assim?</p>
                </div>
              )}
            </div>
          )}

          <div className="space-y-4">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Resumo da Produção</h4>
            <div className="grid grid-cols-2 gap-3">
              <SummaryItemSmall label="Imóveis" value={stats.worked} icon={Target} />
              <SummaryItemSmall label={translate("CLOSED")} value={stats.closed} icon={XCircle} />
              <SummaryItemSmall label={translate("REFUSED")} value={stats.refused} icon={XCircle} />
              <SummaryItemSmall label="Focos (+)" value={stats.focus} icon={CheckCircle2} />
              <SummaryItemSmall label="Pend. Geradas" value={pendingCount} icon={Clock} />
              <SummaryItemSmall label="Recuperadas" value={recoveredCount} icon={CheckCircle2} />
              <SummaryItemSmall label={translate("TREATED")} value={stats.treatedDeposits || stats.treated} icon={Layers} />
              <SummaryItemSmall label="Larvicida" value={`${stats.larvicideUsed || 0}g`} icon={Droplets} />
            </div>
          </div>

          <div className="pt-4 flex flex-col gap-3">
            <Button 
              onClick={handleCloseDay}
              disabled={isLoading}
              className="w-full h-16 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-widest text-sm shadow-xl shadow-red-200 flex items-center justify-center gap-3"
            >
              {isLoading ? (
                <>
                  <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Sincronizando...
                </>
              ) : (
                "Confirmar Encerramento"
              )}
            </Button>
            <Button 
              variant="ghost" 
              onClick={() => setIsOpen(false)}
              className="w-full h-12 rounded-2xl text-slate-500 font-bold uppercase tracking-widest text-[10px]"
            >
              Cancelar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SummaryItem({ icon: Icon, label, value, color }: any) {
  return (
    <Card className="border-none shadow-sm bg-white rounded-2xl p-4 flex flex-col items-center text-center gap-2">
      <div className={cn("p-2 rounded-xl bg-slate-50", color.replace('text-', 'bg-').replace('600', '100').replace('500', '100').replace('700', '100'))}>
        <Icon className={cn("h-4 w-4", color)} />
      </div>
      <div>
        <p className="text-xl font-black tracking-tighter text-slate-800">{value}</p>
        <p className="text-[7px] font-black uppercase tracking-widest text-slate-400 leading-tight">{label}</p>
      </div>
    </Card>
  );
}

function SummaryItemSmall({ label, value, icon: Icon }: any) {
  return (
    <div className="bg-slate-50 p-4 rounded-2xl flex items-center justify-between border border-slate-100">
      <div className="flex items-center gap-2">
        <Icon className="h-3 w-3 text-slate-400" />
        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{label}</span>
      </div>
      <span className="text-sm font-black text-slate-800">{value}</span>
    </div>
  );
}