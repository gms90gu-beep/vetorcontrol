import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  Users, 
  Home, 
  MapPin, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle,
  TrendingUp,
  Calendar,
  ChevronRight,
  FileText,
  CalendarCheck,
  BarChart3,
  AlertCircle,
  RefreshCw,
  Search,
  Plus
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function ActionCard({ title, description, icon: Icon, color, to, onClick, className }: any) {
  const content = (
    <div className={cn(
      "flex flex-col h-full p-6 rounded-[2.5rem] transition-all duration-300 active:scale-95 shadow-xl hover:shadow-2xl border-none text-white relative overflow-hidden group",
      color,
      className
    )}>
      <div className="absolute -right-4 -top-4 bg-white/10 h-24 w-24 rounded-full blur-2xl group-hover:bg-white/20 transition-all duration-500" />
      
      <div className="bg-white/20 backdrop-blur-md p-3.5 rounded-2xl w-fit mb-5 group-hover:scale-110 transition-transform duration-500">
        <Icon className="h-6 w-6" />
      </div>
      <div className="relative z-10">
        <h3 className="text-xl font-black leading-tight mb-1 tracking-tight">{title}</h3>
        <p className="text-[10px] text-white/90 font-bold uppercase tracking-wider leading-relaxed">{description}</p>
      </div>
    </div>
  );

  if (to) {
    return (
      <Link to={to} className="h-44 block">
        {content}
      </Link>
    );
  }

  return (
    <button onClick={onClick} className="h-44 text-left w-full block">
      {content}
    </button>
  );
}

function DashboardPage() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));

  const [stats, setStats] = useState({
    worked: 142,
    visited: 158,
    closed: 12,
    refused: 4,
    eliminated: 85,
    treated: 42,
    focus: 3,
    progress: 65,
  });

  const [currentInfo] = useState({
    date: new Date().toLocaleDateString('pt-BR'),
    cycle: "Ciclo 03/2026",
    week: "Semana 14",
    block: "Quarteirão 042",
  });

  const handleSync = () => {
    setIsSyncing(true);
    toast.info("Sincronizando dados...");
    
    setTimeout(() => {
      setIsSyncing(false);
      setLastSync(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
      toast.success("Dados sincronizados com sucesso!");
    }, 2000);
  };

  return (
    <div className="pb-8 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header Info */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-800">VetorControl</h2>
          <p className="text-sm font-medium text-slate-500">Olá, Agente</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary" className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 border-none font-bold">
            <Calendar className="mr-1 h-3.5 w-3.5" />
            {currentInfo.date}
          </Badge>
        </div>
      </div>

      {/* Progress Card */}
      <Card className="border-none shadow-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-primary-foreground overflow-hidden relative rounded-[2rem]">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <TrendingUp className="h-32 w-32" />
        </div>
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest opacity-70 mb-1">Status Atual</p>
              <CardTitle className="text-2xl font-black">{currentInfo.block}</CardTitle>
            </div>
            <div className="bg-white/20 px-3 py-1 rounded-full text-xs font-bold backdrop-blur-sm">
              {currentInfo.cycle}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold opacity-90">{stats.progress}% concluído</span>
            <span className="text-sm font-bold opacity-90">{stats.worked}/218 imóveis</span>
          </div>
          <Progress value={stats.progress} className="h-2.5 bg-white/20" />
        </CardContent>
      </Card>

      {/* Main Grid Actions */}
      <div className="grid grid-cols-2 gap-4">
        <ActionCard 
          title="Diário" 
          description="Iniciar atividades do dia" 
          icon={CalendarCheck} 
          color="bg-blue-500 shadow-blue-200"
          to="/field-work"
        />
        <ActionCard 
          title="RG" 
          description="Registro Geográfico" 
          icon={MapPin} 
          color="bg-emerald-500 shadow-emerald-200"
          to="/map"
        />
        <ActionCard 
          title="Semanal" 
          description="Resumo de produtividade" 
          icon={BarChart3} 
          color="bg-orange-500 shadow-orange-200"
          to="/reports"
        />
        <ActionCard 
          title="Pendências" 
          description="Imóveis fechados" 
          icon={AlertCircle} 
          color="bg-red-500 shadow-red-200"
          to="/pending"
        />
        <div className="col-span-2">
          <ActionCard 
            title="Sincronizar" 
            description={isSyncing ? "Sincronizando..." : `Última sync: ${lastSync}`}
            icon={isSyncing ? RefreshCw : RefreshCw} 
            color="bg-slate-800 shadow-slate-200"
            onClick={handleSync}
            className={isSyncing ? "animate-pulse" : ""}
          />
        </div>
      </div>

      {/* Quick Summary Section */}
      <div className="pt-2">
        <div className="flex items-center justify-between mb-4 px-1">
          <h3 className="text-lg font-bold text-slate-800">Resumo do Ciclo</h3>
          <Button variant="ghost" size="sm" className="text-xs font-bold text-blue-600 hover:text-blue-700 p-0 h-auto">Ver tudo</Button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Trabalhados</p>
            <p className="text-2xl font-black text-slate-800">{stats.worked}</p>
          </div>
          <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Tratados</p>
            <p className="text-2xl font-black text-blue-600">{stats.treated}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, isFocus }: any) {
  return (
    <Card className={`border-none shadow-lg overflow-hidden transition-all hover:shadow-xl active:scale-95 cursor-pointer group ${isFocus ? 'bg-red-50' : 'bg-card'}`}>
      <CardHeader className="p-5 pb-0 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground group-hover:text-foreground transition-colors">
          {title}
        </CardTitle>
        <div className={`p-2 rounded-xl transition-colors ${isFocus ? 'bg-red-100/50' : 'bg-accent/50'} group-hover:bg-accent`}>
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
      </CardHeader>
      <CardContent className="p-5 pt-1">
        <div className="text-3xl font-black tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}
