import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { 
  Plus, 
  Calendar, 
  ChevronRight, 
  Layers, 
  CheckCircle2, 
  Play, 
  TrendingUp,
  Clock,
  LayoutGrid
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/_authenticated/cycles")({
  component: CyclesPage,
});

function CyclesPage() {
  const [cycles] = useState([
    { id: 1, name: "Ciclo 03/2026", start: "01/05", end: "30/06", status: "in_progress", progress: 65, coverage: "82%" },
    { id: 2, name: "Ciclo 02/2026", start: "01/03", end: "30/04", status: "completed", progress: 100, coverage: "98%" },
    { id: 3, name: "Ciclo 01/2026", start: "01/01", end: "28/02", status: "completed", progress: 100, coverage: "99%" },
  ]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col gap-1">
        <h2 className="text-3xl font-black tracking-tighter text-primary">Ciclos</h2>
        <p className="text-muted-foreground font-medium">Gestão de períodos e cobertura territorial</p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {cycles.map((cycle) => (
          <Card key={cycle.id} className="border-none shadow-xl rounded-[2.5rem] overflow-hidden group hover:scale-[1.02] transition-all">
            <CardHeader className="pb-4">
              <div className="flex justify-between items-start">
                <div className={`h-14 w-14 rounded-2xl flex items-center justify-center mb-2 shadow-inner transition-colors duration-500 ${cycle.status === 'in_progress' ? 'bg-primary text-primary-foreground group-hover:bg-primary/90' : 'bg-emerald-100 text-emerald-700'}`}>
                  {cycle.status === 'in_progress' ? <Play className="h-7 w-7 ml-1" /> : <CheckCircle2 className="h-7 w-7" />}
                </div>
                <Badge variant={cycle.status === 'in_progress' ? 'default' : 'secondary'} className="rounded-lg font-bold text-[10px] uppercase tracking-wider border-none">
                  {cycle.status === 'in_progress' ? 'Em Andamento' : 'Concluído'}
                </Badge>
              </div>
              <CardTitle className="text-2xl font-black tracking-tight">{cycle.name}</CardTitle>
              <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" />
                  {cycle.start} - {cycle.end}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-2 pb-6 space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  <span>Progresso Geral</span>
                  <span>{cycle.progress}%</span>
                </div>
                <Progress value={cycle.progress} className="h-2 rounded-full" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-accent/30 p-4 rounded-2xl flex flex-col items-center gap-1">
                  <span className="text-2xl font-black tracking-tighter text-primary">{cycle.coverage}</span>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Cobertura</span>
                </div>
                <div className="bg-accent/30 p-4 rounded-2xl flex flex-col items-center gap-1">
                  <span className="text-2xl font-black tracking-tighter text-emerald-600">824</span>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Quadras</span>
                </div>
              </div>

              <Button variant="ghost" className="w-full h-12 rounded-2xl font-bold uppercase tracking-widest text-[10px] gap-2 border-none bg-accent/30 hover:bg-accent/50 group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                Ver Detalhes do Ciclo <ChevronRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Button className="fixed bottom-8 right-8 h-16 w-16 rounded-3xl shadow-2xl shadow-primary/40 p-0 active:scale-90 transition-all z-40">
        <Plus className="h-8 w-8" />
      </Button>
    </div>
  );
}
