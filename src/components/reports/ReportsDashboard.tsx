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
      const productionByWeek = [
        { name: 'Semana 1', trabalhados: 45, fechados: 5 },
        { name: 'Semana 2', trabalhados: 52, fechados: 8 },
        { name: 'Semana 3', trabalhados: 48, fechados: 4 },
        { name: 'Semana 4', trabalhados: 61, fechados: 12 },
      ];

      // Process Deposits (mocking distribution)
      const depositCounts: Record<string, number> = {};
      visits.forEach(v => {
        v.visit_deposits?.forEach((d: any) => {
          depositCounts[d.type_code] = (depositCounts[d.type_code] || 0) + 1;
        });
      });

      const deposits = Object.entries(depositCounts).map(([name, value]) => ({ name, value }));
      if (deposits.length === 0) {
        deposits.push(
          { name: 'A1', value: 35 },
          { name: 'B', value: 25 },
          { name: 'C', value: 15 },
          { name: 'D1', value: 20 },
          { name: 'E', value: 5 }
        );
      }

      // Process Coverage (Mock)
      const coverageMock = [
        { name: 'Visitados', value: coverage },
        { name: 'Pendente', value: 100 - coverage }
      ];

      // Process Evolution (Mock)
      const evolution = Array.from({ length: 14 }).map((_, i) => ({
        date: format(subDays(new Date(), 13 - i), 'dd/MM'),
        visitas: Math.floor(Math.random() * 40) + 10
      }));

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

  const handleExportPDF = () => {
    toast.info("Preparando PDF para exportação...");
    // Future implementation: PDF generation logic
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 uppercase">Dashboard Operacional</h2>
          <p className="text-sm font-medium text-slate-500">Inteligência de campo e análise de ciclo</p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            onClick={handleExportPDF}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-2xl h-12 px-6 font-black shadow-lg shadow-blue-100 transition-all active:scale-95 text-xs uppercase tracking-widest"
          >
            <Printer className="mr-2 h-4 w-4" /> Exportar PDF
          </Button>
          <Button 
            variant="outline"
            className="border-slate-200 hover:bg-slate-50 text-slate-600 rounded-2xl h-12 px-6 font-black transition-all active:scale-95 text-xs uppercase tracking-widest"
          >
            <Share2 className="mr-2 h-4 w-4" /> Compartilhar
          </Button>
        </div>
      </div>

      <ReportsFilters onFilterChange={setFilters} />

      <OperationalKPIs data={kpiData} isLoading={isLoading} />

      <OperationalCharts 
        productionData={chartData.production}
        depositData={chartData.deposits}
        coverageData={chartData.coverage}
        evolutionData={chartData.evolution}
        pendencyData={chartData.pendencies}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-20">
        <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-10 opacity-10 group-hover:scale-110 transition-transform duration-500">
            <LayoutDashboard className="h-40 w-40" />
          </div>
          <h3 className="text-xl font-black uppercase tracking-tighter mb-2">Modo Supervisão</h3>
          <p className="text-slate-400 text-sm mb-6 max-w-xs font-medium">Análise completa da equipe, ranking de produtividade e acompanhamento de áreas pendentes.</p>
          <Button className="bg-white text-slate-900 hover:bg-slate-100 rounded-2xl h-12 px-8 font-black uppercase tracking-widest text-xs">
            Acessar Painel Supervisor
          </Button>
        </div>

        <div className="bg-blue-600 rounded-[2.5rem] p-8 text-white relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-10 opacity-10 group-hover:scale-110 transition-transform duration-500">
            <FileText className="h-40 w-40" />
          </div>
          <h3 className="text-xl font-black uppercase tracking-tighter mb-2">Relatórios Oficiais</h3>
          <p className="text-blue-100 text-sm mb-6 max-w-xs font-medium">Geração automática de boletins semanais e anuais em formato oficial para envio institucional.</p>
          <Button className="bg-white/20 hover:bg-white/30 text-white backdrop-blur-sm border border-white/20 rounded-2xl h-12 px-8 font-black uppercase tracking-widest text-xs">
            Gerar Boletim Semanal
          </Button>
        </div>
      </div>
    </div>
  );
}
