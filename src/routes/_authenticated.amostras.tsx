import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getFocusSamples, getFocusSampleCycles, recordFocusResult, identifyFocusDeposits, type FocusSample } from "@/lib/focus-results.functions";
import { readLocalFocusSamples } from "@/lib/focus-local-samples";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { toOperationalDate, getOperationalDate } from "@/lib/operational-date";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/amostras")({
  component: SamplesPage,
  head: () => ({ meta: [
    { title: "Amostras e resultados | Vetor Control" },
    { name: "description", content: "Coletas e resultados laboratoriais da equipe no Vetor Control." },
    { property: "og:title", content: "Amostras e resultados | Vetor Control" },
    { property: "og:description", content: "Coletas e resultados laboratoriais da equipe no Vetor Control." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});
const labels: Record<string, string> = { pending: "Aguardando análise", positive: "Positivo", negative: "Negativo", inconclusive: "Inconclusivo" };
function date(value: string) { return value.includes("T") ? new Date(value).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : value.split("-").reverse().join("/"); }
function SamplesPage() {
  const { user, role } = useAuth();
  const cache = useQueryClient();
  const online = useOnlineStatus();
  const localQuery = useQuery({ queryKey: ["focus-local-samples", user?.id], enabled: !!user?.id && role === "agente", queryFn: () => {
    if (!user?.id) throw new Error("Autenticação necessária");
    return readLocalFocusSamples(user.id);
  }, refetchInterval: 5000 });
  const fetchSamples = useServerFn(getFocusSamples);
  const fetchCycles = useServerFn(getFocusSampleCycles);
  const cycleQuery = useQuery({ queryKey: ["focus-sample-cycles", user?.id, role], enabled: online && !!user?.id && !!role, queryFn: () => fetchCycles() });
  const [cycleId, setCycle] = useState("");
  const [status, setStatus] = useState<"" | "pending" | "positive" | "negative" | "inconclusive">("pending");
  const [agentId, setAgent] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [draftSearch, setDraftSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<FocusSample | null>(null);
  const query = useQuery({ queryKey: ["focus-samples", user?.id, role, cycleId, status, agentId, from, to, search, page], enabled: online && !!user?.id && !!role && !(from && to && from > to), queryFn: () => fetchSamples({ data: { cycleId: cycleId || undefined, status: status || undefined, agentId: agentId || undefined, from: from || undefined, to: to || undefined, search: search || undefined, page } }) });
  useEffect(() => {
    setSelected(null); setPage(0);
    const owner = user?.id;
    return () => { cache.removeQueries({ queryKey: ["focus-samples", owner] }); cache.removeQueries({ queryKey: ["focus-sample-cycles", owner] }); cache.removeQueries({ queryKey: ["focus-local-samples", owner] }); };
  }, [user?.id, role, cache]);
  const localSamples = (role === "agente" ? localQuery.data?.samples ?? [] : []).filter(sample => {
    const day = toOperationalDate(sample.visit_date) ?? "";
    return (!status || status === "pending") && (!cycleId || sample.cycle_id === cycleId) && (!agentId || sample.agent_id === agentId)
      && (!from || day >= from) && (!to || day <= to)
      && (!search || `${sample.property_number} ${sample.street} ${sample.block_number}`.toLowerCase().includes(search.toLowerCase()))
      && !(query.data?.samples ?? []).some(remote => remote.id === sample.id);
  });
  const availableCycles = cycleQuery.data ?? (role === "agente" ? localQuery.data?.cycles : []) ?? [];
  const resetPage = () => { setPage(0); setSelected(null); };
  return <div className="container mx-auto p-4 space-y-4">
    <h1 className="text-xl font-bold">Amostras e resultados</h1>
    <p className="text-sm text-muted-foreground">Agentes acompanham suas coletas; supervisores registram o resultado do laboratório para sua equipe. Coordenadores e administradores podem corrigir com justificativa.</p>
    <p className="text-xs text-muted-foreground">Foco encontrado significa coleta realizada e aguardando análise. Coletas locais aguardam sincronização para aparecer ao supervisor. O resultado é lançado online na visita original, mesmo com a jornada encerrada.</p>
    <p className="text-sm">Escopo: {role === "admin_master" ? "todos os agentes" : role === "coordenador" ? "sua área vinculada" : role === "supervisor" ? "sua equipe" : "suas coletas"}. Resultado por coleta/visita; tubitos não possuem resultados individuais neste cadastro.</p>
    {query.data && !query.error && <div className="flex flex-wrap gap-3">{Object.entries(labels).map(([key,label]) => <Button key={key} variant={status === key ? "default" : "outline"} onClick={() => { setStatus(key as typeof status); resetPage(); }}>{label}: {query.data.counts?.[key] ?? 0}</Button>)}</div>}
    {cycleQuery.error && <div role="alert" className="text-destructive text-sm">Falha ao carregar ciclos: {cycleQuery.error.message}<Button variant="outline" onClick={() => void cycleQuery.refetch()}>Tentar novamente</Button></div>}
    <p className="text-xs text-muted-foreground">Contadores respeitam ciclo, agente, período e busca; cada cartão seleciona um resultado.</p>
    <div className="flex flex-wrap gap-3">
      <label className="text-sm">Ciclo <select className="border rounded p-2" value={cycleId} disabled={cycleQuery.isLoading} onChange={e => { setCycle(e.target.value); setPage(0); setSelected(null); }}><option value="">Todos os ciclos</option>{availableCycles.map(c => <option key={c.id} value={c.id}>{c.name} · {c.year}</option>)}</select></label>
      <label className="text-sm">Resultado <select className="border rounded p-2" value={status} onChange={e => { setStatus(e.target.value as typeof status); setPage(0); setSelected(null); }}><option value="">Todos</option>{Object.entries(labels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="text-sm">Agente<select className="block border rounded p-2" value={agentId} onChange={e => { setAgent(e.target.value); resetPage(); }}><option value="">Todos no seu escopo</option>{query.data?.agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <label className="text-sm">Coleta de<Input type="date" value={from} onChange={e => { setFrom(e.target.value); resetPage(); }} /></label>
      <label className="text-sm">Até<Input type="date" value={to} onChange={e => { setTo(e.target.value); resetPage(); }} /></label>
      <form className="flex items-end gap-2" onSubmit={e => { e.preventDefault(); setSearch(draftSearch.trim()); resetPage(); }}><label className="text-sm">Agente, imóvel, rua, quarteirão ou laudo<Input maxLength={200} value={draftSearch} onChange={e => setDraftSearch(e.target.value)} /></label><Button type="submit" variant="outline">Buscar</Button></form>
      <Button variant="outline" onClick={() => { setCycle(""); setStatus("pending"); setAgent(""); setFrom(""); setTo(""); setSearch(""); setDraftSearch(""); resetPage(); }}>Limpar filtros</Button>
      <Button variant="outline" onClick={() => { setSelected(null); void query.refetch(); }} disabled={query.isFetching}>Atualizar</Button>
    </div>
    {from && to && from > to && <p role="alert" className="text-destructive">A data inicial deve ser anterior ou igual à final.</p>}
    {!online && <p className="text-sm">Sem conexão. Exibindo registros locais deste dispositivo; o supervisor receberá após sincronizar.</p>}
    {localQuery.error && <p role="alert" className="text-destructive">Não foi possível consultar as coletas locais. Seus dados não foram alterados.</p>}
    {localSamples.length > 0 && <section className="space-y-2"><h2 className="font-semibold">Coletas aguardando sincronização ({localSamples.length})</h2>{localSamples.map(sample => <Card key={sample.id}><CardContent className="p-4"><p>Imóvel {sample.property_number} · Quart. {sample.block_number} · {sample.street}</p><p>Coleta: {date(sample.visit_date)} · Aguardando resultado e sincronização</p>{sample.sync_error && <p className="text-destructive">Falha de envio: {sample.sync_error}</p>}<p className="text-xs text-muted-foreground">Registro preservado na fila. Não é necessário coletar ou cadastrar novamente.</p></CardContent></Card>)}</section>}
    {online && query.isLoading ? <p>Carregando coletas…</p> : query.error ? <p role="alert" className="text-destructive">{query.error.message}</p> : <>
      {online && !query.data?.samples.length && !localSamples.length && <p>Nenhuma coleta sincronizada encontrada nos filtros selecionados.</p>}
      <div className="grid gap-3 md:grid-cols-2">{query.data?.samples.map(sample => <Card key={sample.id}><CardContent className="p-4 space-y-2">
        <p className="font-semibold">Imóvel {sample.property_number} · Quart. {sample.block_number}</p>
        <p className="text-sm">{sample.street} · {sample.agent_name}</p>
        <p className="text-sm">Coleta: {date(sample.visit_date)} · {sample.cycle_name} · {sample.tubes || 0} tubito(s)</p>
        <p className="text-sm">Depósitos com foco/coleta: {sample.deposits.map(d => `${d.type_code} (${d.quantity})`).join(", ") || "Nenhum registrado"}</p>
        <p className="font-semibold">{labels[sample.status]}</p>
        <Button variant="outline" onClick={() => setSelected(sample)}>{sample.can_record && sample.status === "pending" ? "Lançar resultado" : "Ver resultado e histórico"}</Button>
      </CardContent></Card>)}</div>
      <div className="flex items-center gap-3"><Button variant="outline" disabled={page === 0} onClick={() => { setPage(page - 1); setSelected(null); }}>Anterior</Button><span>Página {page + 1} · {query.data?.total ?? 0} coleta(s) nos filtros</span><Button variant="outline" disabled={query.isFetching || (page + 1) * 50 >= (query.data?.total ?? 0)} onClick={() => { setPage(page + 1); setSelected(null); }}>Próxima</Button></div>
    </>}
    {selected && <ResultForm key={`${selected.id}:${selected.version}`} sample={selected} onClose={() => { setSelected(null); void query.refetch(); }} />}
  </div>;
}
function ResultForm({ sample, onClose }: { sample: FocusSample; onClose: () => void }) {
  const save = useServerFn(recordFocusResult);
  const cache = useQueryClient();
  const [status, setStatus] = useState<"positive" | "negative" | "inconclusive">(sample.status === "pending" ? "positive" : sample.status);
  const [positiveIds, setPositive] = useState(sample.deposits.filter(d => d.positive).map(d => d.id));
  const latest = sample.history[0];
  const [reference, setReference] = useState(latest?.reference ?? "");
  const [analysisDate, setDate] = useState(latest?.analysis_date ?? getOperationalDate());
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
      const result = await save({ data: { visitId: sample.id, status, positiveDepositIds: status === "positive" ? positiveIds : [], reference, analysisDate, reason, version: sample.version, requestId } });
      if (result.bulletinState === "missing") toast.warning("Resultado salvo. Não existe boletim diário para esta coleta; confira o fechamento da produção.");
      else if (result.bulletinState === "unknown") toast.warning("Resultado salvo. Não foi possível conferir o boletim diário; atualize os relatórios.");
      else toast.success("Resultado confirmado e indicadores diários atualizados.");
      void cache.invalidateQueries(); onClose();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível confirmar. Atualize a lista antes de tentar novamente."); }
    finally { setBusy(false); }
  }
  return <Card id="focus-result-detail"><CardContent className="p-4 space-y-4">
    <h2 className="font-semibold">Resultado · Imóvel {sample.property_number} · coleta de {date(sample.visit_date)}</h2>
    {sample.needs_focus_identification && sample.status === "pending" && <IdentifyDeposits sample={sample} onSaved={onClose} />}
    {editable && !sample.needs_focus_identification ? <form onSubmit={submit} className="space-y-3">
      <p className="text-sm">Somente depósitos marcados pelo agente como foco/coleta: {sample.deposits.map(d => `${d.type_code} (${d.quantity})`).join(", ")}</p>
      <label className="block text-sm">Resultado<select className="block border rounded p-2" value={status} onChange={e => { setStatus(e.target.value as typeof status); change(); }}>{["positive","negative","inconclusive"].map(s => <option key={s} value={s}>{labels[s]}</option>)}</select></label>
      {status === "positive" && <fieldset className="border rounded p-3"><legend>Marque os depósitos positivos no laudo</legend><p className="text-xs text-muted-foreground">Apenas depósitos coletados aparecem. Os não marcados serão registrados como não positivos neste resultado.</p>{sample.deposits.map(d => <label key={d.id} className="block text-sm"><input type="checkbox" checked={positiveIds.includes(d.id)} onChange={e => { setPositive(e.target.checked ? [...positiveIds,d.id] : positiveIds.filter(id => id !== d.id)); change(); }} /> {d.type_code} · quantidade registrada: {d.quantity}</label>)}{!sample.deposits.length && <p className="text-destructive">Não há depósitos vinculados. Confira o registro original antes de confirmar positivo.</p>}</fieldset>}
      <label className="block text-sm">Referência do laudo/laboratório<Input required minLength={2} maxLength={200} value={reference} onChange={e => { setReference(e.target.value); change(); }} /></label>
      <label className="block text-sm">Data da análise<Input type="date" required min={getOperationalDate(new Date(sample.visit_date))} max={getOperationalDate()} value={analysisDate} onChange={e => { setDate(e.target.value); change(); }} /></label>
      <label className="block text-sm">{sample.status === "pending" ? "Observação (opcional)" : "Justificativa da correção"}<textarea className="block w-full border rounded p-2" required={sample.status !== "pending"} minLength={sample.status === "pending" ? 0 : 5} maxLength={2000} value={reason} onChange={e => { setReason(e.target.value); change(); }} /></label>
      <p className="text-xs text-muted-foreground">A confirmação registra seu usuário e horário e atualiza a coleta original. Nenhuma nova visita será criada.</p>
      <Button type="submit" disabled={busy || (status === "positive" && !positiveIds.length)}>{busy ? "Confirmando…" : sample.status === "pending" ? "Confirmar resultado" : "Confirmar correção"}</Button>
    </form> : <p className="text-sm">{sample.status === "pending" && sample.needs_focus_identification ? "Aguardando identificação dos depósitos coletados antes do resultado." : sample.can_record ? "Resultado confirmado. Correções devem ser feitas pelo coordenador ou administrador." : "Consulta do resultado. O lançamento é feito pelo supervisor da equipe."}</p>}
    <h3 className="font-semibold">Histórico</h3>
    {!sample.history.length && <p className="text-sm">Nenhum lançamento de laboratório registrado nesta área.{sample.status !== "pending" ? " A marcação existente foi preservada." : ""}</p>}
    {sample.history.map((h,i) => <div key={i} className="border rounded p-3 text-sm"><p>{labels[h.status]} · análise {date(h.analysis_date)} · {h.reference}</p><p>Registrado por {h.actor} em {new Date(h.recorded_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>{h.positive_deposit_ids && <p>Depósitos positivos: {h.positive_deposit_ids.map(id => { const d = sample.deposits.find(d => d.id === id); return d ? `${d.type_code} (${d.quantity})` : id; }).join(", ") || "Nenhum"}</p>}{h.reason && <p>{h.reason}</p>}</div>)}
    <Button variant="outline" disabled={busy} onClick={onClose}>Fechar</Button>
  </CardContent></Card>;
}

function IdentifyDeposits({ sample, onSaved }: { sample: FocusSample; onSaved: () => void }) {
  const identify = useServerFn(identifyFocusDeposits);
  const cache = useQueryClient();
  const [ids, setIds] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy || !navigator.onLine) { toast.error("Conecte-se para identificar os depósitos."); return; }
    setBusy(true);
    try { await identify({ data: { visitId: sample.id, depositIds: ids, reason } }); toast.success("Depósitos da coleta identificados. Nenhum laudo foi lançado."); void cache.invalidateQueries(); onSaved(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível identificar os depósitos."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="space-y-3 rounded border border-orange-200 p-3">
    <p className="text-sm">Registro antigo sem identificação de onde houve foco. Confirme apenas os depósitos realmente coletados; os demais continuam inspecionados. Esta ação é registrada com seu usuário e justificativa.</p>
    {(sample.inspected_deposits ?? []).map(d => <label key={d.id} className="block text-sm"><input type="checkbox" disabled={busy || d.quantity <= 0} checked={ids.includes(d.id)} onChange={e => setIds(e.target.checked ? [...ids,d.id] : ids.filter(id => id !== d.id))} /> {d.type_code} · {d.quantity} inspecionado(s)</label>)}
    {!sample.inspected_deposits?.length && <p className="text-destructive">Não há depósitos registrados nesta visita. Solicite conferência do registro original; nenhum depósito será inventado.</p>}
    <label className="block text-sm">Justificativa da identificação<textarea required minLength={5} maxLength={2000} disabled={busy} className="block w-full rounded border p-2" value={reason} onChange={e => setReason(e.target.value)} /></label>
    <Button disabled={busy || !ids.length}>{busy ? "Confirmando…" : "Identificar depósitos da coleta"}</Button>
  </form>;
}
