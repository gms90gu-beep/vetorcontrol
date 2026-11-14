import type jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatCollectionNumber, tubitoNumber, type TubitoReportRow } from "@/lib/collection-tubitos";

export function appendTubitoReportTable(pdf: jsPDF, rows: TubitoReportRow[], afterY: number) {
  if (!rows.length) return afterY;
  let titleY = afterY + 6;
  if (titleY > pdf.internal.pageSize.getHeight() - 28) {
    pdf.addPage();
    titleY = 12;
  }
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(15, 23, 42);
  pdf.text("COLETAS REALIZADAS — TUBITOS NUMERADOS", 6, titleY);
  autoTable(pdf, {
    startY: titleY + 2,
    head: [["Data", "Agente", "Coleta", "Tubito", "Depósito", "Quarteirão", "Logradouro", "Nº imóvel", "Tipo de imóvel"]],
    body: rows.map(row => [
      row.date, row.agent, formatCollectionNumber(row.collection_number, row.collection_year), tubitoNumber(row), row.deposit_type,
      row.block, row.street, row.property, row.propertyType,
    ]),
    theme: "grid",
    styles: { fontSize: 7, cellPadding: 1.2 },
    margin: { left: 6, right: 6, bottom: 20 },
  });
  return (pdf as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}
