import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  buildPcfadDayData,
  pcfadDayBlockLabel,
  PCFAD_DAY_DASH as DASH,
} from "@/lib/pcfad-day";

/**
 * BOLETIM DIÁRIO — "RESUMO DIÁRIO DO SERVIÇO ANTIVETORIAL" em PAISAGEM.
 * Espelho exato da visão em tela (PcfadDailyLandscape): ambos consomem
 * buildPcfadDayData(), portanto tela e PDF nunca divergem.
 */
export async function generatePcfadDailyPDF(
  recordId: string,
  meta?: { agentName?: string; registration?: string; municipality?: string }
) {
  try {
    const data = await buildPcfadDayData(recordId);
    if (!data) {
      toast.error("Relatório diário não encontrado.");
      return null;
    }

    let agentName = meta?.agentName;
    let registration = meta?.registration;
    let municipality = meta?.municipality;
    if (!agentName || !registration || !municipality) {
      const [{ data: profile }, { data: agentRow }] = await Promise.all([
        supabase
          .from("profiles")
          .select("full_name, registration_number, city")
          .eq("id", data.agentAuthId)
          .maybeSingle(),
        supabase
          .from("agents")
          .select("name, registration_id, municipality")
          .eq("profile_id", data.agentAuthId)
          .maybeSingle(),
      ]);
      agentName = agentName || (profile as any)?.full_name || (agentRow as any)?.name || "—";
      registration =
        registration || (profile as any)?.registration_number || (agentRow as any)?.registration_id || "—";
      municipality =
        municipality || (agentRow as any)?.municipality || (profile as any)?.city || "—";
    }

    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.setTextColor(15, 23, 42);
    pdf.text("RESUMO DIÁRIO DO SERVIÇO ANTIVETORIAL", pageW / 2, 12, { align: "center" });

    pdf.setFontSize(8);
    pdf.setTextColor(80, 80, 80);
    const dateLabel = format(new Date(`${data.workDate}T12:00:00`), "dd/MM/yyyy (EEEE)", {
      locale: ptBR,
    });
    pdf.text(
      `${municipality} · ${agentName} · Matrícula ${registration} · ${dateLabel}`,
      pageW / 2,
      17.5,
      { align: "center" }
    );

    const baseStyles = {
      fontSize: 7,
      cellPadding: 1,
      halign: "center" as const,
      valign: "middle" as const,
      lineWidth: 0.1,
      lineColor: [200, 200, 200] as [number, number, number],
      textColor: [15, 23, 42] as [number, number, number],
    };
    const headStyles = {
      fillColor: [241, 245, 249] as [number, number, number],
      textColor: [51, 65, 85] as [number, number, number],
      fontStyle: "bold" as const,
      fontSize: 6,
      lineColor: [148, 163, 184] as [number, number, number],
    };

    autoTable(pdf, {
      startY: 21,
      head: [
        [
          { content: "Nº imóveis trabalhados por tipo", colSpan: 6 },
          { content: "Nº imóveis", colSpan: 4 },
          { content: "Nº depósitos inspecionados por tipo", colSpan: 8 },
          { content: "Nº depósitos", colSpan: 2 },
        ],
        [
          "Residência", "Comércio", "TB", "PE", "Outro", "Total",
          "Inspec.", "Fechados", "Recusa", "Pendência",
          "A1", "A2", "B", "C", "D1", "D2", "E", "Total",
          "Tratados", "Eliminado",
        ],
      ] as any,
      body: [
        [
          data.types.residence, data.types.commerce, data.types.vacant_lot,
          data.types.strategic_point, data.types.others, data.typesTotal,
          data.inspected, data.closed, data.refused, data.pending,
          data.dep.a1, data.dep.a2, data.dep.b, data.dep.c, data.dep.d1,
          data.dep.d2, data.dep.e, data.depTotal,
          data.depTreated, data.depEliminated,
        ].map(String),
      ],
      theme: "grid",
      styles: baseStyles,
      headStyles,
      margin: { left: 6, right: 6 },
    });

    autoTable(pdf, {
      startY: ((pdf as any).lastAutoTable?.finalY || 40) + 4,
      head: [
        [
          { content: "Larvicida (1)", colSpan: 3 },
          { content: "Larvicida (2)", colSpan: 3 },
          { content: "Adulticida", colSpan: 2 },
          { content: "Amostras coletadas", rowSpan: 2 },
          { content: "Tubitos", rowSpan: 2 },
          { content: "Recuperadas", rowSpan: 2 },
        ],
        [
          "Tipo", "Qtde. Dep. Trat.", "Qtde. (Gramas)",
          "Tipo", "Qtde. Dep. Trat.", "Qtde. (Gramas)",
          "Tipo", "Qtde. (Gramas)",
        ],
      ] as any,
      body: [
        [
          data.larvicideType,
          data.larvicideTreatedDeposits,
          data.larvicideGrams,
          DASH, DASH, DASH,
          DASH, DASH,
          data.samples, data.tubitos, data.recovered,
        ].map(String),
      ],
      theme: "grid",
      styles: baseStyles,
      headStyles,
      margin: { left: 6, right: 6 },
    });

    autoTable(pdf, {
      startY: ((pdf as any).lastAutoTable?.finalY || 60) + 4,
      head: [["Nº e seq. dos quarteirões trabalhados", "Nº e seq. dos quarteirões concluídos"]],
      body: [[pcfadDayBlockLabel(data.blocksWorked), pcfadDayBlockLabel(data.blocksCompleted)]],
      theme: "grid",
      styles: { ...baseStyles, halign: "left" as const },
      headStyles,
      margin: { left: 6, right: 6 },
    });

    const finalY = (pdf as any).lastAutoTable?.finalY || 80;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.5);
    pdf.setTextColor(120, 120, 120);
    pdf.text(
      'Campos sem correspondência no sistema (Larvicida 2, Adulticida) exibem "—". Fonte: snapshot do encerramento da jornada (daily_work_records) + visitas do dia.',
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

    const fileName = `PCFAD_Diario_${data.workDate}_${String(registration).slice(0, 12)}.pdf`;
    return { pdf, blob: pdf.output("blob"), fileName };
  } catch (error: any) {
    console.error("[PCFAD DIÁRIO PDF] erro:", error);
    toast.error(`Erro ao gerar Boletim Diário: ${error?.message || "desconhecido"}`);
    return null;
  }
}
