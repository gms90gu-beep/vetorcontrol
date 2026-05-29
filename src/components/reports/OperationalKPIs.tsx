import React from "react";
import { 
  Home, 
  Target, 
  AlertTriangle, 
  CheckCircle2, 
  TrendingUp,
  BarChart3,
  Search
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { translate } from "@/lib/translations";

interface OperationalKPIsProps {
  data: {
    worked: number;
    coverage: number;
    focus: number;
    treated: number;
    productivity: number;
  };
  isLoading?: boolean;
}

export function OperationalKPIs({ data, isLoading }: OperationalKPIsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-28 rounded-3xl bg-slate-100 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      <KPICard 
        label={translate("worked")} 
        value={data.worked} 
        icon={Home}
        color="text-blue-600" 
        bgColor="bg-blue-50" 
        trend="0%" 
      />
      <KPICard 
        label="Cobertura %" 
        value={`${data.coverage}%`} 
        icon={Target} 
        color="text-emerald-600" 
        bgColor="bg-emerald-50" 
        trend="0%"
      />
      <KPICard 
        label="Focos (+)" 
        value={data.focus} 
        icon={AlertTriangle} 
        color="text-red-600" 
        bgColor="bg-red-50" 
        trend="0%"
        isCritical
      />
      <KPICard 
        label={translate("TREATED")} 
        value={data.treated} 
        icon={CheckCircle2}
        color="text-cyan-600" 
        bgColor="bg-cyan-50" 
        trend="0%"
      />
      <KPICard 
        label="Produtividade" 
        value={data.productivity} 
        icon={TrendingUp} 
        color="text-purple-600" 
        bgColor="bg-purple-50" 
        trend="0%"
      />
    </div>
  );
}

function KPICard({ label, value, icon: Icon, color, bgColor, trend, isCritical }: any) {
  return (
    <Card className="border-none shadow-sm hover:shadow-md transition-all duration-300 rounded-[2rem] overflow-hidden group">
      <CardContent className="p-5">
        <div className="flex justify-between items-start mb-3">
          <div className={cn("p-2.5 rounded-2xl transition-transform group-hover:scale-110 duration-300", bgColor)}>
            <Icon className={cn("h-5 w-5", color)} />
          </div>
          <div className={cn(
            "text-[9px] font-black px-2 py-1 rounded-full",
            trend.startsWith('+') ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
          )}>
            {trend}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-1">{label}</p>
          <p className={cn(
            "text-2xl font-black tracking-tighter",
            isCritical ? "text-red-600" : "text-slate-900"
          )}>
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
