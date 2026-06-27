/**
 * go-live-report.ts — Parecer Executivo Go-Live (Markdown + PDF).
 */
import jsPDF from "jspdf";
import type { GoLiveReport } from "./go-live";

const fmt = (ts: number) => new Date(ts).toLocaleString("pt-BR");

export function toMarkdown(r: GoLiveReport): string {
  const lines: string[] = [];
  lines.push(`# Parecer Executivo — Certificação Go-Live`);
  lines.push("");
  lines.push(`Gerado em **${fmt(r.ts)}** — versão **${r.version}**`);
  lines.push(`Conectividade: **${r.online ? "ONLINE" : "OFFLINE"}**`);
  lines.push("");
  lines.push(`## Resultado`);
  lines.push(`- Score Global: **${r.globalScore}%**`);
  lines.push(`- RC-1: **${r.rc1.globalScore}%** (${r.rc1.verdict})`);
  lines.push(`- Performance: **${r.performance.score}%**`);
  lines.push(`- Segurança: **${r.security.score}%**`);
  lines.push("");
  lines.push(`## Parecer Técnico`);
  lines.push(`${r.conclusion}`);
  lines.push("");
  lines.push(`## Módulos RC-1`);
  for (const m of r.rc1.modules) {
    lines.push(`- ${m.status === "APROVADO" ? "✅" : "❌"} ${m.name} (${m.durationMs} ms)${m.error ? ` — ${m.error}` : ""}`);
  }
  lines.push("");
  lines.push(`## Performance`);
  lines.push(`| Métrica | ms | OK |`);
  lines.push(`|---|---:|:-:|`);
  for (const p of r.performance.metrics) {
    lines.push(`| ${p.name}${p.detail ? ` — ${p.detail}` : ""} | ${p.ms} | ${p.ok ? "✓" : "✗"} |`);
  }
  lines.push("");
  lines.push(`## Segurança`);
  for (const s of r.security.checks) {
    lines.push(`- ${s.pass ? "✅" : "❌"} ${s.name}${s.detail ? ` — ${s.detail}` : ""}`);
  }
  if (r.rc1.crossIntegrity) {
    lines.push("");
    lines.push(`## Integridade Cruzada (Dexie ↔ Banco)`);
    for (const c of r.rc1.crossIntegrity.checks) {
      lines.push(`- ${c.ok ? "✅" : "❌"} ${c.module}: local=${c.local} servidor=${c.server} diff=${c.diff}`);
    }
  }
  lines.push("");
  lines.push("---");
  lines.push("_Relatório gerado automaticamente pela suíte Go-Live do VetorControl._");
  return lines.join("\n");
}

export function downloadMarkdown(r: GoLiveReport) {
  const md = toMarkdown(r);
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `golive-report-${new Date(r.ts).toISOString().slice(0, 10)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadPdf(r: GoLiveReport) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 40;
  let y = margin;
  const line = (txt: string, size = 10, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const wrapped = doc.splitTextToSize(txt, 515);
    for (const w of wrapped) {
      if (y > 780) { doc.addPage(); y = margin; }
      doc.text(w, margin, y);
      y += size + 4;
    }
  };
  line(`Parecer Executivo — Certificação Go-Live`, 18, true);
  line(`Gerado em ${fmt(r.ts)} — ${r.version}`, 9);
  y += 6;
  line(`Score Global: ${r.globalScore}%`, 14, true);
  line(`Parecer: ${r.verdict}`, 12, true);
  line(r.conclusion, 10);
  y += 6;
  line("Resumo", 13, true);
  line(`RC-1: ${r.rc1.globalScore}% (${r.rc1.verdict})`);
  line(`Performance: ${r.performance.score}%`);
  line(`Segurança: ${r.security.score}%`);
  y += 6;
  line("Módulos RC-1", 13, true);
  for (const m of r.rc1.modules) {
    line(`• ${m.name} — ${m.status} (${m.durationMs} ms)${m.error ? ` — ${m.error}` : ""}`);
  }
  y += 6;
  line("Performance", 13, true);
  for (const p of r.performance.metrics) {
    line(`• ${p.name}: ${p.ms} ms ${p.ok ? "OK" : "LENTO"}${p.detail ? ` — ${p.detail}` : ""}`);
  }
  y += 6;
  line("Segurança", 13, true);
  for (const s of r.security.checks) {
    line(`• ${s.name}: ${s.pass ? "OK" : "FALHA"}${s.detail ? ` — ${s.detail}` : ""}`);
  }
  if (r.rc1.crossIntegrity) {
    y += 6;
    line("Integridade Cruzada", 13, true);
    for (const c of r.rc1.crossIntegrity.checks) {
      line(`• ${c.module}: local=${c.local} servidor=${c.server} diff=${c.diff} ${c.ok ? "OK" : "DIVERGÊNCIA"}`);
    }
  }
  doc.save(`golive-report-${new Date(r.ts).toISOString().slice(0, 10)}.pdf`);
}
