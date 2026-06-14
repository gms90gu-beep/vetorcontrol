import { DEP_ORDER, withPercentages, type DepKeyLower } from "@/lib/daily-integrity";

const LABELS: Record<DepKeyLower, string> = {
  a1: "A1", a2: "A2", b: "B", c: "C", d1: "D1", d2: "D2", e: "E",
};

interface Props {
  title?: string;
  data: Record<DepKeyLower, number>;
  colorClass?: string;
}

/**
 * Reusable percentage bars for deposits/foci distribution.
 * Consumes already-consolidated DWR JSON (no recalculation).
 */
export function DepositDistributionBars({ title, data, colorClass = "bg-primary" }: Props) {
  const { total, byType } = withPercentages(data);
  if (total === 0) {
    return (
      <div className="text-xs text-muted-foreground italic py-2">
        Sem dados de distribuição.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {title && <h4 className="text-sm font-semibold">{title}</h4>}
      <div className="space-y-1.5">
        {DEP_ORDER.map((k) => {
          const { count, percent } = byType[k];
          return (
            <div key={k} className="grid grid-cols-[2rem_1fr_5rem] items-center gap-2 text-xs">
              <span className="font-mono font-medium">{LABELS[k]}</span>
              <div className="h-3 rounded-full bg-muted/60 overflow-hidden">
                <div
                  className={`h-full ${colorClass} transition-all`}
                  style={{ width: `${percent}%` }}
                />
              </div>
              <span className="tabular-nums text-right">
                {count} <span className="text-muted-foreground">({percent}%)</span>
              </span>
            </div>
          );
        })}
      </div>
      <div className="text-xs text-muted-foreground pt-1 border-t">
        Total: <span className="font-semibold text-foreground">{total}</span>
      </div>
    </div>
  );
}
