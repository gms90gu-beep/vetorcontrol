import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  FileText,
  Download,
  FileSpreadsheet,
  Calendar,
  TrendingUp,
  Eye,
  RefreshCw,
} from "lucide-react";
import { getEpiWeek } from "@/lib/cycle-week";
import {
  generateDailyReportPDF,
} from "@/components/reports/DailyReportGenerator";
import { generateWeeklyReportPDF } from "@/components/reports/WeeklyReportGenerator";

type Daily = {
  id: string;
  work_date: string;
  epi_week: number | null;
  epi_year: number | null;
  cycle_id: string | null;
  status: string;
  properties_worked: number | null;
  properties_closed: number | null;
  deposits_inspected: number | null;
  deposits_treated: number | null;
  positive_foci: number | null;
  tubitos_collected: number | null;
  larvicide_amount: number | null;
  pending_visits: number | null;
  blocks_worked?: number | null;
};

export function AgentReportsSimple() {
  const [loading, setLoading] = useState(true);
  const [authId, setAuthId] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [agentMeta, setAgentMeta] = useState({
    name: "Agente",
    registration: "—",
    municipality: "—",
  });
  const [dailies, setDailies] = useState<Daily[]>([]);

  const today = format(new Date(), "yyyy-MM-dd");
  const epi = useMemo(() => getEpiWeek(new Date()), []);

  const fetchDailies = useCallback(async (aId: string) => {
    const { data, error } = await supabase
      .from("daily_work_records")
      .select(
        "id, work_date, epi_week, epi_year, cycle_id, status, properties_worked, properties_closed, deposits_inspected, deposits_treated, positive_foci, tubitos_collected, larvicide_amount, pending_visits, blocks_worked"
      )
      .eq("agent_id", aId)
      .order("work_date", { ascending: false })
      .limit(60);
    if (error) console.error("[RELATÓRIOS AGENTE]", error);
    setDailies((data || []) as Daily[]);
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
        .select("full_name, registration_number, city")
        .eq("id", session.user.id)
        .maybeSingle();
      const { data: agent } = await supabase
        .from("agents")
        .select("id, name, registration_id, municipality")
        .eq("profile_id", session.user.id)
        .maybeSingle();
      if (agent?.id) {
        setAgentId(agent.id);
        setAgentMeta({
          name: agent.name || profile?.full_name || "Agente",
          registration:
            agent.registration_id || profile?.registration_number || "—",
          municipality: agent.municipality || profile?.city || "—",
        });
        await fetchDailies(agent.id);
      }
      setLoading(false);
    })();
  }, [fetchDailies]);

  const todayRecord = useMemo(
    () => dailies.find((d) => d.work_date === today) || null,
    [dailies, today]
  );

  const weekRecords = useMemo(
    () =>
      dailies.filter(
        (d) => d.epi_week === epi.week && d.epi_year === epi.year
      ),
    [dailies, epi]
  );

  const sum = (arr: Daily[], k: keyof Daily) =>
    arr.reduce((a, r) => a + (Number(r[k] as any) || 0), 0);

  const todayStats = {
    worked: Number(todayRecord?.properties_worked || 0),
    closed: Number(todayRecord?.properties_closed || 0),
    deposits: Number(todayRecord?.deposits_inspected || 0),
    foci: Number(todayRecord?.positive_foci || 0),
    pending: Number(todayRecord?.pending_visits || 0),
    tubitos: Number(todayRecord?.tubitos_collected || 0),
    larvicide: Number(todayRecord?.larvicide_amount || 0),
  };

  const weekStats = {
    worked: sum(weekRecords, "properties_worked"),
    blocks: sum(weekRecords, "blocks_worked"),
    deposits: sum(weekRecords, "deposits_inspected"),
    foci: sum(weekRecords, "positive_foci"),
    pending: sum(weekRecords, "pending_visits"),
  };

  const buildDailyPdf = async (id: string) =>
    generateDailyReportPDF(id, {
      agentName: agentMeta.name,
      registration: agentMeta.registration,
      municipality: agentMeta.municipality,
      cycleNumber: null,
    });

  const handleDailyPdf = async () => {
    if (!todayRecord) {
      toast.info("Nenhum relatório diário encontrado para hoje.");
      return;
    }
    toast.info("Gerando PDF diário…");
    const res = await buildDailyPdf(todayRecord.id);
    if (res) {
      res.pdf.save(res.fileName);
      toast.success("PDF gerado");
    }
  };

  const handleWeeklyPdf = async () => {
    if (!authId) return;
    toast.info("Gerando Boletim Semanal…");
    const res = await generateWeeklyReportPDF(authId);
    if (res) {
      res.pdf.save(res.fileName);
      toast.success(`SE ${res.epiWeek}/${res.epiYear} gerado`);
    }
  };

  const handleCsv = () => {
    if (weekRecords.length === 0) {
      toast.info("Sem dados na semana atual.");
      return;
    }
    const headers = [
      "Data",
      "SE",
      "Imóveis Trabalhados",
      "Fechados",
      "Depósitos Inspecionados",
      "Focos",
      "Pendências",
      "Tubitos",
      "Larvicida(g)",
    ];
    const lines = weekRecords.map((d) =>
      [
        d.work_date,
        `${d.epi_week}/${d.epi_year}`,
        d.properties_worked ?? 0,
        d.properties_closed ?? 0,
        d.deposits_inspected ?? 0,
        d.positive_foci ?? 0,
        d.pending_visits ?? 0,
        d.tubitos_collected ?? 0,
        d.larvicide_amount ?? 0,
      ].join(",")
    );
    const csv = [headers.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meus-relatorios-SE${epi.week}-${epi.year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-sm text-slate-400">
        Carregando seus relatórios…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Resumo do Dia */}
      <Card className="p-5 rounded-3xl border-slate-100 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-2xl bg-emerald-100 grid place-items-center">
              <Calendar className="h-5 w-5 text-emerald-700" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">
                Resumo do Dia
              </h3>
              <p className="text-[11px] font-bold text-slate-400 uppercase">
                {format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}
              </p>
            </div>
          </div>
          <Badge className="bg-emerald-600 text-white text-[10px] font-black">
            HOJE
          </Badge>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Imóveis Trabalhados" value={todayStats.worked} />
          <Stat label="Imóveis Fechados" value={todayStats.closed} />
          <Stat label="Depósitos Inspec." value={todayStats.deposits} />
          <Stat label="Focos Encontrados" value={todayStats.foci} accent="rose" />
          <Stat label="Pendências" value={todayStats.pending} accent="amber" />
          <Stat label="Tubitos Coletados" value={todayStats.tubitos} />
          <Stat
            label="Larvicida (g)"
            value={todayStats.larvicide}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            asChild
            disabled={!todayRecord}
            className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl h-11 px-5 font-bold text-xs uppercase tracking-wide"
          >
            {todayRecord ? (
              <Link
                to="/daily-bulletin/$id"
                params={{ id: todayRecord.id }}
              >
                <Eye className="h-4 w-4 mr-2" /> Ver Boletim Diário
              </Link>
            ) : (
              <span>
                <Eye className="h-4 w-4 mr-2" /> Sem boletim hoje
              </span>
            )}
          </Button>
        </div>
      </Card>

      {/* Resumo da Semana */}
      <Card className="p-5 rounded-3xl border-slate-100 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-2xl bg-blue-100 grid place-items-center">
              <TrendingUp className="h-5 w-5 text-blue-700" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">
                Resumo da Semana
              </h3>
              <p className="text-[11px] font-bold text-slate-400 uppercase">
                SE {String(epi.week).padStart(2, "0")}/{epi.year} ·{" "}
                {weekRecords.length} diária(s)
              </p>
            </div>
          </div>
          <Badge className="bg-blue-600 text-white text-[10px] font-black">
            ESTA SEMANA
          </Badge>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="Imóveis Trabalhados" value={weekStats.worked} />
          <Stat label="Quarteirões" value={weekStats.blocks} />
          <Stat label="Depósitos Inspec." value={weekStats.deposits} />
          <Stat label="Focos" value={weekStats.foci} accent="rose" />
          <Stat label="Pendências" value={weekStats.pending} accent="amber" />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            onClick={handleWeeklyPdf}
            className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl h-11 px-5 font-bold text-xs uppercase tracking-wide"
          >
            <FileText className="h-4 w-4 mr-2" /> Ver Boletim Semanal
          </Button>
        </div>
      </Card>

      {/* Exportação */}
      <Card className="p-5 rounded-3xl border-slate-100 shadow-sm">
        <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight mb-3">
          Exportar
        </h3>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={handleDailyPdf}
            variant="outline"
            className="rounded-xl h-11 px-4 font-bold text-xs uppercase tracking-wide border-slate-200"
          >
            <Download className="h-4 w-4 mr-2" /> PDF Diário
          </Button>
          <Button
            onClick={handleWeeklyPdf}
            variant="outline"
            className="rounded-xl h-11 px-4 font-bold text-xs uppercase tracking-wide border-slate-200"
          >
            <Download className="h-4 w-4 mr-2" /> PDF Semanal
          </Button>
          <Button
            onClick={handleCsv}
            variant="outline"
            className="rounded-xl h-11 px-4 font-bold text-xs uppercase tracking-wide border-slate-200"
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" /> Exportar CSV
          </Button>
          <Button
            onClick={() => agentId && fetchDailies(agentId)}
            variant="ghost"
            className="rounded-xl h-11 px-4 font-bold text-xs uppercase tracking-wide text-slate-500 ml-auto"
          >
            <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "rose" | "amber";
}) {
  const color =
    accent === "rose"
      ? "text-rose-600"
      : accent === "amber"
        ? "text-amber-600"
        : "text-slate-900";
  return (
    <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
        {label}
      </p>
      <p className={`text-2xl font-black tabular-nums mt-1 ${color}`}>
        {value}
      </p>
    </div>
  );
}
