import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getActiveCycleForUser } from "@/lib/active-cycle";
import { getEpiWeek, resolveCycleWeek } from "@/lib/cycle-week";
import { getOperationalDate, epiWeekFromDate } from "@/lib/operational-date";

// Semana epidemiológica derivada da DATA OPERACIONAL (America/Sao_Paulo).
function epiWeekOf(date: Date): { week: number; year: number } {
  return epiWeekFromDate(getOperationalDate(date));
}

function pct(n: number, d: number) {
  if (!d) return "0,0%";
  return `${((n / d) * 100).toFixed(1).replace(".", ",")}%`;
}

/**
 * BOLETIM SEMANAL OFICIAL — consolidado a partir de daily_work_records
 * da semana epidemiológica do agente. Fonte única; não recalcula de visits.
 * Bloqueia geração se houver diárias inconsistentes (status != completed).
 */
export async function generateWeeklyReportPDF(agentAuthId: string, referenceDate: Date) {
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, registration_number, city")
      .eq("id", agentAuthId)
      .maybeSingle();

    // agents serve apenas para metadados de cadastro do agente
    const { data: agentRow } = await supabase
      .from("agents")
      .select("name, registration_id, municipality")
      .eq("profile_id", agentAuthId)
      .maybeSingle();

    const { week: epiWeek, year: epiYear } = epiWeekOf(referenceDate);
    const refOpDate = getOperationalDate(referenceDate);
    console.log("[SE]", { work_date: refOpDate, epi_week: epiWeek, epi_year: epiYear });

    // Ciclo ativo do usuário — boletim NUNCA mistura ciclos
    const activeCycle = await getActiveCycleForUser(agentAuthId);
    console.log("[CICLO]", { work_date: refOpDate, cycle_id: activeCycle?.id ?? null });
    const refCycleWeek = activeCycle?.id ? await resolveCycleWeek(activeCycle.id, referenceDate) : null;
    console.log("[SEMANA_CICLO]", { work_date: refOpDate, cycle_id: activeCycle?.id ?? null, cycle_week: refCycleWeek?.number ?? null });
    console.log(`[CICLO] WeeklyReport usando ciclo ${activeCycle?.name || activeCycle?.id || "—"}`);

    let dailiesQuery = supabase
      .from("daily_work_records")
      .select("*")
      .eq("agent_id", agentAuthId)
      .eq("epi_week", epiWeek)
      .eq("epi_year", epiYear)
      .order("work_date", { ascending: true });
    if (activeCycle?.id) dailiesQuery = dailiesQuery.eq("cycle_id", activeCycle.id);

    const { data: dailies, error } = await dailiesQuery;

    if (error) throw error;
    const records = dailies || [];
    console.log(`[BOLETIM_FONTE] daily_work_records count=${records.length} SE=${epiWeek}/${epiYear} ciclo=${activeCycle?.name || "—"}`);
    console.log(`[CICLO] WeeklyReport consulta daily_work_records retornou ${records.length} registros do ciclo ${activeCycle?.name || "—"}`);

    // Regra de integridade: bloquear se houver diária aberta/inconsistente
    const inconsistentes = records.filter(
      (r: any) => r.status !== "completed" || r.end_time == null
    );
    if (inconsistentes.length > 0) {
      const lista = inconsistentes
        .map((r: any) => format(new Date(`${r.work_date}T12:00:00`), "dd/MM"))
        .join(", ");
      toast.error(
        `Boletim bloqueado: existem diárias inconsistentes (${lista}). Encerre-as antes de gerar.`
      );
      return null;
    }

    // Ciclo (do último registro)
    let cycleName = "—";
    const lastCycleId = records.length > 0 ? (records[records.length - 1] as any).cycle_id : null;
    if (lastCycleId) {
      const { data: cyc } = await supabase
        .from("cycles")
        .select("name, number, year")
        .eq("id", lastCycleId)
        .maybeSingle();
      if (cyc) cycleName = cyc.name || `Ciclo ${cyc.number}/${cyc.year}`;
    }

    const sum = (k: string) => records.reduce((a, r: any) => a + (Number(r[k]) || 0), 0);
    const t = {
      worked: sum("properties_worked"),
      closed: sum("properties_closed"),
      refused: sum("properties_refused"),
      recovered: sum("properties_recovered"),
      pending: sum("pending_visits"),
      depExisting: sum("deposits_existing"),
      depInspected: sum("deposits_inspected"),
      depTreated: sum("deposits_treated"),
      depEliminated: sum("deposits_eliminated"),
      focos: sum("positive_foci"),
      larvicide: sum("larvicide_amount"),
      tubitos: sum("tubitos_collected"),
      samples: sum("samples_collected"),
      blocksWorked: sum("blocks_worked"),
      blocksCompleted: sum("blocks_completed"),
      a1: sum("deposits_a1"),
      a2: sum("deposits_a2"),
      b:  sum("deposits_b"),
      c:  sum("deposits_c"),
      d1: sum("deposits_d1"),
      d2: sum("deposits_d2"),
      e:  sum("deposits_e"),
    };
    const depTypesTotal = t.a1 + t.a2 + t.b + t.c + t.d1 + t.d2 + t.e;

    const larvicideUnit = (records.find((r: any) => r.larvicide_unit)?.larvicide_unit) || "g";

    const totalVisitable = t.worked + t.pending;
    const coverage = pct(t.worked, totalVisitable);
    const positivity = pct(t.focos, t.depInspected || t.worked);
    const pendOpen = Math.max(0, t.pending - t.recovered);

    // ===== PDF =====
    const pdf = new jsPDF();
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    let y = 14;

    // Cabeçalho institucional
    pdf.setFillColor(15, 23, 42);
    pdf.rect(0, 0, pageW, 18, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.text("BOLETIM SEMANAL OFICIAL — ACE", pageW / 2, 11, { align: "center" });
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.text("Vigilância Ambiental em Saúde — Controle Vetorial", pageW / 2, 16, { align: "center" });
    pdf.setTextColor(15, 23, 42);
    y = 24;

    // 1. Identificação
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text("1. IDENTIFICAÇÃO", 14, y);
    y += 1;
    autoTable(pdf, {
      startY: y + 1,
      body: [
        ["Município", agentRow?.municipality || profile?.city || "—", "Ciclo", cycleName],
        ["Agente", agentRow?.name || profile?.full_name || "—", "Semana Epi.", `SE ${epiWeek}`],
        ["Matrícula", agentRow?.registration_id || profile?.registration_number || "—", "Ano", String(epiYear)],
        ["Emissão", new Date().toLocaleString("pt-BR"), "Diárias", String(records.length)],
      ],
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 1.5 },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 28, fillColor: [241, 245, 249] },
        2: { fontStyle: "bold", cellWidth: 28, fillColor: [241, 245, 249] },
      },
    });
    y = (pdf as any).lastAutoTable.finalY + 4;

    // 2. Produção Imobiliária
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text("2. PRODUÇÃO IMOBILIÁRIA", 14, y);
    autoTable(pdf, {
      startY: y + 2,
      head: [["Trabalhados", "Fechados", "Recusas", "Recuperados", "Pendências", "Cobertura"]],
      body: [[t.worked, t.closed, t.refused, t.recovered, t.pending, coverage].map(String)],
      theme: "grid",
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8, halign: "center" },
      styles: { fontSize: 9, halign: "center" },
    });
    y = (pdf as any).lastAutoTable.finalY + 4;

    // 3. Levantamento de Índice (LI)
    pdf.text("3. LEVANTAMENTO DE ÍNDICE (LI)", 14, y);
    autoTable(pdf, {
      startY: y + 2,
      head: [["Dep. Existentes", "Inspecionados", "Tratados", "Eliminados", "Focos", "Amostras"]],
      body: [[t.depExisting, t.depInspected, t.depTreated, t.depEliminated, t.focos, t.samples].map(String)],
      theme: "grid",
      headStyles: { fillColor: [30, 64, 175], textColor: 255, fontSize: 8, halign: "center" },
      styles: { fontSize: 9, halign: "center" },
    });
    y = (pdf as any).lastAutoTable.finalY + 3;

    // 3.1 Detalhamento de depósitos por tipo (A1, A2, B, C, D1, D2, E)
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text("Detalhamento por tipo de depósito", 14, y);
    autoTable(pdf, {
      startY: y + 1,
      head: [["A1", "A2", "B", "C", "D1", "D2", "E", "Total"]],
      body: [[t.a1, t.a2, t.b, t.c, t.d1, t.d2, t.e, depTypesTotal].map(String)],
      theme: "grid",
      headStyles: { fillColor: [30, 64, 175], textColor: 255, fontSize: 8, halign: "center" },
      styles: { fontSize: 9, halign: "center" },
    });
    y = (pdf as any).lastAutoTable.finalY + 1;
    if (depTypesTotal !== t.depInspected) {
      pdf.setFontSize(7);
      pdf.setTextColor(180, 83, 9);
      pdf.text(
        `Atenção: soma por tipo (${depTypesTotal}) difere do total de inspecionados (${t.depInspected}).`,
        14, y + 3
      );
      pdf.setTextColor(15, 23, 42);
      y += 4;
    }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    y += 3;

    // 4. Larvicida + Tubitos
    pdf.text("4. LARVICIDA E TUBITOS", 14, y);
    autoTable(pdf, {
      startY: y + 2,
      head: [["Larvicida (quantidade)", "Unidade", "Tubitos coletados"]],
      body: [[String(t.larvicide), larvicideUnit, String(t.tubitos)]],
      theme: "grid",
      headStyles: { fillColor: [22, 101, 52], textColor: 255, fontSize: 8, halign: "center" },
      styles: { fontSize: 9, halign: "center" },
    });
    y = (pdf as any).lastAutoTable.finalY + 4;

    // 5. Controle de Pendências
    pdf.text("5. CONTROLE DE PENDÊNCIAS", 14, y);
    autoTable(pdf, {
      startY: y + 2,
      head: [["Geradas", "Recuperadas", "Em aberto"]],
      body: [[String(t.pending), String(t.recovered), String(pendOpen)]],
      theme: "grid",
      headStyles: { fillColor: [180, 83, 9], textColor: 255, fontSize: 8, halign: "center" },
      styles: { fontSize: 9, halign: "center" },
    });
    y = (pdf as any).lastAutoTable.finalY + 4;

    // 6. Quarteirões — Concluídos só conta quando o agente marcou explicitamente
    pdf.text("6. QUARTEIRÕES", 14, y);
    const blocksPending = Math.max(0, t.blocksWorked - t.blocksCompleted);
    autoTable(pdf, {
      startY: y + 2,
      head: [["Trabalhados", "Concluídos", "Pendentes"]],
      body: [[String(t.blocksWorked), String(t.blocksCompleted), String(blocksPending)]],
      theme: "grid",
      headStyles: { fillColor: [71, 85, 105], textColor: 255, fontSize: 8, halign: "center" },
      styles: { fontSize: 9, halign: "center" },
    });
    y = (pdf as any).lastAutoTable.finalY + 4;


    // 7. Resumo Epidemiológico
    pdf.text("7. RESUMO EPIDEMIOLÓGICO", 14, y);
    autoTable(pdf, {
      startY: y + 2,
      head: [["Total de Focos", "Imóveis Positivos", "Positividade", "Cobertura da Semana"]],
      body: [[String(t.focos), String(t.focos), positivity, coverage]],
      theme: "grid",
      headStyles: { fillColor: [127, 29, 29], textColor: 255, fontSize: 8, halign: "center" },
      styles: { fontSize: 9, halign: "center" },
    });
    y = (pdf as any).lastAutoTable.finalY + 4;

    // 8. Auditoria
    if (y > pageH - 70) { pdf.addPage(); y = 14; }
    pdf.text(`8. AUDITORIA — Consolidado de ${records.length} relatório${records.length === 1 ? "" : "s"} diário${records.length === 1 ? "" : "s"}`, 14, y);
    autoTable(pdf, {
      startY: y + 2,
      head: [["Data", "Trabalhados", "Fechados", "Recusas", "Focos", "Tipo"]],
      body: records.length === 0
        ? [["—", "—", "—", "—", "—", "—"]]
        : records.map((r: any) => [
            format(new Date(`${r.work_date}T12:00:00`), "dd/MM/yyyy"),
            String(r.properties_worked ?? 0),
            String(r.properties_closed ?? 0),
            String(r.properties_refused ?? 0),
            String(r.positive_foci ?? 0),
            r.is_retroactive ? `Retroativa${r.retroactive_reason ? ` (${r.retroactive_reason})` : ""}` : "Normal",
          ]),
      theme: "grid",
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8, halign: "center" },
      styles: { fontSize: 8, halign: "center" },
    });
    y = (pdf as any).lastAutoTable.finalY + 12;

    // Assinatura do Agente
    if (y > pageH - 30) { pdf.addPage(); y = 30; }
    pdf.setDrawColor(15, 23, 42);
    pdf.line(pageW / 2 - 45, y, pageW / 2 + 45, y);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text("Assinatura do Agente", pageW / 2, y + 4, { align: "center" });
    pdf.setFont("helvetica", "bold");
    pdf.text(agentRow?.name || profile?.full_name || "—", pageW / 2, y + 9, { align: "center" });

    // Rodapé
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(120, 120, 120);
    pdf.text(
      "Fonte oficial: soma dos Relatórios Diários da semana epidemiológica (daily_work_records). Não recalculado a partir das visitas.",
      14, pageH - 6
    );

    const fileName = `Boletim_Semanal_Oficial_SE${epiWeek}_${epiYear}_${agentRow?.registration_id || agentAuthId}.pdf`;
    const blob = pdf.output("blob");

    if (records.length === 0) {
      toast.warning(`Nenhum Relatório Diário encontrado para a SE ${epiWeek}/${epiYear}.`);
    }

    return { pdf, blob, fileName, dailyCount: records.length, epiWeek, epiYear };
  } catch (err: any) {
    console.error("Error generating weekly bulletin:", err);
    toast.error(`Erro ao gerar boletim semanal: ${err?.message || "erro desconhecido"}`);
    return null;
  }
}

export function openWhatsAppShare(fileName: string, agentName: string) {
  const text = encodeURIComponent(
    `Olá Supervisor, segue meu Boletim Semanal Oficial do VetorControl (${agentName}). Arquivo: ${fileName}`
  );
  window.open(`https://wa.me/?text=${text}`, "_blank");
}
