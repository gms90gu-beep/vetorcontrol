import jsPDF from "jspdf";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export async function generateWeeklyReportPDF(agentId: string) {
  try {
    // 1. Fetch Agent Info
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", agentId)
      .single();

    if (!profile) throw new Error("Perfil não encontrado");

    // 2. Fetch Weekly Stats
    const now = new Date();
    const start = startOfWeek(now, { weekStartsOn: 1 });
    const end = endOfWeek(now, { weekStartsOn: 1 });

    const { data: visits } = await supabase
      .from("visits")
      .select(`
        *,
        properties(*)
      `)
      .eq("agent_id", agentId)
      .gte("visit_date", start.toISOString())
      .lte("visit_date", end.toISOString());

    if (!visits) throw new Error("Erro ao buscar visitas");

    const worked = visits.length;
    const closed = visits.filter(v => v.properties?.status === 'CLOSED').length;
    const focus = visits.filter(v => v.has_focus).length;
    
    // Coverage per block (unique block IDs)
    const blocks = Array.from(new Set(visits.map(v => v.properties?.block_id).filter(Boolean)));
    const coverageCount = blocks.length;

    // 3. Create PDF
    const pdf = new jsPDF();
    const margin = 20;
    let y = 20;

    // Header
    pdf.setFontSize(22);
    pdf.setTextColor(15, 23, 42); // slate-900
    pdf.text("VETORCONTROL", margin, y);
    y += 10;
    
    pdf.setFontSize(14);
    pdf.text("BOLETIM SEMANAL DE PRODUTIVIDADE", margin, y);
    y += 15;

    // Agent Info
    pdf.setFontSize(10);
    pdf.setTextColor(100, 116, 139); // slate-500
    pdf.text("AGENTE:", margin, y);
    pdf.setTextColor(15, 23, 42);
    pdf.text(profile.full_name || "N/A", margin + 20, y);
    y += 6;

    pdf.setTextColor(100, 116, 139);
    pdf.text("MATRÍCULA:", margin, y);
    pdf.setTextColor(15, 23, 42);
    pdf.text(profile.registration_number || "N/A", margin + 25, y);
    y += 6;

    pdf.setTextColor(100, 116, 139);
    pdf.text("PERÍODO:", margin, y);
    pdf.setTextColor(15, 23, 42);
    pdf.text(`${format(start, "dd/MM/yyyy")} a ${format(end, "dd/MM/yyyy")}`, margin + 20, y);
    y += 15;

    // Stats Table
    pdf.setFillColor(248, 250, 252); // slate-50
    pdf.rect(margin, y, 170, 40, "F");
    
    pdf.setFontSize(12);
    pdf.setTextColor(15, 23, 42);
    pdf.text("RESUMO DE CAMPO", margin + 5, y + 10);
    
    pdf.setFontSize(9);
    pdf.text("IMÓVEIS TRABALHADOS:", margin + 5, y + 20);
    pdf.text(worked.toString(), margin + 140, y + 20, { align: "right" });
    
    pdf.text("IMÓVEIS FECHADOS:", margin + 5, y + 26);
    pdf.text(closed.toString(), margin + 140, y + 26, { align: "right" });
    
    pdf.text("FOCOS ENCONTRADOS:", margin + 5, y + 32);
    pdf.text(focus.toString(), margin + 140, y + 32, { align: "right" });
    y += 50;

    // Blocks
    pdf.setFontSize(12);
    pdf.text("COBERTURA POR QUARTEIRÃO", margin, y);
    y += 10;
    
    pdf.setFontSize(9);
    pdf.text(`Total de quarteirões visitados: ${coverageCount}`, margin, y);
    y += 15;

    // Footer
    pdf.setFontSize(8);
    pdf.setTextColor(148, 163, 184); // slate-400
    pdf.text(`Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")}`, margin, 280);

    const fileName = `Relatorio_Semanal_${profile.registration_number}_${format(start, "dd_MM")}.pdf`;
    const blob = pdf.output("blob");
    
    return { pdf, blob, fileName };
  } catch (error) {
    console.error("Error generating weekly report:", error);
    toast.error("Erro ao gerar relatório semanal");
    return null;
  }
}

export function openWhatsAppShare(fileName: string, agentName: string) {
  const text = encodeURIComponent(`Olá Supervisor, segue meu Relatório Semanal do VetorControl (${agentName}). Arquivo: ${fileName}`);
  window.open(`https://wa.me/?text=${text}`, "_blank");
}
