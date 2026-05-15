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
  Home
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/cycles")({
  component: CyclesPage,
});

function CyclesPage() {
  const [cycles, setCycles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchCycles();
  }, []);

  async function fetchCycles() {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("cycles")
        .select("*")
        .order("year", { ascending: false })
        .order("number", { ascending: true });
      
      if (error) throw error;
      setCycles(data || []);
    } catch (error) {
      console.error("Error fetching cycles:", error);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-24">
      <div className="flex flex-col gap-1">
        <h2 className="text-3xl font-black tracking-tighter text-primary uppercase">Ciclos de Vigilância</h2>
        <p className="text-muted-foreground font-medium">Gestão de períodos e cobertura territorial</p>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="font-bold text-slate-400 uppercase tracking-widest text-xs">Carregando ciclos...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {cycles.map((cycle) => (
            <Card key={cycle.id} className="border-none shadow-xl rounded-[2.5rem] overflow-hidden group hover:scale-[1.02] transition-all bg-white">
              <CardHeader className="pb-4">
                <div className="flex justify-between items-start">
                  <div className={`h-14 w-14 rounded-2xl flex items-center justify-center mb-2 shadow-inner transition-colors duration-500 ${cycle.status === 'in_progress' ? 'bg-primary text-primary-foreground' : 'bg-emerald-100 text-emerald-700'}`}>
                    {cycle.status === 'in_progress' ? <Play className="h-7 w-7 ml-1" /> : <CheckCircle2 className="h-7 w-7" />}
                  </div>
                  <Badge variant={cycle.status === 'in_progress' ? 'default' : 'secondary'} className="rounded-lg font-bold text-[10px] uppercase tracking-wider border-none">
                    {cycle.status === 'in_progress' ? 'Em Andamento' : cycle.status === 'finished' ? 'Concluído' : 'Não Iniciado'}
                  </Badge>
                </div>
                <CardTitle className="text-2xl font-black tracking-tight">{cycle.name}</CardTitle>
                <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 text-blue-500" />
                    {new Date(cycle.start_date).toLocaleDateString('pt-BR')} - {new Date(cycle.end_date).toLocaleDateString('pt-BR')}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-2 pb-6 space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    <span>Cobertura do Ciclo</span>
                    <span>{cycle.status === 'finished' ? '100%' : '65%'}</span>
                  </div>
                  <Progress value={cycle.status === 'finished' ? 100 : 65} className="h-2.5 rounded-full" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-4 rounded-2xl flex flex-col items-center gap-1 border border-slate-100">
                    <span className="text-2xl font-black tracking-tighter text-blue-600">342</span>
                    <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Trabalhados</span>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl flex flex-col items-center gap-1 border border-slate-100">
                    <span className="text-2xl font-black tracking-tighter text-red-500">12</span>
                    <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Focos</span>
                  </div>
                </div>

                <Button variant="ghost" className="w-full h-14 rounded-2xl font-black uppercase tracking-widest text-[10px] gap-2 border-none bg-slate-900 text-white hover:bg-slate-800 transition-all shadow-lg shadow-slate-200">
                  Gerar Relatório do Ciclo <ChevronRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Button className="fixed bottom-24 right-6 h-16 w-16 rounded-[2rem] shadow-2xl shadow-primary/40 p-0 active:scale-90 transition-all z-40 bg-primary hover:bg-primary/90">
        <Plus className="h-8 w-8 text-white" />
      </Button>
    </div>
  );
}
