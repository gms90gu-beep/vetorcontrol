import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getPendencyReport } from "@/lib/wave-c.functions";
import {
  generateInstitutionalPDF, downloadCSV, downloadXLSX,
} from "@/lib/institutional-export";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle, Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/pendencias")({
  component: PendencyReportPage,
});

function PendencyReportPage() {
  const [onlyOpen, setOnlyOpen] = useState(true);
  const fetchPend = useServerFn(getPendencyReport);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["pendency-report", onlyOpen],
    queryFn: () => fetchPend({ data: { onlyOpen, limit: 1000 } }),
  });

  const exportPDF = () => {
    if (!data) return;
    generateInstitutionalPDF(
      `pendencias_${new Date().toISOString().slice(0, 10)}.pdf`,
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
          head: ["Quart.", "Imóvel", "Rua", "Agente", "Status", "Tentativas", "Última"],
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

  const head = ["Quart.", "Imóvel", "Rua", "Agente", "Status", "Tentativas", "Última", "Resolvida"];
  const rows = (data?.rows ?? []).map((r) => [
    r.block_number ?? "",
    r.property_number ?? "",
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
              <Switch checked={onlyOpen} onCheckedChange={setOnlyOpen} />
              Somente pendências abertas
            </label>
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
