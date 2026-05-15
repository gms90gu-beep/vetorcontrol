import { createFileRoute, Link, ClientOnly } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  FileText, 
  Download, 
  Share2, 
  Eye, 
  Calendar, 
  BarChart3, 
  TrendingUp, 
  CheckCircle2, 
  XCircle, 
  Home, 
  AlertTriangle,
  ChevronRight,
  Printer
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  LineChart,
  Line
} from "recharts";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

function ReportsPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [activeCycle, setActiveCycle] = useState<any>(null);
  const [activeWeek, setActiveWeek] = useState<any>(null);
  
  // Mock data for the bulletin
  const [currentBulletin, setCurrentBulletin] = useState({
    week: 1,
    cycle: "01/2026",
    coverage: 65,
    blocksWorked: 8,
    propertiesWorked: 342,
    positiveFocus: 12,
    lastSync: "Hoje, 10:30"
  });

  useEffect(() => {
    fetchActivePeriod();
  }, []);

  async function fetchActivePeriod() {
    try {
      const { data: cycle } = await supabase
        .from("cycles")
        .select("*")
        .eq("status", "in_progress")
        .single();
      
      if (cycle) {
        setActiveCycle(cycle);
        const { data: week } = await supabase
          .from("weeks")
          .select("*")
          .eq("cycle_id", cycle.id)
          .order("number", { ascending: true })
          .limit(1)
          .single();
        
        if (week) setActiveWeek(week);
      }
    } catch (error) {
      console.error("Error fetching active period:", error);
    }
  }

  const productivityData = [
    { name: 'Seg', visitas: 45 },
    { name: 'Ter', visitas: 52 },
    { name: 'Qua', visitas: 48 },
    { name: 'Qui', visitas: 61 },
    { name: 'Sex', visitas: 55 },
  ];

  const depositData = [
    { name: 'A1/A2', value: 35 },
    { name: 'B', value: 25 },
    { name: 'C', value: 15 },
    { name: 'D1/D2', value: 20 },
    { name: 'E', value: 5 },
  ];

  const handleGeneratePDF = () => {
    setIsLoading(true);
    toast.info("Gerando Relatório de Ciclo...");
    
    setTimeout(() => {
      setIsLoading(false);
      toast.success("Relatório gerado com sucesso!");
    }, 2500);
  };

  return (
    <div className="pb-8 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-800 uppercase">Boletim Semanal</h2>
          <p className="text-sm font-medium text-slate-500">Resumo operacional automático</p>
        </div>
        <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 font-bold px-3 py-1 rounded-full">
          Semana {activeWeek?.number || 1}
        </Badge>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="border-none shadow-md bg-white rounded-3xl overflow-hidden">
          <CardContent className="p-4">
            <div className="bg-blue-100 p-2 rounded-xl w-fit mb-3">
              <Home className="h-4 w-4 text-blue-600" />
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Trabalhados</p>
            <p className="text-2xl font-black text-slate-800">{currentBulletin.propertiesWorked}</p>
          </CardContent>
        </Card>
        
        <Card className="border-none shadow-md bg-white rounded-3xl overflow-hidden">
          <CardContent className="p-4">
            <div className="bg-red-100 p-2 rounded-xl w-fit mb-3">
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Focos Positivos</p>
            <p className="text-2xl font-black text-red-600">{currentBulletin.positiveFocus}</p>
          </CardContent>
        </Card>
      </div>

      {/* Coverage Card */}
      <Card className="border-none shadow-xl bg-slate-900 text-white rounded-[2rem] overflow-hidden relative">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <TrendingUp className="h-24 w-24" />
        </div>
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center">
            <CardTitle className="text-lg font-bold uppercase tracking-tighter">Cobertura do Ciclo</CardTitle>
            <Badge className="bg-emerald-500 hover:bg-emerald-600 border-none font-bold">
              {currentBulletin.coverage}%
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Progress value={currentBulletin.coverage} className="h-3 bg-white/10" />
            <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
              <span>{activeCycle?.name || "Ciclo --"}</span>
              <span>{currentBulletin.blocksWorked} quarteirões concluídos</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-3 px-1">
        <Button 
          onClick={handleGeneratePDF}
          disabled={isLoading}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl h-14 font-black shadow-lg shadow-blue-200 uppercase tracking-widest text-xs"
        >
          {isLoading ? (
            <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
          ) : (
            <Printer className="mr-2 h-5 w-5" />
          )}
          Gerar Relatório de Ciclo
        </Button>
      </div>

      {/* Detailed Indicators */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-lg font-bold text-slate-800 uppercase tracking-tighter">Indicadores Detalhados</h3>
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          <IndicatorItem label="Fechados" value={18} icon={XCircle} color="text-orange-500" bgColor="bg-orange-50" />
          <IndicatorItem label="Recusados" value={4} icon={AlertTriangle} color="text-red-500" bgColor="bg-red-50" />
          <IndicatorItem label="Tratados" value={142} icon={CheckCircle2} color="text-emerald-500" bgColor="bg-emerald-50" />
          <IndicatorItem label="Eliminados" value={85} icon={BarChart3} color="text-blue-500" bgColor="bg-blue-50" />
        </div>
      </div>

      {/* Analytics Tabs */}
      <Tabs defaultValue="productivity" className="w-full">
        <TabsList className="w-full grid grid-cols-2 bg-slate-100 p-1 rounded-2xl mb-4">
          <TabsTrigger value="productivity" className="rounded-xl font-bold text-xs uppercase tracking-tighter">Produtividade</TabsTrigger>
          <TabsTrigger value="deposits" className="rounded-xl font-bold text-xs uppercase tracking-tighter">Depósitos</TabsTrigger>
        </TabsList>
        
        <TabsContent value="productivity">
          <Card className="border-none shadow-md rounded-3xl p-4">
            <h4 className="text-xs font-bold text-slate-400 mb-4 uppercase tracking-widest">Visitas por dia</h4>
            <div className="h-[200px] w-full">
              <ClientOnly fallback={<div className="h-full w-full bg-slate-50 rounded-2xl animate-pulse" />}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={productivityData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 900, fill: '#64748b'}} />
                    <Tooltip 
                      cursor={{fill: '#f8fafc'}}
                      contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                    />
                    <Bar dataKey="visitas" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ClientOnly>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="deposits">
          <Card className="border-none shadow-md rounded-3xl p-4">
            <h4 className="text-xs font-bold text-slate-400 mb-4 uppercase tracking-widest">Distribuição de Depósitos</h4>
            <div className="h-[200px] w-full flex items-center">
              <ClientOnly fallback={<div className="h-full w-1/2 bg-slate-50 rounded-full animate-pulse" />}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={depositData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {depositData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </ClientOnly>
              <div className="w-1/2 space-y-1 pl-4">
                {depositData.map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{backgroundColor: COLORS[i]}} />
                    <span className="text-[10px] font-bold text-slate-600 uppercase tracking-tight">{item.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* History Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-lg font-bold text-slate-800 uppercase tracking-tighter">Relatórios do Ciclo</h3>
        </div>
        
        <div className="space-y-3">
          <HistoryItem week="1" date="01/01/2026" status="Pendente" />
          <HistoryItem week="2" date="15/01/2026" status="Pendente" />
        </div>
      </div>
    </div>
  );
}

function IndicatorItem({ label, value, icon: Icon, color, bgColor }: any) {
  return (
    <div className={cn("flex flex-col p-4 rounded-3xl border border-slate-100 bg-white shadow-sm hover:shadow-md transition-shadow")}>
      <div className={cn("p-2 rounded-xl w-fit mb-2", bgColor)}>
        <Icon className={cn("h-4 w-4", color)} />
      </div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <p className="text-xl font-black text-slate-800">{value}</p>
    </div>
  );
}

function HistoryItem({ week, date, status }: any) {
  return (
    <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between active:bg-slate-50 transition-colors">
      <div className="flex items-center gap-4">
        <div className="bg-slate-100 p-3 rounded-2xl">
          <FileText className="h-5 w-5 text-slate-500" />
        </div>
        <div>
          <h4 className="font-bold text-slate-800 tracking-tight">Semana {week}</h4>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{date}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-[10px] font-black uppercase text-slate-400 border-slate-200 bg-slate-50">
          {status}
        </Badge>
        <Button variant="ghost" size="icon" className="text-slate-400 rounded-full">
          <Eye className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
