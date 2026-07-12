import { useEffect, useState } from "react";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { BadgeKey } from "./navigation-config";

import { logDirectSource } from "@/lib/operational-metrics";
logDirectSource({ module: "navigation/use-nav-badges", file: "src/components/navigation/use-nav-badges.ts", source: "daily_work_records", note: "badges de navegação — leitura leve" });

/**
 * Provides numeric badges for the navigation. Returns 0 for buckets
 * whose data source is unavailable; the UI only renders badges > 0.
 * Designed to be cheap: sync count is in-memory, pendencias is polled
 * at low frequency, weekly is currently a placeholder hook.
 */
export function useNavBadges(): Record<BadgeKey, number> {
  const { pending: syncPending } = useSyncStatus();
  const { user, role } = useAuth();
  const [pendencias, setPendencias] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const isManager = role === "supervisor" || role === "coordenador" || role === "admin_master";

    const fetchCount = async () => {
      try {
        if (isManager) {
          const { count } = await supabase
            .from("daily_work_records")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending");
          if (!cancelled) setPendencias(count ?? 0);
        } else {
          const { count } = await supabase
            .from("daily_work_records")
            .select("id", { count: "exact", head: true })
            .eq("agent_id", user.id)
            .eq("status", "pending");
          if (!cancelled) setPendencias(count ?? 0);
        }
      } catch {
        if (!cancelled) setPendencias(0);
      }
    };

    fetchCount();
    const t = setInterval(fetchCount, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [user, role]);

  return {
    pendencias,
    weekly: 0,
    sync: syncPending,
  };
}
