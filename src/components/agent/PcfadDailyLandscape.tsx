import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useOrientation } from "@/hooks/useOrientation";
import {
  buildPcfadDayData,
  pcfadDayBlockLabel,
  PCFAD_DAY_DASH as DASH,
  type PcfadDayData,
} from "@/lib/pcfad-day";

/**
 * Visão "RESUMO DIÁRIO DO SERVIÇO ANTIVETORIAL" (formulário oficial em papel).
 * Uma única linha de dados (é diário), com cabeçalhos agrupados por bloco.
 * Só aparece com o aparelho em PAISAGEM (mesmo padrão do PcfadWeeklyLandscape).
 * Dados: buildPcfadDayData() — MESMA fonte usada pelo PDF paisagem diário.
 */
export function PcfadDailyLandscape({
  recordId,
  agentName,
  registration,
  municipality,
}: {
  recordId: string;
  agentName: string;
  registration: string;
  municipality: string;
}) {
  const isLandscape = useOrientation();
  const [data, setData] = useState<PcfadDayData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isLandscape || !recordId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const d = await buildPcfadDayData(recordId);
      if (!cancelled) {
        setData(d);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isLandscape, recordId]);

  if (!isLandscape) return null;

  const th = "border border-slate-300 px-1 py-0.5 text-[9px] font-black uppercase tracking-tight text-center bg-slate-100 text-slate-700";
  const td = "border border-slate-200 px-1 py-0.5 text-[10px] tabular-nums text-center text-slate-800";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 print:border-0 print:p-0">
      <div className="mb-2 text-center">
        <h3 className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-900">
          Resumo Diário do Serviço Antivetorial
        </h3>
        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
          {municipality} · {agentName} · Matrícula {registration}
          {data?.workDate
            ? ` · ${format(new Date(`${data.workDate}T12:00:00`), "dd/MM/yyyy (EEEE)", { locale: ptBR })}`
            : ""}
        </p>
      </div>

      {loading ? (
        <p className="py-6 text-center text-[11px] font-bold text-slate-400">
          Carregando resumo diário…
        </p>
      ) : !data ? (
        <p className="py-6 text-center text-[11px] font-bold text-slate-400">
          Diária não encontrada.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th} colSpan={6}>Nº imóveis trabalhados por tipo</th>
                  <th className={th} colSpan={4}>Nº imóveis</th>
                  <th className={th} colSpan={8}>Nº depósitos inspecionados por tipo</th>
                  <th className={th} colSpan={2}>Nº depósitos</th>
                </tr>
                <tr>
                  <th className={th}>Residência</th>
                  <th className={th}>Comércio</th>
                  <th className={th}>TB</th>
                  <th className={th}>PE</th>
                  <th className={th}>Outro</th>
                  <th className={th}>Total</th>
                  <th className={th}>Inspec.</th>
                  <th className={th}>Fechados</th>
                  <th className={th}>Recusa</th>
                  <th className={th}>Pendência</th>
                  <th className={th}>A1</th>
                  <th className={th}>A2</th>
                  <th className={th}>B</th>
                  <th className={th}>C</th>
                  <th className={th}>D1</th>
                  <th className={th}>D2</th>
                  <th className={th}>E</th>
                  <th className={th}>Total</th>
                  <th className={th}>Tratados</th>
                  <th className={th}>Eliminado</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={td}>{data.types.residence}</td>
                  <td className={td}>{data.types.commerce}</td>
                  <td className={td}>{data.types.vacant_lot}</td>
                  <td className={td}>{data.types.strategic_point}</td>
                  <td className={td}>{data.types.others}</td>
                  <td className={`${td} font-black`}>{data.typesTotal}</td>
                  <td className={td}>{data.inspected}</td>
                  <td className={td}>{data.closed}</td>
                  <td className={td}>{data.refused}</td>
                  <td className={td}>{data.pending}</td>
                  <td className={td}>{data.dep.a1}</td>
                  <td className={td}>{data.dep.a2}</td>
                  <td className={td}>{data.dep.b}</td>
                  <td className={td}>{data.dep.c}</td>
                  <td className={td}>{data.dep.d1}</td>
                  <td className={td}>{data.dep.d2}</td>
                  <td className={td}>{data.dep.e}</td>
                  <td className={`${td} font-black`}>{data.depTotal}</td>
                  <td className={td}>{data.depTreated}</td>
                  <td className={td}>{data.depEliminated}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-2 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th} colSpan={3}>Larvicida (1)</th>
                  <th className={th} colSpan={3}>Larvicida (2)</th>
                  <th className={th} colSpan={2}>Adulticida</th>
                  <th className={th} rowSpan={2}>Amostras coletadas</th>
                  <th className={th} rowSpan={2}>Tubitos</th>
                  <th className={th} rowSpan={2}>Recuperadas</th>
                </tr>
                <tr>
                  <th className={th}>Tipo</th>
                  <th className={th}>Qtde. Dep. Trat.</th>
                  <th className={th}>Qtde. (Gramas)</th>
                  <th className={th}>Tipo</th>
                  <th className={th}>Qtde. Dep. Trat.</th>
                  <th className={th}>Qtde. (Gramas)</th>
                  <th className={th}>Tipo</th>
                  <th className={th}>Qtde. (Gramas)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={td}>{data.larvicideType}</td>
                  <td className={td}>{data.larvicideTreatedDeposits}</td>
                  <td className={td}>{data.larvicideGrams}</td>
                  <td className={td}>{DASH}</td>
                  <td className={td}>{DASH}</td>
                  <td className={td}>{DASH}</td>
                  <td className={td}>{DASH}</td>
                  <td className={td}>{DASH}</td>
                  <td className={td}>{data.samples}</td>
                  <td className={td}>{data.tubitos}</td>
                  <td className={td}>{data.recovered}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-2 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>Nº e seq. dos quarteirões trabalhados</th>
                  <th className={th}>Nº e seq. dos quarteirões concluídos</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={`${td} text-left`}>{pcfadDayBlockLabel(data.blocksWorked)}</td>
                  <td className={`${td} text-left`}>{pcfadDayBlockLabel(data.blocksCompleted)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="mt-2 text-[8px] font-semibold uppercase tracking-wider text-slate-400">
        Campos sem correspondência no sistema (Larvicida 2, Adulticida) exibem "—".
        Fonte: snapshot do encerramento da jornada (daily_work_records) + visitas do dia.
      </p>
    </div>
  );
}
