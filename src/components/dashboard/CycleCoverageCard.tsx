import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, Target, Calendar, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";

interface CycleCoverageCardProps {
  coverageData: any;
  activeCycle: any;
  activeWeek: any;
}

export function CycleCoverageCard({ coverageData, activeCycle, activeWeek }: CycleCoverageCardProps) {
  const coverage = coverageData?.coverage_percentage || 0;
  
  return (
    <Card className="border-none shadow-xl bg-white dark:bg-slate-900 rounded-[2.5rem] overflow-hidden relative group transition-all hover:shadow-2xl">
      <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform duration-700">
        <Target className="h-32 w-32" />
      </div>
      
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cobertura do Ciclo</p>
            <CardTitle className="text-4xl font-black tracking-tighter text-slate-900 dark:text-white">
              {coverage}%
            </CardTitle>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <div className="bg-slate-100 dark:bg-white/10 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest backdrop-blur-md border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300">
              {activeCycle ? activeCycle.name : "Ciclo Ativo"}
            </div>
            {activeWeek && (
              <div className="bg-blue-50 dark:bg-blue-500/20 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-500/20">
                Semana {activeWeek.number}
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Progresso Geral</span>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-900 dark:text-slate-300">
              {coverageData?.worked_properties || 0}/{coverageData?.total_properties || 0} imóveis
            </span>
          </div>
          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${coverage}%` }}
              transition={{ duration: 1.5, ease: "easeOut", delay: 0.2 }}
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-2">
          <div className="space-y-1">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Meta Diária</p>
            <p className="text-xl font-black text-slate-900 dark:text-white">35 <span className="text-[10px] font-bold text-slate-400">un</span></p>
          </div>
          <div className="space-y-1 text-right">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Previsão</p>
            <p className="text-xl font-black text-blue-600 dark:text-blue-400">12 <span className="text-[10px] font-bold text-slate-400 uppercase">Dias</span></p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
