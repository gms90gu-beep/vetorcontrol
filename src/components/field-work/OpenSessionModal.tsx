import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { updateOffline } from "@/lib/offline/repos";
import { isOnline } from "@/lib/offline/safe-fetch";
import { AlertTriangle, Play, StopCircle, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

export interface OpenSessionInfo {
  id: string;
  session_date: string;
  cycle_id: string | null;
  week_id: string | null;
  block_number: string | null;
  block_id?: string | null;
  property_count?: number | null;
  street_name?: string | null;
  created_at?: string | null;
  started_at?: string | null;
  status?: string | null;
  updated_at?: string | null;
  paused_at?: string | null;
}

interface Stats {
  total: number;
  visited: number;
  closed: number;
  refused: number;
  pending: number;
  positive: number;
  deposits: number;
  larvicide: number;
  nextIndex: number;
}

interface Props {
  open: boolean;
  session: OpenSessionInfo | null;
  cycleLabel?: string;
  weekLabel?: string;
  onContinue: (session: OpenSessionInfo) => void;
  onFinished: () => void;
  onCancel: () => void;
}

export function OpenSessionModal({ open, session, cycleLabel, weekLabel, onContinue, onFinished, onCancel }: Props) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [view, setView] = useState<"main" | "summary">("main");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!open || !session) return;
    setView("main");
    setStats(null);
    loadStats(session);
  }, [open, session?.id]);

  async function loadStats(s: OpenSessionInfo) {
    if (!isOnline()) return;
    setLoadingStats(true);
    try {
      // Bug: antes só contava visitas com field_work_session_id === s.id.
      // Quando a sessão é reaberta/duplicada (ver auditoria de sessões
      // retroativas — closeExpiredInProgressSessions podia fechar uma
      // jornada retroativa em aberto, levando o agente a iniciar outra
      // sessão nova para o mesmo quarteirão), as visitas reais continuam
      // vinculadas ao session_id ANTIGO. Este modal mostrava
      // "Visitados: 0 / Pendentes: total" mesmo com produção real feita
      // hoje. Agora usa a mesma estratégia já corrigida em
      // field-work-list.tsx: união de visitas por field_work_session_id
      // OU por cycle_id, restrita aos imóveis deste quarteirão quando
      // block_id está disponível.
      let propertyIds: string[] | null = null;
      if (s.block_id) {
        const { data: props } = await supabase
          .from("properties")
          .select("id")
          .eq("block_id", s.block_id);
        propertyIds = (props || []).map((p: any) => p.id);
      }

      let visitsQuery = supabase
        .from("visits")
        .select("id, status, has_focus, treatment_amount, property_id, field_work_session_id, cycle_id");
      visitsQuery = propertyIds && propertyIds.length > 0
        ? visitsQuery.in("property_id", propertyIds)
        : visitsQuery.eq("field_work_session_id", s.id);

      const { data: visitsRaw } = await visitsQuery;

      const bySession = (visitsRaw || []).filter(
        (v: any) => v.field_work_session_id && String(v.field_work_session_id) === String(s.id),
      );
      const byCycle = s.cycle_id
        ? (visitsRaw || []).filter((v: any) => v.cycle_id && String(v.cycle_id) === String(s.cycle_id))
        : [];
      const mergedById = new Map<string, any>();
      [...bySession, ...byCycle].forEach((v: any) => {
        if (v?.id) mergedById.set(String(v.id), v);
      });
      const visits = Array.from(mergedById.values());

      const visitedProps = new Set<string>();
      const closedProps = new Set<string>();
      const refusedProps = new Set<string>();
      let positive = 0;
      let larvicide = 0;

      (visits || []).forEach((v: any) => {
        if (v.property_id) {
          if (v.status === "visited") visitedProps.add(v.property_id);
          if (v.status === "closed") closedProps.add(v.property_id);
          if (v.status === "refused") refusedProps.add(v.property_id);
        }
        if (v.has_focus) positive += 1;
        if (v.treatment_amount) larvicide += Number(v.treatment_amount) || 0;
      });

      let deposits = 0;
      if (visits?.length) {
        const ids = visits.map((v: any) => v.id);
        const { count } = await supabase
          .from("visit_deposits")
          .select("id", { count: "exact", head: true })
          .in("visit_id", ids);
        deposits = count || 0;
      }

      const total = s.property_count || 0;
      const worked = visitedProps.size + closedProps.size + refusedProps.size;
      const pending = Math.max(0, total - worked);

      const nextIndex = worked + 1;
      const nextStats: Stats = {
        total,
        visited: visitedProps.size,
        closed: closedProps.size,
        refused: refusedProps.size,
        pending,
        positive,
        deposits,
        larvicide,
        nextIndex,
      };
      setStats(nextStats);

      if (s.status === "paused") {
        console.log("[JOURNEY_PAUSED_MODAL]", {
          session_id: s.id,
          block_id: s.block_id ?? null,
          block_number: s.block_number ?? null,
          visited: visitedProps.size + closedProps.size + refusedProps.size,
          pending,
          next_property: nextIndex,
          paused_at: s.paused_at ?? s.updated_at ?? null,
        });
      }
    } catch (e) {
      console.warn("[SESSION_MODAL_STATS] falha", e);
    } finally {
      setLoadingStats(false);
    }
  }

  if (!session) return null;

  const dateBR = new Date(`${session.session_date}T12:00:00`).toLocaleDateString("pt-BR");
  const startSource = session.started_at || session.created_at;
  const startTime = startSource
    ? new Date(startSource).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";
  if (session.started_at && session.created_at) {
    const dur = Math.max(0, Date.now() - new Date(session.started_at).getTime());
    console.log("[SESSION_DURATION]", { minutes: Math.round(dur / 60000) });
  }

  const isPaused = session.status === "paused";
  const pausedAtSrc = session.paused_at || session.updated_at || null;
  const pausedAtMs = pausedAtSrc ? new Date(pausedAtSrc).getTime() : null;
  const daysSincePause = pausedAtMs ? Math.max(0, Math.floor((Date.now() - pausedAtMs) / 86400000)) : null;
  const pausedAtBR = pausedAtSrc
    ? new Date(pausedAtSrc).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";

  const handleContinue = () => {
    console.log("[SESSION_CONTINUE]", { id: session.id, cycle_id: session.cycle_id, week_id: session.week_id, block_number: session.block_number });
    console.log("[SESSION_RESTORE]", {
      field_work_session_id: session.id,
      cycle_id: session.cycle_id,
      week_id: session.week_id,
      block_id: session.block_id ?? null,
      block_number: session.block_number,
      session_date: session.session_date,
    });
    if (isPaused) {
      console.log("[JOURNEY_RESUME_SELECTED]", {
        session_id: session.id,
        block_id: session.block_id ?? null,
        block_number: session.block_number ?? null,
        next_property: stats?.nextIndex ?? null,
        paused_at: pausedAtSrc,
      });
    }
    onContinue(session);
  };

  const handleAskClose = () => {
    console.log("[SESSION_CLOSE_CONFIRM]", { id: session.id, stats });
    setView("summary");
  };

  const handleConfirmClose = async () => {
    setWorking(true);
    try {
      console.log("[SESSION_CLOSE]", { id: session.id });
      console.log("[SESSION_SUMMARY]", { id: session.id, stats });
      if (isOnline()) {
        try {
          await supabase.rpc("recover_session_visits" as any, { _session_id: session.id });
        } catch (e) {
          console.warn("[SESSION_CLOSE] recover_session_visits falhou", e);
        }
      }
      await updateOffline("field_work_sessions", session.id, {
        status: "closed",
        updated_at: new Date().toISOString(),
      });
      console.log("[SESSION_FINISHED]", { id: session.id });
      try { (window as any).__vcSetJourneyActive?.(false); } catch {}
      toast.success("Jornada encerrada com sucesso.");
      console.log("[SESSION_NEW_ALLOWED]");
      onFinished();
    } catch (e: any) {
      console.warn("[SESSION_FINISHED] erro", e);
      toast.error("Erro ao encerrar jornada: " + (e?.message || e));
    } finally {
      setWorking(false);
    }
  };

  const handleCancel = () => {
    console.log("[SESSION_CANCEL]", { id: session.id });
    onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleCancel(); }}>
      <DialogContent className="sm:max-w-lg rounded-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-700">
            <AlertTriangle className="h-5 w-5" />
            {view === "main"
              ? (isPaused ? "Jornada pausada" : "Jornada em andamento")
              : "Encerrar jornada?"}
          </DialogTitle>
          <DialogDescription>
            {view === "main"
              ? (isPaused
                ? "Existe uma jornada pausada para este quarteirão. Deseja continuar de onde parou?"
                : "Já existe uma jornada em aberto. Escolha uma das opções abaixo.")
              : "Revise o resumo abaixo antes de encerrar. Esta ação não pode ser desfeita."}
          </DialogDescription>
        </DialogHeader>

        {view === "main" ? (
          isPaused ? (
            <div className="grid grid-cols-2 gap-3 py-2 text-sm">
              <Info label="Quarteirão" value={session.block_number || "—"} />
              <Info label="Status" value="Pausada" />
              <Info label="Última Data da Produção" value={dateBR} />
              <Info label="Data/hora da pausa" value={pausedAtBR} />
              <Info
                label="Progresso"
                value={loadingStats ? "…" : `${(stats?.visited ?? 0) + (stats?.closed ?? 0) + (stats?.refused ?? 0)} de ${stats?.total ?? session.property_count ?? 0}`}
              />
              <Info label="Próximo imóvel" value={loadingStats ? "…" : String(stats?.nextIndex ?? 1)} />
              <Info label="Pendentes" value={loadingStats ? "…" : String(stats?.pending ?? 0)} />
              <Info label="Tempo desde a pausa" value={daysSincePause === null ? "—" : daysSincePause === 0 ? "Hoje" : daysSincePause === 1 ? "1 dia" : `${daysSincePause} dias`} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 py-2 text-sm">
              <Info label="Data da Produção" value={dateBR} />
              <Info label="Jornada iniciada" value={startTime} />

              <Info label="Ciclo" value={cycleLabel || "—"} />
              <Info label="Semana" value={weekLabel || "—"} />
              <Info label="Quarteirão" value={session.block_number || "—"} />
              <Info label="Imóveis" value={String(session.property_count ?? "—")} />
              <Info label="Visitados" value={loadingStats ? "…" : String(stats?.visited ?? 0)} />
              <Info label="Pendentes" value={loadingStats ? "…" : String(stats?.pending ?? 0)} />
            </div>
          )
        ) : (
          <div className="grid grid-cols-2 gap-3 py-2 text-sm">
            <Info label="Total de imóveis" value={String(stats?.total ?? 0)} />
            <Info label="Visitados" value={String(stats?.visited ?? 0)} />
            <Info label="Fechados" value={String(stats?.closed ?? 0)} />
            <Info label="Recusas" value={String(stats?.refused ?? 0)} />
            <Info label="Pendências" value={String(stats?.pending ?? 0)} />
            <Info label="Focos (+)" value={String(stats?.positive ?? 0)} />
            <Info label="Depósitos tratados" value={String(stats?.deposits ?? 0)} />
            <Info label="Larvicida (g)" value={String(stats?.larvicide ?? 0)} />
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          {view === "main" ? (
            <>
              <Button
                className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl"
                onClick={handleContinue}
                disabled={working}
              >
                <Play className="h-4 w-4 mr-2" />
                Continuar Jornada
              </Button>
              <Button
                variant="outline"
                className="w-full h-12 border-2 border-red-300 text-red-700 hover:bg-red-50 font-black rounded-2xl"
                onClick={handleAskClose}
                disabled={working}
              >
                <StopCircle className="h-4 w-4 mr-2" />
                Encerrar Jornada
              </Button>
              <Button
                variant="ghost"
                className="w-full h-11 text-slate-500 font-bold"
                onClick={handleCancel}
                disabled={working}
              >
                <X className="h-4 w-4 mr-2" />
                Cancelar
              </Button>
            </>
          ) : (
            <>
              <Button
                className="w-full h-12 bg-red-600 hover:bg-red-700 text-white font-black rounded-2xl"
                onClick={handleConfirmClose}
                disabled={working}
              >
                {working ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <StopCircle className="h-4 w-4 mr-2" />}
                Confirmar Encerramento
              </Button>
              <Button
                variant="ghost"
                className="w-full h-11 text-slate-500 font-bold"
                onClick={() => setView("main")}
                disabled={working}
              >
                Voltar
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</p>
      <p className="text-base font-black text-slate-800">{value}</p>
    </div>
  );
}
