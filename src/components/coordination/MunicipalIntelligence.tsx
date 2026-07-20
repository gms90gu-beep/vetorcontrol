import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { listRemoteOrCache } from "@/lib/offline/repos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "@tanstack/react-router";
import {
  Building2,
  Users,
  Activity,
  AlertTriangle,
  TrendingUp,
  MapPin,
  FileDown,
  Layers,
  CalendarRange,
} from "lucide-react";
import { toast } from "sonner";

export function MunicipalIntelligence() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const [supervisors, setSupervisors] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [visits, setVisits] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [cycles, setCycles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [visitsTruncated, setVisitsTruncated] = useState(false);

  const VISITS_LIMIT = 20000;

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [profs, vs, props, cs] = await Promise.all([
          listRemoteOrCache<any>({ name: "profiles", remote: async () => await supabase.from("profiles").select("id, full_name, email, city, role, supervisor_id, coordinator_id, is_active") }),
          // Sem filtro de período: dado cresce sem limite ao longo dos anos.
          // Aplica um teto de segurança + ordena mais recentes primeiro, pra
          // não travar o dashboard nem estourar o tamanho de resposta.
          listRemoteOrCache<any>({ name: "visits", remote: async () => await supabase.from("visits").select("id, agent_id, status, has_focus, visit_date, cycle_id, property_id").order("visit_date", { ascending: false }).limit(VISITS_LIMIT) }),
          listRemoteOrCache<any>({ name: "properties", remote: async () => await supabase.from("properties").select("id, neighborhood, block_id") }),
          listRemoteOrCache<any>({ name: "cycles", remote: async () => await supabase.from("cycles").select("id, name, year, number, status").order("year", { ascending: false }) }),
        ]);
        const sups = (profs || []).filter((p: any) => p.role === "supervisor");
        const ags = (profs || []).filter((p: any) => p.role === "agente");
        setSupervisors(sups);
        setAgents(ags);
        setVisits(vs || []);
        setVisitsTruncated((vs || []).length >= VISITS_LIMIT);
        setProperties(props || []);
        setCycles(cs || []);
      } catch (e) {
        console.error(e);
        toast.error("Erro ao carregar dados municipais");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Indicadores Gerais
  const totals = useMemo(() => {
    const trabalhados = visits.length;
    const focos = visits.filter((v) => v.has_focus).length;
    const fechados = visits.filter((v) => v.status === "closed").length;
    const recusas = visits.filter((v) => v.status === "refused").length;
    const totalProps = properties.length;
    const visitedPropIds = new Set(visits.map((v) => v.property_id));
    const coverage = totalProps > 0 ? Math.round((visitedPropIds.size / totalProps) * 100) : 0;
    return { trabalhados, focos, fechados, recusas, totalProps, coverage };
  }, [visits, properties]);

  // Cobertura por bairro
  const neighborhoods = useMemo(() => {
    const map = new Map<string, { total: number; visited: Set<string> }>();
    properties.forEach((p) => {
      const key = p.neighborhood || "Não informado";
      if (!map.has(key)) map.set(key, { total: 0, visited: new Set() });
      const e = map.get(key)!;
      e.total += 1;
    });
    visits.forEach((v) => {
      const prop = properties.find((p) => p.id === v.property_id);
      if (!prop) return;
      const key = prop.neighborhood || "Não informado";
      if (map.has(key)) map.get(key)!.visited.add(v.property_id);
    });
    return Array.from(map.entries())
      .map(([name, e]) => ({
        name,
        total: e.total,
        visited: e.visited.size,
        pct: e.total > 0 ? Math.round((e.visited.size / e.total) * 100) : 0,
      }))
      .sort((a, b) => a.pct - b.pct);
  }, [properties, visits]);

  // Indicadores por supervisor
  const supervisorRows = useMemo(() => {
    return supervisors.map((s) => {
      const team = agents.filter((a) => a.supervisor_id === s.id);
      const teamIds = team.map((a) => a.id);
      const tv = visits.filter((v) => teamIds.includes(v.agent_id));
      return {
        ...s,
        team: team.length,
        trabalhados: tv.length,
        focos: tv.filter((v) => v.has_focus).length,
        fechados: tv.filter((v) => v.status === "closed").length,
      };
    }).sort((a, b) => b.trabalhados - a.trabalhados);
  }, [supervisors, agents, visits]);

  // Por ciclo
  const cycleRows = useMemo(() => {
    return cycles.map((c) => {
      const cv = visits.filter((v) => v.cycle_id === c.id);
      const visitedPropIds = new Set(cv.map((v) => v.property_id));
      const pct = totals.totalProps > 0 ? Math.round((visitedPropIds.size / totals.totalProps) * 100) : 0;
      return {
        ...c,
        trabalhados: cv.length,
        focos: cv.filter((v) => v.has_focus).length,
        pct,
      };
    });
  }, [cycles, visits, totals.totalProps]);

  const handleExportCSV = () => {
    const rows = [
      ["Tipo", "Nome", "Total", "Trabalhados", "Focos", "%"],
      ...supervisorRows.map((s) => ["Supervisor", s.full_name, s.team, s.trabalhados, s.focos, "—"]),
      ...neighborhoods.map((n) => ["Bairro", n.name, n.total, n.visited, "—", `${n.pct}%`]),
      ...cycleRows.map((c) => ["Ciclo", c.name, totals.totalProps, c.trabalhados, c.focos, `${c.pct}%`]),
    ];
    const csv = rows.map((r) => r.join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inteligencia-municipal-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exportação concluída");
  };

  return (
    <div className="min-h-screen bg-[#f4f5f7] -mx-4 md:-mx-0">
      <div className="bg-[#0b1520] text-white px-4 py-5">
        <Badge className="bg-amber-500/15 text-amber-400 border-none mb-2 text-[10px] font-black tracking-widest">
          CENTRAL DE INTELIGÊNCIA MUNICIPAL
        </Badge>
        <h1 className="text-2xl font-black">Painel do Coordenador</h1>
        <p className="text-xs text-white/60 mt-1">
          Visão estratégica da sua coordenação
        </p>
        <p className="text-[10px] text-white/40 mt-2 uppercase tracking-widest">
          {role} · {user?.email}
        </p>
      </div>

      <div className="px-4 py-5 space-y-5 pb-24">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPI label="Cobertura" value={`${totals.coverage}%`} icon={Activity} color="#0d7a5f" />
          <KPI label="Imóveis trab." value={totals.trabalhados} icon={Building2} color="#185fa5" />
          <KPI label="Focos" value={totals.focos} icon={AlertTriangle} color="#dc2626" />
          <KPI label="Recusas" value={totals.recusas} icon={Users} color="#a32d2d" />
        </div>

        {visitsTruncated && (
          <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            Limite de {VISITS_LIMIT.toLocaleString("pt-BR")} visitas atingido — os indicadores acima consideram só as mais recentes.
          </p>
        )}

        <Tabs defaultValue="bairros" className="w-full">
          <TabsList className="grid grid-cols-4 w-full bg-slate-100">
            <TabsTrigger value="bairros" className="text-xs">Bairros</TabsTrigger>
            <TabsTrigger value="supervisores" className="text-xs">Supervisores</TabsTrigger>
            <TabsTrigger value="ciclos" className="text-xs">Ciclos</TabsTrigger>
            <TabsTrigger value="acoes" className="text-xs">Ações</TabsTrigger>
          </TabsList>

          {/* Bairros */}
          <TabsContent value="bairros" className="mt-3 space-y-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5" /> Cobertura por bairro
            </h3>
            {loading ? (
              <div className="py-12 text-center text-slate-400 text-sm">Carregando...</div>
            ) : neighborhoods.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm bg-white rounded-2xl border border-slate-100">
                Sem dados de bairros.
              </div>
            ) : (
              <div className="space-y-2">
                {neighborhoods.map((n) => (
                  <div key={n.name} className="bg-white rounded-xl p-3 border border-slate-100">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-sm font-bold text-slate-900 truncate">{n.name}</p>
                      <div className="flex items-center gap-2">
                        {n.pct < 50 && (
                          <Badge className="bg-rose-100 text-rose-700 border-none text-[9px] font-black">
                            CRÍTICO
                          </Badge>
                        )}
                        <span className={`text-sm font-black ${n.pct < 50 ? "text-rose-700" : n.pct < 80 ? "text-amber-700" : "text-emerald-700"}`}>
                          {n.pct}%
                        </span>
                      </div>
                    </div>
                    <Progress
                      value={n.pct}
                      className="h-1.5"
                      indicatorClassName={n.pct < 50 ? "bg-rose-500" : n.pct < 80 ? "bg-amber-500" : "bg-emerald-500"}
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      {n.visited} / {n.total} imóveis
                    </p>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Supervisores */}
          <TabsContent value="supervisores" className="mt-3 space-y-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <Layers className="h-3.5 w-3.5" /> Indicadores por supervisor
            </h3>
            {supervisorRows.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm bg-white rounded-2xl border border-slate-100">
                Nenhum supervisor cadastrado.
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr className="text-left text-[10px] font-black uppercase tracking-wider text-slate-500">
                      <th className="p-2">Supervisor</th>
                      <th className="p-2 text-center">Equipe</th>
                      <th className="p-2 text-center">Trab.</th>
                      <th className="p-2 text-center">Focos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supervisorRows.map((s) => (
                      <tr key={s.id} className="border-t border-slate-100">
                        <td className="p-2 font-bold text-slate-800 truncate max-w-[140px]">{s.full_name}</td>
                        <td className="p-2 text-center">{s.team}</td>
                        <td className="p-2 text-center font-bold">{s.trabalhados}</td>
                        <td className="p-2 text-center text-red-600 font-bold">{s.focos}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          {/* Ciclos */}
          <TabsContent value="ciclos" className="mt-3 space-y-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <CalendarRange className="h-3.5 w-3.5" /> Indicadores por ciclo
            </h3>
            <div className="space-y-2">
              {cycleRows.map((c) => (
                <div key={c.id} className="bg-white rounded-xl p-3 border border-slate-100">
                  <div className="flex items-center justify-between mb-1.5">
                    <div>
                      <p className="text-sm font-bold text-slate-900">{c.name}</p>
                      <p className="text-[10px] text-slate-400">
                        {c.trabalhados} visitas · {c.focos} focos
                      </p>
                    </div>
                    <Badge
                      className={`border-none text-[9px] font-black ${
                        c.status === "in_progress"
                          ? "bg-emerald-100 text-emerald-700"
                          : c.status === "finished"
                            ? "bg-slate-200 text-slate-700"
                            : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {c.status === "in_progress" ? "EM ANDAMENTO" : c.status === "finished" ? "CONCLUÍDO" : "AGUARDANDO"}
                    </Badge>
                  </div>
                  <Progress value={c.pct} className="h-1.5" indicatorClassName="bg-blue-500" />
                  <p className="text-[10px] text-right text-slate-500 font-bold mt-1">{c.pct}% concluído</p>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Ações */}
          <TabsContent value="acoes" className="mt-3 space-y-3">
            <div className="bg-white rounded-2xl p-4 border border-slate-100">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 mb-3">
                Exportações & Relatórios
              </h3>
              <div className="grid grid-cols-1 gap-2">
                <Button onClick={handleExportCSV} variant="outline" className="justify-start">
                  <FileDown className="h-4 w-4 mr-2" /> Exportar consolidado (CSV)
                </Button>
                <Button onClick={() => navigate({ to: "/reports" })} variant="outline" className="justify-start">
                  <TrendingUp className="h-4 w-4 mr-2" /> Relatórios gerenciais
                </Button>
                <Button onClick={() => navigate({ to: "/map" })} variant="outline" className="justify-start">
                  <MapPin className="h-4 w-4 mr-2" /> Mapa estratégico
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function KPI({ label, value, icon: Icon, color }: { label: string; value: any; icon: any; color: string }) {
  return (
    <div className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm">
      <Icon className="h-4 w-4" style={{ color }} />
      <p className="text-2xl font-black text-slate-900 mt-1.5 leading-none">{value}</p>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">{label}</p>
    </div>
  );
}
