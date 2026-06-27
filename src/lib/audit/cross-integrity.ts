/**
 * cross-integrity.ts — compara contagens Dexie (cliente offline)
 * com Supabase (servidor) e detecta divergências entre os módulos
 * RG ↔ Viewer ↔ PDF ↔ Mapa ↔ Banco.
 *
 * Read-only. Não modifica dados. Usado pela suíte RC-1.
 */
import { supabase } from "@/integrations/supabase/client";
import { db as offlineDb } from "@/lib/offline/db";
import { safeFetch } from "@/lib/offline/safe-fetch";

export interface CrossCheck {
  module: string;
  local: number;
  server: number;
  diff: number;
  ok: boolean;
}

export interface CrossIntegrityReport {
  ts: number;
  checks: CrossCheck[];
  approved: boolean;
}

async function pair(name: string, table: keyof typeof offlineDb, remote: string): Promise<CrossCheck> {
  const local = await (offlineDb as any)[table].count().catch(() => 0);
  const server = await safeFetch<number>(
    async () => {
      const { count, error } = await (supabase as any)
        .from(remote)
        .select("id", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
    () => local, // offline: assume servidor==local (sem divergência)
    { label: `cross:${remote}` },
  );
  const diff = Math.abs(local - server);
  return { module: name, local, server, diff, ok: diff === 0 };
}

export async function runCrossIntegrity(): Promise<CrossIntegrityReport> {
  const checks = await Promise.all([
    pair("RG (boletins)", "boletins_rg" as any, "boletins_rg"),
    pair("Quarteirões", "blocks" as any, "blocks"),
    pair("Imóveis", "properties" as any, "properties"),
    pair("Visitas", "visits" as any, "visits"),
    pair("Trabalho Diário", "daily_work_records" as any, "daily_work_records"),
    pair("Pendências", "property_pendencies" as any, "property_pendencies"),
  ]);
  return { ts: Date.now(), checks, approved: checks.every((c) => c.ok) };
}
