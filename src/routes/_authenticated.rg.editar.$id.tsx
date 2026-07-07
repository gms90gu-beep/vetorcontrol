import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { safeGetUser } from "@/lib/offline/safe-auth";
import { safeSupabaseRead, createOffline, updateOffline, removeOffline } from "@/lib/offline/repos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, MapPin, Pencil, Plus, Save, Trash2, X, Layers } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { reverseGeocode } from "@/lib/geocoding.functions";
import { StreetAutocomplete } from "@/components/rg/StreetAutocomplete";

export const Route = createFileRoute("/_authenticated/rg/editar/$id")({
  component: EditarBoletim,
});

type PropertyType = "residence" | "commerce" | "vacant_lot" | "strategic_point" | "others";

type Imovel = {
  id?: string;
  _new?: boolean;
  _dirty?: boolean;
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

type BlockLoc = {
  address: string;
  neighborhood: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  location_source: "gps" | "manual" | null;
};

const EMPTY_BLOCK_LOC: BlockLoc = {
  address: "", neighborhood: "", city: "",
  latitude: null, longitude: null, location_source: null,
};

function EditarBoletim() {
  const { id } = useParams({ from: "/_authenticated/rg/editar/$id" });
  const navigate = useNavigate();
  const reverseGeocodeFn = useServerFn(reverseGeocode);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [imoveis, setImoveis] = useState<Imovel[]>([]);
  const [boletimId, setBoletimId] = useState<string | null>(null);
  const [blockId, setBlockId] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const addBtnRef = useRef<HTMLDivElement | null>(null);
  const lastItemRef = useRef<HTMLDivElement | null>(null);
  const [locationMode, setLocationMode] = useState<"gps" | "manual">("manual");
  const [blockLoc, setBlockLoc] = useState<BlockLoc>(EMPTY_BLOCK_LOC);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchQty, setBatchQty] = useState<number>(10);
  const [batchSaving, setBatchSaving] = useState(false);

  useEffect(() => {
    toast.dismiss();
    load();
    /* eslint-disable-next-line */
  }, [id]);

  async function load(showSpinner = true) {
    if (showSpinner) setLoading(true);
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

      // Load block location data (hybrid GPS / manual address)
      if (data.block_id) {
        const { data: block } = await supabase
          .from("blocks")
          .select("address, neighborhood, city, latitude, longitude, location_source")
          .eq("id", data.block_id)
          .maybeSingle();
        if (block) {
          setBlockLoc({
            address: (block as any).address || "",
            neighborhood: (block as any).neighborhood || "",
            city: (block as any).city || "",
            latitude: (block as any).latitude ?? null,
            longitude: (block as any).longitude ?? null,
            location_source: ((block as any).location_source as "gps" | "manual" | null) ?? null,
          });
          if ((block as any).location_source === "gps") setLocationMode("gps");
          else if ((block as any).address || (block as any).neighborhood) setLocationMode("manual");
        }
      }
    } catch (e: any) {
      console.log("Erro", e);
      setError(e?.message || "Erro ao carregar boletim.");
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  function update<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function updateImovel(i: number, patch: Partial<Imovel>) {
    setImoveis((arr) => arr.map((im, idx) => (idx === i ? { ...im, ...patch, _dirty: true } : im)));
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
    // Copia dados do último imóvel visível e incrementa apenas o número
    const visiveis = imoveis.filter((i) => !i._deleted);
    const last = visiveis[visiveis.length - 1];
    const parsed = last ? parseInt((last.number || "").replace(/\D/g, ""), 10) : NaN;
    const nextNumber = Number.isFinite(parsed) ? String(parsed + 1) : "";
    setImoveis((arr) => [
      ...arr,
      {
        _new: true,
        block_id: last?.block_id ?? null,
        street_name: last?.street_name || blockLoc.address || "",
        side: last?.side || form.side || "",
        number: nextNumber,
        sequence: null,
        complement: "",
        type: last?.type || "residence",
        inhabitants: 0,
      },
    ]);
    // Scroll the newly added imóvel into view (it is rendered as the last item)
    requestAnimationFrame(() => {
      setTimeout(() => {
        const target = lastItemRef.current || addBtnRef.current;
        target?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 80);
    });
  }

  async function captureLocation() {
    if (!("geolocation" in navigator)) {
      toast.error("Geolocalização não disponível neste dispositivo.");
      return;
    }
    setCapturing(true);
    const tid = toast.loading("Capturando localização...");
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
        });
      });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const result = await reverseGeocodeFn({ data: { lat, lng } });
      toast.dismiss(tid);
      if (result.ok) {
        setBlockLoc({
          address: result.address || "",
          neighborhood: result.neighborhood || "",
          city: result.city || "",
          latitude: lat,
          longitude: lng,
          location_source: "gps",
        });
        if (result.city) update("municipality", result.city);
        if (result.state) update("uf", result.state);
        if (result.address) update("locality", result.address);
        if (result.neighborhood) update("sublocality", result.neighborhood);
        // Propaga logradouro para imóveis sem street_name preenchido
        if (result.address) {
          setImoveis((arr) =>
            arr.map((im) =>
              im._deleted || (im.street_name && im.street_name.trim())
                ? im
                : { ...im, street_name: result.address! },
            ),
          );
        }
        toast.success(`Localização encontrada: ${result.formatted || `${result.address || ""}, ${result.neighborhood || ""}`}`);
      } else {
        setBlockLoc((b) => ({
          ...b,
          latitude: lat,
          longitude: lng,
          location_source: "gps",
        }));
        toast.warning(
          result.reason === "google_maps_not_connected"
            ? "Coordenadas capturadas. Conecte o Google Maps para identificar o endereço automaticamente."
            : `Coordenadas capturadas. Endereço não identificado (${result.reason}). Preencha manualmente.`,
        );
      }
    } catch (e: any) {
      toast.dismiss(tid);
      toast.error("Não foi possível capturar a localização: " + (e?.message || "permissão negada"));
    } finally {
      setCapturing(false);
    }
  }

  function sortImoveisByNumber(arr: Imovel[]): Imovel[] {
    const visiveis = arr.filter((i) => !i._deleted);
    const deletados = arr.filter((i) => i._deleted);
    const sorted = [...visiveis].sort((a, b) => {
      if (a._new && !b._new) return 1;
      if (!a._new && b._new) return -1;
      const na = parseInt(a.number, 10) || 0;
      const nb = parseInt(b.number, 10) || 0;
      return na - nb;
    });
    return [...sorted, ...deletados];
  }

  async function save() {
    if (!boletimId) {
      toast.error("Boletim ainda não carregado. Aguarde e tente novamente.");
      return;
    }
    setSaving(true);
    const toastId = `rg-edit-save-${boletimId}`;
    toast.dismiss();
    toast.loading("Salvando...", { id: toastId });
    try {
      const { data: { user } } = await safeGetUser();
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
          const subarea = await safeSupabaseRead<any>(
            () => supabase.from("subareas").select("id").limit(1).maybeSingle() as any,
            null,
            "subareas",
          );
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

      if (!effectiveBlockId) {
        throw new Error("Quarteirão obrigatório: informe o número do quarteirão antes de salvar.");
      }


      const boletimUpdate = supabase
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

      const blockUpdatePromise = effectiveBlockId
        ? supabase
            .from("blocks")
            .update({
              address: blockLoc.address || null,
              neighborhood: blockLoc.neighborhood || null,
              city: blockLoc.city || form.municipality || null,
              latitude: blockLoc.latitude,
              longitude: blockLoc.longitude,
              location_source: blockLoc.location_source,
            })
            .eq("id", effectiveBlockId)
        : Promise.resolve({ error: null } as any);

      const toDelete = sortedImoveis.filter((i) => i._deleted && i.id).map((i) => i.id as string);
      const deletePromise = toDelete.length > 0
        ? Promise.all(toDelete.map((id) => removeOffline("properties", id))).then(() => ({ error: null } as any))
        : Promise.resolve({ error: null } as any);

      const dirtyUpdates = sortedImoveis.filter((im) => !im._deleted && !im._new && im.id && im._dirty);
      const updatePromises = dirtyUpdates.map((im) => {
        if (!effectiveBlockId) throw new Error("Quarteirão obrigatório para salvar o imóvel.");
        return updateOffline("properties", im.id!, {
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
          updated_at: new Date().toISOString(),
        }).then(() => ({ error: null } as any));
      });

      const toInsert = sortedImoveis.filter((i) => i._new && !i._deleted);

      // ─── RC-13 Audit: divergência boletim × imóvel ─────────────────────
      if (toInsert.length > 0) {
        const { data: boletimSnap } = await supabase
          .from("boletins_rg")
          .select("id, block_id, block_number")
          .eq("id", boletimId!)
          .maybeSingle();
        console.log("[PROPERTY_ADD_START]", {
          boletim_id: boletimSnap?.id ?? boletimId,
          boletim_block_id: boletimSnap?.block_id ?? null,
          boletim_block_number: boletimSnap?.block_number ?? null,
          form_block_number: form.block_number,
          effectiveBlockId,
        });
        console.log("[PROPERTY_FORM]", toInsert.map((im) => ({
          property_id: im.id ?? "(novo)",
          property_block_id: im.block_id ?? null,
          property_block_number: (im as any).block_number ?? null,
        })));
        console.log("[PROPERTY_STATE]", {
          blockId, agentId, form_block_number: form.block_number, boletimId,
        });
        console.log("[PROPERTY_SOURCE]", {
          effectiveBlockId,
          from_blockId_state: blockId === effectiveBlockId,
          from_imovel_state: !!sortedImoveis.find((im) => im.block_id === effectiveBlockId),
          from_boletim: boletimSnap?.block_id === effectiveBlockId,
        });
        console.log("[PROPERTY_BLOCK_COMPARE]", {
          boletim_block_id: boletimSnap?.block_id ?? null,
          property_block_id: effectiveBlockId,
          activeSession_block_id: null,
          divergent: !!(boletimSnap?.block_id && boletimSnap.block_id !== effectiveBlockId),
        });
        if (boletimSnap?.block_id && boletimSnap.block_id !== effectiveBlockId) {
          console.error("[PROPERTY_ERROR]", {
            file: "src/routes/_authenticated.rg.editar.$id.tsx",
            fn: "save/insertPromises",
            line: 419,
            expected_block_id: boletimSnap.block_id,
            received_block_id: effectiveBlockId,
            reason: "block_id do imóvel difere do boletim",
          });
        }
      }

      const insertPromises = toInsert.map((im) => {
        const numero = (im.number || "").trim() || "S/N";
        if (!im.type) throw new Error("Tipo do imóvel é obrigatório.");
        if (!effectiveBlockId) throw new Error("Quarteirão obrigatório para salvar o imóvel.");
        const payload = {
          street_name: im.street_name || null,
          side: im.side || null,
          number: numero,
          sequence: im.sequence ?? null,
          complement: im.complement || null,
          type: im.type,
          inhabitants: im.inhabitants ?? 0,
          boletim_id: boletimId,
          block_id: effectiveBlockId,
          block_number: form.block_number || null,
          user_id: effectiveAgentId,
        };
        console.log("[PROPERTY_SAVE_PAYLOAD]", { payload });
        return supabase
          .from("properties")
          .insert(payload)
          .select("id, block_id, street_name, side, number, sequence, complement, type, inhabitants")
          .single()
          .then((res) => ({ res, im }));
      });

      const [bRes, locRes, delRes, updResults, insResults] = await Promise.all([
        boletimUpdate,
        blockUpdatePromise,
        deletePromise,
        Promise.all(updatePromises),
        Promise.all(insertPromises),
      ]);

      if ((bRes as any).error) throw (bRes as any).error;
      if ((locRes as any).error) console.warn("[RG Editar] Falha ao salvar localização:", (locRes as any).error);
      if ((delRes as any).error) throw (delRes as any).error;
      for (const u of updResults) {
        if ((u as any).error) throw (u as any).error;
      }
      for (const { res } of insResults) {
        if (res.error) {
          const error = res.error;
          const msg = `${error.message}${error.hint ? ` — ${error.hint}` : ""}${error.details ? ` (${error.details})` : ""}`;
          throw new Error(msg);
        }
      }

      if (insResults.length > 0) {
        setImoveis((arr) => arr.map((item) => {
          const hit = insResults.find((r) => r.im === item);
          return hit ? { ...(hit.res.data as Imovel), _new: false, _dirty: false } : item;
        }));
      }

      toast.success(toInsert.length > 0 ? "Imóvel cadastrado com sucesso." : "Boletim atualizado com sucesso.", { id: toastId });
      setSaving(false);
      load(false).catch((e) => console.warn("[RG Editar] Falha ao recarregar pós-save:", e));
      return;
    } catch (e: any) {
      console.error("[RG Editar] Erro ao salvar:", e);
      toast.error("Erro ao salvar alterações: " + (e?.message || "desconhecido"), { id: toastId });
    } finally {
      setSaving(false);
    }
  }

  async function addBatchProperties(qty: number) {
    if (!boletimId) {
      toast.error("Boletim ainda não carregado.");
      return;
    }
    if (qty < 1 || qty > 100) {
      toast.error("Quantidade deve ser entre 1 e 100.");
      return;
    }
    setBatchSaving(true);
    const toastId = `rg-batch-${boletimId}`;
    toast.loading(`Criando ${qty} imóveis...`, { id: toastId });
    try {
      const { data: { user } } = await safeGetUser();
      if (!user) throw new Error("Não autenticado");
      const effectiveAgentId = agentId || user.id;

      let effectiveBlockId = blockId || null;
      if (effectiveBlockId) {
        const { data: existsBlock } = await supabase
          .from("blocks")
          .select("id")
          .eq("id", effectiveBlockId)
          .maybeSingle();
        if (!existsBlock?.id) {
          effectiveBlockId = null;
          setBlockId(null);
        }
      }

      if (!effectiveBlockId && form.block_number.trim()) {
        const { data: existingBlock, error: existingBlockError } = await supabase
          .from("blocks")
          .select("id, number, total_properties")
          .eq("number", form.block_number.trim())
          .maybeSingle();
        if (existingBlockError) throw existingBlockError;

        if (existingBlock?.id) {
          effectiveBlockId = existingBlock.id;
        } else {
          const subarea = await safeSupabaseRead<any>(
            () => supabase.from("subareas").select("id").limit(1).maybeSingle() as any,
            null,
            "subareas",
          );
          if (!subarea?.id) throw new Error("Nenhuma subárea cadastrada para vincular o quarteirão.");
          const { data: createdBlock, error: blockError } = await supabase
            .from("blocks")
            .insert({ number: form.block_number.trim(), total_properties: 0, subarea_id: subarea.id })
            .select("id, number, total_properties")
            .single();
          if (blockError) throw blockError;
          effectiveBlockId = createdBlock.id;
        }
        setBlockId(effectiveBlockId);
      }

      if (!effectiveBlockId) throw new Error("Quarteirão obrigatório para criar imóveis.");

      const { data: lastProps } = await supabase
        .from("properties")
        .select("number, street_name, side, type, block_id")
        .eq("boletim_id", boletimId)
        .order("sequence", { ascending: false })
        .limit(1);

      const last = lastProps?.[0];
      const parsed = last ? parseInt((last.number || "").replace(/\D/g, ""), 10) : NaN;
      let nextNum = Number.isFinite(parsed) ? parsed + 1 : 1;

      const payload: any[] = [];
      for (let i = 0; i < qty; i++) {
        payload.push({
          street_name: last?.street_name || blockLoc.address || form.locality || null,
          side: last?.side || form.side || null,
          number: String(nextNum + i),
          sequence: null,
          complement: null,
          type: last?.type || "residence",
          inhabitants: 0,
          boletim_id: boletimId,
          block_id: effectiveBlockId,
          block_number: form.block_number || null,
          user_id: effectiveAgentId,
        });
      }

      // ─── RC-13 Audit: divergência boletim × imóvel (batch) ──────────────
      const { data: boletimSnap } = await supabase
        .from("boletins_rg")
        .select("id, block_id, block_number")
        .eq("id", boletimId!)
        .maybeSingle();
      console.log("[PROPERTY_ADD_START]", {
        boletim_id: boletimSnap?.id ?? boletimId,
        boletim_block_id: boletimSnap?.block_id ?? null,
        boletim_block_number: boletimSnap?.block_number ?? null,
        form_block_number: form.block_number,
        effectiveBlockId,
        qty,
      });
      console.log("[PROPERTY_STATE]", { blockId, agentId, form_block_number: form.block_number, boletimId });
      console.log("[PROPERTY_SOURCE]", {
        effectiveBlockId,
        from_blockId_state: blockId === effectiveBlockId,
        from_boletim: boletimSnap?.block_id === effectiveBlockId,
      });
      console.log("[PROPERTY_BLOCK_COMPARE]", {
        boletim_block_id: boletimSnap?.block_id ?? null,
        property_block_id: effectiveBlockId,
        activeSession_block_id: null,
        divergent: !!(boletimSnap?.block_id && boletimSnap.block_id !== effectiveBlockId),
      });
      if (boletimSnap?.block_id && boletimSnap.block_id !== effectiveBlockId) {
        console.error("[PROPERTY_ERROR]", {
          file: "src/routes/_authenticated.rg.editar.$id.tsx",
          fn: "addBatchProperties",
          line: 606,
          expected_block_id: boletimSnap.block_id,
          received_block_id: effectiveBlockId,
          reason: "block_id do imóvel difere do boletim",
        });
      }

      try {
        for (const row of payload) {
          console.log("[PROPERTY_SAVE_PAYLOAD]", { payload: row });
          await createOffline("properties", { ...row, updated_at: new Date().toISOString() });
        }
      } catch (insertError: any) {
        throw insertError;
      }

      toast.success(`${qty} imóveis criados com sucesso.`, { id: toastId });
      await load(false);
      setShowBatchModal(false);
    } catch (e: any) {
      console.error("[RG Batch] erro", e);
      toast.error("Erro ao criar em lote: " + (e?.message || "desconhecido"), { id: toastId });
    } finally {
      setBatchSaving(false);
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
          <Button variant="outline" onClick={() => load()}>Tentar novamente</Button>
          <Button onClick={() => navigate({ to: "/rg" })}>Voltar</Button>
        </div>
      </div>
    );
  }

  const visiveis = [...imoveis]
    .filter((i) => !i._deleted)
    .sort((a, b) => {
      if (a._new && !b._new) return 1;
      if (!a._new && b._new) return -1;
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
          <h2 className="font-bold text-sm uppercase tracking-wider text-slate-700 mb-3">
            Logradouro do Quarteirão
          </h2>
          <p className="text-xs text-slate-500 mb-3">Como deseja informar o logradouro?</p>
          <div className="flex gap-2 mb-4 flex-wrap">
            <Button
              type="button"
              size="sm"
              variant={locationMode === "gps" ? "default" : "outline"}
              onClick={() => setLocationMode("gps")}
            >
              <MapPin className="h-4 w-4 mr-1" /> Capturar localização
            </Button>
            <Button
              type="button"
              size="sm"
              variant={locationMode === "manual" ? "default" : "outline"}
              onClick={() => setLocationMode("manual")}
            >
              <Pencil className="h-4 w-4 mr-1" /> Digitar manualmente
            </Button>
          </div>

          {locationMode === "gps" && (
            <div className="mb-4">
              <Button
                type="button"
                size="sm"
                className="bg-blue-600 hover:bg-blue-700"
                onClick={captureLocation}
                disabled={capturing}
              >
                {capturing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <MapPin className="h-4 w-4 mr-1" />}
                📍 Usar Minha Localização
              </Button>
              {blockLoc.latitude != null && blockLoc.longitude != null && (
                <div className="mt-2 text-xs text-slate-600">
                  <div>Lat: {blockLoc.latitude.toFixed(6)} · Lng: {blockLoc.longitude.toFixed(6)}</div>
                  {blockLoc.address && (
                    <div className="mt-1 text-emerald-700 font-medium">
                      ✓ {blockLoc.address}{blockLoc.neighborhood ? `, ${blockLoc.neighborhood}` : ""}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StreetAutocomplete
              label="Logradouro"
              value={blockLoc.address}
              onChange={(v) => setBlockLoc((b) => ({ ...b, address: v, location_source: b.location_source ?? "manual" }))}
              bias={blockLoc.latitude != null && blockLoc.longitude != null ? { lat: blockLoc.latitude, lng: blockLoc.longitude } : null}
              onSelect={(r) => {
                setBlockLoc((b) => ({
                  ...b,
                  address: r.address || b.address,
                  neighborhood: r.neighborhood || b.neighborhood,
                  city: r.city || b.city,
                  latitude: r.latitude ?? b.latitude,
                  longitude: r.longitude ?? b.longitude,
                  location_source: r.latitude != null ? "gps" : (b.location_source ?? "manual"),
                }));
                if (r.city) update("municipality", r.city);
                if (r.state) update("uf", r.state);
                if (r.address) update("locality", r.address);
                if (r.neighborhood) update("sublocality", r.neighborhood);
                if (r.address) {
                  setImoveis((arr) =>
                    arr.map((im) =>
                      im._deleted || (im.street_name && im.street_name.trim())
                        ? im
                        : { ...im, street_name: r.address },
                    ),
                  );
                }
                toast.success(`Endereço selecionado: ${r.formatted || r.address}`);
              }}
              className="md:col-span-3"
            />
            <Field label="Bairro" value={blockLoc.neighborhood} onChange={(v) => setBlockLoc((b) => ({ ...b, neighborhood: v, location_source: b.location_source ?? "manual" }))} />
            <Field label="Município" value={blockLoc.city} onChange={(v) => setBlockLoc((b) => ({ ...b, city: v, location_source: b.location_source ?? "manual" }))} />
            <div className="flex items-end">
              <div className="text-xs text-slate-500">
                Origem:{" "}
                <span className={blockLoc.location_source === "gps" ? "text-emerald-700 font-semibold" : "text-slate-700 font-semibold"}>
                  {blockLoc.location_source === "gps" ? "GPS" : blockLoc.location_source === "manual" ? "Manual" : "—"}
                </span>
              </div>
            </div>
          </div>
        </section>

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
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="font-bold text-sm uppercase tracking-wider text-slate-700">
              Imóveis ({visiveis.length})
            </h2>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={addImovel}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar Imóvel
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowBatchModal(true)}>
                <Layers className="h-4 w-4 mr-1" /> Adicionar em Lote
              </Button>
            </div>
          </div>



          <div className="space-y-3">
            {visiveis.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-6">Nenhum imóvel cadastrado.</p>
            )}
            {visiveis.map((im, vIdx) => {
              const i = imoveis.indexOf(im);
              const isLast = vIdx === visiveis.length - 1;
              return (
                <div
                  key={im.id || `new-${i}`}
                  ref={isLast ? lastItemRef : undefined}
                  className="border rounded-md p-3 grid grid-cols-2 md:grid-cols-8 gap-2 items-end"
                >
                  <StreetAutocomplete
                    label="Logradouro"
                    value={im.street_name || ""}
                    onChange={(v) => updateImovel(i, { street_name: v })}
                    bias={blockLoc.latitude != null && blockLoc.longitude != null ? { lat: blockLoc.latitude, lng: blockLoc.longitude } : null}
                    onSelect={(r) => updateImovel(i, { street_name: r.address || im.street_name || "" })}
                    className="md:col-span-2"
                  />
                  <Field label="Lado" value={im.side || ""} onChange={(v) => updateImovel(i, { side: v })} />
                  <Field label="Número" value={im.number} onChange={(v) => updateImovel(i, { number: v })} />
                  <Field label="Compl." value={im.complement || ""} onChange={(v) => updateImovel(i, { complement: v })} />
                  <Field
                    label="Sequência"
                    type="number"
                    value={im.sequence != null ? String(im.sequence) : ""}
                    onChange={(v) => updateImovel(i, { sequence: v.trim() === "" ? null : Number(v) })}
                  />
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

          <div ref={addBtnRef} className="mt-4 flex justify-center scroll-mt-24 gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={addImovel}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar Imóvel
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowBatchModal(true)}>
              <Layers className="h-4 w-4 mr-1" /> Adicionar em Lote
            </Button>
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

      <Dialog open={showBatchModal} onOpenChange={setShowBatchModal}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">Adicionar Imóveis em Lote</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-[10px] uppercase tracking-widest font-bold text-slate-500">
                Quantidade de imóveis
              </Label>
              <Input
                type="number"
                min={1}
                max={500}
                inputMode="numeric"
                value={batchQty === 0 ? "" : batchQty}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") { setBatchQty(0); return; }
                  const n = parseInt(raw, 10);
                  if (Number.isFinite(n)) setBatchQty(Math.max(0, Math.min(500, n)));
                }}
                className="h-10 mt-1 text-base font-bold"
                placeholder="Digite a quantidade"
                autoFocus
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Informe quantos imóveis deseja criar (1 a 500).
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {[5, 10, 20, 50, 100, 200].map((n) => (
                <Button
                  key={n}
                  type="button"
                  size="sm"
                  variant={batchQty === n ? "default" : "outline"}
                  onClick={() => setBatchQty(n)}
                >
                  {n}
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowBatchModal(false)} disabled={batchSaving}>
              Cancelar
            </Button>
            <Button
              onClick={() => addBatchProperties(batchQty)}
              disabled={batchSaving || batchQty < 1 || batchQty > 500}
            >
              {batchSaving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Layers className="h-4 w-4 mr-1" />}
              Criar {batchQty > 0 ? batchQty : ""} Imóveis
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label, value, onChange, className, type,
}: { label: string; value: string; onChange: (v: string) => void; className?: string; type?: string }) {
  return (
    <div className={className}>
      <Label className="text-[10px] uppercase tracking-wider text-slate-500">{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
