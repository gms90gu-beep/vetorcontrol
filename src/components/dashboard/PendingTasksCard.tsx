import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Clock, XCircle, Home, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Link } from "@tanstack/react-router";

interface PendingTasksCardProps {
  stats: any;
}

export function PendingTasksCard({ stats }: PendingTasksCardProps) {
  const items = [
    { label: "Imóveis Fechados", count: stats.closed || 0, icon: Home, color: "text-amber-500", bg: "bg-amber-50" },
    { label: "Revisitas Pendentes", count: 0, icon: Clock, color: "text-blue-500", bg: "bg-blue-50" },
    { label: "Recusas (Iniciadas)", count: stats.refused || 0, icon: XCircle, color: "text-red-500", bg: "bg-red-50" },
  ];

  return (
    <Card className="border-none shadow-xl bg-white dark:bg-slate-900 rounded-[2.5rem] overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-amber-100 dark:bg-amber-500/20 p-2 rounded-xl">
              <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-500" />
            </div>
            <CardTitle className="text-xl font-black tracking-tighter">Pendências</CardTitle>
          </div>
          <Link to="/pending">
            <Badge variant="outline" className="rounded-full px-3 py-1 font-black text-[9px] uppercase tracking-widest border-slate-200 dark:border-white/10 hover:bg-slate-50 transition-colors cursor-pointer">
              Ver Tudo
            </Badge>
          </Link>
        </div>
      </CardHeader>
      
      <CardContent className="px-3 pb-6">
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div 
              key={idx}
              className="flex items-center justify-between p-4 rounded-[1.5rem] bg-slate-50 dark:bg-white/5 transition-all active:scale-[0.98] border border-transparent hover:border-slate-100 dark:hover:border-white/10 group"
            >
              <div className="flex items-center gap-4">
                <div className={`${item.bg} dark:bg-opacity-10 p-3 rounded-2xl`}>
                  <item.icon className={`h-5 w-5 ${item.color}`} />
                </div>
                <div>
                  <p className="text-sm font-black tracking-tight text-slate-900 dark:text-white leading-none mb-1">
                    {item.label}
                  </p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ações necessárias</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-black text-slate-900 dark:text-white">{item.count}</span>
                <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-400 transition-colors" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
