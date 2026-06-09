import { useEffect, useState } from "react";
import { getActiveCycleForUser } from "@/lib/active-cycle";
import {
  CycleWeekInfo,
  formatCycleWeekLabel,
  getEpiWeek,
  logCycleWeekAudit,
  resolveCycleWeek,
} from "@/lib/cycle-week";
import { supabase } from "@/integrations/supabase/client";
import { safeGetUser } from "@/lib/offline/safe-auth";

interface Props {
  userId?: string | null;
  className?: string;
  date?: Date;
  /** When true emite logs [CICLO]/[SEMANA_CICLO]/[SE] na console */
  audit?: boolean;
}

/**
 * Selo unificado: "Ciclo X • Semana Y • SE WW/AAAA".
 * - Ciclo: número do ciclo ativo do agente
 * - Semana: número da semana DO CICLO (tabela weeks) — derivada da data
 * - SE: semana epidemiológica calculada da data (ISO)
 */
export function CycleWeekBadge({ userId, className, date, audit = true }: Props) {
  const [label, setLabel] = useState<string>("Ciclo — • Semana — • SE —");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ref = date ?? new Date();
      let uid = userId ?? null;
      if (!uid) {
        const { data } = await safeGetUser();
        uid = data.user?.id ?? null;
      }
      const cycle = await getActiveCycleForUser(uid);
      const cycleWeek = cycle?.id ? await resolveCycleWeek(cycle.id, ref) : null;
      const se = getEpiWeek(ref);
      const info: CycleWeekInfo = {
        cycle: cycle ? { id: cycle.id, number: cycle.number, year: cycle.year, name: cycle.name } : null,
        cycleWeek,
        se,
      };
      if (audit) logCycleWeekAudit(info);
      if (!cancelled) setLabel(formatCycleWeekLabel(info));
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, date?.getTime(), audit]);

  return <span className={className}>{label}</span>;
}
