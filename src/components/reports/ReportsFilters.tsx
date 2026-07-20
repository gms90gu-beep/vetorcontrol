import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { listRemoteOrCache } from "@/lib/offline/repos";
import { 
  Filter, 
  User, 
  Calendar, 
  Layers,
  Search,
  X
} from "lucide-react";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ReportsFiltersProps {
  onFilterChange: (filters: any) => void;
  className?: string;
}

export function ReportsFilters({ onFilterChange, className }: ReportsFiltersProps) {
  const [agents, setAgents] = useState<any[]>([]);
  const [cycles, setCycles] = useState<any[]>([]);
  const [weeks, setWeeks] = useState<any[]>([]);

  const [selectedAgent, setSelectedAgent] = useState<string>("all");
  const [selectedCycle, setSelectedCycle] = useState<string>("all");
  const [selectedWeek, setSelectedWeek] = useState<string>("all");

  useEffect(() => {
    fetchFiltersData();
  }, []);

  async function fetchFiltersData() {
    try {
      const [agentsData, cyclesData, weeksData] = await Promise.all([
        listRemoteOrCache<any>({ name: "agents", remote: async () => await supabase.from("agents").select("id, name") }),
        listRemoteOrCache<any>({ name: "cycles", remote: async () => await supabase.from("cycles").select("id, number, name").order("number", { ascending: false }) }),
        listRemoteOrCache<any>({ name: "weeks", remote: async () => await supabase.from("weeks").select("id, number, cycle_id").order("number", { ascending: true }) }),
      ]);

      if (agentsData) setAgents(agentsData);
      if (cyclesData) setCycles(cyclesData);
      if (weeksData) setWeeks(weeksData);
    } catch (error) {
      console.error("Error fetching filters data:", error);
    }
  }

  // Semanas pertencem a um ciclo (weeks.cycle_id) — só oferece semanas do ciclo selecionado.
  // Ao trocar de ciclo, uma semana já selecionada de outro ciclo deixa de fazer sentido.
  const weeksForCycle = selectedCycle === "all" ? weeks : weeks.filter((w) => w.cycle_id === selectedCycle);

  function handleCycleChange(value: string) {
    setSelectedCycle(value);
    setSelectedWeek("all");
  }

  const handleApply = () => {
    onFilterChange({
      agent: selectedAgent,
      cycle: selectedCycle,
      week: selectedWeek
    });
  };

  const clearFilters = () => {
    setSelectedAgent("all");
    setSelectedCycle("all");
    setSelectedWeek("all");
    onFilterChange({
      agent: "all",
      cycle: "all",
      week: "all"
    });
  };

  const hasFilters = selectedAgent !== "all" || selectedCycle !== "all" || selectedWeek !== "all";

  return (
    <div className={cn("bg-white p-4 rounded-3xl border border-slate-100 shadow-sm space-y-4", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-50 rounded-xl">
            <Filter className="h-4 w-4 text-blue-600" />
          </div>
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tighter">Filtros Operacionais</h3>
        </div>
        {hasFilters && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={clearFilters}
            className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-red-500"
          >
            <X className="h-3 w-3 mr-1" /> Limpar
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Agente */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
            <User className="h-3 w-3" /> Agente
          </label>
          <Select value={selectedAgent} onValueChange={setSelectedAgent}>
            <SelectTrigger className="h-10 rounded-xl border-slate-100 bg-slate-50 text-xs font-bold">
              <SelectValue placeholder="Todos os Agentes" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl border-slate-100">
              <SelectItem value="all">Todos os Agentes</SelectItem>
              {agents.map(agent => (
                <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Ciclo */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
            <Layers className="h-3 w-3" /> Ciclo
          </label>
          <Select value={selectedCycle} onValueChange={handleCycleChange}>
            <SelectTrigger className="h-10 rounded-xl border-slate-100 bg-slate-50 text-xs font-bold">
              <SelectValue placeholder="Todos os Ciclos" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl border-slate-100">
              <SelectItem value="all">Todos os Ciclos</SelectItem>
              {cycles.map(cycle => (
                <SelectItem key={cycle.id} value={cycle.id}>Ciclo {cycle.number} - {cycle.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Semana (do ciclo selecionado) */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
            <Calendar className="h-3 w-3" /> Semana
          </label>
          <Select value={selectedWeek} onValueChange={setSelectedWeek}>
            <SelectTrigger className="h-10 rounded-xl border-slate-100 bg-slate-50 text-xs font-bold">
              <SelectValue placeholder="Todas as Semanas" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl border-slate-100">
              <SelectItem value="all">Todas as Semanas</SelectItem>
              {weeksForCycle.map(week => (
                <SelectItem key={week.id} value={week.id}>Semana {week.number}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button 
        onClick={handleApply}
        className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-slate-200 transition-all active:scale-95"
      >
        <Search className="h-4 w-4 mr-2" /> Filtrar Resultados
      </Button>
    </div>
  );
}
