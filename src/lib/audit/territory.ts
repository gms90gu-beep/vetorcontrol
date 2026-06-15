/**
 * territory.ts — Auditoria territorial (Fase F).
 *
 * Para cada block_id referenciado em boletins_rg do usuário, valida:
 *   - existe em blocks?
 *   - tem ao menos 1 properties ligado?
 *   - aparece no cache local (offlineDb.boletins_rg)?
 *
 * Realça block_ids com inServer=true mas renderedCount=0 — o caso
 * "quarteirão sumiu da tela mas existe no banco".
 */

import { supabase } from '@/integrations/supabase/client';
import { db as offlineDb } from '@/lib/offline/db';

export interface TerritoryRow {
  block_id: string;
  inServer: boolean;
  inProperties: boolean;
  inLocal: boolean;
  renderedCount: number;
  ok: boolean;
}

export async function auditTerritory(userId: string): Promise<TerritoryRow[]> {
  if (!userId) return [];

  const { data: serverRG } = await (supabase as any)
    .from('boletins_rg').select('block_id').eq('agent_id', userId);
  const blockIds = Array.from(
    new Set(((serverRG ?? []) as any[]).map((r) => r.block_id).filter(Boolean) as string[]),
  );
  if (!blockIds.length) return [];

  const [{ data: blocks }, { data: props }] = await Promise.all([
    (supabase as any).from('blocks').select('id').in('id', blockIds),
    (supabase as any).from('properties').select('block_id').in('block_id', blockIds),
  ]);
  const blocksSet = new Set(((blocks ?? []) as any[]).map((b) => b.id));
  const propsCount = new Map<string, number>();
  for (const p of (props ?? []) as any[]) {
    propsCount.set(p.block_id, (propsCount.get(p.block_id) ?? 0) + 1);
  }

  const localRows = await offlineDb.boletins_rg.toArray();
  const localByBlock = new Map<string, number>();
  for (const r of localRows) {
    if (r.data?.agent_id !== userId) continue;
    const bid = r.data?.block_id;
    if (!bid) continue;
    localByBlock.set(bid, (localByBlock.get(bid) ?? 0) + 1);
  }

  return blockIds.map((block_id): TerritoryRow => {
    const inServer = blocksSet.has(block_id);
    const inProperties = (propsCount.get(block_id) ?? 0) > 0;
    const renderedCount = localByBlock.get(block_id) ?? 0;
    const inLocal = renderedCount > 0;
    return {
      block_id,
      inServer,
      inProperties,
      inLocal,
      renderedCount,
      ok: inServer && inProperties && inLocal,
    };
  });
}
