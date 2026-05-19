import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  MapPin, 
  User as UserIcon, 
  Clock, 
  CheckCircle2, 
  TrendingUp,
  RefreshCw,
  Layout
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface PremiumHeaderProps {
  agent: any;
  activeSession: any;
  lastSync: string;
  onSync: () => void;
  isSyncing: boolean;
}

export function PremiumHeader({ agent, activeSession, lastSync, onSync, isSyncing }: PremiumHeaderProps) {
  return (
    <div className="relative overflow-hidden rounded-[2.5rem] bg-slate-950 p-6 text-white shadow-2xl border border-white/5">
      {/* Background patterns */}
      <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-blue-600/10 blur-[100px]" />
      <div className="absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-indigo-600/10 blur-[100px]" />
      
      <div className="relative z-10 space-y-6">
        {/* User and Sync Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12 border-2 border-white/10 ring-2 ring-white/5 ring-offset-2 ring-offset-slate-950">
              <AvatarImage src={agent?.photo_url} className="object-cover" />
              <AvatarFallback className="bg-slate-800 text-slate-400 font-bold">
                {agent?.name?.substring(0, 2).toUpperCase() || "AG"}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Agente de Endemias</p>
              <h2 className="text-lg font-black tracking-tight leading-none">{agent?.name || "Carregando..."}</h2>
            </div>
          </div>
          
          <button 
            onClick={onSync}
            className={cn(
              "flex flex-col items-end gap-1 group transition-all active:scale-95",
              isSyncing && "opacity-50 pointer-events-none"
            )}
          >
            <div className="flex items-center gap-2 bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-full border border-white/10 backdrop-blur-md transition-colors">
              <RefreshCw className={cn("h-3 w-3 text-blue-400", isSyncing && "animate-spin")} />
              <span className="text-[9px] font-black uppercase tracking-widest">Sincronizar</span>
            </div>
            <span className="text-[8px] font-bold text-slate-500 uppercase tracking-tighter">Último: {lastSync}</span>
          </button>
        </div>

        {/* Territory Context */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1">
              <MapPin className="h-3 w-3 text-blue-400" /> Território
            </p>
            <p className="text-sm font-black tracking-tight uppercase truncate">
              {activeSession?.municipality || agent?.municipality || "Não definido"}
            </p>
          </div>
          <div className="space-y-1 text-right">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1 justify-end">
              <Layout className="h-3 w-3 text-indigo-400" /> Subárea / Quarteirão
            </p>
            <p className="text-sm font-black tracking-tight uppercase">
              {activeSession ? `${activeSession.subarea || '01'} / ${activeSession.block_number}` : "-- / --"}
            </p>
          </div>
        </div>

        {/* Progress Section */}
        <div className="space-y-3 pt-2">
          <div className="flex items-end justify-between">
            <div className="space-y-0.5">
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-400">Progresso do Dia</p>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black tracking-tighter">
                  {activeSession?.worked_count || 0}
                </span>
                <span className="text-sm font-bold text-slate-500">/ {activeSession?.total_properties || 0} imóveis</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-white/90">
                {activeSession?.progress || 0}%
              </span>
            </div>
          </div>
          
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-white/5">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${activeSession?.progress || 0}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-600 via-indigo-500 to-blue-400 shadow-[0_0_15px_rgba(37,99,235,0.4)]"
            />
          </div>
          
          <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-slate-500">
            <span>Início: {activeSession?.start_time || "--:--"}</span>
            <span className="text-blue-400">Meta: {activeSession?.daily_goal || "35"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
