import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { epiWeekToDateRange } from "@/lib/cycle-week";
import {
  computePropertyTypeComposition,
  type PropertyTypeComposition,
} from "@/lib/property-composition";
import { useOrientation } from "@/hooks/useOrientation";

/**
 * Visão "P.C.F.A.D. — Resumo dos Trabalhos de Campo" (formulário oficial em papel).
 * Uma linha por dia da semana epidemiológica selecionada + linha TOTAL.
 * Só aparece com o aparelho em PAISAGEM (padrão do LandscapeBulletinLayout).
 * Fonte: daily_work_records da SE + imóveis tratados (visits.treatment_applied).
 */

type Row = {
  work_date: string;
  a1: number; a2: number; b: number; c: number; d1: number; d2: number; e: number;
  depTotal: number;
  samples: number;
  blocks: number;
  treated: PropertyTypeComposition;
  treatedTotal: number;
  depInspected: number;
  depTreated: number;
  depEliminated: number;
  larvicideUnit: string;
  larvicideAmount: number;
  worked: number;
  refused: number;
  closed: number;
  recovered: number;
  positive: number;
};

const EMPTY_TREATED: PropertyTypeComposition = {
  residence: 0, commerce: 0, vacant_lot: 0, strategic_point: 0, others: 0,
};

const DASH = "—";

function n(v: any) {
  return Number(v) || 0;
}

function iip(positive: number, inspected: number) {
  if (!inspected) return DASH;
  return `${((positive / inspected) * 100).toFixed(1).replace(".", ",")}%`;
}

export function PcfadWeeklyLandscape({
  agentAuthId,
  week,
  year,
  agentName,
  registration,
  municipality,
}: {
  agentAuthId: string;
  week: number;
  year: number;
  agentName: string;
  registration: string;
  municipality: string;
}) {
  const isLandscape = useOrientation();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const range = useMemo(() => epiWeekToDateRange(week, year), [week, year]);

  useEffect(() => {
    if (!isLandscape || !agentAuthId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("daily_work_records")
        .select("*")
        .eq("agent_id", agentAuthId)
        .gte("work_date", range.start)
        .lte("work_date", range.end)
        .order("work_date", { ascending: true });
      if (error) console.warn("[PCFAD_WEEK_QUERY_ERROR]", error);
      const dwr = ((data as any[]) || []).filter((r) => r.work_date);

      const built: Row[] = [];
      for (const r of dwr) {
        let treated = EMPTY_TREATED;
        let treatedTotal = 0;
        try {
          const comp = await computePropertyTypeComposition({
            agentAuthId,
            workDates: [r.work_date],
            cycleId: r.cycle_id ?? null,
            onlyTreated: true,
          });
          treated = comp.propTypes;
          treatedTotal = comp.uniquePropertiesCount;
        } catch (e) {
          console.warn("[PCFAD_TREATED_ERROR]", e);
        }
        const a1 = n(r.deposits_a1), a2 = n(r.deposits_a2), b = n(r.deposits_b);
        const c = n(r.deposits_c), d1 = n(r.deposits_d1), d2 = n(r.deposits_d2);
        const e = n(r.deposits_e);
        built.push({
          work_date: r.work_date,
          a1, a2, b, c, d1, d2, e,
          depTotal: a1 + a2 + b + c + d1 + d2 + e,
          samples: n(r.samples_collected),
          blocks: n(r.blocks_worked),
          treated,
          treatedTotal,
          depInspected: n(r.deposits_inspected),
          depTreated: n(r.deposits_treated),
          depEliminated: n(r.deposits_eliminated),
          larvicideUnit: r.larvicide_unit || "g",
          larvicideAmount: n(r.larvicide_amount),
          worked: n(r.properties_worked),
          refused: n(r.properties_refused),
          closed: n(r.properties_closed),
          recovered: n(r.properties_recovered),
          positive: n(r.properties_positive),
        });
      }
      if (!cancelled) {
        setRows(built);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isLandscape, agentAuthId, range.start, range.end]);

  const total = useMemo(() => {
    const acc = rows.reduce<Row>((a, r) => ({
      ...a,
      a1: a.a1 + r.a1, a2: a.a2 + r.a2, b: a.b + r.b, c: a.c + r.c,
      d1: a.d1 + r.d1, d2: a.d2 + r.d2, e: a.e + r.e,
      depTotal: a.depTotal + r.depTotal,
      samples: a.samples + r.samples,
      blocks: a.blocks + r.blocks,
      treated: {
        residence: a.treated.residence + r.treated.residence,
        commerce: a.treated.commerce + r.treated.commerce,
        vacant_lot: a.treated.vacant_lot + r.treated.vacant_lot,
        strategic_point: a.treated.strategic_point + r.treated.strategic_point,
        others: a.treated.others + r.treated.others,
      },
      treatedTotal: a.treatedTotal + r.treatedTotal,
      depInspected: a.depInspected + r.depInspected,
      depTreated: a.depTreated + r.depTreated,
      depEliminated: a.depEliminated + r.depEliminated,
      larvicideUnit: r.larvicideUnit || a.larvicideUnit,
      larvicideAmount: a.larvicideAmount + r.larvicideAmount,
      worked: a.worked + r.worked,
      refused: a.refused + r.refused,
      closed: a.closed + r.closed,
      recovered: a.recovered + r.recovered,
      positive: a.positive + r.positive,
    }), {
      work_date: "TOTAL",
      a1: 0, a2: 0, b: 0, c: 0, d1: 0, d2: 0, e: 0, depTotal: 0,
      samples: 0, blocks: 0, treated: { ...EMPTY_TREATED }, treatedTotal: 0,
      depInspected: 0, depTreated: 0, depEliminated: 0,
      larvicideUnit: "g", larvicideAmount: 0,
      worked: 0, refused: 0, closed: 0, recovered: 0, positive: 0,
    });
    return acc;
  }, [rows]);

  if (!isLandscape) return null;

  const f = (iso: string) => format(new Date(`${iso}T12:00:00`), "dd/MM");
  const rf = (iso: string) => format(new Date(`${iso}T12:00:00`), "dd/MM/yyyy");

  const th = "border border-slate-300 px-1 py-0.5 text-[9px] font-black uppercase tracking-tight text-center bg-slate-100 text-slate-700";
  const td = "border border-slate-200 px-1 py-0.5 text-[10px] tabular-nums text-center text-slate-800";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 print:border-0 print:p-0">
      <div className="mb-2 text-center">
        <h3 className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-900">
          P.C.F.A.D. — Resumo dos Trabalhos de Campo
        </h3>
        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
          {municipality} · {agentName} · Matrícula {registration} · SE{" "}
          {String(week).padStart(2, "0")}/{year} ({f(range.start)}–{f(range.end)})
        </p>
      </div>

      {loading ? (
        <p className="py-6 text-center text-[11px] font-bold text-slate-400">
          Carregando resumo PCFAD…
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th} rowSpan={2}>Data</th>
                <th className={th} colSpan={7}>Depósitos inspecionados por tipo</th>
                <th className={th} rowSpan={2}>Total dep.</th>
                <th className={th} rowSpan={2}>Amostras</th>
                <th className={th} rowSpan={2}>Quart.</th>
                <th className={th} colSpan={6}>Imóveis tratados por tipo</th>
                <th className={th} colSpan={3}>Depósitos</th>
                <th className={th} colSpan={2}>Larvicida</th>
                <th className={th} colSpan={2}>Inseticida 2</th>
                <th className={th} colSpan={4}>Imóveis</th>
                <th className={th} rowSpan={2}>IIP</th>
                <th className={th} rowSpan={2}>Homem-dia</th>
                <th className={th} rowSpan={2}>Rendim.</th>
              </tr>
              <tr>
                <th className={th}>A1</th>
                <th className={th}>A2</th>
                <th className={th}>B</th>
                <th className={th}>C</th>
                <th className={th}>D1</th>
                <th className={th}>D2</th>
                <th className={th}>E</th>
                <th className={th}>R</th>
                <th className={th}>C</th>
                <th className={th}>TB</th>
                <th className={th}>PE</th>
                <th className={th}>OUT</th>
                <th className={th}>Total</th>
                <th className={th}>Inspec.</th>
                <th className={th}>Trat.</th>
                <th className={th}>Elim.</th>
                <th className={th}>Tipo</th>
                <th className={th}>Qtd</th>
                <th className={th}>Tipo</th>
                <th className={th}>Qtd</th>
                <th className={th}>Inspec.</th>
                <th className={th}>Recusa</th>
                <th className={th}>Fechada</th>
                <th className={th}>Recup.</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td className={td} colSpan={31}>
                    Sem diárias registradas nesta semana epidemiológica.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.work_date}>
                  <td className={`${td} font-bold`}>{rf(r.work_date)}</td>
                  <td className={td}>{r.a1}</td>
                  <td className={td}>{r.a2}</td>
                  <td className={td}>{r.b}</td>
                  <td className={td}>{r.c}</td>
                  <td className={td}>{r.d1}</td>
                  <td className={td}>{r.d2}</td>
                  <td className={td}>{r.e}</td>
                  <td className={td}>{r.depTotal}</td>
                  <td className={td}>{r.samples}</td>
                  <td className={td}>{r.blocks}</td>
                  <td className={td}>{r.treated.residence}</td>
                  <td className={td}>{r.treated.commerce}</td>
                  <td className={td}>{r.treated.vacant_lot}</td>
                  <td className={td}>{r.treated.strategic_point}</td>
                  <td className={td}>{r.treated.others}</td>
                  <td className={`${td} font-bold`}>{r.treatedTotal}</td>
                  <td className={td}>{r.depInspected}</td>
                  <td className={td}>{r.depTreated}</td>
                  <td className={td}>{r.depEliminated}</td>
                  <td className={td}>{r.larvicideUnit}</td>
                  <td className={td}>{r.larvicideAmount}</td>
                  <td className={td}>{DASH}</td>
                  <td className={td}>{DASH}</td>
                  <td className={td}>{r.worked}</td>
                  <td className={td}>{r.refused}</td>
                  <td className={td}>{r.closed}</td>
                  <td className={td}>{r.recovered}</td>
                  <td className={td}>{iip(r.positive, r.worked)}</td>
                  <td className={td}>{DASH}</td>
                  <td className={td}>{DASH}</td>
                </tr>
              ))}
              {rows.length > 0 && (
                <tr className="bg-slate-50 font-black">
                  <td className={`${td} font-black`}>TOTAL</td>
                  <td className={td}>{total.a1}</td>
                  <td className={td}>{total.a2}</td>
                  <td className={td}>{total.b}</td>
                  <td className={td}>{total.c}</td>
                  <td className={td}>{total.d1}</td>
                  <td className={td}>{total.d2}</td>
                  <td className={td}>{total.e}</td>
                  <td className={td}>{total.depTotal}</td>
                  <td className={td}>{total.samples}</td>
                  <td className={td}>{total.blocks}</td>
                  <td className={td}>{total.treated.residence}</td>
                  <td className={td}>{total.treated.commerce}</td>
                  <td className={td}>{total.treated.vacant_lot}</td>
                  <td className={td}>{total.treated.strategic_point}</td>
                  <td className={td}>{total.treated.others}</td>
                  <td className={td}>{total.treatedTotal}</td>
                  <td className={td}>{total.depInspected}</td>
                  <td className={td}>{total.depTreated}</td>
                  <td className={td}>{total.depEliminated}</td>
                  <td className={td}>{total.larvicideUnit}</td>
                  <td className={td}>{total.larvicideAmount}</td>
                  <td className={td}>{DASH}</td>
                  <td className={td}>{DASH}</td>
                  <td className={td}>{total.worked}</td>
                  <td className={td}>{total.refused}</td>
                  <td className={td}>{total.closed}</td>
                  <td className={td}>{total.recovered}</td>
                  <td className={td}>{iip(total.positive, total.worked)}</td>
                  <td className={td}>{DASH}</td>
                  <td className={td}>{DASH}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-2 text-[8px] font-semibold uppercase tracking-wider text-slate-400">
        IIP = imóveis positivos ÷ imóveis inspecionados × 100. Campos sem dado no
        sistema exibem "—". Fonte: relatórios diários (daily_work_records) da SE.
      </p>
    </div>
  );
}
