import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { blockManagersGuard } from "@/lib/role-guards";
import { useState, useEffect, useMemo } from "react";
import {
  Search,
  MapPin,
  Calendar as CalendarIcon,
  CheckCircle2,
  Users,
  Building2,
  Layers,
  CalendarDays,
  ChevronDown,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { safeGetUser } from "@/lib/offline/safe-auth";
import { listRemoteOrCache, createOffline, updateOffline } from "@/lib/offline/repos";
import { isOnline } from "@/lib/offline/safe-fetch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { OpenSessionModal, type OpenSessionInfo } from "@/components/field-work/OpenSessionModal";
import { OperationalPanel } from "@/components/field-work/OperationalPanel";
import { getOperationalBlockStatus, logBlockStatusShared } from "@/lib/operational-block-status";

export const Route = createFileRoute("/_authenticated/field-work")({
  beforeLoad: blockManagersGuard,
  component: FieldWorkPage,
});

/** Máximo de dias retroativos permitidos para "Data da Produção". */
const MAX_RETROACTIVE_DAYS = 5;

function toDateOnly(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function autoRecoverSession(sessionId: string) {
  if (!isOnline()) return;
  try {
    await supabase.rpc("recover_session_visits" as any, { _session_id: sessionId });
  } catch (e: any) {
    console.warn("[SESSION_AUTO_RECOVER_FINISH]", { sessionId, error: e?.message });
  }
}

/**
 * Decide se uma sessão pausada realmente deve exibir o modal "Continuar Jornada".
 * Se o quarteirão já estiver CONCLUÍDO na Data da Produção ou o DWR já tiver sido
 * encerrado, auto-repara a sessão (marca como closed) e suprime o modal.
 */
async function assessSessionForResume(session: any): Promise<{ show: boolean; reason: string }> {
  const base = {
    session_id: session?.id,
    agent_id: session?.user_id,
    block_number: session?.block_number ?? null,
    block_id: session?.block_id ?? null,
    session_date: session?.session_date ?? null,
    status: session?.status ?? null,
    paused_at: session?.paused_at ?? session?.updated_at ?? null,
    completed_at: session?.completed_at ?? null,
  };

  console.log("[JOURNEY_SCAN]", base);

  const statusOk = session?.status === "paused" || session?.status === "in_progress";
  if (!statusOk || session?.completed_at) {
    console.log("[JOURNEY_RESUME_CHECK]", { ...base, motivo: "status inválido ou já concluída", show: false });
    return { show: false, reason: "status inválido" };
  }

  if (!isOnline()) {
    console.log("[JOURNEY_RESUME_CHECK]", { ...base, motivo: "offline — sem validação", show: true });
    return { show: true, reason: "offline" };
  }

  try {
    let propertyIds: string[] = [];
    if (session?.block_id) {
      const { data: props } = await supabase
        .from("properties")
        .select("id")
        .eq("block_id", session.block_id);
      propertyIds = (props || []).map((p: any) => p.id);
    }

    const { data: vs } = await supabase.rpc("get_session_visits" as any, {
      _agent_id: session.user_id,
      _session_date: session.session_date,
    });

    const canonical = getOperationalBlockStatus({
      propertyIds,
      visits: (vs || []) as any[],
      fallbackTotal: session?.property_count || 0,
    });

    const { data: dwr } = await supabase
      .from("daily_work_records")
      .select("id, status, end_time")
      .eq("agent_id", session.user_id)
      .eq("work_date", session.session_date)
      .maybeSingle();
    const dwrClosed = !!dwr && ((dwr as any).status === "completed" || !!(dwr as any).end_time);

    const enriched = {
      ...base,
      pending_properties: canonical.pendingProperties,
      total_properties: canonical.totalProperties,
      block_status: canonical.status,
      dwr_closed: dwrClosed,
    };

    const blockDone = canonical.status === "CONCLUIDO" ||
      (canonical.totalProperties > 0 && canonical.pendingProperties === 0);

    if (blockDone || dwrClosed) {
      console.log("[JOURNEY_COMPLETED_BLOCK]", {
        ...enriched,
        motivo: blockDone ? "quarteirão concluído" : "DWR encerrado",
      });
      try {
        await updateOffline("field_work_sessions", session.id, {
          status: "closed",
          updated_at: new Date().toISOString(),
        });
        console.log("[JOURNEY_AUTO_REPAIR]", { ...enriched, motivo: "sessão marcada como closed" });
      } catch (e: any) {
        console.warn("[JOURNEY_AUTO_REPAIR_ERR]", { ...enriched, error: e?.message });
      }
      return { show: false, reason: blockDone ? "quarteirão concluído" : "DWR encerrado" };
    }

    if (canonical.pendingProperties <= 0) {
      console.log("[JOURNEY_RESUME_CHECK]", { ...enriched, motivo: "sem pendências", show: false });
      return { show: false, reason: "sem pendências" };
    }

    console.log("[JOURNEY_RESUME_CHECK]", { ...enriched, motivo: "pendências reais — exibir modal", show: true });
    return { show: true, reason: "pendências reais" };
  } catch (e: any) {
    console.warn("[JOURNEY_RESUME_CHECK_ERR]", { ...base, error: e?.message });
    return { show: true, reason: "erro na validação" };
  }
}

function FieldWorkPage() {
  const navigate = useNavigate();

  const [userId, setUserId] = useState<string | undefined>(undefined);
  const [date, setDate] = useState<Date>(new Date());
  const [blocks, setBlocks] = useState<any[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);

  // Ciclo/Semana calculados automaticamente pela data
  const [autoCycle, setAutoCycle] = useState<any | null>(null);
  const [autoWeek, setAutoWeek] = useState<any | null>(null);
  const [computing, setComputing] = useState(false);

  // Jornada ativa (renderiza o painel)
  const [activeSession, setActiveSession] = useState<any | null>(null);
  const [checkingBoot, setCheckingBoot] = useState(true);

  // Modal "jornada já existente"
  const [openSession, setOpenSession] = useState<OpenSessionInfo | null>(null);
  const [openSessionModal, setOpenSessionModal] = useState(false);
  const [starting, setStarting] = useState(false);

  // Inicialização: usuário + blocos + retomada de jornadas pausadas
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await safeGetUser();
        if (!user) return;
        setUserId(user.id);
        await fetchBlocks(user.id);

        // Retomada automática: procura jornada PAUSED do agente
        if (isOnline()) {
          try {
            const { data: paused } = await supabase
              .from("field_work_sessions")
              .select("id, status, session_date, cycle_id, week_id, block_id, block_number, property_count, street_name, created_at, started_at, user_id")
              .eq("user_id", user.id)
              .eq("status", "paused")
              .order("updated_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (paused) {
              console.log("[JOURNEY_RESUMED]", {
                user_id: user.id,
                session_id: (paused as any).id,
                block_id: (paused as any).block_id,
                block_number: (paused as any).block_number,
                cycle_id: (paused as any).cycle_id,
                session_date: (paused as any).session_date,
                previous_status: "paused",
                new_status: "prompt",
              });
              const decision = await assessSessionForResume(paused);
              if (decision.show) {
                setOpenSession(paused as any);
                setOpenSessionModal(true);
              }
            }

          } catch (e) {
            console.warn("[JOURNEY_RESUMED_ERR]", e);
          }
        }
      } finally {
        setCheckingBoot(false);
      }
    })();
  }, []);


  // Ao trocar data, recalcula ciclo + semana
  useEffect(() => {
    if (!date) return;
    void computeCycleWeek(date);
  }, [date]);

  async function computeCycleWeek(d: Date) {
    setComputing(true);
    try {
      const iso = toDateOnly(d);
      // Ciclo por intervalo start_date <= data <= end_date
      const cyclesData = await listRemoteOrCache<any>({
        name: "cycles",
        remote: () =>
          supabase.from("cycles").select("*").order("year", { ascending: false }).order("number", { ascending: true }) as any,
      });
      const cycle = (cyclesData || []).find(
        (c: any) => c.start_date && c.end_date && c.start_date <= iso && iso <= c.end_date,
      ) || null;
      setAutoCycle(cycle);

      if (cycle) {
        const weeksData = await listRemoteOrCache<any>({
          name: "weeks",
          remote: () =>
            supabase.from("weeks").select("*").eq("cycle_id", cycle.id).order("number", { ascending: true }) as any,
          filter: (w) => w.cycle_id === cycle.id,
        });
        const wk = (weeksData || []).find(
          (w: any) => w.start_date <= iso && iso <= w.end_date,
        ) || null;
        setAutoWeek(wk);
      } else {
        setAutoWeek(null);
      }
      console.log("[FW_AUTO_CYCLE_WEEK]", { date: iso, cycle: cycle?.number ?? null, week: null });
    } catch (e) {
      console.warn("[FW_AUTO_CYCLE_WEEK_ERR]", e);
    } finally {
      setComputing(false);
    }
  }

  async function fetchBlocks(uid: string) {
    setIsLoading(true);
    try {
      const myBoletins = await listRemoteOrCache<any>({
        name: "boletins_rg",
        remote: () => supabase.from("boletins_rg").select("id, agent_id").eq("agent_id", uid) as any,
        filter: (b) => b.agent_id === uid,
      });
      const boletimIds = (myBoletins ?? []).map((b: any) => b.id);
      if (boletimIds.length === 0) {
        setBlocks([]);
        return;
      }
      let blocksData: any[] = await listRemoteOrCache<any>({
        name: "blocks",
        remote: () =>
          supabase
            .from("blocks")
            .select(`*, properties!inner(id, boletim_id)`)
            .in("properties.boletim_id", boletimIds)
            .order("number", { ascending: true }) as any,
      });
      if (isOnline() && (!blocksData || blocksData.length === 0)) {
        const { data: props } = await supabase
          .from("properties")
          .select("block_id, boletim_id")
          .in("boletim_id", boletimIds);
        const blockIds = Array.from(new Set((props ?? []).map((p: any) => p.block_id).filter(Boolean)));
        if (blockIds.length > 0) {
          const { data: bl } = await supabase
            .from("blocks")
            .select("*")
            .in("id", blockIds)
            .order("number", { ascending: true });
          blocksData = bl ?? [];
        }
      }
      const seen = new Set<string>();
      const uniq = (blocksData || []).filter((b: any) => (seen.has(b.id) ? false : (seen.add(b.id), true)));
      uniq.sort((a: any, b: any) => String(a.number).localeCompare(String(b.number)));
      setBlocks(uniq);
    } finally {
      setIsLoading(false);
    }
  }


  // Estatísticas por quarteirão para a Data da Produção selecionada
  // (baseado nas visitas reais do agente, não no status estático do bloco).
  const [blockStats, setBlockStats] = useState<Map<string, { total: number; visited: number; closed: number; refused: number; pending: number; status: "PENDENTE" | "EM_ANDAMENTO" | "CONCLUIDO" }>>(new Map());

  useEffect(() => {
    (async () => {
      if (!userId || !date || blocks.length === 0) { setBlockStats(new Map()); return; }
      const iso = toDateOnly(date);
      try {
        const { data: props } = await supabase
          .from("properties")
          .select("id, block_id")
          .in("block_id", blocks.map((b) => b.id));
        const propsByBlock = new Map<string, string[]>();
        (props || []).forEach((p: any) => {
          if (!p.block_id) return;
          const list = propsByBlock.get(p.block_id) || [];
          list.push(p.id);
          propsByBlock.set(p.block_id, list);
        });

        const { data: vs } = await supabase.rpc("get_session_visits" as any, {
          _agent_id: userId,
          _session_date: iso,
        });
        const visitByProp = new Map<string, any>();
        (vs || []).forEach((v: any) => { if (v.property_id) visitByProp.set(v.property_id, v); });

        const m = new Map<string, any>();
        blocks.forEach((b) => {
          const propIds = propsByBlock.get(b.id) || [];
          const blockVisits = propIds.map((pid) => visitByProp.get(pid)).filter(Boolean);
          const canonical = getOperationalBlockStatus({
            propertyIds: propIds,
            visits: blockVisits as any[],
            fallbackTotal: b.total_properties || 0,
          });
          logBlockStatusShared(
            {
              module: "FieldWork/BlockPicker",
              productionDate: iso,
              blockId: b.id,
              blockNumber: b.number,
            },
            canonical,
          );
          m.set(b.id, {
            total: canonical.totalProperties,
            visited: canonical.visitedProperties,
            closed: canonical.closedProperties,
            refused: canonical.refusedProperties,
            pending: canonical.pendingProperties,
            status: canonical.status,
          });
        });
        setBlockStats(m);
      } catch (e) {
        console.warn("[BLOCK_STATUS_CALC_ERR]", e);
      }
    })();
  }, [userId, date, blocks]);

  const selectedBlock = useMemo(
    () => blocks.find((b) => b.id === selectedBlockId) || null,
    [blocks, selectedBlockId],
  );
  const selectedStats = selectedBlockId ? blockStats.get(selectedBlockId) : null;

  const filteredBlocks = useMemo(
    () => blocks.filter((b) => String(b.number).includes(searchQuery)),
    [blocks, searchQuery],
  );


  const canStart = !!(date && selectedBlockId && autoCycle && autoWeek && !computing);

  async function handleStart() {
    if (!userId) return;
    if (!selectedBlock?.id) { toast.error("Selecione o quarteirão."); return; }
    if (!autoCycle?.id || !autoWeek?.id) { toast.error("Data fora de qualquer ciclo/semana válido."); return; }

    const sessionDateStr = toDateOnly(date);

    // Regra de janela retroativa
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const chosen = new Date(date); chosen.setHours(0, 0, 0, 0);
    const diffDays = Math.round((today.getTime() - chosen.getTime()) / 86400000);
    if (diffDays < 0) { toast.error("Datas futuras não são permitidas."); return; }
    if (diffDays > MAX_RETROACTIVE_DAYS) {
      toast.error(`Só é permitido lançar produção referente aos últimos ${MAX_RETROACTIVE_DAYS} dias.`);
      return;
    }

    setStarting(true);
    try {
      // Verificação estrita: user_id + block_id + status in (in_progress, paused)
      // Sessões pausadas de datas anteriores são retomadas neste bloco.
      if (isOnline()) {
        console.log("[SESSION_LOOKUP]", {
          user_id: userId, session_date: sessionDateStr, block_id: selectedBlock.id,
        });
        const { data: existing } = await supabase
          .from("field_work_sessions")
          .select("id, status, session_date, cycle_id, week_id, block_id, block_number, property_count, street_name, created_at, started_at, user_id")
          .eq("user_id", userId)
          .eq("block_id", selectedBlock.id)
          .in("status", ["in_progress", "paused"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existing) {
          console.log("[SESSION_FOUND]", { id: existing.id, status: (existing as any).status });
          if ((existing as any).status === "paused") {
            console.log("[JOURNEY_DUPLICATE_BLOCKED]", {
              user_id: userId,
              block_id: selectedBlock.id,
              cycle_id: autoCycle.id,
              existing_session_id: existing.id,
              existing_status: (existing as any).status,
            });
          }
          const decision = await assessSessionForResume({
            ...(existing as any),
            user_id: userId,
          });
          if (decision.show) {
            setOpenSession(existing as any);
            setOpenSessionModal(true);
            return;
          }
          toast.info("Este quarteirão já foi concluído nesta Data da Produção.");
          return;
        }
      }


      // Cria nova jornada automaticamente
      const nowIso = new Date().toISOString();
      const payload = {
        user_id: userId,
        cycle_id: autoCycle.id,
        week_id: autoWeek.id,
        block_id: selectedBlock.id,
        block_number: selectedBlock.number || "",
        street_name: "Logradouro",
        property_count: selectedBlock.total_properties || 0,
        session_date: sessionDateStr,
        started_at: nowIso,
        status: "in_progress",
        is_retroactive: diffDays > 0,
        retroactive_reason: null,
        created_at: nowIso,
        updated_at: nowIso,
      };
      console.log("[SESSION_CREATE]", payload);
      const saved = await createOffline("field_work_sessions", payload);
      console.log("[SESSION_CREATED]", { id: saved?.id });
      try { (window as any).__vcSetJourneyActive?.(true); } catch {}
      toast.success(
        isOnline()
          ? "Jornada iniciada com sucesso."
          : "Jornada iniciada localmente. Será sincronizada quando houver conexão.",
      );
      setActiveSession(saved);
    } catch (e: any) {
      console.error("[SESSION_CREATE_ERR]", e);
      toast.error("Erro ao iniciar jornada: " + (e?.message || e));
    } finally {
      setStarting(false);
    }
  }

  // Loading inicial
  if (checkingBoot) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  // Se já criamos/recuperamos a jornada nesta sessão de tela, mostra o painel
  if (activeSession) {
    return (
      <OperationalPanel
        session={activeSession}
        onCloseSessionRoute={() => {
          setActiveSession(null);
          setSelectedBlockId(null);
        }}
      />
    );
  }

  return (
    <div className="pb-24 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="bg-slate-900 -mx-4 -mt-4 p-8 rounded-b-[3rem] shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <Building2 className="h-32 w-32 text-white" />
        </div>
        <h2 className="text-3xl font-black tracking-tight text-white mb-2">Início de Trabalho</h2>
        <p className="text-slate-400 font-medium">A jornada começa pela data da produção</p>
      </div>

      <div className="space-y-6 px-1">
        {/* Data da Produção — passo 1 */}
        <div className="space-y-3">
          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 ml-1">
            1. Data da Produção
          </label>
          <div className="w-full rounded-2xl bg-white shadow-md p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CalendarIcon className="h-6 w-6 text-blue-500" />
              <div className="flex flex-col">
                <span className="text-lg font-black text-slate-800">
                  {format(date, "dd/MM/yyyy", { locale: ptBR })}
                </span>
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                  {format(date, "EEEE", { locale: ptBR })}
                </span>
              </div>
            </div>
            <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="rounded-2xl font-black text-xs h-11 border-2 border-blue-200 text-blue-700 hover:bg-blue-50"
                >
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  Alterar Data
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 pointer-events-auto" align="end">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => {
                    if (!d) return;
                    setDate(d);
                    setDatePopoverOpen(false);
                  }}
                  locale={ptBR}
                  disabled={(d) => {
                    const today = new Date(); today.setHours(0, 0, 0, 0);
                    const min = new Date(today); min.setDate(min.getDate() - MAX_RETROACTIVE_DAYS);
                    const t = new Date(d); t.setHours(0, 0, 0, 0);
                    return t > today || t < min;
                  }}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Ciclo e Semana — apenas conferência */}
        <div className="grid grid-cols-2 gap-4">
          <ReadOnlyField
            icon={<Layers className="h-4 w-4 text-blue-500" />}
            label="Ciclo (auto)"
            value={computing ? "Calculando..." : autoCycle ? `Ciclo ${autoCycle.number}` : "—"}
          />
          <ReadOnlyField
            icon={<CalendarDays className="h-4 w-4 text-blue-500" />}
            label="Semana Epidemiológica"
            value={computing ? "Calculando..." : autoWeek ? `Semana ${autoWeek.number}/8` : "—"}
          />
        </div>

        {!computing && date && (!autoCycle || !autoWeek) && (
          <p className="text-[11px] font-bold text-amber-700 ml-1">
            Esta data não corresponde a nenhum ciclo/semana cadastrada.
          </p>
        )}

        {/* Quarteirão — passo 2 */}
        <div className="space-y-3">
          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 ml-1">
            2. Quarteirão
          </label>
          <Dialog open={isBlockModalOpen} onOpenChange={setIsBlockModalOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full h-20 rounded-[2rem] border-none bg-white shadow-lg flex items-center justify-between px-6 active:scale-95 transition-all",
                  selectedBlockId ? "ring-2 ring-blue-500/20" : "",
                )}
              >
                <div className="flex items-center gap-4 text-left">
                  <div className={cn(
                    "h-12 w-12 rounded-2xl flex items-center justify-center transition-colors shadow-inner",
                    selectedBlockId ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-400",
                  )}>
                    {selectedBlockId ? (
                      <span className="text-xl font-black">{selectedBlock?.number}</span>
                    ) : (
                      <MapPin className="h-6 w-6" />
                    )}
                  </div>
                  <div className="flex flex-col">
                    <span className={cn(
                      "text-base font-black tracking-tight",
                      selectedBlockId ? "text-slate-800" : "text-slate-400",
                    )}>
                      {selectedBlockId ? `Quarteirão ${selectedBlock?.number}` : "Selecione o quarteirão..."}
                    </span>
                    {selectedBlockId && (
                      <div className="flex items-center gap-2">
                        <Users className="h-3 w-3 text-slate-400" />
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                          {selectedStats
                            ? `${selectedStats.total} imóveis · ${selectedStats.visited + selectedStats.closed + selectedStats.refused} visitados · ${selectedStats.pending} pendentes${selectedStats.status === "CONCLUIDO" ? " · CONCLUÍDO" : ""}`
                            : `${selectedBlock?.total_properties || 0} imóveis`}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <ChevronDown className="h-5 w-5 text-slate-400" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md rounded-[2.5rem] bg-slate-950 border-none shadow-2xl p-0 overflow-hidden">
              <DialogHeader className="p-8 pb-4">
                <DialogTitle className="text-xl font-black text-white uppercase tracking-tight">
                  Quarteirões Disponíveis
                </DialogTitle>
                <div className="relative mt-4">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                  <Input
                    placeholder="Buscar quarteirão..."
                    className="pl-12 h-14 rounded-2xl border-none bg-white/5 text-white placeholder:text-slate-600 font-bold focus-visible:ring-blue-500/20"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </DialogHeader>
              <ScrollArea className="max-h-[60vh] px-4 pb-8">
                <div className="grid grid-cols-1 gap-2 p-4">
                  {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-3">
                      <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Carregando...</p>
                    </div>
                  ) : filteredBlocks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 px-6 text-center gap-4">
                      <p className="text-slate-500 font-bold">Nenhum quarteirão encontrado</p>
                    </div>
                  ) : filteredBlocks.map((block) => (
                    <button
                      key={block.id}
                      className={cn(
                        "w-full p-4 rounded-2xl flex items-center justify-between transition-all active:scale-[0.98] text-left",
                        selectedBlockId === block.id
                          ? "bg-blue-600 text-white shadow-lg"
                          : "bg-white/5 text-slate-300 hover:bg-white/10",
                      )}
                      onClick={() => {
                        setSelectedBlockId(block.id);
                        setIsBlockModalOpen(false);
                      }}
                    >
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "h-12 w-12 rounded-xl flex items-center justify-center font-black text-lg shadow-inner",
                          selectedBlockId === block.id ? "bg-white/20 text-white" : "bg-slate-800 text-slate-400",
                        )}>
                          {block.number}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-black text-sm uppercase tracking-tight">Quarteirão {block.number}</span>
                          {(() => {
                            const s = blockStats.get(block.id);
                            const label = s
                              ? `${s.total} imóveis · ${s.visited + s.closed + s.refused} visitados · ${s.pending} pendentes${s.status === "CONCLUIDO" ? " · CONCLUÍDO" : ""}`
                              : `${block.total_properties || 0} imóveis`;
                            return (
                              <span className={cn(
                                "text-[10px] font-bold uppercase tracking-widest",
                                selectedBlockId === block.id ? "text-white/60" : "text-slate-500",
                              )}>
                                {label}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                      {selectedBlockId === block.id && <CheckCircle2 className="h-5 w-5 text-white" />}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </DialogContent>
          </Dialog>
        </div>

        {/* Botão iniciar */}
        <div className="pt-2 pb-8">
          <Button
            className={cn(
              "w-full h-24 rounded-[3rem] text-2xl font-black shadow-2xl transition-all gap-4 active:scale-95 border-4",
              canStart
                ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200 border-emerald-400 text-white"
                : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none border-slate-300",
            )}
            onClick={handleStart}
            disabled={!canStart || starting}
          >
            {starting ? <Loader2 className="h-8 w-8 animate-spin" /> : "INICIAR JORNADA"}
            {!starting && <ArrowRight className="h-8 w-8" />}
          </Button>
          {!canStart && !starting && (
            <p className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-4">
              Escolha a data e o quarteirão para liberar
            </p>
          )}
        </div>
      </div>

      <OpenSessionModal
        open={openSessionModal}
        session={openSession}
        cycleLabel={openSession && autoCycle?.id === openSession.cycle_id ? `Ciclo ${autoCycle.number}` : undefined}
        weekLabel={openSession && autoWeek?.id === openSession.week_id ? `Semana ${autoWeek.number}/8` : undefined}
        onContinue={async (s) => {
          setOpenSessionModal(false);
          // Se a jornada estava PAUSED, reativa para in_progress na data atual
          const wasPaused = (s as any).status === "paused";
          let resumed = s;
          if (wasPaused) {
            const todayStr = toDateOnly(new Date());
            try {
              await updateOffline("field_work_sessions", s.id, {
                status: "in_progress",
                session_date: todayStr,
                updated_at: new Date().toISOString(),
              });
              resumed = { ...s, status: "in_progress", session_date: todayStr } as any;
              console.log("[JOURNEY_RESUMED]", {
                user_id: userId,
                session_id: s.id,
                block_id: (s as any).block_id ?? null,
                block_number: s.block_number ?? null,
                cycle_id: s.cycle_id ?? null,
                session_date: todayStr,
                previous_status: "paused",
                new_status: "in_progress",
              });
            } catch (e) {
              console.warn("[JOURNEY_RESUMED_ERR]", e);
            }
          }
          await autoRecoverSession(s.id);
          try { (window as any).__vcSetJourneyActive?.(true); } catch {}
          setActiveSession(resumed);
        }}
        onFinished={() => {
          setOpenSessionModal(false);
          setOpenSession(null);
          toast.info("Você já pode iniciar uma nova jornada.");
        }}
        onCancel={() => setOpenSessionModal(false)}
      />
    </div>
  );
}

function ReadOnlyField({
  icon, label, value,
}: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="space-y-3">
      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 ml-1">{label}</label>
      <div className="h-14 rounded-2xl bg-white shadow-md flex items-center px-4 text-sm font-black text-slate-700 gap-2">
        {icon}
        {value}
      </div>
    </div>
  );
}
