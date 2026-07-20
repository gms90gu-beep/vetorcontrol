import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { computePropertyTypeComposition } from "@/lib/property-composition";

import { logDirectSource } from "@/lib/operational-metrics";
logDirectSource({ module: "reports/DailyReportGenerator", file: "src/components/reports/DailyReportGenerator.ts", source: "daily_work_records", note: "gerador PDF diário — usar getDateMetrics após refator" });

export interface DailyPdfMeta {
  agentName?: string;
  registration?: string;
  municipality?: string;
  cycleNumber?: number | string | null;
}

/**
 * Gera o Relatório Diário (PDF) a partir de um registro de daily_work_records.
 * Fonte única — não recalcula a partir de visits.
 */
export async function generateDailyReportPDF(recordId: string, meta?: DailyPdfMeta) {
  try {
    const { data: r, error } = await supabase
      .from("daily_work_records")
      .select("*")
      .eq("id", recordId)
      .maybeSingle();
    if (error) throw error;
    if (!r) {
      toast.error("Relatório diário não encontrado.");
      return null;
    }

    const pdf = new jsPDF();
    const pageW = pdf.internal.pageSize.getWidth();
    let y = 16;

    pdf.setFontSize(16);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(15, 23, 42);
    pdf.text("RELATÓRIO DIÁRIO DE PRODUTIVIDADE", pageW / 2, y, { align: "center" });
    y += 8;

    autoTable(pdf, {
      startY: y,
      body: [
        ["Município", meta?.municipality || "—"],
        ["Agente", meta?.agentName || "—"],
        ["Matrícula", meta?.registration || "—"],
        ["Data da Jornada", format(new Date(`${r.work_date}T12:00:00`), "dd/MM/yyyy (EEEE)", { locale: ptBR })],
        ["Semana Epidemiológica", r.epi_week ? `SE ${r.epi_week} / ${r.epi_year}` : "—"],
        ["Ciclo", meta?.cycleNumber ? `Ciclo ${meta.cycleNumber}` : "—"],
        ["Status", r.status === "completed" ? "Jornada Encerrada" : "Em andamento"],
        ["Emissão", new Date().toLocaleString("pt-BR")],
      ],
      theme: "plain",
      styles: { fontSize: 9, cellPadding: 1 },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 55 } },
    });
    y = (pdf as any).lastAutoTable.finalY + 4;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.text("PRODUÇÃO DO DIA", 14, y);
    y += 2;
    autoTable(pdf, {
      startY: y + 1,
      head: [["Trabalhados", "Fechados", "Recusados", "Recuperados", "Pendências", "Qtr. Concl."]],
      body: [[
        r.properties_worked ?? 0,
        r.properties_closed ?? 0,
        r.properties_refused ?? 0,
        r.properties_recovered ?? 0,
        r.pending_visits ?? 0,
        r.blocks_completed ?? 0,
      ].map(String)],
      theme: "grid",
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 9, halign: "center" },
      styles: { fontSize: 9, halign: "center" },
    });
    y = (pdf as any).lastAutoTable.finalY + 4;

    // Composição da produção imobiliária por tipo de imóvel (mesma consulta do boletim semanal)
    const { propTypes, totalTypes } = await computePropertyTypeComposition({
      agentAuthId: r.agent_id,
      workDates: [r.work_date],
      cycleId: r.cycle_id ?? null,
    });
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.text("COMPOSIÇÃO DA PRODUÇÃO IMOBILIÁRIA", 14, y);
    y += 2;
    autoTable(pdf, {
      startY: y + 1,
      head: [["Residencial (R)", "Comercial (C)", "Terreno Baldio (TB)", "Ponto Estratégico (PE)", "Outros (O)", "Total"]],
      body: [[
        propTypes.residence,
        propTypes.commerce,
        propTypes.vacant_lot,
        propTypes.strategic_point,
        propTypes.others,
        totalTypes,
      ].map(String)],
      theme: "grid",
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 7.5, halign: "center" },
      styles: { fontSize: 9, halign: "center" },
    });
    y = (pdf as any).lastAutoTable.finalY + 1;
    if (totalTypes !== (r.properties_worked ?? 0)) {
      pdf.setFontSize(7);
      pdf.setTextColor(180, 83, 9);
      pdf.text(
        `Atenção: total por tipo (${totalTypes}) difere dos trabalhados (${r.properties_worked ?? 0}).`,
        14, y + 3
      );
      pdf.setTextColor(15, 23, 42);
      y += 4;
    }
    y += 3;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.text("DADOS DO LI", 14, y);
    y += 2;
    autoTable(pdf, {
      startY: y + 1,
      head: [["Dep. Existentes", "Inspecionados", "Tratados", "Eliminados", "Focos", `Larvicida (${r.larvicide_unit || "g"})`, "Amostras", "Tubitos"]],
      body: [[
        r.deposits_existing ?? 0,
        r.deposits_inspected ?? 0,
        r.deposits_treated ?? 0,
        r.deposits_eliminated ?? 0,
        r.positive_foci ?? 0,
        r.larvicide_amount ?? 0,
        r.samples_collected ?? 0,
        r.tubitos_collected ?? 0,
      ].map(String)],
      theme: "grid",
      headStyles: { fillColor: [30, 64, 175], textColor: 255, fontSize: 8, halign: "center" },
      styles: { fontSize: 9, halign: "center" },
    });

    pdf.setFontSize(7);
    pdf.setTextColor(120, 120, 120);
    pdf.text(
      "Fonte oficial: snapshot do encerramento da jornada. Compõe automaticamente o Boletim Semanal.",
      14, pdf.internal.pageSize.getHeight() - 8
    );

    const fileName = `Relatorio_Diario_${r.work_date}_${(meta?.registration || r.agent_id).toString().slice(0, 12)}.pdf`;
    const blob = pdf.output("blob");
    return { pdf, blob, fileName };
  } catch (error: any) {
    console.error("[DIÁRIO PDF] erro:", error);
    toast.error(`Erro ao gerar Relatório Diário: ${error?.message || "desconhecido"}`);
    return null;
  }
}

export async function shareBlobViaWhatsApp(blob: Blob, fileName: string, message: string) {
  // Try Web Share API with file (mobile)
  try {
    const file = new File([blob], fileName, { type: "application/pdf" });
    const navAny = navigator as any;
    if (navAny.canShare && navAny.canShare({ files: [file] })) {
      await navAny.share({ files: [file], title: fileName, text: message });
      return true;
    }
  } catch (e) {
    // fallback
  }
  // Fallback: download + open WhatsApp text
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  window.open(`https://wa.me/?text=${encodeURIComponent(message + " — " + fileName)}`, "_blank");
  return false;
}

export function printPdf(pdf: jsPDF) {
  const blob = pdf.output("blob");
  const url = URL.createObjectURL(blob);
  const w = window.open(url);
  if (w) {
    w.addEventListener("load", () => {
      try { w.print(); } catch {}
    });
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
