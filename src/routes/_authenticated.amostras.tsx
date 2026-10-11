import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getFocusSamples, recordFocusResult, type FocusSample } from "@/lib/focus-results.functions";
import { getOperationalDate } from "@/lib/operational-date";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/amostras")({ component: SamplesPage });
const labels: Record<string, string> = { pending: "Aguardando análise", positive: "Positivo", negative: "Negativo", inconclusive: "Inconclusivo" };
function date(value: string) { return value.includes("T") ? new Date(value).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : value.split("-").reverse().join("/"); }
function SamplesPage() {
  const fetchSamples = useServerFn(getFocusSamples);
  const [cycleId, setCycle] = useState("");
  const [status, setStatus] = useState<"" | "pending" | "positive" | "negative" | "inconclusive">("pending");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<FocusSample | null>(null);
  const query = useQuery({ queryKey: ["focus-samples", cycleId, status, page], queryFn: () => fetchSamples({ data: { cycleId: cycleId || undefined, status: status || undefined, page } }) });
  return <div className="container mx-auto p-4 space-y-4">
    <h1 className="text-xl font-bold">Amostras e resultados</h1>
    <p className="text-sm text-muted-foreground">Agentes acompanham suas coletas; supervisores registram o resultado do laboratório para sua equipe. Coordenadores e administradores podem corrigir com justificativa.</p>
    <p className="text-xs text-muted-foreground">Somente coletas sincronizadas aparecem aqui. O resultado é lançado online na visita original, mesmo com a jornada encerrada.</p>
    <div className="flex flex-wrap gap-3">
      <label className="text-sm">Ciclo <select className="border rounded p-2" value={cycleId} onChange={e => { setCycle(e.target.value); setPage(0); setSelected(null); }}><option value="">Todos os ciclos</option>{query.data?.cycles.map(c => <option key={c.id} value={c.id}>{c.name} · {c.year}</option>)}</select></label>
      <label className="text-sm">Resultado <select className="border rounded p-2" value={status} onChange={e => { setStatus(e.target.value as typeof status); setPage(0); setSelected(null); }}><option value="">Todos</option>{Object.entries(labels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <Button variant="outline" onClick={() => { setSelected(null); void query.refetch(); }} disabled={query.isFetching}>Atualizar</Button>
    </div>
    {query.isLoading ? <p>Carregando coletas…</p> : query.error ? <p role="alert" className="text-destructive">{query.error.message}</p> : <>
      {!query.data?.samples.length && <p>Nenhuma coleta encontrada nos filtros selecionados.</p>}
      <div className="grid gap-3 md:grid-cols-2">{query.data?.samples.map(sample => <Card key={sample.id}><CardContent className="p-4 space-y-2">
        <p className="font-semibold">Imóvel {sample.property_number} · Quart. {sample.block_number}</p>
        <p className="text-sm">{sample.street} · {sample.agent_name}</p>
        <p className="text-sm">Coleta: {date(sample.visit_date)} · {sample.cycle_name} · {sample.tubes || 0} tubito(s)</p>
        <p className="text-sm">Depósitos: {sample.deposits.map(d => `${d.type_code} (${d.quantity})`).join(", ") || "Nenhum registrado"}</p>
        <p className="font-semibold">{labels[sample.status]}</p>
        <Button variant="outline" onClick={() => setSelected(sample)}>{sample.can_record && sample.status === "pending" ? "Lançar resultado" : "Ver resultado e histórico"}</Button>
      </CardContent></Card>)}</div>
      <div className="flex items-center gap-3"><Button variant="outline" disabled={page === 0} onClick={() => { setPage(page - 1); setSelected(null); }}>Anterior</Button><span>Página {page + 1}</span><Button variant="outline" disabled={(query.data?.samples.length ?? 0) < 50} onClick={() => { setPage(page + 1); setSelected(null); }}>Próxima</Button></div>
    </>}
    {selected && <ResultForm key={`${selected.id}:${selected.version}`} sample={selected} onClose={() => { setSelected(null); void query.refetch(); }} />}
  </div>;
}
function ResultForm({ sample, onClose }: { sample: FocusSample; onClose: () => void }) {
  const save = useServerFn(recordFocusResult);
  const cache = useQueryClient();
  const [status, setStatus] = useState<"positive" | "negative" | "inconclusive">(sample.status === "pending" ? "positive" : sample.status);
  const [positiveIds, setPositive] = useState(sample.deposits.filter(d => d.positive).map(d => d.id));
  const [reference, setReference] = useState("");
  const [analysisDate, setDate] = useState(getOperationalDate());
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [requestId, setRequest] = useState(() => crypto.randomUUID());
  useEffect(() => { document.getElementById("focus-result-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }); }, []);
  const editable = sample.can_record && (sample.status === "pending" || sample.can_correct);
  const change = () => setRequest(crypto.randomUUID());
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy) return;
    if (!navigator.onLine) { toast.error("Conecte-se para confirmar o resultado. Nenhum dado foi enviado."); return; }
    setBusy(true);
    try {
      await save({ data: { visitId: sample.id, status, positiveDepositIds: status === "positive" ? positiveIds : [], reference, analysisDate, reason, version: sample.version, requestId } });
      toast.success("Resultado confirmado e indicadores diários atualizados.");
      void cache.invalidateQueries(); onClose();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível confirmar. Atualize a lista antes de tentar novamente."); }
    finally { setBusy(false); }
  }
  return <Card id="focus-result-detail"><CardContent className="p-4 space-y-4">
    <h2 className="font-semibold">Resultado · Imóvel {sample.property_number} · coleta de {date(sample.visit_date)}</h2>
    {editable ? <form onSubmit={submit} className="space-y-3">
      <label className="block text-sm">Resultado<select className="block border rounded p-2" value={status} onChange={e => { setStatus(e.target.value as typeof status); change(); }}>{["positive","negative","inconclusive"].map(s => <option key={s} value={s}>{labels[s]}</option>)}</select></label>
      {status === "positive" && <fieldset className="border rounded p-3"><legend>Depósitos confirmados como positivos pelo laboratório</legend>{sample.deposits.map(d => <label key={d.id} className="block text-sm"><input type="checkbox" checked={positiveIds.includes(d.id)} onChange={e => { setPositive(e.target.checked ? [...positiveIds,d.id] : positiveIds.filter(id => id !== d.id)); change(); }} /> {d.type_code} · quantidade registrada: {d.quantity}</label>)}{!sample.deposits.length && <p className="text-destructive">Não há depósitos vinculados. Confira o registro original antes de confirmar positivo.</p>}</fieldset>}
      <label className="block text-sm">Referência do laudo/laboratório<Input required minLength={2} maxLength={200} value={reference} onChange={e => { setReference(e.target.value); change(); }} /></label>
      <label className="block text-sm">Data da análise<Input type="date" required min={getOperationalDate(new Date(sample.visit_date))} max={getOperationalDate()} value={analysisDate} onChange={e => { setDate(e.target.value); change(); }} /></label>
      <label className="block text-sm">{sample.status === "pending" ? "Observação (opcional)" : "Justificativa da correção"}<textarea className="block w-full border rounded p-2" required={sample.status !== "pending"} minLength={sample.status === "pending" ? 0 : 5} maxLength={2000} value={reason} onChange={e => { setReason(e.target.value); change(); }} /></label>
      <p className="text-xs text-muted-foreground">A confirmação registra seu usuário e horário e atualiza a coleta original. Nenhuma nova visita será criada.</p>
      <Button type="submit" disabled={busy || (status === "positive" && !positiveIds.length)}>{busy ? "Confirmando…" : sample.status === "pending" ? "Confirmar resultado" : "Confirmar correção"}</Button>
    </form> : <p className="text-sm">{sample.can_record ? "Resultado confirmado. Correções devem ser feitas pelo coordenador ou administrador." : "Consulta do resultado. O lançamento é feito pelo supervisor da equipe."}</p>}
    <h3 className="font-semibold">Histórico</h3>
    {!sample.history.length && <p className="text-sm">Nenhum lançamento de laboratório registrado nesta área.{sample.status !== "pending" ? " A marcação existente foi preservada." : ""}</p>}
    {sample.history.map((h,i) => <div key={i} className="border rounded p-3 text-sm"><p>{labels[h.status]} · análise {date(h.analysis_date)} · {h.reference}</p><p>Registrado por {h.actor} em {new Date(h.recorded_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>{h.reason && <p>{h.reason}</p>}</div>)}
    <Button variant="outline" disabled={busy} onClick={onClose}>Fechar</Button>
  </CardContent></Card>;
}
