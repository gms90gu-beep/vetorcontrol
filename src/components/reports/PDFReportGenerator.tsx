import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export async function generateOperationalPDF(elementId: string, kpiData: any) {
  const element = document.getElementById(elementId);
  if (!element) return;

  try {
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
      onclone: (clonedDoc) => {
        // You can modify the cloned element here if needed
        const clonedElement = clonedDoc.getElementById(elementId);
        if (clonedElement) {
          clonedElement.style.padding = "20px";
          // Hide elements that shouldn't be in PDF
          const buttons = clonedElement.querySelectorAll("button");
          buttons.forEach(b => b.style.display = "none");
          const filters = clonedElement.querySelector(".reports-filters");
          if (filters) (filters as HTMLElement).style.display = "none";
        }
      }
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4"
    });

    const imgWidth = 210;
    const pageHeight = 297;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft >= 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    const fileName = `Relatorio_Operacional_${format(new Date(), "dd_MM_yyyy_HHmm")}.pdf`;
    pdf.save(fileName);
    return true;
  } catch (error) {
    console.error("Error generating PDF:", error);
    return false;
  }
}
