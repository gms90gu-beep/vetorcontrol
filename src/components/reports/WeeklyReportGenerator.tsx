import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ISO/epidemiological week from a Date
function epiWeekOf(date: Date): { week: number; year: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { week, year: d.getUTCFullYear() };
}

/**
 * Gera o Relatório/Boletim Semanal somando os Relatórios Diários (daily_work_records)
 * pertencentes à semana epidemiológica corrente do agente. Esta é a ÚNICA fonte
 * oficial — não recalcula a partir de visits para evitar divergências.
 */
export async function generateWeeklyReportPDF(agentAuthId: string, referenceDate: Date = new Date()) {
  try {
    // 1. Perfil + agents.id (daily_work_records.agent_id refere-se a agents.id)
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, registration_number, city")
      .eq("id", agentAuthId)
      .maybeSingle();

    const { data: agentRow } = await supabase
      .from("agents")
      .select("id, name, registration_id, municipality")
      .eq("profile_id", agentAuthId)
      .maybeSingle();

    if (!agentRow) {
      toast.error("Agente não encontrado para este usuário.");
      return null;
    }

    // 2. Semana epidemiológica atual (calculada pelo sistema)
    const { week: epiWeek, year: epiYear } = epiWeekOf(referenceDate);

    // 3. Consolidar SOMENTE a partir dos diários da semana epi
    const { data: dailies, error } = await supabase
      .from("daily_work_records")
      .select("*")
      .eq("agent_id", agentRow.id)
      .eq("epi_week", epiWeek)
      .eq("epi_year", epiYear)
      .order("work_date", { ascending: true });

    if (error) throw error;
    const records = dailies || [];

    const sum = (k: string) => records.reduce((a, r: any) => a + (Number(r[k]) || 0), 0);
    const totals = {
      worked: sum("properties_worked"),
      closed: sum("properties_closed"),
      refused: sum("properties_refused"),
      recovered: sum("properties_recovered"),
      depExisting: sum("deposits_existing"),
      depInspected: sum("deposits_inspected"),
      depTreated: sum("deposits_treated"),
      depEliminated: sum("deposits_eliminated"),
      focos: sum("positive_foci"),
      larvicide: sum("larvicide_amount"),
      tubitos: sum("tubitos_collected"),
      samples: sum("samples_collected"),
      blocks: sum("blocks_completed"),
      pending: sum("pending_visits"),
    };
    const larvicideUnit = (records.find((r: any) => r.larvicide_unit)?.larvicide_unit) || "g";

    // 4. PDF
    const pdf = new jsPDF();
    const pageW = pdf.internal.pageSize.getWidth();
    let y = 16;

    pdf.setFontSize(16);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(15, 23, 42);
    pdf.text("BOLETIM SEMANAL DE PRODUTIVIDADE", pageW / 2, y, { align: "center" });
    y += 8;

    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    autoTable(pdf, {
      startY: y,
      body: [
        ["Município", agentRow.municipality || profile?.city || "—"],
        ["Agente", agentRow.name || profile?.full_name || "—"],
        ["Matrícula", agentRow.registration_id || profile?.registration_number || "—"],
        ["Semana Epidemiológica", `SE ${epiWeek} / ${epiYear}`],
        ["Emissão", new Date().toLocaleString("pt-BR")],
      ],
      theme: "plain",
      styles: { fontSize: 9, cellPadding: 1 },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 50 } },
    });
    y = (pdf as any).lastAutoTable.finalY + 4;

    // Banner de rastreabilidade — pré-requisito do boletim oficial
    pdf.setFillColor(239, 246, 255);
    pdf.rect(14, y, pageW - 28, 9, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(30, 64, 175);
    pdf.text(
      `Consolidado de ${records.length} relatório${records.length === 1 ? "" : "s"} diário${records.length === 1 ? "" : "s"} — soma oficial da semana epidemiológica.`,
      pageW / 2, y + 6, { align: "center" }
    );
    y += 12;
    pdf.setTextColor(15, 23, 42);

    // Resumo da produção (soma dos diários)
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.text("RESUMO DA PRODUÇÃO (Σ Diários)", 14, y);
    y += 2;
    autoTable(pdf, {
      startY: y + 1,
      head: [["Trabalhados", "Fechados", "Recusados", "Recuperados", "Pendências", "Qtr. Concluídos"]],
      body: [[totals.worked, totals.closed, totals.refused, totals.recovered, totals.pending, totals.blocks].map(String)],
      theme: "grid",
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 9, halign: "center" },
      styles: { fontSize: 9, halign: "center" },
    });
    y = (pdf as any).lastAutoTable.finalY + 4;

    // LI
    pdf.text("DADOS DO LI (Σ Diários)", 14, y);
    y += 2;
    autoTable(pdf, {
      startY: y + 1,
      head: [["Dep. Existentes", "Inspecionados", "Tratados", "Eliminados", "Focos", `Larvicida (${larvicideUnit})`, "Amostras", "Tubitos"]],
      body: [[totals.depExisting, totals.depInspected, totals.depTreated, totals.depEliminated, totals.focos, totals.larvicide, totals.samples, totals.tubitos].map(String)],
      theme: "grid",
      headStyles: { fillColor: [30, 64, 175], textColor: 255, fontSize: 8, halign: "center" },
      styles: { fontSize: 9, halign: "center" },
    });
    y = (pdf as any).lastAutoTable.finalY + 4;

    // Auditoria: detalhamento dia a dia
    pdf.text("DETALHAMENTO POR DIÁRIA", 14, y);
    y += 2;
    autoTable(pdf, {
      startY: y + 1,
      head: [["Data", "Trab.", "Fech.", "Rec.", "Recup.", "Dep.Exist.", "Dep.Trat.", "Dep.Elim.", "Focos", "Larv.", "Tub.", "Pend."]],
      body: records.length === 0
        ? [["—", "—", "—", "—", "—", "—", "—", "—", "—", "—", "—", "—"]]
        : records.map((r: any) => [
            format(new Date(`${r.work_date}T12:00:00`), "dd/MM"),
            r.properties_worked ?? 0,
            r.properties_closed ?? 0,
            r.properties_refused ?? 0,
            r.properties_recovered ?? 0,
            r.deposits_existing ?? 0,
            r.deposits_treated ?? 0,
            r.deposits_eliminated ?? 0,
            r.positive_foci ?? 0,
            r.larvicide_amount ?? 0,
            r.tubitos_collected ?? 0,
            r.pending_visits ?? 0,
          ].map(String)),
      theme: "grid",
      headStyles: { fillColor: [71, 85, 105], textColor: 255, fontSize: 7, halign: "center" },
      styles: { fontSize: 7, halign: "center" },
    });

    pdf.setFontSize(7);
    pdf.setTextColor(120, 120, 120);
    pdf.text(
      "Fonte oficial: soma dos Relatórios Diários da semana epidemiológica. Não recalculado a partir das visitas.",
      14, pdf.internal.pageSize.getHeight() - 8
    );

    const fileName = `Boletim_Semanal_SE${epiWeek}_${epiYear}_${agentRow.registration_id || agentRow.id}.pdf`;
    const blob = pdf.output("blob");

    if (records.length === 0) {
      toast.warning(`Nenhum Relatório Diário encontrado para a SE ${epiWeek}/${epiYear}.`);
    }

    return { pdf, blob, fileName, dailyCount: records.length, epiWeek, epiYear };
  } catch (error: any) {
    console.error("Error generating weekly report:", error);
    toast.error(`Erro ao gerar boletim semanal: ${error?.message || "erro desconhecido"}`);
    return null;
  }
}

export function openWhatsAppShare(fileName: string, agentName: string) {
  const text = encodeURIComponent(`Olá Supervisor, segue meu Boletim Semanal do VetorControl (${agentName}). Arquivo: ${fileName}`);
  window.open(`https://wa.me/?text=${text}`, "_blank");
}
