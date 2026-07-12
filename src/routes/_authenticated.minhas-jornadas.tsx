import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { blockManagersGuard } from "@/lib/role-guards";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { safeGetUser } from "@/lib/offline/safe-auth";
import { isOnline } from "@/lib/offline/safe-fetch";
import { updateOffline } from "@/lib/offline/repos";
import { db } from "@/lib/offline/db";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarDays, Play, StopCircle, Eye, Trash2, RefreshCcw, Loader2,
  MapPin, Building2, AlertTriangle, CheckCircle2, Layers, Clock,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/minhas-jornadas")({
  beforeLoad: blockManagersGuard,
  component: MySessionsPage,
});

type Filter = "hoje" | "5dias" | "in_progress" | "closed" | "todos";

interface SessionRow {
  id: string;
  user_id: string;
  session_date: string;
  status: string;
  block_number: string | null;
  block_id: string | null;
  property_count: number | null;
  street_name: string | null;
  cycle_id: string | null;
  week_id: string | null;
  started_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  _synced?: boolean;
  _lastError?: string | null;
  cycle_number?: number | null;
  week_number?: number | null;
  stats?: SessionStats;
}

interface SessionStats {
  total: number;
  visited: number;
  closed: number;
  refused: number;
  pending: number;
  positive: number;
  deposits: number;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function daysAgoISO(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function MySessionsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("todos");
  const [summaryOf, setSummaryOf] = useState<SessionRow | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function load() {
    setLoading(true);
    console.log("[MY_SESSIONS_LOAD]", { started: true });
    try {
      const { data: { user } } = await safeGetUser();
      if (!user) { toast.error("Sessão expirada."); return; }

      let remote: SessionRow[] = [];
      if (isOnline()) {
        const { data, error } = await supabase
          .from("field_work_sessions")
          .select("id, user_id, session_date, status, block_number, block_id, property_count, street_name, cycle_id, week_id, started_at, created_at, updated_at")
          .eq("user_id", user.id)
          .order("session_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) console.warn("[MY_SESSIONS_LOAD] remote error", error);
        remote = (data as any) || [];
      }

      // Offline fallback / merge from Dexie
      let localRows: SessionRow[] = [];
      try {
        const local = await db.table("field_work_sessions").toArray();
        localRows = (local || []).filter((r: any) => r.user_id === user.id);
      } catch (e) {
        console.warn("[MY_SESSIONS_LOAD] dexie error", e);
      }

      const map = new Map<string, SessionRow>();
      remote.forEach((r) => map.set(r.id, { ...r, _synced: true }));
      localRows.forEach((r: any) => {
        const prev = map.get(r.id);
        map.set(r.id, {
          ...(prev || r),
          ...r,
          _synced: prev ? true : Boolean(r._synced),
          _lastError: r._lastError ?? null,
        });
      });
      const all = Array.from(map.values());

      // Enrich with cycle/week numbers
      const cycleIds = Array.from(new Set(all.map((r) => r.cycle_id).filter(Boolean))) as string[];
      const weekIds = Array.from(new Set(all.map((r) => r.week_id).filter(Boolean))) as string[];
      const cycleMap = new Map<string, number>();
      const weekMap = new Map<string, number>();
      if (isOnline() && cycleIds.length) {
        const { data } = await supabase.from("cycles").select("id, number").in("id", cycleIds);
        (data || []).forEach((c: any) => cycleMap.set(c.id, c.number));
      }
      if (isOnline() && weekIds.length) {
        const { data } = await supabase.from("weeks").select("id, number").in("id", weekIds);
        (data || []).forEach((w: any) => weekMap.set(w.id, w.number));
      }

      const enriched = all.map((r) => ({
        ...r,
        cycle_number: r.cycle_id ? cycleMap.get(r.cycle_id) ?? null : null,
        week_number: r.week_id ? weekMap.get(r.week_id) ?? null : null,
      }));

      // Load stats per session (visits)
      if (isOnline() && enriched.length) {
        const ids = enriched.map((r) => r.id);
        const { data: visits } = await supabase
          .from("visits")
          .select("id, field_work_session_id, status, has_focus, property_id")
          .in("field_work_session_id", ids);
        const visitIds = (visits || []).map((v: any) => v.id);
        const depMap = new Map<string, number>();
        if (visitIds.length) {
          const { data: deps } = await supabase
            .from("visit_deposits")
            .select("id, visit_id")
            .in("visit_id", visitIds);
          const visitToSession = new Map<string, string>();
          (visits || []).forEach((v: any) => visitToSession.set(v.id, v.field_work_session_id));
          (deps || []).forEach((d: any) => {
            const sId = visitToSession.get(d.visit_id);
            if (!sId) return;
            depMap.set(sId, (depMap.get(sId) || 0) + 1);
          });
        }
        const groups = new Map<string, any[]>();
        (visits || []).forEach((v: any) => {
          const list = groups.get(v.field_work_session_id) || [];
          list.push(v);
          groups.set(v.field_work_session_id, list);
        });
        enriched.forEach((r) => {
          const vs = groups.get(r.id) || [];
          const propIds = Array.from(new Set(vs.map((v: any) => v.property_id).filter(Boolean)));
          const canonical = getOperationalBlockStatus({
            propertyIds: propIds,
            visits: vs as any[],
            fallbackTotal: r.property_count || 0,
          });
          logBlockStatusShared(
            {
              module: "MinhasJornadas",
              productionDate: r.session_date,
              blockId: r.block_id,
              blockNumber: r.block_number,
              sessionId: r.id,
            },
            canonical,
          );
          const positive = vs.reduce((a: number, v: any) => a + (v.has_focus ? 1 : 0), 0);
          r.stats = {
            total: canonical.totalProperties,
            visited: canonical.visitedProperties,
            closed: canonical.closedProperties,
            refused: canonical.refusedProperties,
            pending: canonical.pendingProperties,
            positive,
            deposits: depMap.get(r.id) || 0,
          };
        });
      }

      enriched.sort((a, b) => {
        // in_progress first
        const ap = a.status === "in_progress" ? 0 : 1;
        const bp = b.status === "in_progress" ? 0 : 1;
        if (ap !== bp) return ap - bp;
        // then by session_date desc
        if (a.session_date !== b.session_date) return a.session_date < b.session_date ? 1 : -1;
        // then by created_at desc
        return (b.created_at || "").localeCompare(a.created_at || "");
      });

      setRows(enriched);
      console.log("[MY_SESSIONS_LOAD]", { count: enriched.length });
    } catch (e: any) {
      console.warn("[MY_SESSIONS_LOAD] erro", e);
      toast.error("Erro ao carregar jornadas: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const today = todayISO();
    const cutoff = daysAgoISO(5);
    return rows.filter((r) => {
      switch (filter) {
        case "hoje": return r.session_date === today;
        case "5dias": return r.session_date >= cutoff;
        case "in_progress": return r.status === "in_progress";
        case "closed": return r.status === "closed";
        default: return true;
      }
    });
  }, [rows, filter]);

  async function handleContinue(r: SessionRow) {
    console.log("[MY_SESSIONS_CONTINUE]", { id: r.id, date: r.session_date });
    navigate({ to: "/field-work-list", search: { restore: r.id, ts: Date.now() } as any });
  }

  async function handleClose(r: SessionRow) {
    if (!confirm(`Encerrar a jornada de ${format(new Date(`${r.session_date}T12:00:00`), "dd/MM/yyyy")}?`)) return;
    setWorking(r.id);
    console.log("[MY_SESSIONS_CLOSE]", { id: r.id });
    try {
      if (isOnline()) {
        try { await supabase.rpc("recover_session_visits" as any, { _session_id: r.id }); } catch {}
      }
      await updateOffline("field_work_sessions", r.id, {
        status: "closed",
        updated_at: new Date().toISOString(),
      });
      toast.success("Jornada encerrada.");
      await load();
    } catch (e: any) {
      toast.error("Falha ao encerrar: " + (e?.message || e));
    } finally {
      setWorking(null);
    }
  }

  async function handleDelete(r: SessionRow) {
    if ((r.stats?.visited || 0) + (r.stats?.closed || 0) + (r.stats?.refused || 0) > 0) {
      toast.error("Não é possível excluir jornada com visitas registradas.");
      return;
    }
    if (!confirm("Excluir esta jornada?")) return;
    setWorking(r.id);
    console.log("[MY_SESSIONS_DELETE]", { id: r.id });
    try {
      if (isOnline()) {
        const { error } = await supabase.from("field_work_sessions").delete().eq("id", r.id);
        if (error) throw error;
      }
      try { await db.table("field_work_sessions").delete(r.id); } catch {}
      toast.success("Jornada excluída.");
      await load();
    } catch (e: any) {
      toast.error("Falha ao excluir: " + (e?.message || e));
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-emerald-600" />
            Minhas Jornadas
          </h1>
          <p className="text-sm text-slate-500">Todas as suas jornadas organizadas em um só lugar.</p>
        </div>
        <div className="flex gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <SelectTrigger className="w-[180px] rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="hoje">Hoje</SelectItem>
              <SelectItem value="5dias">Últimos 5 dias</SelectItem>
              <SelectItem value="in_progress">Em andamento</SelectItem>
              <SelectItem value="closed">Finalizadas</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={load} disabled={loading} className="rounded-xl">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {loading && rows.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
          Carregando jornadas...
        </div>
      ) : filtered.length === 0 ? (
        <Card className="rounded-3xl border-dashed">
          <CardContent className="py-12 text-center text-slate-500">
            <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-50" />
            Nenhuma jornada encontrada para o filtro selecionado.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => <SessionCard
            key={r.id}
            row={r}
            working={working === r.id}
            onContinue={() => handleContinue(r)}
            onClose={() => handleClose(r)}
            onSummary={() => setSummaryOf(r)}
            onDelete={() => handleDelete(r)}
          />)}
        </div>
      )}

      <SummaryDialog row={summaryOf} onClose={() => setSummaryOf(null)} />
    </div>
  );
}

function StatusBadge({ status, synced, error }: { status: string; synced?: boolean; error?: string | null }) {
  if (error) {
    return <Badge className="bg-red-100 text-red-700 border border-red-200 rounded-full">🔴 Erro</Badge>;
  }
  if (synced === false) {
    return <Badge className="bg-orange-100 text-orange-700 border border-orange-200 rounded-full">🟠 Sem sincronizar</Badge>;
  }
  if (status === "in_progress") {
    return <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-full">🟢 Em andamento</Badge>;
  }
  if (status === "closed") {
    return <Badge className="bg-blue-100 text-blue-700 border border-blue-200 rounded-full">🔵 Finalizada</Badge>;
  }
  return <Badge variant="outline" className="rounded-full">{status}</Badge>;
}

function SessionCard({
  row, working, onContinue, onClose, onSummary, onDelete,
}: {
  row: SessionRow;
  working: boolean;
  onContinue: () => void;
  onClose: () => void;
  onSummary: () => void;
  onDelete: () => void;
}) {
  const dateBR = format(new Date(`${row.session_date}T12:00:00`), "dd/MM/yyyy (EEEE)", { locale: ptBR });
  const startedBR = row.started_at
    ? format(new Date(row.started_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
    : row.created_at
      ? format(new Date(row.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
      : "—";
  const updatedBR = row.updated_at
    ? format(new Date(row.updated_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
    : "—";
  const isInProgress = row.status === "in_progress";
  const hasVisits = (row.stats?.visited || 0) + (row.stats?.closed || 0) + (row.stats?.refused || 0) > 0;

  return (
    <Card className="rounded-3xl shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base font-black text-slate-900 flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-emerald-600" />
              Data da Produção: {dateBR}
            </CardTitle>
            <p className="text-xs text-slate-500 mt-1">
              Jornada iniciada em {startedBR} • Atualizada em {updatedBR}
            </p>
          </div>
          <StatusBadge status={row.status} synced={row._synced} error={row._lastError} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <Chip icon={Layers} label="Ciclo" value={row.cycle_number ? `Ciclo ${row.cycle_number}` : "—"} />
          <Chip icon={Clock} label="Semana" value={row.week_number ? `Semana ${row.week_number}/8` : "—"} />
          <Chip icon={MapPin} label="Quarteirão" value={row.block_number || "—"} />
          <Chip icon={Building2} label="Imóveis" value={String(row.property_count ?? "—")} />
        </div>

        {row.stats && (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs">
            <Stat label="Visitados" value={row.stats.visited} tone="emerald" />
            <Stat label="Pendentes" value={row.stats.pending} tone="slate" />
            <Stat label="Fechados" value={row.stats.closed} tone="amber" />
            <Stat label="Recusas" value={row.stats.refused} tone="red" />
            <Stat label="Focos" value={row.stats.positive} tone="pink" />
            <Stat label="Depósitos" value={row.stats.deposits} tone="blue" />
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {isInProgress && (
            <>
              <Button size="sm" onClick={onContinue} disabled={working} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl">
                <Play className="h-3.5 w-3.5 mr-1" /> Continuar
              </Button>
              <Button size="sm" variant="outline" onClick={onClose} disabled={working} className="border-red-300 text-red-700 hover:bg-red-50 rounded-xl">
                {working ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <StopCircle className="h-3.5 w-3.5 mr-1" />}
                Encerrar
              </Button>
            </>
          )}
          <Button size="sm" variant="outline" onClick={onSummary} className="rounded-xl">
            <Eye className="h-3.5 w-3.5 mr-1" /> Resumo
          </Button>
          {!hasVisits && (
            <Button size="sm" variant="ghost" onClick={onDelete} disabled={working} className="text-red-600 hover:bg-red-50 rounded-xl">
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Chip({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
      <Icon className="h-3.5 w-3.5 text-slate-500" />
      <div>
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</p>
        <p className="text-xs font-black text-slate-800 leading-tight">{value}</p>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "emerald" | "slate" | "amber" | "red" | "pink" | "blue" }) {
  const tones: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700",
    slate: "bg-slate-50 text-slate-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
    pink: "bg-pink-50 text-pink-700",
    blue: "bg-blue-50 text-blue-700",
  };
  return (
    <div className={`rounded-xl px-2 py-2 ${tones[tone]}`}>
      <p className="text-[9px] font-black uppercase tracking-widest opacity-70">{label}</p>
      <p className="text-base font-black leading-tight">{value}</p>
    </div>
  );
}

function SummaryDialog({ row, onClose }: { row: SessionRow | null; onClose: () => void }) {
  return (
    <Dialog open={!!row} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg rounded-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            Resumo da jornada
          </DialogTitle>
          <DialogDescription>
            {row && `Data da Produção: ${format(new Date(`${row.session_date}T12:00:00`), "dd/MM/yyyy", { locale: ptBR })}`}
          </DialogDescription>
        </DialogHeader>
        {row && (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Info label="Ciclo" value={row.cycle_number ? `Ciclo ${row.cycle_number}` : "—"} />
            <Info label="Semana" value={row.week_number ? `Semana ${row.week_number}/8` : "—"} />
            <Info label="Quarteirão" value={row.block_number || "—"} />
            <Info label="Total de imóveis" value={String(row.property_count ?? 0)} />
            <Info label="Visitados" value={String(row.stats?.visited ?? 0)} />
            <Info label="Pendentes" value={String(row.stats?.pending ?? 0)} />
            <Info label="Fechados" value={String(row.stats?.closed ?? 0)} />
            <Info label="Recusas" value={String(row.stats?.refused ?? 0)} />
            <Info label="Focos (+)" value={String(row.stats?.positive ?? 0)} />
            <Info label="Depósitos" value={String(row.stats?.deposits ?? 0)} />
          </div>
        )}
        <DialogFooter>
          <Button onClick={onClose} className="w-full rounded-2xl">Fechar</Button>
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
