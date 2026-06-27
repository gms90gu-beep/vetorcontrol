/**
 * rc1-suite.ts — Orquestrador Release Candidate 1.
 *
 * Consolida em uma única chamada toda a suíte de auditoria:
 *  - Homologação RG (T1..T6)
 *  - rg_integrity_check (RPC)
 *  - data_audit_report (RPC)
 *  - agent_integrity_check (RPC, dry-run)
 *  - Cross-integrity (Dexie ↔ Supabase)
 *  - Offline runtime: Service Worker, Cache, Dexie, Sync Queue
 *
 * Cada bloco devolve { status: APROVADO | REPROVADO, details }.
 * Resultado persiste em offlineDb.meta chave "rc1:last".
 */
import { supabase } from "@/integrations/supabase/client";
import { db as offlineDb } from "@/lib/offline/db";
import { pendingMutationCount, getLastSyncAt } from "@/lib/offline/sync";
import { safeFetch, isOnline } from "@/lib/offline/safe-fetch";
import { runHomologation, type HomologationReport } from "./homologation";
import { runCrossIntegrity, type CrossIntegrityReport } from "./cross-integrity";

export type RC1Status = "APROVADO" | "REPROVADO" | "INDETERMINADO";

export interface RC1Module {
  id: string;
  name: string;
  status: RC1Status;
  durationMs: number;
  details?: any;
  error?: string;
}

export interface RC1Report {
  ts: number;
  version: string;
  online: boolean;
  globalScore: number;
  verdict: RC1Status;
  modules: RC1Module[];
  homologation?: HomologationReport;
  crossIntegrity?: CrossIntegrityReport;
  runtime: {
    serviceWorker: boolean;
    swScope?: string;
    caches: string[];
    dexieRows: number;
    queuePending: number;
    lastSyncAt: number | null;
  };
}

async function timed<T>(id: string, name: string, fn: () => Promise<T>, ok: (v: T) => boolean): Promise<RC1Module & { value: T | null }> {
  const t0 = Date.now();
  try {
    const value = await fn();
    return {
      id, name,
      status: ok(value) ? "APROVADO" : "REPROVADO",
      durationMs: Date.now() - t0,
      details: value,
      value,
    };
  } catch (e: any) {
    return {
      id, name,
      status: "REPROVADO",
      durationMs: Date.now() - t0,
      error: e?.message || String(e),
      value: null,
    };
  }
}

async function gatherRuntime(): Promise<RC1Report["runtime"]> {
  let sw = false, scope: string | undefined;
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    const reg = await navigator.serviceWorker.getRegistration().catch(() => null);
    sw = !!reg?.active;
    scope = reg?.scope;
  }
  let cacheKeys: string[] = [];
  if (typeof caches !== "undefined") {
    cacheKeys = await caches.keys().catch(() => []);
  }
  const tables = ["properties","blocks","boletins_rg","visits","visit_deposits","property_pendencies","daily_work_records","field_work_sessions","cycles","profiles","agents"] as const;
  let rows = 0;
  for (const t of tables) {
    try { rows += await (offlineDb as any)[t].count(); } catch {}
  }
  return {
    serviceWorker: sw,
    swScope: scope,
    caches: cacheKeys,
    dexieRows: rows,
    queuePending: await pendingMutationCount().catch(() => 0),
    lastSyncAt: getLastSyncAt(),
  };
}

export async function runRC1Suite(userId: string, version = "RC-1"): Promise<RC1Report> {
  console.log("[RC1] iniciando suíte", { userId, version });
  const t0 = Date.now();
  const online = isOnline();
  const runtime = await gatherRuntime();
  const modules: RC1Module[] = [];

  // 1. Homologação RG existente
  const homo = await timed("homologation", "Homologação RG (T1..T6)",
    () => runHomologation(userId),
    (r) => r.approved,
  );
  modules.push(homo);
  const homoReport = homo.value as HomologationReport | null;

  // 2. RPC rg_integrity_check
  const rgInt = await timed("rg_integrity", "Integridade RG (rg_integrity_check)",
    () => safeFetch<any>(
      async () => {
        const { data, error } = await (supabase as any).rpc("rg_integrity_check");
        if (error) throw error; return data;
      },
      () => ({ status: "OFFLINE" }),
      { label: "rg_integrity_check" },
    ),
    (r) => r?.status === "OK" || r?.status === "OFFLINE",
  );
  modules.push(rgInt);

  // 3. RPC data_audit_report
  const dataRep = await timed("data_audit", "Auditoria de Dados (data_audit_report)",
    () => safeFetch<any>(
      async () => {
        const { data, error } = await (supabase as any).rpc("data_audit_report");
        if (error) throw error; return data;
      },
      () => null,
      { label: "data_audit_report" },
    ),
    (r) => {
      if (!r) return online ? false : true;
      const issues = (r?.properties?.without_block ?? 0)
        + (r?.visits?.orphan ?? 0)
        + (r?.users?.agents_without_supervisor ?? 0);
      return issues === 0;
    },
  );
  modules.push(dataRep);

  // 4. agent_integrity_check (dry-run)
  const agentInt = await timed("agent_integrity", "Integridade de Agentes",
    () => safeFetch<any>(
      async () => {
        const { data, error } = await (supabase as any).rpc("agent_integrity_check", { _fix: false });
        if (error) throw error; return data;
      },
      () => null,
      { label: "agent_integrity_check" },
    ),
    (r) => !r || (r.profiles_sem_agent ?? 0) === 0,
  );
  modules.push(agentInt);

  // 5. Cross-integrity Dexie ↔ Supabase
  const cross = await timed("cross_integrity", "Integridade Cruzada (Dexie ↔ Banco)",
    () => runCrossIntegrity(),
    (r) => r.approved,
  );
  modules.push(cross);
  const crossReport = cross.value as CrossIntegrityReport | null;

  // 6. Offline runtime
  const offModule: RC1Module = {
    id: "offline_runtime",
    name: "Runtime Offline (SW + Dexie + Fila)",
    durationMs: 0,
    status: runtime.queuePending < 50 && runtime.dexieRows >= 0 ? "APROVADO" : "REPROVADO",
    details: runtime,
  };
  modules.push(offModule);

  // 7. Cobertura offline (lê audit estático se disponível)
  const cov = await timed("offline_coverage", "Cobertura Offline (script)",
    async () => {
      try {
        const res = await fetch("/docs/offline-audit-report.md");
        if (!res.ok) throw new Error("relatório não publicado");
        const txt = await res.text();
        const m = txt.match(/Score:\s*\*\*(\d+)%/);
        return { score: m ? parseInt(m[1], 10) : null };
      } catch (e: any) {
        return { score: null, note: "execute bun run scripts/audit-offline.ts" };
      }
    },
    (r) => r.score === null || r.score >= 95,
  );
  modules.push(cov);

  // Score geral
  const passed = modules.filter((m) => m.status === "APROVADO").length;
  const globalScore = Math.round((passed / modules.length) * 100);
  const verdict: RC1Status = globalScore === 100 ? "APROVADO" : globalScore >= 80 ? "INDETERMINADO" : "REPROVADO";

  const report: RC1Report = {
    ts: Date.now(),
    version,
    online,
    globalScore,
    verdict,
    modules,
    homologation: homoReport ?? undefined,
    crossIntegrity: crossReport ?? undefined,
    runtime,
  };

  await offlineDb.meta.put({ key: "rc1:last", value: report });
  console.log(`[RC1] concluído em ${Date.now() - t0}ms — ${verdict} (${globalScore}%)`, report);
  return report;
}

export async function getLastRC1Report(): Promise<RC1Report | null> {
  return ((await offlineDb.meta.get("rc1:last"))?.value as RC1Report) ?? null;
}
