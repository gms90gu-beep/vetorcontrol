import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOperationalDate } from "@/hooks/useOperationalDate";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  FileText,
  Download,
  Share2,
  Calendar,
  TrendingUp,
  BarChart3,
  Users,
  MapPin,
  ClipboardList,
  FileSpreadsheet,
  Activity,
} from "lucide-react";
import {
  generateWeeklyReportPDF,
  openWhatsAppShare,
} from "@/components/reports/WeeklyReportGenerator";

export const Route = createFileRoute("/_authenticated/relatorios")({
  component: RelatoriosPage,
});

function RelatoriosPage() {
  const { userRole } = useOperationalDate();

  if (!userRole) {
    return (
      <div className="p-8 text-sm text-muted-foreground">Carregando…</div>
    );
  }

  const isAgent = userRole === "agente";
  const isSupervisor = userRole === "supervisor";
  const isCoordinator = userRole === "coordenador";
  const isAdmin = userRole === "admin_master";

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6 pb-24 animate-in fade-in duration-500">
      <header className="space-y-1">
        <Badge className="bg-blue-600 text-white font-black text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-md">
          Módulo de Relatórios
        </Badge>
        <h1 className="text-3xl font-black tracking-tight text-slate-900">
          Relatórios
        </h1>
        <p className="text-sm text-slate-500 font-medium">
          {isAgent && "Seus relatórios operacionais — diários, semanais e ciclos."}
          {(isSupervisor || isAdmin) &&
            "Relatórios da equipe — por agente, área e pendências."}
          {isCoordinator && "Relatórios municipais e boletins oficiais."}
        </p>
      </header>

      {isAgent && <AgentReports />}
      {(isSupervisor || isAdmin) && <SupervisorReports />}
      {isCoordinator && <CoordinatorReports />}
    </div>
  );
}

/* ───────────────────────── AGENTE ───────────────────────── */

function AgentReports() {
  const [loading, setLoading] = useState(true);
  const [dailies, setDailies] = useState<any[]>([]);
  const [generating, setGenerating] = useState(false);
  const [authId, setAuthId] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string>("Agente");

  const fetchDailies = useCallback(async (aId: string) => {
    const { data, error } = await supabase
      .from("daily_work_records")
      .select(
        "id, work_date, epi_week, epi_year, properties_worked, properties_closed, properties_refused, deposits_inspected, focuses_found, tubitos_collected"
      )
      .eq("agent_id", aId)
      .order("work_date", { ascending: false })
      .limit(30);
    if (error) console.error("[RELATÓRIOS] erro ao buscar:", error);
    console.log(`[RELATÓRIOS] ${data?.length ?? 0} diárias encontradas`);
    setDailies(data || []);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        setLoading(false);
        return;
      }
      setAuthId(session.user.id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", session.user.id)
        .maybeSingle();
      if (profile?.full_name) setFullName(profile.full_name);

      const { data: agent } = await supabase
        .from("agents")
        .select("id")
        .eq("profile_id", session.user.id)
        .maybeSingle();

      if (agent?.id) {
        setAgentId(agent.id);
        await fetchDailies(agent.id);
      }
      setLoading(false);
    })();
  }, [fetchDailies]);

  // Refetch quando voltar para a aba/janela
  useEffect(() => {
    if (!agentId) return;
    const onFocus = () => fetchDailies(agentId);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [agentId, fetchDailies]);

  // Realtime: novo/atualizado registro do agente aparece na hora
  useEffect(() => {
    if (!agentId) return;
    const channel = supabase
      .channel(`dwr-${agentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "daily_work_records",
          filter: `agent_id=eq.${agentId}`,
        },
        () => fetchDailies(agentId)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [agentId, fetchDailies]);

  const handleWeekly = async () => {
    if (!authId) return;
    setGenerating(true);
    toast.info("Gerando Boletim Semanal…");
    const result = await generateWeeklyReportPDF(authId);
    if (result) {
      result.pdf.save(result.fileName);
      toast.success(
        `SE ${result.epiWeek}/${result.epiYear} — ${result.dailyCount} diária(s) consolidada(s).`
      );
    }
    setGenerating(false);
  };

  const handleShareWhatsApp = async () => {
    if (!authId) return;
    const result = await generateWeeklyReportPDF(authId);
    if (result) openWhatsAppShare(result.fileName, fullName);
  };

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ActionCard
          icon={<Calendar className="h-6 w-6" />}
          title="Relatório Semanal"
          description="Boletim oficial consolidado da semana epidemiológica atual."
          action={
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleWeekly}
                disabled={generating}
                className="h-11 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs uppercase tracking-wide"
              >
                <Download className="mr-2 h-4 w-4" /> Baixar PDF
              </Button>
              <Button
                variant="outline"
                onClick={handleShareWhatsApp}
                disabled={generating}
                className="h-11 rounded-xl font-bold text-xs uppercase tracking-wide"
              >
                <Share2 className="mr-2 h-4 w-4" /> WhatsApp
              </Button>
            </div>
          }
        />
        <ActionCard
          icon={<TrendingUp className="h-6 w-6" />}
          title="Produção do Ciclo"
          description="Acompanhe sua produção acumulada no ciclo em andamento."
          action={
            <Button
              asChild
              variant="outline"
              className="h-11 rounded-xl font-bold text-xs uppercase tracking-wide"
            >
              <Link to="/dashboard">
                <Activity className="mr-2 h-4 w-4" /> Ver no Dashboard
              </Link>
            </Button>
          }
        />
      </div>

      <Card className="p-6 rounded-3xl border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-black uppercase tracking-tight text-slate-800">
              Histórico de Diárias
            </h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Últimos 30 fechamentos
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => agentId && fetchDailies(agentId)}
            className="h-8 px-2 rounded-lg text-slate-400 hover:text-slate-700"
            title="Atualizar"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400 py-6 text-center">Carregando…</p>
        ) : dailies.length === 0 ? (
          <p className="text-sm text-slate-400 py-8 text-center font-medium">
            Nenhuma diária registrada ainda.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                  <th className="px-2 py-2 text-left">Data</th>
                  <th className="px-2 py-2 text-center">SE</th>
                  <th className="px-2 py-2 text-center">Trab.</th>
                  <th className="px-2 py-2 text-center">Fech.</th>
                  <th className="px-2 py-2 text-center">Rec.</th>
                  <th className="px-2 py-2 text-center">Dep.</th>
                  <th className="px-2 py-2 text-center">Focos</th>
                  <th className="px-2 py-2 text-center">Tub.</th>
                </tr>
              </thead>
              <tbody>
                {dailies.map((d) => (
                  <tr
                    key={d.id}
                    className="border-b border-slate-50 text-slate-700 font-medium"
                  >
                    <td className="px-2 py-2 whitespace-nowrap">
                      {format(
                        new Date(`${d.work_date}T12:00:00`),
                        "dd/MM/yyyy",
                        { locale: ptBR }
                      )}
                    </td>
                    <td className="px-2 py-2 text-center text-slate-500">
                      {d.epi_week ? `${d.epi_week}/${d.epi_year}` : "—"}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {d.properties_worked ?? 0}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {d.properties_closed ?? 0}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {d.properties_refused ?? 0}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {d.deposits_inspected ?? 0}
                    </td>
                    <td className="px-2 py-2 text-center text-rose-600 font-bold">
                      {d.focuses_found ?? 0}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {d.tubitos_collected ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

/* ─────────────────────── SUPERVISOR ─────────────────────── */

function SupervisorReports() {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <NavCard
          icon={<Users className="h-6 w-6" />}
          title="Relatórios por Agente"
          description="Produção individual da equipe."
          to="/supervision"
        />
        <NavCard
          icon={<MapPin className="h-6 w-6" />}
          title="Relatórios por Área"
          description="Cobertura territorial e desempenho por área."
          to="/map"
        />
        <NavCard
          icon={<Calendar className="h-6 w-6" />}
          title="Boletins Semanais"
          description="Consolidados oficiais por semana epidemiológica."
          to="/reports"
        />
        <NavCard
          icon={<ClipboardList className="h-6 w-6" />}
          title="Pendências & Recuperação"
          description="Acompanhe pendências e tentativas de recuperação."
          to="/pending"
        />
      </div>

      <IntelligenceShortcut />
    </>
  );
}

/* ─────────────────────── COORDENADOR ────────────────────── */

function CoordinatorReports() {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <NavCard
          icon={<BarChart3 className="h-6 w-6" />}
          title="Relatórios Municipais"
          description="Indicadores consolidados do município."
          to="/supervision"
        />
        <NavCard
          icon={<TrendingUp className="h-6 w-6" />}
          title="Relatórios por Ciclo"
          description="Comparativo e fechamento de ciclos."
          to="/cycles"
        />
        <NavCard
          icon={<FileText className="h-6 w-6" />}
          title="Boletins Oficiais"
          description="Boletins semanais e consolidados oficiais."
          to="/reports"
        />
        <NavCard
          icon={<FileSpreadsheet className="h-6 w-6" />}
          title="Indicadores Consolidados"
          description="Painel analítico estratégico."
          to="/reports"
        />
      </div>

      <IntelligenceShortcut />
    </>
  );
}

/* ─────────────────────── helpers ─────────────────────── */

function ActionCard({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <Card className="p-6 rounded-3xl border-slate-100 hover:shadow-md transition-shadow">
      <div className="h-12 w-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center mb-4 shadow-lg shadow-slate-200">
        {icon}
      </div>
      <h3 className="text-base font-black tracking-tight text-slate-800 mb-1">
        {title}
      </h3>
      <p className="text-xs text-slate-500 font-medium mb-4 leading-relaxed">
        {description}
      </p>
      {action}
    </Card>
  );
}

function NavCard({
  icon,
  title,
  description,
  to,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  to: string;
}) {
  return (
    <Link
      to={to as any}
      className="block group"
    >
      <Card className="p-6 rounded-3xl border-slate-100 hover:border-slate-900 hover:shadow-lg transition-all active:scale-[0.98] h-full">
        <div className="h-12 w-12 rounded-2xl bg-slate-100 group-hover:bg-slate-900 group-hover:text-white text-slate-700 flex items-center justify-center mb-4 transition-colors">
          {icon}
        </div>
        <h3 className="text-base font-black tracking-tight text-slate-800 mb-1">
          {title}
        </h3>
        <p className="text-xs text-slate-500 font-medium leading-relaxed">
          {description}
        </p>
      </Card>
    </Link>
  );
}

function IntelligenceShortcut() {
  return (
    <Card className="p-6 rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 text-white border-0">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Badge className="bg-blue-500 mb-3 font-black uppercase tracking-widest text-[9px]">
            VetorControl Intelligence
          </Badge>
          <h3 className="text-xl font-black tracking-tight">
            Painéis Analíticos & Estratégicos
          </h3>
          <p className="text-sm text-slate-300 max-w-md mt-1">
            Cobertura territorial, ranking, indicadores em tempo real e alertas
            operacionais.
          </p>
        </div>
        <Button
          asChild
          className="bg-white text-slate-900 hover:bg-slate-100 rounded-xl h-12 px-6 font-black uppercase tracking-wide text-xs"
        >
          <Link to="/reports">
            <BarChart3 className="mr-2 h-4 w-4" /> Abrir Intelligence
          </Link>
        </Button>
      </div>
    </Card>
  );
}
