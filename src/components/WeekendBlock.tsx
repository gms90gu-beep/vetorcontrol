import { Calendar, ShieldAlert, Clock, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

export function WeekendBlock() {
  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 animate-in fade-in duration-700">
      <Card className="max-w-md w-full border-none shadow-2xl rounded-[3rem] overflow-hidden">
        <div className="bg-slate-900 p-10 text-white text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <Calendar className="h-32 w-32" />
          </div>
          <div className="relative z-10 flex flex-col items-center gap-6">
            <div className="h-20 w-20 rounded-3xl bg-amber-500/20 flex items-center justify-center shadow-inner">
              <Calendar className="h-10 w-10 text-amber-500" />
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-black tracking-tighter">Final de Semana</h2>
              <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Período Não Operacional</p>
            </div>
          </div>
        </div>
        
        <CardContent className="p-10 space-y-8 text-center">
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-2 text-slate-800">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              <p className="text-lg font-black tracking-tight">Sistema Indisponível</p>
            </div>
            <p className="text-slate-500 font-medium leading-relaxed">
              O sistema operacional está programado para funcionar apenas em dias úteis. 
              <span className="block mt-2 font-bold text-slate-800">A produção e registros estão bloqueados hoje.</span>
            </p>
          </div>

          <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100 flex items-center justify-center gap-4">
            <Clock className="h-5 w-5 text-slate-400" />
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Retorno: Segunda-feira</p>
          </div>

          <div className="pt-4">
            <Button 
              variant="outline"
              onClick={handleLogout}
              className="w-full h-14 rounded-2xl border-none bg-slate-100 hover:bg-slate-200 text-slate-600 font-black uppercase tracking-widest text-[10px] gap-3"
            >
              <LogOut className="h-4 w-4" /> Sair do Sistema
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
