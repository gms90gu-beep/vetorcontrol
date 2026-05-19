import { Card, CardContent } from "@/components/ui/card";
import { Trophy, Flame, Target, Star, ChevronUp } from "lucide-react";

export function GamificationStats() {
  const stats = [
    { label: "Streak", value: "5 Dias", icon: Flame, color: "text-orange-500", bg: "bg-orange-50" },
    { label: "Produtividade", value: "+12%", icon: Target, color: "text-blue-500", bg: "bg-blue-50", trend: true },
    { label: "Ranking", value: "3º Lugar", icon: Trophy, color: "text-amber-500", bg: "bg-amber-50" },
    { label: "Nível", value: "14", icon: Star, color: "text-indigo-500", bg: "bg-indigo-50" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tighter">Desempenho</h3>
        <span className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">Ver Perfil</span>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        {stats.map((stat, idx) => (
          <Card key={idx} className="border-none shadow-md bg-white dark:bg-slate-900 rounded-[2rem] overflow-hidden p-5 transition-all active:scale-95">
            <div className="flex flex-col items-center text-center space-y-3">
              <div className={`${stat.bg} dark:bg-opacity-10 p-4 rounded-2xl`}>
                <stat.icon className={`h-6 w-6 ${stat.color}`} />
              </div>
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
                <div className="flex items-center justify-center gap-1">
                  <p className="text-xl font-black text-slate-900 dark:text-white leading-none">
                    {stat.value}
                  </p>
                  {stat.trend && <ChevronUp className="h-4 w-4 text-emerald-500" />}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
