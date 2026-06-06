import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import { format } from "date-fns";
import { translate } from "./translations";

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

  // Header Helper
  const drawHeader = (pageNumber: number, totalPages: number) => {
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("BOLETIM OPERACIONAL - RECONHECIMENTO GEOGRÁFICO (RG)", pageWidth / 2, 12, { align: "center" });

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    
    // Header Grid (reproducing the physical form layout)
    doc.rect(margin, 18, pageWidth - (2 * margin), 15);
    
    // Vertical lines for header
    doc.line(40, 18, 40, 33);
    doc.line(100, 18, 100, 33);
    doc.line(150, 18, 150, 33);
    doc.line(200, 18, 200, 33);
    
    doc.text("UF: CE", margin + 2, 22);
    doc.text(`MUNICÍPIO: ${agent.municipality || ""}`, 42, 22);
    doc.text(`LOCALIDADE: ${agent.street || ""}`, 102, 22);
    doc.text(`QUARTEIRÃO: ${agent.block || ""}`, 152, 22);
    doc.text(`DATA: ${format(new Date(), "dd/MM/yyyy")}`, 202, 22);

    doc.line(margin, 26, pageWidth - margin, 26);
    doc.text(`AGENTE: ${agent.name || ""}`, margin + 2, 30);
    doc.text(`MATRÍCULA: ${agent.registrationId || ""}`, 102, 30);
    doc.text(`CICLO: ${agent.cycle || ""}`, 152, 30);
    doc.text(`SEMANA: ${agent.week || ""}`, 202, 30);
    
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

  // Sort properties within each street by sequence
  Object.keys(propertiesByStreet).forEach(street => {
    propertiesByStreet[street].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
  });

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

    const tableData = pageProperties.map((p, idx) => [
      p.street_name || "",
      p.side || "",
      p.number || "",
      p.sequence || startIdx + idx + 1,
      p.complement || "",
      (p.type === 'residence' || p.type === 'residential') ? 'R' : 
      (p.type === 'commerce' || p.type === 'commercial') ? 'C' : 
      p.type === 'vacant_lot' ? 'TB' : 
      p.type === 'strategic_point' ? 'PE' : 'O',
      p.inhabitants || 0
    ]);

    autoTable(doc, {
      startY: 38,
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

