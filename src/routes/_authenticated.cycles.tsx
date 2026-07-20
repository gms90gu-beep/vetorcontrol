import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { blockManagersGuard } from "@/lib/role-guards";
import { useState, useEffect } from "react";
import { 
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { generateInstitutionalPDF } from "@/lib/institutional-export";

// Datas de ciclo vêm como coluna DATE (YYYY-MM-DD, sem hora). Parsear com
// `new Date(str)` interpreta como UTC meia-noite e, ao formatar de volta pro
// fuso local (America/Sao_Paulo, UTC-3), pode exibir o dia anterior. Parseia
// os componentes manualmente pra evitar qualquer conversão de fuso.
function formatCycleDate(s: string | null | undefined): string {
  if (!s) return "—";
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return "—";
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

export const Route = createFileRoute("/_authenticated/cycles")({
  beforeLoad: blockManagersGuard,
  component: CyclesPage,
});

function CyclesPage() {
  const [cycles, setCycles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [coverageData, setCoverageData] = useState<Record<string, any>>({});
  const [focosData, setFocosData] = useState<Record<string, number>>({});
  const [cycleToFinish, setCycleToFinish] = useState<any | null>(null);

  useEffect(() => {
    fetchCycles();
  }, []);

  async function fetchCycles() {
    setIsLoading(true);
    try {
      const { data: cyclesData, error } = await supabase
        .from("cycles")
        .select("*")
        .order("year", { ascending: false })
        .order("number", { ascending: true });
      
      if (error) throw error;
      setCycles(cyclesData || []);

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

      // Focos positivos por ciclo — não vem na view cycle_coverage_summary,
      // então busca separado (visits com has_focus=true é sempre um
      // subconjunto pequeno, não precisa de limite).
      const { data: focusRows } = await supabase
        .from("visits")
        .select("cycle_id")
        .eq("has_focus", true);
      const focosMap: Record<string, number> = {};
      (focusRows ?? []).forEach((r: any) => {
        if (r.cycle_id) focosMap[r.cycle_id] = (focosMap[r.cycle_id] ?? 0) + 1;
      });
      setFocosData(focosMap);
    } catch (error) {
      console.error("Error fetching cycles:", error);
    } finally {
      setIsLoading(false);
    }
  }

  const handleFinishCycle = async (cycleId: string) => {
    try {
      const { error } = await supabase
        .from("cycles")
        .update({ status: 'finished' })
        .eq("id", cycleId);

      if (error) throw error;
      
      toast.success("Ciclo concluído! O próximo ciclo será iniciado automaticamente.");
      fetchCycles();
    } catch (error) {
      console.error("Error finishing cycle:", error);
      toast.error("Erro ao finalizar ciclo.");
    } finally {
      setCycleToFinish(null);
    }
  };

  const handleGenerateReport = (cycle: any) => {
    const coverage = (cycle.id && coverageData[cycle.id]) || { coverage_percentage: 0, worked_properties: 0, total_properties: 0 };
    const focos = focosData[cycle.id] ?? 0;
    const statusLabel = cycle.status === "in_progress" ? "Em andamento" : cycle.status === "finished" ? "Concluído" : "Não iniciado";
    try {
      generateInstitutionalPDF(
        `relatorio-ciclo-${cycle.number ?? cycle.id}.pdf`,
        {
          title: `Relatório do Ciclo — ${cycle.name}`,
          subtitle: `Período: ${formatCycleDate(cycle.start_date)} a ${formatCycleDate(cycle.end_date)}`,
          issuedBy: "VetorControl",
        },
        [
          {
            title: "Resumo",
            head: ["Indicador", "Valor"],
            body: [
              ["Status", statusLabel],
              ["Cobertura de visitas", `${coverage.coverage_percentage}%`],
              ["Imóveis trabalhados", coverage.worked_properties],
              ["Total de imóveis no ciclo", coverage.total_properties],
              ["Focos positivos", focos],
            ],
          },
        ],
      );
      toast.success(`Relatório do ${cycle.name} gerado.`);
    } catch (e) {
      console.error("Error generating cycle report:", e);
      toast.error("Erro ao gerar relatório.");
    }
  };

  const groupedCycles = cycles.reduce((acc: Record<number, any[]>, cycle) => {
    const year = cycle.year || new Date().getFullYear();
    if (!acc[year]) acc[year] = [];
    acc[year].push(cycle);
    return acc;
  }, {});

  const years = Object.keys(groupedCycles).map(Number).sort((a, b) => b - a);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-24">
      <div className="flex flex-col gap-1 px-1">
        <h2 className="text-3xl font-black tracking-tighter text-slate-900 uppercase underline decoration-primary/20 decoration-4 underline-offset-8">Ciclos Operacionais</h2>
        <p className="text-muted-foreground font-medium uppercase tracking-widest text-[10px] mt-2">Gestão Anual de Vigilância</p>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin shadow-lg shadow-primary/10" />
          <p className="font-bold text-slate-400 uppercase tracking-widest text-[10px]">Sincronizando períodos...</p>
        </div>
      ) : (
        <div className="space-y-12">
          {years.map(year => (
            <div key={year} className="space-y-6">
              <div className="flex items-center gap-4 px-1">
                <div className="h-px flex-1 bg-slate-100" />
                <Badge variant="outline" className="rounded-xl px-4 py-1.5 border-slate-200 bg-white shadow-sm font-black text-slate-500 uppercase tracking-widest">
                  Ano Operacional {year}
                </Badge>
                <div className="h-px flex-1 bg-slate-100" />
              </div>

              <div className="grid grid-cols-1 gap-6">
                {groupedCycles[year].map((cycle) => {
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
                            {formatCycleDate(cycle.start_date)} - {formatCycleDate(cycle.end_date)}
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
                          <CycleStatCard label="Focos" value={focosData[cycle.id] ?? 0} icon={AlertTriangle} color="text-red-600" bgColor="bg-red-50/50" />
                        </div>

                        <div className="flex flex-col gap-3">
                          {isActive && (
                            <Button 
                              onClick={() => setCycleToFinish(cycle)}
                              className="w-full h-16 rounded-[1.8rem] font-black uppercase tracking-widest text-[10px] gap-2 bg-emerald-500 hover:bg-emerald-600 text-white border-none transition-all shadow-lg active:scale-95 shadow-emerald-100"
                            >
                              <CheckCircle2 className="h-4 w-4" /> Finalizar Ciclo Atual
                            </Button>
                          )}
                          
                          <Button 
                            onClick={() => handleGenerateReport(cycle)}
                            className={cn(
                              "w-full h-16 rounded-[1.8rem] font-black uppercase tracking-widest text-[10px] gap-2 border-none transition-all shadow-lg active:scale-95",
                              isActive || isCompleted ? "bg-slate-900 text-white hover:bg-slate-800 shadow-slate-200" : "bg-slate-100 text-slate-400 hover:bg-slate-200 shadow-none"
                            )}
                          >
                            <FileText className="h-4 w-4" /> Gerar Relatório {isCompleted ? 'Final' : 'Parcial'}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={!!cycleToFinish} onOpenChange={(open) => !open && setCycleToFinish(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalizar {cycleToFinish?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação marca o ciclo como concluído. O próximo ciclo será iniciado automaticamente. Não é possível desfazer pela tela.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => cycleToFinish && handleFinishCycle(cycleToFinish.id)}>
              Finalizar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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