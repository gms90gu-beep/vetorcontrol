import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { safeGetUser } from "@/lib/offline/safe-auth";
import {
  listLocal,
  upsertOffline,
  updateOffline,
  enqueueRpcOffline,
  safeSupabaseRead,
} from "@/lib/offline/repos";
import { isOnline } from "@/lib/offline/safe-fetch";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { 
  CheckCircle2, 
  XCircle, 
  Target, 
  FileText, 
  Clock, 
  Power,
  ChevronRight,
  Printer,
  Calendar,
  Lock,
  Unlock,
  BarChart3,
  Droplets,
  Layers
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { translate } from "@/lib/translations";

type DailySnapshot = {
  workedCount: number;
  closedCount: number;
  refusedCount: number;
  visitedCount: number;
  focusCount: number;
  positiveProps: number;
  treatedPropsCount: number;
  depExisting: number;
  depInspected: number;
  depTreated: number;
  depEliminated: number;
  depByType: Record<"A1" | "A2" | "B" | "C" | "D1" | "D2" | "E", number>;
  larvicideAmount: number;
  larvicideUnit: string | null;
  tubitos: number;
  tubitosProps: number;
  samples: number;
  pendingLocal: number;
  blocksWorked: number;
  blocksCompleted: number;
  blocksInProgress: number;
};

const EMPTY_SNAPSHOT: DailySnapshot = {
  workedCount: 0, closedCount: 0, refusedCount: 0, visitedCount: 0,
  focusCount: 0, positiveProps: 0, treatedPropsCount: 0,
  depExisting: 0, depInspected: 0, depTreated: 0, depEliminated: 0,
  depByType: { A1: 0, A2: 0, B: 0, C: 0, D1: 0, D2: 0, E: 0 },
  larvicideAmount: 0, larvicideUnit: null,
  tubitos: 0, tubitosProps: 0, samples: 0,
  pendingLocal: 0, blocksWorked: 0, blocksCompleted: 0, blocksInProgress: 0,
};

async function buildDailySnapshot(userId: string, opDateStr: string): Promise<DailySnapshot> {
  const allVisits = await listLocal<any>(
    "visits",
    (v) => v.agent_id === userId && String(v.visit_date || "").slice(0, 10) === opDateStr,
  );
  const allDeposits = await listLocal<any>("visit_deposits");
  const depByVisit = new Map<string, any[]>();
  for (const d of allDeposits) {
    const arr = depByVisit.get(d.visit_id) || [];
    arr.push(d);
    depByVisit.set(d.visit_id, arr);
  }
  const snap: DailySnapshot = {
    ...EMPTY_SNAPSHOT,
    depByType: { A1: 0, A2: 0, B: 0, C: 0, D1: 0, D2: 0, E: 0 },
  };
  for (const v of allVisits) {
    snap.workedCount++;
    if (v.status === "closed") snap.closedCount++;
    if (v.status === "refused") snap.refusedCount++;
    if (v.status === "visited") snap.visitedCount++;
    if (v.has_focus) { snap.focusCount++; snap.positiveProps++; }
    const deps = depByVisit.get(v.id) || [];
    const q = deps.reduce((a: number, d: any) => a + (Number(d.quantity) || 0), 0);
    snap.depExisting += q;
    snap.depInspected += q;
    snap.depTreated += deps.filter((d: any) => d.is_treated)
      .reduce((a: number, d: any) => a + (Number(d.quantity) || 0), 0);
    snap.depEliminated += deps.filter((d: any) => d.is_eliminated)
      .reduce((a: number, d: any) => a + (Number(d.quantity) || 0), 0);
    for (const d of deps) {
      const code = String(d.type_code || "").toUpperCase().trim() as keyof DailySnapshot["depByType"];
      if (code in snap.depByType) snap.depByType[code] += Number(d.quantity) || 0;
    }
    snap.larvicideAmount += Number(v.treatment_amount) || 0;
    if (v.larvicide_unit) snap.larvicideUnit = v.larvicide_unit;
    const tub = Number(v.tubitos_coletados) || 0;
    snap.tubitos += tub;
    if (tub > 0) snap.tubitosProps++;
    if (v.sample_collected) snap.samples++;
    if ((Number(v.treatment_amount) || 0) > 0 || (Number(v.treated_deposits) || 0) > 0) {
      snap.treatedPropsCount++;
    }
  }
  const byProperty = new Map<string, any[]>();
  for (const v of allVisits) {
    const arr = byProperty.get(v.property_id) || [];
    arr.push(v);
    byProperty.set(v.property_id, arr);
  }
  for (const [, list] of byProperty) {
    const last = list.sort((a, b) => String(b.visit_date).localeCompare(String(a.visit_date)))[0];
    if (last && (last.status === "closed" || last.status === "refused")) snap.pendingLocal++;
  }
  const daySessions = await listLocal<any>(
    "field_work_sessions",
    (s) => s.user_id === userId && s.session_date === opDateStr,
  );
  snap.blocksWorked = new Set(daySessions.map((s) => s.block_number)).size;
  snap.blocksCompleted = new Set(
    daySessions.filter((s) => s.status === "completed").map((s) => s.block_number),
  ).size;
  snap.blocksInProgress = new Set(
    daySessions.filter((s) => s.status === "in_progress").map((s) => s.block_number),
  ).size;
  return snap;
}




interface DailyWorkCloserProps {
  stats?: {
    worked: number;
    closed: number;
    refused: number;
    eliminated: number;
    treated: number;
    focus: number;
    pending: number;
    treatedDeposits?: number;
    larvicideUsed?: number;
    progress?: number;
  };
  onGeneratePDF?: () => void;
  isLocked?: boolean;
  onReopen?: () => void;
  userRole?: string;
}

export function DailyWorkCloser({ 
  stats: externalStats, 
  onGeneratePDF, 
  isLocked, 
  onReopen,
  userRole 
}: DailyWorkCloserProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [agent, setAgent] = useState<any>(null);
  const [activeCycle, setActiveCycle] = useState<any>(null);
  const [activeWeek, setActiveWeek] = useState<any>(null);
  const [localStats, setLocalStats] = useState({
    worked: 0,
    closed: 0,
    refused: 0,
    eliminated: 0,
    treated: 0,
    focus: 0,
    pending: 0,
    treatedDeposits: 0,
    larvicideUsed: 0,
    progress: 0
  });
  const [pendingCount, setPendingCount] = useState(0);
  const [recoveredCount, setRecoveredCount] = useState(0);
  const [snapshot, setSnapshot] = useState<DailySnapshot>(EMPTY_SNAPSHOT);

  const [openBlock, setOpenBlock] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [jornadaDate, setJornadaDate] = useState<string | null>(null);

  const stats = externalStats || localStats;

  const fetchDailyContext = useCallback(async () => {
    if (externalStats) return;
    
    try {
      const { data: { user } } = await safeGetUser();
      if (!user) return;

      const { data: agentData } = await supabase
        .from("agents")
        .select("*")
        .eq("profile_id", user.id)
        .maybeSingle();
      
      if (agentData) setAgent(agentData);

      const { data: cycle } = await supabase
        .from("cycles")
        .select("*")
        .eq("status", "in_progress")
        .eq("year", new Date().getFullYear())
        .limit(1)
        .maybeSingle();
      
      if (cycle) {
        setActiveCycle(cycle);

        const { data: week } = await supabase
          .from("weeks")
          .select("*")
          .eq("cycle_id", cycle.id)
          .lte("start_date", new Date().toISOString().split('T')[0])
          .gte("end_date", new Date().toISOString().split('T')[0])
          .maybeSingle();
        
        if (week) setActiveWeek(week);

        // Considera a data da jornada ativa (se existir) como referência operacional
        const { data: activeSession } = await supabase
          .from("field_work_sessions")
          .select("id, session_date, block_number")
          .eq("user_id", user.id)
          .eq("status", "in_progress")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        setActiveSessionId(activeSession?.id ?? null);
        setOpenBlock(activeSession?.block_number ?? null);

        const opDateStr: string = activeSession?.session_date
          ? activeSession.session_date
          : new Date().toISOString().split('T')[0];
        setJornadaDate(opDateStr);
        const startOfDay = new Date(`${opDateStr}T00:00:00`);
        const endOfDay = new Date(`${opDateStr}T23:59:59.999`);

        console.log("[DailyWorkCloser] Data atual:", new Date().toISOString());
        console.log("[DailyWorkCloser] Data da jornada:", opDateStr);

        const { data: todayVisits } = await supabase
          .from("visits")
          .select("id, status, property_id, treatment_amount, treated_deposits, elimination_amount, has_focus")
          .eq("cycle_id", cycle.id)
          .eq("agent_id", user.id)
          .gte("visit_date", startOfDay.toISOString())
          .lte("visit_date", endOfDay.toISOString());
        
        // Snapshot completo a partir do Dexie (offline-first, sempre fresco)
        const snap = await buildDailySnapshot(user.id, opDateStr);
        setSnapshot(snap);

        setLocalStats({
          worked: snap.workedCount || (todayVisits?.length ?? 0),
          closed: snap.closedCount,
          refused: snap.refusedCount,
          eliminated: snap.depEliminated,
          treated: snap.treatedPropsCount,
          focus: snap.focusCount,
          pending: snap.pendingLocal,
          treatedDeposits: snap.depTreated,
          larvicideUsed: snap.larvicideAmount,
          progress: 0,
        });


        // Pendências em aberto + recuperadas hoje
        const { count: pCount } = await supabase
          .from("property_pendencies")
          .select("id", { count: 'exact', head: true })
          .eq("agent_id", user.id)
          .is("resolved_at", null);
        setPendingCount(pCount || 0);

        const { count: rCount } = await supabase
          .from("property_pendencies")
          .select("id", { count: 'exact', head: true })
          .eq("agent_id", user.id)
          .gte("resolved_at", startOfDay.toISOString())
          .lte("resolved_at", endOfDay.toISOString());
        setRecoveredCount(rCount || 0);
      }
    } catch (error) {
      console.error("Error fetching daily context:", error);
    }
  }, [externalStats]);

  useEffect(() => {
    fetchDailyContext();
  }, [fetchDailyContext]);

  const handleCloseDay = async () => {
    console.log("[ENCERRAR] botão clicado");
    console.log("[ENCERRAR] pendências", pendingCount);
    console.log("[ENCERRAR] quarteirão aberto", openBlock);
    console.log("[DIÁRIA] Encerramento iniciado");
    setIsLoading(true);
    try {
      const { data: { user } } = await safeGetUser();
      if (!user) {
        toast.error("Usuário não autenticado.");
        return;
      }

      let currentAgent = agent;
      if (!currentAgent) {
        currentAgent = await safeSupabaseRead<any>(
          () => supabase.from("agents").select("*").eq("profile_id", user.id).maybeSingle() as any,
          null,
          "agents",
        );
        if (!currentAgent) {
          const local = await listLocal<any>("agents", (a) => a.profile_id === user.id);
          currentAgent = local[0] || null;
        }
      }
      if (!currentAgent) throw new Error("Agent not found");

      // Sessão ativa — preferir Dexie (sempre fresca: foi criada via createOffline)
      const localSessions = await listLocal<any>(
        "field_work_sessions",
        (s) => s.user_id === user.id && s.status === "in_progress",
      );
      const activeSessionForClose = localSessions
        .sort((a, b) => String(b.created_at || b.updated_at || "").localeCompare(String(a.created_at || a.updated_at || "")))[0];

      const operationalWorkDate: string = activeSessionForClose?.session_date
        ? activeSessionForClose.session_date
        : new Date().toISOString().split('T')[0];

      console.log("[DailyWorkCloser:close] Data da jornada (work_date):", operationalWorkDate);

      // Lê visitas do Dexie (fonte autoritativa local — gravadas via saveVisitOffline)
      const allVisits = await listLocal<any>(
        "visits",
        (v) =>
          v.agent_id === user.id &&
          String(v.visit_date || "").slice(0, 10) === operationalWorkDate,
      );
      const allDeposits = await listLocal<any>("visit_deposits");
      const depByVisit = new Map<string, any[]>();
      for (const d of allDeposits) {
        const arr = depByVisit.get(d.visit_id) || [];
        arr.push(d);
        depByVisit.set(d.visit_id, arr);
      }

      let depExisting = 0, depInspected = 0, depTreated = 0, depEliminated = 0;
      let larvicideAmount = 0, larvicideUnit: string | null = null;
      let tubitos = 0, samples = 0;
      const depByType: Record<string, number> = { A1: 0, A2: 0, B: 0, C: 0, D1: 0, D2: 0, E: 0 };
      let workedCount = 0, closedCount = 0, refusedCount = 0, focusCount = 0;
      allVisits.forEach((v: any) => {
        workedCount++;
        if (v.status === "closed") closedCount++;
        if (v.status === "refused") refusedCount++;
        if (v.has_focus) focusCount++;
        const deps = depByVisit.get(v.id) || [];
        const q = deps.reduce((a: number, d: any) => a + (Number(d.quantity) || 0), 0);
        depExisting += q;
        depInspected += q;
        depTreated += deps.filter((d: any) => d.is_treated).reduce((a: number, d: any) => a + (Number(d.quantity) || 0), 0);
        depEliminated += deps.filter((d: any) => d.is_eliminated).reduce((a: number, d: any) => a + (Number(d.quantity) || 0), 0);
        deps.forEach((d: any) => {
          const code = String(d.type_code || "").toUpperCase().trim();
          if (code in depByType) depByType[code] += Number(d.quantity) || 0;
        });
        larvicideAmount += Number(v.treatment_amount) || 0;
        if (v.larvicide_unit) larvicideUnit = v.larvicide_unit;
        tubitos += Number(v.tubitos_coletados) || 0;
        samples += v.sample_collected ? 1 : 0;
      });
      if (depTreated === 0 && stats.treatedDeposits) depTreated = stats.treatedDeposits;
      if (depEliminated === 0 && stats.eliminated) depEliminated = stats.eliminated;
      if (larvicideAmount === 0 && stats.larvicideUsed) larvicideAmount = stats.larvicideUsed;

      const daySessions = await listLocal<any>(
        "field_work_sessions",
        (s) => s.user_id === user.id && s.session_date === operationalWorkDate,
      );
      const blocksWorked = new Set(daySessions.map((s) => s.block_number)).size;
      const blocksCompleted = new Set(
        daySessions.filter((s) => s.status === "completed").map((s) => s.block_number),
      ).size;

      const epi = (() => {
        const ref = new Date(`${operationalWorkDate}T12:00:00`);
        const d = new Date(Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
        return { week, year: d.getUTCFullYear() };
      })();

      // Pendências computadas localmente: imóveis fechados/recusados na data sem visita posterior "visited"
      const byProperty = new Map<string, any[]>();
      for (const v of allVisits) {
        const arr = byProperty.get(v.property_id) || [];
        arr.push(v);
        byProperty.set(v.property_id, arr);
      }
      let pendingLocal = 0;
      for (const [, list] of byProperty) {
        const last = list.sort((a, b) => String(b.visit_date).localeCompare(String(a.visit_date)))[0];
        if (last && (last.status === "closed" || last.status === "refused")) pendingLocal++;
      }

      const recordData: any = {
        agent_id: currentAgent.id,
        cycle_id: activeCycle?.id,
        week_id: activeWeek?.id,
        work_date: operationalWorkDate,
        status: 'completed',
        end_time: new Date().toISOString(),
        properties_worked: workedCount || stats.worked,
        properties_closed: closedCount || stats.closed,
        properties_refused: refusedCount || stats.refused,
        properties_recovered: recoveredCount,
        deposits_existing: depExisting,
        deposits_inspected: depInspected,
        deposits_treated: depTreated,
        deposits_eliminated: depEliminated,
        positive_foci: focusCount || stats.focus,
        larvicide_amount: larvicideAmount,
        larvicide_unit: larvicideUnit,
        tubitos_collected: tubitos,
        samples_collected: samples,
        blocks_worked: blocksWorked,
        blocks_completed: blocksCompleted,
        deposits_a1: depByType.A1,
        deposits_a2: depByType.A2,
        deposits_b: depByType.B,
        deposits_c: depByType.C,
        deposits_d1: depByType.D1,
        deposits_d2: depByType.D2,
        deposits_e: depByType.E,
        pending_visits: pendingLocal || pendingCount,
        epi_week: epi.week,
        epi_year: epi.year,
        updated_at: new Date().toISOString(),
      };

      console.log("[DIÁRIA] Snapshot criado", recordData);

      // 1) Upsert do daily_work_records — local + fila
      console.log("[ENCERRAR] salvando daily_work_records");
      await upsertOffline("daily_work_records", recordData, { onConflict: "agent_id,work_date" });

      // 2) Marca agente como work_completed — local + fila
      console.log("[ENCERRAR] atualizando agents");
      try { await updateOffline("agents", currentAgent.id, { work_status: 'work_completed' }); } catch (e) {
        console.warn("[ENCERRAR] falha ao atualizar agents", e);
      }

      // 3) Enfileira a RPC de consolidação de pendências (executa quando voltar a rede)
      console.log("[ENCERRAR] executando/enfileirando finalize_shift_pendencies");
      await enqueueRpcOffline("finalize_shift_pendencies", {
        p_agent_id: user.id,
        p_cycle_id: activeCycle?.id,
        p_date: operationalWorkDate,
      });

      // 4) Encerra todas as sessões em andamento (local + fila)
      console.log("[ENCERRAR] atualizando field_work_sessions");
      const sessionsToClose = await listLocal<any>(
        "field_work_sessions",
        (s) => s.user_id === user.id && s.status === "in_progress",
      );
      for (const s of sessionsToClose) {
        await updateOffline("field_work_sessions", s.id, {
          status: "completed",
          updated_at: new Date().toISOString(),
        });
      }

      console.log("[ENCERRAR] concluído");
      const msg = isOnline()
        ? "Trabalho do dia encerrado com sucesso!"
        : "Jornada encerrada localmente. Será sincronizada quando houver conexão.";
      toast.success(msg);
      setShowSummary(true);
      setIsOpen(false);
    } catch (error: any) {
      console.error("[ENCERRAR] erro:", error);
      toast.error(error?.message || "Erro ao encerrar trabalho. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  const defaultGeneratePDF = async () => {
    console.log("[PDF] Botão clicado");
    try {
      const { data: { user } } = await safeGetUser();
      if (!user) {
        toast.error("Você precisa estar autenticado para gerar o PDF.");
        return;
      }

      const opDateStr = jornadaDate || new Date().toISOString().split('T')[0];
      const startOfDay = new Date(`${opDateStr}T00:00:00`);
      const endOfDay = new Date(`${opDateStr}T23:59:59.999`);

      // EPI week (ISO week) calculation
      const refDate = new Date(`${opDateStr}T12:00:00`);
      const epiWeek = (() => {
        const d = new Date(Date.UTC(refDate.getFullYear(), refDate.getMonth(), refDate.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
      })();

      let visits: any[] | null = null;
      if (isOnline()) {
        let query = supabase
          .from("visits")
          .select(`
            id, status, visit_date, treatment_amount, treated_deposits,
            elimination_amount, has_focus, sample_collected, tubitos_coletados,
            larvicide_unit, treatment_applied, notes, property_id,
            property:properties(number, sequence, complement, type, status, block_number),
            deposits:visit_deposits(quantity, is_positive, is_treated, is_eliminated)
          `)
          .eq("agent_id", user.id)
          .gte("visit_date", startOfDay.toISOString())
          .lte("visit_date", endOfDay.toISOString())
          .order("visit_date", { ascending: true });
        if (activeCycle?.id) query = query.eq("cycle_id", activeCycle.id);
        try {
          const { data, error } = await query;
          if (error) throw error;
          visits = data || [];
        } catch (e) {
          console.warn("[PDF] Falha online, usando Dexie:", e);
          visits = null;
        }
      }
      if (!visits) {
        // Fallback offline — monta a partir do Dexie
        const localVisits = await listLocal<any>(
          "visits",
          (v) => v.agent_id === user.id && String(v.visit_date || "").slice(0, 10) === opDateStr,
        );
        const localDeposits = await listLocal<any>("visit_deposits");
        const localProps = await listLocal<any>("properties");
        const propMap = new Map(localProps.map((p: any) => [p.id, p]));
        const depMap = new Map<string, any[]>();
        for (const d of localDeposits) {
          const arr = depMap.get(d.visit_id) || [];
          arr.push(d);
          depMap.set(d.visit_id, arr);
        }
        visits = localVisits.map((v: any) => ({
          ...v,
          property: propMap.get(v.property_id) || null,
          deposits: depMap.get(v.id) || [],
        }));
        console.log("[OFFLINE] PDF — usando", visits.length, "visitas do Dexie");
      }

      if (!visits || visits.length === 0) {
        toast.warning("Nenhuma visita encontrada para esta diária.");
        return;
      }

      // Quarteirões concluídos hoje
      const completedSessions = await listLocal<any>(
        "field_work_sessions",
        (s) => s.user_id === user.id && s.status === "completed" && s.session_date === opDateStr,
      );
      const blocksCompleted = new Set(completedSessions.map((s: any) => s.block_number)).size;

      // LI aggregates
      let depExistentes = 0;
      let depInspecionados = 0;
      let depTratados = 0;
      let depEliminados = 0;
      let focos = 0;
      let larvicida = 0;
      let amostras = 0;
      let tubitosTotal = 0;
      let imoveisComTubito = 0;
      let larvicideUnit = "g";

      visits.forEach((v: any) => {
        const deps = v.deposits || [];
        const qtySum = deps.reduce((a: number, d: any) => a + (Number(d.quantity) || 0), 0);
        depExistentes += qtySum;
        depInspecionados += qtySum; // todos os depósitos registrados foram inspecionados
        depTratados += deps.filter((d: any) => d.is_treated).reduce((a: number, d: any) => a + (Number(d.quantity) || 0), 0);
        depEliminados += deps.filter((d: any) => d.is_eliminated).reduce((a: number, d: any) => a + (Number(d.quantity) || 0), 0);
        focos += v.has_focus ? 1 : 0;
        larvicida += Number(v.treatment_amount) || 0;
        if (v.larvicide_unit) larvicideUnit = v.larvicide_unit;
        amostras += v.sample_collected ? 1 : 0;
        const tub = Number(v.tubitos_coletados) || 0;
        tubitosTotal += tub;
        if (tub > 0) imoveisComTubito += 1;
      });

      // Fallback: usa stats (que já podem trazer depósitos tratados/eliminados a partir do estado)
      if (depTratados === 0 && stats.treatedDeposits) depTratados = stats.treatedDeposits;
      if (depEliminados === 0 && stats.eliminated) depEliminados = stats.eliminated;
      if (larvicida === 0 && stats.larvicideUsed) larvicida = stats.larvicideUsed;

      const doc = new jsPDF();
      const pageW = doc.internal.pageSize.getWidth();
      let y = 16;

      // === HEADER ===
      doc.setFontSize(16);
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.text("BOLETIM DIÁRIO DE PRODUÇÃO", pageW / 2, y, { align: "center" });
      y += 8;

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(60, 60, 60);
      const emissao = new Date().toLocaleString('pt-BR');
      const dataJornadaFmt = new Date(`${opDateStr}T12:00:00`).toLocaleDateString('pt-BR');

      const headerRows: [string, string][] = [
        ["Município", agent?.municipality || "—"],
        ["Agente", agent?.name || "—"],
        ["Data da Jornada", dataJornadaFmt],
        ["Ciclo", activeCycle?.number ? `Ciclo ${activeCycle.number}/${activeCycle.year}` : "—"],
        ["Semana Epidemiológica", String(epiWeek)],
        ["Emissão", emissao],
      ];
      autoTable(doc, {
        startY: y,
        body: headerRows,
        theme: "plain",
        styles: { fontSize: 9, cellPadding: 1 },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 50 }, 1: { cellWidth: "auto" } },
      });
      y = (doc as any).lastAutoTable.finalY + 4;

      // === RESUMO DA PRODUÇÃO ===
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text("RESUMO DA PRODUÇÃO", 14, y);
      y += 2;
      autoTable(doc, {
        startY: y + 1,
        head: [["Trabalhados", "Fechados", "Recusados", "Recuperados", "Pendências", "Qtr. Concluídos"]],
        body: [[
          String(stats.worked),
          String(stats.closed),
          String(stats.refused),
          String(recoveredCount),
          String(pendingCount),
          String(blocksCompleted),
        ]],
        theme: "grid",
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 9, halign: "center" },
        styles: { fontSize: 9, halign: "center" },
      });
      y = (doc as any).lastAutoTable.finalY + 4;

      // === DADOS LI ===
      doc.setFont("helvetica", "bold");
      doc.text("DADOS DO LI (LEVANTAMENTO DE ÍNDICE)", 14, y);
      y += 2;
      autoTable(doc, {
        startY: y + 1,
        head: [["Dep. Existentes", "Inspecionados", "Tratados", "Eliminados", "Focos", `Larvicida (${larvicideUnit})`, "Amostras"]],
        body: [[
          String(depExistentes),
          String(depInspecionados),
          String(depTratados),
          String(depEliminados),
          String(focos),
          String(larvicida),
          String(amostras),
        ]],
        theme: "grid",
        headStyles: { fillColor: [30, 64, 175], textColor: 255, fontSize: 8, halign: "center" },
        styles: { fontSize: 9, halign: "center" },
      });
      y = (doc as any).lastAutoTable.finalY + 4;

      // === TUBITOS ===
      doc.setFont("helvetica", "bold");
      doc.text("TUBITOS COLETADOS", 14, y);
      y += 2;
      autoTable(doc, {
        startY: y + 1,
        head: [["Total de Tubitos", "Imóveis com Coleta"]],
        body: [[String(tubitosTotal), String(imoveisComTubito)]],
        theme: "grid",
        headStyles: { fillColor: [5, 150, 105], textColor: 255, fontSize: 9, halign: "center" },
        styles: { fontSize: 9, halign: "center" },
      });
      y = (doc as any).lastAutoTable.finalY + 4;

      // === TABELA DE VISITAS ===
      doc.setFont("helvetica", "bold");
      doc.text("VISITAS REALIZADAS", 14, y);
      y += 2;

      const body = visits.map((v: any) => {
        const deps = v.deposits || [];
        const depQty = deps.reduce((a: number, d: any) => a + (Number(d.quantity) || 0), 0);
        const trabalhado = v.status === 'visited' || v.status === 'closed' || v.status === 'refused' ? "Sim" : "Não";
        const tratado = (v.treatment_applied || (Number(v.treatment_amount) || 0) > 0 || (Number(v.treated_deposits) || 0) > 0) ? "Sim" : "Não";
        return [
          v.property?.number || "—",
          v.property?.sequence ?? "—",
          v.property?.complement || "—",
          translate(v.status) || v.status,
          trabalhado,
          tratado,
          String(depQty || v.treated_deposits || 0),
          v.has_focus ? "Sim" : "Não",
          v.treatment_amount ? `${v.treatment_amount}${v.larvicide_unit || 'g'}` : "—",
          (Number(v.tubitos_coletados) || 0) > 0 ? "Sim" : "Não",
        ];
      });

      autoTable(doc, {
        startY: y + 1,
        head: [["Nº", "Seq.", "Compl.", "Situação", "Trab.", "Trat.", "Dep.", "Focos", "Larvicida", "Tubito"]],
        body,
        theme: "grid",
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8, halign: "center" },
        styles: { fontSize: 7, halign: "center" },
        columnStyles: { 2: { halign: "left" }, 3: { halign: "left" } },
      });

      const filename = `diaria-${opDateStr}.pdf`;
      doc.save(filename);
      console.log("[PDF] PDF gerado com sucesso:", filename);
      toast.success("PDF da diária gerado com sucesso!");
    } catch (err: any) {
      console.error("[PDF] Erro inesperado:", err);
      toast.error(`Erro ao gerar PDF: ${err?.message || "erro desconhecido"}`);
    }
  };

  const handleGeneratePDF = onGeneratePDF || defaultGeneratePDF;


  const canReopen = userRole === 'supervisor' || userRole === 'admin';

  if (isLocked) {
    return (
      <Card className="border-none shadow-xl bg-slate-100 rounded-[2rem] overflow-hidden border-2 border-dashed border-slate-300">
        <CardContent className="p-8 flex flex-col items-center justify-center text-center space-y-4">
          <div className="h-16 w-16 bg-slate-200 rounded-full flex items-center justify-center">
            <Lock className="h-8 w-8 text-slate-400" />
          </div>
          <div>
            <h3 className="text-xl font-black text-slate-800 tracking-tight">🔒 Boletim Encerrado</h3>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
              O expediente deste dia foi finalizado.
            </p>
          </div>
          <div className="flex gap-3 w-full pt-2">
            <Button 
              onClick={handleGeneratePDF}
              className="flex-1 h-12 rounded-xl bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 font-black uppercase tracking-widest text-[9px] gap-2 shadow-sm"
            >
              <Printer className="h-4 w-4 text-blue-500" /> PDF Diário
            </Button>
            {canReopen && (
              <Button 
                onClick={onReopen}
                variant="outline"
                className="flex-1 h-12 rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50 font-black uppercase tracking-widest text-[9px] gap-2"
              >
                <Unlock className="h-4 w-4" /> Reabrir
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (showSummary) {
    return (
      <Dialog open={showSummary} onOpenChange={setShowSummary}>
        <DialogContent className="max-w-md rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl bg-slate-50">
          <div className="bg-slate-900 p-8 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <CheckCircle2 className="h-24 w-24" />
            </div>
            <Badge className="mb-4 bg-emerald-500/20 text-emerald-400 border-none font-black text-[10px] uppercase tracking-widest">
              Trabalho Encerrado
            </Badge>
            <h2 className="text-3xl font-black tracking-tighter leading-none mb-1">Resumo Diário</h2>
            <p className="text-slate-400 font-bold text-xs uppercase tracking-widest flex items-center gap-2">
              <Calendar className="h-3 w-3" /> {new Date().toLocaleDateString('pt-BR')}
            </p>
          </div>
          
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <SummaryItem icon={Target} label={translate("worked")} value={stats.worked} color="text-slate-800" />
              <SummaryItem icon={XCircle} label={translate("CLOSED")} value={stats.closed} color="text-blue-600" />
              <SummaryItem icon={XCircle} label={translate("REFUSED")} value={stats.refused} color="text-red-500" />
              <SummaryItem icon={BarChart3} label="Eliminados" value={stats.eliminated} color="text-emerald-500" />
              <SummaryItem icon={Layers} label={translate("TREATED")} value={stats.treatedDeposits || stats.treated} color="text-indigo-600" />
              <SummaryItem icon={CheckCircle2} label="Focos Pos." value={stats.focus} color="text-orange-500" />
              <div className="col-span-2 md:col-span-1">
                 <SummaryItem icon={Droplets} label="Larvicida" value={`${stats.larvicideUsed || 0}g`} color="text-cyan-600" />
              </div>
              <div className="col-span-2">
                 <SummaryItem icon={BarChart3} label="Cobertura" value={`${stats.progress || 0}%`} color="text-blue-700" />
              </div>
            </div>

            <div className="pt-4 space-y-3">
              <Button 
                onClick={() => {
                  handleGeneratePDF();
                  setShowSummary(false);
                }}
                className="w-full h-14 rounded-2xl bg-blue-600 text-white hover:bg-blue-700 font-black uppercase tracking-widest text-xs gap-3 shadow-lg shadow-blue-200"
              >
                <Printer className="h-5 w-5" /> Gerar PDF Diário
              </Button>
              <Button 
                variant="ghost"
                onClick={() => setShowSummary(false)}
                className="w-full h-12 rounded-2xl text-slate-500 font-bold uppercase tracking-widest text-[10px]"
              >
                Fechar Resumo
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          className="w-full h-16 md:h-20 lg:h-24 rounded-[1.5rem] md:rounded-[2rem] bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white shadow-2xl group relative overflow-hidden border-none transition-all duration-300 active:scale-95"
        >
          <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="flex items-center justify-between px-8 w-full relative z-10">
            <div className="flex items-center gap-5">
              <div className="bg-white/20 p-4 rounded-[1.5rem] shadow-inner backdrop-blur-sm">
                <Power className="h-8 w-8 text-white" />
              </div>
              <div className="text-left">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-200 mb-0.5">
                  Operacional · {jornadaDate ? new Date(`${jornadaDate}T12:00:00`).toLocaleDateString('pt-BR') : 'Hoje'}
                </p>
                <h3 className="text-xl font-black tracking-tight uppercase">Encerrar Jornada do Dia</h3>
              </div>
            </div>
            <ChevronRight className="h-8 w-8 text-white/50 group-hover:translate-x-2 group-hover:text-white transition-all" />
          </div>
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-md rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl">
        <div className="bg-gradient-to-br from-red-600 to-red-700 p-8 text-white">
          <div className="bg-white/20 p-4 rounded-2xl w-fit mb-4">
            <Power className="h-10 w-10" />
          </div>
          <DialogTitle className="text-3xl font-black tracking-tighter leading-tight mb-2">
            Finalizar o expediente?
          </DialogTitle>
          <DialogDescription className="text-white/80 font-bold text-xs uppercase tracking-widest leading-relaxed">
            Apenas os dados desta jornada serão consolidados. Os indicadores do ciclo são atualizados automaticamente.
          </DialogDescription>
          <div className="mt-4 inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-full px-4 py-2">
            <Calendar className="h-3.5 w-3.5" />
            <span className="text-[11px] font-black uppercase tracking-widest">
              Jornada de {jornadaDate ? new Date(`${jornadaDate}T12:00:00`).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR')}
            </span>
          </div>
        </div>

        <div className="p-8 space-y-6">
          {(pendingCount > 0 || openBlock) && (
            <div className="space-y-2">
              {pendingCount > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-800">
                  <p className="text-xs font-black uppercase tracking-widest mb-1">⚠️ Pendências em aberto</p>
                  <p className="text-[11px] font-bold">Existem {pendingCount} imóveis pendentes de recuperação. Deseja encerrar mesmo assim?</p>
                </div>
              )}
              {openBlock && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-800">
                  <p className="text-xs font-black uppercase tracking-widest mb-1">⚠️ Quarteirão em andamento</p>
                  <p className="text-[11px] font-bold">O quarteirão {openBlock} ainda está aberto. Deseja encerrar mesmo assim?</p>
                </div>
              )}
            </div>
          )}

          <div className="space-y-4">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Resumo desta Jornada (apenas o dia)</h4>
            <div className="grid grid-cols-2 gap-3">
              <SummaryItemSmall label="Imóveis" value={stats.worked} icon={Target} />
              <SummaryItemSmall label={translate("CLOSED")} value={stats.closed} icon={XCircle} />
              <SummaryItemSmall label={translate("REFUSED")} value={stats.refused} icon={XCircle} />
              <SummaryItemSmall label="Focos (+)" value={stats.focus} icon={CheckCircle2} />
              <SummaryItemSmall label="Pend. Geradas" value={pendingCount} icon={Clock} />
              <SummaryItemSmall label="Recuperadas" value={recoveredCount} icon={CheckCircle2} />
              <SummaryItemSmall label={translate("TREATED")} value={stats.treatedDeposits || stats.treated} icon={Layers} />
              <SummaryItemSmall label="Larvicida" value={`${stats.larvicideUsed || 0}g`} icon={Droplets} />
            </div>
          </div>

          <div className="pt-4 flex flex-col gap-3">
            <Button 
              onClick={handleCloseDay}
              disabled={isLoading}
              className="w-full h-16 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-widest text-sm shadow-xl shadow-red-200 flex items-center justify-center gap-3"
            >
              {isLoading ? (
                <>
                  <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Sincronizando...
                </>
              ) : (
                "Confirmar Encerramento"
              )}
            </Button>
            <Button 
              variant="ghost" 
              onClick={() => setIsOpen(false)}
              className="w-full h-12 rounded-2xl text-slate-500 font-bold uppercase tracking-widest text-[10px]"
            >
              Cancelar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SummaryItem({ icon: Icon, label, value, color }: any) {
  return (
    <Card className="border-none shadow-sm bg-white rounded-2xl p-4 flex flex-col items-center text-center gap-2">
      <div className={cn("p-2 rounded-xl bg-slate-50", color.replace('text-', 'bg-').replace('600', '100').replace('500', '100').replace('700', '100'))}>
        <Icon className={cn("h-4 w-4", color)} />
      </div>
      <div>
        <p className="text-xl font-black tracking-tighter text-slate-800">{value}</p>
        <p className="text-[7px] font-black uppercase tracking-widest text-slate-400 leading-tight">{label}</p>
      </div>
    </Card>
  );
}

function SummaryItemSmall({ label, value, icon: Icon }: any) {
  return (
    <div className="bg-slate-50 p-4 rounded-2xl flex items-center justify-between border border-slate-100">
      <div className="flex items-center gap-2">
        <Icon className="h-3 w-3 text-slate-400" />
        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{label}</span>
      </div>
      <span className="text-sm font-black text-slate-800">{value}</span>
    </div>
  );
}