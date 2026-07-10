import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshCw,
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
  Printer,
  Eye,
  RotateCw,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  Clock,
  Filter,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOperationalDate } from "@/hooks/useOperationalDate";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  generateWeeklyReportPDF,
  openWhatsAppShare,
} from "@/components/reports/WeeklyReportGenerator";
import {
  generateDailyReportPDF,
  printPdf,
  shareBlobViaWhatsApp,
} from "@/components/reports/DailyReportGenerator";
import { AgentReportsSimple } from "@/components/agent/AgentReportsSimple";
import { useServerFn } from "@tanstack/react-start";
import { rebuildDailyRecords } from "@/lib/reports-reconcile.functions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/relatorios")({
  component: RelatoriosPage,
});

function RelatoriosPage() {
  const { userRole } = useOperationalDate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const rebuildFn = useServerFn(rebuildDailyRecords);

  if (!userRole)
    return <div className="p-8 text-sm text-muted-foreground">Carregando…</div>;

  const isAgent = userRole === "agente";
  const isSupervisor = userRole === "supervisor";
  const isCoordinator = userRole === "coordenador";
  const isAdmin = userRole === "admin_master";
  const canRebuild = isSupervisor || isCoordinator || isAdmin;

  const handleRebuild = async () => {
    setConfirmOpen(false);
    setRebuilding(true);
    const to = getOperationalDate();
    const [ty, tm, td] = to.split("-").map(Number);
    const fromDate = new Date(ty, tm - 1, td);
    fromDate.setDate(fromDate.getDate() - 90);
    const from = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, "0")}-${String(fromDate.getDate()).padStart(2, "0")}`;
    console.log("[PRODUCTION_INTEGRITY_START]", { from, to });
    try {
      const res = await rebuildFn({ data: { from, to } });
      console.log("[PRODUCTION_INTEGRITY_FINISH]", res);
      toast.success(
        `Reconstrução concluída — ${res.updated}/${res.scanned} diária(s) atualizada(s).`,
      );
    } catch (e: any) {
      console.error("[PRODUCTION_INTEGRITY_ERROR]", e);
      toast.error(`Falha na reconstrução: ${e?.message || "erro desconhecido"}`);
    } finally {
      setRebuilding(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6 pb-24 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="space-y-1">
          <Badge className="bg-blue-600 text-white font-black text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-md">
            Módulo de Relatórios
          </Badge>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">
            Relatórios
          </h1>
          <p className="text-sm text-slate-500 font-medium">
            {isAgent && "Histórico operacional, auditoria e geração de PDFs."}
            {(isSupervisor || isAdmin) &&
              "Relatórios da equipe — por agente, área e pendências."}
            {isCoordinator && "Relatórios municipais e boletins oficiais."}
          </p>
        </div>
        {canRebuild && (
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={rebuilding}
            variant="outline"
            className="border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-2xl h-12 px-5 font-black text-xs uppercase tracking-widest shadow-sm"
          >
            <RotateCw className={`mr-2 h-4 w-4 ${rebuilding ? "animate-spin" : ""}`} />
            {rebuilding ? "Reconstruindo…" : "Reconstruir Relatórios"}
          </Button>
        )}
      </header>

      {isAgent && <AgentReportsSimple />}
      {(isSupervisor || isAdmin) && <SupervisorReports />}
      {isCoordinator && <CoordinatorReports />}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reconstruir os resumos da produção?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá recalcular os Daily Work Records utilizando as visitas
              existentes dos últimos 90 dias.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRebuild}>Reconstruir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ───────────────────────── AGENTE ───────────────────────── */

type Daily = {
  id: string;
  work_date: string;
  epi_week: number | null;
  epi_year: number | null;
  cycle_id: string | null;
  status: string;
  properties_worked: number | null;
  properties_closed: number | null;
  properties_refused: number | null;
  properties_recovered: number | null;
  deposits_inspected: number | null;
  deposits_treated: number | null;
  positive_foci: number | null;
  tubitos_collected: number | null;
  larvicide_amount: number | null;
  pending_visits: number | null;
};

function AgentReports() {
  const [loading, setLoading] = useState(true);
  const [dailies, setDailies] = useState<Daily[]>([]);
  const [cycles, setCycles] = useState<
    { id: string; number: number | null; name: string | null }[]
  >([]);
  const [authId, setAuthId] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [agentMeta, setAgentMeta] = useState<{
    name: string;
    registration: string;
    municipality: string;
  }>({ name: "Agente", registration: "—", municipality: "—" });

  // Filtros
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cycleFilter, setCycleFilter] = useState("all");
  const [seFilter, setSeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [generatingWeekly, setGeneratingWeekly] = useState(false);
  const [auditWeek, setAuditWeek] = useState<{ week: number; year: number } | null>(
    null
  );

  const fetchDailies = useCallback(async (aId: string) => {
    console.log("[REPORT_BOOT]", { agentId: aId });
    try {
      const { listRemoteOrCache } = await import("@/lib/offline/repos");
      const rows = await listRemoteOrCache<Daily>({
        name: "daily_work_records",
        remote: () =>
          supabase
            .from("daily_work_records")
            .select(
              "id, work_date, epi_week, epi_year, cycle_id, status, properties_worked, properties_closed, properties_refused, properties_recovered, deposits_inspected, deposits_treated, positive_foci, tubitos_collected, larvicide_amount, pending_visits, agent_id, updated_at"
            )
            .eq("agent_id", aId)
            .order("work_date", { ascending: false })
            .limit(180) as any,
        filter: (r: any) => r.agent_id === aId,
      });
      const sorted = [...(rows || [])].sort((a: any, b: any) =>
        String(b.work_date || "").localeCompare(String(a.work_date || ""))
      );
      console.log("[REPORT_CACHE]", { count: sorted.length });
      setDailies(sorted as Daily[]);
    } catch (e) {
      console.log("[REPORT_ERROR]", { stage: "fetchDailies", message: String((e as any)?.message || e) });
      setDailies([]);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          setLoading(false);
          return;
        }
        setAuthId(session.user.id);

        // profile + agent — offline-safe (não derruba a tela)
        let profile: any = null;
        let agent: any = null;
        try {
          const { safeSupabaseRead } = await import("@/lib/offline/repos");
          profile = await safeSupabaseRead<any>(
            () => supabase.from("profiles").select("full_name, registration_number, city").eq("id", session.user.id).maybeSingle() as any,
            null,
            "profiles"
          );
          agent = await safeSupabaseRead<any>(
            () => supabase.from("agents").select("name, registration_id, municipality").eq("profile_id", session.user.id).maybeSingle() as any,
            null,
            "agents"
          );
        } catch (e) {
          console.log("[REPORT_ERROR]", { stage: "profile/agent", message: String((e as any)?.message || e) });
        }

        setAgentId(session.user.id);
        setAgentMeta({
          name: agent?.name || profile?.full_name || "Agente",
          registration: agent?.registration_id || profile?.registration_number || "—",
          municipality: agent?.municipality || profile?.city || "—",
        });
        await fetchDailies(session.user.id);

        try {
          const { listRemoteOrCache } = await import("@/lib/offline/repos");
          const cs = await listRemoteOrCache<any>({
            name: "cycles",
            remote: () => supabase.from("cycles").select("id, number, name").order("number", { ascending: false }) as any,
          });
          console.log("[REPORT_REMOTE]", { cycles: cs?.length || 0 });
          setCycles(cs || []);
        } catch (e) {
          console.log("[REPORT_ERROR]", { stage: "cycles", message: String((e as any)?.message || e) });
          setCycles([]);
        }
      } catch (e) {
        console.log("[REPORT_ERROR]", { stage: "boot", message: String((e as any)?.message || e) });
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchDailies]);

  // Refetch on focus
  useEffect(() => {
    if (!agentId) return;
    const onFocus = () => { fetchDailies(agentId).catch(() => {}); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [agentId, fetchDailies]);

  // Realtime — apenas online; falhas silenciosas
  useEffect(() => {
    if (!agentId) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    let channel: any = null;
    try {
      channel = supabase
        .channel(`dwr-${agentId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "daily_work_records", filter: `agent_id=eq.${agentId}` },
          () => { fetchDailies(agentId).catch(() => {}); }
        )
        .subscribe();
    } catch (e) {
      console.log("[REPORT_ERROR]", { stage: "realtime", message: String((e as any)?.message || e) });
    }
    return () => {
      try { if (channel) supabase.removeChannel(channel); } catch {}
    };
  }, [agentId, fetchDailies]);


  const cycleMap = useMemo(() => {
    const m = new Map<string, string>();
    cycles.forEach((c) =>
      m.set(c.id, c.number != null ? String(c.number) : c.name || "—")
    );
    return m;
  }, [cycles]);

  // SE únicas
  const seOptions = useMemo(() => {
    const set = new Set<string>();
    dailies.forEach((d) => {
      if (d.epi_week && d.epi_year) set.add(`${d.epi_week}/${d.epi_year}`);
    });
    return Array.from(set).sort((a, b) => (a < b ? 1 : -1));
  }, [dailies]);

  // Filtered dailies
  const filteredDailies = useMemo(() => {
    return dailies.filter((d) => {
      if (from && d.work_date < from) return false;
      if (to && d.work_date > to) return false;
      if (cycleFilter !== "all" && d.cycle_id !== cycleFilter) return false;
      if (seFilter !== "all") {
        const k = `${d.epi_week}/${d.epi_year}`;
        if (k !== seFilter) return false;
      }
      if (statusFilter !== "all" && d.status !== statusFilter) return false;
      return true;
    });
  }, [dailies, from, to, cycleFilter, seFilter, statusFilter]);

  // Weekly aggregation
  const weeklyAgg = useMemo(() => {
    const map = new Map<
      string,
      {
        week: number;
        year: number;
        records: Daily[];
        worked: number;
        closed: number;
        refused: number;
        focos: number;
        tubitos: number;
        larvicide: number;
      }
    >();
    filteredDailies.forEach((d) => {
      if (!d.epi_week || !d.epi_year) return;
      const key = `${d.epi_year}-${String(d.epi_week).padStart(2, "0")}`;
      const cur = map.get(key) || {
        week: d.epi_week,
        year: d.epi_year,
        records: [],
        worked: 0,
        closed: 0,
        refused: 0,
        focos: 0,
        tubitos: 0,
        larvicide: 0,
      };
      cur.records.push(d);
      cur.worked += d.properties_worked || 0;
      cur.closed += d.properties_closed || 0;
      cur.refused += d.properties_refused || 0;
      cur.focos += d.positive_foci || 0;
      cur.tubitos += d.tubitos_collected || 0;
      cur.larvicide += Number(d.larvicide_amount || 0);
      map.set(key, cur);
    });
    return Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([, v]) => v);
  }, [filteredDailies]);

  // ── Actions
  const buildDailyPdf = async (id: string) => {
    const cycleNumber = (() => {
      const d = dailies.find((x) => x.id === id);
      return d?.cycle_id ? cycleMap.get(d.cycle_id) || null : null;
    })();
    return await generateDailyReportPDF(id, {
      agentName: agentMeta.name,
      registration: agentMeta.registration,
      municipality: agentMeta.municipality,
      cycleNumber,
    });
  };

  const handleDailyDownload = async (id: string) => {
    toast.info("Gerando PDF…");
    const res = await buildDailyPdf(id);
    if (res) {
      res.pdf.save(res.fileName);
      toast.success("PDF gerado");
    }
  };

  const handleDailyPrint = async (id: string) => {
    const res = await buildDailyPdf(id);
    if (res) printPdf(res.pdf);
  };

  const handleDailyShare = async (id: string) => {
    const res = await buildDailyPdf(id);
    if (res)
      await shareBlobViaWhatsApp(
        res.blob,
        res.fileName,
        `Relatório Diário — ${agentMeta.name}`
      );
  };

  const handleDailyView = async (id: string) => {
    const res = await buildDailyPdf(id);
    if (res) {
      const url = URL.createObjectURL(res.blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  };

  const handleWeekly = async (week?: number, year?: number) => {
    if (!authId) return;
    setGeneratingWeekly(true);
    toast.info("Gerando Boletim Semanal…");
    const ref =
      week && year
        ? // Quarta-feira da SE para garantir cálculo correto
          (() => {
            const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
            return simple;
          })()
        : new Date();
    const result = await generateWeeklyReportPDF(authId, ref);
    if (result) {
      result.pdf.save(result.fileName);
      toast.success(
        `SE ${result.epiWeek}/${result.epiYear} — ${result.dailyCount} diária(s) consolidada(s).`
      );
    }
    setGeneratingWeekly(false);
  };

  const handleWeeklyShare = async () => {
    if (!authId) return;
    const result = await generateWeeklyReportPDF(authId);
    if (result) openWhatsAppShare(result.fileName, agentMeta.name);
  };

  const auditRecords = useMemo(() => {
    if (!auditWeek) return [];
    return dailies.filter(
      (d) => d.epi_week === auditWeek.week && d.epi_year === auditWeek.year
    );
  }, [auditWeek, dailies]);

  return (
    <>
      {/* Filtros */}
      <Card className="p-4 rounded-2xl border-slate-100">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-slate-500" />
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            Filtros
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-slate-400">De</label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-9 text-xs"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-slate-400">Até</label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-9 text-xs"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-slate-400">Ciclo</label>
            <Select value={cycleFilter} onValueChange={setCycleFilter}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {cycles.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    Ciclo {c.number ?? c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-slate-400">SE</label>
            <Select value={seFilter} onValueChange={setSeFilter}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {seOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    SE {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-slate-400">Status</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="completed">Encerrada</SelectItem>
                <SelectItem value="in_progress">Em andamento</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center justify-between mt-3">
          <span className="text-[10px] font-bold uppercase text-slate-400">
            {filteredDailies.length} registro(s) • {weeklyAgg.length} semana(s)
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => agentId && fetchDailies(agentId)}
            className="h-8 px-2 text-slate-500"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Atualizar
          </Button>
        </div>
      </Card>

      <Tabs defaultValue="diarias" className="w-full">
        <TabsList className="bg-slate-100 h-10 p-1 rounded-xl">
          <TabsTrigger
            value="diarias"
            className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900 font-bold text-xs uppercase tracking-wide px-4"
          >
            <Calendar className="h-3.5 w-3.5 mr-1.5" /> Diárias
          </TabsTrigger>
          <TabsTrigger
            value="semanais"
            className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900 font-bold text-xs uppercase tracking-wide px-4"
          >
            <FileText className="h-3.5 w-3.5 mr-1.5" /> Semanais
          </TabsTrigger>
        </TabsList>

        {/* ── DIÁRIAS ── */}
        <TabsContent value="diarias" className="mt-4">
          <Card className="p-5 rounded-3xl border-slate-100">
            <h3 className="text-lg font-black uppercase tracking-tight text-slate-800 mb-1">
              Histórico de Diárias
            </h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">
              Cada registro é um snapshot oficial da jornada encerrada
            </p>

            {loading ? (
              <p className="text-sm text-slate-400 py-6 text-center">Carregando…</p>
            ) : filteredDailies.length === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center font-medium">
                Nenhuma diária encontrada com os filtros atuais.
              </p>
            ) : (
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                      <th className="px-2 py-2 text-left">Data</th>
                      <th className="px-2 py-2 text-center">SE</th>
                      <th className="px-2 py-2 text-center">Ciclo</th>
                      <th className="px-2 py-2 text-center">Trab.</th>
                      <th className="px-2 py-2 text-center">Fech.</th>
                      <th className="px-2 py-2 text-center">Rec.</th>
                      <th className="px-2 py-2 text-center">Focos</th>
                      <th className="px-2 py-2 text-center">Tub.</th>
                      <th className="px-2 py-2 text-center">Larv.</th>
                      <th className="px-2 py-2 text-center">Status</th>
                      <th className="px-2 py-2 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDailies.map((d) => (
                      <tr
                        key={d.id}
                        className="border-b border-slate-50 text-slate-700 font-medium hover:bg-slate-50/60"
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
                        <td className="px-2 py-2 text-center text-slate-500">
                          {d.cycle_id ? cycleMap.get(d.cycle_id) || "—" : "—"}
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
                        <td className="px-2 py-2 text-center text-rose-600 font-bold">
                          {d.positive_foci ?? 0}
                        </td>
                        <td className="px-2 py-2 text-center">
                          {d.tubitos_collected ?? 0}
                        </td>
                        <td className="px-2 py-2 text-center">
                          {d.larvicide_amount ?? 0}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <StatusBadge status={d.status} />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <div className="inline-flex items-center gap-1">
                            <IconBtn
                              title="Visualizar"
                              onClick={() => handleDailyView(d.id)}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </IconBtn>
                            <IconBtn
                              title="Baixar PDF"
                              onClick={() => handleDailyDownload(d.id)}
                            >
                              <Download className="h-3.5 w-3.5" />
                            </IconBtn>
                            <IconBtn
                              title="Regerar PDF"
                              onClick={() => handleDailyDownload(d.id)}
                            >
                              <RotateCw className="h-3.5 w-3.5" />
                            </IconBtn>
                            <IconBtn
                              title="Imprimir"
                              onClick={() => handleDailyPrint(d.id)}
                            >
                              <Printer className="h-3.5 w-3.5" />
                            </IconBtn>
                            <IconBtn
                              title="Compartilhar"
                              onClick={() => handleDailyShare(d.id)}
                            >
                              <Share2 className="h-3.5 w-3.5" />
                            </IconBtn>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ── SEMANAIS ── */}
        <TabsContent value="semanais" className="mt-4 space-y-4">
          <Card className="p-5 rounded-3xl border-slate-100">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div>
                <h3 className="text-lg font-black uppercase tracking-tight text-slate-800">
                  Boletins Semanais
                </h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Soma oficial dos diários por semana epidemiológica
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => handleWeekly()}
                  disabled={generatingWeekly}
                  className="h-9 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-[11px] uppercase tracking-wide"
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" /> SE Atual
                </Button>
                <Button
                  variant="outline"
                  onClick={handleWeeklyShare}
                  disabled={generatingWeekly}
                  className="h-9 rounded-xl font-bold text-[11px] uppercase tracking-wide"
                >
                  <Share2 className="mr-1.5 h-3.5 w-3.5" /> WhatsApp
                </Button>
              </div>
            </div>

            {weeklyAgg.length === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center font-medium">
                Nenhuma semana com diárias encerradas ainda.
              </p>
            ) : (
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                      <th className="px-2 py-2 text-left">SE</th>
                      <th className="px-2 py-2 text-center">Ano</th>
                      <th className="px-2 py-2 text-center">Diárias</th>
                      <th className="px-2 py-2 text-center">Trab.</th>
                      <th className="px-2 py-2 text-center">Fech.</th>
                      <th className="px-2 py-2 text-center">Rec.</th>
                      <th className="px-2 py-2 text-center">Focos</th>
                      <th className="px-2 py-2 text-center">Tub.</th>
                      <th className="px-2 py-2 text-right">PDF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyAgg.map((w) => (
                      <tr
                        key={`${w.year}-${w.week}`}
                        className="border-b border-slate-50 text-slate-700 font-medium hover:bg-slate-50/60"
                      >
                        <td className="px-2 py-2 font-black text-slate-900">
                          SE {w.week}
                        </td>
                        <td className="px-2 py-2 text-center text-slate-500">
                          {w.year}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <button
                            onClick={() =>
                              setAuditWeek({ week: w.week, year: w.year })
                            }
                            className="inline-flex items-center gap-1 text-blue-600 hover:underline font-bold text-xs"
                            title="Ver diárias consolidadas"
                          >
                            {w.records.length}
                            <ChevronDown className="h-3 w-3" />
                          </button>
                        </td>
                        <td className="px-2 py-2 text-center">{w.worked}</td>
                        <td className="px-2 py-2 text-center">{w.closed}</td>
                        <td className="px-2 py-2 text-center">{w.refused}</td>
                        <td className="px-2 py-2 text-center text-rose-600 font-bold">
                          {w.focos}
                        </td>
                        <td className="px-2 py-2 text-center">{w.tubitos}</td>
                        <td className="px-2 py-2 text-right">
                          <IconBtn
                            title="Gerar boletim"
                            onClick={() => handleWeekly(w.week, w.year)}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </IconBtn>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Auditoria — diárias que compõem a semana */}
      <Dialog open={!!auditWeek} onOpenChange={(v) => !v && setAuditWeek(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-black uppercase tracking-tight">
              Auditoria — SE {auditWeek?.week}/{auditWeek?.year}
            </DialogTitle>
          </DialogHeader>
          <div className="bg-blue-50 text-blue-800 text-xs font-bold px-3 py-2 rounded-lg">
            Consolidado de {auditRecords.length} relatório
            {auditRecords.length === 1 ? "" : "s"} diário
            {auditRecords.length === 1 ? "" : "s"} — soma oficial da semana.
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] font-black uppercase text-slate-400 border-b">
                  <th className="px-2 py-1.5 text-left">Data</th>
                  <th className="px-2 py-1.5 text-center">Trab.</th>
                  <th className="px-2 py-1.5 text-center">Fech.</th>
                  <th className="px-2 py-1.5 text-center">Rec.</th>
                  <th className="px-2 py-1.5 text-center">Focos</th>
                  <th className="px-2 py-1.5 text-center">Tub.</th>
                  <th className="px-2 py-1.5 text-center">Status</th>
                  <th className="px-2 py-1.5 text-right">PDF</th>
                </tr>
              </thead>
              <tbody>
                {auditRecords.map((d) => (
                  <tr key={d.id} className="border-b border-slate-50">
                    <td className="px-2 py-1.5">
                      {format(
                        new Date(`${d.work_date}T12:00:00`),
                        "dd/MM/yyyy",
                        { locale: ptBR }
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {d.properties_worked ?? 0}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {d.properties_closed ?? 0}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {d.properties_refused ?? 0}
                    </td>
                    <td className="px-2 py-1.5 text-center text-rose-600 font-bold">
                      {d.positive_foci ?? 0}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {d.tubitos_collected ?? 0}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <StatusBadge status={d.status} />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <IconBtn
                        title="PDF"
                        onClick={() => handleDailyDownload(d.id)}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </IconBtn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ─────────────────────── helpers ─────────────────────── */

function StatusBadge({ status }: { status: string }) {
  if (status === "completed")
    return (
      <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full text-[10px] font-black uppercase">
        <CheckCircle2 className="h-3 w-3" /> Encerrada
      </span>
    );
  if (status === "in_progress")
    return (
      <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full text-[10px] font-black uppercase">
        <Clock className="h-3 w-3" /> Em andamento
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full text-[10px] font-black uppercase">
      <AlertCircle className="h-3 w-3" /> Erro
    </span>
  );
}

function IconBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition"
    >
      {children}
    </button>
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
    <Link to={to as any} className="block group">
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

/* eslint-disable @typescript-eslint/no-unused-vars */
const _activityKeep = Activity; // mantém import para futura aba
