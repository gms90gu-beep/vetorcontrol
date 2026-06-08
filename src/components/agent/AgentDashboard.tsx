import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  LogOut,
  PlayCircle,
  Target,
  TrendingUp,
  History,
  MapPin,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Bug,
  Droplets,
  Home,
} from "lucide-react";

const DAILY_GOAL = 30;

type Period = "today" | "week" | "month";

type Visit = {
  id: string;
  status: string | null;
  has_focus: boolean | null;
  visit_date: string;
  treated_deposits: number | null;
  treatment_amount: number | null;
};

function initialsFrom(name?: string | null, email?: string | null) {
  const base = (name && name.trim()) || (email ? email.split("@")[0] : "") || "";
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "AG";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function startOfWeek(d = new Date()) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day;
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function AgentDashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<{ full_name: string | null; registration_number: string | null; city: string | null } | null>(null);
  const [todayVisits, setTodayVisits] = useState<Visit[]>([]);
  const [weekVisits, setWeekVisits] = useState<Visit[]>([]);
  const [monthVisits, setMonthVisits] = useState<Visit[]>([]);
  const [cycleVisits, setCycleVisits] = useState<Visit[]>([]);
  const [cycleInfo, setCycleInfo] = useState<{ number: number; year: number } | null>(null);
  const [todayDeposits, setTodayDeposits] = useState({ tratados: 0, focos: 0 });
  const [weekFocos, setWeekFocos] = useState(0);
  const [blockStats, setBlockStats] = useState({ atual: "—", concluidos: 0, pendentes: 0 });
  const [hasActiveSession, setHasActiveSession] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    document.title = "Meu Desempenho — VetorControl";
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data: p } = await supabase
        .from("profiles")
        .select("full_name, registration_number, city")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setProfile(p ?? null);

      const todayIso = new Date().toISOString().split("T")[0];
      const weekStart = startOfWeek().toISOString();
      const monthStart = startOfMonth().toISOString();

      // Ciclo ativo: garante consistência com a tela Trabalho / encerramento diário
      const { data: activeCycle } = await supabase
        .from("cycles")
        .select("id, number, year")
        .eq("status", "in_progress")
        .maybeSingle();
      const activeCycleId = activeCycle?.id ?? null;
      if (!cancelled && activeCycle) {
        setCycleInfo({ number: activeCycle.number, year: activeCycle.year });
      }

      let qToday = supabase
        .from("visits")
        .select("id, status, has_focus, visit_date, treated_deposits, treatment_amount, property_id")
        .eq("agent_id", user.id)
        .gte("visit_date", `${todayIso}T00:00:00`)
        .order("visit_date", { ascending: false });
      if (activeCycleId) qToday = qToday.eq("cycle_id", activeCycleId);
      const { data: vToday } = await qToday;

      let qWeek = supabase
        .from("visits")
        .select("id, status, has_focus, visit_date, treated_deposits, treatment_amount")
        .eq("agent_id", user.id)
        .gte("visit_date", weekStart)
        .order("visit_date", { ascending: false });
      if (activeCycleId) qWeek = qWeek.eq("cycle_id", activeCycleId);
      const { data: vWeek } = await qWeek;

      let qMonth = supabase
        .from("visits")
        .select("id, status, has_focus, visit_date, treated_deposits, treatment_amount")
        .eq("agent_id", user.id)
        .gte("visit_date", monthStart)
        .order("visit_date", { ascending: false });
      if (activeCycleId) qMonth = qMonth.eq("cycle_id", activeCycleId);
      const { data: vMonth } = await qMonth;

      // Produção acumulada do CICLO inteiro (todas as jornadas do agente neste ciclo)
      let vCycle: any[] | null = null;
      if (activeCycleId) {
        const { data } = await supabase
          .from("visits")
          .select("id, status, has_focus, visit_date, treated_deposits, treatment_amount")
          .eq("agent_id", user.id)
          .eq("cycle_id", activeCycleId)
          .order("visit_date", { ascending: false });
        vCycle = data ?? [];
      }

      if (cancelled) return;
      setTodayVisits((vToday as any) || []);
      setWeekVisits((vWeek as any) || []);
      setMonthVisits((vMonth as any) || []);
      setCycleVisits((vCycle as any) || []);

      // Depósitos de hoje
      const todayIds = (vToday || []).map((v) => v.id);
      if (todayIds.length > 0) {
        const { data: deps } = await supabase
          .from("visit_deposits")
          .select("is_treated, is_positive")
          .in("visit_id", todayIds);
        if (!cancelled && deps) {
          setTodayDeposits({
            tratados: deps.filter((d) => d.is_treated).length,
            focos: deps.filter((d) => d.is_positive).length,
          });
        }
      }

      setWeekFocos((vWeek || []).filter((v) => v.has_focus).length);

      // Pendências ativas do agente
      try {
        const { count } = await (supabase as any)
          .from("property_pendencies")
          .select("id", { count: "exact", head: true })
          .eq("agent_id", user.id)
          .is("resolved_at", null);
        if (!cancelled) setPendingCount(count || 0);
      } catch (e) {
        console.warn("[Dashboard] pendências:", e);
      }


      // Sessão ativa + blocos
      const { data: active } = await supabase
        .from("field_work_sessions")
        .select("id, block_number, status")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: allSessions } = await supabase
        .from("field_work_sessions")
        .select("block_number, status")
        .eq("user_id", user.id);

      if (!cancelled) {
        setHasActiveSession(!!active);
        const concluidos = (allSessions || []).filter((s) => s.status === "completed").length;
        const pendentes = (allSessions || []).filter((s) => s.status === "active").length;
        setBlockStats({
          atual: active?.block_number || "—",
          concluidos,
          pendentes,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const fullName = profile?.full_name || user?.email?.split("@")[0] || "Agente";
  const initials = initialsFrom(profile?.full_name, user?.email);

  // Métricas
  const trabalhados = todayVisits.length;
  const fechados = todayVisits.filter((v) => v.status === "closed").length;
  const recusas = todayVisits.filter((v) => v.status === "refused").length;
  const focos = todayVisits.filter((v) => v.has_focus).length;
  const larvicidasMl = Math.round(todayVisits.reduce((s, v) => s + Number(v.treatment_amount || 0), 0));

  const semVisitados = weekVisits.length;
  const semRecusas = weekVisits.filter((v) => v.status === "refused").length;

  const goalPct = Math.min(100, Math.round((trabalhados / DAILY_GOAL) * 100));

  const handleLogout = async () => {
    await signOut();
    window.location.href = "/login";
  };

  const periodData: Record<Period, Visit[]> = {
    today: todayVisits,
    week: weekVisits,
    month: monthVisits,
  };

  return (
    <div className="min-h-full bg-[#f4f5f7]">
      {/* Header */}
      <header className="bg-[#0b1520] px-4 py-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <Badge className="bg-emerald-500/15 text-emerald-400 border-none text-[10px] font-black tracking-widest mb-2">
              AGENTE DE CAMPO
            </Badge>
            <div className="text-white font-bold text-base leading-tight truncate">{fullName}</div>
            <div className="text-[10px] text-white/40 mt-0.5">
              {profile?.registration_number || "—"} · {profile?.city || "—"}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button onClick={handleLogout} aria-label="Sair" className="text-white/40 hover:text-white/80 transition-colors">
              <LogOut className="h-5 w-5" />
            </button>
            <div className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold bg-emerald-900/40 text-emerald-400 border border-emerald-700/40">
              {initials}
            </div>
          </div>
        </div>
      </header>

      <div className="px-4 py-5 space-y-5 pb-24">
        {/* CTA iniciar jornada */}
        {pendingCount > 0 && (
          <button
            onClick={() => navigate({ to: "/pending" })}
            className="w-full flex items-center justify-between gap-3 bg-red-600 text-white rounded-xl py-3 px-4 active:scale-[0.98] transition-transform shadow-lg shadow-red-600/30"
          >
            <span className="flex items-center gap-2 font-bold text-[13px]">
              <AlertTriangle className="h-5 w-5" />
              Pendências para Recuperar
            </span>
            <span className="bg-white text-red-700 font-black text-sm px-2.5 py-0.5 rounded-full">
              {pendingCount}
            </span>
          </button>
        )}

        {!hasActiveSession && (
          <button
            onClick={() => navigate({ to: "/field-work" })}
            className="w-full flex items-center justify-center gap-2 font-bold text-[13px] bg-emerald-600 text-white rounded-xl py-3 active:scale-[0.98] transition-transform"
          >
            <PlayCircle className="h-5 w-5" />
            Iniciar jornada diária
          </button>
        )}

        {/* Meta Operacional */}
        <section className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-4 w-4 text-emerald-600" />
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-900">
              Meta Operacional do Dia
            </h2>
          </div>
          <div className="flex items-end justify-between mb-2">
            <div>
              <p className="text-3xl font-black text-slate-900 leading-none">{trabalhados}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                de {DAILY_GOAL} imóveis
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black text-emerald-600 leading-none">{goalPct}%</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                concluído
              </p>
            </div>
          </div>
          <Progress value={goalPct} className="h-2" indicatorClassName="bg-emerald-500" />
        </section>

        {/* Meu Desempenho — Hoje */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-slate-600" />
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-700">
              Produção de Hoje
            </h2>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <MetricBox icon={Home} label="Trabalhados" value={trabalhados} color="#185fa5" />
            <MetricBox icon={CheckCircle2} label="Fechados" value={fechados} color="#3b6d11" />
            <MetricBox icon={XCircle} label="Recusas" value={recusas} color="#a32d2d" />
            <MetricBox icon={Bug} label="Focos" value={focos} color="#dc2626" />
            <MetricBox icon={CheckCircle2} label="Dep. Tratados" value={todayDeposits.tratados} color="#0d7a5f" />
            <MetricBox icon={Droplets} label="Larvicida (mL)" value={larvicidasMl} color="#854f0b" />
          </div>
        </section>

        {/* Produção da Semana */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-slate-600" />
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-700">
              Produção da Semana
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <MetricBox icon={Home} label="Imóveis visitados" value={semVisitados} color="#185fa5" />
            <MetricBox icon={Bug} label="Focos" value={weekFocos} color="#dc2626" />
            <MetricBox icon={XCircle} label="Recusas" value={semRecusas} color="#a32d2d" />
            <MetricBox icon={MapPin} label="Quart. concluídos" value={blockStats.concluidos} color="#3b6d11" />
          </div>
        </section>

        {/* Minha Área */}
        <section className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="h-4 w-4 text-blue-600" />
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-900">
              Minha Área
            </h2>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <MiniStat label="Quart. atual" value={blockStats.atual} highlight />
            <MiniStat label="Concluídos" value={String(blockStats.concluidos)} />
            <MiniStat label="Pendentes" value={String(blockStats.pendentes)} />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate({ to: "/map" })}
            className="w-full text-xs"
          >
            <MapPin className="h-3.5 w-3.5 mr-1" />
            Abrir mapa
          </Button>
        </section>

        {/* Meu Histórico */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <History className="h-4 w-4 text-slate-600" />
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-700">
              Meu Histórico
            </h2>
          </div>
          <Tabs defaultValue="today" className="w-full">
            <TabsList className="grid grid-cols-3 w-full bg-slate-100">
              <TabsTrigger value="today" className="text-xs">Hoje</TabsTrigger>
              <TabsTrigger value="week" className="text-xs">Semana</TabsTrigger>
              <TabsTrigger value="month" className="text-xs">Mês</TabsTrigger>
            </TabsList>
            {(["today", "week", "month"] as Period[]).map((p) => (
              <TabsContent key={p} value={p} className="mt-3">
                <HistoryList visits={periodData[p]} />
              </TabsContent>
            ))}
          </Tabs>
        </section>
      </div>
    </div>
  );
}

function MetricBox({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: any;
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm">
      <Icon className="h-4 w-4" style={{ color }} />
      <p className="text-xl font-black text-slate-900 mt-1.5 leading-none">{value}</p>
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1 leading-tight">
        {label}
      </p>
    </div>
  );
}

function MiniStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-2 text-center ${highlight ? "bg-blue-50" : "bg-slate-50"}`}>
      <p className={`text-base font-black leading-none ${highlight ? "text-blue-700" : "text-slate-800"}`}>
        {value}
      </p>
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1 leading-tight">
        {label}
      </p>
    </div>
  );
}

function HistoryList({ visits }: { visits: Visit[] }) {
  if (visits.length === 0) {
    return (
      <div className="bg-white rounded-xl p-6 border border-slate-100 text-center">
        <History className="h-6 w-6 mx-auto mb-2 text-slate-300" />
        <p className="text-xs text-slate-400">Nenhuma visita registrada no período</p>
      </div>
    );
  }
  return (
    <div className="space-y-2 max-h-80 overflow-y-auto">
      {visits.slice(0, 30).map((v) => {
        const date = new Date(v.visit_date);
        const dateStr = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
        const timeStr = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        return (
          <div key={v.id} className="bg-white rounded-lg p-3 border border-slate-100 flex items-center gap-3">
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ background: v.has_focus ? "#dc2626" : v.status === "closed" ? "#94a3b8" : "#10b981" }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-bold text-slate-900 truncate">
                {v.status === "closed" ? "Imóvel fechado" : v.status === "refused" ? "Recusa" : v.has_focus ? "Foco encontrado" : "Visita realizada"}
              </p>
              <p className="text-[10px] text-slate-400">{dateStr} às {timeStr}</p>
            </div>
            {v.has_focus && <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
          </div>
        );
      })}
    </div>
  );
}
