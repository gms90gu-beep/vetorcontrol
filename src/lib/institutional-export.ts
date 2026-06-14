/**
 * Institutional export helpers — PDF (jsPDF), XLSX-friendly TSV, and CSV.
 * Used for official outputs in Wave C dashboards/reports.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface InstitutionalHeader {
  title: string;
  subtitle?: string;
  municipality?: string;
  issuedBy?: string;
  reference?: string;
}

export function applyInstitutionalHeader(pdf: jsPDF, h: InstitutionalHeader) {
  const W = pdf.internal.pageSize.getWidth();
  pdf.setFillColor(15, 23, 42);
  pdf.rect(0, 0, W, 18, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(13);
  pdf.setFont("helvetica", "bold");
  pdf.text("VIGILÂNCIA EM SAÚDE — CONTROLE DE ENDEMIAS", W / 2, 8, { align: "center" });
  pdf.setFontSize(9);
  pdf.setFont("helvetica", "normal");
  pdf.text(h.municipality || "Município", W / 2, 13, { align: "center" });

  pdf.setTextColor(0, 0, 0);
  pdf.setFontSize(14);
  pdf.setFont("helvetica", "bold");
  pdf.text(h.title, W / 2, 26, { align: "center" });
  if (h.subtitle) {
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.text(h.subtitle, W / 2, 32, { align: "center" });
  }
  return h.subtitle ? 36 : 32;
}

export function applyInstitutionalFooter(pdf: jsPDF, h: InstitutionalHeader) {
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const total = (pdf as any).internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i);
    pdf.setDrawColor(200);
    pdf.line(10, H - 12, W - 10, H - 12);
    pdf.setFontSize(8);
    pdf.setTextColor(80);
    const left = `Emitido em ${new Date().toLocaleString("pt-BR")}`;
    const center = h.issuedBy ? `Emissor: ${h.issuedBy}` : "";
    const right = `Página ${i}/${total}`;
    pdf.text(left, 10, H - 6);
    if (center) pdf.text(center, W / 2, H - 6, { align: "center" });
    pdf.text(right, W - 10, H - 6, { align: "right" });
    if (h.reference) {
      pdf.text(`Ref: ${h.reference}`, 10, H - 2);
    }
  }
}

export interface InstitutionalSection {
  title: string;
  head: string[];
  body: (string | number)[][];
}

export function generateInstitutionalPDF(
  filename: string,
  header: InstitutionalHeader,
  sections: InstitutionalSection[],
) {
  const pdf = new jsPDF();
  let y = applyInstitutionalHeader(pdf, header);
  for (const s of sections) {
    y += 4;
    pdf.setFontSize(11);
    pdf.setFont("helvetica", "bold");
    pdf.text(s.title, 14, y);
    autoTable(pdf, {
      startY: y + 2,
      head: [s.head],
      body: s.body.map((r) => r.map(String)),
      theme: "grid",
      headStyles: { fillColor: [30, 64, 175], textColor: 255, fontSize: 9 },
      styles: { fontSize: 8, cellPadding: 2 },
      margin: { left: 10, right: 10, bottom: 18 },
    });
    y = (pdf as any).lastAutoTable.finalY + 2;
  }
  applyInstitutionalFooter(pdf, header);
  pdf.save(filename);
}

// ─────────────────────────────────────────────────────────────
// CSV / XLSX (Excel-compatible TSV with BOM)
// ─────────────────────────────────────────────────────────────
function escapeCsvCell(v: any): string {
  if (v == null) return "";
  const s = String(v);
  if (/[";\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadCSV(filename: string, header: string[], rows: (string | number | null)[][]) {
  const lines = [header.join(";"), ...rows.map((r) => r.map(escapeCsvCell).join(";"))];
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, filename);
}

/**
 * Excel-compatible XLS via HTML table — opens natively in Excel/LibreOffice.
 * Avoids a heavy XLSX library while remaining institutional.
 */
export function downloadXLSX(filename: string, sheetName: string, header: string[], rows: (string | number | null)[][]) {
  const head = `<tr>${header.map((h) => `<th style="background:#1e40af;color:#fff;padding:6px;border:1px solid #999;">${h}</th>`).join("")}</tr>`;
  const body = rows
    .map(
      (r) =>
        `<tr>${r
          .map((c) => `<td style="padding:4px;border:1px solid #ccc;">${c == null ? "" : String(c)}</td>`)
          .join("")}</tr>`,
    )
    .join("");
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>${sheetName}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head>
<body><table>${head}${body}</table></body></html>`;
  const blob = new Blob(["\uFEFF" + html], { type: "application/vnd.ms-excel;charset=utf-8" });
  triggerDownload(blob, filename.endsWith(".xls") || filename.endsWith(".xlsx") ? filename : `${filename}.xls`);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
