import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { listRemoteOrCache } from "@/lib/offline/repos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Users,
  UserCog,
  Activity,
  MapPin,
  Search,
  Eye,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

function initials(name?: string | null) {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "??";
}

export function CoordinatorDashboard() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const [supervisors, setSupervisors] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function fetchAll() {
    setLoading(true);
    try {
      // RLS filtra automaticamente: coordenador vê seus supervisores e os agentes deles
      const profiles = await listRemoteOrCache<any>({
        name: "profiles",
        remote: async () => await supabase.from("profiles").select("*"),
      });

      const supList = (profiles || []).filter((p: any) => p.role === "supervisor");
      const agList = (profiles || []).filter(
        (p: any) => p.role === "agente" || p.role === "agent",
      );

      const today = new Date().toISOString().slice(0, 10);
      const [visits, openSessions] = await Promise.all([
        listRemoteOrCache<any>({
          name: "visits",
          remote: async () => await supabase.from("visits").select("agent_id, status, has_focus"),
        }),
        listRemoteOrCache<any>({
          name: "field_work_sessions",
          remote: async () => await supabase
            .from("field_work_sessions")
            .select("user_id, status, session_date")
            .gte("session_date", today),
          filter: (r) => String(r.session_date || "") >= today,
        }),
      ]);

      const supWithStats = supList.map((s: any) => {
        const team = agList.filter((a: any) => a.supervisor_id === s.id);
        const teamIds = team.map((a: any) => a.id);
        const teamVisits = (visits || []).filter((v: any) => teamIds.includes(v.agent_id));
        return {
          ...s,
          teamCount: team.length,
          visitsCount: teamVisits.length,
          focusCount: teamVisits.filter((v: any) => v.has_focus).length,
          closedCount: teamVisits.filter((v: any) => v.status === "closed").length,
        };
      });

      setSupervisors(supWithStats);
      setAgents(agList);
      setSessions(openSessions || []);
    } catch (e: any) {
      console.error(e);
      toast.error("Erro ao carregar dados da coordenação");
    } finally {
      setLoading(false);
    }
  }

  const totals = useMemo(() => {
    const activeSessions = sessions.filter((s) => s.status === "active").length;
    return {
      supervisors: supervisors.length,
      agents: agents.length,
      activeSessions,
      finishedBlocks: 0, // pode ser ligado a `blocks.status='finished'` filtrado se necessário
    };
  }, [supervisors, agents, sessions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return supervisors;
    return supervisors.filter(
      (s) =>
        s.full_name?.toLowerCase().includes(q) ||
        s.email?.toLowerCase().includes(q) ||
        s.city?.toLowerCase().includes(q),
    );
  }, [supervisors, search]);

  return (
    <div className="min-h-screen bg-[#f4f5f7] -mx-4 md:-mx-0">
      {/* Header */}
      <div className="bg-[#0b1520] text-white px-4 py-5">
        <Badge className="bg-amber-500/15 text-amber-400 border-none mb-2 text-[10px] font-black tracking-widest">
          COORDENAÇÃO
        </Badge>
        <h1 className="text-2xl font-black">Painel do Coordenador</h1>
        <p className="text-xs text-white/60 mt-1">
          Acompanhe Supervisores, equipes e indicadores operacionais
        </p>
        <p className="text-[10px] text-white/40 mt-2 uppercase tracking-widest">
          {role} · {user?.email}
        </p>
      </div>

      <div className="px-4 py-5 space-y-5 pb-24">
        {/* Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard label="Supervisores" value={totals.supervisors} icon={UserCog} color="#185fa5" />
          <MetricCard label="Agentes" value={totals.agents} icon={Users} color="#3b6d11" />
          <MetricCard label="Jornadas Ativas" value={totals.activeSessions} icon={Activity} color="#0d7a5f" />
          <MetricCard label="Quarteirões" value={totals.finishedBlocks} icon={MapPin} color="#a32d2d" />
        </div>

        {/* Busca */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar supervisor por nome, e-mail ou cidade..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 rounded-2xl bg-white border-slate-200 h-11"
          />
        </div>

        {/* Lista de supervisores */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
              Supervisores da sua coordenação
            </h2>
            <span className="text-xs font-bold text-slate-500">{filtered.length}</span>
          </div>

          {loading ? (
            <div className="py-12 text-center text-slate-400 text-sm">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              Nenhum supervisor vinculado.
            </div>
          ) : (
            filtered.map((s) => (
              <div
                key={s.id}
                className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div className="h-11 w-11 shrink-0 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-black text-sm">
                    {initials(s.full_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-black text-slate-900 text-sm truncate">
                        {s.full_name}
                      </h3>
                      <Badge
                        className={cn(
                          "rounded-md px-1.5 py-0 text-[9px] font-black uppercase tracking-wider border-none",
                          s.is_active
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-rose-100 text-rose-700",
                        )}
                      >
                        {s.is_active ? "ATIVO" : "INATIVO"}
                      </Badge>
                    </div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                      {s.email} · {s.city || "—"}
                    </p>

                    <div className="grid grid-cols-4 gap-2 mt-2">
                      <Mini label="Agentes" value={s.teamCount} />
                      <Mini label="Visitas" value={s.visitsCount} />
                      <Mini label="Fechados" value={s.closedCount} />
                      <Mini label="Focos" value={s.focusCount} danger />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-1 mt-2 pt-2 border-t border-slate-50">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate({ to: "/reports" })}
                    className="h-8 px-2 text-xs"
                  >
                    <FileText className="h-3.5 w-3.5 mr-1" /> Relatórios
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate({ to: "/supervision" })}
                    className="h-8 px-2 text-xs"
                  >
                    <Eye className="h-3.5 w-3.5 mr-1" /> Ver equipe
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
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

function Mini({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div>
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
        {label}
      </p>
      <p className={cn("text-sm font-black", danger ? "text-[#f87171]" : "text-slate-800")}>
        {value}
      </p>
    </div>
  );
}
