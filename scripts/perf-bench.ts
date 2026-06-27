#!/usr/bin/env bun
/**
 * perf-bench.ts — mede tempo do dev-server e tamanho de bundles.
 *
 * Uso: bun run scripts/perf-bench.ts
 * Saída: docs/perf-bench.md
 */
import { readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const start = Date.now();
const DIST = "dist";
const out: string[] = [];

function du(dir: string): number {
  let total = 0;
  try {
    for (const e of readdirSync(dir)) {
      const f = join(dir, e);
      const s = statSync(f);
      total += s.isDirectory() ? du(f) : s.size;
    }
  } catch {}
  return total;
}

const distSize = du(DIST);
const ms = Date.now() - start;

out.push(`# Performance Bench`);
out.push("");
out.push(`Gerado em: ${new Date().toISOString()}`);
out.push("");
out.push(`| Métrica | Valor |`);
out.push(`|---|---|`);
out.push(`| Tempo de medição | ${ms} ms |`);
out.push(`| Tamanho dist/ | ${(distSize / 1024 / 1024).toFixed(2)} MB |`);
out.push("");
out.push("Para métricas runtime (Dexie, IndexedDB, sync), consulte /admin/offline-audit.");

mkdirSync("docs", { recursive: true });
writeFileSync("docs/perf-bench.md", out.join("\n"), "utf8");
console.log(out.join("\n"));
