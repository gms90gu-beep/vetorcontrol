import { formatCycleWeekLabel } from "@/lib/cycle-week";
import { useCurrentCycleWeek } from "@/hooks/useCurrentCycleWeek";

interface Props {
  userId?: string | null;
  className?: string;
}

/**
 * Selo canônico do sistema: "Ciclo X • Semana Y/8".
 * Cada ciclo possui exatamente 8 semanas epidemiológicas.
 */
export function CycleWeekBadge({ userId, className }: Props) {
  const { info } = useCurrentCycleWeek(userId);
  return <span className={className}>{formatCycleWeekLabel(info)}</span>;
}
