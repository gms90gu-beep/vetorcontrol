import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getEpiWeek } from "@/lib/cycle-week";
import { getActiveCycleForUser } from "@/lib/active-cycle";
import { CalendarDays, CheckCircle2, XCircle, Bug, Droplets, Beaker, Home, TrendingUp, AlertTriangle, Eye } from "lucide-react";
import { getOperationalDate } from "@/lib/operational-date";

import { logDirectSource } from "@/lib/operational-metrics";
logDirectSource({ module: "agent/MyWeeklyConsolidation", file: "src/components/agent/MyWeeklyConsolidation.tsx", source: "daily_work_records", note: "consolidação semanal — usar getWeekMetrics após refator" });

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

type Diag = {
  id: string;
  work_date: string;
  epi_week: number | null;
  epi_year: number | null;
  cycle_id: string | null;
  status: string | null;
  end_time: string | null;
  reason: string; // "incluída" | motivo de ignorada
  included: boolean;
};

const EMPTY: Totals = {
  count: 0, worked: 0, closed: 0, refused: 0, recovered: 0,
  focos: 0, tubitos: 0, larvicide: 0, larvicideUnit: "g", pending: 0,
};

export function MyWeeklyConsolidation({ userId }: Props) {
  const [se, setSe] = useState(getEpiWeek());
  const [totals, setTotals] = useState<Totals>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [diags, setDiags] = useState<Diag[]>([]);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const today = new Date();
      const epi = getEpiWeek(today);
      if (!cancel) setSe(epi);

      // DWR.agent_id == profile_id
      const cycle = await getActiveCycleForUser(userId);

      // Busca TODAS as diárias do agente na janela da semana (sem filtrar por
      // epi_week / cycle_id) para diagnosticar quais entram e quais ficam de
      // fora — usando SEMPRE os campos gravados na diária.
      const { data: rawAll } = await supabase
        .from("daily_work_records")
        .select("*")
        .eq("agent_id", userId)
        .gte("work_date", isoMondayOf(today))
        .lte("work_date", isoSundayOf(today));

      const allRows = (rawAll as any[]) || [];
      const diagList: Diag[] = [];
      const consolidated: any[] = [];

      for (const r of allRows) {
        let reason = "";
        let included = false;
        if (!r.end_time) reason = "end_time nulo";
        else if (r.status !== "completed") reason = "status diferente de concluído";
        else if (!r.cycle_id) reason = "cycle_id nulo";
        else if (cycle?.id && r.cycle_id !== cycle.id) reason = "cycle_id divergente";
        else if (r.epi_week !== epi.week) reason = "epi_week divergente";
        else if (r.epi_year !== epi.year) reason = "epi_year divergente";
        else { included = true; reason = "incluída"; consolidated.push(r); }

        diagList.push({
          id: r.id, work_date: r.work_date, epi_week: r.epi_week, epi_year: r.epi_year,
          cycle_id: r.cycle_id, status: r.status, end_time: r.end_time, reason, included,
        });

        console.log("[CONSOLIDACAO]", {
          agent_id: r.agent_id,
          work_date: r.work_date,
          cycle_id: r.cycle_id,
          epi_week: r.epi_week,
          resultado: included ? "Diária incluída" : `Diária ignorada — Motivo: ${reason}`,
        });
      }

      const sum = (k: string) => consolidated.reduce((a, r) => a + (Number(r[k]) || 0), 0);
      const unit = consolidated.find(r => r.larvicide_unit)?.larvicide_unit || "g";
      const t: Totals = {
        count: consolidated.length,
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
      if (!cancel) { setTotals(t); setDiags(diagList); setLoading(false); }
    })();
    return () => { cancel = true; };
  }, [userId]);

  const visitable = totals.worked + totals.pending;
  const cov = visitable > 0 ? Math.round((totals.worked / visitable) * 100) : 0;
  const found = diags.length;
  const consolidatedCount = diags.filter(d => d.included).length;
  const ignored = diags.filter(d => !d.included);

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
        <>
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

          {/* Painel de diagnóstico */}
          <div className="mt-3 pt-3 border-t border-white/10 text-[10px] text-white/70 space-y-1">
            <div>Total de diárias encontradas: <strong className="text-white">{found}</strong></div>
            <div>Total de diárias consolidadas: <strong className="text-emerald-300">{consolidatedCount}</strong></div>
            <div>Total ignoradas: <strong className={ignored.length ? "text-amber-300" : "text-white"}>{ignored.length}</strong></div>
            {ignored.length > 0 && (
              <div className="mt-2 bg-amber-500/10 border border-amber-400/30 rounded-lg p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1 text-amber-200 font-bold">
                    <AlertTriangle className="h-3 w-3" /> Existem diárias não consolidadas.
                  </span>
                  <button
                    onClick={() => setShowDetails(v => !v)}
                    className="flex items-center gap-1 bg-amber-400/20 hover:bg-amber-400/30 text-amber-100 px-2 py-0.5 rounded font-bold uppercase tracking-wider"
                  >
                    <Eye className="h-3 w-3" /> {showDetails ? "Ocultar" : "Ver Detalhes"}
                  </button>
                </div>
                {showDetails && (
                  <ul className="mt-2 space-y-1">
                    {ignored.map(d => (
                      <li key={d.id} className="text-amber-100/90">
                        {d.work_date} · SE {d.epi_week ?? "—"}/{d.epi_year ?? "—"} — <em>{d.reason}</em>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </>
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

// ── Helpers de janela semanal (segunda → domingo da semana atual) ───────────
// Base sempre na data operacional (America/Sao_Paulo) para evitar drift de UTC.
function fmtLocal(x: Date): string {
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
function localFromOp(d: Date): Date {
  const [y, m, dd] = getOperationalDate(d).split("-").map(Number);
  return new Date(y, m - 1, dd);
}
function isoMondayOf(d: Date): string {
  const x = localFromOp(d);
  const day = x.getDay() || 7; // domingo=0 → 7
  x.setDate(x.getDate() - day + 1);
  return fmtLocal(x);
}
function isoSundayOf(d: Date): string {
  const x = localFromOp(d);
  const day = x.getDay() || 7;
  x.setDate(x.getDate() + (7 - day));
  return fmtLocal(x);
}
