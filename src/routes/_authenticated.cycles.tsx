import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { 
  Plus, 
  Calendar, 
  ChevronRight, 
  Layers, 
  CheckCircle2, 
  Play, 
  TrendingUp,
  Clock,
  LayoutGrid,
  MapPin,
  Home,
  AlertTriangle,
  XCircle,
  FileText
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/cycles")({
  component: CyclesPage,
});

function CyclesPage() {
  const [cycles, setCycles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [coverageData, setCoverageData] = useState<Record<string, any>>({});

  useEffect(() => {
    fetchCycles();
  }, []);

  async function fetchCycles() {
    setIsLoading(true);
    try {
      // 1. Fetch cycles
      const { data: cyclesData, error } = await supabase
        .from("cycles")
        .select("*")
        .order("year", { ascending: false })
        .order("number", { ascending: true });
      
      if (error) throw error;
      setCycles(cyclesData || []);

      // 2. Fetch coverage summary
      const { data: coverage } = await supabase
        .from("cycle_coverage_summary")
        .select("*");
      
      if (coverage) {
        const coverageMap: Record<string, any> = {};
        coverage.forEach(item => {
          if (item.cycle_id) {
            coverageMap[item.cycle_id] = item;
          }
        });
        setCoverageData(coverageMap);
      }

    } catch (error) {
      console.error("Error fetching cycles:", error);
    } finally {
      setIsLoading(false);
    }
  }

  const handleGenerateReport = (cycle: any) => {
    toast.promise(
      new Promise((resolve) => setTimeout(resolve, 2000)),
      {
        loading: `Gerando relatório consolidado para ${cycle.name}...`,
        success: `Relatório do ${cycle.name} gerado com sucesso!`,
        error: "Erro ao gerar relatório.",
      }
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-24">
      <div className="flex flex-col gap-1 px-1">
        <h2 className="text-3xl font-black tracking-tighter text-slate-900 uppercase underline decoration-primary/20 decoration-4 underline-offset-8">Ciclos de Atividade</h2>
        <p className="text-muted-foreground font-medium uppercase tracking-widest text-[10px] mt-2">Vigilância Vetorial Urbana</p>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin shadow-lg shadow-primary/10" />
          <p className="font-bold text-slate-400 uppercase tracking-widest text-[10px]">Sincronizando períodos...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {cycles.map((cycle) => {
            const coverage = (cycle.id && coverageData[cycle.id]) || { coverage_percentage: 0, worked_properties: 0, total_properties: 0 };
            const isActive = cycle.status === 'in_progress';
            const isCompleted = cycle.status === 'finished';

            return (
              <Card key={cycle.id} className={cn(
                "border-none shadow-xl rounded-[2.5rem] overflow-hidden group transition-all duration-500 bg-white",
                isActive && "ring-4 ring-primary/5 scale-[1.01]"
              )}>
                <CardHeader className="pb-4">
                  <div className="flex justify-between items-start">
                    <div className={cn(
                      "h-14 w-14 rounded-2xl flex items-center justify-center mb-2 shadow-inner transition-colors duration-500",
                      isActive ? "bg-primary text-primary-foreground shadow-primary/20" : 
                      isCompleted ? "bg-emerald-500 text-white shadow-emerald-100" : 
                      "bg-slate-100 text-slate-400"
                    )}>
                      {isActive ? <Play className="h-7 w-7 ml-1" /> : 
                       isCompleted ? <CheckCircle2 className="h-7 w-7" /> : 
                       <Clock className="h-7 w-7" />}
                    </div>
                    <Badge variant={isActive ? 'default' : 'secondary'} className={cn(
                      "rounded-lg font-black text-[9px] uppercase tracking-widest border-none px-3 py-1.5",
                      isActive ? "bg-primary" : isCompleted ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                    )}>
                      {isActive ? 'Em Andamento' : isCompleted ? 'Concluído' : 'Não Iniciado'}
                    </Badge>
                  </div>
                  <CardTitle className="text-2xl font-black tracking-tighter text-slate-800">{cycle.name}</CardTitle>
                  <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-blue-500/70" />
                      {new Date(cycle.start_date).toLocaleDateString('pt-BR')} - {new Date(cycle.end_date).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-2 pb-6 space-y-6">
                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-500">
                      <span>Cobertura de Visitas</span>
                      <span className={cn(isActive && "text-primary font-black")}>{coverage.coverage_percentage}%</span>
                    </div>
                    <Progress value={coverage.coverage_percentage} className={cn("h-2 rounded-full", isActive ? "bg-primary/10" : "bg-slate-100")} />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <CycleStatCard label="Imóveis" value={coverage.worked_properties} icon={Home} color="text-blue-600" bgColor="bg-blue-50/50" />
                    <CycleStatCard label="Focos" value={isActive ? 12 : 0} icon={AlertTriangle} color="text-red-600" bgColor="bg-red-50/50" />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <CycleStatCard label="Fechados" value={isActive ? 18 : 0} icon={XCircle} color="text-orange-600" bgColor="bg-orange-50/50" />
                    <CycleStatCard label="Recusados" value={isActive ? 4 : 0} icon={AlertTriangle} color="text-rose-600" bgColor="bg-rose-50/50" />
                  </div>

                  <Button 
                    onClick={() => handleGenerateReport(cycle)}
                    className={cn(
                      "w-full h-16 rounded-[1.8rem] font-black uppercase tracking-widest text-[10px] gap-2 border-none transition-all shadow-lg active:scale-95",
                      isActive ? "bg-slate-900 text-white hover:bg-slate-800 shadow-slate-200" : "bg-slate-100 text-slate-400 hover:bg-slate-200 shadow-none"
                    )}
                  >
                    <FileText className="h-4 w-4" /> Gerar Relatório Consolidado
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Button className="fixed bottom-24 right-6 h-16 w-16 rounded-[2rem] shadow-2xl shadow-primary/40 p-0 active:scale-90 transition-all z-40 bg-primary hover:bg-primary/90 flex items-center justify-center">
        <Plus className="h-8 w-8 text-white" />
      </Button>
    </div>
  );
}

function CycleStatCard({ label, value, icon: Icon, color, bgColor }: any) {
  return (
    <div className={cn("flex flex-col p-4 rounded-3xl border border-slate-100 shadow-sm", bgColor)}>
      <div className="flex items-center justify-between mb-2">
        <div className={cn("p-2 rounded-xl bg-white shadow-sm", color)}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-2xl font-black tracking-tighter text-slate-800">{value}</span>
      </div>
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
    </div>
  );
}
