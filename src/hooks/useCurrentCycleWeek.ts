import { useEffect, useState } from "react";
import { db as offlineDB } from "@/lib/offline/db";
import { supabase } from "@/integrations/supabase/client";
import {
  type CycleWeekInfo,
  getEpiWeek,
  logCycleWeekAudit,
  resolveCycleWeek,
} from "@/lib/cycle-week";
import { getActiveCycleForUser } from "@/lib/active-cycle";

const META_KEY = "current_cycle_week_v1";

type CachedPayload = {
  cycle: CycleWeekInfo["cycle"];
  cycleWeek: CycleWeekInfo["cycleWeek"];
  cachedAt: number;
};

async function readCache(): Promise<CachedPayload | null> {
  try {
    const row = await offlineDB.meta.get(META_KEY);
    return (row?.value as CachedPayload) ?? null;
  } catch {
    return null;
  }
}

async function writeCache(p: CachedPayload) {
  try {
    await offlineDB.meta.put({ key: META_KEY, value: p });
  } catch {
    /* offline-safe */
  }
}

/**
 * Hook offline-first: resolve o par (ciclo atual, semana 1..8 do ciclo).
 * - Lê primeiro do Dexie (boot instantâneo).
 * - Revalida em background contra o servidor; emite [EPID_WEEK_CHANGE] se mudar.
 */
export function useCurrentCycleWeek(userId?: string | null) {
  const [info, setInfo] = useState<CycleWeekInfo>(() => ({
    cycle: null,
    cycleWeek: null,
    se: getEpiWeek(),
  }));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const cached = await readCache();
      if (cached && !cancelled) {
        setInfo({ cycle: cached.cycle, cycleWeek: cached.cycleWeek, se: getEpiWeek() });
        setLoading(false);
      }

      try {
        const cycle = await getActiveCycleForUser(userId ?? null);
        const cycleWeek = cycle?.id ? await resolveCycleWeek(cycle.id, new Date()) : null;
        const next: CycleWeekInfo = {
          cycle: cycle
            ? { id: cycle.id, number: cycle.number, year: cycle.year, name: cycle.name }
            : null,
          cycleWeek,
          se: getEpiWeek(),
        };
        if (cancelled) return;
        const prevWeekId = cached?.cycleWeek?.id ?? null;
        if (prevWeekId && cycleWeek?.id && prevWeekId !== cycleWeek.id) {
          console.log("[EPID_WEEK_CHANGE]", { from: prevWeekId, to: cycleWeek.id });
        }
        const prevCycleId = cached?.cycle?.id ?? null;
        if (prevCycleId && next.cycle?.id && prevCycleId !== next.cycle.id) {
          console.log("[CYCLE_CHANGE]", { from: prevCycleId, to: next.cycle.id });
        }
        logCycleWeekAudit(next);
        setInfo(next);
        setLoading(false);
        await writeCache({ cycle: next.cycle, cycleWeek: next.cycleWeek, cachedAt: Date.now() });
      } catch (e) {
        console.warn("[CYCLE_VALIDATION] revalidation failed", e);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return {
    info,
    loading,
    cycleNumber: info.cycle?.number ?? null,
    weekNumber: info.cycleWeek?.number ?? null,
    weekOf: 8,
  };
}
