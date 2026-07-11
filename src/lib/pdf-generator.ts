import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import { format } from "date-fns";
import { translate } from "./translations";
import { comparePropertyOrder } from "./property-order";

interface Property {
  number: string;
  complement: string | null;
  type: string;
  status?: string | null;
  observations?: string | null;
  street_name?: string | null;
  side?: string | null;
  sequence?: number | null;
  inhabitants?: number | null;
}

interface AgentInfo {
  municipality: string;
  name: string;
  registrationId: string;
  cycle: string;
  week: string;
  block?: string;
  street?: string;
  address?: string | null;
  neighborhood?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationSource?: "gps" | "manual" | null;
  accuracy?: number | null;
}


interface ExportMetadata {
  total: number;
  residences: number;
  commerce: number;
  lots: number;
  strategicPoints: number;
  others?: number;
  inhabitants?: number;
}

export const generateRGPDF = async (
  properties: Property[],
  agent: AgentInfo,
  metadata: ExportMetadata,
  filterInfo: { type: string; value: string }
) => {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;

  // Header Helper — 3 blocks: Administrativo, Produção, Responsável
  // Altura total ~21mm (antes 15mm, +40%)
  const drawHeader = (pageNumber: number, totalPages: number) => {
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("BOLETIM OPERACIONAL - RECONHECIMENTO GEOGRÁFICO (RG)", pageWidth / 2, 11, { align: "center" });

    const hx = margin;
    const hy = 15;
    const hw = pageWidth - 2 * margin;
    const rowH = 7;
    const totalH = rowH * 3; // 21mm

    // Moldura externa + linhas horizontais
    doc.setLineWidth(0.2);
    doc.rect(hx, hy, hw, totalH);
    doc.line(hx, hy + rowH, hx + hw, hy + rowH);
    doc.line(hx, hy + rowH * 2, hx + hw, hy + rowH * 2);

    // Etiqueta de bloco (faixa cinza à esquerda)
    const labelW = 26;
    doc.setFillColor(235, 235, 235);
    doc.rect(hx, hy, labelW, totalH, "F");
    doc.line(hx + labelW, hy, hx + labelW, hy + totalH);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(60, 60, 60);
    doc.text("ADMINISTRATIVO", hx + labelW / 2, hy + rowH / 2 + 1, { align: "center" });
    doc.text("PRODUÇÃO", hx + labelW / 2, hy + rowH + rowH / 2 + 1, { align: "center" });
    doc.text("RESPONSÁVEL", hx + labelW / 2, hy + rowH * 2 + rowH / 2 + 1, { align: "center" });
    doc.setTextColor(0, 0, 0);

    // Helper para célula rotulada
    const cell = (x: number, y: number, w: number, label: string, value: string, valueSize = 10) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(110, 110, 110);
      doc.text(label, x + 1.5, y + 2.5);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(valueSize);
      doc.setTextColor(0, 0, 0);
      const maxW = w - 3;
      let v = value || "—";
      while (doc.getTextWidth(v) > maxW && v.length > 4) v = v.slice(0, -2);
      if (v !== (value || "—")) v = v.slice(0, -1) + "…";
      doc.text(v, x + 1.5, y + rowH - 1.8);
    };

    // Linha 1 — ADMINISTRATIVO (Município compacto, Ciclo, Semana, Data)
    const r1 = hx + labelW;
    const c1w = 55, c2w = 35, c3w = 35;
    const r1w = hw - labelW;
    const c4w = r1w - c1w - c2w - c3w;
    doc.line(r1 + c1w, hy, r1 + c1w, hy + rowH);
    doc.line(r1 + c1w + c2w, hy, r1 + c1w + c2w, hy + rowH);
    doc.line(r1 + c1w + c2w + c3w, hy, r1 + c1w + c2w + c3w, hy + rowH);
    cell(r1, hy, c1w, "MUNICÍPIO / UF", `${agent.municipality || ""} / CE`, 9);
    cell(r1 + c1w, hy, c2w, "CICLO", agent.cycle || "", 10);
    cell(r1 + c1w + c2w, hy, c3w, "SEMANA EPI.", agent.week || "", 10);
    cell(r1 + c1w + c2w + c3w, hy, c4w, "DATA DA PRODUÇÃO", format(new Date(), "dd/MM/yyyy"), 11);

    // Linha 2 — PRODUÇÃO (Logradouro grande, Quarteirão destacado)
    const y2 = hy + rowH;
    const lgW = r1w * 0.72;
    const qtW = r1w - lgW;
    doc.line(r1 + lgW, y2, r1 + lgW, y2 + rowH);
    const logradouro = agent.address
      ? `${agent.address}${agent.neighborhood ? ` — ${agent.neighborhood}` : ""}`
      : (agent.street || "");
    cell(r1, y2, lgW, "LOGRADOURO", logradouro, 11);
    // Quarteirão em destaque
    doc.setFillColor(250, 250, 250);
    doc.rect(r1 + lgW + 0.2, y2 + 0.2, qtW - 0.4, rowH - 0.4, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(110, 110, 110);
    doc.text("QUARTEIRÃO", r1 + lgW + qtW / 2, y2 + 2.5, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text(agent.block || "—", r1 + lgW + qtW / 2, y2 + rowH - 1.5, { align: "center" });

    // Linha 3 — RESPONSÁVEL (Agente, Matrícula, Origem, Precisão)
    const y3 = hy + rowH * 2;
    const a1 = r1w * 0.48, a2 = r1w * 0.18, a3 = r1w * 0.17, a4 = r1w - a1 - a2 - a3;
    doc.line(r1 + a1, y3, r1 + a1, y3 + rowH);
    doc.line(r1 + a1 + a2, y3, r1 + a1 + a2, y3 + rowH);
    doc.line(r1 + a1 + a2 + a3, y3, r1 + a1 + a2 + a3, y3 + rowH);
    cell(r1, y3, a1, "AGENTE RESPONSÁVEL", agent.name || "", 11);
    cell(r1 + a1, y3, a2, "MATRÍCULA", agent.registrationId || "", 10);
    const origem = agent.locationSource === "gps" ? "GPS" : agent.locationSource === "manual" ? "Manual" : "—";
    cell(r1 + a1 + a2, y3, a3, "ORIGEM", origem, 10);
    const prec = agent.accuracy != null ? `±${Math.round(agent.accuracy)} m` : "—";
    cell(r1 + a1 + a2 + a3, y3, a4, "PRECISÃO", prec, 10);

    // Linha de auditoria (coordenadas discretas)
    if (agent.latitude != null && agent.longitude != null) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.setTextColor(140, 140, 140);
      doc.text(
        `Auditoria — lat ${agent.latitude.toFixed(6)}  ·  lng ${agent.longitude.toFixed(6)}`,
        hx, hy + totalH + 3
      );
      doc.setTextColor(0, 0, 0);
    }

    doc.setFontSize(8);
    doc.text(`Página ${pageNumber} de ${totalPages}`, pageWidth - margin - 20, pageHeight - 5);
  };


  // Group properties by street to organize the PDF
  const propertiesByStreet: Record<string, Property[]> = {};
  properties.forEach(p => {
    const street = p.street_name || "SEM NOME";
    if (!propertiesByStreet[street]) propertiesByStreet[street] = [];
    propertiesByStreet[street].push(p);
  });

  // Ordenação operacional canônica — número, sequência, complemento.
  // Nunca considera tipo do imóvel.
  properties = [...properties].sort(comparePropertyOrder);

  const streets = Object.keys(propertiesByStreet).sort();
  
  // Calculate total pages needed (approx 15 properties per page to keep it clean)
  const propertiesPerPage = 15;
  const totalPages = Math.max(1, Math.ceil(properties.length / propertiesPerPage));

  for (let i = 0; i < totalPages; i++) {
    if (i > 0) doc.addPage();
    
    drawHeader(i + 1, totalPages);
    
    const startIdx = i * propertiesPerPage;
    const endIdx = startIdx + propertiesPerPage;
    const pageProperties = properties.slice(startIdx, endIdx);
    console.log("Dados enviados ao PDF:", pageProperties);

    const tableData = pageProperties.map((p) => [
      p.street_name || "",
      p.side || "",
      p.number || "",
      p.sequence ?? "",
      p.complement || "",
      (p.type === 'residence' || p.type === 'residential') ? 'R' :
      (p.type === 'commerce' || p.type === 'commercial') ? 'C' :
      p.type === 'vacant_lot' ? 'TB' :
      p.type === 'strategic_point' ? 'PE' : 'O',
      p.inhabitants || 0
    ]);

    autoTable(doc, {
      startY: (agent.latitude != null ? 42 : 39),
      head: [['RUA OU LOGRADOURO', 'LADO', 'NÚMERO', 'SEQ.', 'COMP.', 'TIPO', 'HAB.']],
      body: tableData,
      theme: 'grid',
      headStyles: { 
        fillColor: [240, 240, 240], 
        textColor: [0, 0, 0], 
        fontStyle: 'bold', 
        fontSize: 8, 
        halign: 'center',
        lineWidth: 0.1,
        lineColor: [0, 0, 0]
      },
      styles: { 
        fontSize: 8, 
        cellPadding: 2,
        lineWidth: 0.1,
        lineColor: [0, 0, 0]
      },
      columnStyles: {
        0: { cellWidth: 70 },
        1: { cellWidth: 20, halign: 'center' },
        2: { cellWidth: 30, halign: 'center' },
        3: { cellWidth: 20, halign: 'center' },
        4: { cellWidth: 30, halign: 'center' },
        5: { cellWidth: 20, halign: 'center' },
        6: { cellWidth: 20, halign: 'center' }
      },
      margin: { left: margin, right: margin }
    });

    if (i === totalPages - 1) {
      const finalY = (doc as any).lastAutoTable.finalY || 38;
      
      const footerY = Math.min(finalY + 5, pageHeight - 45);
      
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      
      // Totals Box
      doc.rect(margin, footerY, pageWidth - (2 * margin), 15);
      doc.line(margin + 40, footerY, margin + 40, footerY + 15);
      doc.line(margin + 80, footerY, margin + 80, footerY + 15);
      doc.line(margin + 120, footerY, margin + 120, footerY + 15);
      doc.line(margin + 160, footerY, margin + 160, footerY + 15);
      doc.line(margin + 200, footerY, margin + 200, footerY + 15);
      doc.line(margin + 240, footerY, margin + 240, footerY + 15);

      doc.text("RESIDENCIAL (R)", margin + 2, footerY + 5);
      doc.text(metadata.residences.toString(), margin + 20, footerY + 12, { align: "center" });

      doc.text("COMERCIAL (C)", margin + 42, footerY + 5);
      doc.text(metadata.commerce.toString(), margin + 60, footerY + 12, { align: "center" });

      doc.text("TERRENO BALDIO (TB)", margin + 82, footerY + 5);
      doc.text(metadata.lots.toString(), margin + 100, footerY + 12, { align: "center" });

      doc.text("P. ESTRATÉGICO (PE)", margin + 122, footerY + 5);
      doc.text(metadata.strategicPoints.toString(), margin + 140, footerY + 12, { align: "center" });

      doc.text("OUTROS (O)", margin + 162, footerY + 5);
      doc.text((metadata.others || 0).toString(), margin + 180, footerY + 12, { align: "center" });

      doc.text("TOTAL GERAL", margin + 202, footerY + 5);
      doc.text(metadata.total.toString(), margin + 220, footerY + 12, { align: "center" });

      doc.text("HABITANTES", margin + 242, footerY + 5);
      doc.text((metadata.inhabitants || 0).toString(), margin + 260, footerY + 12, { align: "center" });

      // QR Code
      try {
        const qrData = `RG-BLOCK-${agent.block}-${format(new Date(), "yyyyMMdd")}`;
        const qrCodeUrl = await QRCode.toDataURL(qrData);
        doc.addImage(qrCodeUrl, 'PNG', pageWidth - margin - 25, pageHeight - 35, 20, 20);
        doc.setFontSize(6);
        doc.text("VALIDAÇÃO DIGITAL", pageWidth - margin - 25, pageHeight - 12);
      } catch (err) {
        console.error("QR Code generation failed", err);
      }

      // Signatures
      const sigWidth = 60;
      const sigY = pageHeight - 20;
      
      doc.line(margin, sigY, margin + sigWidth, sigY);
      doc.text("ASSINATURA DO AGENTE", margin + (sigWidth / 2), sigY + 5, { align: "center" });
      
      doc.line(pageWidth / 2 - (sigWidth / 2), sigY, pageWidth / 2 + (sigWidth / 2), sigY);
      doc.text("ASSINATURA DO SUPERVISOR", pageWidth / 2, sigY + 5, { align: "center" });
    }
  }

  return doc;
};

export const uploadBlockPDF = async (doc: jsPDF, blockNumber: string, municipality: string) => {
  const { supabase } = await import("@/integrations/supabase/client");
  const pdfBlob = doc.output('blob');
  const fileName = `RG_QTR_${blockNumber}_${municipality.toUpperCase()}_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`;
  const filePath = `${blockNumber}/${fileName}`;

  const { data, error } = await supabase.storage
    .from('block-reports')
    .upload(filePath, pdfBlob, {
      contentType: 'application/pdf',
      upsert: true
    });

  if (error) throw error;
  return data;
};

