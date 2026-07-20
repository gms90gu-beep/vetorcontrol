import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, CalendarCheck, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getEpiWeek, resolveCycleWeek } from "@/lib/cycle-week";
import { getActiveCycleForUser } from "@/lib/active-cycle";

import { logDirectSource } from "@/lib/operational-metrics";
import { requireAdminMasterGuard } from "@/lib/role-guards";
logDirectSource({ module: "routes/admin.calendar-audit", file: "src/routes/_authenticated.admin.calendar-audit.tsx", source: "daily_work_records", note: "auditoria de calendário — leitura administrativa" });

export const Route = createFileRoute("/_authenticated/admin/calendar-audit")({
  beforeLoad: requireAdminMasterGuard,
  component: CalendarAuditPage,
});

type Row = { label: string; current: string | number; expected: string | number; ok: boolean };

/** Início (domingo) da SE que contém a data — padrão epidemiológico brasileiro (SINAN). */
function epiWeekStart(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay()); // domingo
  return x;
}
function epiWeekEnd(d: Date): Date {
  const s = epiWeekStart(d);
  const e = new Date(s);
  e.setDate(e.getDate() + 6); // sábado
  return e;
}
/** SE brasileira: semana que contém o sábado mais próximo de 1º de janeiro. */
function brEpiWeek(d: Date): { week: number; year: number } {
  const sat = (y: number) => {
    // sábado da SE 1: sábado mais próximo de 1/jan
    const jan1 = new Date(y, 0, 1);
    const dow = jan1.getDay(); // 0=dom..6=sab
    const diffToSat = ((6 - dow) + 7) % 7;
    const candidate = new Date(y, 0, 1 + diffToSat);
    // se 1/jan está mais perto do sábado anterior (4+ dias dentro), usar o anterior
    if (diffToSat >= 4) candidate.setDate(candidate.getDate() - 7);
    return candidate;
  };
  let year = d.getFullYear();
  let firstSat = sat(year);
  let firstSun = new Date(firstSat); firstSun.setDate(firstSun.getDate() - 6);
  if (d < firstSun) {
    year -= 1;
    firstSat = sat(year);
    firstSun = new Date(firstSat); firstSun.setDate(firstSun.getDate() - 6);
  } else {
    const nextSun = new Date(sat(year + 1)); nextSun.setDate(nextSun.getDate() - 6);
    if (d >= nextSun) { year += 1; firstSun = nextSun; }
  }
  const diffDays = Math.floor((d.getTime() - firstSun.getTime()) / 86400000);
  return { week: Math.floor(diffDays / 7) + 1, year };
}

function fmt(d: Date) {
  return d.toLocaleDateString("pt-BR");
}
function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function CalendarAuditPage() {
  const router = useRouter();
  const { user, role, isLoading } = useAuth();
  const [refreshTick, setRefreshTick] = useState(0);
  const [cycle, setCycle] = useState<{ id: string; number: number | null; year: number | null; name: string | null; start_date?: string; end_date?: string } | null>(null);
  const [cycleWeek, setCycleWeek] = useState<{ number: number; start_date: string; end_date: string } | null>(null);
  const [counts, setCounts] = useState<{ cyc: any; wk: any } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoading && role !== "admin_master") router.navigate({ to: "/dashboard" });
  }, [role, isLoading, router]);

  const now = useMemo(() => new Date(), [refreshTick]);
  const se = useMemo(() => getEpiWeek(now), [now]);
  const seBR = useMemo(() => brEpiWeek(now), [now]);
  const seStart = useMemo(() => epiWeekStart(now), [now]);
  const seEnd = useMemo(() => epiWeekEnd(now), [now]);

  useEffect(() => {
    if (role !== "admin_master") return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const active = await getActiveCycleForUser(user?.id ?? null);
      let full: any = active;
      if (active?.id) {
        const { data } = await supabase
          .from("cycles")
          .select("id, number, year, name, start_date, end_date")
          .eq("id", active.id)
          .maybeSingle();
        if (data) full = { ...active, ...data };
      }
      if (cancelled) return;
      setCycle(full);
      const cw = full?.id ? await resolveCycleWeek(full.id, now) : null;
      if (cancelled) return;
      setCycleWeek(cw ? { number: cw.number, start_date: cw.start_date, end_date: cw.end_date } : null);

      // Contagens do ciclo e da semana epidemiológica
      const cycStart = full?.start_date;
      const cycEnd = full?.end_date;
      const fetchCounts = async (from: string, to: string) => {
        const { data: dwr } = await supabase
          .from("daily_work_records")
          .select("properties_worked, properties_closed, properties_refused, foci_found, larvicide_used_g, blocks_completed")
          .gte("work_date", from)
          .lte("work_date", to);
        const sum = (k: string) => (dwr ?? []).reduce((a: number, r: any) => a + (Number(r[k]) || 0), 0);
        return {
          trabalhados: sum("properties_worked"),
          fechados: sum("properties_closed"),
          recusas: sum("properties_refused"),
          focos: sum("foci_found"),
          larvicida: sum("larvicide_used_g"),
          quarteiroes: sum("blocks_completed"),
          registros: (dwr ?? []).length,
        };
      };
      const cyc = cycStart && cycEnd ? await fetchCounts(cycStart, cycEnd) : null;
      const wk = await fetchCounts(iso(seStart), iso(seEnd));
      if (cancelled) return;
      setCounts({ cyc, wk });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id, role, refreshTick]);

  if (role !== "admin_master") return null;

  const seRows: Row[] = [
    { label: "Data atual", current: fmt(now), expected: fmt(now), ok: true },
    { label: "SE (ISO 8601 — atual no sistema)", current: `${se.week}/${se.year}`, expected: `${seBR.week}/${seBR.year}`, ok: se.week === seBR.week && se.year === seBR.year },
    { label: "Início da SE (domingo)", current: fmt(seStart), expected: fmt(seStart), ok: true },
    { label: "Fim da SE (sábado)", current: fmt(seEnd), expected: fmt(seEnd), ok: true },
  ];

  const cycleRows: Row[] = [
    { label: "Ciclo", current: cycle ? `Ciclo ${cycle.number}/${cycle.year}` : "—", expected: "definido", ok: !!cycle },
    { label: "Origem", current: (cycle as any)?.source ?? "—", expected: "session|in_progress", ok: !!cycle },
    { label: "Início do ciclo", current: cycle?.start_date ? fmt(new Date(cycle.start_date)) : "—", expected: "definida", ok: !!cycle?.start_date },
    { label: "Fim do ciclo", current: cycle?.end_date ? fmt(new Date(cycle.end_date)) : "—", expected: "definida", ok: !!cycle?.end_date },
    { label: "Semana do ciclo", current: cycleWeek ? `Semana ${cycleWeek.number}` : "—", expected: "definida", ok: !!cycleWeek },
    { label: "Período da semana do ciclo", current: cycleWeek ? `${fmt(new Date(cycleWeek.start_date))} → ${fmt(new Date(cycleWeek.end_date))}` : "—", expected: "definido", ok: !!cycleWeek },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-2">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarCheck className="h-6 w-6 text-primary" />
            Auditoria de Ciclo & Semana Epidemiológica
          </h1>
          <p className="text-sm text-muted-foreground">
            Validação do calendário epidemiológico (SINAN) e do ciclo operacional vigente.
          </p>
        </div>
        <Button onClick={() => setRefreshTick((t) => t + 1)} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <AuditCard title="1. Semana Epidemiológica (SE)" rows={seRows}
        note="Sistema usa ISO 8601 (segunda→domingo). Padrão brasileiro SINAN usa domingo→sábado, baseado no sábado mais próximo de 1º/jan. Divergências aparecem em semanas de virada de ano." />

      <AuditCard title="2. Ciclo Operacional" rows={cycleRows}
        note="Origem: tabela cycles + sessão ativa do usuário (field_work_sessions.cycle_id). Semana do ciclo: tabela weeks por intervalo de datas." />

      <Card>
        <CardHeader><CardTitle className="text-base">3. Produção do Ciclo</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {counts?.cyc ? Object.entries(counts.cyc).map(([k, v]) => (
            <Stat key={k} label={k} value={v as number} />
          )) : <p className="text-sm text-muted-foreground">Sem ciclo com datas definidas.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">4. Produção da Semana (SE {se.week}/{se.year})</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {counts?.wk ? Object.entries(counts.wk).map(([k, v]) => (
            <Stat key={k} label={k} value={v as number} />
          )) : <p className="text-sm text-muted-foreground">Carregando…</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">5. Painel (modo debug)</CardTitle></CardHeader>
        <CardContent className="text-sm grid md:grid-cols-2 gap-3">
          <div className="rounded-md border p-3 space-y-1">
            <p><b>SE atual (ISO):</b> {se.week}/{se.year}</p>
            <p><b>SE atual (BR/SINAN):</b> {seBR.week}/{seBR.year}</p>
            <p><b>Início SE:</b> {fmt(seStart)}</p>
            <p><b>Fim SE:</b> {fmt(seEnd)}</p>
          </div>
          <div className="rounded-md border p-3 space-y-1">
            <p><b>Ciclo:</b> {cycle ? `${cycle.number}/${cycle.year}` : "—"}</p>
            <p><b>Início:</b> {cycle?.start_date ? fmt(new Date(cycle.start_date)) : "—"}</p>
            <p><b>Fim:</b> {cycle?.end_date ? fmt(new Date(cycle.end_date)) : "—"}</p>
            <p><b>Semana do ciclo:</b> {cycleWeek?.number ?? "—"}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">6. Relatório Consolidado</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Verdict ok={se.week === seBR.week && se.year === seBR.year} label="Semana epidemiológica alinhada ao padrão brasileiro" />
          <Verdict ok={!!cycle?.start_date && !!cycle?.end_date} label="Ciclo possui datas de início e fim" />
          <Verdict ok={!!counts?.cyc && counts.cyc.registros > 0} label="Indicadores do ciclo possuem registros" />
          <Verdict ok={!!counts?.wk && counts.wk.registros > 0} label="Indicadores da semana possuem registros" />
        </CardContent>
      </Card>
    </div>
  );
}

function AuditCard({ title, rows, note }: { title: string; rows: Row[]; note?: string }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground">
              <tr className="text-left">
                <th className="py-1 pr-2">Item</th>
                <th className="py-1 pr-2">Sistema</th>
                <th className="py-1 pr-2">Esperado</th>
                <th className="py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="py-1 pr-2">{r.label}</td>
                  <td className="py-1 pr-2 font-mono">{String(r.current)}</td>
                  <td className="py-1 pr-2 font-mono">{String(r.expected)}</td>
                  <td className="py-1">
                    {r.ok ? <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">✓ correto</Badge>
                          : <Badge variant="secondary" className="bg-amber-100 text-amber-700">⚠ divergência</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {note && <p className="text-xs text-muted-foreground mt-3">{note}</p>}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground capitalize">{label}</p>
      <p className="text-2xl font-bold">{(value ?? 0).toLocaleString("pt-BR")}</p>
    </div>
  );
}

function Verdict({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
      <span>{ok ? "✓" : "⚠"} {label}</span>
    </div>
  );
}
