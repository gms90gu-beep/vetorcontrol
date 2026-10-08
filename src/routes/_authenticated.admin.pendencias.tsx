import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { translate } from "@/lib/translations";
import { getPendencyReport, getPendencyHistoricalSummary } from "@/lib/wave-c.functions";
import { useAuth } from "@/hooks/useAuth";
import { getActiveCycleForUser } from "@/lib/active-cycle";
import { listRemoteOrCache } from "@/lib/offline/repos";
import {
  generateInstitutionalPDF, downloadCSV, downloadXLSX,
} from "@/lib/institutional-export";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle, Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { requireManagerGuard } from "@/lib/role-guards";
import { getOperationalDate } from "@/lib/operational-date";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin/pendencias")({
  head: () => ({ meta: [
    { title: "Relatório de Pendências — VetorControl" },
    { name: "description", content: "Relatório de pendências da equipe por ciclo e semana no VetorControl." },
    { property: "og:title", content: "Relatório de Pendências — VetorControl" },
    { property: "og:description", content: "Consulte e exporte as pendências operacionais da equipe." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  beforeLoad: requireManagerGuard,
  component: PendencyReportPage,
});

function PendencyReportPage() {
  const { user } = useAuth();
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [cycleId, setCycleId] = useState<string>("");
  const [currentCycleId, setCurrentCycleId] = useState<string | null>(null);
  const [historical, setHistorical] = useState(false);
  const [ready, setReady] = useState(false);
  const [weekId, setWeekId] = useState<string>("");
  const [cycles, setCycles] = useState<any[]>([]);
  const [weeks, setWeeks] = useState<any[]>([]);
  const fetchPend = useServerFn(getPendencyReport);
  const fetchSummary = useServerFn(getPendencyHistoricalSummary);
  const summary = useQuery({ queryKey: ["pendency-history", user?.id, currentCycleId], queryFn: () => fetchSummary({ data: { currentCycleId } }), enabled: ready && historical });

  useEffect(() => {
    if (!user?.id) return;
    void (async () => {
      const [cycleRows, weekRows, active] = await Promise.all([
        listRemoteOrCache<any>({
          name: "cycles",
          remote: () => supabase.from("cycles").select("id, name, number, year, start_date, end_date").order("year", { ascending: false }) as any,
        }),
        listRemoteOrCache<any>({
          name: "weeks",
          remote: () => supabase.from("weeks").select("id, number, cycle_id").order("number", { ascending: true }) as any,
        }),
        getActiveCycleForUser(user.id),
      ]);
      setCycles(cycleRows || []);
      setWeeks(weekRows || []);
      setCurrentCycleId(active?.id ?? null);
      if (active?.id) setCycleId(active.id);
      setReady(true);
    })();
  }, [user?.id]);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["pendency-report", user?.id, onlyOpen, cycleId, weekId],
    queryFn: () => fetchPend({ data: { onlyOpen, cycleId: cycleId || null, weekId: weekId || null, limit: 1000 } }),
    enabled: ready,
  });

  const exportPDF = () => {
    if (!data) return;
    generateInstitutionalPDF(
      `pendencias_${getOperationalDate()}.pdf`,
      {
        title: "Relatório de Pendências",
        subtitle: onlyOpen ? "Pendências abertas" : "Todas as pendências",
        issuedBy: "Supervisão",
      },
      [
        {
          title: "Resumo",
          head: ["Status", "Quantidade"],
          body: [
            ["Abertas", data.total_open],
            ["Resolvidas", data.total_resolved],
            ...Object.entries(data.by_status).map(([k, v]) => [`Status: ${k}`, v]),
          ],
        },
        {
          title: "Lista de Pendências",
          head: ["Quart.", "Imóvel", "Tipo", "Rua", "Agente", "Status", "Tentativas", "Última"],
          body: data.rows.map((r) => [
            r.block_number ?? "—",
            r.property_number ?? "—",
            r.street ?? "—",
            r.agent_name,
            r.current_status,
            r.attempt_count,
            r.last_attempt_at ? new Date(r.last_attempt_at).toLocaleString("pt-BR") : "—",
          ]),
        },
      ],
    );
  };

  const head = ["Quart.", "Imóvel", "Tipo", "Rua", "Agente", "Status", "Tentativas", "Última", "Resolvida"];
  const rows = (data?.rows ?? []).map((r) => [
    r.block_number ?? "",
    r.property_number ?? "",
    translate(r.property_type) || "—",
    r.street ?? "",
    r.agent_name,
    r.current_status,
    r.attempt_count,
    r.last_attempt_at ? new Date(r.last_attempt_at).toLocaleString("pt-BR") : "",
    r.resolved_at ? new Date(r.resolved_at).toLocaleString("pt-BR") : "",
  ]);

  return (
    <div className="container mx-auto max-w-7xl p-3 sm:p-6 space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Relatório de Pendências
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={historical} onCheckedChange={(value) => { setHistorical(value); setOnlyOpen(!value); setCycleId(value ? "" : currentCycleId ?? ""); setWeekId(""); }} />
              Histórico
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={onlyOpen} onCheckedChange={setOnlyOpen} />
              Somente pendências abertas
            </label>
            <Select value={cycleId || "all"} onValueChange={(value) => { setCycleId(value === "all" ? "" : value); setWeekId(""); }}>
              <SelectTrigger className="h-9 w-[190px] text-xs"><SelectValue placeholder="Ciclo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os ciclos</SelectItem>
                {cycles.filter((c) => historical ? c.id !== currentCycleId : c.id === currentCycleId).map((c) => <SelectItem key={c.id} value={c.id}>{c.name || `Ciclo ${c.number ?? "—"}/${c.year ?? "—"}`}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={weekId || "all"} onValueChange={(value) => setWeekId(value === "all" ? "" : value)}>
              <SelectTrigger className="h-9 w-[150px] text-xs"><SelectValue placeholder="Semana" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as semanas</SelectItem>
                {weeks.filter((w) => !cycleId || w.cycle_id === cycleId).map((w) => <SelectItem key={w.id} value={w.id}>Semana {w.number ?? "—"}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Atualizar"}
            </Button>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" onClick={exportPDF} disabled={!data}>
                <FileText className="h-4 w-4 mr-1" /> PDF
              </Button>
              <Button size="sm" variant="outline" disabled={!data}
                onClick={() => data && downloadXLSX("pendencias.xls", "Pendências", head, rows)}>
                <FileSpreadsheet className="h-4 w-4 mr-1" /> XLSX
              </Button>
              <Button size="sm" variant="outline" disabled={!data}
                onClick={() => data && downloadCSV("pendencias.csv", head, rows)}>
                <Download className="h-4 w-4 mr-1" /> CSV
              </Button>
            </div>
          </div>
          {data && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              <Kpi label="Abertas" value={data.total_open} />
              <Kpi label="Resolvidas" value={data.total_resolved} />
              <Kpi label="Status únicos" value={Object.keys(data.by_status).length} />
              <Kpi label="Total listado" value={data.rows.length} />
            </div>
          )}
        </CardContent>
      </Card>

      {historical && summary.data && (
        <section aria-label="Resumo histórico por ciclo" className="space-y-2">
          <h3 className="font-semibold">Histórico por ciclo</h3>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{["Ciclo", "Ativas", "Resolvidas", "Total"].map((h) => <th key={h} className="p-2 text-left">{h}</th>)}</tr></thead><tbody>
            {summary.data.map((r) => <tr key={r.cycle_id ?? "unlinked"} className="border-t"><td className="p-2">{cycles.find((c) => c.id === r.cycle_id)?.name ?? "Sem vínculo com ciclo"}</td><td className="p-2">{r.active}</td><td className="p-2">{r.resolved}</td><td className="p-2">{r.total}</td></tr>)}
          </tbody></table></div>
        </section>
      )}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/60 sticky top-0">
                <tr>{head.map((h) => <th key={h} className="p-2 text-left">{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={head.length} className="p-8 text-center text-muted-foreground">
                    Nenhuma pendência encontrada.
                  </td></tr>
                ) : rows.map((r, i) => (
                  <tr key={i} className="border-t">{r.map((c, j) => <td key={j} className="p-2">{c}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
      <p className="text-xs text-muted-foreground">
        Fonte: <code>property_pendencies</code> + <code>properties</code>. Escopo aplicado por <code>supervisor_id</code>.
      </p>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
