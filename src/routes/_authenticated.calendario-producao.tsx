import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { blockManagersGuard } from "@/lib/role-guards";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { safeGetUser } from "@/lib/offline/safe-auth";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  ChevronLeft, ChevronRight, CalendarDays, Loader2, Plus, Eye,
  Building2, MapPin, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { format, addMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, isAfter, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/calendario-producao")({
  beforeLoad: blockManagersGuard,
  component: ProductionCalendarPage,
});

type DayStatus = "future" | "none" | "partial" | "complete";

interface SessionLite {
  id: string;
  session_date: string;
  status: string;
  block_number: string | null;
  cycle_id: string | null;
  week_id: string | null;
}

interface DayAgg {
  date: string; // YYYY-MM-DD
  sessions: SessionLite[];
  totalProperties: number;
  visits: number;
  pending: number;
  positive: number;
  deposits: number;
  status: DayStatus;
}

function toKey(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function ProductionCalendarPage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [month, setMonth] = useState<Date>(startOfMonth(new Date()));
  const [loading, setLoading] = useState(false);
  const [dayMap, setDayMap] = useState<Record<string, DayAgg>>({});
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await safeGetUser();
      if (res.data.user?.id) setUserId(res.data.user.id);
    })();
  }, []);

  const gridDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });
    const days: Date[] = [];
    let cur = start;
    while (cur <= end) { days.push(cur); cur = addDays(cur, 1); }
    return days;
  }, [month]);

  useEffect(() => {
    if (!userId) return;
    const load = async () => {
      setLoading(true);
      try {
        const from = toKey(startOfMonth(month));
        const to = toKey(endOfMonth(month));
        console.log("[PRODUCTION_CALENDAR_LOAD]", { userId, from, to });

        const { data: sessions, error: sErr } = await supabase
          .from("field_work_sessions")
          .select("id, session_date, status, block_number, cycle_id, week_id")
          .eq("user_id", userId)
          .gte("session_date", from)
          .lte("session_date", to);
        if (sErr) throw sErr;

        const sessionList = (sessions ?? []) as SessionLite[];
        const sessionIds = sessionList.map((s) => s.id);

        // Visits for the month via session ids + date range fallback
        const { data: visits } = await supabase
          .from("visits")
          .select("id, property_id, status, has_focus, visit_date, field_work_session_id")
          .eq("agent_id", userId)
          .gte("visit_date", `${from}T00:00:00`)
          .lte("visit_date", `${to}T23:59:59`);

        const { data: deposits } = sessionIds.length
          ? await supabase.from("visit_deposits").select("id, visit_id").in("visit_id", (visits ?? []).map((v: any) => v.id))
          : { data: [] as any[] };

        const map: Record<string, DayAgg> = {};
        for (const s of sessionList) {
          const k = s.session_date;
          if (!map[k]) map[k] = emptyDay(k);
          map[k].sessions.push(s);
        }

        // Property counts per session (best-effort by block_number in the session)
        // Aggregate visits per day
        for (const v of (visits ?? []) as any[]) {
          const k = (v.visit_date as string).slice(0, 10);
          if (!map[k]) map[k] = emptyDay(k);
          map[k].visits += 1;
          if (v.has_focus) map[k].positive += 1;
          if (v.status === "closed" || v.status === "refused" || v.status === "abandoned") map[k].pending += 1;
        }

        const visitIdToDate: Record<string, string> = {};
        for (const v of (visits ?? []) as any[]) visitIdToDate[v.id] = (v.visit_date as string).slice(0, 10);
        for (const d of (deposits ?? []) as any[]) {
          const k = visitIdToDate[d.visit_id];
          if (!k) continue;
          if (!map[k]) map[k] = emptyDay(k);
          map[k].deposits += 1;
        }

        // Total properties from sessions' blocks
        const blockNumbers = Array.from(new Set(sessionList.map((s) => s.block_number).filter(Boolean))) as string[];
        let propsByBlock: Record<string, number> = {};
        if (blockNumbers.length) {
          const { data: props } = await supabase
            .from("properties")
            .select("block_number")
            .in("block_number", blockNumbers);
          for (const p of (props ?? []) as any[]) {
            propsByBlock[p.block_number] = (propsByBlock[p.block_number] ?? 0) + 1;
          }
        }
        for (const k of Object.keys(map)) {
          const total = map[k].sessions.reduce((acc, s) => acc + (s.block_number ? (propsByBlock[s.block_number] ?? 0) : 0), 0);
          map[k].totalProperties = total;
          const today = startOfDay(new Date());
          const dayDate = new Date(`${k}T00:00:00`);
          if (isAfter(dayDate, today)) map[k].status = "future";
          else if (total > 0 && map[k].visits >= total) map[k].status = "complete";
          else if (map[k].visits > 0 || map[k].sessions.length > 0) map[k].status = "partial";
          else map[k].status = "none";
        }

        setDayMap(map);
      } catch (e: any) {
        console.error("[PRODUCTION_CALENDAR_ERROR]", e);
        toast.error("Erro ao carregar calendário");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [userId, month]);

  const monthTotals = useMemo(() => {
    const acc = { total: 0, visits: 0, pending: 0, positive: 0, deposits: 0 };
    for (const k of Object.keys(dayMap)) {
      const d = dayMap[k];
      acc.total += d.totalProperties;
      acc.visits += d.visits;
      acc.pending += d.pending;
      acc.positive += d.positive;
      acc.deposits += d.deposits;
    }
    return acc;
  }, [dayMap]);

  const openDay = selectedDay ? dayMap[selectedDay] ?? emptyDay(selectedDay) : null;
  const today = startOfDay(new Date());

  return (
    <div className="container mx-auto p-4 space-y-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Calendário de Produção</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" onClick={() => setMonth(startOfMonth(new Date()))}>Hoje</Button>
          <Button variant="outline" size="icon" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg capitalize">{format(month, "MMMM 'de' yyyy", { locale: ptBR })}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>}
          <div className="grid grid-cols-7 gap-1 text-xs text-center text-muted-foreground mb-1">
            {["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map((d) => <div key={d} className="py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {gridDays.map((d) => {
              const k = toKey(d);
              const agg = dayMap[k];
              const inMonth = isSameMonth(d, month);
              const isFuture = isAfter(startOfDay(d), today);
              const status: DayStatus = agg?.status ?? (isFuture ? "future" : "none");
              const color =
                status === "complete" ? "bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-300" :
                status === "partial"  ? "bg-orange-500/15 border-orange-500 text-orange-700 dark:text-orange-300" :
                status === "future"   ? "bg-muted/30 border-border text-muted-foreground" :
                                        "bg-red-500/10 border-red-500/60 text-red-700 dark:text-red-300";
              return (
                <button
                  key={k}
                  onClick={() => setSelectedDay(k)}
                  className={`aspect-square rounded-md border p-1 text-left transition hover:brightness-110 ${inMonth ? "" : "opacity-40"} ${color}`}
                >
                  <div className="flex items-start justify-between">
                    <span className={`text-sm font-semibold ${isSameDay(d, new Date()) ? "underline" : ""}`}>{format(d, "d")}</span>
                    {agg?.sessions.length ? <span className="text-[10px] font-medium">{agg.sessions.length}j</span> : null}
                  </div>
                  {agg && agg.visits > 0 && (
                    <div className="text-[10px] mt-1 leading-tight">
                      {agg.visits}/{agg.totalProperties || "?"}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <StatCard label="Imóveis" value={monthTotals.total} icon={<Building2 className="h-4 w-4" />} />
        <StatCard label="Visitas" value={monthTotals.visits} icon={<CheckCircle2 className="h-4 w-4" />} />
        <StatCard label="Pendências" value={monthTotals.pending} icon={<AlertTriangle className="h-4 w-4" />} />
        <StatCard label="Focos" value={monthTotals.positive} icon={<MapPin className="h-4 w-4" />} />
        <StatCard label="Depósitos" value={monthTotals.deposits} icon={<Building2 className="h-4 w-4" />} />
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <LegendDot className="bg-emerald-500" label="Concluída" />
        <LegendDot className="bg-orange-500" label="Parcial" />
        <LegendDot className="bg-red-500" label="Sem produção" />
        <LegendDot className="bg-muted-foreground" label="Futuro" />
      </div>

      <Dialog open={!!selectedDay} onOpenChange={(o) => !o && setSelectedDay(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedDay && format(new Date(`${selectedDay}T00:00:00`), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</DialogTitle>
            <DialogDescription>Resumo de produção do dia</DialogDescription>
          </DialogHeader>
          {openDay && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <Info label="Jornadas" value={openDay.sessions.length} />
                <Info label="Quarteirões" value={new Set(openDay.sessions.map((s) => s.block_number).filter(Boolean)).size} />
                <Info label="Imóveis" value={openDay.totalProperties} />
                <Info label="Visitas" value={openDay.visits} />
                <Info label="Pendências" value={openDay.pending} />
                <Info label="Focos" value={openDay.positive} />
                <Info label="Depósitos" value={openDay.deposits} />
                <Info label="Produtividade" value={openDay.totalProperties ? `${Math.round((openDay.visits / openDay.totalProperties) * 100)}%` : "—"} />
              </div>
              {openDay.sessions.length > 0 && (
                <div className="space-y-1">
                  {openDay.sessions.map((s) => (
                    <div key={s.id} className="flex items-center justify-between rounded border p-2 text-sm">
                      <span>Quarteirão {s.block_number ?? "—"}</span>
                      <Badge variant={s.status === "in_progress" ? "default" : "secondary"}>{s.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {openDay && openDay.sessions.length === 0 && (
              <Button onClick={() => navigate({ to: "/field-work" })}>
                <Plus className="h-4 w-4 mr-1" /> Criar Jornada nesta Data
              </Button>
            )}
            {openDay && openDay.sessions.length > 0 && (
              <Button variant="outline" onClick={() => navigate({ to: "/minhas-jornadas" })}>
                <Eye className="h-4 w-4 mr-1" /> Ver Jornadas
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function emptyDay(date: string): DayAgg {
  return { date, sessions: [], totalProperties: 0, visits: 0, pending: 0, positive: 0, deposits: 0, status: "none" };
}

function StatCard({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
  return (
    <Card><CardContent className="p-3">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">{icon}{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </CardContent></Card>
  );
}

function Info({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded border p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return <div className="flex items-center gap-1"><span className={`h-3 w-3 rounded-full ${className}`} />{label}</div>;
}
