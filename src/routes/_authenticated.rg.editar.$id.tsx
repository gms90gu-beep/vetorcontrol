import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/rg/editar/$id")({
  component: EditarBoletim,
});

type PropertyType = "residence" | "commerce" | "vacant_lot" | "strategic_point" | "others";

type Imovel = {
  id?: string;
  _new?: boolean;
  _deleted?: boolean;
  block_id?: string | null;
  street_name: string | null;
  side: string | null;
  number: string;
  sequence: number | null;
  complement: string | null;
  type: PropertyType;
  inhabitants: number | null;
};

type Form = {
  uf: string;
  municipality: string;
  locality: string;
  sublocality: string;
  district: string;
  subdistrict: string;
  block_number: string;
  side: string;
  category_1: string;
  category_2: string;
};

const EMPTY_FORM: Form = {
  uf: "", municipality: "", locality: "", sublocality: "",
  district: "", subdistrict: "", block_number: "", side: "",
  category_1: "", category_2: "",
};

function EditarBoletim() {
  const { id } = useParams({ from: "/_authenticated/rg/editar/$id" });
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [imoveis, setImoveis] = useState<Imovel[]>([]);
  const [boletimId, setBoletimId] = useState<string | null>(null);
  const [blockId, setBlockId] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("boletins_rg").select("*").eq("id", id).maybeSingle();
      console.log("Boletim carregado", data, err);
      if (err) throw err;
      if (!data) { setError("Boletim não encontrado."); return; }
      setBoletimId(data.id);
      setBlockId(data.block_id);
      setAgentId(data.agent_id);
      setForm({
        uf: data.uf || "",
        municipality: data.municipality || "",
        locality: data.locality || "",
        sublocality: data.sublocality || "",
        district: data.district || "",
        subdistrict: data.subdistrict || "",
        block_number: data.block_number || "",
        side: data.side || "",
        category_1: data.category_1 || "",
        category_2: data.category_2 || "",
      });

      // Load properties strictly linked to this boletim (sem fallback por
      // block_id, para não puxar imóveis de outros boletins).
      const { data: props } = await supabase
        .from("properties")
        .select("id, block_id, street_name, side, number, sequence, complement, type, inhabitants")
        .eq("boletim_id", data.id)
        .order("sequence", { ascending: true });

      console.log("Imóveis carregados:", props?.length || 0);
      setImoveis((props || []) as Imovel[]);
    } catch (e: any) {
      console.log("Erro", e);
      setError(e?.message || "Erro ao carregar boletim.");
    } finally {
      setLoading(false);
    }
  }

  function update<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function updateImovel(i: number, patch: Partial<Imovel>) {
    setImoveis((arr) => arr.map((im, idx) => (idx === i ? { ...im, ...patch } : im)));
  }

  function removeImovel(i: number) {
    const im = imoveis[i];
    if (!confirm("Remover este imóvel?")) return;
    if (im._new) {
      setImoveis((arr) => arr.filter((_, idx) => idx !== i));
    } else {
      setImoveis((arr) => arr.map((it, idx) => (idx === i ? { ...it, _deleted: true } : it)));
    }
  }

  function addImovel() {
    setImoveis((arr) => [
      ...arr,
      {
        _new: true,
        street_name: "",
        side: form.side || "",
        number: "",
        sequence: null,
        complement: "",
        type: "residence",
        inhabitants: 0,
      },
    ]);
  }

  function sortImoveisByNumber(arr: Imovel[]): Imovel[] {
    const visiveis = arr.filter((i) => !i._deleted);
    const deletados = arr.filter((i) => i._deleted);
    const sorted = [...visiveis].sort((a, b) => {
      const na = parseInt(a.number, 10) || 0;
      const nb = parseInt(b.number, 10) || 0;
      return na - nb;
    });
    return [...sorted, ...deletados];
  }

  async function save() {
    if (!boletimId) return;
    setSaving(true);
    const tid = toast.loading("Salvando...");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      console.log("[RG Editar] Usuário:", user);
      console.log("[RG Editar] Boletim ID:", boletimId, "Block ID:", blockId);
      console.log("[RG Editar] Form:", form);
      console.log("[RG Editar] Imóveis (estado):", imoveis);
      if (!user) throw new Error("Não autenticado");

      // Reordenar imóveis por número antes de salvar e usar a lista ordenada localmente
      const sortedImoveis = sortImoveisByNumber(imoveis);
      setImoveis(sortedImoveis);

      const effectiveAgentId = agentId || user.id;
      let effectiveBlockId = blockId || sortedImoveis.find((im) => !im._deleted && im.block_id)?.block_id || null;

      // Validate cached block_id still exists (cleanups / SET NULL race conditions).
      if (effectiveBlockId) {
        const { data: existsBlock } = await supabase
          .from("blocks").select("id").eq("id", effectiveBlockId).maybeSingle();
        if (!existsBlock?.id) {
          console.warn("[RG Editar] block_id em cache não existe mais; recriando.", effectiveBlockId);
          effectiveBlockId = null;
          setBlockId(null);
        }
      }

      if (!effectiveBlockId && form.block_number.trim()) {
        const blockPayload = { number: form.block_number.trim(), total_properties: 0 };
        console.log("[RG Editar] Dados do quarteirão:", blockPayload);
        const { data: existingBlock, error: existingBlockError } = await supabase
          .from("blocks")
          .select("id, number, total_properties")
          .eq("number", blockPayload.number)
          .maybeSingle();
        console.log("[RG Editar] Resultado busca quarteirão:", existingBlock, "Erro:", existingBlockError);
        if (existingBlockError) throw existingBlockError;

        if (existingBlock?.id) {
          effectiveBlockId = existingBlock.id;
        } else {
          const { data: subarea } = await supabase.from("subareas").select("id").limit(1).maybeSingle();
          if (!subarea?.id) throw new Error("Nenhuma subárea cadastrada para vincular o quarteirão.");
          const insertBlockPayload = { ...blockPayload, subarea_id: subarea.id };
          console.log("[RG Editar] INSERT blocks payload:", insertBlockPayload);
          const { data: createdBlock, error: blockError } = await supabase
            .from("blocks")
            .insert(insertBlockPayload)
            .select("id, number, total_properties")
            .single();
          console.log("[RG Editar] INSERT blocks resultado:", { data: createdBlock, error: blockError });
          if (blockError) throw blockError;
          effectiveBlockId = createdBlock.id;
        }
        setBlockId(effectiveBlockId);
      }

      const { error: bErr } = await supabase
        .from("boletins_rg")
        .update({
          uf: form.uf || null,
          municipality: form.municipality || null,
          locality: form.locality || null,
          sublocality: form.sublocality || null,
          district: form.district || null,
          subdistrict: form.subdistrict || null,
          block_number: form.block_number || null,
          side: form.side || null,
          category_1: form.category_1 || null,
          category_2: form.category_2 || null,
          block_id: effectiveBlockId,
        })
        .eq("id", boletimId);
      if (bErr) { console.error("[RG Editar] Erro update boletim:", bErr); throw bErr; }

      const toDelete = sortedImoveis.filter((i) => i._deleted && i.id).map((i) => i.id as string);
      if (toDelete.length > 0) {
        console.log("[RG Editar] Deletando imóveis:", toDelete);
        const { error } = await supabase.from("properties").delete().in("id", toDelete);
        if (error) { console.error("[RG Editar] Erro delete:", error); throw error; }
      }

      for (const im of sortedImoveis) {
        if (im._deleted || im._new || !im.id) continue;
        if (!effectiveBlockId) throw new Error("Quarteirão obrigatório para salvar o imóvel.");
        const { data: updatedProperty, error } = await supabase.from("properties").update({
          street_name: im.street_name || null,
          side: im.side || null,
          number: im.number,
          sequence: im.sequence,
          complement: im.complement || null,
          type: im.type,
          inhabitants: im.inhabitants ?? 0,
          boletim_id: boletimId,
          block_id: effectiveBlockId,
          block_number: form.block_number || null,
          user_id: effectiveAgentId,
        }).eq("id", im.id).select("id").maybeSingle();
        if (error) { console.error("[RG Editar] Erro update imóvel", im.id, error); throw error; }
        if (!updatedProperty?.id) throw new Error("Um imóvel existente não foi encontrado para atualização. Recarregue o boletim e tente novamente.");
      }

      // Inserts — um por um para identificar exatamente qual falha
      const toInsert = sortedImoveis.filter((i) => i._new && !i._deleted);
      console.log("[RG Editar] Imóveis a inserir:", toInsert.length);
      for (const im of toInsert) {
        if (!im.number?.trim()) throw new Error("Número do imóvel é obrigatório.");
        if (!im.type) throw new Error("Tipo do imóvel é obrigatório.");
        if (!effectiveBlockId) throw new Error("Quarteirão obrigatório para salvar o imóvel.");
        const payload = {
          street_name: im.street_name || null,
          side: im.side || null,
          number: im.number.trim(),
          sequence: im.sequence ?? null,
          complement: im.complement || null,
          type: im.type,
          inhabitants: im.inhabitants ?? 0,
          boletim_id: boletimId,
          block_id: effectiveBlockId,
          block_number: form.block_number || null,
          user_id: effectiveAgentId,
        };
        console.log("[RG Editar] Dados do imóvel:", payload);
        console.log("[RG Editar] Quarteirão:", { id: effectiveBlockId, number: form.block_number });
        console.log("[RG Editar] Usuário:", user);
        const { data, error } = await supabase
          .from("properties")
          .insert(payload)
          .select("id, block_id, street_name, side, number, sequence, complement, type, inhabitants")
          .single();
        console.log("[RG Editar] Resultado:", data);
        console.log("[RG Editar] Erro:", error);
        if (error) {
          console.error("[RG Editar] Erro INSERT imóvel:", error);
          const msg = `${error.message}${error.hint ? ` — ${error.hint}` : ""}${error.details ? ` (${error.details})` : ""}`;
          throw new Error(msg);
        }
        setImoveis((arr) => arr.map((item) => (item === im ? { ...(data as Imovel), _new: false } : item)));
      }

      toast.dismiss(tid);
      toast.success(toInsert.length > 0 ? "Imóvel cadastrado com sucesso." : "Boletim atualizado com sucesso.");
      await load();
    } catch (e: any) {
      console.log("Erro", e);
      toast.dismiss(tid);
      toast.error("Erro ao salvar alterações: " + (e?.message || "desconhecido"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3 p-6 text-center">
        <p className="font-bold text-slate-700">{error}</p>
        <p className="text-xs text-slate-400">ID: {id}</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load}>Tentar novamente</Button>
          <Button onClick={() => navigate({ to: "/rg" })}>Voltar</Button>
        </div>
      </div>
    );
  }

  const visiveis = [...imoveis]
    .filter((i) => !i._deleted)
    .sort((a, b) => {
      const na = parseInt(a.number, 10) || 0;
      const nb = parseInt(b.number, 10) || 0;
      return na - nb;
    });

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-40 bg-white border-b shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="font-black uppercase text-xs tracking-widest text-slate-700">
            Editar Boletim RG · Q{form.block_number || "—"}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/rg" })}>
              <X className="h-4 w-4 mr-1" /> Cancelar
            </Button>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              Salvar Alterações
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4 space-y-6">
        <section className="bg-white rounded-lg border p-4">
          <h2 className="font-bold text-sm uppercase tracking-wider text-slate-700 mb-3">Dados do Boletim</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="UF" value={form.uf} onChange={(v) => update("uf", v)} />
            <Field label="Município" value={form.municipality} onChange={(v) => update("municipality", v)} />
            <Field label="Localidade" value={form.locality} onChange={(v) => update("locality", v)} />
            <Field label="Sublocal" value={form.sublocality} onChange={(v) => update("sublocality", v)} />
            <Field label="Distrito" value={form.district} onChange={(v) => update("district", v)} />
            <Field label="Subdistrito" value={form.subdistrict} onChange={(v) => update("subdistrict", v)} />
            <Field label="Quarteirão" value={form.block_number} onChange={(v) => update("block_number", v)} />
            <Field label="Lado" value={form.side} onChange={(v) => update("side", v)} />
            <Field label="Categoria 1" value={form.category_1} onChange={(v) => update("category_1", v)} />
            <Field label="Categoria 2" value={form.category_2} onChange={(v) => update("category_2", v)} />
          </div>
        </section>

        <section className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-sm uppercase tracking-wider text-slate-700">
              Imóveis ({visiveis.length})
            </h2>
            <Button size="sm" variant="outline" onClick={addImovel}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar Imóvel
            </Button>
          </div>

          <div className="space-y-3">
            {visiveis.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-6">Nenhum imóvel cadastrado.</p>
            )}
            {imoveis.map((im, i) => {
              if (im._deleted) return null;
              return (
                <div key={im.id || `new-${i}`} className="border rounded-md p-3 grid grid-cols-2 md:grid-cols-7 gap-2 items-end">
                  <Field label="Logradouro" value={im.street_name || ""} onChange={(v) => updateImovel(i, { street_name: v })} className="md:col-span-2" />
                  <Field label="Número" value={im.number} onChange={(v) => updateImovel(i, { number: v })} />
                  
                  <Field label="Compl." value={im.complement || ""} onChange={(v) => updateImovel(i, { complement: v })} />
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-slate-500">Sequência</Label>
                    <label className="flex h-9 items-center gap-2 rounded-md border border-input px-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(im.sequence ?? 0) > 0}
                        onChange={(e) => updateImovel(i, { sequence: e.target.checked ? 1 : null })}
                      />
                      <span className="text-xs text-slate-600">Sim</span>
                    </label>
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-slate-500">Tipo</Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                      value={im.type}
                      onChange={(e) => updateImovel(i, { type: e.target.value as PropertyType })}
                    >
                      <option value="residence">Residência</option>
                      <option value="commerce">Comércio</option>
                      <option value="vacant_lot">Terreno Baldio</option>
                      <option value="strategic_point">Ponto Estratégico</option>
                      <option value="others">Outro</option>
                    </select>
                  </div>

                  <div className="flex items-end gap-2">
                    <Field
                      label="Hab."
                      value={String(im.inhabitants ?? 0)}
                      onChange={(v) => updateImovel(i, { inhabitants: v ? Number(v) : 0 })}
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => removeImovel(i)}
                      title="Remover imóvel"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div className="flex justify-end gap-2 pb-8">
          <Button variant="outline" onClick={() => navigate({ to: "/rg" })}>Cancelar</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            Salvar Alterações
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, className,
}: { label: string; value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <div className={className}>
      <Label className="text-[10px] uppercase tracking-wider text-slate-500">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
