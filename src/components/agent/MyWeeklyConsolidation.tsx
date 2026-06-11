import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getEpiWeek } from "@/lib/cycle-week";
import { getActiveCycleForUser } from "@/lib/active-cycle";
import { CalendarDays, CheckCircle2, XCircle, Bug, Droplets, Beaker, Home, TrendingUp } from "lucide-react";

const WORK_DAYS = 5;

type Props = { userId: string };

type Totals = {
  count: number;
  worked: number;
  closed: number;
  refused: number;
  recovered: number;
  focos: number;
  tubitos: number;
  larvicide: number;
  larvicideUnit: string;
  pending: number;
};

const EMPTY: Totals = {
  count: 0, worked: 0, closed: 0, refused: 0, recovered: 0,
  focos: 0, tubitos: 0, larvicide: 0, larvicideUnit: "g", pending: 0,
};

export function MyWeeklyConsolidation({ userId }: Props) {
  const [se, setSe] = useState(getEpiWeek());
  const [totals, setTotals] = useState<Totals>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const today = new Date();
      const epi = getEpiWeek(today);
      console.log("[SE]", { work_date: today.toISOString().split("T")[0], epi_week: epi.week, epi_year: epi.year });
      if (!cancel) setSe(epi);

      const { data: agentRow } = await supabase
        .from("agents").select("id").eq("profile_id", userId).maybeSingle();
      if (!agentRow) { if (!cancel) { setTotals(EMPTY); setLoading(false); } return; }

      const cycle = await getActiveCycleForUser(userId);

      let q = supabase
        .from("daily_work_records")
        .select("*")
        .eq("agent_id", agentRow.id)
        .eq("epi_week", epi.week)
        .eq("epi_year", epi.year);
      if (cycle?.id) q = q.eq("cycle_id", cycle.id);

      const { data } = await q;
      const rows = (data as any[]) || [];
      const sum = (k: string) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
      const unit = rows.find(r => r.larvicide_unit)?.larvicide_unit || "g";
      const t: Totals = {
        count: rows.length,
        worked: sum("properties_worked"),
        closed: sum("properties_closed"),
        refused: sum("properties_refused"),
        recovered: sum("properties_recovered"),
        focos: sum("positive_foci"),
        tubitos: sum("tubitos_collected"),
        larvicide: sum("larvicide_amount"),
        larvicideUnit: unit,
        pending: sum("pending_visits"),
      };
      if (!cancel) { setTotals(t); setLoading(false); }
    })();
    return () => { cancel = true; };
  }, [userId]);

  const visitable = totals.worked + totals.pending;
  const cov = visitable > 0 ? Math.round((totals.worked / visitable) * 100) : 0;

  return (
    <section className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-4 text-white shadow-lg">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-emerald-400" />
          <h2 className="text-xs font-black uppercase tracking-wider">
            Meu Consolidado Semanal
          </h2>
        </div>
        <span className="text-[9px] font-black uppercase tracking-widest bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full">
          SE {String(se.week).padStart(2, "0")}/{se.year}
        </span>
      </div>

      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-3xl font-black">{totals.count}</span>
        <span className="text-[10px] font-bold text-white/60 uppercase tracking-wider">
          de {WORK_DAYS} diárias consolidadas
        </span>
      </div>

      {loading ? (
        <p className="text-[10px] text-white/40">Carregando…</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <Cell icon={Home} label="Imóveis" value={totals.worked} />
          <Cell icon={CheckCircle2} label="Fechados" value={totals.closed} />
          <Cell icon={XCircle} label="Recusas" value={totals.refused} />
          <Cell icon={Bug} label="Focos" value={totals.focos} />
          <Cell icon={Beaker} label="Tubitos" value={totals.tubitos} />
          <Cell icon={Droplets} label={`Larv. ${totals.larvicideUnit}`} value={totals.larvicide} />
          <Cell icon={TrendingUp} label="Cobertura" value={`${cov}%`} highlight />
          <Cell icon={CheckCircle2} label="Recuperados" value={totals.recovered} />
          <Cell icon={XCircle} label="Pendências" value={totals.pending} />
        </div>
      )}
    </section>
  );
}

function Cell({ icon: Icon, label, value, highlight }: {
  icon: any; label: string; value: number | string; highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg p-2 ${highlight ? "bg-emerald-500/20" : "bg-white/5"}`}>
      <Icon className={`h-3 w-3 ${highlight ? "text-emerald-300" : "text-white/50"}`} />
      <p className={`text-base font-black mt-1 leading-none ${highlight ? "text-emerald-200" : "text-white"}`}>
        {value}
      </p>
      <p className="text-[8px] font-bold uppercase tracking-wider mt-1 text-white/40 leading-tight">
        {label}
      </p>
    </div>
  );
}
