import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  MapPin, Calendar, Clock, Home, CheckCircle2, XCircle, DoorClosed,
  AlertTriangle, Bug, FlaskConical, Droplets, Search, Map as MapIcon,
  FileText, ClipboardList, Plus, Flag, RefreshCw, Cloud, CloudOff,
  Navigation, ChevronRight, Circle
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { listRemoteOrCache } from "@/lib/offline/repos";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getEpiWeek } from "@/lib/cycle-week";

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

function typeLabel(t?: string | null) {
  const map: Record<string, string> = {
    R: "Residência", C: "Comércio", TB: "Terreno Baldio",
    PE: "Ponto Estratégico", O: "Outro", V: "Vago",
  };
  if (!t) return "—";
  return map[t] || t;
}

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
  const [deposits, setDeposits] = useState<any[]>([]);
  const [pendencies, setPendencies] = useState<any[]>([]);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    (async () => {
      if (!session?.user_id) return;

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
        setProperties(props || []);

        const propIds = (props || []).map((p: any) => p.id);
        if (propIds.length) {
          const { data: pend } = await supabase.from("property_pendencies")
            .select("property_id, current_status, resolved_at")
            .in("property_id", propIds);
          setPendencies(pend || []);
        }
      }

      const dayStart = `${session.session_date}T00:00:00`;
      const dayEnd = `${session.session_date}T23:59:59.999`;
      const vsRes = await supabase.from("visits")
        .select("id, property_id, status, has_focus, treatment_amount, visit_date")
        .eq("agent_id", session.user_id)
        .gte("visit_date", dayStart).lte("visit_date", dayEnd);
      const vs = vsRes.data || [];
      setVisits(vs);

      if (vs.length) {
        const { data: deps } = await supabase.from("visit_deposits")
          .select("id, visit_id, type_code, quantity, is_positive")
          .in("visit_id", vs.map((v: any) => v.id));
        setDeposits(deps || []);
      }
    })();
  }, [session?.id, session?.block_id, session?.session_date, session?.user_id]);

  // ── Derived state ───────────────────────────────────────────────
  const total = properties.length || session?.property_count || 0;
  const lastVisitByProp = useMemo(() => {
    const m = new Map<string, any>();
    for (const v of [...visits].sort((a, b) =>
      String(a.visit_date).localeCompare(String(b.visit_date)))) {
      if (v.property_id) m.set(v.property_id, v);
    }
    return m;
  }, [visits]);

  const stats = useMemo(() => {
    let visited = 0, closed = 0, refused = 0, focus = 0;
    for (const p of properties) {
      const v = lastVisitByProp.get(p.id);
      if (!v) continue;
      if (v.status === "visited") visited++;
      else if (v.status === "closed") closed++;
      else if (v.status === "refused") refused++;
      if (v.has_focus) focus++;
    }
    const done = visited + closed + refused;
    const pendingCount = Math.max(0, total - done);
    const larvicida = visits.reduce((a, v) => a + (Number(v.treatment_amount) || 0), 0);
    const depositos = deposits.length;
    const pendenciasAbertas = pendencies.filter((p) => !p.resolved_at).length;
    return { visited, closed, refused, focus, done, pendingCount, larvicida, depositos, pendenciasAbertas };
  }, [properties, lastVisitByProp, visits, deposits, pendencies, total]);

  const progress = total > 0 ? Math.round((stats.done / total) * 100) : 0;
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
    ? { icon: CloudOff, label: "Offline", cls: "text-red-300" }
    : syncing
      ? { icon: RefreshCw, label: "Sincronizando", cls: "text-amber-300 animate-spin" }
      : pending > 0
        ? { icon: Cloud, label: `${pending} pend.`, cls: "text-amber-300" }
        : { icon: Cloud, label: "Online", cls: "text-emerald-300" };

  return (
    <div className="pb-28 -mx-4 -mt-4">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="bg-slate-950 text-white px-4 pt-4 pb-5 rounded-b-3xl shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge className={cn("border font-bold uppercase text-[9px] tracking-widest", statusBadge.cls)}>
                <Circle className="h-2 w-2 mr-1 fill-current" />
                {statusBadge.label}
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
          <div className={cn("flex flex-col items-end gap-1 text-[10px] font-bold", connBadge.cls)}>
            <connBadge.icon className="h-4 w-4" />
            <span className="uppercase tracking-widest">{connBadge.label}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-4 text-[10px]">
          <MetaItem icon={Calendar} label="Data da produção" value={productionDate} accent />
          <MetaItem icon={Clock} label="Abertura" value={openedDate} />
          <MetaItem icon={FlaskConical} label="Ciclo" value={cycle?.number ? `Ciclo ${cycle.number}` : "—"} />
          <MetaItem icon={ClipboardList} label="Semana" value={week?.number ? `Semana ${week.number}/8` : (epi ? `SE ${epi.week}/${epi.year}` : "—")} />
          <MetaItem icon={Home} label="Imóveis" value={String(total)} />
          <MetaItem icon={MapPin} label="Localidade" value={session?.street_name || "—"} />
        </div>
      </div>

      {/* ── Progress card ───────────────────────────────────── */}
      <div className="px-4 mt-4">
        <Card className="border-none shadow-lg rounded-3xl overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-end justify-between mb-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Progresso da Jornada</p>
                <p className="text-2xl font-black text-slate-900">{stats.done} / {total}</p>
              </div>
              <span className="text-3xl font-black text-blue-600">{progress}%</span>
            </div>
            <Progress value={progress} className="h-3" />
            <div className="grid grid-cols-4 gap-2 mt-4 text-center">
              <MiniStat label="Visitados" value={stats.visited} tone="emerald" />
              <MiniStat label="Pendentes" value={stats.pendingCount} tone="amber" />
              <MiniStat label="Tempo" value={fmtDur(durationMin)} tone="slate" small />
              <MiniStat label="Média/im." value={stats.done ? `${avgMin}m` : "—"} tone="slate" small />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Summary cards ───────────────────────────────────── */}
      <div className="px-4 mt-4 grid grid-cols-4 gap-2">
        <SumCard icon={Home} label="Imóveis" value={total} color="text-slate-700" />
        <SumCard icon={CheckCircle2} label="Visitados" value={stats.visited} color="text-emerald-600" />
        <SumCard icon={AlertTriangle} label="Pendentes" value={stats.pendingCount} color="text-amber-600" />
        <SumCard icon={DoorClosed} label="Fechados" value={stats.closed} color="text-slate-600" />
        <SumCard icon={XCircle} label="Recusas" value={stats.refused} color="text-red-600" />
        <SumCard icon={Bug} label="Focos" value={stats.focus} color="text-red-500" />
        <SumCard icon={FlaskConical} label="Depósitos" value={stats.depositos} color="text-purple-600" />
        <SumCard icon={Droplets} label="Larvicida" value={`${stats.larvicida}g`} color="text-blue-600" small />
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
        ) : (
          filtered.map((p) => {
            const v = lastVisitByProp.get(p.id);
            const hasGeo = p.latitude != null && p.longitude != null;
            const hasPend = pendenciesByProp.has(p.id);
            const synced = !String(p.id).startsWith("tmp_");
            const statusInfo = statusChip(v?.status, !!v);
            return (
              <button
                key={p.id}
                onClick={() => navigate({ to: `/property/${p.id}` })}
                className="w-full bg-white rounded-2xl shadow-sm border border-slate-100 p-3 flex items-center gap-3 active:scale-[0.99] transition text-left"
              >
                <div className="h-11 w-11 rounded-xl bg-slate-100 grid place-items-center shrink-0">
                  <span className="text-sm font-black text-slate-700">{p.number || "—"}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-black text-slate-800 truncate">
                      {p.number} {p.complement ? `· ${p.complement}` : ""}
                    </p>
                    <span className={cn("text-[9px] font-black uppercase px-1.5 py-0.5 rounded", statusInfo.cls)}>
                      {statusInfo.label}
                    </span>
                  </div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest truncate">
                    {typeLabel(p.type)} {p.street_name ? `· ${p.street_name}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <IconPill Icon={Navigation} on={hasGeo} onColor="text-emerald-600" offColor="text-slate-300" title={hasGeo ? "Georreferenciado" : "Sem GPS"} />
                  <IconPill Icon={Bug} on={!!v?.has_focus} onColor="text-red-500" offColor="text-slate-200" title="Foco" />
                  <IconPill Icon={Flag} on={hasPend} onColor="text-amber-600" offColor="text-slate-200" title="Pendência" />
                  <IconPill Icon={synced ? Cloud : CloudOff} on={true} onColor={synced ? "text-emerald-500" : "text-amber-500"} offColor="text-slate-300" title={synced ? "Sincronizado" : "Aguardando sync"} />
                  <ChevronRight className="h-4 w-4 text-slate-300" />
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* ── Fixed bottom bar ────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-t border-slate-200 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
        <div className="max-w-3xl mx-auto grid grid-cols-5 gap-1 px-2 py-2">
          <BottomAction Icon={MapIcon} label="Mapa" onClick={() => navigate({ to: "/map" })} />
          <BottomAction Icon={ClipboardList} label="Resumo" onClick={() => navigate({ to: "/field-work-list" })} />
          <BottomAction Icon={FileText} label="RG" onClick={() => navigate({ to: "/rg" })} />
          <BottomAction Icon={Plus} label="Add. Imóvel" onClick={() => navigate({ to: "/field-work-list" })} />
          <BottomAction Icon={CheckCircle2} label="Finalizar" primary onClick={() => (onCloseSessionRoute ? onCloseSessionRoute() : navigate({ to: "/field-work-list" }))} />
        </div>
      </div>
    </div>
  );
}

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
    <span title={title} className="grid place-items-center h-6 w-6">
      <Icon className={cn("h-3.5 w-3.5", on ? onColor : offColor)} />
    </span>
  );
}

function BottomAction({ Icon, label, onClick, primary }: any) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 py-2 rounded-xl transition active:scale-95",
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

function fmtDur(min: number) {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${m ? `${m}m` : ""}`;
}
