/**
 * rc1-report.ts — geração de relatório institucional (Markdown + PDF)
 * a partir de um RC1Report já executado por runRC1Suite.
 */
import jsPDF from "jspdf";
import type { RC1Report, RC1Module } from "./rc1-suite";

function fmt(ts: number) {
  return new Date(ts).toLocaleString("pt-BR");
}

export function toMarkdown(r: RC1Report): string {
  const passed = r.modules.filter((m) => m.status === "APROVADO");
  const failed = r.modules.filter((m) => m.status === "REPROVADO");
  const lines: string[] = [];
  lines.push(`# Relatório Release Candidate — ${r.version}`);
  lines.push("");
  lines.push(`Gerado em: **${fmt(r.ts)}**`);
  lines.push(`Conectividade: **${r.online ? "ONLINE" : "OFFLINE"}**`);
  lines.push(`Score Geral: **${r.globalScore}%**`);
  lines.push(`Parecer: **${r.verdict === "APROVADO" ? "✅ APROVADO PARA PRODUÇÃO" : r.verdict === "INDETERMINADO" ? "⚠️ APROVAÇÃO CONDICIONAL" : "❌ REPROVADO"}**`);
  lines.push("");
  lines.push("## Resumo por Módulo");
  lines.push("");
  lines.push("| Módulo | Status | Duração |");
  lines.push("|---|---|---|");
  for (const m of r.modules) {
    lines.push(`| ${m.name} | ${m.status} | ${m.durationMs} ms |`);
  }
  lines.push("");
  lines.push(`## Aprovados (${passed.length})`);
  passed.forEach((m) => lines.push(`- ${m.name}`));
  lines.push("");
  lines.push(`## Reprovados (${failed.length})`);
  if (failed.length === 0) lines.push("_Nenhum._");
  else failed.forEach((m) => lines.push(`- **${m.name}** — ${m.error || "ver detalhes"}`));
  lines.push("");
  lines.push("## Runtime Offline");
  lines.push(`- Service Worker: ${r.runtime.serviceWorker ? "ativo" : "inativo"}${r.runtime.swScope ? ` (${r.runtime.swScope})` : ""}`);
  lines.push(`- Caches: ${r.runtime.caches.length}`);
  lines.push(`- Registros em Dexie: ${r.runtime.dexieRows.toLocaleString("pt-BR")}`);
  lines.push(`- Fila de sincronização: ${r.runtime.queuePending}`);
  lines.push(`- Última sincronização: ${r.runtime.lastSyncAt ? fmt(r.runtime.lastSyncAt) : "—"}`);
  if (r.crossIntegrity) {
    lines.push("");
    lines.push("## Integridade Cruzada (Dexie ↔ Banco)");
    lines.push("| Módulo | Local | Servidor | Diff | OK |");
    lines.push("|---|---:|---:|---:|:-:|");
    for (const c of r.crossIntegrity.checks) {
      lines.push(`| ${c.module} | ${c.local} | ${c.server} | ${c.diff} | ${c.ok ? "✓" : "✗"} |`);
    }
  }
  if (r.homologation) {
    lines.push("");
    lines.push("## Homologação RG");
    for (const t of r.homologation.results) {
      lines.push(`- **${t.id}** ${t.name} — ${t.pass ? "✓" : "✗"}`);
    }
  }
  lines.push("");
  lines.push("---");
  lines.push("_Relatório gerado automaticamente pela suíte RC-1 do VetorControl._");
  return lines.join("\n");
}

export function downloadMarkdown(r: RC1Report) {
  const md = toMarkdown(r);
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rc1-report-${new Date(r.ts).toISOString().slice(0, 10)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadPdf(r: RC1Report) {
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
  line(`Release Candidate ${r.version}`, 18, true);
  line(`Gerado em ${fmt(r.ts)}`, 9);
  y += 6;
  line(`Score Geral: ${r.globalScore}%`, 12, true);
  line(`Parecer: ${r.verdict}`, 12, true);
  y += 6;
  line("Módulos", 13, true);
  for (const m of r.modules) {
    line(`• ${m.name} — ${m.status} (${m.durationMs} ms)${m.error ? ` — ${m.error}` : ""}`);
  }
  y += 6;
  line("Runtime Offline", 13, true);
  line(`SW: ${r.runtime.serviceWorker ? "ativo" : "inativo"} | Caches: ${r.runtime.caches.length} | Dexie: ${r.runtime.dexieRows} | Fila: ${r.runtime.queuePending}`);
  if (r.crossIntegrity) {
    y += 6;
    line("Integridade Cruzada", 13, true);
    for (const c of r.crossIntegrity.checks) {
      line(`• ${c.module}: local=${c.local} servidor=${c.server} diff=${c.diff} ${c.ok ? "OK" : "DIVERGÊNCIA"}`);
    }
  }
  doc.save(`rc1-report-${new Date(r.ts).toISOString().slice(0, 10)}.pdf`);
}
