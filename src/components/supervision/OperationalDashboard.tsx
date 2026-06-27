import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { listRemoteOrCache } from "@/lib/offline/repos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Users,
  TrendingUp,
  Trophy,
  AlertTriangle,
  FileDown,
  MapPin,
  Filter,
} from "lucide-react";
import { toast } from "sonner";

type AgentRow = {
  id: string;
  full_name: string;
  trabalhados: number;
  fechados: number;
  recusas: number;
  focos: number;
};

export function OperationalDashboard() {
  const [agents, setAgents] = useState<any[]>([]);
  const [visits, setVisits] = useState<any[]>([]);
  const [cycles, setCycles] = useState<any[]>([]);
  const [weeks, setWeeks] = useState<any[]>([]);
  const [cycleFilter, setCycleFilter] = useState<string>("all");
  const [weekFilter, setWeekFilter] = useState<string>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [{ data: profs }, { data: vs }, { data: cs }, { data: ws }] = await Promise.all([
          supabase.from("profiles").select("id, full_name, role").eq("role", "agente"),
          supabase.from("visits").select("id, agent_id, status, has_focus, visit_date, cycle_id, week_id, property_id"),
          supabase.from("cycles").select("id, name, year, number").order("year", { ascending: false }),
          supabase.from("weeks").select("id, number, cycle_id, start_date, end_date"),
        ]);
        setAgents(profs || []);
        setVisits(vs || []);
        setCycles(cs || []);
        setWeeks(ws || []);
      } catch (e) {
        console.error(e);
        toast.error("Erro ao carregar dados operacionais");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filteredVisits = useMemo(() => {
    return visits.filter((v) => {
      if (cycleFilter !== "all" && v.cycle_id !== cycleFilter) return false;
      if (weekFilter !== "all" && v.week_id !== weekFilter) return false;
      if (agentFilter !== "all" && v.agent_id !== agentFilter) return false;
      return true;
    });
  }, [visits, cycleFilter, weekFilter, agentFilter]);

  const agentRows: AgentRow[] = useMemo(() => {
    return agents
      .map((a) => {
        const av = filteredVisits.filter((v) => v.agent_id === a.id);
        return {
          id: a.id,
          full_name: a.full_name || "Sem nome",
          trabalhados: av.length,
          fechados: av.filter((v) => v.status === "closed").length,
          recusas: av.filter((v) => v.status === "refused").length,
          focos: av.filter((v) => v.has_focus).length,
        };
      })
      .filter((r) => r.trabalhados > 0 || agentFilter === r.id)
      .sort((a, b) => b.trabalhados - a.trabalhados);
  }, [agents, filteredVisits, agentFilter]);

  const totals = useMemo(() => {
    return agentRows.reduce(
      (acc, r) => ({
        trabalhados: acc.trabalhados + r.trabalhados,
        fechados: acc.fechados + r.fechados,
        recusas: acc.recusas + r.recusas,
        focos: acc.focos + r.focos,
      }),
      { trabalhados: 0, fechados: 0, recusas: 0, focos: 0 },
    );
  }, [agentRows]);

  const ranking = useMemo(() => {
    return [...agentRows].slice(0, 10);
  }, [agentRows]);

  const handleExportCSV = () => {
    const rows = [
      ["Agente", "Trabalhados", "Fechados", "Recusas", "Focos"],
      ...agentRows.map((r) => [r.full_name, r.trabalhados, r.fechados, r.recusas, r.focos]),
    ];
    const csv = rows.map((r) => r.join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `producao-agentes-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exportação concluída");
  };

  const weeksOfCycle = weeks.filter((w) => cycleFilter === "all" || w.cycle_id === cycleFilter);

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <div className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <Filter className="h-3.5 w-3.5 text-slate-500" />
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Filtros</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <Select value={cycleFilter} onValueChange={setCycleFilter}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Ciclo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os ciclos</SelectItem>
              {cycles.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name || `Ciclo ${c.number}/${c.year}`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={weekFilter} onValueChange={setWeekFilter}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Semana" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as semanas</SelectItem>
              {weeksOfCycle.map((w) => (
                <SelectItem key={w.id} value={w.id}>Semana {w.number}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Agente" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os agentes</SelectItem>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.full_name || "Sem nome"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Totais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Trabalhados" value={totals.trabalhados} color="#185fa5" />
        <KPI label="Fechados" value={totals.fechados} color="#3b6d11" />
        <KPI label="Recusas" value={totals.recusas} color="#a32d2d" />
        <KPI label="Focos" value={totals.focos} color="#dc2626" />
      </div>

      <Tabs defaultValue="producao" className="w-full">
        <TabsList className="grid grid-cols-3 w-full bg-slate-100">
          <TabsTrigger value="producao" className="text-xs">Produção</TabsTrigger>
          <TabsTrigger value="ranking" className="text-xs">Ranking</TabsTrigger>
          <TabsTrigger value="pendencias" className="text-xs">Pendências</TabsTrigger>
        </TabsList>

        <TabsContent value="producao" className="mt-3 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <Users className="h-3.5 w-3.5" /> Produção por agente
            </h3>
            <Button size="sm" variant="outline" onClick={handleExportCSV} className="h-8 text-xs">
              <FileDown className="h-3.5 w-3.5 mr-1" /> CSV
            </Button>
          </div>
          {loading ? (
            <div className="py-12 text-center text-slate-400 text-sm">Carregando...</div>
          ) : agentRows.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm bg-white rounded-2xl border border-slate-100">
              Sem dados no filtro atual.
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr className="text-left text-[10px] font-black uppercase tracking-wider text-slate-500">
                    <th className="p-2">Agente</th>
                    <th className="p-2 text-center">Trab.</th>
                    <th className="p-2 text-center">Fech.</th>
                    <th className="p-2 text-center">Rec.</th>
                    <th className="p-2 text-center">Focos</th>
                  </tr>
                </thead>
                <tbody>
                  {agentRows.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="p-2 font-bold text-slate-800 truncate max-w-[140px]">{r.full_name}</td>
                      <td className="p-2 text-center font-bold">{r.trabalhados}</td>
                      <td className="p-2 text-center">{r.fechados}</td>
                      <td className="p-2 text-center">{r.recusas}</td>
                      <td className="p-2 text-center text-red-600 font-bold">{r.focos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="ranking" className="mt-3 space-y-2">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <Trophy className="h-3.5 w-3.5" /> Top 10 produtividade
          </h3>
          <div className="space-y-2">
            {ranking.map((r, i) => (
              <div key={r.id} className="bg-white rounded-xl p-3 border border-slate-100 flex items-center gap-3">
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center font-black text-sm ${i === 0 ? "bg-amber-100 text-amber-700" : i === 1 ? "bg-slate-200 text-slate-700" : i === 2 ? "bg-orange-100 text-orange-700" : "bg-slate-50 text-slate-500"}`}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{r.full_name}</p>
                  <p className="text-[10px] text-slate-400">
                    {r.trabalhados} trabalhados · {r.focos} focos
                  </p>
                </div>
                <Badge className="bg-emerald-100 text-emerald-700 border-none text-xs font-black">
                  {r.trabalhados}
                </Badge>
              </div>
            ))}
            {ranking.length === 0 && (
              <div className="py-12 text-center text-slate-400 text-sm bg-white rounded-2xl border border-slate-100">
                Sem dados de ranking.
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="pendencias" className="mt-3">
          <div className="bg-white rounded-2xl p-4 border border-slate-100">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Pendências da equipe
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-amber-50 rounded-xl p-3">
                <MapPin className="h-4 w-4 text-amber-600" />
                <p className="text-2xl font-black text-amber-700 mt-1">
                  {agents.length}
                </p>
                <p className="text-[10px] font-bold text-amber-700/70 uppercase tracking-wider mt-1">
                  Agentes na equipe
                </p>
              </div>
              <div className="bg-rose-50 rounded-xl p-3">
                <AlertTriangle className="h-4 w-4 text-rose-600" />
                <p className="text-2xl font-black text-rose-700 mt-1">{totals.focos}</p>
                <p className="text-[10px] font-bold text-rose-700/70 uppercase tracking-wider mt-1">
                  Focos no período
                </p>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-3">
              Use a aba <strong>Equipe</strong> para abrir o detalhe de cada agente.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KPI({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm">
      <TrendingUp className="h-4 w-4" style={{ color }} />
      <p className="text-2xl font-black text-slate-900 mt-1.5 leading-none">{value}</p>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">{label}</p>
    </div>
  );
}
