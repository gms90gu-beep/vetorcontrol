import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { readAllQueryPages } from "@/lib/query-pages";
import { productionTotals, visitActivity } from "@/lib/management-metrics";
import { downloadCSV } from "@/lib/institutional-export";
import { filterPendencies } from "@/lib/pendency-scope";
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
  Filter,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { listPermittedAgentProfiles } from "@/lib/permitted-agents";
import { getActiveCycleForUser } from "@/lib/active-cycle";

type AgentRow = {
  id: string;
  full_name: string;
  trabalhados: number;
  fechados: number;
  recusas: number;
  focos: number;
};

type PendencyRow = {
  id: string;
  agent_id: string;
  current_status: string;
  resolved_at: string | null;
  reason: string | null;
  created_at: string;
  cycle_id: string | null;
  week_id: string | null;
};


export function OperationalDashboard() {
  const { user, role } = useAuth();
  const [agents, setAgents] = useState<any[]>([]);
  const [dailies, setDailies] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [visits, setVisits] = useState<any[]>([]);
  const [cycles, setCycles] = useState<any[]>([]);
  const [weeks, setWeeks] = useState<any[]>([]);
  const [pendencies, setPendencies] = useState<PendencyRow[]>([]);
  const [cycleFilter, setCycleFilter] = useState<string>("all");
  const [weekFilter, setWeekFilter] = useState<string>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id || !role) return;
    let cancelled = false;
    setLoading(true); setError(null);
    (async () => {
      try {
        const permittedProfiles = await listPermittedAgentProfiles(user.id, role);
        const permittedIds = permittedProfiles.map((p) => p.id);
        const links = permittedIds.length ? await readAllQueryPages<any>(supabase.from("agents").select("id,profile_id").in("profile_id", permittedIds).order("id")) : [];
        const visitIds = [...permittedIds, ...links.map((r) => r.id)];
        const [vs, records, cs, ws, pends, active] = await Promise.all([
          visitIds.length ? readAllQueryPages<any>(supabase.from("visits").select("*,visit_deposits(is_positive)").in("agent_id", visitIds).order("id")) : [],
          permittedIds.length ? readAllQueryPages<any>(supabase.from("daily_work_records").select("*").in("agent_id", permittedIds).order("id")) : [],
          readAllQueryPages<any>(supabase.from("cycles").select("id,name,year,number").order("id")),
          readAllQueryPages<any>(supabase.from("weeks").select("id,number,cycle_id,start_date,end_date").order("id")),
          permittedIds.length ? readAllQueryPages<any>(supabase.from("property_pendencies").select("*").in("agent_id", permittedIds).is("resolved_at", null).order("id")) : [],
          getActiveCycleForUser(user.id),
        ]);
        if (cancelled) return;
        const legacy = new Map(links.map((r) => [r.id, r.profile_id]));
        setAgents(permittedProfiles); setDailies(records);
        setVisits(vs.map((v) => ({ ...v, agent_id: legacy.get(v.agent_id) ?? v.agent_id })).filter((v) => permittedIds.includes(v.agent_id)));
        setCycles(cs); setWeeks(ws); setPendencies(pends);
        if (!updatedAt && active?.id) { setCycleFilter(active.id); setWeekFilter("all"); }
        setUpdatedAt(new Date().toLocaleString("pt-BR"));
      } catch (e: any) {
        if (!cancelled) { setError(e.message || "Erro ao carregar dados operacionais"); setVisits([]); setDailies([]); setPendencies([]); }
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [user?.id, role, reload]);

  const filteredDailies = useMemo(() => dailies.filter((r) =>
    (cycleFilter === "all" || r.cycle_id === cycleFilter) &&
    (weekFilter === "all" || r.week_id === weekFilter) &&
    (agentFilter === "all" || r.agent_id === agentFilter)), [dailies, cycleFilter, weekFilter, agentFilter]);

  const filteredVisits = useMemo(() => {
    return visits.filter((v) => {
      if (cycleFilter !== "all" && v.cycle_id !== cycleFilter) return false;
      if (weekFilter !== "all" && v.week_id !== weekFilter) return false;
      if (agentFilter !== "all" && v.agent_id !== agentFilter) return false;
      return true;
    });
  }, [visits, cycleFilter, weekFilter, agentFilter]);

  const agentRows: AgentRow[] = useMemo(() => agents.map((a) => {
    const totals = productionTotals(filteredDailies.filter((r) => r.agent_id === a.id));
    return { id: a.id, full_name: a.full_name || "Sem nome", trabalhados: totals.worked,
      fechados: totals.closed, recusas: totals.refused, focos: totals.positive };
  }).filter((r) => r.trabalhados || r.fechados || r.recusas || r.focos || agentFilter === r.id)
    .sort((a, b) => b.trabalhados - a.trabalhados), [agents, filteredDailies, agentFilter]);
  const activity = useMemo(() => visitActivity(filteredVisits), [filteredVisits]);
  const production = useMemo(() => productionTotals(filteredDailies), [filteredDailies]);

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

  const handleExportCSV = () => downloadCSV(`producao-oficial-${cycleFilter}-${weekFilter}.csv`,
    ["Agente", "Trabalhados", "Fechados", "Recusas", "Focos positivos"],
    agentRows.map((r) => [r.full_name, r.trabalhados, r.fechados, r.recusas, r.focos]));

  const weeksOfCycle = weeks.filter((w) => cycleFilter === "all" || w.cycle_id === cycleFilter);

  const filteredPendencies = useMemo(() => filterPendencies(pendencies, {
    cycleId: cycleFilter === "all" ? null : cycleFilter,
    weekId: weekFilter === "all" ? null : weekFilter,
    agentId: agentFilter === "all" ? null : agentFilter,
    onlyOpen: true,
  }), [pendencies, cycleFilter, weekFilter, agentFilter]);

  const pendencyStats = useMemo(() => {
    const byAgent = new Map<string, number>();
    const byStatus: Record<string, number> = {};
    for (const p of filteredPendencies) {
      byAgent.set(p.agent_id, (byAgent.get(p.agent_id) || 0) + 1);
      byStatus[p.current_status] = (byStatus[p.current_status] || 0) + 1;
    }
    const byAgentRows = Array.from(byAgent.entries())
      .map(([agentId, count]) => ({
        agentId,
        fullName: agents.find((a) => a.id === agentId)?.full_name || "Agente removido",
        count,
      }))
      .sort((a, b) => b.count - a.count);
    return { total: filteredPendencies.length, byStatus, byAgentRows };
  }, [filteredPendencies, agents]);

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <div className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <Filter className="h-3.5 w-3.5 text-slate-500" />
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Filtros</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <Select value={cycleFilter} onValueChange={(id) => { setCycleFilter(id); setWeekFilter("all"); }}>
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

      <div className="text-xs text-slate-600 space-y-2">
        <p>Escopo: {role === "admin_master" ? "Admin Master — agentes cadastrados" : role === "coordenador" ? "Equipes vinculadas ao coordenador" : "Minha equipe"} · {cycleFilter === "all" ? "Todos os ciclos" : cycles.find((c) => c.id === cycleFilter)?.name || "Ciclo selecionado"} · {weekFilter === "all" ? "Todo o período do ciclo" : `Semana ${weeks.find((w) => w.id === weekFilter)?.number}`} · {agentFilter === "all" ? "Todos os agentes autorizados" : agents.find((a) => a.id === agentFilter)?.full_name}</p>
        <p>Produção oficial: diárias encerradas ({production.dailyCount}). Atividade: visitas registradas, inclusive trabalho em andamento. Fonte: servidor · atualização: {updatedAt || "aguardando"}.</p>
        <Button size="sm" variant="outline" disabled={loading} onClick={() => setReload((n) => n + 1)}>Atualizar</Button>
        {error && <p role="alert" className="text-red-700">{error}. Tente atualizar; os totais não estão disponíveis.</p>}
        {!!production.unfinished && <p className="text-amber-700">{production.unfinished} diária(s) aberta(s) excluída(s) da produção oficial.</p>}
      </div>
      {!loading && !error && <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Visitas registradas" value={activity.visits} color="#185fa5" />
        <KPI label="Imóveis únicos nas visitas" value={activity.uniqueProperties} color="#185fa5" />
        <KPI label="Focos encontrados" value={activity.found} color="#d97706" />
        <KPI label="Análises pendentes" value={activity.pending} color="#d97706" />
        <KPI label="Coletas positivas" value={activity.positive} color="#dc2626" />
        <KPI label="Coletas negativas" value={activity.negative} color="#3b6d11" />
        <KPI label="Inconclusivas" value={activity.inconclusive} color="#64748b" />
      </div>}
      <h3 className="text-sm font-bold">Produção oficial — soma das diárias encerradas</h3>
      {/* Totais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" aria-busy={loading}>
        <KPI label="Trabalhados" value={loading || error ? "—" : totals.trabalhados} color="#185fa5" />
        <KPI label="Fechados" value={loading || error ? "—" : totals.fechados} color="#3b6d11" />
        <KPI label="Recusas" value={loading || error ? "—" : totals.recusas} color="#a32d2d" />
        <KPI label="Focos positivos" value={loading || error ? "—" : totals.focos} color="#dc2626" />
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
            <Button size="sm" variant="outline" onClick={handleExportCSV} disabled={loading || !!error || !agentRows.length} className="h-8 text-xs">
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
                    <th className="p-2 text-center">Focos+</th>
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
                    {r.trabalhados} trabalhados · {r.focos} focos positivos
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

        <TabsContent value="pendencias" className="mt-3 space-y-3">
          <div className="bg-white rounded-2xl p-4 border border-slate-100">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Pendências da equipe
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-amber-50 rounded-xl p-3">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <p className="text-2xl font-black text-amber-700 mt-1">{pendencyStats.total}</p>
                <p className="text-[10px] font-bold text-amber-700/70 uppercase tracking-wider mt-1">
                  Pendentes
                </p>
              </div>
              <div className="bg-red-50 rounded-xl p-3">
                <p className="text-2xl font-black text-red-700 mt-1">{pendencyStats.byStatus.refused ?? 0}</p>
                <p className="text-[10px] font-bold text-red-700/70 uppercase tracking-wider mt-1">
                  Recusados
                </p>
              </div>
              <div className="bg-slate-100 rounded-xl p-3">
                <p className="text-2xl font-black text-slate-700 mt-1">{pendencyStats.byStatus.absent ?? 0}</p>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">
                  Ausentes
                </p>
              </div>
              <div className="bg-purple-50 rounded-xl p-3">
                <p className="text-2xl font-black text-purple-700 mt-1">{pendencyStats.byStatus.not_located ?? 0}</p>
                <p className="text-[10px] font-bold text-purple-700/70 uppercase tracking-wider mt-1">
                  Não localizados
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="p-3 border-b border-slate-100">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-700">
                Pendências por agente
              </h3>
            </div>
            {pendencyStats.byAgentRows.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-sm">
                Nenhuma pendência em aberto na equipe.
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {pendencyStats.byAgentRows.map((r) => (
                  <div key={r.agentId} className="flex items-center justify-between px-3 py-2.5">
                    <span className="text-xs font-bold text-slate-800 truncate">{r.fullName}</span>
                    <Badge className="bg-amber-100 text-amber-700 border-none text-xs font-black">
                      {r.count}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="text-[10px] text-slate-400">
            Use a aba <strong>Equipe</strong> para abrir o detalhe de cada agente.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KPI({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm">
      <TrendingUp className="h-4 w-4" style={{ color }} />
      <p className="text-2xl font-black text-slate-900 mt-1.5 leading-none">{value}</p>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">{label}</p>
    </div>
  );
}
