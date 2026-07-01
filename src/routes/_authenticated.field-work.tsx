import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { blockManagersGuard } from "@/lib/role-guards";
import { useState, useEffect } from "react";
import { 
  Search, 
  MapPin, 
  ChevronRight, 
  Calendar as CalendarIcon,
  CheckCircle2,
  Users,
  Building2,
  Clock,
  ArrowRight,
  Info,
  Layers,
  CalendarDays,
  Plus,
  ChevronDown
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { safeGetUser } from "@/lib/offline/safe-auth";
import { useFieldWorkRecords } from "@/hooks/useOfflineData";
import { listRemoteOrCache, createOffline, updateOffline } from "@/lib/offline/repos";
import { isOnline } from "@/lib/offline/safe-fetch";
import { useOperationalDate } from "@/hooks/useOperationalDate";
import { translate } from "@/lib/translations";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DailyWorkCloser } from "@/components/DailyWorkCloser";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/field-work")({
  beforeLoad: blockManagersGuard,
  component: FieldWorkPage,
});

function FieldWorkPage() {
  const [date, setDate] = useState<Date>(new Date());
  const [blocks, setBlocks] = useState<any[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selectedCycleId, setSelectedCycleId] = useState<string>("");
  const [selectedWeekId, setSelectedWeekId] = useState<string>("");
  const [cycles, setCycles] = useState<any[]>([]);
  const [weeks, setWeeks] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  // Jornada Retroativa
  const [retroOpen, setRetroOpen] = useState(false);
  const [retroDate, setRetroDate] = useState<Date | undefined>(undefined);
  const [retroReason, setRetroReason] = useState<string>("");
  const [retroOtherText, setRetroOtherText] = useState<string>("");
  const [isRetroactive, setIsRetroactive] = useState(false);
  const [retroactiveReason, setRetroactiveReason] = useState<string | null>(null);
  const navigate = useNavigate();
  const { allowWeekend } = useOperationalDate();

  const [userId, setUserId] = useState<string | undefined>(undefined);
  const { data, loading, error } = useFieldWorkRecords(userId);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await safeGetUser();
      if (user) setUserId(user.id);
    })();
  }, []);

  useEffect(() => {
    fetchInitialData();
  }, []);


  async function fetchInitialData() {
    setIsLoading(true);
    try {
      // Fetch cycles (offline-first)
      const cyclesData = await listRemoteOrCache<any>({
        name: "cycles",
        remote: () =>
          supabase
            .from("cycles")
            .select("*")
            .eq("year", new Date().getFullYear())
            .order("number", { ascending: true }) as any,
        filter: (c) => c.year === new Date().getFullYear(),
      });

      if (cyclesData?.length) {
        const sorted = [...cyclesData].sort((a, b) => (a.number || 0) - (b.number || 0));
        setCycles(sorted);
        const activeCycle = sorted.find((c: any) => c.status === "in_progress") || sorted[0];
        if (activeCycle) {
          setSelectedCycleId(activeCycle.id);
          fetchWeeks(activeCycle.id);
        }
      }

      // Only show blocks that have properties linked to a boletim RG
      // belonging to the CURRENT agent.
      const { data: { user: currentUser } } = await safeGetUser();
      if (currentUser) {
        const myBoletins = await listRemoteOrCache<any>({
          name: "boletins_rg",
          remote: () =>
            supabase.from("boletins_rg").select("id, agent_id").eq("agent_id", currentUser.id) as any,
          filter: (b) => b.agent_id === currentUser.id,
        });

        const boletimIds = (myBoletins ?? []).map((b: any) => b.id);

        if (boletimIds.length === 0) {
          setBlocks([]);
        } else {
          const blocksData = await listRemoteOrCache<any>({
            name: "blocks",
            remote: () =>
              supabase
                .from("blocks")
                .select(`*, properties!inner(id, boletim_id)`)
                .in("properties.boletim_id", boletimIds)
                .order("number", { ascending: true }) as any,
          });

          if (blocksData) {
            const seen = new Set<string>();
            const uniq = blocksData.filter((b: any) => (seen.has(b.id) ? false : (seen.add(b.id), true)));
            uniq.sort((a: any, b: any) => String(a.number).localeCompare(String(b.number)));
            setBlocks(uniq);
          }
        }
      }

    } catch (error) {
      console.error("Error fetching initial data:", error);
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchWeeks(cycleId: string) {
    try {
      const weeksData = await listRemoteOrCache<any>({
        name: "weeks",
        remote: () =>
          supabase
            .from("weeks")
            .select("*")
            .eq("cycle_id", cycleId)
            .order("number", { ascending: true }) as any,
        filter: (w) => w.cycle_id === cycleId,
      });

      if (weeksData?.length) {
        const sorted = [...weeksData].sort((a, b) => (a.number || 0) - (b.number || 0));
        setWeeks(sorted);
        const auto = pickWeekForDate(sorted, date);
        if (auto) setSelectedWeekId(auto.id);
        else if (sorted.length > 0) setSelectedWeekId(sorted[0].id);
      }
    } catch (error) {
      console.error("Error fetching weeks:", error);
    }
  }


  function pickWeekForDate(list: any[], d: Date) {
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    return list.find((w: any) => {
      const s = new Date(w.start_date).getTime();
      const e = new Date(w.end_date).getTime();
      return t >= s && t <= e;
    }) || null;
  }

  // Auto-recompute week whenever the session date or available weeks change
  useEffect(() => {
    if (!weeks.length) return;
    const auto = pickWeekForDate(weeks, date);
    if (auto && auto.id !== selectedWeekId) setSelectedWeekId(auto.id);
  }, [date, weeks]);

  const selectedWeek = weeks.find(w => w.id === selectedWeekId);

  const selectedBlock = blocks.find(b => b.id === selectedBlockId);

  const filteredBlocks = blocks.filter(b => 
    b.number.includes(searchQuery)
  );

  const handleStartWork = async () => {
    console.log("[WORK_START]", { blockId: selectedBlockId, cycleId: selectedCycleId, weekId: selectedWeekId, online: isOnline() });
    if (!selectedBlockId || !selectedCycleId || !selectedWeekId) {
      toast.error("Por favor, preencha todos os campos");
      console.log("[WORK_ERROR]", { stage: "validate", reason: "missing-fields" });
      return;
    }

    try {
      const { data: { user } } = await safeGetUser();
      if (!user) {
        console.log("[WORK_ERROR]", { stage: "auth", reason: "no-user" });
        return;
      }

      const sessionDateStr = date.toISOString().split('T')[0];

      // ── Limites de data ──────────────────────────────────────────
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const chosen = new Date(date); chosen.setHours(0, 0, 0, 0);
      const diffDays = Math.round((today.getTime() - chosen.getTime()) / 86400000);
      if (diffDays < 0) {
        toast.error("Não é permitido registrar jornadas em datas futuras.");
        return;
      }
      if (diffDays > 7) {
        toast.error("Para registrar produções mais antigas (>7 dias), procure seu supervisor.");
        return;
      }

      // ── Validação: já existe jornada para esta data? ────────────
      // Offline-safe: ignora silenciosamente se a rede falhar.
      try {
        if (isOnline()) {
          const { data: existing } = await supabase
            .from("field_work_sessions")
            .select("id, status, session_date")
            .eq("user_id", user.id)
            .eq("session_date", sessionDateStr)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (existing && existing.status === "in_progress") {
            const cont = window.confirm(
              "Já existe uma jornada para esta data. Deseja continuar a jornada existente?"
            );
            if (cont) {
              navigate({ to: `/field-work-list` });
              return;
            }
            await updateOffline("field_work_sessions", existing.id, {
              status: "closed",
              updated_at: new Date().toISOString(),
            });
          }
        }
      } catch (e) {
        console.warn("[WORK_START] Verificação de duplicidade falhou (offline):", e);
      }

      // ── VALIDAÇÃO DE CICLO ATIVO (offline-first) ────────────────
      // Online: consulta Supabase. Offline: usa o ciclo selecionado pelo usuário
      // (que já foi hidratado via listRemoteOrCache → Dexie).
      let cycleIdToUse: string = selectedCycleId;
      if (isOnline()) {
        try {
          const { data: activeCycleRow } = await supabase
            .from("cycles")
            .select("id, number, year")
            .eq("status", "in_progress")
            .maybeSingle();
          if (activeCycleRow?.id) {
            cycleIdToUse = activeCycleRow.id;
            if (selectedCycleId && selectedCycleId !== cycleIdToUse) {
              toast.info(`Ciclo ajustado para o ciclo ativo (${activeCycleRow.number}/${activeCycleRow.year}).`);
            }
          }
        } catch (e) {
          console.warn("[WORK_START] Falha ao validar ciclo ativo — usando ciclo selecionado:", e);
        }
      } else {
        console.log("[WORK_SESSION_CREATE]", { mode: "offline", cycleIdToUse });
      }

      // Encerra sessões anteriores vinculadas a OUTROS ciclos (apenas online).
      if (isOnline()) {
        try {
          const { data: staleSessions } = await supabase
            .from("field_work_sessions")
            .select("id, cycle_id")
            .eq("user_id", user.id)
            .eq("status", "in_progress");
          const staleIds = (staleSessions || [])
            .filter((s: any) => s.cycle_id && s.cycle_id !== cycleIdToUse)
            .map((s: any) => s.id);
          for (const sid of staleIds) {
            await updateOffline("field_work_sessions", sid, { status: "closed", updated_at: new Date().toISOString() });
          }
        } catch (e) {
          console.warn("[WORK_START] Não foi possível verificar sessões antigas (offline):", e);
        }

        try {
          const { data: agent } = await supabase.from("agents").select("id, work_status").eq("profile_id", user.id).maybeSingle();
          if (agent?.work_status === 'work_completed' && agent?.id) {
            await updateOffline("agents", agent.id, { work_status: 'in_work' });
          }
        } catch {}
      }

      const { getEpiWeek } = await import("@/lib/cycle-week");
      const epi = getEpiWeek(new Date(`${sessionDateStr}T12:00:00`));

      const nowIso = new Date().toISOString();
      const payload = {
        user_id: user.id,
        cycle_id: cycleIdToUse,
        week_id: selectedWeekId,
        block_id: selectedBlock?.id || null,
        block_number: selectedBlock?.number || "",
        street_name: "Logradouro",
        property_count: selectedBlock?.total_properties || 0,
        session_date: sessionDateStr,
        status: "in_progress",
        is_retroactive: isRetroactive,
        retroactive_reason: isRetroactive ? retroactiveReason : null,
        created_at: nowIso,
        updated_at: nowIso,
      };

      console.log("[NEW_SESSION_START]", { block_id: selectedBlock?.id || null, block_number: selectedBlock?.number, cycle_id: cycleIdToUse });
      console.log("[NEW_BLOCK_SELECTED]", { block_id: selectedBlock?.id || null, block_number: selectedBlock?.number });
      console.log("[WORK_SESSION_CREATE]", { payload });
      const saved = await createOffline("field_work_sessions", payload);
      console.log("[WORK_DEXIE_SAVE]", { id: saved?.id });
      console.log("[WORK_QUEUE]", { table: "field_work_sessions", op: "insert", online: isOnline() });
      console.log("[WORK_READY]", { id: saved?.id, online: isOnline() });
      console.log("[NEW_SESSION_READY]", { session_id: saved?.id, block_number: selectedBlock?.number });
      try { (window as any).__vcSetJourneyActive?.(true); } catch {}

      toast.success(
        isRetroactive
          ? `Jornada retroativa de ${format(date, "dd/MM/yyyy")} registrada.`
          : (isOnline() ? "Trabalho iniciado com sucesso!" : "Jornada iniciada localmente. Será sincronizada quando houver conexão.")
      );
      navigate({ to: `/field-work-list` });
    } catch (error: any) {
      console.log("[WORK_ERROR]", { stage: "exception", message: String(error?.message || error) });
      toast.error("Erro ao iniciar trabalho: " + (error?.message || error));
    }
  };


  const confirmRetroactive = () => {
    if (!retroDate) { toast.error("Selecione a data da produção."); return; }
    if (!retroReason) { toast.error("Selecione o motivo."); return; }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const chosen = new Date(retroDate); chosen.setHours(0, 0, 0, 0);
    const diffDays = Math.round((today.getTime() - chosen.getTime()) / 86400000);
    if (diffDays < 0) { toast.error("Datas futuras não são permitidas."); return; }
    if (diffDays > 7) {
      toast.error("Para registrar produções mais antigas (>7 dias), procure seu supervisor.");
      return;
    }
    const reasonFinal = retroReason === "Outro" ? (retroOtherText.trim() || "Outro") : retroReason;
    setDate(retroDate);
    setIsRetroactive(true);
    setRetroactiveReason(reasonFinal);
    setRetroOpen(false);
    toast.info(`Modo retroativo ativado para ${format(retroDate, "dd/MM/yyyy")}. Toque em INICIAR JORNADA.`);
  };

  const cancelRetroactive = () => {
    setIsRetroactive(false);
    setRetroactiveReason(null);
    setDate(new Date());
  };

  return (
    <div className="pb-24 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="bg-slate-900 -mx-4 -mt-4 p-8 rounded-b-[3rem] shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <Building2 className="h-32 w-32 text-white" />
        </div>
        <h2 className="text-3xl font-black tracking-tight text-white mb-2 underline underline-offset-8 decoration-blue-500/30">Início de Trabalho</h2>
        <p className="text-slate-400 font-medium">Configure sua jornada diária</p>
      </div>

      <div className="space-y-6 px-1">
        {/* Cycle and Week Selection */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 ml-1">Ciclo</label>
            <Select value={selectedCycleId} onValueChange={(val) => {
              setSelectedCycleId(val);
              fetchWeeks(val);
            }}>
              <SelectTrigger className="h-14 rounded-2xl border-none bg-white shadow-md text-sm font-bold active:scale-95 transition-all">
                <Layers className="h-4 w-4 mr-2 text-blue-500" />
                <SelectValue placeholder="Ciclo" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-none shadow-xl">
                {cycles.map(c => (
                  <SelectItem key={c.id} value={c.id} className="rounded-xl font-bold">Ciclo {c.number}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 ml-1">Semana Epidemiológica</label>
            <div className="h-14 rounded-2xl bg-white shadow-md flex items-center px-4 text-sm font-bold text-slate-700">
              <CalendarDays className="h-4 w-4 mr-2 text-blue-500" />
              {selectedWeek ? `📅 Semana ${selectedWeek.number}` : "Calculando..."}
            </div>
          </div>
        </div>

        {/* Data da Atividade — automática (hoje) ou retroativa explícita */}
        <div className="space-y-3">
          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 ml-1">Data da Atividade</label>
          <div
            className={cn(
              "w-full h-16 rounded-2xl shadow-md flex items-center justify-between px-5",
              isRetroactive ? "bg-amber-50 border-2 border-amber-300" : "bg-white"
            )}
          >
            <div className="flex items-center gap-3">
              <CalendarIcon className={cn("h-6 w-6", isRetroactive ? "text-amber-600" : "text-blue-500")} />
              <div className="flex flex-col">
                <span className="text-base font-black text-slate-800">
                  {format(date, "PPP", { locale: ptBR })}
                </span>
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                  {isRetroactive ? "Produção retroativa" : "Hoje · automático"}
                </span>
              </div>
            </div>
            {isRetroactive && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={cancelRetroactive}
                className="text-[10px] font-black text-amber-700 hover:text-amber-900"
              >
                Cancelar
              </Button>
            )}
          </div>
          {isRetroactive && retroactiveReason && (
            <p className="text-[10px] font-bold text-amber-700 ml-1">
              <AlertTriangle className="inline h-3 w-3 mr-1" />
              Motivo: {retroactiveReason}
            </p>
          )}
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between ml-1">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Seleção do Quarteirão</label>
          </div>

          <Dialog open={isBlockModalOpen} onOpenChange={setIsBlockModalOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full h-20 rounded-[2rem] border-none bg-white shadow-lg flex items-center justify-between px-6 active:scale-95 transition-all group",
                  selectedBlockId ? "ring-2 ring-blue-500/20" : ""
                )}
              >
                <div className="flex items-center gap-4 text-left">
                  <div className={cn(
                    "h-12 w-12 rounded-2xl flex items-center justify-center transition-colors shadow-inner",
                    selectedBlockId ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-400"
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
                      selectedBlockId ? "text-slate-800" : "text-slate-400"
                    )}>
                      {selectedBlockId ? `Quarteirão ${selectedBlock?.number}` : "Selecione o quarteirão..."}
                    </span>
                    {selectedBlockId && (
                      <div className="flex items-center gap-2">
                        <Users className="h-3 w-3 text-slate-400" />
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{selectedBlock?.total_properties || 0} imóveis</span>
                      </div>
                    )}
                  </div>
                </div>
                <ChevronDown className="h-5 w-5 text-slate-400 group-hover:text-blue-500 transition-colors" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md rounded-[2.5rem] bg-slate-950 border-none shadow-2xl p-0 overflow-hidden">
              <DialogHeader className="p-8 pb-4">
                <DialogTitle className="text-xl font-black text-white uppercase tracking-tight">Quarteirões Disponíveis</DialogTitle>
                <div className="relative mt-4 group">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500 group-focus-within:text-blue-500 transition-colors" />
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
                      <div className="h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
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
                          ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" 
                          : "bg-white/5 text-slate-300 hover:bg-white/10"
                      )}
                      onClick={() => {
                        setSelectedBlockId(block.id);
                        setIsBlockModalOpen(false);
                      }}
                    >
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "h-12 w-12 rounded-xl flex items-center justify-center font-black text-lg shadow-inner",
                          selectedBlockId === block.id ? "bg-white/20 text-white" : "bg-slate-800 text-slate-400"
                        )}>
                          {block.number}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-black text-sm uppercase tracking-tight">Quarteirão {block.number}</span>

                          <span className={cn(
                            "text-[10px] font-bold uppercase tracking-widest",
                            selectedBlockId === block.id ? "text-white/60" : "text-slate-500"
                          )}>
                            {block.total_properties || 0} imóveis
                          </span>
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

        {/* Summary (Conditional) */}
        {selectedBlock && (
          <div className="animate-in fade-in slide-in-from-top-4 duration-500">
            <Card className="border-none shadow-xl bg-slate-50 rounded-[2.5rem] overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-blue-500" />
                  <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Resumo do Quarteirão {selectedBlock.number}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 p-5">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Imóveis</p>
                  <p className="text-xl font-black text-slate-800">{selectedBlock.total_properties || 0}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</p>
                  <p className={cn(
                    "text-xl font-black uppercase tracking-tighter",
                    selectedBlock.status === 'finished' ? 'text-emerald-500' : 'text-blue-500'
                  )}>
                    {selectedBlock.status === 'finished' ? 'Concluído' : selectedBlock.status === 'in_progress' ? 'Em Aberto' : translate(selectedBlock.status)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Resumo do Quarteirão</p>
                  <p className="text-xl font-black text-slate-800">Nº {selectedBlock.number}</p>

                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ciclo Selecionado</p>
                  <p className="text-xl font-black text-blue-600">
                    {cycles.find(c => c.id === selectedCycleId)?.number || "--"}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Start Button */}
        <div className="pt-4 pb-8">
          <Button 
            className={cn(
              "w-full h-24 rounded-[3rem] text-2xl font-black shadow-2xl transition-all gap-4 active:scale-95 border-4",
              selectedBlockId && selectedCycleId && selectedWeekId
                ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200 border-emerald-400 text-white" 
                : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none border-slate-300"
            )}
            onClick={handleStartWork}
          >
            INICIAR JORNADA
            <ArrowRight className="h-8 w-8" />
          </Button>
          {(!selectedBlockId || !selectedCycleId || !selectedWeekId) && (
            <p className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-4 animate-pulse">
              Selecione ciclo, semana e quarteirão para liberar
            </p>
          )}

          {/* Link discreto para Jornada Retroativa */}
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => { setRetroDate(undefined); setRetroReason(""); setRetroOtherText(""); setRetroOpen(true); }}
              className="text-[11px] font-bold text-slate-500 hover:text-amber-700 underline underline-offset-4 decoration-dotted"
            >
              Registrar produção de outra data
            </button>
          </div>

          {/* Modal — Jornada Retroativa */}
          <Dialog open={retroOpen} onOpenChange={setRetroOpen}>
            <DialogContent className="sm:max-w-md rounded-3xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-amber-700">
                  <AlertTriangle className="h-5 w-5" />
                  Jornada Retroativa
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Registre uma produção de até <b>7 dias anteriores</b>. Para datas mais antigas, procure seu supervisor.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                    Data da Produção
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-bold">
                        <CalendarIcon className="mr-2 h-4 w-4 text-amber-600" />
                        {retroDate ? format(retroDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecione a data"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
                      <Calendar
                        mode="single"
                        selected={retroDate}
                        onSelect={setRetroDate}
                        locale={ptBR}
                        disabled={(d) => {
                          const today = new Date(); today.setHours(0,0,0,0);
                          const min = new Date(today); min.setDate(min.getDate() - 7);
                          const t = new Date(d); t.setHours(0,0,0,0);
                          return t > today || t < min;
                        }}
                        initialFocus
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Motivo</Label>
                  <RadioGroup value={retroReason} onValueChange={setRetroReason} className="space-y-1.5">
                    {["Chuva", "Falta de internet", "Produção não lançada no dia", "Problema no aparelho", "Outro"].map((m) => (
                      <div key={m} className="flex items-center gap-2">
                        <RadioGroupItem id={`retro-${m}`} value={m} />
                        <Label htmlFor={`retro-${m}`} className="text-sm font-medium cursor-pointer">{m}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                  {retroReason === "Outro" && (
                    <Input
                      placeholder="Descreva o motivo"
                      value={retroOtherText}
                      onChange={(e) => setRetroOtherText(e.target.value)}
                      maxLength={120}
                    />
                  )}
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button variant="ghost" onClick={() => setRetroOpen(false)}>Cancelar</Button>
                <Button onClick={confirmRetroactive} className="bg-amber-600 hover:bg-amber-700 text-white font-black">
                  Confirmar Jornada Retroativa
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Encerramento da Produção do Dia */}
        <div className="pt-2 pb-8 space-y-3">
          <div className="flex items-center gap-2 ml-1">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Fim do Expediente</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>
          <DailyWorkCloser />
        </div>
      </div>

    </div>
  );
}
