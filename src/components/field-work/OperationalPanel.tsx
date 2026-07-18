import { useEffect, useMemo, useRef, useState, memo, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  MapPin, Calendar, Clock, Home, CheckCircle2, XCircle, DoorClosed,
  AlertTriangle, Bug, FlaskConical, Droplets, Search, Map as MapIcon,
  FileText, ClipboardList, Plus, Flag, RefreshCw, Cloud, CloudOff,
  Navigation, ChevronRight, ChevronDown, ChevronUp, Circle
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { BlockOperationalMap } from "./BlockOperationalMap";
import { supabase } from "@/integrations/supabase/client";
import { listRemoteOrCache } from "@/lib/offline/repos";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getEpiWeek } from "@/lib/cycle-week";
import { comparePropertyOrder, sortPropertiesOperational } from "@/lib/property-order";
import { useBlockProgress } from "@/hooks/useBlockProgress";

type FilterKey =
  | "all" | "pending" | "visited" | "closed" | "refused"
  | "focus" | "geo" | "nogeo";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "pending", label: "Pendentes" },
  { key: "visited", label: "Visitados" },
  { key: "closed", label: "Fechados" },
  { key: "refused", label: "Recusas" },
  { key: "focus", label: "Focos" },
  { key: "geo", label: "Georref." },
  { key: "nogeo", label: "Sem GPS" },
];

const audit = (tag: string, data?: any) => {
  try { console.info(`[${tag}]`, data ?? ""); } catch {}
};

function typeLabel(t?: string | null) {
  const map: Record<string, string> = {
    R: "Residência", C: "Comércio", TB: "Terreno Baldio",
    PE: "Ponto Estratégico", O: "Outro", V: "Vago",
  };
  if (!t) return "—";
  return map[t] || t;
}

/**
 * Retorna a data operacional (YYYY-MM-DD) no fuso America/Sao_Paulo,
 * espelhando a função SQL `public.operational_date(timestamptz)`. É a fonte
 * única usada para casar `visits.visit_date` com `field_work_sessions.session_date`
 * quando lemos do cache Dexie offline.
 */
const _opDateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
function operationalDateBR(iso: string | Date | null | undefined): string | null {
  if (!iso) return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  if (isNaN(d.getTime())) return null;
  return _opDateFmt.format(d);
}



// Ordenação operacional canônica — número, sequência, complemento.
// Nunca considerar tipo do imóvel. Fonte única em @/lib/property-order.
const smartCompare = comparePropertyOrder;

interface Props {
  session: any;
  onCloseSessionRoute?: () => void;
}

export function OperationalPanel({ session, onCloseSessionRoute }: Props) {
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const { syncing, pending } = useSyncStatus();

  const [agent, setAgent] = useState<any>(null);
  const [cycle, setCycle] = useState<any>(null);
  const [week, setWeek] = useState<any>(null);
  const [properties, setProperties] = useState<any[]>([]);
  const [visits, setVisits] = useState<any[]>([]);
  const [blockVisits, setBlockVisits] = useState<any[]>([]);
  const [deposits, setDeposits] = useState<any[]>([]);
  const [pendencies, setPendencies] = useState<any[]>([]);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [now, setNow] = useState(Date.now());
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [mapOpen, setMapOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollKey = `op_panel_scroll_${session?.id ?? "none"}`;
  const filterKey = `op_panel_filter_${session?.id ?? "none"}`;

  // Restaura filtro
  useEffect(() => {
    try {
      const f = sessionStorage.getItem(filterKey) as FilterKey | null;
      if (f) setFilter(f);
    } catch {}
  }, [filterKey]);

  useEffect(() => {
    try { sessionStorage.setItem(filterKey, filter); } catch {}
  }, [filter, filterKey]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const loadAll = useCallback(async () => {
    if (!session?.user_id) return;
    audit("OP_PANEL_LOAD", { session: session.id });

    const [{ data: ag }, { data: cy }, { data: wk }] = await Promise.all([
      supabase.from("agents").select("name, registration_id, municipality")
        .eq("profile_id", session.user_id).maybeSingle(),
      session.cycle_id
        ? supabase.from("cycles").select("id, number, year, name").eq("id", session.cycle_id).maybeSingle()
        : Promise.resolve({ data: null } as any),
      session.week_id
        ? supabase.from("weeks").select("id, number, start_date, end_date").eq("id", session.week_id).maybeSingle()
        : Promise.resolve({ data: null } as any),
    ]);
    setAgent(ag); setCycle(cy); setWeek(wk);

    if (session.block_id) {
      const props = await listRemoteOrCache<any>({
        name: "properties",
        remote: () => supabase.from("properties").select("*").eq("block_id", session.block_id)
          .order("sequence", { ascending: true, nullsFirst: false }) as any,
        filter: (p) => p.block_id === session.block_id,
      });
      const sorted = sortPropertiesOperational(props || []);
      setProperties(sorted);
      try { sessionStorage.setItem(`op_panel_order_${session.block_id}`, JSON.stringify(sorted.map((p) => p.id))); } catch {}

      const propIds = sorted.map((p) => p.id);
      if (propIds.length) {
        const { data: pend } = await supabase.from("property_pendencies")
          .select("property_id, current_status, resolved_at")
          .in("property_id", propIds);
        setPendencies(pend || []);
      }
    }

    // Data operacional (America/Sao_Paulo) — fonte única, sem janelas UTC .gte/.lte.
    // A RPC public.get_session_visits filtra por public.operational_date(visit_date) = session.session_date.
    // Fallback offline: Dexie + filtro por operational_date computada no fuso do Brasil.
    const vs = await listRemoteOrCache<any>({
      name: "visits",
      remote: () =>
        supabase.rpc("get_session_visits" as any, {
          _agent_id: session.user_id,
          _session_date: session.session_date,
        }) as any,
      filter: (v) =>
        v.agent_id === session.user_id &&
        operationalDateBR(v.visit_date) === session.session_date,
    });
    setVisits(vs);
    audit("OP_PANEL_VISITS", { count: vs.length, source: (vs as any).source, session_date: session.session_date });

    if (vs.length) {
      const { data: deps } = await supabase.from("visit_deposits")
        .select("id, visit_id, type_code, quantity, is_positive")
        .in("visit_id", vs.map((v: any) => v.id));
      setDeposits(deps || []);
    } else {
      setDeposits([]);
    }
    audit("OP_PANEL_REFRESH", { properties: (properties || []).length });

  }, [session?.id, session?.block_id, session?.session_date, session?.user_id, session?.cycle_id, session?.week_id]);

  useEffect(() => { loadAll(); }, [loadAll, refreshTick]);

  // Realtime: escuta visitas/depósitos/pendências e recarrega
  useEffect(() => {
    if (!session?.user_id || !session?.block_id) return;
    const channel = supabase
      .channel(`op_panel_${session.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "visits", filter: `agent_id=eq.${session.user_id}` },
        () => { audit("OP_PANEL_PROPERTY_CHANGE", { src: "visits" }); setRefreshTick((n) => n + 1); })
      .on("postgres_changes", { event: "*", schema: "public", table: "properties", filter: `block_id=eq.${session.block_id}` },
        () => { audit("OP_PANEL_PROPERTY_CHANGE", { src: "properties" }); setRefreshTick((n) => n + 1); })
      .on("postgres_changes", { event: "*", schema: "public", table: "property_pendencies" },
        () => setRefreshTick((n) => n + 1))
      .on("postgres_changes", { event: "*", schema: "public", table: "visit_deposits" },
        () => setRefreshTick((n) => n + 1))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.id, session?.user_id, session?.block_id]);

  // Refresh quando sync termina (pending vira 0)
  const prevPendingRef = useRef(pending);
  useEffect(() => {
    if (prevPendingRef.current > 0 && pending === 0) setRefreshTick((n) => n + 1);
    prevPendingRef.current = pending;
  }, [pending]);

  // Refresh quando janela volta ao foco / online
  useEffect(() => {
    const onFocus = () => setRefreshTick((n) => n + 1);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    return () => { window.removeEventListener("focus", onFocus); window.removeEventListener("online", onFocus); };
  }, []);

  // ── Derived state ───────────────────────────────────────────────
  // BLOCK_PROGRESS_SOURCE_OF_TRUTH — progresso, visitados, pendentes e status
  // vêm exclusivamente do hook useBlockProgress. `visits`/`properties` só são
  // usados para mapa, filtros da lista, contagem de focos, larvicida, depósitos.
  const { progress: bp } = useBlockProgress({
    cycle_id: session?.cycle_id ?? null,
    block_number: session?.block_number ?? null,
    agent_id: session?.user_id ?? null,
    module: "OperationalPanel",
  });

  const total = bp?.total_properties ?? properties.length ?? session?.property_count ?? 0;
  const lastVisitByProp = useMemo(() => {
    const m = new Map<string, any>();
    for (const v of [...visits].sort((a, b) =>
      String(a.visit_date).localeCompare(String(b.visit_date)))) {
      if (v.property_id) m.set(v.property_id, v);
    }
    return m;
  }, [visits]);

  const stats = useMemo(() => {
    let focus = 0;
    for (const p of properties) {
      const v = lastVisitByProp.get(p.id);
      if (v?.has_focus) focus++;
    }
    const larvicida = visits.reduce((a, v) => a + (Number(v.treatment_amount) || 0), 0);
    const depositos = deposits.length;
    const pendenciasAbertas = pendencies.filter((p) => !p.resolved_at).length;
    const semGeo = properties.filter((p) => p.latitude == null || p.longitude == null).length;
    const visited = bp?.visited_properties ?? 0;
    const closed = bp?.closed_properties ?? 0;
    const refused = 0; // recusas contam como parte de "fechados operacionais" no block_progress
    const pendingCount = bp?.pending_properties ?? Math.max(0, total - visited - closed);
    return {
      visited,
      closed,
      refused,
      focus,
      done: visited + closed,
      pendingCount,
      larvicida, depositos, pendenciasAbertas, semGeo,
    };
  }, [properties, lastVisitByProp, visits, deposits, pendencies, total, bp]);

  const progress = bp?.completion_percentage ?? (total > 0 ? Math.round((stats.done / total) * 100) : 0);
  useEffect(() => { audit("OP_PANEL_PROGRESS", { progress, done: stats.done, total, bp_status: bp?.status ?? null }); }, [progress, stats.done, total, bp?.status]);

  const startedMs = session?.started_at ? new Date(session.started_at).getTime() : now;
  const durationMin = Math.max(0, Math.round((now - startedMs) / 60000));
  const avgMin = stats.done > 0 ? Math.round(durationMin / stats.done) : 0;

  const pendenciesByProp = useMemo(() => {
    const m = new Set<string>();
    pendencies.filter((p) => !p.resolved_at).forEach((p) => m.add(p.property_id));
    return m;
  }, [pendencies]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return properties.filter((p) => {
      const v = lastVisitByProp.get(p.id);
      const hasGeo = p.latitude != null && p.longitude != null;
      switch (filter) {
        case "pending": if (v) return false; break;
        case "visited": if (!v || v.status !== "visited") return false; break;
        case "closed": if (!v || v.status !== "closed") return false; break;
        case "refused": if (!v || v.status !== "refused") return false; break;
        case "focus": if (!v?.has_focus) return false; break;
        case "geo": if (!hasGeo) return false; break;
        case "nogeo": if (hasGeo) return false; break;
      }
      if (q) {
        const hay = `${p.number ?? ""} ${p.complement ?? ""} ${p.street_name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [properties, lastVisitByProp, filter, query]);

  const pendingList = useMemo(
    () => properties.filter((p) => !lastVisitByProp.get(p.id)),
    [properties, lastVisitByProp],
  );

  // ── Scroll restore ──────────────────────────────────────────────
  useEffect(() => {
    if (!properties.length) return;
    try {
      const y = Number(sessionStorage.getItem(scrollKey) || "0");
      if (y > 0 && scrollRef.current) {
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo(0, y);
          audit("OP_PANEL_SCROLL_RESTORE", { y });
        });
      }
    } catch {}
  }, [properties.length, scrollKey]);

  const onListScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const y = (e.target as HTMLDivElement).scrollTop;
    try { sessionStorage.setItem(scrollKey, String(y)); } catch {}
  }, [scrollKey]);

  const goToProperty = useCallback((id: string) => {
    try { sessionStorage.setItem(scrollKey, String(scrollRef.current?.scrollTop ?? 0)); } catch {}
    navigate({ to: `/property/${id}` });
  }, [navigate, scrollKey]);

  // ── Virtualização ──────────────────────────────────────────────
  const useVirtual = filtered.length > 60;
  const rowVirtualizer = useVirtualizer({
    count: useVirtual ? filtered.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 76,
    overscan: 8,
  });

  // ── Header helpers ──────────────────────────────────────────────
  const productionDate = session?.session_date
    ? format(new Date(`${session.session_date}T12:00:00`), "dd/MM/yyyy", { locale: ptBR })
    : "—";
  const openedDate = session?.started_at
    ? format(new Date(session.started_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
    : "—";
  const epi = session?.session_date
    ? getEpiWeek(new Date(`${session.session_date}T12:00:00`))
    : null;

  const statusBadge = session?.status === "closed"
    ? { label: "Finalizada", cls: "bg-blue-500/15 text-blue-300 border-blue-500/40" }
    : !online
      ? { label: "Offline", cls: "bg-amber-500/15 text-amber-300 border-amber-500/40" }
      : { label: "Em andamento", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" };

  const connBadge = !online
    ? { icon: CloudOff, label: "Offline", cls: "text-red-300", pill: "bg-red-500/15 text-red-300 border-red-500/40" }
    : syncing
      ? { icon: RefreshCw, label: "Sincronizando", cls: "text-amber-300 animate-spin", pill: "bg-amber-500/15 text-amber-300 border-amber-500/40" }
      : pending > 0
        ? { icon: Cloud, label: `${pending} pendentes`, cls: "text-amber-300", pill: "bg-amber-500/15 text-amber-300 border-amber-500/40" }
        : { icon: Cloud, label: "Online", cls: "text-emerald-300", pill: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" };

  const alerts: { icon: any; text: string; action?: () => void; actionLabel?: string }[] = [];
  if (stats.pendingCount > 0) alerts.push({ icon: AlertTriangle, text: `${stats.pendingCount} imóveis pendentes.` });
  if (pending > 0) alerts.push({ icon: CloudOff, text: `${pending} alterações aguardando sincronização.` });
  if (stats.semGeo > 0) alerts.push({
    icon: Navigation,
    text: `${stats.semGeo} imóveis sem georreferenciamento.`,
    action: () => setFilter("nogeo"),
    actionLabel: "Ver",
  });

  return (
    <div className="pb-28 -mx-4 -mt-4">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="bg-slate-950 text-white px-4 pt-4 pb-5 rounded-b-3xl shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={cn("border font-bold uppercase text-[9px] tracking-widest", statusBadge.cls)}>
                <Circle className="h-2 w-2 mr-1 fill-current" />
                {statusBadge.label}
              </Badge>
              <Badge className={cn("border font-bold uppercase text-[9px] tracking-widest", connBadge.pill)}>
                <connBadge.icon className={cn("h-3 w-3 mr-1", syncing && "animate-spin")} />
                {connBadge.label}
              </Badge>
              {session?.is_retroactive && (
                <Badge className="bg-amber-500/15 text-amber-300 border border-amber-500/40 text-[9px] uppercase tracking-widest">
                  Retroativa
                </Badge>
              )}
            </div>
            <h1 className="text-xl font-black mt-2 truncate">
              Quarteirão {session?.block_number ?? "—"}
            </h1>
            <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest truncate">
              {agent?.name || "Agente"} · {agent?.municipality || "—"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-4 text-[10px]">
          <MetaItem icon={Calendar} label="Data da produção" value={productionDate} accent />
          <MetaItem icon={Home} label="Imóveis" value={String(total)} />
          <MetaItem icon={FlaskConical} label="Ciclo" value={cycle?.number ? `Ciclo ${cycle.number}` : "—"} />
          <MetaItem icon={ClipboardList} label="Semana" value={week?.number ? `Semana ${week.number}/8` : (epi ? `SE ${epi.week}/${epi.year}` : "—")} />
        </div>

        {/* Ações rápidas */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          <QuickAction icon={Calendar} label="Alterar Data" onClick={() => navigate({ to: "/field-work-list" })} />
          <QuickAction icon={ClipboardList} label="Calendário" onClick={() => navigate({ to: "/calendario-producao" })} />
          <QuickAction icon={FileText} label="Minhas Jornadas" onClick={() => navigate({ to: "/minhas-jornadas" })} />
        </div>
      </div>

      {/* ── Alertas ─────────────────────────────────────────── */}
      {alerts.length > 0 && (
        <div className="px-4 mt-3 space-y-1.5">
          {alerts.map((a, i) => (
            <div key={i} className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-[11px] font-bold text-amber-800">
              <a.icon className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1">{a.text}</span>
              {a.action && (
                <button onClick={a.action} className="text-amber-900 underline underline-offset-2 text-[10px] uppercase tracking-widest">
                  {a.actionLabel}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      
      <div className="px-4 mt-4">
        <Card className="border-none shadow-lg rounded-3xl overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-end justify-between mb-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Progresso da Jornada</p>
                <p className="text-2xl font-black text-slate-900">{stats.done} / {total}</p>
              </div>
              <span className="text-3xl font-black text-blue-600">{progress}%</span>
            </div>
            <Progress value={progress} className="h-3" />
            <div className="grid grid-cols-3 gap-2 mt-3 text-center">
              <MiniStat label="Visitados" value={stats.visited} tone="emerald" />
              <MiniStat label="Pendentes" value={stats.pendingCount} tone="amber" />
              <MiniStat label="Concluído" value={`${progress}%`} tone="slate" small />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Filters + search ────────────────────────────────── */}
      <div className="px-4 mt-5 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar imóvel..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 h-11 rounded-2xl bg-white border-none shadow-sm text-sm"
          />
        </div>
        <ScrollArea className="w-full">
          <div className="flex gap-2 pb-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "px-3 h-8 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition",
                  filter === f.key
                    ? "bg-slate-900 text-white shadow"
                    : "bg-white text-slate-500 border border-slate-200"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* ── Property list ───────────────────────────────────── */}
      <div className="px-4 mt-3 space-y-2">
        <div className="flex items-center justify-between px-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            {filtered.length} de {total} imóveis
          </p>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-10 text-slate-400 font-bold text-sm">
            Nenhum imóvel encontrado.
          </div>
        ) : useVirtual ? (
          <div
            ref={scrollRef}
            onScroll={onListScroll}
            className="relative overflow-auto rounded-2xl"
            style={{ height: "60vh" }}
          >
            <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative", width: "100%" }}>
              {rowVirtualizer.getVirtualItems().map((vi) => {
                const p = filtered[vi.index];
                return (
                  <div
                    key={p.id}
                    style={{
                      position: "absolute",
                      top: 0, left: 0, right: 0,
                      transform: `translateY(${vi.start}px)`,
                      padding: "4px 0",
                    }}
                  >
                    <PropertyRow
                      p={p}
                      visit={lastVisitByProp.get(p.id)}
                      hasPend={pendenciesByProp.has(p.id)}
                      onOpen={() => goToProperty(p.id)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div ref={scrollRef} onScroll={onListScroll} className="space-y-2">
            {filtered.map((p) => (
              <PropertyRow
                key={p.id}
                p={p}
                visit={lastVisitByProp.get(p.id)}
                hasPend={pendenciesByProp.has(p.id)}
                onOpen={() => goToProperty(p.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Fixed bottom bar ────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-t border-slate-200 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
        <div className="max-w-3xl mx-auto grid grid-cols-5 gap-1 px-2 py-2">
          <BottomAction Icon={MapIcon} label="Mapa" onClick={() => setMapOpen(true)} />
          <BottomAction Icon={FileText} label="RG" onClick={() => navigate({ to: "/rg" })} />
          <BottomAction Icon={ChevronUp} label="Anterior" onClick={() => {
            const p = pendingList[0]; if (p) goToProperty(p.id);
          }} />
          <BottomAction Icon={ChevronDown} label="Próximo" onClick={() => {
            const p = pendingList[0]; if (p) goToProperty(p.id);
          }} />
          <BottomAction Icon={CheckCircle2} label="Finalizar" primary onClick={() => (onCloseSessionRoute ? onCloseSessionRoute() : navigate({ to: "/field-work-list" }))} />
        </div>
      </div>

      <BlockOperationalMap
        open={mapOpen}
        onOpenChange={setMapOpen}
        blockNumber={session?.block_number}
        properties={properties}
        visits={visits}
      />
    </div>
  );
}

// ── Property row (memoized) ───────────────────────────────────
const PropertyRow = memo(function PropertyRow({
  p, visit, hasPend, onOpen,
}: { p: any; visit: any; hasPend: boolean; onOpen: () => void }) {
  const hasGeo = p.latitude != null && p.longitude != null;
  const synced = !String(p.id).startsWith("tmp_");
  const statusInfo = statusChip(visit?.status, !!visit);
  return (
    <button
      onClick={onOpen}
      className="w-full bg-white rounded-2xl shadow-sm border border-slate-100 p-3 flex items-center gap-3 active:scale-[0.99] transition text-left min-h-[64px]"
    >
      <div className="h-11 w-11 rounded-xl bg-slate-100 grid place-items-center shrink-0">
        <span className="text-sm font-black text-slate-700">{p.number || "—"}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-black text-slate-800 truncate">
            {p.number}{p.sequence ? ` · seq ${p.sequence}` : ""}{p.complement ? ` · ${p.complement}` : ""}
          </p>
          <span className={cn("text-[9px] font-black uppercase px-1.5 py-0.5 rounded flex items-center gap-1", statusInfo.cls)}>
            <Circle className="h-1.5 w-1.5 fill-current" />
            {statusInfo.label}
          </span>
        </div>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest truncate">
          {typeLabel(p.type)}{p.street_name ? ` · ${p.street_name}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <IconPill Icon={Navigation} on={hasGeo} onColor="text-emerald-600" offColor="text-slate-300" title={hasGeo ? "Georreferenciado" : "Sem GPS"} />
        <IconPill Icon={Bug} on={!!visit?.has_focus} onColor="text-red-500" offColor="text-slate-200" title="Foco" />
        <IconPill Icon={Flag} on={hasPend} onColor="text-amber-600" offColor="text-slate-200" title="Pendência" />
        <IconPill Icon={synced ? Cloud : CloudOff} on={true} onColor={synced ? "text-emerald-500" : "text-amber-500"} offColor="text-slate-300" title={synced ? "Sincronizado" : "Aguardando sync"} />
        <ChevronRight className="h-4 w-4 text-slate-300" />
      </div>
    </button>
  );
});

// ── Small UI helpers ──────────────────────────────────────────
function MetaItem({ icon: Icon, label, value, accent }: any) {
  return (
    <div className={cn(
      "rounded-xl px-2.5 py-2 border",
      accent ? "bg-blue-500/10 border-blue-400/30" : "bg-white/5 border-white/10"
    )}>
      <div className="flex items-center gap-1 text-slate-400">
        <Icon className="h-3 w-3" />
        <span className="text-[9px] uppercase tracking-widest font-bold">{label}</span>
      </div>
      <p className={cn("text-xs font-black mt-0.5 truncate", accent ? "text-blue-100" : "text-white")}>{value}</p>
    </div>
  );
}

function MiniStat({ label, value, tone, small }: any) {
  const toneCls = tone === "emerald" ? "text-emerald-600"
    : tone === "amber" ? "text-amber-600"
      : "text-slate-700";
  return (
    <div className="bg-slate-50 rounded-xl py-2">
      <p className={cn("font-black", small ? "text-sm" : "text-lg", toneCls)}>{value}</p>
      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{label}</p>
    </div>
  );
}

function SumCard({ icon: Icon, label, value, color, small }: any) {
  return (
    <div className="bg-white rounded-2xl p-2.5 shadow-sm border border-slate-100">
      <Icon className={cn("h-4 w-4", color)} />
      <p className={cn("font-black mt-1", small ? "text-sm" : "text-lg", color)}>{value}</p>
      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-tight leading-tight">{label}</p>
    </div>
  );
}

function IconPill({ Icon, on, onColor, offColor, title }: any) {
  return (
    <span title={title} aria-label={title} className="grid place-items-center h-6 w-6">
      <Icon className={cn("h-3.5 w-3.5", on ? onColor : offColor)} />
    </span>
  );
}

function BottomAction({ Icon, label, onClick, primary }: any) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 py-2 rounded-xl transition active:scale-95 min-h-[52px]",
        primary ? "bg-emerald-600 text-white shadow-md" : "text-slate-700 hover:bg-slate-100"
      )}
    >
      <Icon className={cn("h-5 w-5", primary && "text-white")} />
      <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
    </button>
  );
}

function statusChip(status?: string | null, visited?: boolean) {
  if (!visited) return { label: "Pendente", cls: "bg-slate-100 text-slate-600" };
  switch (status) {
    case "visited": return { label: "Visitado", cls: "bg-emerald-100 text-emerald-700" };
    case "closed": return { label: "Fechado", cls: "bg-slate-200 text-slate-700" };
    case "refused": return { label: "Recusa", cls: "bg-red-100 text-red-700" };
    case "abandoned": return { label: "Abandonado", cls: "bg-amber-100 text-amber-700" };
    default: return { label: status || "—", cls: "bg-slate-100 text-slate-600" };
  }
}

function QuickAction({ icon: Icon, label, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center gap-1.5 rounded-xl bg-white/10 border border-white/15 py-2 text-[10px] font-black uppercase tracking-widest text-white active:scale-95 transition"
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function fmtDur(min: number) {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${m ? `${m}m` : ""}`;
}
