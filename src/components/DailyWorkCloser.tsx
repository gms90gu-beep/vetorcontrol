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
import { getOperationalDate, epiWeekFromDate } from "@/lib/operational-date";
import { getOperationalBlockStatus, logBlockStatusShared, assertOperationalStatusMatches } from "@/lib/operational-block-status";
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
import {
  runShiftValidation,
  type ShiftValidationReport,
} from "@/lib/shift-validation";
import { flushMutations, retryFailedMutations, listFailedMutations, discardFailedMutation, type FailedMutationInfo } from "@/lib/offline/sync";
import { AlertTriangle, RefreshCw, ShieldAlert } from "lucide-react";
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

// ─── FAILED_MUTATIONS: classificação e helpers ───────────────────────
type MutationCategory = "recoverable" | "conflict" | "critical";
const CRITICAL_TABLES = new Set([
  "daily_work_records",
  "block_progress",
  "field_work_sessions",
]);
function classifyMutation(fm: FailedMutationInfo): MutationCategory {
  const tableKey = (fm.table || "").replace(/^rpc:/, "").toLowerCase();
  if (CRITICAL_TABLES.has(tableKey)) return "critical";
  if (tableKey.includes("daily_work") || tableKey.includes("close_shift") || tableKey.includes("shift_close")) return "critical";
  const err = String(fm.lastError || "").toLowerCase();
  if (err.includes("duplicate key") || err.includes("conflict") || err.includes("23505")) return "conflict";
  if (err.includes("rls") || err.includes("policy") || err.includes("permission") || err.includes("42501")) return "critical";
  return "recoverable";
}
const CATEGORY_META: Record<MutationCategory, { label: string; dot: string; badge: string }> = {
  recoverable: { label: "Recuperável", dot: "🟢", badge: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  conflict:    { label: "Conflito",    dot: "🟡", badge: "bg-amber-100 text-amber-800 border-amber-300" },
  critical:    { label: "Crítica",     dot: "🔴", badge: "bg-red-100 text-red-800 border-red-300" },
};

type DepKey = "A1" | "A2" | "B" | "C" | "D1" | "D2" | "E";

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
  depByType: Record<DepKey, number>;
  fociByType: Record<DepKey, number>;
  larvicideAmount: number;
  larvicideUnit: string | null;
  tubitos: number;
  tubitosUsed: number;
  tubitosProps: number;
  larvaeCollected: number;
  cargasCollected: number;
  samples: number;
  pendingLocal: number;
  blocksWorked: number;
  blocksCompleted: number;
  blocksInProgress: number;
  strategicPointsWorked: number;
};

const EMPTY_DEP_MAP: Record<DepKey, number> = { A1: 0, A2: 0, B: 0, C: 0, D1: 0, D2: 0, E: 0 };

const EMPTY_SNAPSHOT: DailySnapshot = {
  workedCount: 0, closedCount: 0, refusedCount: 0, visitedCount: 0,
  focusCount: 0, positiveProps: 0, treatedPropsCount: 0,
  depExisting: 0, depInspected: 0, depTreated: 0, depEliminated: 0,
  depByType: { ...EMPTY_DEP_MAP },
  fociByType: { ...EMPTY_DEP_MAP },
  larvicideAmount: 0, larvicideUnit: null,
  tubitos: 0, tubitosUsed: 0, tubitosProps: 0,
  larvaeCollected: 0, cargasCollected: 0,
  samples: 0,
  pendingLocal: 0, blocksWorked: 0, blocksCompleted: 0, blocksInProgress: 0,
  strategicPointsWorked: 0,
};

export interface SessionScope {
  sessionId?: string | null;
  blockNumber?: string | null;
  blockId?: string | null;
  startedAt?: string | null; // ISO — só considera visitas criadas a partir daqui
}

async function buildDailySnapshot(
  userId: string,
  opDateStr: string,
  scope?: SessionScope,
): Promise<DailySnapshot> {
  // Mapeia property → block para filtrar por quarteirão da jornada ativa
  const propsAll = await listLocal<any>("properties");
  const propBlockNumber = new Map<string, string>();
  const propBlockId = new Map<string, string>();
  for (const p of propsAll) {
    if (p?.id) {
      if (p.block_number != null) propBlockNumber.set(p.id, String(p.block_number));
      if (p.block_id != null) propBlockId.set(p.id, String(p.block_id));
    }
  }

  const startedAtMs = scope?.startedAt ? new Date(scope.startedAt).getTime() : 0;
  const scopeBlockNumber = scope?.blockNumber != null ? String(scope.blockNumber) : null;
  const scopeBlockId = scope?.blockId != null ? String(scope.blockId) : null;

  const allVisits = await listLocal<any>(
    "visits",
    (v) => {
      if (v.agent_id !== userId) return false;
      if (String(v.visit_date || "").slice(0, 10) !== opDateStr) return false;
      // Filtro por sessão explícita (quando disponível)
      if (scope?.sessionId && v.field_work_session_id && v.field_work_session_id !== scope.sessionId) return false;
      // Filtro por quarteirão da jornada ativa
      if (scopeBlockId) {
        const pb = propBlockId.get(v.property_id);
        if (pb && pb !== scopeBlockId) return false;
      } else if (scopeBlockNumber) {
        const pn = propBlockNumber.get(v.property_id);
        if (pn && pn !== scopeBlockNumber) return false;
      }
      // Filtro por janela temporal (visitas criadas após início da jornada)
      if (startedAtMs > 0) {
        const created = new Date(v.created_at || v.updated_at || 0).getTime();
        if (created && created + 1000 < startedAtMs) return false;
      }
      return true;
    },
  );
  console.log("[SESSION_VISITS_FOUND]", {
    session_id: scope?.sessionId ?? null,
    block: scopeBlockNumber,
    started_at: scope?.startedAt ?? null,
    count: allVisits.length,
    visit_ids: allVisits.map((v: any) => v.id),
    source: "dexie",
  });
  const allDeposits = await listLocal<any>("visit_deposits");
  const depByVisit = new Map<string, any[]>();
  for (const d of allDeposits) {
    const arr = depByVisit.get(d.visit_id) || [];
    arr.push(d);
    depByVisit.set(d.visit_id, arr);
  }
  const snap: DailySnapshot = {
    ...EMPTY_SNAPSHOT,
    depByType: { ...EMPTY_DEP_MAP },
    fociByType: { ...EMPTY_DEP_MAP },
  };

  // Mapeia property_id → type para detectar Pontos Estratégicos
  const propType = new Map<string, string>();
  for (const p of propsAll) propType.set(p.id, String(p.type || ""));
  const strategicPropIds = new Set<string>();

  for (const v of allVisits) {
    snap.workedCount++;
    if (v.status === "closed") snap.closedCount++;
    if (v.status === "refused") snap.refusedCount++;
    if (v.status === "visited") snap.visitedCount++;
    if (v.has_focus) { snap.focusCount++; snap.positiveProps++; }
    if (propType.get(v.property_id) === "strategic_point") {
      strategicPropIds.add(v.property_id);
    }
    const deps = depByVisit.get(v.id) || [];
    const q = deps.reduce((a: number, d: any) => a + (Number(d.quantity) || 0), 0);
    snap.depExisting += q;
    snap.depInspected += q;
    snap.depTreated += deps.filter((d: any) => d.is_treated)
      .reduce((a: number, d: any) => a + (Number(d.quantity) || 0), 0);
    snap.depEliminated += deps.filter((d: any) => d.is_eliminated)
      .reduce((a: number, d: any) => a + (Number(d.quantity) || 0), 0);
    for (const d of deps) {
      const code = String(d.type_code || "").toUpperCase().trim() as DepKey;
      const qty = Number(d.quantity) || 0;
      if (code in snap.depByType) {
        snap.depByType[code] += qty;
        if (d.is_positive) snap.fociByType[code] += qty;
      }
    }
    const treatAmt = Number(v.treatment_amount) || 0;
    snap.larvicideAmount += treatAmt;
    if (v.larvicide_unit) snap.larvicideUnit = v.larvicide_unit;
    // Tubitos utilizados: tratamento aplicado quando a unidade é tubitos
    if (String(v.larvicide_unit || "").toLowerCase().includes("tubito")) {
      snap.tubitosUsed += treatAmt;
    } else if (String(v.larvicide_unit || "").toLowerCase().includes("carga")) {
      snap.cargasCollected += treatAmt;
    } else if (String(v.larvicide_unit || "").toLowerCase().includes("larva")) {
      snap.larvaeCollected += treatAmt;
    }
    const tub = Number(v.tubitos_coletados) || 0;
    snap.tubitos += tub;
    if (tub > 0) snap.tubitosProps++;
    if (v.sample_collected) snap.samples++;
    if ((Number(v.treatment_amount) || 0) > 0 || (Number(v.treated_deposits) || 0) > 0) {
      snap.treatedPropsCount++;
    }
  }
  snap.strategicPointsWorked = strategicPropIds.size;
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
  // Auditoria: reconciliar snapshot com a biblioteca central por sessão.
  try {
    const bySession = new Map<string, any[]>();
    for (const v of allVisits) {
      const sid = String(v.field_work_session_id || "_none_");
      const arr = bySession.get(sid) || [];
      arr.push(v);
      bySession.set(sid, arr);
    }
    const daySess = await listLocal<any>(
      "field_work_sessions",
      (s) => s.user_id === userId && s.session_date === opDateStr,
    );
    for (const s of daySess) {
      const vs = bySession.get(s.id) || [];
      const propIds = Array.from(new Set(vs.map((v: any) => v.property_id).filter(Boolean)));
      const canonical = getOperationalBlockStatus({
        propertyIds: propIds,
        visits: vs,
        fallbackTotal: s.property_count || 0,
      });
      logBlockStatusShared(
        {
          module: "DailyWorkCloser",
          productionDate: opDateStr,
          blockId: s.block_id,
          blockNumber: s.block_number,
          sessionId: s.id,
        },
        canonical,
      );
    }
    assertOperationalStatusMatches("DailyWorkCloser/snapshot", {
      totalProperties: snap.workedCount,
      visitedProperties: snap.visitedCount,
      closedProperties: snap.closedCount,
      refusedProperties: snap.refusedCount,
      recoveredProperties: 0,
      pendingProperties: snap.pendingLocal,
      completionPercentage: 0,
      status: "EM_ANDAMENTO",
    }, {
      totalProperties: snap.visitedCount + snap.closedCount + snap.refusedCount,
      visitedProperties: snap.visitedCount,
      closedProperties: snap.closedCount,
      pendingProperties: snap.pendingLocal,
    });
  } catch (e) {
    console.warn("[BLOCK_STATUS_AUDIT_ERR]", e);
  }
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
  const [sessionRetro, setSessionRetro] = useState<{ retro: boolean; reason: string | null; createdAt: string | null }>({ retro: false, reason: null, createdAt: null });

  const [validation, setValidation] = useState<ShiftValidationReport | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [validating, setValidating] = useState(false);
  const [failedMutations, setFailedMutations] = useState<FailedMutationInfo[]>([]);
  const [showFailedDetails, setShowFailedDetails] = useState(false);

  const refreshFailedMutations = useCallback(async () => {
    try {
      setFailedMutations(await listFailedMutations());
    } catch (e) {
      console.warn("[FAILED_MUTATIONS_LOAD_ERR]", e);
    }
  }, []);

  useEffect(() => {
    if (showValidation) void refreshFailedMutations();
  }, [showValidation, validation, refreshFailedMutations]);

  const handleDiscardFailed = async (id: number) => {
    await discardFailedMutation(id);
    await refreshFailedMutations();
  };

  const stats = externalStats || localStats;

  // ─── DAY_CLOSE_MODAL_SOURCE_OF_TRUTH ──────────────────────────────
  // O modal renderiza EXCLUSIVAMENTE os números vindos de `externalStats`
  // (Tela Operacional → operational-metrics). O `snapshot` só é usado
  // como fonte auxiliar de detalhamento (depósitos por tipo, tubitos,
  // amostras) enquanto o refactor global não atinge esses campos.
  const displayWorked   = externalStats ? externalStats.worked   : (snapshot.workedCount  || localStats.worked);
  const displayClosed   = externalStats ? externalStats.closed   : (snapshot.closedCount  || localStats.closed);
  const displayRefused  = externalStats ? externalStats.refused  : (snapshot.refusedCount || localStats.refused);
  const displayFocus    = externalStats ? externalStats.focus    : (snapshot.focusCount   || localStats.focus);
  const displayPending  = externalStats ? externalStats.pending  : (snapshot.pendingLocal || localStats.pending);
  const displayTreatedDep    = externalStats ? (externalStats.treatedDeposits ?? 0) : (snapshot.depTreated    || localStats.treatedDeposits);
  const displayEliminated    = externalStats ? externalStats.eliminated              : (snapshot.depEliminated || localStats.eliminated);
  const displayLarvicideUsed = externalStats ? (externalStats.larvicideUsed ?? 0)    : (snapshot.larvicideAmount || localStats.larvicideUsed);
  const displayTreated       = externalStats ? externalStats.treated                 : (snapshot.treatedPropsCount || localStats.treated);
  const operationalDate = getOperationalDate();

  // Loga divergência entre Tela Operacional (externalStats) e o snapshot
  // interno assim que o modal abre.
  useEffect(() => {
    if (!isOpen || !externalStats) return;
    const compare = (field: string, ui: any, modal: any) => {
      if (Number(ui) !== Number(modal)) {
        console.warn("[DAY_CLOSE_MODAL_DIVERGENCE]", {
          field,
          valor_tela: ui,
          valor_modal: modal,
          origem_tela: "operational-metrics (props.stats)",
          origem_modal: "buildDailySnapshot (Dexie)",
        });
      }
    };
    compare("worked",   externalStats.worked,   snapshot.workedCount);
    compare("closed",   externalStats.closed,   snapshot.closedCount);
    compare("refused",  externalStats.refused,  snapshot.refusedCount);
    compare("focus",    externalStats.focus,    snapshot.focusCount);
    compare("pending",  externalStats.pending,  snapshot.pendingLocal);
  }, [isOpen, externalStats, snapshot.workedCount, snapshot.closedCount, snapshot.refusedCount, snapshot.focusCount, snapshot.pendingLocal]);

  const handlePreClose = async () => {
    console.log("[SHIFT_CLOSE_INTELLIGENT_START]");
    setValidating(true);
    try {
      const { data: { user } } = await safeGetUser();
      if (!user) {
        toast.error("Usuário não autenticado.");
        return;
      }
      const localSessions = await listLocal<any>(
        "field_work_sessions",
        (s) => s.user_id === user.id && s.status === "in_progress",
      );
      const active = localSessions
        .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0];
      // Data da Produção ativa (hoje, America/Sao_Paulo). Nunca usar session_date:
      // a jornada do quarteirão pode ter começado em dias anteriores.
      const workDate: string = getOperationalDate();
      if (active?.session_date && active.session_date !== workDate) {
        console.log("[DAY_CLOSE_CROSS_DAY_SESSION]", {
          module: "DailyWorkCloser.handlePreClose",
          session_id: active?.id ?? null,
          session_started_at: active?.session_date ?? null,
          operational_date: workDate,
          note: "quarteirão iniciado em data anterior — produção contabilizada em operational_date",
        });
      }

      const report = await runShiftValidation({
        userId: user.id,
        sessionId: active?.id ?? null,
        blockId: (active as any)?.block_id ?? null,
        blockNumber: active?.block_number ?? null,
        workDate,
      });
      setValidation(report);

      const critical = report.issues.filter((i) => i.severity === "error").length;
      const warnings = report.issues.filter((i) => i.severity === "warning").length;
      console.log("[DAY_CLOSE_VALIDATION]", {
        critical,
        warnings,
        info: report.counters,
        codes: report.issues.map((i) => i.code),
      });

      if (critical === 0 && warnings === 0) {
        console.log("[DAY_CLOSE_ALLOWED]", { reason: "no_issues" });
        await handleCloseDay();
      } else if (critical > 0) {
        console.warn("[DAY_CLOSE_BLOCKED]", {
          codes: report.issues.filter((i) => i.severity === "error").map((i) => i.code),
        });
        setShowValidation(true);
      } else {
        console.log("[DAY_CLOSE_WARNING]", {
          codes: report.issues.map((i) => i.code),
        });
        setShowValidation(true);
      }
    } catch (e) {
      console.error("[SHIFT_CLOSE_VALIDATION_ERROR]", e);
      toast.error("Falha ao validar jornada.");
    } finally {
      setValidating(false);
    }
  };

  const handleSyncNow = async () => {
    setValidating(true);
    try {
      await retryFailedMutations();
      const { ok, failed } = await flushMutations();
      toast.success(`Sincronização: ${ok} ok, ${failed} erro(s)`);
      await handlePreClose();
    } finally {
      setValidating(false);
    }
  };

  const handleForceClose = async () => {
    console.log("[DAY_CLOSE_ALLOWED]", { reason: "warnings_acknowledged", role: userRole });
    setShowValidation(false);
    await handleCloseDay();
  };



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

        // Considera a data da jornada ativa (se existir) como referência operacional
        const { data: activeSession } = await supabase
          .from("field_work_sessions")
          .select("id, session_date, block_number, is_retroactive, retroactive_reason, created_at")
          .eq("user_id", user.id)
          .eq("status", "in_progress")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        setActiveSessionId(activeSession?.id ?? null);
        setOpenBlock(activeSession?.block_number ?? null);
        setSessionRetro({
          retro: !!(activeSession as any)?.is_retroactive,
          reason: (activeSession as any)?.retroactive_reason ?? null,
          createdAt: (activeSession as any)?.created_at ?? null,
        });

        if (!activeSession?.session_date) {
          console.warn("[PRODUCTION_DATE_ERROR]", {
            module: "DailyWorkCloser.fetchDailyContext",
            reason: "sem session_date; não é possível resolver semana/data operacional",
          });
          return;
        }
        const opDateStr: string = activeSession.session_date;

        const { data: week } = await supabase
          .from("weeks")
          .select("*")
          .eq("cycle_id", cycle.id)
          .lte("start_date", opDateStr)
          .gte("end_date", opDateStr)
          .maybeSingle();

        if (week) setActiveWeek(week);
        setJornadaDate(opDateStr);
        const startOfDay = new Date(`${opDateStr}T00:00:00`);
        const endOfDay = new Date(`${opDateStr}T23:59:59.999`);

        console.log("[DailyWorkCloser] Data atual:", new Date().toISOString());
        console.log("[DailyWorkCloser] Data da jornada:", opDateStr);

        const { data: todayVisits } = await supabase
          .from("visits")
          .select("id, status, property_id, treatment_amount, treated_deposits, elimination_amount, has_focus, larvicide_unit, tubitos_coletados, sample_collected, visit_date, field_work_session_id")
          .eq("cycle_id", cycle.id)
          .eq("agent_id", user.id)
          .gte("visit_date", startOfDay.toISOString())
          .lte("visit_date", endOfDay.toISOString());
        
        // === INSTRUMENTAÇÃO: comparar fontes do resumo ===
        console.log("[SESSION_SUMMARY_INPUT]", {
          session_id: activeSession?.id ?? null,
          op_date: opDateStr,
          block_id: (activeSession as any)?.block_id ?? null,
          block_number: (activeSession as any)?.block_number ?? null,
          supabase_visits_count: todayVisits?.length ?? 0,
          supabase_visits_ids: (todayVisits || []).map((v: any) => v.id),
        });

        // Snapshot completo a partir do Dexie (offline-first, sempre fresco).
        // CONSOLIDAÇÃO: sem escopo — soma TODAS as jornadas do agente na
        // mesma Data da Produção (múltiplos quarteirões no mesmo dia).
        const daySessionsList = await listLocal<any>(
          "field_work_sessions",
          (s) => s.user_id === user.id && s.session_date === opDateStr,
        );
        console.log("[DAY_CLOSE_SESSIONS]", {
          op_date: opDateStr,
          count: daySessionsList.length,
          sessions: daySessionsList.map((s: any) => ({
            id: s.id, block_number: s.block_number, block_id: s.block_id, status: s.status,
          })),
        });
        let snap = await buildDailySnapshot(user.id, opDateStr);

        // Fallback Supabase: se o Dexie está vazio mas o servidor tem visitas
        // da jornada, reconstrói o snapshot (inclui detalhamento por tipo)
        // direto do Supabase para que o resumo nunca fique zerado.
        if (snap.workedCount === 0 && (todayVisits?.length ?? 0) > 0) {
          const visitIds = (todayVisits || []).map((v: any) => v.id);
          const { data: remoteDeposits } = await supabase
            .from("visit_deposits")
            .select("visit_id, type_code, quantity, is_positive, is_treated, is_eliminated")
            .in("visit_id", visitIds);
          const depByVisit = new Map<string, any[]>();
          for (const d of remoteDeposits || []) {
            const arr = depByVisit.get(d.visit_id) || [];
            arr.push(d);
            depByVisit.set(d.visit_id, arr);
          }
          const rebuilt: DailySnapshot = {
            ...EMPTY_SNAPSHOT,
            depByType: { ...EMPTY_DEP_MAP },
            fociByType: { ...EMPTY_DEP_MAP },
          };
          const byProp = new Map<string, any[]>();
          for (const v of todayVisits || []) {
            rebuilt.workedCount++;
            if (v.status === "closed") rebuilt.closedCount++;
            if (v.status === "refused") rebuilt.refusedCount++;
            if (v.status === "visited") rebuilt.visitedCount++;
            if (v.has_focus) { rebuilt.focusCount++; rebuilt.positiveProps++; }
            const deps = depByVisit.get(v.id) || [];
            const q = deps.reduce((a: number, d: any) => a + (Number(d.quantity) || 0), 0);
            rebuilt.depExisting += q;
            rebuilt.depInspected += q;
            rebuilt.depTreated += deps.filter((d: any) => d.is_treated)
              .reduce((a: number, d: any) => a + (Number(d.quantity) || 0), 0);
            rebuilt.depEliminated += deps.filter((d: any) => d.is_eliminated)
              .reduce((a: number, d: any) => a + (Number(d.quantity) || 0), 0);
            for (const d of deps) {
              const code = String(d.type_code || "").toUpperCase().trim() as DepKey;
              const qty = Number(d.quantity) || 0;
              if (code in rebuilt.depByType) {
                rebuilt.depByType[code] += qty;
                if (d.is_positive) rebuilt.fociByType[code] += qty;
              }
            }
            const treatAmt = Number(v.treatment_amount) || 0;
            rebuilt.larvicideAmount += treatAmt;
            if (v.larvicide_unit) rebuilt.larvicideUnit = v.larvicide_unit;
            const unit = String(v.larvicide_unit || "").toLowerCase();
            if (unit.includes("tubito")) rebuilt.tubitosUsed += treatAmt;
            else if (unit.includes("carga")) rebuilt.cargasCollected += treatAmt;
            else if (unit.includes("larva")) rebuilt.larvaeCollected += treatAmt;
            const tub = Number(v.tubitos_coletados) || 0;
            rebuilt.tubitos += tub;
            if (tub > 0) rebuilt.tubitosProps++;
            if (v.sample_collected) rebuilt.samples++;
            if (treatAmt > 0 || (Number(v.treated_deposits) || 0) > 0) rebuilt.treatedPropsCount++;
            const arr = byProp.get(v.property_id) || [];
            arr.push(v);
            byProp.set(v.property_id, arr);
          }
          for (const [, list] of byProp) {
            const last = list.sort((a, b) => String(b.visit_date).localeCompare(String(a.visit_date)))[0];
            if (last && (last.status === "closed" || last.status === "refused")) rebuilt.pendingLocal++;
          }
          console.log("[SESSION_SUMMARY_FALLBACK]", {
            reason: "dexie empty; rebuilt from supabase",
            worked: rebuilt.workedCount,
            depByType: rebuilt.depByType,
            fociByType: rebuilt.fociByType,
            remoteDepositsCount: remoteDeposits?.length ?? 0,
          });
          snap = rebuilt;
        }
        setSnapshot(snap);

        // Cálculo paralelo direto do Supabase (mesma fórmula do Dashboard)
        const dashClosed = (todayVisits || []).filter((v: any) => v.status === "closed").length;
        const dashRefused = (todayVisits || []).filter((v: any) => v.status === "refused").length;
        const dashFocus = (todayVisits || []).filter((v: any) => v.has_focus).length;
        const dashLarvicida = Math.round((todayVisits || []).reduce((s: number, v: any) => s + Number(v.treatment_amount || 0), 0));
        const dashTreatedDep = (todayVisits || []).reduce((s: number, v: any) => s + Number(v.treated_deposits || 0), 0);
        const dashEliminated = (todayVisits || []).reduce((s: number, v: any) => s + Number(v.elimination_amount || 0), 0);

        console.log("[SESSION_SUMMARY_CALC]", {
          source: "dexie/buildDailySnapshot",
          trabalhados: snap.workedCount,
          fechados: snap.closedCount,
          recusas: snap.refusedCount,
          pendencias: snap.pendingLocal,
          depositos_tratados: snap.depTreated,
          depositos_eliminados: snap.depEliminated,
          focos: snap.focusCount,
          larvicida: snap.larvicideAmount,
          tipos: snap.depByType,
        });
        console.log("[DASHBOARD_SUMMARY]", {
          source: "supabase/visits",
          trabalhados: todayVisits?.length ?? 0,
          fechados: dashClosed,
          recusas: dashRefused,
          focos: dashFocus,
          depositos_tratados: dashTreatedDep,
          depositos_eliminados: dashEliminated,
          larvicida: dashLarvicida,
        });
        console.log("[SUMMARY_COMPARE]", {
          trabalhados: { jornada: snap.workedCount, dashboard: todayVisits?.length ?? 0 },
          fechados:    { jornada: snap.closedCount, dashboard: dashClosed },
          recusas:     { jornada: snap.refusedCount, dashboard: dashRefused },
          focos:       { jornada: snap.focusCount,   dashboard: dashFocus },
          dep_tratados:{ jornada: snap.depTreated,   dashboard: dashTreatedDep },
          larvicida:   { jornada: snap.larvicideAmount, dashboard: dashLarvicida },
        });
        console.log("[SUMMARY_FUNCTION]", {
          jornada:   { fn: "buildDailySnapshot", file: "src/components/DailyWorkCloser.tsx", line: 100 },
          dashboard: { fn: "AgentDashboard useEffect", file: "src/components/agent/AgentDashboard.tsx", line: 85 },
        });
        console.log("[SUMMARY_SOURCE]", {
          jornada: "dexie (listLocal 'visits' + 'visit_deposits')",
          dashboard: "supabase.visits (Data API)",
          note: snap.workedCount === 0 && (todayVisits?.length ?? 0) > 0
            ? "⚠️ worked cai no fallback Supabase; demais campos permanecem 0 pois vêm só do snapshot Dexie — Dexie não tem visitas para a jornada"
            : "sem fallback",
        });

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
    try { (window as any).__vcSetJourneyActive?.(false); } catch {}
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

      // REGRA: o encerramento fecha SEMPRE a Data da Produção ativa (hoje).
      // A jornada de um quarteirão pode atravessar vários dias — as visitas
      // realizadas hoje pertencem exclusivamente a operational_date.
      const operationalWorkDate: string = getOperationalDate();
      const sessionStartedAt: string | null = activeSessionForClose?.session_date ?? null;
      const sessionLastResumedAt: string | null =
        (activeSessionForClose as any)?.last_resumed_at ?? null;
      const sessionCompletedAt: string | null =
        (activeSessionForClose as any)?.completed_at ?? null;
      const closingDate: string = new Date().toISOString();
      const isCrossDaySession =
        !!sessionStartedAt && sessionStartedAt !== operationalWorkDate;
      // Compatibilidade — nunca marcar DWR como retroativo por session_date antiga.
      const sessionIsRetro = false;
      const sessionRetroReason: string | null = null;

      console.log("[DAY_CLOSE_OPERATIONAL_DATE]", {
        operational_date: operationalWorkDate,
        session_id: activeSessionForClose?.id ?? null,
        session_started_at: sessionStartedAt,
        last_resumed_at: sessionLastResumedAt,
        completed_at: sessionCompletedAt,
        closing_date: closingDate,
      });

      if (isCrossDaySession) {
        console.log("[DAY_CLOSE_CROSS_DAY_SESSION]", {
          session_id: activeSessionForClose?.id ?? null,
          session_started_at: sessionStartedAt,
          operational_date: operationalWorkDate,
          note: "quarteirão iniciado anteriormente — produção do dia registrada em operational_date; nenhum dia anterior é reaberto",
        });
      }

      console.log("[PRODUCTION_DATE_SOURCE]", {
        module: "DailyWorkCloser",
        source: "operational_date",
        operational_date: operationalWorkDate,
        session_id: activeSessionForClose.id,
      });
      console.log("[PRODUCTION_DATE_PROPAGATION]", {
        module: "daily_work_records",
        operational_date: operationalWorkDate,
        work_date: operationalWorkDate,
      });

      console.log("[DailyWorkCloser:close] Data da Produção (work_date):", operationalWorkDate);

      console.log("[SESSION_CLOSE_START]", {
        session_id: activeSessionForClose?.id ?? null,
        block_number: activeSessionForClose?.block_number ?? null,
        block_id: (activeSessionForClose as any)?.block_id ?? null,
        agent_id: currentAgent.id,
        work_date: operationalWorkDate,
      });

      // CONSOLIDAÇÃO OFICIAL: soma TODAS as jornadas do agente na mesma
      // Data da Produção. Nunca escopar por currentSession.id — o encerramento
      // do expediente deve refletir a produção do dia inteiro.
      const dayAllSessions = await listLocal<any>(
        "field_work_sessions",
        (s) => s.user_id === user.id && s.session_date === operationalWorkDate,
      );
      const dayAllSessionIds = dayAllSessions.map((s: any) => s.id);
      console.log("[DAY_CLOSE_SESSIONS]", {
        op_date: operationalWorkDate,
        count: dayAllSessions.length,
        sessions: dayAllSessions.map((s: any) => ({
          id: s.id, block_number: s.block_number, block_id: s.block_id, status: s.status,
        })),
      });
      const visitsByAllSessions = await listLocal<any>(
        "visits",
        (v) =>
          v.agent_id === user.id &&
          String(v.visit_date || "").slice(0, 10) === operationalWorkDate,
      );
      const visitsPerSession: Record<string, number> = {};
      for (const v of visitsByAllSessions) {
        const key = v.field_work_session_id || "sem_sessao";
        visitsPerSession[key] = (visitsPerSession[key] || 0) + 1;
      }
      console.log("[DAY_CLOSE_VISITS]", {
        op_date: operationalWorkDate,
        total_visits: visitsByAllSessions.length,
        per_session: visitsPerSession,
        session_ids: dayAllSessionIds,
      });

      // Snapshot único — sem scope: consolida TODAS as jornadas da Data da Produção
      const snap = await buildDailySnapshot(user.id, operationalWorkDate);
      console.log("[DAY_CLOSE_CONSOLIDATED]", {
        op_date: operationalWorkDate,
        sessions: dayAllSessions.length,
        worked: snap.workedCount,
        closed: snap.closedCount,
        refused: snap.refusedCount,
        visited: snap.visitedCount,
        focus: snap.focusCount,
        depInspected: snap.depInspected,
        larvicide: snap.larvicideAmount,
        tubitos: snap.tubitos,
        blocks_worked: snap.blocksWorked,
      });
      console.log("[SESSION_TOTAL_VISITS]", { session_id: activeSessionForClose?.id ?? null, total: snap.workedCount });
      console.log("[SESSION_TOTAL_PROPERTIES]", { session_id: activeSessionForClose?.id ?? null, total: snap.workedCount });
      console.log("[SESSION_SUMMARY]", {
        session_id: activeSessionForClose?.id ?? null,
        worked: snap.workedCount,
        closed: snap.closedCount,
        refused: snap.refusedCount,
        visited: snap.visitedCount,
        focus: snap.focusCount,
      });

      // Reconciliação oficial: agrupamentos por tipo são fonte de verdade.
      const { reconcileIntegrity } = await import("@/lib/daily-integrity");
      const integrity = reconcileIntegrity({
        depByType: {
          a1: snap.depByType.A1, a2: snap.depByType.A2,
          b: snap.depByType.B,  c:  snap.depByType.C,
          d1: snap.depByType.D1, d2: snap.depByType.D2, e: snap.depByType.E,
        },
        fociByType: {
          a1: snap.fociByType.A1, a2: snap.fociByType.A2,
          b: snap.fociByType.B,  c:  snap.fociByType.C,
          d1: snap.fociByType.D1, d2: snap.fociByType.D2, e: snap.fociByType.E,
        },
        declaredTotalDeposits: snap.depInspected,
        declaredPositiveFoci: snap.focusCount,
      });
      if (integrity.log.reconciled) {
        console.warn("[INTEGRIDADE] divergência reconciliada", integrity.log);
        snap.depExisting = integrity.totalDeposits;
        snap.depInspected = integrity.totalDeposits;
        snap.focusCount = integrity.totalFoci;
      }
      setSnapshot(snap);

      // ═══════════ AUDITORIA DO ENCERRAMENTO ═══════════
      // Regra: o encerramento consome exclusivamente `operational-metrics`.
      // Compara UI (Tela de Trabalho) × Metrics × BlockStatus × Snapshot × DWR.
      const { getOperationalMetrics: __getMetrics } = await import("@/lib/operational-metrics");
      const __propsAll = await listLocal<any>("properties");
      const __propBlock = new Map<string, string>();
      for (const p of __propsAll) if (p?.id && p.block_number != null) __propBlock.set(p.id, String(p.block_number));

      const __dwrProperties = { total: 0, visited: 0, pending: 0, closed: 0, recovered: 0, deposits: 0, focuses: 0 };
      const __perBlockAudit: any[] = [];
      for (const s of dayAllSessions) {
        const bn = String(s.block_number ?? "");
        const propIds = __propsAll.filter((p) => String(p.block_number ?? "") === bn).map((p) => p.id);
        const vs = visitsByAllSessions.filter((v) => __propBlock.get(v.property_id) === bn);
        const metrics = __getMetrics({
          module: "DailyWorkCloser/audit",
          productionDate: operationalWorkDate,
          blockId: s.block_id,
          sessionId: s.id,
          propertyIds: propIds,
          visits: vs,
          fallbackTotal: Number(s.property_count || 0),
        });
        __perBlockAudit.push({ block_number: bn, ...metrics });
        __dwrProperties.total += metrics.totalProperties;
        __dwrProperties.visited += metrics.visitedProperties;
        __dwrProperties.pending += metrics.pendingProperties;
        __dwrProperties.closed += metrics.closedProperties;
        __dwrProperties.recovered += metrics.recoveredProperties;
      }
      __dwrProperties.deposits = snap.depInspected;
      __dwrProperties.focuses = snap.focusCount;

      const __uiPayload = {
        operational_date: operationalWorkDate,
        cycle: activeCycle?.id ?? null,
        blocks: __perBlockAudit.map((b) => b.block_number),
        total_properties: __dwrProperties.total,
        visited: __dwrProperties.visited,
        pending: __dwrProperties.pending,
        closed: __dwrProperties.closed,
        recovered: __dwrProperties.recovered,
        deposits: __dwrProperties.deposits,
        focuses: __dwrProperties.focuses,
      };
      console.log("[DAY_CLOSE_UI]", __uiPayload);
      console.log("[DAY_CLOSE_METRICS]", { ...__uiPayload, source: "operational-metrics" });
      console.log("[DAY_CLOSE_BLOCK_STATUS]", { blocks: __perBlockAudit });

      const __snapshotView = {
        total_properties: snap.workedCount,
        visited: snap.visitedCount,
        pending: snap.pendingLocal,
        closed: snap.closedCount,
        deposits: snap.depInspected,
        focuses: snap.focusCount,
      };
      console.log("[DAY_CLOSE_PRE_SNAPSHOT]", __snapshotView);

      // Comparação: divergências entre módulos
      const __divergences: any[] = [];
      const __check = (module: string, expected: any, found: any) => {
        for (const k of Object.keys(expected)) {
          if (Number(expected[k]) !== Number(found[k])) {
            __divergences.push({ module, field: k, expected: expected[k], found: found[k] });
          }
        }
      };
      __check("Snapshot vs Metrics", {
        visited: __dwrProperties.visited,
        pending: __dwrProperties.pending,
        closed: __dwrProperties.closed,
      }, {
        visited: snap.visitedCount,
        pending: snap.pendingLocal,
        closed: snap.closedCount,
      });

      // Cache: comparar Dexie × Supabase (total de visitas do dia)
      let __remoteCount = 0;
      try {
        if (isOnline()) {
          const { count } = await supabase
            .from("visits")
            .select("id", { count: "exact", head: true })
            .eq("agent_id", user.id)
            .gte("visit_date", `${operationalWorkDate}T00:00:00`)
            .lte("visit_date", `${operationalWorkDate}T23:59:59.999`);
          __remoteCount = count || 0;
        }
      } catch {}
      const __cacheDiv = __remoteCount > 0 && __remoteCount !== visitsByAllSessions.length;
      console.log("[DAY_CLOSE_CACHE]", {
        local_total: visitsByAllSessions.length,
        remote_total: __remoteCount,
        divergent: __cacheDiv,
      });

      if (__divergences.length > 0) {
        for (const d of __divergences) console.error("[DAY_CLOSE_METRICS_DIVERGENCE]", d);
        const first = __divergences[0];
        console.error("[DAY_CLOSE_BLOCK_REASON]", {
          module: first.module,
          field: first.field,
          expected: first.expected,
          found: first.found,
          reason: `Divergência entre ${first.module} no campo ${first.field}: esperado ${first.expected}, encontrado ${first.found}`,
        });
        toast.error(
          `Encerramento bloqueado — ${first.module}: ${first.field} esperado ${first.expected}, encontrado ${first.found}.`,
        );
        throw new Error(`[DAY_CLOSE_BLOCK_REASON] ${first.module}/${first.field}`);
      }
      console.log("[DAY_CLOSE_POST_SNAPSHOT]", __snapshotView);
      // ═════════════════════════════════════════════════



      let { depTreated, depEliminated, larvicideAmount } = snap;
      if (depTreated === 0 && stats.treatedDeposits) depTreated = stats.treatedDeposits;
      if (depEliminated === 0 && stats.eliminated) depEliminated = stats.eliminated;
      if (larvicideAmount === 0 && stats.larvicideUsed) larvicideAmount = stats.larvicideUsed;

      const { getEpiWeek, resolveCycleWeek } = await import("@/lib/cycle-week");
      const epi = getEpiWeek(new Date(`${operationalWorkDate}T12:00:00`));
      const resolvedCycleWeek = activeCycle?.id
        ? await resolveCycleWeek(activeCycle.id, new Date(`${operationalWorkDate}T12:00:00`))
        : null;
      console.log("[SE]", { work_date: operationalWorkDate, epi_week: epi.week, epi_year: epi.year });
      console.log("[CICLO]", { work_date: operationalWorkDate, cycle_id: activeCycle?.id ?? null });
      console.log("[SEMANA_CICLO]", { work_date: operationalWorkDate, cycle_id: activeCycle?.id ?? null, cycle_week: resolvedCycleWeek?.number ?? null });

      const recordData: any = {
        agent_id: currentAgent.id,
        cycle_id: activeCycle?.id,
        week_id: resolvedCycleWeek?.id ?? activeWeek?.id,
        work_date: operationalWorkDate,
        status: 'completed',
        end_time: new Date().toISOString(),
        properties_worked: snap.workedCount || stats.worked,
        properties_closed: snap.closedCount || stats.closed,
        properties_refused: snap.refusedCount || stats.refused,
        properties_recovered: recoveredCount,
        properties_positive: snap.positiveProps,
        deposits_existing: snap.depExisting,
        deposits_inspected: snap.depInspected,
        deposits_treated: depTreated,
        deposits_eliminated: depEliminated,
        positive_foci: snap.focusCount || stats.focus,
        larvicide_amount: larvicideAmount,
        larvicide_unit: snap.larvicideUnit,
        tubitos_collected: snap.tubitos,
        tubitos_properties: snap.tubitosProps,
        samples_collected: snap.samples,
        samples_total: snap.samples,
        blocks_worked: snap.blocksWorked,
        blocks_completed: snap.blocksCompleted,
        deposits_a1: snap.depByType.A1,
        deposits_a2: snap.depByType.A2,
        deposits_b: snap.depByType.B,
        deposits_c: snap.depByType.C,
        deposits_d1: snap.depByType.D1,
        deposits_d2: snap.depByType.D2,
        deposits_e: snap.depByType.E,
        pending_visits: snap.pendingLocal || pendingCount,
        strategic_points_worked: snap.strategicPointsWorked,
        tubitos_used: snap.tubitosUsed,
        larvae_collected: snap.larvaeCollected,
        cargas_collected: snap.cargasCollected,
        foci_by_type: integrity.fociByType,
        deposits_by_type: integrity.depByType,
        data_integrity_log: integrity.log,
        epi_week: epi.week,
        epi_year: epi.year,
        is_retroactive: sessionIsRetro,
        retroactive_reason: sessionRetroReason,
        updated_at: new Date().toISOString(),
      };

      console.log("[DIÁRIA] Snapshot criado", recordData);


      // 1) Upsert do daily_work_records — local + fila
      console.log("[ENCERRAR] salvando daily_work_records");
      const dwrConflictTarget = "legacy_agent_id,work_date";
      console.log("[DWR_UPSERT]", { table: "daily_work_records", agent_id: recordData.agent_id, legacy_agent_id: (recordData as any).legacy_agent_id ?? recordData.agent_id, work_date: recordData.work_date });
      console.log("[DWR_CONFLICT_TARGET]", { onConflict: dwrConflictTarget, uniqueIndex: "daily_work_records_agent_date_unique(legacy_agent_id, work_date)" });
      let savedDaily: any;
      try {
        console.log("[DAY_CLOSE_DWR_PRE]", {
          work_date: recordData.work_date,
          properties_worked: recordData.properties_worked,
          properties_closed: recordData.properties_closed,
          properties_refused: recordData.properties_refused,
          properties_recovered: recordData.properties_recovered,
          pending_visits: recordData.pending_visits,
          deposits_inspected: recordData.deposits_inspected,
          positive_foci: recordData.positive_foci,
        });
        savedDaily = await upsertOffline(
          "daily_work_records",
          { ...recordData, legacy_agent_id: (recordData as any).legacy_agent_id ?? recordData.agent_id },
          { onConflict: dwrConflictTarget },
        );
        console.log("[DAY_CLOSE_DWR_POST]", {
          dwr_id: savedDaily?.id ?? null,
          work_date: savedDaily?.work_date ?? recordData.work_date,
          properties_worked: savedDaily?.properties_worked ?? recordData.properties_worked,
          properties_closed: savedDaily?.properties_closed ?? recordData.properties_closed,
          properties_refused: savedDaily?.properties_refused ?? recordData.properties_refused,
          pending_visits: savedDaily?.pending_visits ?? recordData.pending_visits,
          deposits_inspected: savedDaily?.deposits_inspected ?? recordData.deposits_inspected,
          positive_foci: savedDaily?.positive_foci ?? recordData.positive_foci,
        });

      } catch (e: any) {
        console.error("[DWR_CONFLICT_ERROR]", { onConflict: dwrConflictTarget, message: e?.message, details: e?.details, hint: e?.hint });
        throw e;
      }
      console.log("[DIARIA_SALVA]", {
        id: savedDaily?.id ?? null,
        agent_id: recordData.agent_id,
        work_date: recordData.work_date,
        cycle_id: recordData.cycle_id,
        epi_week: recordData.epi_week,
        epi_year: recordData.epi_year,
      });
      console.log("[DAY_CLOSE_DWR]", {
        dwr_id: savedDaily?.id ?? null,
        agent_id: recordData.agent_id,
        work_date: recordData.work_date,
        sessions_consolidated: dayAllSessions.length,
        session_ids: dayAllSessionIds,
        properties_worked: recordData.properties_worked,
        properties_closed: recordData.properties_closed,
        properties_refused: recordData.properties_refused,
        properties_positive: recordData.properties_positive,
        positive_foci: recordData.positive_foci,
        deposits_inspected: recordData.deposits_inspected,
        deposits_treated: recordData.deposits_treated,
        deposits_eliminated: recordData.deposits_eliminated,
        larvicide_amount: recordData.larvicide_amount,
        tubitos_collected: recordData.tubitos_collected,
        blocks_worked: recordData.blocks_worked,
      });

      // 1.1) Validador de integridade da produção — nunca bloqueia
      try {
        const { runProductionIntegrity } = await import("@/lib/production-integrity");
        const integrityReport = await runProductionIntegrity({
          agentId: user.id,
          workDate: operationalWorkDate,
          cycleId: activeCycle?.id ?? null,
          snapshot: {
            workedCount: snap.workedCount,
            closedCount: snap.closedCount,
            refusedCount: snap.refusedCount,
            visitedCount: snap.visitedCount,
            focusCount: snap.focusCount,
            depInspected: snap.depInspected,
            depByType: snap.depByType as any,
            fociByType: snap.fociByType as any,
            strategicPointsWorked: snap.strategicPointsWorked,
          },
        });
        if (integrityReport.ok) {
          toast.success(`Integridade da Produção: ${integrityReport.score}%`);
        } else {
          toast.warning(
            `Integridade da Produção: ${integrityReport.score}% — ${integrityReport.divergences.length} divergência(s) encontrada(s).`,
          );
        }
      } catch (e) {
        console.error("[PRODUCTION_INTEGRITY_ERROR]", { reason: "runner_failed", message: (e as any)?.message });
      }

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

      // 4) Encerra o expediente: para cada jornada em andamento,
      //    decide PAUSED (imóveis pendentes) x FINISHED (tudo trabalhado).
      console.log("[ENCERRAR] atualizando field_work_sessions");
      const sessionsToClose = await listLocal<any>(
        "field_work_sessions",
        (s) => s.user_id === user.id && s.status === "in_progress",
      );
      const localVisitsAll = await listLocal<any>("visits", (v) => v.agent_id === user.id);
      for (const s of sessionsToClose) {
        const total = Number(s.property_count || 0);
        const workedIds = new Set<string>();
        for (const v of localVisitsAll) {
          if (v.field_work_session_id !== s.id) continue;
          if (!v.property_id) continue;
          if (v.status === "visited" || v.status === "closed" || v.status === "refused") {
            workedIds.add(v.property_id);
          }
        }
        const worked = workedIds.size;
        const allDone = total > 0 && worked >= total;
        const nextStatus = allDone ? "completed" : "paused";
        const prevStatus = s.status;
        await updateOffline("field_work_sessions", s.id, {
          status: nextStatus,
          updated_at: new Date().toISOString(),
        });
        const logPayload = {
          user_id: user.id,
          session_id: s.id,
          block_id: s.block_id ?? null,
          block_number: s.block_number ?? null,
          cycle_id: s.cycle_id ?? null,
          session_date: s.session_date ?? null,
          previous_status: prevStatus,
          new_status: nextStatus,
          worked,
          total,
        };
        if (allDone) {
          console.log("[JOURNEY_FINISHED]", logPayload);
        } else {
          console.log("[JOURNEY_PAUSED]", logPayload);
        }
      }
      const closedSessionId = activeSessionForClose?.id ?? null;
      const closedBlockId = (activeSessionForClose as any)?.block_id ?? activeSessionForClose?.block_number ?? null;
      console.log("[SESSION_END]", { session_id: closedSessionId, block_id: closedBlockId });

      // 5) Limpeza completa do estado operacional local
      setActiveSessionId(null);
      setOpenBlock(null);
      setJornadaDate(null);
      setSessionRetro({ retro: false, reason: null, createdAt: null });
      try {
        // Limpa quaisquer chaves temporárias de jornada (se existirem)
        Object.keys(localStorage)
          .filter((k) => /^vc_(active_session|current_block|selected_block|current_property)/.test(k))
          .forEach((k) => localStorage.removeItem(k));
      } catch {}
      try { window.dispatchEvent(new CustomEvent("vc:session-cleared", { detail: { session_id: closedSessionId } })); } catch {}
      console.log("[SESSION_STATE_CLEARED]", { session_id: closedSessionId });
      console.log("[SESSION_CLOSE_FINISH]", { session_id: closedSessionId, ok: true });
      console.log("[RC4_SESSION_OK]");
      // RC-7: após encerrar, próxima jornada poderá adotar o ciclo atual.
      try {
        const { data: sysCycle } = await supabase
          .from("cycles").select("id, number").eq("status", "in_progress").maybeSingle();
        console.log("[SESSION_NEW_CYCLE_AFTER_CLOSE]", {
          previous_session_cycle_id: activeCycle?.id ?? null,
          system_cycle_id: sysCycle?.id ?? null,
          system_cycle_number: (sysCycle as any)?.number ?? null,
        });
        console.log("[RC7_CYCLE_CONTINUITY_OK]");
      } catch {}

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

      if (!jornadaDate) {
        console.error("[PRODUCTION_DATE_ERROR]", { module: "DailyWorkCloser.defaultGeneratePDF", reason: "sem jornadaDate (session_date)" });
        toast.error("Data da jornada indisponível. Não é possível gerar o PDF.");
        return;
      }
      const opDateStr = jornadaDate;
      const startOfDay = new Date(`${opDateStr}T00:00:00`);
      const endOfDay = new Date(`${opDateStr}T23:59:59.999`);

      // Semana epidemiológica derivada da data operacional (America/Sao_Paulo).
      const epiWeek = epiWeekFromDate(opDateStr).week;

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
      let imoveisPositivos = 0;
      let imoveisTratados = 0;
      const depByType: Record<"A1"|"A2"|"B"|"C"|"D1"|"D2"|"E", number> = { A1:0, A2:0, B:0, C:0, D1:0, D2:0, E:0 };

      visits.forEach((v: any) => {
        const deps = v.deposits || [];
        const qtySum = deps.reduce((a: number, d: any) => a + (Number(d.quantity) || 0), 0);
        depExistentes += qtySum;
        depInspecionados += qtySum;
        depTratados += deps.filter((d: any) => d.is_treated).reduce((a: number, d: any) => a + (Number(d.quantity) || 0), 0);
        depEliminados += deps.filter((d: any) => d.is_eliminated).reduce((a: number, d: any) => a + (Number(d.quantity) || 0), 0);
        for (const d of deps) {
          const code = String(d.type_code || "").toUpperCase().trim() as keyof typeof depByType;
          if (code in depByType) depByType[code] += Number(d.quantity) || 0;
        }
        if (v.has_focus) { focos += 1; imoveisPositivos += 1; }
        larvicida += Number(v.treatment_amount) || 0;
        if (v.larvicide_unit) larvicideUnit = v.larvicide_unit;
        if ((Number(v.treatment_amount) || 0) > 0 || (Number(v.treated_deposits) || 0) > 0) imoveisTratados += 1;
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
      doc.text("LEVANTAMENTO DE ÍNDICE (LI)", 14, y);
      y += 2;
      autoTable(doc, {
        startY: y + 1,
        head: [["Dep. Existentes", "Inspecionados", "Tratados", "Eliminados", "Focos (+)", "Imóveis (+)", `Larvicida (${larvicideUnit})`, "Imóveis Trat."]],
        body: [[
          String(depExistentes),
          String(depInspecionados),
          String(depTratados),
          String(depEliminados),
          String(focos),
          String(imoveisPositivos),
          String(larvicida),
          String(imoveisTratados),
        ]],
        theme: "grid",
        headStyles: { fillColor: [30, 64, 175], textColor: 255, fontSize: 8, halign: "center" },
        styles: { fontSize: 9, halign: "center" },
      });
      y = (doc as any).lastAutoTable.finalY + 4;

      // === DEPÓSITOS POR TIPO ===
      const totalPorTipo = depByType.A1 + depByType.A2 + depByType.B + depByType.C + depByType.D1 + depByType.D2 + depByType.E;
      doc.setFont("helvetica", "bold");
      doc.text("DEPÓSITOS POR TIPO", 14, y);
      y += 2;
      autoTable(doc, {
        startY: y + 1,
        head: [["A1", "A2", "B", "C", "D1", "D2", "E", "Total"]],
        body: [[
          String(depByType.A1), String(depByType.A2), String(depByType.B),
          String(depByType.C), String(depByType.D1), String(depByType.D2),
          String(depByType.E), String(totalPorTipo),
        ]],
        theme: "grid",
        headStyles: { fillColor: [99, 102, 241], textColor: 255, fontSize: 9, halign: "center" },
        styles: { fontSize: 9, halign: "center" },
      });
      y = (doc as any).lastAutoTable.finalY + 4;

      // === TUBITOS E AMOSTRAS (sempre exibido) ===
      doc.setFont("helvetica", "bold");
      doc.text("TUBITOS E AMOSTRAS", 14, y);
      y += 2;
      autoTable(doc, {
        startY: y + 1,
        head: [["Tubitos Coletados", "Imóveis c/ Tubito", "Amostras Coletadas"]],
        body: [[String(tubitosTotal), String(imoveisComTubito), String(amostras)]],
        theme: "grid",
        headStyles: { fillColor: [5, 150, 105], textColor: 255, fontSize: 9, halign: "center" },
        styles: { fontSize: 9, halign: "center" },
      });
      if (tubitosTotal === 0 && amostras === 0) {
        y = (doc as any).lastAutoTable.finalY + 3;
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);
        doc.text("Nenhuma coleta de tubito ou amostra realizada nesta jornada.", 14, y);
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(11);
      }
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
        <DialogContent className="max-w-md rounded-[2.5rem] p-0 border-none shadow-2xl max-h-[92vh] overflow-y-auto bg-slate-50">
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
          
          <div className="p-6 space-y-5">
            <div>
              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">Produção Imobiliária</h4>
              <div className="grid grid-cols-3 gap-3">
                <SummaryItem icon={Target} label="Trabalhados" value={snapshot.workedCount || stats.worked} color="text-slate-800" />
                <SummaryItem icon={XCircle} label="Fechados" value={snapshot.closedCount || stats.closed} color="text-blue-600" />
                <SummaryItem icon={XCircle} label="Recusas" value={snapshot.refusedCount || stats.refused} color="text-red-500" />
                <SummaryItem icon={CheckCircle2} label="Recuperados" value={recoveredCount} color="text-emerald-500" />
                <SummaryItem icon={Clock} label="Pendências" value={snapshot.pendingLocal || pendingCount} color="text-amber-600" />
                <SummaryItem icon={Target} label="Imóveis (+)" value={snapshot.positiveProps} color="text-orange-600" />
              </div>
            </div>

            <div>
              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">Depósitos</h4>
              <div className="grid grid-cols-4 gap-2">
                <SummaryItem icon={Layers} label="Exist." value={snapshot.depExisting} color="text-slate-800" />
                <SummaryItem icon={Layers} label="Inspec." value={snapshot.depInspected} color="text-blue-600" />
                <SummaryItem icon={Layers} label="Tratad." value={snapshot.depTreated || stats.treatedDeposits} color="text-indigo-600" />
                <SummaryItem icon={Layers} label="Elimin." value={snapshot.depEliminated || stats.eliminated} color="text-emerald-500" />
              </div>
              <div className="mt-3 bg-indigo-50 border border-indigo-100 rounded-2xl p-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-indigo-700 mb-2">Por tipo</p>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {(["A1","A2","B","C","D1","D2","E"] as const).map((k) => (
                    <div key={k} className="bg-white rounded-xl py-2">
                      <p className="text-[9px] font-black text-slate-400 uppercase">{k}</p>
                      <p className="text-sm font-black text-slate-800">{snapshot.depByType[k]}</p>
                    </div>
                  ))}
                  <div className="bg-indigo-600 text-white rounded-xl py-2">
                    <p className="text-[9px] font-black uppercase">Total</p>
                    <p className="text-sm font-black">
                      {snapshot.depByType.A1 + snapshot.depByType.A2 + snapshot.depByType.B + snapshot.depByType.C + snapshot.depByType.D1 + snapshot.depByType.D2 + snapshot.depByType.E}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">Focos · Larvicida · Coletas</h4>
              <div className="grid grid-cols-3 gap-3">
                <SummaryItem icon={CheckCircle2} label="Focos (+)" value={snapshot.focusCount || stats.focus} color="text-orange-500" />
                <SummaryItem
                  icon={Droplets}
                  label="Larvicida"
                  value={`${snapshot.larvicideAmount || stats.larvicideUsed || 0}${snapshot.larvicideUnit || "g"}`}
                  color="text-cyan-600"
                />
                <SummaryItem icon={Layers} label="Imóveis Trat." value={snapshot.treatedPropsCount || stats.treated} color="text-indigo-600" />
              </div>
              {snapshot.tubitos > 0 || snapshot.samples > 0 ? (
                <div className="grid grid-cols-3 gap-3 mt-3">
                  <SummaryItem icon={Layers} label="Tubitos" value={snapshot.tubitos} color="text-emerald-600" />
                  <SummaryItem icon={Target} label="Imóv. c/ Tubito" value={snapshot.tubitosProps} color="text-emerald-600" />
                  <SummaryItem icon={Layers} label="Amostras" value={snapshot.samples} color="text-emerald-600" />
                </div>
              ) : (
                <p className="text-[10px] font-bold text-slate-500 mt-3 text-center bg-slate-50 border border-slate-100 rounded-2xl p-3">
                  Tubitos coletados: 0 — nenhuma coleta realizada nesta jornada.
                </p>
              )}
            </div>

            <div>
              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">Quarteirões</h4>
              <div className="grid grid-cols-3 gap-3">
                <SummaryItem icon={Target} label="Trabalhados" value={snapshot.blocksWorked} color="text-slate-800" />
                <SummaryItem icon={CheckCircle2} label="Concluídos" value={snapshot.blocksCompleted} color="text-emerald-500" />
                <SummaryItem icon={Clock} label="Em andamento" value={snapshot.blocksInProgress} color="text-amber-600" />
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
      
      <DialogContent className="max-w-md rounded-[2.5rem] p-0 border-none shadow-2xl max-h-[92vh] overflow-y-auto">
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
              Produção de {new Date(`${operationalDate}T12:00:00`).toLocaleDateString('pt-BR')}
            </span>
          </div>
          {jornadaDate && jornadaDate !== operationalDate && (
            <div className="mt-3 inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-full px-4 py-2 max-w-[520px]">
              <span className="text-[10px] font-bold uppercase tracking-wide leading-snug text-left text-white/90">
                Quarteirão iniciado em {new Date(`${jornadaDate}T12:00:00`).toLocaleDateString('pt-BR')} e concluído hoje.
              </span>
            </div>
          )}
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
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Produção Imobiliária</h4>
            <div className="grid grid-cols-2 gap-3">
              <SummaryItemSmall label="Trabalhados" value={displayWorked} icon={Target} />
              <SummaryItemSmall label={translate("CLOSED")} value={displayClosed} icon={XCircle} />
              <SummaryItemSmall label={translate("REFUSED")} value={displayRefused} icon={XCircle} />
              <SummaryItemSmall label="Recuperados" value={recoveredCount} icon={CheckCircle2} />
              <SummaryItemSmall label="Pend. Geradas" value={displayPending} icon={Clock} />
              <SummaryItemSmall label="Imóveis (+)" value={snapshot.positiveProps} icon={Target} />
            </div>

            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 pt-2">Depósitos</h4>
            <div className="grid grid-cols-2 gap-3">
              <SummaryItemSmall label="Existentes" value={snapshot.depExisting} icon={Layers} />
              <SummaryItemSmall label="Inspecionados" value={snapshot.depInspected} icon={Layers} />
              <SummaryItemSmall label="Tratados" value={displayTreatedDep} icon={Layers} />
              <SummaryItemSmall label="Eliminados" value={displayEliminated} icon={Layers} />
            </div>
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-indigo-700 mb-2">Detalhamento por tipo</p>
              <div className="grid grid-cols-4 gap-2 text-center">
                {(["A1","A2","B","C","D1","D2","E"] as const).map((k) => (
                  <div key={k} className="bg-white rounded-xl py-2">
                    <p className="text-[9px] font-black text-slate-400 uppercase">{k}</p>
                    <p className="text-sm font-black text-slate-800">{snapshot.depByType[k]}</p>
                  </div>
                ))}
                <div className="bg-indigo-600 text-white rounded-xl py-2">
                  <p className="text-[9px] font-black uppercase">Total</p>
                  <p className="text-sm font-black">
                    {snapshot.depByType.A1 + snapshot.depByType.A2 + snapshot.depByType.B + snapshot.depByType.C + snapshot.depByType.D1 + snapshot.depByType.D2 + snapshot.depByType.E}
                  </p>
                </div>
              </div>
            </div>

            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 pt-2">Focos & Larvicida</h4>
            <div className="grid grid-cols-2 gap-3">
              <SummaryItemSmall label="Focos (+)" value={displayFocus} icon={CheckCircle2} />
              <SummaryItemSmall label="Imóveis (+)" value={snapshot.positiveProps} icon={Target} />
              <SummaryItemSmall
                label="Larvicida"
                value={`${displayLarvicideUsed || 0}${snapshot.larvicideUnit || "g"}`}
                icon={Droplets}
              />
              <SummaryItemSmall label="Imóveis Trat." value={displayTreated} icon={Layers} />
            </div>

            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 pt-2">Tubitos & Amostras</h4>
            {snapshot.tubitos > 0 || snapshot.samples > 0 ? (
              <div className="grid grid-cols-3 gap-3">
                <SummaryItemSmall label="Tubitos" value={snapshot.tubitos} icon={Layers} />
                <SummaryItemSmall label="Imóveis c/ Tubito" value={snapshot.tubitosProps} icon={Target} />
                <SummaryItemSmall label="Amostras" value={snapshot.samples} icon={Layers} />
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-center">
                <p className="text-[10px] font-bold text-slate-500">Nenhuma coleta de tubito ou amostra nesta jornada.</p>
              </div>
            )}

            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 pt-2">Quarteirões</h4>
            <div className="grid grid-cols-3 gap-3">
              <SummaryItemSmall label="Trabalhados" value={snapshot.blocksWorked} icon={Target} />
              <SummaryItemSmall label="Concluídos" value={snapshot.blocksCompleted} icon={CheckCircle2} />
              <SummaryItemSmall label="Em andamento" value={snapshot.blocksInProgress} icon={Clock} />
            </div>
          </div>



          <div className="pt-4 flex flex-col gap-3">
            <Button 
              onClick={handlePreClose}
              disabled={isLoading || validating}
              className="w-full h-16 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-widest text-sm shadow-xl shadow-red-200 flex items-center justify-center gap-3"
            >
              {isLoading || validating ? (
                <>
                  <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {validating ? "Validando..." : "Sincronizando..."}
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

      <Dialog open={showValidation} onOpenChange={setShowValidation}>
        <DialogContent className="max-w-lg">
          {(() => {
            const criticals = validation?.issues.filter((i) => i.severity === "error") ?? [];
            const warnings = validation?.issues.filter((i) => i.severity === "warning") ?? [];
            const hasCritical = criticals.length > 0;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className={cn("flex items-center gap-2", hasCritical ? "text-red-600" : "text-slate-800")}>
                    {hasCritical ? <ShieldAlert className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                    {hasCritical ? "Encerramento bloqueado" : "Encerrar Expediente"}
                  </DialogTitle>
                  <DialogDescription>
                    {hasCritical
                      ? "Existem erros que precisam ser corrigidos antes de encerrar o expediente."
                      : "Resumo da Produção — revise os avisos abaixo e confirme o encerramento."}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 max-h-[55vh] overflow-y-auto">
                  {hasCritical && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-red-600">Erros críticos</p>
                      {criticals.map((i) => (
                        <div key={i.code} className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                            <div className="flex-1">
                              <p className="font-semibold">{i.message}</p>
                              <p className="text-[10px] font-mono opacity-70">{i.code}</p>
                            </div>
                            {i.code === "FAILED_MUTATIONS" && failedMutations.length > 0 && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-[10px] text-red-700 hover:bg-red-100"
                                onClick={() => setShowFailedDetails((v) => !v)}
                              >
                                {showFailedDetails ? "Ocultar" : "Ver detalhes"}
                              </Button>
                            )}
                          </div>
                          {i.code === "FAILED_MUTATIONS" && showFailedDetails && failedMutations.length > 0 && (
                            <div className="space-y-1.5 border-t border-red-200 pt-2">
                              {failedMutations.map((fm) => (
                                <div key={fm.id} className="flex items-start gap-2 rounded bg-white/60 p-2 text-[11px]">
                                  <div className="flex-1 min-w-0">
                                    <p className="font-mono font-semibold truncate">{fm.op} · {fm.table}</p>
                                    <p className="opacity-70 truncate">{fm.lastError || "sem detalhes"}</p>
                                    <p className="opacity-50 text-[10px]">tentativas: {fm.tries}</p>
                                  </div>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-6 px-2 text-[10px] border-red-300 text-red-700 hover:bg-red-100"
                                    onClick={() => handleDiscardFailed(fm.id)}
                                  >
                                    Descartar
                                  </Button>
                                </div>
                              ))}
                              <p className="text-[10px] opacity-70 pt-1">
                                Descartar remove permanentemente a mutação da fila local. Use apenas quando o dado já foi corrigido de outra forma.
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {warnings.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Avisos operacionais</p>
                      {warnings.map((i) => (
                        <div key={i.code} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                          <Clock className="h-4 w-4 mt-0.5 shrink-0" />
                          <div className="flex-1">
                            <p className="font-semibold">{i.message}</p>
                            {i.code === "PENDING_MUTATIONS" && (
                              <p className="text-[11px] opacity-80 mt-0.5">
                                Os dados permanecem armazenados localmente e serão sincronizados automaticamente.
                              </p>
                            )}
                            {i.code === "PARTIAL_JOURNEY" && (
                              <p className="text-[11px] opacity-80 mt-0.5">
                                A jornada poderá ser retomada posteriormente do último imóvel trabalhado.
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {validation && (
                    <div className="text-xs text-muted-foreground border-t pt-2 mt-2 grid grid-cols-2 gap-1">
                      <span className="col-span-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Informações</span>
                      <span>Imóveis no escopo: <b>{validation.counters.propertiesInScope}</b></span>
                      <span>Visitas: <b>{validation.counters.visitsInScope}</b></span>
                      <span>Depósitos vinculados: <b>{validation.counters.depositsLinked}</b></span>
                      <span>Fila pendente: <b>{validation.counters.pendingMutations}</b></span>
                      <span>Fila com erro: <b>{validation.counters.failedMutations}</b></span>
                    </div>
                  )}
                </div>

                <DialogFooter className="flex-col gap-2 sm:flex-col">
                  {hasCritical ? (
                    <>
                      <Button onClick={handleSyncNow} disabled={validating} className="w-full">
                        <RefreshCw className={cn("h-4 w-4 mr-2", validating && "animate-spin")} />
                        Corrigir Agora (Sincronizar e Revalidar)
                      </Button>
                      <Button variant="outline" onClick={() => setShowValidation(false)} className="w-full">
                        Cancelar
                      </Button>
                    </>
                  ) : (
                    <>
                      {validation && validation.counters.pendingMutations > 0 && (
                        <Button onClick={handleSyncNow} disabled={validating} className="w-full">
                          <RefreshCw className={cn("h-4 w-4 mr-2", validating && "animate-spin")} />
                          Sincronizar Agora
                        </Button>
                      )}
                      <Button
                        variant="default"
                        onClick={handleForceClose}
                        disabled={isLoading}
                        className="w-full bg-emerald-600 hover:bg-emerald-700"
                      >
                        Encerrar Mesmo Assim
                      </Button>
                      <Button variant="outline" onClick={() => setShowValidation(false)} className="w-full">
                        Cancelar
                      </Button>
                    </>
                  )}
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

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