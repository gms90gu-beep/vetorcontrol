import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Printer, Download, ArrowLeft, Loader2, ShieldCheck, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DEP_ORDER, normalizeDepJson } from "@/lib/daily-integrity";
import { DepositDistributionBars } from "@/components/reports/DepositDistributionBars";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const Route = createFileRoute("/_authenticated/daily-bulletin/$id")({
  component: DailyBulletinView,
});

type DWR = any;

const DEP_LABELS: Record<string, string> = {
  a1: "A1", a2: "A2", b: "B", c: "C", d1: "D1", d2: "D2", e: "E",
};

function DailyBulletinView() {
  const { id } = useParams({ from: "/_authenticated/daily-bulletin/$id" });
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rec, setRec] = useState<DWR | null>(null);
  const [agentName, setAgentName] = useState<string>("—");
  const [registration, setRegistration] = useState<string>("—");
  const [municipality, setMunicipality] = useState<string>("—");
  const [supervisor, setSupervisor] = useState<string>("—");

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from("daily_work_records")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        if (error) throw error;
        if (!data) {
          toast.error("Boletim não encontrado");
          return;
        }
        setRec(data);

        if (data.agent_id) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("full_name, registration_id, municipality, supervisor_name")
            .eq("id", data.agent_id)
            .maybeSingle();
          if (prof) {
            setAgentName((prof as any).full_name || "—");
            setRegistration((prof as any).registration_id || "—");
            setMunicipality((prof as any).municipality || "—");
            setSupervisor((prof as any).supervisor_name || "—");
          }
        }
      } catch (e: any) {
        toast.error(`Erro ao carregar: ${e.message || e}`);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const depByType = useMemo(() => normalizeDepJson(rec?.deposits_by_type), [rec]);
  const fociByType = useMemo(() => normalizeDepJson(rec?.foci_by_type), [rec]);
  const totalDep = useMemo(() => DEP_ORDER.reduce((a, k) => a + depByType[k], 0), [depByType]);
  const totalFoci = useMemo(() => DEP_ORDER.reduce((a, k) => a + fociByType[k], 0), [fociByType]);

  const integrity = (rec?.data_integrity_log || {}) as {
    reconciled?: boolean; timestamp?: string; issues?: string[];
  };

  const fmtDate = (d?: string) =>
    d ? format(new Date(`${d}T12:00:00`), "dd/MM/yyyy (EEEE)", { locale: ptBR }) : "—";
  const fmtJornada = () => {
    if (!rec?.start_time) return "—";
    const s = new Date(rec.start_time);
    const e = rec.end_time ? new Date(rec.end_time) : null;
    return `${format(s, "HH:mm")}${e ? ` — ${format(e, "HH:mm")}` : ""}`;
  };

  function downloadPDF() {
    if (!rec) return;
    const pdf = new jsPDF();
    const W = pdf.internal.pageSize.getWidth();
    let y = 14;
    pdf.setFontSize(15); pdf.setFont("helvetica", "bold");
    pdf.text("BOLETIM DIÁRIO DE CAMPO", W / 2, y, { align: "center" });
    y += 6;

    autoTable(pdf, {
      startY: y,
      body: [
        ["Agente", agentName],
        ["Matrícula", registration],
        ["Município", municipality],
        ["Supervisor", supervisor],
        ["Data", fmtDate(rec.work_date)],
        ["Jornada", fmtJornada()],
        ["SE", rec.epi_week ? `${rec.epi_week}/${rec.epi_year}` : "—"],
      ],
      theme: "plain", styles: { fontSize: 9, cellPadding: 1 },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 40 } },
    });
    y = (pdf as any).lastAutoTable.finalY + 4;

    pdf.setFont("helvetica", "bold"); pdf.text("PRODUÇÃO", 14, y); y += 1;
    autoTable(pdf, {
      startY: y + 1,
      head: [["Quarteirões", "Imóveis Trab.", "Imóveis Fech.", "P. Estratégicos"]],
      body: [[rec.blocks_worked ?? 0, rec.properties_worked ?? 0, rec.properties_closed ?? 0, rec.strategic_points_worked ?? 0].map(String)],
      theme: "grid", headStyles: { fillColor: [15, 23, 42], textColor: 255, halign: "center", fontSize: 9 },
      styles: { halign: "center", fontSize: 9 },
    });
    y = (pdf as any).lastAutoTable.finalY + 4;

    pdf.text("DEPÓSITOS POR TIPO", 14, y); y += 1;
    autoTable(pdf, {
      startY: y + 1,
      head: [["Tipo", "Quantidade"]],
      body: [...DEP_ORDER.map((k) => [DEP_LABELS[k], String(depByType[k])]), ["TOTAL", String(totalDep)]],
      theme: "grid", headStyles: { fillColor: [30, 64, 175], textColor: 255, fontSize: 9 },
      styles: { fontSize: 9 },
    });
    y = (pdf as any).lastAutoTable.finalY + 4;

    pdf.text("TRATAMENTO", 14, y); y += 1;
    autoTable(pdf, {
      startY: y + 1,
      head: [["Dep. Tratados", "Dep. Eliminados", "Tubitos Utilizados", "Tubitos Coletados"]],
      body: [[rec.deposits_treated ?? 0, rec.deposits_eliminated ?? 0, rec.tubitos_used ?? 0, rec.tubitos_collected ?? 0].map(String)],
      theme: "grid", headStyles: { fillColor: [15, 23, 42], textColor: 255, halign: "center", fontSize: 9 },
      styles: { halign: "center", fontSize: 9 },
    });
    y = (pdf as any).lastAutoTable.finalY + 4;

    pdf.text("INFORMAÇÕES FOCAIS", 14, y); y += 1;
    autoTable(pdf, {
      startY: y + 1,
      head: [["Tipo", "Focos"]],
      body: [...DEP_ORDER.map((k) => [DEP_LABELS[k], String(fociByType[k])]), ["TOTAL", String(totalFoci)], ["Focos Positivos (declarado)", String(rec.positive_foci ?? 0)]],
      theme: "grid", headStyles: { fillColor: [30, 64, 175], textColor: 255, fontSize: 9 },
      styles: { fontSize: 9 },
    });
    y = (pdf as any).lastAutoTable.finalY + 4;

    pdf.text("LARVAS", 14, y); y += 1;
    autoTable(pdf, {
      startY: y + 1,
      head: [["Larvas Coletadas", "Cargas Coletadas"]],
      body: [[rec.larvae_collected ?? 0, rec.cargas_collected ?? 0].map(String)],
      theme: "grid", headStyles: { fillColor: [15, 23, 42], textColor: 255, halign: "center", fontSize: 9 },
      styles: { halign: "center", fontSize: 9 },
    });

    pdf.save(`Boletim_Diario_${rec.work_date}.pdf`);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (!rec) return <div className="p-6">Boletim não encontrado.</div>;

  return (
    <div className="container mx-auto max-w-5xl p-3 sm:p-6 space-y-4 print:p-0">
      {/* Header / actions */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 print:hidden">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/agente" })} className="justify-self-start">
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-1" /> Imprimir
          </Button>
          <Button size="sm" onClick={downloadPDF}>
            <Download className="h-4 w-4 mr-1" /> PDF
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl sm:text-2xl text-center">
            Boletim Diário de Campo
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <Info label="Agente" value={agentName} />
          <Info label="Matrícula" value={registration} />
          <Info label="Município" value={municipality} />
          <Info label="Supervisor" value={supervisor} />
          <Info label="Data" value={fmtDate(rec.work_date)} />
          <Info label="Jornada" value={fmtJornada()} />
          <Info label="Semana Epidemiológica" value={rec.epi_week ? `SE ${rec.epi_week}/${rec.epi_year}` : "—"} />
          <Info label="Status" value={rec.status === "completed" ? "Encerrada" : "Em andamento"} />
        </CardContent>
      </Card>

      {/* SEÇÃO 1 — PRODUÇÃO */}
      <Section title="1. Produção">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Quarteirões Trabalhados" value={rec.blocks_worked ?? 0} />
          <Stat label="Imóveis Trabalhados" value={rec.properties_worked ?? 0} />
          <Stat label="Imóveis Fechados" value={rec.properties_closed ?? 0} />
          <Stat label="Pontos Estratégicos" value={rec.strategic_points_worked ?? 0} />
        </div>
      </Section>

      {/* SEÇÃO 2 — DEPÓSITOS */}
      <Section title="2. Depósitos por Tipo">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {DEP_ORDER.map((k) => (
                <TableRow key={k}>
                  <TableCell className="font-medium">{DEP_LABELS[k]}</TableCell>
                  <TableCell className="text-right">{depByType[k]}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/40 font-semibold">
                <TableCell>Total Geral</TableCell>
                <TableCell className="text-right">{totalDep}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Section>

      {/* SEÇÃO 3 — TRATAMENTO */}
      <Section title="3. Tratamento">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Depósitos Tratados" value={rec.deposits_treated ?? 0} />
          <Stat label="Depósitos Eliminados" value={rec.deposits_eliminated ?? 0} />
          <Stat label="Tubitos Utilizados" value={rec.tubitos_used ?? 0} />
          <Stat label="Tubitos Coletados" value={rec.tubitos_collected ?? 0} />
        </div>
      </Section>

      {/* SEÇÃO 4 — INFORMAÇÕES FOCAIS */}
      <Section title="4. Informações Focais">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Focos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {DEP_ORDER.map((k) => (
                <TableRow key={k}>
                  <TableCell className="font-medium">{DEP_LABELS[k]}</TableCell>
                  <TableCell className="text-right">{fociByType[k]}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/40 font-semibold">
                <TableCell>Total de Focos</TableCell>
                <TableCell className="text-right">{totalFoci}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        <div className="mt-3 text-sm text-muted-foreground">
          Focos Positivos (declarado): <span className="font-semibold text-foreground">{rec.positive_foci ?? 0}</span>
        </div>
      </Section>

      {/* SEÇÃO 5 — LARVAS */}
      <Section title="5. Larvas">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Larvas Coletadas" value={rec.larvae_collected ?? 0} />
          <Stat label="Cargas Coletadas" value={rec.cargas_collected ?? 0} />
        </div>
      </Section>

      {/* SEÇÃO 6 — RESUMO GERAL */}
      <Section title="6. Resumo Geral">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 text-sm">
          <Summary label="Quarteirões" value={rec.blocks_worked ?? 0} />
          <Summary label="Imóveis Trabalhados" value={rec.properties_worked ?? 0} />
          <Summary label="Imóveis Fechados" value={rec.properties_closed ?? 0} />
          <Summary label="Pontos Estratégicos" value={rec.strategic_points_worked ?? 0} />
          <Summary label="Depósitos" value={totalDep} />
          <Summary label="Tratados" value={rec.deposits_treated ?? 0} />
          <Summary label="Eliminados" value={rec.deposits_eliminated ?? 0} />
          <Summary label="Tubitos Utilizados" value={rec.tubitos_used ?? 0} />
          <Summary label="Tubitos Coletados" value={rec.tubitos_collected ?? 0} />
          <Summary label="Focos" value={totalFoci} />
          <Summary label="Larvas" value={rec.larvae_collected ?? 0} />
          <Summary label="Cargas" value={rec.cargas_collected ?? 0} />
        </div>
      </Section>

      {/* SEÇÃO 7 — AUDITORIA */}
      <Section title="7. Auditoria de Integridade">
        {integrity?.reconciled ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm">
            <div className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-300">
              <ShieldAlert className="h-4 w-4" />
              Este boletim passou por reconciliação automática de integridade.
            </div>
            {integrity.timestamp && (
              <div className="mt-1 text-xs text-muted-foreground">
                Em: {new Date(integrity.timestamp).toLocaleString("pt-BR")}
              </div>
            )}
            {Array.isArray(integrity.issues) && integrity.issues.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                {integrity.issues.map((i, idx) => <li key={idx}>{i}</li>)}
              </ul>
            )}
          </div>
        ) : (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-sm flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
            <ShieldCheck className="h-4 w-4" /> Dados íntegros.
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base sm:text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border bg-card p-3 text-center">
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 border-b py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex justify-between rounded-md bg-muted/40 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}
