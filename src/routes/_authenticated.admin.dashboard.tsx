import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { listRemoteOrCache } from "@/lib/offline/repos";
import { getExecutiveDashboard } from "@/lib/wave-c.functions";
import { getOperationalDate } from "@/lib/operational-date";
import {
  generateInstitutionalPDF,
  downloadCSV,
  downloadXLSX,
} from "@/lib/institutional-export";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Activity, Building2, Bug, Download, FileSpreadsheet, FileText,
  Loader2, Map as MapIcon, Users,
} from "lucide-react";
import { requireManagerGuard } from "@/lib/role-guards";

export const Route = createFileRoute("/_authenticated/admin/dashboard")({
  beforeLoad: requireManagerGuard,
  component: ExecutiveDashboardPage,
});

function isoOffset(days: number) {
  const today = getOperationalDate();
  const [y, m, d] = today.split("-").map(Number);
  const local = new Date(y, m - 1, d);
  local.setDate(local.getDate() + days);
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
}

function ExecutiveDashboardPage() {
  const [from, setFrom] = useState(isoOffset(-30));
  const [to, setTo] = useState(isoOffset(0));
  const [cycleId, setCycleId] = useState<string>("all");
  const [supervisorId, setSupervisorId] = useState<string>("all");
  const [municipality, setMunicipality] = useState<string>("all");

  const [cycles, setCycles] = useState<any[]>([]);
  const [supervisors, setSupervisors] = useState<any[]>([]);
  const [cities, setCities] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const [c, s, cs] = await Promise.all([
        listRemoteOrCache<any>({
          name: "cycles",
          remote: async () => await supabase.from("cycles").select("id, name, number, year").order("year", { ascending: false }),
        }),
        listRemoteOrCache<any>({
          name: "profiles",
          remote: async () => await supabase.from("profiles").select("id, full_name").in("role" as any, ["supervisor"] as any),
          filter: (r) => r.role === "supervisor" || r.full_name != null,
        }),
        listRemoteOrCache<any>({
          name: "profiles",
          remote: async () => await supabase.from("profiles").select("city"),
        }),
      ]);
      setCycles(c || []);
      setSupervisors(s || []);
      setCities(Array.from(new Set((cs ?? []).map((x: any) => x.city).filter(Boolean))) as string[]);
    })();
  }, []);

  const fetchDash = useServerFn(getExecutiveDashboard);
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["exec-dashboard", from, to, cycleId, supervisorId, municipality],
    queryFn: () =>
      fetchDash({
        data: {
          from, to,
          cycleId: cycleId === "all" ? null : cycleId,
          supervisorId: supervisorId === "all" ? null : supervisorId,
          municipality: municipality === "all" ? null : municipality,
        },
      }),
  });

  const k = data?.kpis;

  const exportPDF = () => {
    if (!data) return;
    generateInstitutionalPDF(
      `painel_executivo_${from}_${to}.pdf`,
      {
        title: "Painel Executivo — Admin Master",
        subtitle: `Período ${from} a ${to}`,
        municipality: municipality === "all" ? "Todos os municípios" : municipality,
        issuedBy: "Admin Master",
        reference: `${data.scope.toUpperCase()} · DWR consolidado`,
      },
      [
        {
          title: "Indicadores Globais",
          head: ["Métrica", "Valor"],
          body: [
            ["Diárias encerradas", k!.daily_records],
            ["Agentes ativos", k!.agents_active],
            ["Imóveis trabalhados", k!.properties_worked],
            ["Imóveis fechados", k!.properties_closed],
            ["Quarteirões", k!.blocks_worked],
            ["Pontos estratégicos", k!.strategic_points],
            ["Depósitos (Σ tipos)", k!.deposits_total],
            ["Depósitos tratados", k!.deposits_treated],
            ["Depósitos eliminados", k!.deposits_eliminated],
            ["Focos positivos", k!.positive_foci],
            ["Tubitos utilizados", k!.tubitos_used],
            ["Larvas coletadas", k!.larvae_collected],
            ["Cargas coletadas", k!.cargas_collected],
            ["Pendências abertas", k!.pendencies_open],
          ],
        },
        {
          title: "Produção por Supervisor",
          head: ["Supervisor", "Agentes", "Imóveis", "Focos+", "Depósitos"],
          body: data.by_supervisor.map((r) => [r.supervisor_name, r.agents, r.properties_worked, r.positive_foci, r.deposits_total]),
        },
        {
          title: "Produção por Município",
          head: ["Município", "Diárias", "Imóveis", "Focos+"],
          body: data.by_municipality.map((r) => [r.city, r.records, r.properties_worked, r.positive_foci]),
        },
        {
          title: "Top 10 Agentes",
          head: ["Agente", "Imóveis", "Focos+"],
          body: data.top_agents.map((r) => [r.full_name, r.properties_worked, r.positive_foci]),
        },
      ],
    );
  };

  const exportCSV = () => {
    if (!data) return;
    downloadCSV(
      `painel_executivo_${from}_${to}.csv`,
      ["Métrica", "Valor"],
      Object.entries(k!).map(([key, val]) => [key, val as number]),
    );
  };

  const exportXLSX = () => {
    if (!data) return;
    downloadXLSX(
      `produtividade_supervisores_${from}_${to}.xls`,
      "Supervisores",
      ["Supervisor", "Agentes", "Imóveis trab.", "Focos+", "Depósitos"],
      data.by_supervisor.map((r) => [r.supervisor_name, r.agents, r.properties_worked, r.positive_foci, r.deposits_total]),
    );
  };

  return (
    <div className="container mx-auto max-w-7xl p-3 sm:p-6 space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Painel Executivo — Admin Master</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-2 items-end">
            <label className="text-xs">
              <div className="text-muted-foreground mb-1">De</div>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="text-xs">
              <div className="text-muted-foreground mb-1">Até</div>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
            <div className="text-xs">
              <div className="text-muted-foreground mb-1">Ciclo</div>
              <Select value={cycleId} onValueChange={setCycleId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {cycles.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name || `Ciclo ${c.number}/${c.year}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-xs">
              <div className="text-muted-foreground mb-1">Supervisor</div>
              <Select value={supervisorId} onValueChange={setSupervisorId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {supervisors.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-xs">
              <div className="text-muted-foreground mb-1">Município</div>
              <Select value={municipality} onValueChange={setMunicipality}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {cities.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Atualizar"}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 pt-2 border-t">
            <Button size="sm" variant="outline" onClick={exportPDF} disabled={!data}>
              <FileText className="h-4 w-4 mr-1" /> PDF institucional
            </Button>
            <Button size="sm" variant="outline" onClick={exportXLSX} disabled={!data}>
              <FileSpreadsheet className="h-4 w-4 mr-1" /> XLSX
            </Button>
            <Button size="sm" variant="outline" onClick={exportCSV} disabled={!data}>
              <Download className="h-4 w-4 mr-1" /> CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading || !k ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            <Kpi icon={<Activity className="h-4 w-4" />} label="Diárias" value={k.daily_records} />
            <Kpi icon={<Users className="h-4 w-4" />} label="Agentes" value={k.agents_active} />
            <Kpi icon={<Building2 className="h-4 w-4" />} label="Imóveis" value={k.properties_worked} />
            <Kpi icon={<Building2 className="h-4 w-4" />} label="Fechados" value={k.properties_closed} />
            <Kpi icon={<Bug className="h-4 w-4 text-rose-500" />} label="Focos+" value={k.positive_foci} />
            <Kpi icon={<MapIcon className="h-4 w-4" />} label="Quarteirões" value={k.blocks_worked} />
            <Kpi icon={<Activity className="h-4 w-4" />} label="Pend. abertas" value={k.pendencies_open} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SimpleTable
              title="Produção por Supervisor"
              head={["Supervisor", "Agentes", "Imóveis", "Focos+", "Depósitos"]}
              rows={data!.by_supervisor.map((r) => [r.supervisor_name, r.agents, r.properties_worked, r.positive_foci, r.deposits_total])}
            />
            <SimpleTable
              title="Produção por Município"
              head={["Município", "Diárias", "Imóveis", "Focos+"]}
              rows={data!.by_municipality.map((r) => [r.city, r.records, r.properties_worked, r.positive_foci])}
            />
          </div>

          <SimpleTable
            title="Top 10 agentes (período)"
            head={["#", "Agente", "Imóveis", "Focos+"]}
            rows={data!.top_agents.map((r, i) => [i + 1, r.full_name, r.properties_worked, r.positive_foci])}
          />
        </>
      )}
      <p className="text-xs text-muted-foreground">Fonte: <code>daily_work_records</code> + RG (boletins_rg/blocks/properties).</p>
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-1 text-muted-foreground text-xs">{icon}<span>{label}</span></div>
        <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

function SimpleTable({ title, head, rows }: { title: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/60">
            <tr>{head.map((h) => <th key={h} className="p-2 text-left">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={head.length} className="p-6 text-center text-muted-foreground">Sem dados</td></tr>
            ) : rows.map((r, i) => (
              <tr key={i} className="border-t">
                {r.map((c, j) => <td key={j} className="p-2 tabular-nums">{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
