import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ReportsFilters } from "./ReportsFilters";
import { OperationalKPIs } from "./OperationalKPIs";
import { OperationalCharts } from "./OperationalCharts";
import { Button } from "@/components/ui/button";
import { Download, Share2, Printer, LayoutDashboard, FileText, ChevronRight, BarChart3, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { generateOperationalPDF } from "./PDFReportGenerator";
import { useOperationalDate } from "@/hooks/useOperationalDate";
import { Badge } from "@/components/ui/badge";
import { generateWeeklyReportPDF, openWhatsAppShare } from "./WeeklyReportGenerator";
import { getActiveCycleForUser } from "@/lib/active-cycle";
import { getEpiWeek } from "@/lib/cycle-week";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function ReportsDashboard() {
  const [isLoading, setIsLoading] = useState(true);
  const { userRole } = useOperationalDate();
  const [filters, setFilters] = useState({
    agent: "all",
    cycle: "all",
    area: "all",
    week: "all"
  });
  const [activeCycleId, setActiveCycleId] = useState<string | null>(null);
  const [dailies, setDailies] = useState<any[]>([]);

  const [kpiData, setKpiData] = useState({
    worked: 0,
    coverage: 0,
    focus: 0,
    treated: 0,
    productivity: 0
  });

  const [chartData, setChartData] = useState<{
    production: any[];
    deposits: any[];
    coverage: any[];
    evolution: any[];
    pendencies: any[];
  }>({
    production: [],
    deposits: [],
    coverage: [],
    evolution: [],
    pendencies: []
  });

  // Carrega o ciclo ativo e força como filtro padrão (evita misturar ciclos)
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const cycle = await getActiveCycleForUser(session?.user?.id);
      if (cycle?.id) {
        setActiveCycleId(cycle.id);
        setFilters(prev => prev.cycle === "all" ? { ...prev, cycle: cycle.id } : prev);
        console.log(`[CICLO] ReportsDashboard usando ciclo ${cycle.name || cycle.id}`);
      }
    })();
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [filters]);

  async function fetchDashboardData() {
    setIsLoading(true);
    try {
      // FONTE ÚNICA: daily_work_records. Não consultamos visits diretamente.
      let query = supabase.from("daily_work_records").select("*");

      const cycleFilter = filters.cycle !== "all" ? filters.cycle : activeCycleId;
      if (cycleFilter) query = query.eq("cycle_id", cycleFilter);
      if (filters.agent !== "all") query = query.eq("agent_id", filters.agent);

      const { data: records, error } = await query.order("work_date", { ascending: false });
      if (error) throw error;
      const rows = (records as any[]) || [];
      console.log(`[RELATORIOS_FONTE] daily_work_records=${rows.length} ciclo=${cycleFilter || "—"}`);

      setDailies(rows);

      const sum = (k: string) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
      const worked = sum("properties_worked");
      const treated = sum("deposits_treated");
      const focus = sum("positive_foci");
      const pending = sum("pending_visits");

      const visitable = worked + pending;
      const coverage = visitable > 0 ? Math.round((worked / visitable) * 100) : 0;
      const productivity = rows.length > 0 ? Math.round(worked / rows.length) : 0;

      setKpiData({ worked, coverage, focus, treated, productivity });

      // Depósitos por tipo (soma de todas as diárias)
      const deposits = [
        { name: "A1", value: sum("deposits_a1") },
        { name: "A2", value: sum("deposits_a2") },
        { name: "B",  value: sum("deposits_b")  },
        { name: "C",  value: sum("deposits_c")  },
        { name: "D1", value: sum("deposits_d1") },
        { name: "D2", value: sum("deposits_d2") },
        { name: "E",  value: sum("deposits_e")  },
      ].filter(d => d.value > 0);

      const coverageMock = [
        { name: "Visitados", value: coverage },
        { name: "Pendente", value: Math.max(0, 100 - coverage) },
      ];

      // Evolução por dia (a partir das diárias)
      const evolution = rows
        .slice()
        .sort((a: any, b: any) => String(a.work_date).localeCompare(String(b.work_date)))
        .map((r: any) => ({
          date: format(new Date(`${r.work_date}T12:00:00`), "dd/MM"),
          visitas: Number(r.properties_worked) || 0,
        }));

      setChartData({
        production: [],
        deposits,
        coverage: coverageMock,
        evolution,
        pendencies: [],
      });
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      toast.error("Erro ao carregar dados do dashboard");
    } finally {
      setIsLoading(false);
    }
  }

  const handleExportPDF = async () => {
    toast.info("Preparando PDF para exportação...");
    const success = await generateOperationalPDF("reports-content", kpiData);
    if (success) {
      toast.success("Relatório PDF exportado com sucesso!");
    } else {
      toast.error("Erro ao gerar PDF");
    }
  };

  const handleWeeklyReport = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    toast.info("Gerando Boletim Semanal...");
    const result = await generateWeeklyReportPDF(session.user.id);

    if (result) {
      toast.success(
        `Boletim Semanal SE ${result.epiWeek}/${result.epiYear} gerado — consolidado de ${result.dailyCount} relatório${result.dailyCount === 1 ? "" : "s"} diário${result.dailyCount === 1 ? "" : "s"}.`
      );
      result.pdf.save(result.fileName);
    }
  };

  const handleShareWhatsApp = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", session.user.id).single();
    
    const result = await generateWeeklyReportPDF(session.user.id);
    if (result) {
      openWhatsAppShare(result.fileName, profile?.full_name || "Agente");
    }
  };

  const isSupervisor = userRole === "supervisor" || userRole === "coordenador" || userRole === "admin_master";

  return (
    <div id="reports-content" className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-1">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge className="bg-blue-600 text-white font-black text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-md">VetorControl Intelligence</Badge>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">• Real Time Data</span>
          </div>
          <h2 className="text-4xl font-black tracking-tighter text-slate-900 uppercase">Inteligência Operacional</h2>
          <p className="text-sm font-bold text-slate-500 mt-1">Dashboards analíticos e cobertura territorial</p>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            onClick={handleExportPDF}
            className="bg-slate-900 hover:bg-slate-800 text-white rounded-2xl h-14 px-8 font-black shadow-xl shadow-slate-200 transition-all active:scale-95 text-xs uppercase tracking-widest"
          >
            <Printer className="mr-2 h-4 w-4" /> Exportar Relatório
          </Button>
          <Button 
            variant="outline"
            className="border-slate-200 bg-white hover:bg-slate-50 text-slate-600 rounded-2xl h-14 w-14 p-0 flex items-center justify-center shadow-md transition-all active:scale-95"
          >
            <Share2 className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <ReportsFilters onFilterChange={setFilters} className="reports-filters" />

      <OperationalKPIs data={kpiData} isLoading={isLoading} />

      <OperationalCharts 
        productionData={chartData.production}
        depositData={chartData.deposits}
        coverageData={chartData.coverage}
        evolutionData={chartData.evolution}
        pendencyData={chartData.pendencies}
      />

      {/* Ranking de Produtividade (Preview) */}
      <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-black uppercase tracking-tighter text-slate-800">Ranking de Produtividade</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Top performance da semana</p>
          </div>
          <Button variant="ghost" className="text-blue-600 font-bold text-xs">Ver todos</Button>
        </div>
        <div className="space-y-4">
          {chartData.production.length > 0 ? chartData.production.slice(0, 3).map((agent: any, i) => (
            <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100/50">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center font-black text-slate-400 text-xs">#{i+1}</div>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">{agent.name || "Agente"}</h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{agent.visits || 0} visitas</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-black text-emerald-600">{agent.coverage || 0}%</p>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Cobertura</p>
              </div>
            </div>
          )) : (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <BarChart3 className="h-10 w-10 mb-3 opacity-20" />
              <p className="text-xs font-black uppercase tracking-widest">Nenhum dado de produtividade disponível</p>
              <p className="text-[10px] font-bold opacity-60 mt-1 uppercase">Os dados aparecerão assim que as visitas forem registradas</p>
            </div>
          )}
        </div>
      </div>

      {(isSupervisor || true) && ( // Allow viewing for now to test
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-[3rem] p-10 text-white relative overflow-hidden group shadow-2xl shadow-slate-200">
            <div className="absolute top-0 right-0 p-12 opacity-10 group-hover:scale-110 transition-transform duration-700">
              <LayoutDashboard className="h-48 w-48" />
            </div>
            <div className="relative z-10">
              <Badge className="bg-emerald-500 mb-6 font-black uppercase tracking-widest text-[9px]">Acesso Supervisor</Badge>
              <h3 className="text-3xl font-black uppercase tracking-tighter mb-4 leading-none">Painel de<br/>Alta Performance</h3>
              <p className="text-slate-400 text-sm mb-8 max-w-xs font-medium leading-relaxed">Monitore o ranking da equipe, identifique gargalos operacionais e acompanhe o progresso de cada área em tempo real.</p>
              <Button className="bg-white text-slate-900 hover:bg-slate-100 rounded-[1.25rem] h-14 px-10 font-black uppercase tracking-widest text-xs shadow-lg shadow-white/10 group-hover:translate-x-2 transition-transform">
                Entrar no Modo Supervisão <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="bg-gradient-to-br from-blue-700 via-blue-600 to-blue-800 rounded-[3rem] p-10 text-white relative overflow-hidden group shadow-2xl shadow-blue-200">
            <div className="absolute top-0 right-0 p-12 opacity-10 group-hover:scale-110 transition-transform duration-700">
              <FileText className="h-48 w-48" />
            </div>
            <div className="relative z-10">
              <Badge className="bg-white/20 backdrop-blur-md mb-6 font-black uppercase tracking-widest text-[9px]">Geração de Documentos</Badge>
              <h3 className="text-3xl font-black uppercase tracking-tighter mb-4 leading-none">Boletins Oficiais<br/>Automáticos</h3>
              <p className="text-blue-100 text-sm mb-8 max-w-xs font-medium leading-relaxed">Gere boletins semanais e consolidados de ciclo seguindo as normas oficiais do Ministério da Saúde com um clique.</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button 
                  onClick={handleWeeklyReport}
                  className="bg-white/20 hover:bg-white/30 text-white backdrop-blur-sm border border-white/20 rounded-[1.25rem] h-14 px-8 font-black uppercase tracking-widest text-xs transition-all active:scale-95"
                >
                  <Download className="mr-2 h-4 w-4" /> Baixar PDF
                </Button>
                <Button 
                  onClick={handleShareWhatsApp}
                  className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100 backdrop-blur-sm border border-emerald-500/20 rounded-[1.25rem] h-14 px-8 font-black uppercase tracking-widest text-xs transition-all active:scale-95"
                >
                  <Share2 className="mr-2 h-4 w-4" /> WhatsApp
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
