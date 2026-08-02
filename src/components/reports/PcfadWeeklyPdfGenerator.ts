import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getActiveCycleForUser } from "@/lib/active-cycle";
import {
  buildPcfadWeekData,
  pcfadIip,
  PCFAD_DASH,
  type PcfadRow,
} from "@/lib/pcfad-week";

/**
 * BOLETIM SEMANAL — P.C.F.A.D. em PAISAGEM.
 * Espelho exato da visão em tela (PcfadWeeklyLandscape): ambos consomem
 * buildPcfadWeekData(), portanto tela e PDF nunca divergem.
 */
export async function generatePcfadWeeklyPDF(params: {
  agentAuthId: string;
  week: number;
  year: number;
}) {
  const { agentAuthId, week, year } = params;
  try {
    const [{ data: profile }, { data: agentRow }, cycle] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, registration_number, city")
        .eq("id", agentAuthId)
        .maybeSingle(),
      supabase
        .from("agents")
        .select("name, registration_id, municipality")
        .eq("profile_id", agentAuthId)
        .maybeSingle(),
      getActiveCycleForUser(agentAuthId),
    ]);

    const agentName = (profile as any)?.full_name || (agentRow as any)?.name || "—";
    const registration =
      (profile as any)?.registration_number || (agentRow as any)?.registration_id || "—";
    const municipality =
      (agentRow as any)?.municipality || (profile as any)?.city || "—";

    const { rows, total, range } = await buildPcfadWeekData({ agentAuthId, week, year });

    const f = (iso: string) => format(new Date(`${iso}T12:00:00`), "dd/MM");
    const rf = (iso: string) => format(new Date(`${iso}T12:00:00`), "dd/MM/yyyy");

    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.setTextColor(15, 23, 42);
    pdf.text("P.C.F.A.D. — RESUMO DOS TRABALHOS DE CAMPO", pageW / 2, 12, {
      align: "center",
    });

    pdf.setFontSize(8);
    pdf.setTextColor(80, 80, 80);
    const cycleLabel = cycle?.number ? `Ciclo ${cycle.number}${cycle.year ? `/${cycle.year}` : ""}` : "Ciclo —";
    pdf.text(
      `${municipality} · ${agentName} · Matrícula ${registration} · SE ${String(week).padStart(2, "0")}/${year} (${f(range.start)}–${f(range.end)}) · ${cycleLabel}`,
      pageW / 2,
      17.5,
      { align: "center" }
    );

    const line = (r: PcfadRow, label: string) => [
      label,
      r.a1, r.a2, r.b, r.c, r.d1, r.d2, r.e,
      r.depTotal,
      r.samples,
      r.blocks,
      r.treated.residence,
      r.treated.commerce,
      r.treated.vacant_lot,
      r.treated.strategic_point,
      r.treated.others,
      r.treatedTotal,
      r.depInspected,
      r.depTreated,
      r.depEliminated,
      r.larvicideUnit,
      r.larvicideAmount,
      PCFAD_DASH,
      PCFAD_DASH,
      r.worked,
      r.refused,
      r.closed,
      r.recovered,
      pcfadIip(r.positive, r.worked),
      PCFAD_DASH,
      PCFAD_DASH,
    ].map(String);

    const body =
      rows.length === 0
        ? [[{ content: "Sem diárias registradas nesta semana epidemiológica.", colSpan: 31, styles: { halign: "center" as const } }]]
        : rows.map((r) => line(r, rf(r.work_date)));

    if (rows.length > 0) body.push(line(total, "TOTAL") as any);

    autoTable(pdf, {
      startY: 21,
      head: [
        [
          { content: "Data", rowSpan: 2 },
          { content: "Depósitos inspecionados por tipo", colSpan: 7 },
          { content: "Total dep.", rowSpan: 2 },
          { content: "Amostras", rowSpan: 2 },
          { content: "Quart.", rowSpan: 2 },
          { content: "Imóveis tratados por tipo", colSpan: 6 },
          { content: "Depósitos", colSpan: 3 },
          { content: "Larvicida", colSpan: 2 },
          { content: "Inseticida 2", colSpan: 2 },
          { content: "Imóveis", colSpan: 4 },
          { content: "IIP", rowSpan: 2 },
          { content: "Homem-dia", rowSpan: 2 },
          { content: "Rendim.", rowSpan: 2 },
        ],
        [
          "A1", "A2", "B", "C", "D1", "D2", "E",
          "R", "C", "TB", "PE", "OUT", "Total",
          "Inspec.", "Trat.", "Elim.",
          "Tipo", "Qtd",
          "Tipo", "Qtd",
          "Inspec.", "Recusa", "Fechada", "Recup.",
        ],
      ] as any,
      body: body as any,
      theme: "grid",
      styles: {
        fontSize: 6,
        cellPadding: 0.8,
        halign: "center",
        valign: "middle",
        lineWidth: 0.1,
        lineColor: [200, 200, 200],
        textColor: [15, 23, 42],
      },
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: [51, 65, 85],
        fontStyle: "bold",
        fontSize: 5.6,
        lineColor: [148, 163, 184],
      },
      columnStyles: { 0: { cellWidth: 16, fontStyle: "bold" } },
      margin: { left: 6, right: 6 },
      didParseCell: (data) => {
        if (
          data.section === "body" &&
          rows.length > 0 &&
          data.row.index === body.length - 1
        ) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [248, 250, 252];
        }
      },
    });

    const finalY = (pdf as any).lastAutoTable?.finalY || 60;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.5);
    pdf.setTextColor(120, 120, 120);
    pdf.text(
      'IIP = imóveis positivos ÷ imóveis inspecionados × 100. Campos sem dado no sistema exibem "—". Fonte: relatórios diários (daily_work_records) da SE.',
      6,
      Math.min(finalY + 5, pageH - 18)
    );

    const sigY = pageH - 10;
    pdf.setDrawColor(120, 120, 120);
    pdf.line(6, sigY, 76, sigY);
    pdf.setFontSize(7);
    pdf.setTextColor(80, 80, 80);
    pdf.text("ASSINATURA DO AGENTE", 41, sigY + 4, { align: "center" });
    pdf.text(`Emissão: ${new Date().toLocaleString("pt-BR")}`, pageW - 6, sigY + 4, {
      align: "right",
    });

    const fileName = `PCFAD_Semanal_SE${String(week).padStart(2, "0")}_${year}_${String(registration).slice(0, 12)}.pdf`;
    return { pdf, fileName, week, year, blob: pdf.output("blob") };
  } catch (error: any) {
    console.error("[PCFAD PDF] erro:", error);
    toast.error(`Erro ao gerar Boletim PCFAD: ${error?.message || "desconhecido"}`);
    return null;
  }
}
