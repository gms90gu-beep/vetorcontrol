import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { epiWeekToDateRange } from "@/lib/cycle-week";
import {
  buildPcfadWeekData,
  pcfadIip,
  sumPcfadRows,
  PCFAD_DASH,
  type PcfadRow,
} from "@/lib/pcfad-week";
import { useOrientation } from "@/hooks/useOrientation";

/**
 * Visão "P.C.F.A.D. — Resumo dos Trabalhos de Campo" (formulário oficial em papel).
 * Uma linha por dia da semana epidemiológica selecionada + linha TOTAL.
 * Só aparece com o aparelho em PAISAGEM (padrão do LandscapeBulletinLayout).
 * Dados: buildPcfadWeekData() — MESMA fonte usada pelo PDF paisagem.
 */

const DASH = PCFAD_DASH;

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
  const [rows, setRows] = useState<PcfadRow[]>([]);
  const [loading, setLoading] = useState(false);

  const range = useMemo(() => epiWeekToDateRange(week, year), [week, year]);

  useEffect(() => {
    if (!isLandscape || !agentAuthId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const data = await buildPcfadWeekData({ agentAuthId, week, year });
      if (!cancelled) {
        setRows(data.rows);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isLandscape, agentAuthId, week, year]);

  const total = useMemo(() => sumPcfadRows(rows), [rows]);

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
                <th className={th} colSpan={6}>Nº Imóveis trabalhados por tipo</th>
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
                  <td className={td}>{pcfadIip(r.positive, r.worked)}</td>
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
                  <td className={td}>{pcfadIip(total.positive, total.worked)}</td>
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
