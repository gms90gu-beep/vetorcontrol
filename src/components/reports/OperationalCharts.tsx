import React from "react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, Legend
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClientOnly } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6'];
const STATUS_COLORS = {
  visitados: '#10b981',
  fechados: '#f59e0b',
  recusados: '#ef4444',
  tratados: '#3b82f6',
  levantamento: '#8b5cf6'
};

interface OperationalChartsProps {
  productionData: any[];
  depositData: any[];
  coverageData: any[];
  evolutionData: any[];
  pendencyData: any[];
}

export function OperationalCharts({ 
  productionData, 
  depositData, 
  coverageData, 
  evolutionData,
  pendencyData
}: OperationalChartsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* 1. Cobertura do Ciclo (Donut) */}
      <ChartCard title="Cobertura do Ciclo Atual" subtitle="Percentual de conclusão territorial">
        <div className="h-[250px] w-full flex items-center">
          <ClientOnly fallback={<ChartPlaceholder />}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={coverageData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={90}
                  paddingAngle={8}
                  dataKey="value"
                  animationBegin={0}
                  animationDuration={1500}
                >
                  {coverageData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </ClientOnly>
          <div className="w-1/2 space-y-2 pr-4">
            {coverageData.map((item, i) => (
              <div key={i} className="flex items-center justify-between group">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{backgroundColor: COLORS[i]}} />
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">{item.name}</span>
                </div>
                <span className="text-xs font-black text-slate-900">{item.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </ChartCard>

      {/* 2. Produção Semanal (Bar) */}
      <ChartCard title="Produção Semanal" subtitle="Imóveis trabalhados por semana">
        <div className="h-[250px] w-full">
          <ClientOnly fallback={<ChartPlaceholder />}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={productionData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fontSize: 10, fontWeight: 900, fill: '#64748b'}} 
                />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 900, fill: '#64748b'}} />
                <Tooltip 
                  cursor={{fill: '#f8fafc'}}
                  contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                />
                <Bar dataKey="trabalhados" fill={STATUS_COLORS.visitados} radius={[6, 6, 0, 0]} />
                <Bar dataKey="fechados" fill={STATUS_COLORS.fechados} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ClientOnly>
        </div>
      </ChartCard>

      {/* 3. Evolução Diária (Area Chart) */}
      <ChartCard title="Evolução Diária" subtitle="Histórico de visitas nas últimas 2 semanas">
        <div className="h-[250px] w-full">
          <ClientOnly fallback={<ChartPlaceholder />}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={evolutionData}>
                <defs>
                  <linearGradient id="colorVisits" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fontSize: 10, fontWeight: 900, fill: '#64748b'}} 
                />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 900, fill: '#64748b'}} />
                <Tooltip 
                  contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                />
                <Area type="monotone" dataKey="visitas" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorVisits)" />
              </AreaChart>
            </ResponsiveContainer>
          </ClientOnly>
        </div>
      </ChartCard>

      {/* 4. Tipos de Depósitos (Bar Horizontal) */}
      <ChartCard title="Tipos de Depósitos" subtitle="Frequência de recipientes encontrados">
        <div className="h-[250px] w-full">
          <ClientOnly fallback={<ChartPlaceholder />}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={depositData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  axisLine={false} 
                  tickLine={false} 
                  width={60}
                  tick={{fontSize: 10, fontWeight: 900, fill: '#64748b'}} 
                />
                <Tooltip 
                  cursor={{fill: '#f8fafc'}}
                  contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                />
                <Bar dataKey="value" fill="#8b5cf6" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ClientOnly>
        </div>
      </ChartCard>
    </div>
  );
}

function ChartCard({ title, subtitle, children }: any) {
  return (
    <Card className="border-none shadow-sm rounded-[2rem] overflow-hidden bg-white">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-sm font-black uppercase tracking-tighter text-slate-800">{title}</CardTitle>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{subtitle}</p>
          </div>
          <Badge variant="outline" className="border-slate-100 bg-slate-50 text-[8px] font-black uppercase tracking-widest text-slate-400">Tempo Real</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {children}
      </CardContent>
    </Card>
  );
}

function ChartPlaceholder() {
  return (
    <div className="h-full w-full bg-slate-50 rounded-3xl animate-pulse flex items-center justify-center">
      <div className="w-12 h-12 rounded-full border-4 border-slate-200 border-t-blue-500 animate-spin" />
    </div>
  );
}
