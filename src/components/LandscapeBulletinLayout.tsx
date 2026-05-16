import React from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  User, 
  MapPin, 
  Calendar, 
  Target, 
  Layers, 
  LayoutDashboard,
  CheckCircle2,
  XCircle,
  AlertCircle,
  BarChart3
} from "lucide-react";

interface LandscapeBulletinLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle: string;
  stats: {
    worked: number;
    total: number;
    closed: number;
    refused: number;
    focus: number;
    treated: number;
    treatedDeposits: number;
    larvicideUsed: number;
    eliminated: number;
    progress: number;
  };
  agentInfo: {
    municipality: string;
    name: string;
    registrationId: string;
    cycle: string;
    week: string;
    block: string;
    street: string;
  };
  sidebarHeader?: React.ReactNode;
  sidebarFooter?: React.ReactNode;
  isLandscape: boolean;
}

export function LandscapeBulletinLayout({
  children,
  title,
  subtitle,
  stats,
  agentInfo,
  sidebarHeader,
  sidebarFooter,
  isLandscape
}: LandscapeBulletinLayoutProps) {
  if (!isLandscape) {
    return <div className="space-y-6">{children}</div>;
  }

  return (
    <div className="flex h-[calc(100vh-80px)] gap-6 animate-in fade-in duration-700">
      {/* LADO ESQUERDO: Lista e Tabela */}
      <div className="flex-1 flex flex-col gap-4 overflow-hidden">
        <div className="flex flex-col gap-0.5 mb-2">
          <h2 className="text-2xl font-black tracking-tight text-slate-900">{title}</h2>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{subtitle}</p>
        </div>
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      </div>

      {/* LADO DIREITO: Painel Lateral Fixo */}
      <div className="w-[320px] shrink-0 flex flex-col gap-4 overflow-y-auto no-scrollbar pb-6">
        {sidebarHeader}
        
        {/* Agent & Location Card */}
        <Card className="border-none shadow-xl bg-slate-900 text-white rounded-[2rem] overflow-hidden">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-blue-500 flex items-center justify-center font-black">
                {agentInfo.name.substring(0, 1)}
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{agentInfo.municipality}</p>
                <h4 className="font-black tracking-tight text-sm">{agentInfo.name}</h4>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10">
              <div>
                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Matrícula</p>
                <p className="text-[10px] font-bold">{agentInfo.registrationId}</p>
              </div>
              <div>
                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Data</p>
                <p className="text-[10px] font-bold">{new Date().toLocaleDateString('pt-BR')}</p>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Badge className="bg-primary/20 text-primary-foreground border-none font-black text-[8px] uppercase tracking-widest">
                Ciclo {agentInfo.cycle}
              </Badge>
              <Badge variant="outline" className="border-white/10 text-slate-400 font-bold text-[8px] uppercase tracking-widest">
                Semana {agentInfo.week}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Progress Card */}
        <Card className="border-none shadow-xl bg-blue-600 text-white rounded-[2rem] overflow-hidden relative">
          <div className="absolute top-0 right-0 p-6 opacity-10">
            <Target className="h-16 w-16" />
          </div>
          <CardContent className="p-6">
            <div className="flex justify-between items-end mb-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-200 mb-1">Quarteirão {agentInfo.block}</p>
                <h3 className="text-2xl font-black tracking-tighter">{stats.progress}%</h3>
              </div>
              <p className="text-[10px] font-bold text-blue-200">{stats.worked}/{stats.total}</p>
            </div>
            <Progress value={stats.progress} className="h-1.5 bg-white/10" />
            <p className="text-[8px] font-bold text-blue-200 mt-2 uppercase tracking-widest truncate">{agentInfo.street}</p>
          </CardContent>
        </Card>

        {/* Operational Summary Cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white p-4 rounded-3xl shadow-md border border-slate-100">
            <div className="h-8 w-8 rounded-xl bg-emerald-100 flex items-center justify-center mb-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Trabalhados</p>
            <p className="text-lg font-black text-slate-900">{stats.worked}</p>
          </div>
          
          <div className="bg-white p-4 rounded-3xl shadow-md border border-slate-100">
            <div className="h-8 w-8 rounded-xl bg-yellow-100 flex items-center justify-center mb-2">
              <XCircle className="h-4 w-4 text-yellow-600" />
            </div>
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Fechados</p>
            <p className="text-lg font-black text-slate-900">{stats.closed}</p>
          </div>

          <div className="bg-white p-4 rounded-3xl shadow-md border border-slate-100">
            <div className="h-8 w-8 rounded-xl bg-red-100 flex items-center justify-center mb-2">
              <AlertCircle className="h-4 w-4 text-red-600" />
            </div>
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Recusados</p>
            <p className="text-lg font-black text-slate-900">{stats.refused}</p>
          </div>

          <div className="bg-white p-4 rounded-3xl shadow-md border border-slate-100">
            <div className="h-8 w-8 rounded-xl bg-red-500 flex items-center justify-center mb-2">
              <BarChart3 className="h-4 w-4 text-white" />
            </div>
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Focos (+)</p>
            <p className="text-lg font-black text-slate-900 text-red-600">{stats.focus}</p>
          </div>

          <div className="bg-white p-4 rounded-3xl shadow-md border border-slate-100">
            <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center mb-2">
              <Layers className="h-4 w-4 text-blue-600" />
            </div>
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Tratados</p>
            <p className="text-lg font-black text-slate-900">{stats.treated}</p>
          </div>

          <div className="bg-white p-4 rounded-3xl shadow-md border border-slate-100">
            <div className="h-8 w-8 rounded-xl bg-indigo-100 flex items-center justify-center mb-2">
              <BarChart3 className="h-4 w-4 text-indigo-600" />
            </div>
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Eliminados</p>
            <p className="text-lg font-black text-slate-900">{stats.eliminated}</p>
          </div>
        </div>

        {sidebarFooter}
      </div>
    </div>
  );
}
