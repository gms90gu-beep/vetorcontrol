import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ReportsFilters } from "./ReportsFilters";
import { OperationalKPIs } from "./OperationalKPIs";
import { OperationalCharts } from "./OperationalCharts";
import { Button } from "@/components/ui/button";
import { Download, Share2, Printer, LayoutDashboard, FileText, ChevronRight, Filter } from "lucide-react";
import { toast } from "sonner";
import { format, subDays } from "date-fns";
import { generateOperationalPDF } from "./PDFReportGenerator";
import { useOperationalDate } from "@/hooks/useOperationalDate";
import { Badge } from "@/components/ui/badge";

export function ReportsDashboard() {
  const [isLoading, setIsLoading] = useState(true);
  const { userRole } = useOperationalDate();
  const [filters, setFilters] = useState({
    agent: "all",
    cycle: "all",
    area: "all",
    week: "all"
  });

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

  useEffect(() => {
    fetchDashboardData();
  }, [filters]);

  async function fetchDashboardData() {
    setIsLoading(true);
    try {
      // Base query for visits
      let query = supabase.from("visits").select(`
        *,
        visit_deposits(*)
      `);

      if (filters.agent !== "all") query = query.eq("agent_id", filters.agent);
      if (filters.cycle !== "all") query = query.eq("cycle_id", filters.cycle);
      if (filters.week !== "all") query = query.eq("week_number", parseInt(filters.week));

      const { data: visits, error } = await query;

      if (error) throw error;

      // Process KPIs
      const worked = visits.length;
      const treated = visits.filter(v => v.treatment_applied).length;
      const focus = visits.filter(v => v.has_focus).length;
      
      // Mock coverage and productivity for now, but in real app we'd calculate vs total properties
      const coverage = worked > 0 ? Math.min(100, Math.round((worked / 500) * 100)) : 0;
      const productivity = worked > 0 ? Math.round(worked / 5) : 0; // average per day

      setKpiData({ worked, coverage, focus, treated, productivity });

      // Process Production Chart (by status)
      // Real implementation would group visits by week
      const productionByWeek: any[] = [];

      // Process Deposits
      const depositCounts: Record<string, number> = {};
      visits.forEach(v => {
        v.visit_deposits?.forEach((d: any) => {
          depositCounts[d.type_code] = (depositCounts[d.type_code] || 0) + 1;
        });
      });

      const deposits = Object.entries(depositCounts).map(([name, value]) => ({ name, value }));

      // Process Coverage
      const coverageMock = [
        { name: 'Visitados', value: coverage },
        { name: 'Pendente', value: Math.max(0, 100 - coverage) }
      ];

      // Process Evolution
      const evolution: any[] = [];
      // If we have visits, we could group them by day
      if (visits.length > 0) {
        const visitsByDate: Record<string, number> = {};
        visits.forEach(v => {
          const date = format(new Date(v.visit_date), 'dd/MM');
          visitsByDate[date] = (visitsByDate[date] || 0) + 1;
        });
        
        Object.entries(visitsByDate).forEach(([date, count]) => {
          evolution.push({ date, visitas: count });
        });
        evolution.sort((a, b) => a.date.localeCompare(b.date));
      }

      setChartData({
        production: productionByWeek,
        deposits,
        coverage: coverageMock,
        evolution,
        pendencies: []
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

  const isSupervisor = userRole === "supervisor" || userRole === "admin";

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
          {[].map((agent: any, i) => (
            <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100/50">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center font-black text-slate-400 text-xs">#{i+1}</div>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">{agent.name}</h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{agent.visits} visitas</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-black text-emerald-600">{agent.coverage}%</p>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Cobertura</p>
              </div>
            </div>
          ))}
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
              <Button className="bg-white/20 hover:bg-white/30 text-white backdrop-blur-sm border border-white/20 rounded-[1.25rem] h-14 px-10 font-black uppercase tracking-widest text-xs group-hover:translate-x-2 transition-transform">
                Gerar Boletim Semanal <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
