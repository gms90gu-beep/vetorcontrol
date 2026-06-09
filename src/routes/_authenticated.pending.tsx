import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { safeGetUser } from "@/lib/offline/safe-auth";
import { listRemoteOrCache } from "@/lib/offline/repos";
import { useAuth } from "@/hooks/useAuth";
import {
  AlertTriangle,
  Home,
  MapPin,
  Calendar,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Ban,
  Building2,
  Hammer,
  Search,
  Loader2,
  FileText,
  FileSpreadsheet,
  History,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/pending")({
  component: PendingPage,
});

type RecoveryResult =
  | "closed"
  | "refused"
  | "absent"
  | "not_located"
  | "not_done"
  | "visited"
  | "unoccupied"
  | "demolished";

type Pendency = {
  id: string;
  property_id: string;
  agent_id: string;
  current_status: RecoveryResult;
  reason: string | null;
  attempt_count: number;
  last_attempt_at: string | null;
  resolved_at: string | null;
  resolved_status: RecoveryResult | null;
  created_at: string;
};

type PropertyRow = {
  id: string;
  number: string | null;
  street_name: string | null;
  block_number: string | null;
  neighborhood: string | null;
  latitude: number | null;
  longitude: number | null;
};

type Attempt = {
  id: string;
  attempt_number: number;
  result: RecoveryResult;
  notes: string | null;
  attempted_at: string;
  agent_id: string;
};

type EnrichedPendency = Pendency & {
  property?: PropertyRow;
  agent_name?: string;
};

const STATUS_META: Record<RecoveryResult, { label: string; color: string; icon: any }> = {
  closed: { label: "Fechado", color: "bg-amber-100 text-amber-700 border-amber-300", icon: Home },
  refused: { label: "Recusado", color: "bg-red-100 text-red-700 border-red-300", icon: XCircle },
  absent: { label: "Ausente", color: "bg-slate-100 text-slate-700 border-slate-300", icon: Ban },
  not_located: { label: "Não localizado", color: "bg-purple-100 text-purple-700 border-purple-300", icon: Search },
  not_done: { label: "Não realizada", color: "bg-zinc-100 text-zinc-700 border-zinc-300", icon: AlertTriangle },
  visited: { label: "Recuperado", color: "bg-emerald-100 text-emerald-700 border-emerald-300", icon: CheckCircle2 },
  unoccupied: { label: "Desocupado", color: "bg-blue-100 text-blue-700 border-blue-300", icon: Building2 },
  demolished: { label: "Demolido", color: "bg-stone-100 text-stone-700 border-stone-300", icon: Hammer },
};

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function StatusBadge({ status }: { status: RecoveryResult }) {
  const m = STATUS_META[status];
  const Icon = m.icon;
  return (
    <Badge variant="outline" className={`gap-1 font-bold uppercase text-[10px] tracking-wider ${m.color}`}>
      <Icon className="h-3 w-3" />
      {m.label}
    </Badge>
  );
}

function PendingPage() {
  const { user, role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pendencies, setPendencies] = useState<EnrichedPendency[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<EnrichedPendency | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [attemptDialogOpen, setAttemptDialogOpen] = useState(false);

  useEffect(() => {
    document.title = "Pendências — VetorControl";
  }, []);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const pends = await listRemoteOrCache<any>({
        name: "property_pendencies",
        remote: () =>
          (supabase as any)
            .from("property_pendencies")
            .select("*")
            .order("last_attempt_at", { ascending: false }),
      });

      const sorted = [...(pends || [])].sort((a, b) => {
        const ta = a.last_attempt_at ? new Date(a.last_attempt_at).getTime() : 0;
        const tb = b.last_attempt_at ? new Date(b.last_attempt_at).getTime() : 0;
        return tb - ta;
      });

      const propIds = sorted.map((p: any) => p.property_id);
      const agentIds = Array.from(new Set(sorted.map((p: any) => p.agent_id)));

      const [props, profs] = await Promise.all([
        propIds.length
          ? listRemoteOrCache<any>({
              name: "properties",
              remote: () =>
                supabase
                  .from("properties")
                  .select("id, number, street_name, block_number, neighborhood, latitude, longitude")
                  .in("id", propIds) as any,
              filter: (p) => propIds.includes(p.id),
            })
          : Promise.resolve([] as any[]),
        agentIds.length
          ? listRemoteOrCache<any>({
              name: "profiles",
              remote: () =>
                supabase
                  .from("profiles")
                  .select("id, full_name")
                  .in("id", agentIds as string[]) as any,
              filter: (p) => (agentIds as string[]).includes(p.id),
            })
          : Promise.resolve([] as any[]),
      ]);

      const propMap = new Map((props || []).map((p: any) => [p.id, p]));
      const agentMap = new Map((profs || []).map((p: any) => [p.id, p.full_name]));

      setPendencies(
        sorted.map((p: any) => ({
          ...p,
          property: propMap.get(p.property_id),
          agent_name: agentMap.get(p.agent_id) || "—",
        }))
      );
    } catch (e: any) {
      console.error("[Pendências] erro ao carregar:", e);
      toast.error("Erro ao carregar pendências");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const loadAttempts = async (propertyId: string) => {
    try {
      const data = await listRemoteOrCache<any>({
        name: "property_recovery_attempts",
        remote: () =>
          (supabase as any)
            .from("property_recovery_attempts")
            .select("*")
            .eq("property_id", propertyId)
            .order("attempted_at", { ascending: true }),
        filter: (a) => a.property_id === propertyId,
      });
      const sorted = [...(data || [])].sort((a, b) => {
        const ta = a.attempted_at ? new Date(a.attempted_at).getTime() : 0;
        const tb = b.attempted_at ? new Date(b.attempted_at).getTime() : 0;
        return ta - tb;
      });
      setAttempts(sorted as any[]);
    } catch (e) {
      console.error(e);
    }
  };


  const openDetails = async (p: EnrichedPendency) => {
    setSelected(p);
    setAttempts([]);
    await loadAttempts(p.property_id);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pendencies.filter((p) => {
      if (statusFilter !== "all") {
        if (statusFilter === "active" && p.resolved_at) return false;
        if (statusFilter === "resolved" && !p.resolved_at) return false;
        if (
          statusFilter !== "active" &&
          statusFilter !== "resolved" &&
          p.current_status !== statusFilter
        )
          return false;
      }
      if (!q) return true;
      const hay = `${p.property?.number ?? ""} ${p.property?.street_name ?? ""} ${p.property?.block_number ?? ""} ${p.agent_name ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [pendencies, search, statusFilter]);

  const kpis = useMemo(() => {
    const active = pendencies.filter((p) => !p.resolved_at);
    const count = (s: RecoveryResult) => active.filter((p) => p.current_status === s).length;
    return {
      total: active.length,
      closed: count("closed"),
      refused: count("refused"),
      absent: count("absent") + count("not_located"),
      recovered: pendencies.filter((p) => p.resolved_status === "visited").length,
      unoccupied: pendencies.filter((p) => p.resolved_status === "unoccupied").length,
      demolished: pendencies.filter((p) => p.resolved_status === "demolished").length,
    };
  }, [pendencies]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl md:text-3xl font-black tracking-tight text-primary">Pendências</h2>
          <p className="text-sm text-muted-foreground font-medium">
            {role === "agente"
              ? "Imóveis aguardando recuperação"
              : "Pendências da equipe sob sua supervisão"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportCSV(filtered)}>
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <FileText className="h-4 w-4" /> PDF
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
        <Kpi label="Total" value={kpis.total} color="text-primary" />
        <Kpi label="Fechados" value={kpis.closed} color="text-amber-600" />
        <Kpi label="Recusados" value={kpis.refused} color="text-red-600" />
        <Kpi label="Ausentes" value={kpis.absent} color="text-slate-600" />
        <Kpi label="Recuperados" value={kpis.recovered} color="text-emerald-600" />
        <Kpi label="Desocupados" value={kpis.unoccupied} color="text-blue-600" />
        <Kpi label="Demolidos" value={kpis.demolished} color="text-stone-600" />
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nº, rua, quarteirão, agente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="active">Ativas (pendentes)</SelectItem>
            <SelectItem value="resolved">Resolvidas</SelectItem>
            <SelectItem value="closed">Fechado</SelectItem>
            <SelectItem value="refused">Recusado</SelectItem>
            <SelectItem value="absent">Ausente</SelectItem>
            <SelectItem value="not_located">Não localizado</SelectItem>
            <SelectItem value="visited">Recuperado</SelectItem>
            <SelectItem value="unoccupied">Desocupado</SelectItem>
            <SelectItem value="demolished">Demolido</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Nenhuma pendência encontrada</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => (
            <PendencyCard key={p.id} p={p} onClick={() => openDetails(p)} />
          ))}
        </div>
      )}

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selected && (
            <DetailsPanel
              pendency={selected}
              attempts={attempts}
              onAttempt={() => setAttemptDialogOpen(true)}
            />
          )}
        </SheetContent>
      </Sheet>

      {selected && (
        <NewAttemptDialog
          open={attemptDialogOpen}
          onOpenChange={setAttemptDialogOpen}
          pendency={selected}
          onCreated={async () => {
            setAttemptDialogOpen(false);
            await loadAttempts(selected.property_id);
            await load();
            // refresh selected
            const fresh = pendencies.find((x) => x.property_id === selected.property_id);
            if (fresh) setSelected(fresh);
          }}
        />
      )}
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Card className="rounded-xl">
      <CardContent className="p-3">
        <p className={`text-2xl font-black leading-none ${color}`}>{value}</p>
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mt-1">
          {label}
        </p>
      </CardContent>
    </Card>
  );
}

function PendencyCard({ p, onClick }: { p: EnrichedPendency; onClick: () => void }) {
  return (
    <Card
      onClick={onClick}
      className="cursor-pointer hover:shadow-md transition-all active:scale-[0.99] border-l-4"
      style={{
        borderLeftColor: p.resolved_at
          ? "#10b981"
          : p.current_status === "refused"
          ? "#dc2626"
          : "#f59e0b",
      }}
    >
      <CardContent className="p-4 flex items-center gap-3">
        <div className="h-12 w-12 rounded-xl bg-accent/40 flex items-center justify-center shrink-0">
          <Home className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-black text-lg">{p.property?.number || "—"}</span>
            <StatusBadge status={p.resolved_status ?? p.current_status} />
            {p.resolved_at && (
              <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                Resolvida
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">{p.property?.street_name || "Logradouro não informado"}</p>
          <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> Q. {p.property?.block_number || "—"}</span>
            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {fmtDate(p.last_attempt_at)}</span>
            <span className="flex items-center gap-1"><RefreshCw className="h-3 w-3" /> {p.attempt_count} tent.</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">Agente: {p.agent_name}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function DetailsPanel({
  pendency,
  attempts,
  onAttempt,
}: {
  pendency: EnrichedPendency;
  attempts: Attempt[];
  onAttempt: () => void;
}) {
  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <Home className="h-5 w-5" />
          Imóvel {pendency.property?.number || "—"}
        </SheetTitle>
        <SheetDescription>
          {pendency.property?.street_name} · Q. {pendency.property?.block_number || "—"}
        </SheetDescription>
      </SheetHeader>

      <div className="mt-6 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold uppercase text-muted-foreground">Situação:</span>
          <StatusBadge status={pendency.resolved_status ?? pendency.current_status} />
          {pendency.resolved_at && (
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700">Resolvida em {fmtDate(pendency.resolved_at)}</Badge>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <Info label="Agente" value={pendency.agent_name || "—"} />
          <Info label="Tentativas" value={String(pendency.attempt_count)} />
          <Info label="Última tentativa" value={fmtDate(pendency.last_attempt_at)} />
          <Info label="Bairro" value={pendency.property?.neighborhood || "—"} />
        </div>

        {pendency.reason && (
          <div className="bg-muted/40 rounded-lg p-3">
            <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Observação atual</p>
            <p className="text-sm">{pendency.reason}</p>
          </div>
        )}

        {!pendency.resolved_at && (
          <Button onClick={onAttempt} className="w-full gap-2 bg-primary">
            <RefreshCw className="h-4 w-4" />
            Realizar Nova Tentativa
          </Button>
        )}

        <div>
          <div className="flex items-center gap-2 mb-2">
            <History className="h-4 w-4" />
            <h3 className="font-bold text-sm">Histórico de Tentativas</h3>
          </div>
          {attempts.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center bg-muted/30 rounded-lg">
              Nenhuma tentativa registrada
            </p>
          ) : (
            <div className="space-y-2">
              {attempts.map((a) => (
                <div key={a.id} className="border rounded-lg p-3 bg-card">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-sm">Tentativa {a.attempt_number}</span>
                    <StatusBadge status={a.result} />
                  </div>
                  <p className="text-xs text-muted-foreground">{fmtDate(a.attempted_at)}</p>
                  {a.notes && <p className="text-sm mt-1">{a.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function NewAttemptDialog({
  open,
  onOpenChange,
  pendency,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pendency: EnrichedPendency;
  onCreated: () => void;
}) {
  const { user } = useAuth();
  const [result, setResult] = useState<RecoveryResult>("closed");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [treated, setTreated] = useState<"yes" | "no" | "">("");
  const [depositCount, setDepositCount] = useState<string>("");
  const [larvicideAmount, setLarvicideAmount] = useState<string>("");
  const [larvicideUnit, setLarvicideUnit] = useState<string>("g");


  const submit = async () => {
    if (!user) return;
    setSaving(true);
    try {
      let lat: number | null = null;
      let lng: number | null = null;
      try {
        if (navigator.geolocation) {
          await new Promise<void>((resolve) => {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                lat = pos.coords.latitude;
                lng = pos.coords.longitude;
                resolve();
              },
              () => resolve(),
              { timeout: 3000 }
            );
          });
        }
      } catch {}

      let finalNotes = notes.trim();
      if (result === "visited" && treated) {
        const parts: string[] = [];
        parts.push(treated === "yes" ? "Tratado: SIM" : "Tratado: NÃO");
        if (treated === "yes") {
          if (depositCount) parts.push(`Depósitos tratados: ${depositCount}`);
          if (larvicideAmount) parts.push(`Larvicida: ${larvicideAmount} ${larvicideUnit}`);
        }
        const meta = `[${parts.join(" · ")}]`;
        finalNotes = finalNotes ? `${finalNotes}\n${meta}` : meta;
      }

      const { error } = await (supabase as any).from("property_recovery_attempts").insert({
        property_id: pendency.property_id,
        agent_id: user.id,
        result,
        notes: finalNotes || null,
        latitude: lat,
        longitude: lng,
      });
      if (error) throw error;
      toast.success("Tentativa registrada");
      setNotes("");
      setResult("closed");
      setTreated("");
      setDepositCount("");
      setLarvicideAmount("");
      onCreated();

    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Erro ao registrar tentativa");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova Tentativa de Recuperação</DialogTitle>
          <DialogDescription>
            Imóvel {pendency.property?.number} · {pendency.property?.street_name}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs font-bold uppercase text-muted-foreground">Resultado</label>
            <Select value={result} onValueChange={(v) => setResult(v as RecoveryResult)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="visited">✅ Recuperado / Visitado</SelectItem>
                <SelectItem value="closed">🔒 Continua Fechado</SelectItem>
                <SelectItem value="refused">🚫 Recusado</SelectItem>
                <SelectItem value="absent">👥 Ausente</SelectItem>
                <SelectItem value="not_located">🔍 Não localizado</SelectItem>
                <SelectItem value="unoccupied">🏚️ Desocupado</SelectItem>
                <SelectItem value="demolished">❌ Demolido</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {result === "visited" && (
            <div className="space-y-3 rounded-lg border bg-emerald-50/40 p-3">
              <div>
                <label className="text-xs font-bold uppercase text-muted-foreground">
                  O imóvel foi tratado?
                </label>
                <Select value={treated} onValueChange={(v) => setTreated(v as any)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Sim, foi tratado</SelectItem>
                    <SelectItem value="no">Não foi tratado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {treated === "yes" && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-bold uppercase text-muted-foreground">
                      Depósitos tratados
                    </label>
                    <Input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={depositCount}
                      onChange={(e) => setDepositCount(e.target.value)}
                      placeholder="0"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase text-muted-foreground">
                      Larvicida
                    </label>
                    <div className="mt-1 flex gap-1">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={larvicideAmount}
                        onChange={(e) => setLarvicideAmount(e.target.value)}
                        placeholder="0"
                        className="flex-1"
                      />
                      <Select value={larvicideUnit} onValueChange={setLarvicideUnit}>
                        <SelectTrigger className="w-[72px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="g">g</SelectItem>
                          <SelectItem value="ml">ml</SelectItem>
                          <SelectItem value="sachê">sachê</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}


          <div>
            <label className="text-xs font-bold uppercase text-muted-foreground">Observação</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalhes da tentativa..."
              className="mt-1"
              maxLength={500}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Registrar Tentativa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function exportCSV(rows: EnrichedPendency[]) {
  const header = ["Numero", "Logradouro", "Quarteirao", "Situacao", "Tentativas", "Ultima_Tentativa", "Agente", "Observacao"];
  const lines = rows.map((r) => [
    r.property?.number ?? "",
    r.property?.street_name ?? "",
    r.property?.block_number ?? "",
    STATUS_META[r.resolved_status ?? r.current_status].label,
    String(r.attempt_count),
    fmtDate(r.last_attempt_at),
    r.agent_name ?? "",
    (r.reason ?? "").replace(/[\r\n;]+/g, " "),
  ]);
  const csv = [header, ...lines].map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pendencias_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
