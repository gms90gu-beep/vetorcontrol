import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Play, CheckCircle2, Map, Clock, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

interface WorkInProgressCardProps {
  activeSession: any;
  blockProgress: number;
  onContinue: () => void;
  onRegister: () => void;
  onFinish: () => void;
}

export function WorkInProgressCard({ 
  activeSession, 
  blockProgress, 
  onContinue, 
  onRegister, 
  onFinish 
}: WorkInProgressCardProps) {
  if (!activeSession) return null;

  return (
    <Card className="border-none shadow-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-blue-700 text-white rounded-[2.5rem] overflow-hidden relative">
      <div className="absolute top-0 right-0 p-6 opacity-10">
        <Map className="h-24 w-24" />
      </div>
      
      <CardHeader className="pb-2 relative z-10">
        <div className="flex items-center gap-2 mb-1">
          <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-100">Trabalho em Andamento</p>
        </div>
        <CardTitle className="text-2xl font-black tracking-tighter">
          Quarteirão {activeSession.block_number}
        </CardTitle>
        <p className="text-xs font-bold text-blue-100/80 truncate uppercase tracking-tight">
          {activeSession.street_name || "Logradouro não informado"}
        </p>
      </CardHeader>
      
      <CardContent className="space-y-6 relative z-10">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-widest text-blue-100">{blockProgress}% Concluído</span>
            <div className="flex items-center gap-1.5 text-blue-100">
              <Clock className="h-3 w-3" />
              <span className="text-[10px] font-black uppercase tracking-widest">2h 45m</span>
            </div>
          </div>
          <div className="relative h-2 w-full bg-white/20 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${blockProgress}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
              className="absolute inset-y-0 left-0 bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)]"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button 
            onClick={onContinue}
            className="bg-white text-blue-600 hover:bg-blue-50 font-black uppercase tracking-widest text-[10px] h-12 rounded-2xl shadow-xl transition-all active:scale-95"
          >
            Continuar
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button 
            onClick={onRegister}
            variant="outline"
            className="border-white/20 bg-white/10 text-white hover:bg-white/20 font-black uppercase tracking-widest text-[10px] h-12 rounded-2xl backdrop-blur-md transition-all active:scale-95"
          >
            Registrar
            <Play className="ml-2 h-3.5 w-3.5 fill-current" />
          </Button>
          <Button 
            onClick={onFinish}
            variant="outline"
            className="col-span-2 border-white/20 bg-white/5 text-white hover:bg-white/10 font-black uppercase tracking-widest text-[10px] h-12 rounded-2xl backdrop-blur-md transition-all active:scale-95 mt-1"
          >
            Finalizar Quarteirão
            <CheckCircle2 className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
