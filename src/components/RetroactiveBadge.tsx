import { AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type Props = {
  workDate?: string | null;
  createdAt?: string | null;
  reason?: string | null;
  compact?: boolean;
  className?: string;
};

/**
 * Selo visual para produções retroativas — exibido em dashboards,
 * relatórios e prévia do boletim quando is_retroactive = true.
 */
export function RetroactiveBadge({ workDate, createdAt, reason, compact, className }: Props) {
  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-800 ${className || ""}`}
        title={reason ? `Retroativa — ${reason}` : "Produção retroativa"}
      >
        <AlertTriangle className="h-2.5 w-2.5" />
        Retroativa
      </span>
    );
  }

  const fmt = (s?: string | null) => {
    if (!s) return "—";
    try { return format(new Date(s.length <= 10 ? `${s}T12:00:00` : s), "dd/MM/yyyy", { locale: ptBR }); }
    catch { return s; }
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-amber-900 ${className || ""}`}>
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
      <span className="text-[10px] font-black uppercase tracking-wider">Produção Retroativa</span>
      {workDate && (
        <span className="text-[10px] font-bold">
          Produção: <b>{fmt(workDate)}</b>
        </span>
      )}
      {createdAt && (
        <span className="text-[10px] font-bold">
          Lançamento: <b>{fmt(createdAt)}</b>
        </span>
      )}
      {reason && (
        <span className="text-[10px] font-bold">
          Motivo: <b>{reason}</b>
        </span>
      )}
    </div>
  );
}
