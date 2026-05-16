import jsPDF from "jspdf";
import "jspdf-autotable";
import QRCode from "qrcode";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Property {
  number: string;
  complement: string | null;
  type: string;
  status: string | null;
  observations: string | null;
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
  const drawHeader = () => {
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("BOLETIM OPERACIONAL - RECONHECIMENTO GEOGRÁFICO (RG)", pageWidth / 2, 15, { align: "center" });

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    
    // Line 1
    doc.text(`MUNICÍPIO: ${agent.municipality || "---"}`, margin, 25);
    doc.text(`AGENTE: ${agent.name || "---"}`, 100, 25);
    doc.text(`MATRÍCULA: ${agent.registrationId || "---"}`, 200, 25);
    
    // Line 2
    doc.text(`CICLO: ${agent.cycle || "---"}`, margin, 32);
    doc.text(`SEMANA: ${agent.week || "---"}`, 50, 32);
    doc.text(`QUARTEIRÃO: ${agent.block || filterInfo.value || "---"}`, 100, 32);
    doc.text(`DATA GERAÇÃO: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 200, 32);

    doc.line(margin, 35, pageWidth - margin, 35);
  };

  drawHeader();

  // Table
  const tableData = properties.map((p) => [
    p.number,
    p.complement || "",
    p.type === 'residence' ? 'Residencial' : 
    p.type === 'commerce' ? 'Comercial' : 
    p.type === 'vacant_lot' ? 'Terreno Baldio' : 
    p.type === 'strategic_point' ? 'Ponto Estratégico' : 'Outro',
    p.status === 'active' ? 'Ativo' : p.status === 'pending' ? 'Pendente' : 'Inativo',
    p.observations || ""
  ]);

  (doc as any).autoTable({
    startY: 40,
    head: [['Nº IMÓVEL', 'COMPLEMENTO', 'TIPO', 'SITUAÇÃO', 'OBSERVAÇÕES']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: 40 },
      2: { cellWidth: 40 },
      3: { cellWidth: 30 },
      4: { cellWidth: 'auto' }
    },
    margin: { left: margin, right: margin }
  });

  const finalY = (doc as any).lastAutoTable.finalY || 40;

  // Footer & Signatures
  const drawFooter = async () => {
    const footerY = pageHeight - 45;
    
    doc.line(margin, footerY, pageWidth - margin, footerY);
    
    // Totals
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("TOTAIS OPERACIONAIS:", margin, footerY + 5);
    
    doc.setFont("helvetica", "normal");
    const totalsText = `Total Imóveis: ${metadata.total}  |  Residências: ${metadata.residences}  |  Comércios: ${metadata.commerce}  |  T. Baldios: ${metadata.lots}  |  P. Estratégicos: ${metadata.strategicPoints}`;
    doc.text(totalsText, margin, footerY + 10);

    // QR Code
    try {
      const qrData = `RG-VAL-${agent.registrationId}-${format(new Date(), "yyyyMMdd")}`;
      const qrCodeUrl = await QRCode.toDataURL(qrData);
      doc.addImage(qrCodeUrl, 'PNG', pageWidth - margin - 25, footerY + 5, 20, 20);
      doc.setFontSize(6);
      doc.text("VALIDAÇÃO DIGITAL", pageWidth - margin - 25, footerY + 27);
    } catch (err) {
      console.error("QR Code generation failed", err);
    }

    // Signatures
    const sigWidth = 60;
    const sigY = pageHeight - 15;
    
    doc.line(margin, sigY, margin + sigWidth, sigY);
    doc.text("ASSINATURA DO AGENTE", margin + (sigWidth / 2), sigY + 5, { align: "center" });
    
    doc.line(pageWidth / 2 - (sigWidth / 2), sigY, pageWidth / 2 + (sigWidth / 2), sigY);
    doc.text("ASSINATURA DO SUPERVISOR", pageWidth / 2, sigY + 5, { align: "center" });

    // Page numbers
    const totalPages = doc.internal.pages.length - 1;
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.text(`Página ${i} de ${totalPages}`, pageWidth - margin - 20, pageHeight - 5);
    }
  };

  await drawFooter();

  return doc;
};
