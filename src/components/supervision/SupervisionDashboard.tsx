import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  UserPlus,
  Search,
  UserX,
  Activity,
  Eye,
  MoreVertical,
  LogOut,
  MapPin,
  FileText,
  AlertTriangle,
  ClipboardList,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "@tanstack/react-router";

type FilterKey = "all" | "active" | "inactive" | "no_session";

function initials(name?: string | null) {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "??";
}

export function SupervisionDashboard() {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [agents, setAgents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [isAddingAgent, setIsAddingAgent] = useState(false);
  const [viewingAgent, setViewingAgent] = useState<any | null>(null);
  const [newAgent, setNewAgent] = useState({
    full_name: "",
    email: "",
    password: "",
    registration_number: "",
    city: "",
  });

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function fetchAll() {
    setIsLoading(true);
    try {
      if (user?.id) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();
        setProfile(prof);
      }

      // RLS já filtra por supervisor_id
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("*");
      if (profileError) throw profileError;

      const team = (profiles || []).filter(
        (p: any) => p.role === "agente" || p.role === "agent",
      );

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [{ data: visits }, { data: sessions }] = await Promise.all([
        supabase.from("visits").select("agent_id, status, has_focus"),
        supabase
          .from("field_work_sessions")
          .select("user_id, status, session_date")
          .gte("session_date", todayStart.toISOString().slice(0, 10)),
      ]);

      const withStats = team.map((agent: any) => {
        const av = (visits || []).filter((v: any) => v.agent_id === agent.id);
        const todaySessions = (sessions || []).filter(
          (s: any) => s.user_id === agent.id,
        );
        const hasOpenSession = todaySessions.some((s: any) => s.status === "active");
        const hasAnyToday = todaySessions.length > 0;
        return {
          ...agent,
          stats: {
            worked: av.length,
            closed: av.filter((v: any) => v.status === "closed").length,
            focus: av.filter((v: any) => v.has_focus).length,
          },
          hasOpenSession,
          hasAnyToday,
        };
      });

      setAgents(withStats);
    } catch (e) {
      console.error(e);
      toast.error("Erro ao carregar equipe");
    } finally {
      setIsLoading(false);
    }
  }

  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validações
    const full_name = newAgent.full_name.trim();
    const email = newAgent.email.trim().toLowerCase();
    const password = newAgent.password;

    if (!full_name) return toast.error("Informe o nome completo.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast.error("E-mail inválido.");
    if (!password || password.length < 6) return toast.error("Senha temporária deve ter ao menos 6 caracteres.");
    if (!user?.id) return toast.error("Sessão expirada. Faça login novamente.");

    const payload = {
      full_name,
      email,
      password,
      registration_number: newAgent.registration_number.trim() || null,
      city: newAgent.city.trim() || null,
      role: "agente",
    };

    console.log("[CreateAgent] Supervisor:", user.id);
    console.log("[CreateAgent] Dados agente:", { ...payload, password: "***" });

    const toastId = toast.loading("Criando novo agente...");
    try {
      const { data, error } = await supabase.functions.invoke("manage-agents", {
        body: { action: "create", agentData: payload },
      });
      console.log("[CreateAgent] Resultado:", data);
      console.log("[CreateAgent] Erro:", error);

      // Edge function pode retornar 4xx com { error: "..." } no body
      const fnError = (data as any)?.error;
      if (error || fnError) {
        // Tenta extrair mensagem real do FunctionsHttpError
        let msg = fnError || error?.message || "Erro ao cadastrar agente";
        try {
          const ctx: any = (error as any)?.context;
          if (ctx?.json) {
            const body = await ctx.json();
            if (body?.error) msg = body.error;
          }
        } catch {}
        throw new Error(msg);
      }

      toast.success("Agente cadastrado!", { id: toastId });
      setIsAddingAgent(false);
      setNewAgent({
        full_name: "",
        email: "",
        password: "",
        registration_number: "",
        city: "",
      });
      await fetchAll();
    } catch (e: any) {
      console.error("[CreateAgent] Falha:", e);
      toast.error(e?.message || "Erro ao cadastrar agente", { id: toastId });
    }
  };

  const totals = useMemo(() => {
    const active = agents.filter((a) => a.is_active).length;
    const inactive = agents.filter((a) => !a.is_active).length;
    return { total: agents.length, active, inactive };
  }, [agents]);

  const filteredAgents = useMemo(() => {
    return agents.filter((a) => {
      const m =
        a.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.registration_number?.toLowerCase().includes(searchTerm.toLowerCase());
      if (!m) return false;
      if (filter === "active") return a.is_active;
      if (filter === "inactive") return !a.is_active;
      if (filter === "no_session") return !a.hasAnyToday;
      return true;
    });
  }, [agents, searchTerm, filter]);

  const totalWorked = agents.reduce((s, a) => s + (a.stats?.worked || 0), 0);
  const totalClosed = agents.reduce((s, a) => s + (a.stats?.closed || 0), 0);
  const totalFocus = agents.reduce((s, a) => s + (a.stats?.focus || 0), 0);
  const alertsNoActivity = agents.filter((a) => a.is_active && !a.hasAnyToday).length;
  const progressPct = totalWorked > 0 ? Math.round((totalClosed / Math.max(totalWorked, 1)) * 100) : 0;
  const roleLabel =
    role === "admin_master"
      ? "ADMIN MASTER"
      : role === "coordenador"
        ? "COORDENADOR"
        : role === "supervisor"
          ? "SUPERVISOR"
          : "AGENTE";
  const panelTitle =
    role === "admin_master"
      ? "Painel Administrativo"
      : role === "coordenador"
        ? "Painel de Coordenação"
        : "Painel de Supervisão";
  const displayName =
    profile?.full_name || user?.email?.split("@")[0] || "Usuário";

  return (
    <div className="min-h-screen bg-[#f4f5f7]">
      {/* HEADER ESCURO ÚNICO */}
      <div className="bg-[#0b1520] text-white px-[14px] pt-[14px] pb-[14px]">
        {/* Linha superior */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#1a3a2a] px-2.5 py-1 text-[10px] font-bold text-[#34d399]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#34d399]" /> Em trabalho
            </span>
            <p className="mt-2 text-base font-bold text-white truncate leading-tight">
              {displayName}
            </p>
            <p className="text-[9px] font-bold uppercase tracking-widest text-[#3b9ede]">
              {roleLabel}
            </p>
            <p className="text-[10px] font-semibold text-white/80 truncate">
              {panelTitle}
            </p>
            <p className="text-[9px] text-[#2e4a60] truncate">
              {profile?.city || "—"}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              onClick={() => signOut()}
              variant="ghost"
              size="sm"
              className="h-8 px-2.5 bg-[#111e2e] border border-[#1e3048] text-[#4a6b80] hover:bg-[#1a2a3e] hover:text-white text-xs font-bold rounded-lg"
            >
              <LogOut className="h-3.5 w-3.5 mr-1" /> Sair
            </Button>
            <div className="h-10 w-10 rounded-full bg-[#1a4a7a] border border-[#2a6aaa] flex items-center justify-center font-black text-[#3b9ede] text-xs">
              {initials(profile?.full_name)}
            </div>
          </div>
        </div>

        {/* Divisor */}
        <div className="my-3 h-px bg-[#1e3048]" />

        {/* Bloco de território */}
        <div>
          <div className="flex items-center justify-between">
            <span className="text-[8px] font-bold uppercase tracking-widest text-[#2e4a60]">
              Território atual
            </span>
            <span className="text-[9px] font-bold text-[#34d399]">{progressPct}%</span>
          </div>
          <p className="mt-1 text-[13px] font-bold text-white">
            {totalWorked > 0 ? "Equipe em campo" : "Sem atividade hoje"}
          </p>
          <div className="mt-1.5 h-[3px] w-full rounded-full bg-[#1e3048] overflow-hidden">
            <div
              className="h-full bg-[#34d399] transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="mt-1 text-[9px] text-[#2e4a60]">
            {totalClosed} de {Math.max(totalWorked, 0)} imóveis trabalhados
          </p>
        </div>

        {/* Cards de sessão */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <OpCard label="Trabalhados" value={totalWorked} color="text-white" />
          <OpCard label="Fechados" value={totalClosed} color="text-white" />
          <OpCard label="Focos" value={totalFocus} color="text-[#f87171]" />
        </div>
      </div>

      {/* CORPO CLARO */}
      <div className="px-4 py-5 space-y-5 pb-24">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black tracking-widest text-slate-400 uppercase">
              Painel de Supervisão
            </p>
            <h1 className="text-xl font-black text-slate-900 leading-tight">
              Gestão de Equipe
            </h1>
          </div>
          <Dialog open={isAddingAgent} onOpenChange={setIsAddingAgent}>
            <DialogTrigger asChild>
              <Button className="h-11 rounded-2xl px-4 font-bold bg-slate-900 hover:bg-slate-800 text-white shadow-sm">
                <UserPlus className="mr-1.5 h-4 w-4" /> Novo Agente
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] rounded-3xl">
              <DialogHeader>
                <DialogTitle className="text-xl font-black uppercase">
                  Cadastrar Agente
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateAgent} className="space-y-3 mt-2">
                <FormField
                  label="Nome Completo"
                  value={newAgent.full_name}
                  onChange={(v) => setNewAgent({ ...newAgent, full_name: v })}
                  required
                />
                <FormField
                  label="E-mail"
                  type="email"
                  value={newAgent.email}
                  onChange={(v) => setNewAgent({ ...newAgent, email: v })}
                  required
                />
                <FormField
                  label="Senha Temporária"
                  type="password"
                  value={newAgent.password}
                  onChange={(v) => setNewAgent({ ...newAgent, password: v })}
                  required
                />
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    label="Matrícula"
                    value={newAgent.registration_number}
                    onChange={(v) =>
                      setNewAgent({ ...newAgent, registration_number: v })
                    }
                    required
                  />
                  <FormField
                    label="Município"
                    value={newAgent.city}
                    onChange={(v) => setNewAgent({ ...newAgent, city: v })}
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-bold"
                >
                  Salvar
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Métricas */}
        <div className="grid grid-cols-3 gap-3">
          <MetricCard
            label="Total"
            value={totals.total}
            icon={Users}
            color="#185fa5"
          />
          <MetricCard
            label="Ativos"
            value={totals.active}
            icon={Activity}
            color="#3b6d11"
          />
          <MetricCard
            label="Inativos"
            value={totals.inactive}
            icon={UserX}
            color="#a32d2d"
          />
        </div>

        {/* Alertas */}
        {alertsNoActivity > 0 && (
          <div
            className="rounded-2xl border-l-4 bg-white p-3 flex items-center gap-2 shadow-sm"
            style={{ borderColor: "#f59e0b" }}
          >
            <AlertTriangle className="h-4 w-4" style={{ color: "#f59e0b" }} />
            <p className="text-xs font-bold text-slate-700">
              {alertsNoActivity} agente(s) sem registro hoje.
            </p>
          </div>
        )}

        {/* Busca + Filtros */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por nome ou matrícula..."
              className="pl-10 rounded-2xl bg-white border-slate-200 h-11"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
            {(
              [
                ["all", "Todos"],
                ["active", "Ativos"],
                ["inactive", "Inativos"],
                ["no_session", "Sem sessão"],
              ] as [FilterKey, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={cn(
                  "shrink-0 px-3 h-8 rounded-full text-xs font-bold transition-all",
                  filter === k
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-600 border border-slate-200",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Lista */}
        <div className="space-y-2.5">
          {isLoading ? (
            <div className="py-16 text-center text-slate-400 text-sm">Carregando equipe...</div>
          ) : filteredAgents.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">
              Nenhum agente encontrado.
            </div>
          ) : (
            filteredAgents.map((agent) => (
              <div
                key={agent.id}
                className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div className="h-11 w-11 shrink-0 rounded-xl bg-slate-100 flex items-center justify-center font-black text-slate-500 text-sm">
                    {initials(agent.full_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-black text-slate-900 text-sm truncate">
                        {agent.full_name}
                      </h3>
                      <Badge
                        className={cn(
                          "rounded-md px-1.5 py-0 font-black text-[9px] uppercase tracking-wider border-none",
                          agent.is_active
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-rose-100 text-rose-700",
                        )}
                      >
                        {agent.is_active ? "ATIVO" : "INATIVO"}
                      </Badge>
                    </div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                      {agent.registration_number || "—"} · {agent.city || "—"}
                    </p>

                    <div className="flex items-center gap-4 mt-2">
                      <MiniStat label="Trab" value={agent.stats?.worked || 0} />
                      <MiniStat label="Fech" value={agent.stats?.closed || 0} />
                      <MiniStat label="Focos" value={agent.stats?.focus || 0} danger />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-1 mt-2 pt-2 border-t border-slate-50">
                  {!agent.hasAnyToday && agent.is_active && (
                    <span className="mr-auto inline-flex items-center gap-1 text-[10px] font-bold text-amber-600">
                      <AlertTriangle className="h-3 w-3" /> Sem sessão hoje
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setViewingAgent(agent)}
                    className="h-8 px-2 text-xs"
                  >
                    <Eye className="h-3.5 w-3.5 mr-1" /> Ver
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4 text-slate-400" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="rounded-xl">
                      <DropdownMenuItem onClick={() => navigate({ to: "/reports" })}>
                        <FileText className="h-3.5 w-3.5 mr-2" /> Ver Relatório
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setViewingAgent(agent)}>
                        <Activity className="h-3.5 w-3.5 mr-2" /> Ver Jornada
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate({ to: "/map" })}>
                        <MapPin className="h-3.5 w-3.5 mr-2" /> Ver Quarteirões
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Detalhe do agente */}
      <Dialog open={!!viewingAgent} onOpenChange={(o) => !o && setViewingAgent(null)}>
        <DialogContent className="sm:max-w-[420px] rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase">
              {viewingAgent?.full_name}
            </DialogTitle>
          </DialogHeader>
          {viewingAgent && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Matrícula" value={viewingAgent.registration_number || "—"} />
                <Field label="Município" value={viewingAgent.city || "—"} />
                <Field label="E-mail" value={viewingAgent.email || "—"} />
                <Field label="Status" value={viewingAgent.is_active ? "Ativo" : "Inativo"} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <StatBox label="Trabalhados" value={viewingAgent.stats?.worked || 0} />
                <StatBox label="Fechados" value={viewingAgent.stats?.closed || 0} />
                <StatBox label="Focos" value={viewingAgent.stats?.focus || 0} danger />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OpCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-xl bg-[#111e2e] border border-[#1e3048] p-2.5 text-center">
      <p className={cn("text-xl font-black tracking-tight", color)}>{value}</p>
      <p className="text-[9px] font-black text-white/40 uppercase tracking-widest mt-0.5">
        {label}
      </p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: any;
  color: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm">
      <Icon className="h-4 w-4" style={{ color }} />
      <p className="text-2xl font-black text-slate-900 mt-1.5 leading-none">{value}</p>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
        {label}
      </p>
    </div>
  );
}

function MiniStat({
  label,
  value,
  danger,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
        {label}
      </span>
      <span
        className={cn(
          "text-xs font-black",
          danger ? "text-[#f87171]" : "text-slate-700",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
        {label}
      </p>
      <p className="text-sm font-bold text-slate-800 break-words">{value}</p>
    </div>
  );
}

function StatBox({
  label,
  value,
  danger,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div className="bg-slate-50 rounded-xl p-2.5 text-center">
      <p
        className={cn(
          "text-xl font-black",
          danger ? "text-[#f87171]" : "text-slate-800",
        )}
      >
        {value}
      </p>
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
        {label}
      </p>
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
        {label}
      </label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl bg-slate-50 border-slate-100"
        required={required}
      />
    </div>
  );
}
