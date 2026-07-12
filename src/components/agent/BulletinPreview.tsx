import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getEpiWeek } from "@/lib/cycle-week";
import { getActiveCycleForUser } from "@/lib/active-cycle";
import { FileText } from "lucide-react";

import { logDirectSource } from "@/lib/operational-metrics";
logDirectSource({ module: "agent/BulletinPreview", file: "src/components/agent/BulletinPreview.tsx", source: "daily_work_records", note: "preview do boletim — usar getDateMetrics após refator" });

type Props = { userId: string };

type T = {
  count: number; worked: number; closed: number; refused: number;
  recovered: number; pending: number;
  depExisting: number; depInspected: number; depTreated: number; depEliminated: number;
  a1: number; a2: number; b: number; c: number; d1: number; d2: number; e: number;
  focos: number; tubitos: number; samples: number;
  larvicide: number; larvicideUnit: string;
  retroCount: number;
};

const EMPTY: T = {
  count: 0, worked: 0, closed: 0, refused: 0, recovered: 0, pending: 0,
  depExisting: 0, depInspected: 0, depTreated: 0, depEliminated: 0,
  a1: 0, a2: 0, b: 0, c: 0, d1: 0, d2: 0, e: 0,
  focos: 0, tubitos: 0, samples: 0, larvicide: 0, larvicideUnit: "g",
  retroCount: 0,
};

export function BulletinPreview({ userId }: Props) {
  const [se, setSe] = useState(getEpiWeek());
  const [t, setT] = useState<T>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const today = new Date();
      const epi = getEpiWeek(today);
      console.log("[SE]", { work_date: today.toISOString().split("T")[0], epi_week: epi.week, epi_year: epi.year });
      if (!cancel) setSe(epi);

      // DWR.agent_id == profile_id
      const cycle = await getActiveCycleForUser(userId);
      let q = supabase
        .from("daily_work_records")
        .select("*")
        .eq("agent_id", userId)
        .eq("epi_week", epi.week)
        .eq("epi_year", epi.year);
      if (cycle?.id) q = q.eq("cycle_id", cycle.id);

      const { data } = await q;
      const rows = (data as any[]) || [];
      const sum = (k: string) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
      const unit = rows.find(r => r.larvicide_unit)?.larvicide_unit || "g";
      const totals: T = {
        count: rows.length,
        worked: sum("properties_worked"),
        closed: sum("properties_closed"),
        refused: sum("properties_refused"),
        recovered: sum("properties_recovered"),
        pending: sum("pending_visits"),
        depExisting: sum("deposits_existing"),
        depInspected: sum("deposits_inspected"),
        depTreated: sum("deposits_treated"),
        depEliminated: sum("deposits_eliminated"),
        a1: sum("deposits_a1"), a2: sum("deposits_a2"),
        b: sum("deposits_b"), c: sum("deposits_c"),
        d1: sum("deposits_d1"), d2: sum("deposits_d2"), e: sum("deposits_e"),
        focos: sum("positive_foci"),
        tubitos: sum("tubitos_collected"),
        samples: sum("samples_collected"),
        larvicide: sum("larvicide_amount"),
        larvicideUnit: unit,
        retroCount: rows.filter((r: any) => r.is_retroactive).length,
      };
      if (!cancel) { setT(totals); setLoading(false); }
    })();
    return () => { cancel = true; };
  }, [userId]);

  const visitable = t.worked + t.pending;
  const cov = visitable > 0 ? Math.round((t.worked / visitable) * 100) : 0;
  const depTotal = t.a1 + t.a2 + t.b + t.c + t.d1 + t.d2 + t.e;

  return (
    <section className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-blue-600" />
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-900">
            Prévia do Boletim
          </h2>
        </div>
        <span className="text-[9px] font-black uppercase tracking-widest text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
          SE {String(se.week).padStart(2, "0")}/{se.year} · {t.count} diária{t.count === 1 ? "" : "s"}{t.retroCount > 0 ? ` · ${t.retroCount} ⚠ retro` : ""}
        </span>
      </div>

      {loading ? (
        <p className="text-xs text-slate-400">Carregando…</p>
      ) : (
        <div className="space-y-3">
          <Block title="Produção Imobiliária">
            <Row k="Trabalhados" v={t.worked} />
            <Row k="Fechados" v={t.closed} />
            <Row k="Recusas" v={t.refused} />
            <Row k="Recuperados" v={t.recovered} />
            <Row k="Pendências" v={t.pending} />
            <Row k="Cobertura" v={`${cov}%`} bold />
          </Block>

          <Block title="Levantamento de Índice (LI)">
            <Row k="Dep. existentes" v={t.depExisting} />
            <Row k="Inspecionados" v={t.depInspected} />
            <Row k="Tratados" v={t.depTreated} />
            <Row k="Eliminados" v={t.depEliminated} />
            <Row k="Focos" v={t.focos} />
          </Block>

          <Block title="Depósitos por Tipo">
            <Row k="A1" v={t.a1} /><Row k="A2" v={t.a2} />
            <Row k="B" v={t.b} /><Row k="C" v={t.c} />
            <Row k="D1" v={t.d1} /><Row k="D2" v={t.d2} />
            <Row k="E" v={t.e} /><Row k="Total" v={depTotal} bold />
          </Block>

          <Block title="Tubitos, Amostras e Larvicida">
            <Row k="Tubitos" v={t.tubitos} />
            <Row k="Amostras" v={t.samples} />
            <Row k={`Larvicida (${t.larvicideUnit})`} v={t.larvicide} />
          </Block>

          <p className="text-[9px] text-slate-400 italic mt-2">
            Prévia calculada a partir das diárias consolidadas da SE atual.
            O Boletim Oficial é a soma exata desses valores.
          </p>
        </div>
      )}
    </section>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-2">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1.5">{title}</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">{children}</div>
    </div>
  );
}

function Row({ k, v, bold }: { k: string; v: number | string; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between text-[11px]">
      <span className="text-slate-500">{k}</span>
      <span className={`font-${bold ? "black" : "bold"} text-slate-900`}>{v}</span>
    </div>
  );
}
