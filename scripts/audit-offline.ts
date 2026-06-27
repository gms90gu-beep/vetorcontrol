#!/usr/bin/env bun
/**
 * audit-offline.ts — varre src/ procurando consultas Supabase sem fallback offline.
 *
 * Uso: bun run scripts/audit-offline.ts
 * Gera: docs/offline-audit-report.md
 *
 * Heurística:
 *  - Arquivo OK se importar de "@/lib/offline/repos" OU "@/lib/offline/safe-fetch"
 *    OU envolver `supabase.from(...)` em `safeFetch(`.
 *  - Arquivos *.functions.ts / *.server.ts são ignorados (rodam no servidor).
 *  - Arquivos de teste e mocks são ignorados.
 */

import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(process.cwd(), "src");
const OUT = join(process.cwd(), "docs", "offline-audit-report.md");

interface Finding {
  file: string;
  lines: number[];
  hasRepo: boolean;
  hasSafeFetch: boolean;
  isServer: boolean;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(entry)) acc.push(full);
  }
  return acc;
}

const findings: Finding[] = [];
const summary = {
  totalFiles: 0,
  filesWithSupabase: 0,
  filesOk: 0,
  filesProblem: 0,
  serverFiles: 0,
};

for (const file of walk(ROOT)) {
  summary.totalFiles++;
  if (/\.(test|spec)\.(ts|tsx)$/.test(file)) continue;
  const src = readFileSync(file, "utf8");
  const rel = relative(process.cwd(), file);
  const isServer = /\.functions\.ts$|\.server\.ts$|routes\/api\//.test(file);
  // Infra de sync/repos é a própria camada de rede — não precisa de fallback dela mesma.
  const isSyncInfra = /lib\/offline\/(sync|repos|reconciler|safe-fetch|cleanup-ghosts|safe-auth|role-cache)|sync\/(syncEngine|networkMonitor)/.test(file);
  if (isSyncInfra) continue;
  const lines: number[] = [];
  src.split("\n").forEach((l, i) => {
    if (/supabase\.from\s*\(/.test(l) || /supabase\.rpc\s*\(/.test(l)) lines.push(i + 1);
  });
  if (!lines.length) continue;
  summary.filesWithSupabase++;
  if (isServer) {
    summary.serverFiles++;
    continue;
  }
  const hasRepo = /@\/lib\/offline\/repos/.test(src);
  const hasSafeFetch = /@\/lib\/offline\/safe-fetch|safeFetch\s*\(/.test(src);
  const ok = hasRepo || hasSafeFetch;
  if (ok) summary.filesOk++;
  else summary.filesProblem++;
  findings.push({ file: rel, lines, hasRepo, hasSafeFetch, isServer });
}

findings.sort((a, b) => Number(a.hasRepo || a.hasSafeFetch) - Number(b.hasRepo || b.hasSafeFetch));

const problems = findings.filter((f) => !f.hasRepo && !f.hasSafeFetch);
const ok = findings.filter((f) => f.hasRepo || f.hasSafeFetch);

const md = `# Offline Audit Report

> Gerado automaticamente por \`scripts/audit-offline.ts\` em ${new Date().toISOString()}

## Resumo

| Métrica | Valor |
|---|---|
| Arquivos varridos | ${summary.totalFiles} |
| Arquivos com \`supabase.from/.rpc\` | ${summary.filesWithSupabase} |
| Server-only (ignorados) | ${summary.serverFiles} |
| **Client com fallback** | **${summary.filesOk}** |
| **Client SEM fallback** | **${summary.filesProblem}** |

Score: **${Math.round((summary.filesOk / Math.max(1, summary.filesOk + summary.filesProblem)) * 100)}%**

## ❌ Sem fallback (prioridade alta)

${problems.length === 0 ? "_Nenhum._" : problems.map((f) => `- \`${f.file}\` — linhas ${f.lines.slice(0, 6).join(", ")}${f.lines.length > 6 ? "…" : ""}`).join("\n")}

## ✅ Com fallback

${ok.length === 0 ? "_Nenhum._" : ok.map((f) => `- \`${f.file}\``).join("\n")}

## Como corrigir

1. Substituir \`supabase.from('x').select()\` por \`listRemoteOrCache({ name: 'x', remote: () => supabase.from('x').select() })\` (de \`@/lib/offline/repos\`).
2. Para escritas, usar \`createOffline / updateOffline / deleteOffline\` em vez de \`supabase.from(...).insert\`.
3. Para chamadas pontuais sem repo dedicado, envolver em \`safeFetch(remote, fallback, { label })\`.
`;

mkdirSync(join(process.cwd(), "docs"), { recursive: true });
writeFileSync(OUT, md, "utf8");
console.log(`[AUDIT] ${summary.filesProblem} arquivos sem fallback de ${summary.filesOk + summary.filesProblem} clientes. Relatório: ${OUT}`);
if (summary.filesProblem > 0) process.exitCode = 1;
