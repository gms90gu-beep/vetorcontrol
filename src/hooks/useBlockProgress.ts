/**
 * useBlockProgress
 * Hook único de leitura do progresso do quarteirão. Todos os consumidores
 * (Trabalho, Dashboard, OperationalPanel, Supervisor, RG, Mapas) devem usar
 * este hook em vez de recalcular a partir das visitas.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getBlockProgress,
  checkIntegrity,
  type BlockProgress,
} from "@/lib/offline/repos/blockProgress";
import { onSyncChange } from "@/lib/offline/sync";
import { db } from "@/lib/offline/db";
import { enqueueRpcOffline } from "@/lib/offline/repos";

export interface UseBlockProgressOptions {
  cycle_id: string | null | undefined;
  block_number: string | number | null | undefined;
  agent_id: string | null | undefined;
  /** Módulo consumidor (para auditoria). */
  module: string;
}

export function useBlockProgress(opts: UseBlockProgressOptions) {
  const { cycle_id, block_number, agent_id, module } = opts;
  const [progress, setProgress] = useState<BlockProgress | null>(null);
  const [loading, setLoading] = useState<boolean>(!!(cycle_id && block_number && agent_id));
  const migrationLoggedRef = useRef(false);

  useEffect(() => {
    if (migrationLoggedRef.current) return;
    migrationLoggedRef.current = true;
    try {
      console.info("[BLOCK_PROGRESS_MIGRATION]", { module, hook: "useBlockProgress", version: 1 });
    } catch {}
  }, [module]);

  const refresh = useCallback(async () => {
    if (!cycle_id || !block_number || !agent_id) return;
    setLoading(true);
    try {
      const row = await getBlockProgress(cycle_id, String(block_number), agent_id);
      setProgress(row);
      try {
        console.log("[BLOCK_PROGRESS_READ]", {
          module,
          cycle_id,
          block_number: String(block_number),
          agent_id,
          status: row?.status ?? null,
          total: row?.total_properties ?? 0,
          visitados: row?.visited_properties ?? 0,
          pendentes: row?.pending_properties ?? 0,
          percentual: row?.completion_percentage ?? 0,
        });
      } catch {}
      if (row && !checkIntegrity(row, `useBlockProgress:${module}`)) {
        try {
          await enqueueRpcOffline("recompute_block_progress", {
            _cycle_id: cycle_id,
            _block_number: String(block_number),
            _agent_id: agent_id,
          });
        } catch {}
      }
    } finally {
      setLoading(false);
    }
  }, [cycle_id, block_number, agent_id, module]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Atualiza automaticamente após cada sync bem-sucedido.
  useEffect(() => {
    const off = onSyncChange(() => { void refresh(); });
    return () => { off(); };
  }, [refresh]);

  // Também escuta mudanças locais no Dexie (visitas offline).
  useEffect(() => {
    const t = setInterval(async () => {
      if (!cycle_id || !block_number || !agent_id) return;
      const all = await db.block_progress.toArray();
      const hit = all.find(
        (r) =>
          r.data?.cycle_id === cycle_id &&
          String(r.data?.block_number) === String(block_number) &&
          r.data?.agent_id === agent_id,
      );
      if (hit?.data) {
        setProgress((prev) =>
          prev?.updated_at === (hit.data as BlockProgress).updated_at ? prev : (hit.data as BlockProgress),
        );
      }
    }, 3000);
    return () => clearInterval(t);
  }, [cycle_id, block_number, agent_id]);

  return { progress, loading, refresh };
}
