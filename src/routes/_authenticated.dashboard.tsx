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
  FileText
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
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

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-primary">Olá, Agente</h2>
          <p className="text-muted-foreground">Aqui está o resumo do seu trabalho hoje.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="px-3 py-1 rounded-full bg-primary/10 text-primary border-none">
            <Calendar className="mr-1 h-3.5 w-3.5" />
            {currentInfo.date}
          </Badge>
          <Badge variant="outline" className="px-3 py-1 rounded-full text-muted-foreground">
            {currentInfo.cycle}
          </Badge>
        </div>
      </div>

      {/* Progress Card */}
      <Card className="border-none shadow-2xl bg-gradient-to-br from-primary via-primary/90 to-blue-900 text-primary-foreground overflow-hidden relative">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <TrendingUp className="h-32 w-32" />
        </div>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-medium opacity-90">Progresso do Quarteirão</CardTitle>
          <div className="flex items-end justify-between">
            <span className="text-4xl font-bold">{currentInfo.block}</span>
            <span className="text-xl font-semibold">{stats.progress}%</span>
          </div>
        </CardHeader>
        <CardContent>
          <Progress value={stats.progress} className="h-3 bg-white/20" />
          <div className="mt-4 flex justify-between text-sm font-medium opacity-90">
            <span>{stats.worked} de 218 imóveis</span>
            <span>Restam 76</span>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Button asChild className="h-28 rounded-[2rem] flex-col gap-2 shadow-xl shadow-primary/20 bg-primary hover:bg-primary/90 active:scale-95 transition-all">
          <Link to="/field-work">
            <div className="h-12 w-12 rounded-2xl bg-white/20 flex items-center justify-center">
              <MapPin className="h-6 w-6" />
            </div>
            <span className="font-bold text-[10px] uppercase tracking-[0.1em]">Continuar</span>
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-28 rounded-[2rem] flex-col gap-2 border-none bg-yellow-100/80 hover:bg-yellow-200 text-yellow-700 shadow-xl shadow-yellow-100/10 active:scale-95 transition-all">
          <Link to="/pending">
            <div className="h-12 w-12 rounded-2xl bg-white/50 flex items-center justify-center text-yellow-700">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <span className="font-bold text-[10px] uppercase tracking-[0.1em]">Pendências</span>
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-28 rounded-[2rem] flex-col gap-2 border-none bg-blue-100/80 hover:bg-blue-200 text-blue-700 shadow-xl shadow-blue-100/10 active:scale-95 transition-all">
          <Link to="/field-work">
            <div className="h-12 w-12 rounded-2xl bg-white/50 flex items-center justify-center text-blue-700">
              <Home className="h-6 w-6" />
            </div>
            <span className="font-bold text-[10px] uppercase tracking-[0.1em]">Imóveis</span>
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-28 rounded-[2rem] flex-col gap-2 border-none bg-emerald-100/80 hover:bg-emerald-200 text-emerald-700 shadow-xl shadow-emerald-100/10 active:scale-95 transition-all">
          <Link to="/reports">
            <div className="h-12 w-12 rounded-2xl bg-white/50 flex items-center justify-center text-emerald-700">
              <FileText className="h-6 w-6" />
            </div>
            <span className="font-bold text-[10px] uppercase tracking-[0.1em]">Relatórios</span>
          </Link>
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Trabalhados" value={stats.worked} icon={CheckCircle2} color="text-emerald-500" />
        <StatCard title="Visitados" value={stats.visited} icon={TrendingUp} color="text-blue-500" />
        <StatCard title="Fechados" value={stats.closed} icon={XCircle} color="text-yellow-500" />
        <StatCard title="Recusados" value={stats.refused} icon={AlertTriangle} color="text-red-500" />
        <StatCard title="Eliminados" value={stats.eliminated} icon={CheckCircle2} color="text-emerald-500" />
        <StatCard title="Tratados" value={stats.treated} icon={CheckCircle2} color="text-blue-500" />
        <StatCard title="Focos Positivos" value={stats.focus} icon={AlertTriangle} color="text-red-500" isFocus />
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
