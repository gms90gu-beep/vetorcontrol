import { createFileRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { blockManagersGuard } from "@/lib/role-guards";
import { useState, useEffect, useMemo, Component, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { safeGetUser } from "@/lib/offline/safe-auth";
import { db as offlineDb } from "@/lib/offline/db";
import { useRGRecords } from "@/hooks/useOfflineData";
import { useAuth } from "@/hooks/useAuth";
import {
  Plus,
  Search,
  Map as MapIcon,
  ArrowLeft,
  X,
  Eye,
  Download,
  Pencil,
  Trash2,
  AlertCircle,
  Loader2,
  FileText,
} from "lucide-react";
import { generateRGPDF } from "@/lib/pdf-generator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

// ===== Design tokens =====
const C = {
  bg: "#f4f5f7",
  card: "#ffffff",
  border: "#e0e4ea",
  hdrBg: "#0b1520",
  hdrCard: "#111e2e",
  hdrBorder: "#1e3048",
  hdrMute: "#4a6b80",
  hdrLabel: "#2e4a60",
  text: "#0b1520",
  text2: "#8a9ab0",
  green: "#059669",
  blue: "#185fa5",
  blueBg: "#e6f1fb",
  red: "#f87171",
  grayBg: "#f4f5f7",
  grayTx: "#5a6a7a",
  sep: "#f0f2f4",
};

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: any) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: any) {
    console.error("[RG_ERROR_BOUNDARY]", error, info?.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center gap-3">
          <h2 className="text-xl font-bold">Erro ao carregar o módulo RG</h2>
          <pre style={{ background: "#1a1a1a", color: "#f88", padding: 12, borderRadius: 8, maxWidth: "90vw", overflow: "auto", fontSize: 11, textAlign: "left" }}>
            {String(this.state.error?.message || this.state.error)}
            {"\n\n"}
            {this.state.error?.stack?.split("\n").slice(0, 6).join("\n")}
          </pre>
          <Button onClick={() => window.location.reload()}>Tentar novamente</Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export const Route = createFileRoute("/_authenticated/rg")({
  beforeLoad: blockManagersGuard,
  component: () => (
    <ErrorBoundary>
      <RGRouteContent />
    </ErrorBoundary>
  ),
});


function RGRouteContent() {
  const location = useLocation();

  if (
    location.pathname.startsWith("/rg/boletim/") ||
    location.pathname.startsWith("/rg/editar/")
  ) {
    return <Outlet />;
  }

  return <RGPage />;
}

type Boletim = {
  id: string;
  block_number: string | null;
  locality: string | null;
  municipality: string | null;
  uf: string | null;
  agent_name: string | null;
  agent_id: string;
  created_at: string;
  finalized_at: string | null;
  block_id?: string | null;
};

type BoletimRow = Boletim & { total_imoveis: number };

function safeFormatDate(value: unknown, pattern: string, fallback = "—") {
  if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date)) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return format(date, pattern);
}

function pickFirst(...vals: any[]): any {
  for (const v of vals) {
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
}

function normalizeBoletimRow(raw: any): BoletimRow {
  const data = raw?.data && typeof raw.data === "object" ? raw.data : {};
  const createdAt = pickFirst(raw?.created_at, data.created_at, raw?.createdAt, data.createdAt, raw?.updated_at, data.updated_at);

  // Try title "Boletim 4" as last resort
  const titleMatch = typeof raw?.title === "string" ? raw.title.match(/(\d+)/) : null;

  const rawBlock = pickFirst(
    data.block_number, raw?.block_number,
    data.quarteirao, raw?.quarteirao,
    data.blockId, raw?.blockId,
    data.block, raw?.block,
    data.block_id, raw?.block_id,
    data.number, raw?.number,
    titleMatch?.[1],
  );

  return {
    id: String(raw?.id ?? data.id ?? ""),
    block_number: rawBlock !== null && rawBlock !== undefined ? String(rawBlock) : null,
    locality: pickFirst(data.locality, raw?.locality, data.logradouro, raw?.logradouro, raw?.description),
    municipality: pickFirst(data.municipality, raw?.municipality),
    uf: pickFirst(data.uf, raw?.uf),
    agent_name: pickFirst(data.agent_name, raw?.agent_name),
    agent_id: pickFirst(data.agent_id, raw?.agent_id, raw?.userId) ?? "",
    created_at: createdAt ?? "",
    finalized_at: pickFirst(data.finalized_at, raw?.finalized_at),
    block_id: pickFirst(data.block_id, raw?.block_id),
    total_imoveis: Number(pickFirst(data.total_imoveis, raw?.total_imoveis) ?? 0),
  };
}

function RGPage() {
  const navigate = useNavigate();

  const { user, isReady } = useAuth();
  const userId = isReady ? user?.id : undefined;
  console.log(`[RG_PIPELINE] authReady: ${isReady} | userId: ${userId ?? 'undefined'} | fetchExecutado: ${!!userId}`);
  const { data: rgData, loading: rgLoading, error: rgError, refresh: refreshRGRecords } = useRGRecords(userId);

  const [boletins, setBoletins] = useState<BoletimRow[]>([]);
  const loading = rgLoading;
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  const [viewBusy, setViewBusy] = useState<string | null>(null);
  const [editBusy, setEditBusy] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BoletimRow | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState("");
  const [agentDefaults, setAgentDefaults] = useState<{ municipality: string; name: string; registration_id: string }>({
    municipality: "", name: "", registration_id: "",
  });




  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await safeGetUser();
        if (!user) return;
        console.log('[RG_AUTH] user.id:', user.id);
        // userId agora vem de useAuth — não precisa setar aqui.
        const { data: agentData } = await supabase
          .from("agents").select("name, municipality, registration_id")
          .eq("profile_id", user.id).maybeSingle();
        if (agentData) {
          setAgentDefaults({
            municipality: agentData.municipality || "",
            name: agentData.name || "",
            registration_id: agentData.registration_id || "",
          });
        }
      } catch (e: any) {
        console.error("[RG] agent defaults", e);
      }
    })();
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      console.log("[RG_SW] Service Worker indisponível neste navegador");
      return;
    }
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      console.log("[RG_SW] Service Worker controller:", navigator.serviceWorker.controller?.scriptURL ?? null);
      console.log("[RG_SW] Service Workers registrados:", registrations.map((r) => ({
        scope: r.scope,
        active: r.active?.scriptURL ?? null,
        waiting: r.waiting?.scriptURL ?? null,
        installing: r.installing?.scriptURL ?? null,
      })));
    }).catch((e) => console.warn("[RG_SW] Falha ao verificar Service Worker", e));
    if ("caches" in window) {
      caches.keys()
        .then((keys) => console.log("[RG_SW] Cache Storage keys:", keys))
        .catch((e) => console.warn("[RG_SW] Falha ao verificar Cache Storage", e));
    }
  }, []);

  useEffect(() => {
    if (rgError) toast.error(rgError);
  }, [rgError]);

  useEffect(() => {
    const arr = rgData as any[];
    if (arr?.length) {
      console.log('Primeiro boletim (raw):', arr[0]);
      console.log('Primeiro boletim (data interno):', arr[0]?.data);
      console.log('Chaves disponíveis:', Object.keys(arr[0] ?? {}), Object.keys(arr[0]?.data ?? {}));
    } else {
      console.log('Primeiro boletim: nenhum registro retornado');
    }
    const normalized = arr.map(normalizeBoletimRow).filter((r) => !!r.id);
    console.log('[RG_NORMALIZED]', normalized);
    console.log('[RG_NORMALIZED_COUNT]', normalized.length);
    console.log(`Após filtros restaram ${normalized.length} boletins`, normalized[0]);
    setBoletins(normalized);
  }, [rgData]);

  // Contagem de imóveis por boletim — fonte única: boletim_id.
  // Não usar fallback por block_id: após reconciliação, todo imóvel possui boletim_id.
  useEffect(() => {
    if (!boletins.length) return;
    let cancelled = false;
    (async () => {
      try {
        const ids = boletins.map((b) => b.id).filter(Boolean);
        if (!ids.length) return;
        const { data: props } = await supabase
          .from("properties")
          .select("boletim_id")
          .in("boletim_id", ids);
        if (cancelled || !props) return;
        const counts = new Map<string, number>();
        for (const p of props as any[]) {
          if (!p.boletim_id) continue;
          counts.set(p.boletim_id, (counts.get(p.boletim_id) ?? 0) + 1);
        }
        setBoletins((prev) => prev.map((b) => ({ ...b, total_imoveis: counts.get(b.id) ?? 0 })));
      } catch (e) {
        console.warn("[RG_COUNTS]", e);
      }
    })();
    return () => { cancelled = true; };
  }, [boletins.length]);





  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = !q
      ? boletins
      : boletins.filter((b) =>
          (b.block_number || "").toLowerCase().includes(q) ||
          (b.locality || "").toLowerCase().includes(q) ||
          (b.agent_name || "").toLowerCase().includes(q),
        );
    console.log("[RG_SORT_INPUT]", base.map((r) => ({ id: r.id, block: r.block_number, locality: r.locality })));
    const sorted = [...base].sort((a, b) => {
      const na = parseInt((a.block_number || "").replace(/\D/g, ""), 10);
      const nb = parseInt((b.block_number || "").replace(/\D/g, ""), 10);
      const aHas = !isNaN(na);
      const bHas = !isNaN(nb);
      if (aHas && bHas && na !== nb) return na - nb;
      if (aHas && !bHas) return -1;
      if (!aHas && bHas) return 1;
      return (a.block_number || "").localeCompare(b.block_number || "");
    });
    console.log("[RG_SORT_OUTPUT]", sorted.map((r) => ({ id: r.id, block: r.block_number, locality: r.locality })));
    return sorted;
  }, [boletins, search]);

  useEffect(() => {
    console.log(`Após filtros restaram ${filtered.length} boletins`, {
      totalUseRGRecords: rgData.length,
      totalTelaAntesFiltros: boletins.length,
      search,
      filtered,
    });
  }, [filtered, rgData.length, boletins.length, search]);

  console.log("[RG_RENDER_SOURCE]", {
    hookRecords: rgData.length,
    stateBoletins: boletins.length,
    renderedCards: filtered.length,
    source: "RGPage local state derived from useRGRecords",
  });

  async function handleNewBoletim(payload: { block_number: string; locality: string }) {
    try {
      const { data: { user } } = await safeGetUser();
      if (!user) throw new Error("Não autenticado");

      const locality = (payload.locality || "").trim();
      if (!locality) throw new Error("Localidade obrigatória");
      const normLocality = locality.toLowerCase();

      // 1) Localizar bloco existente (localidade + número, case-insensitive)
      const { data: existingBlocks } = await supabase
        .from("blocks")
        .select("id, number, locality")
        .eq("number", payload.block_number);
      let blockId =
        (existingBlocks ?? []).find(
          (b: any) => (b.locality ?? "").trim().toLowerCase() === normLocality,
        )?.id ?? null;

      // 2) Criar bloco se não existir
      if (!blockId) {
        const { data: anySubarea } = await supabase.from("subareas").select("id").limit(1).maybeSingle();
        const { data: newBlock, error: blockErr } = await supabase
          .from("blocks")
          .insert({
            number: payload.block_number,
            locality,
            status: "not_started",
            total_properties: 0,
            subarea_id: anySubarea?.id as any,
          })
          .select("id")
          .single();
        if (blockErr) throw blockErr;
        blockId = newBlock.id;
      }
      console.log("[RG_RECONCILE_BLOCK]", { blockId, blockNumber: payload.block_number, locality });

      // 3) Criar boletim já com block_id
      const insert = {
        agent_id: user.id,
        block_number: payload.block_number,
        block_id: blockId,
        locality,
        municipality: agentDefaults.municipality || null,
        uf: "CE",
        agent_name: agentDefaults.name || null,
        agent_registration: agentDefaults.registration_id || null,
      };
      const { data, error } = await supabase
        .from("boletins_rg").insert(insert).select().single();
      if (error) throw error;
      console.log("[RG_RECONCILE_DONE]", data.id);
      setShowNew(false);
      toast.success("Boletim criado");
      navigate({ to: "/rg/boletim/$id", params: { id: data.id } });
    } catch (e: any) {
      console.error("[RG] new boletim", e);
      toast.error("Erro: " + e.message);
    }
  }

  async function handleDelete(b: BoletimRow) {
    const boletimId = b.id;
    console.log("[RG_DELETE_START]", boletimId);
    setDeleteBusy(boletimId);
    const t = toast.loading("Excluindo...");
    try {
      const cacheBefore = await offlineDb.boletins_rg.get(boletimId);
      const relatedPropertiesBefore = await supabase
        .from("properties")
        .select("id, boletim_id, block_id, block_number")
        .eq("boletim_id", boletimId);
      const relatedBlockBefore = b.block_id
        ? await supabase
            .from("blocks")
            .select("id, number, locality, total_properties")
            .eq("id", b.block_id)
            .maybeSingle()
        : { data: null, error: null };

      console.log("[RG_DELETE_AUDIT_BEFORE]", {
        boletimId,
        block_id: b.block_id ?? null,
        cacheExists: !!cacheBefore,
        relatedPropertiesCount: relatedPropertiesBefore.data?.length ?? 0,
        relatedPropertiesError: relatedPropertiesBefore.error,
        relatedBlock: relatedBlockBefore.data,
        relatedBlockError: relatedBlockBefore.error,
      });

      const unlinkProperties = await supabase
        .from("properties")
        .update({ boletim_id: null })
        .eq("boletim_id", boletimId)
        .select("id, boletim_id, block_id, block_number");
      console.log("[RG_DELETE_PROPERTIES_RESULT]", {
        boletimId,
        data: unlinkProperties.data,
        error: unlinkProperties.error,
        action: "UPDATE properties SET boletim_id = null (preserva imóveis; não executa DELETE em properties)",
      });
      if (unlinkProperties.error) throw unlinkProperties.error;

      const { data, error } = await supabase
        .from("boletins_rg")
        .delete()
        .eq("id", boletimId)
        .select("id, block_number, locality, agent_id, block_id");
      console.log("[RG_DELETE_RESULT]", {
        boletimId,
        data,
        error,
      });
      if (error) throw error;

      const verifyBoletim = await supabase
        .from("boletins_rg")
        .select("id, block_number, locality, agent_id, block_id")
        .eq("id", boletimId)
        .maybeSingle();
      console.log("[RG_DELETE_VERIFY]", {
        boletimId,
        persisted: !verifyBoletim.data && !verifyBoletim.error,
        data: verifyBoletim.data,
        error: verifyBoletim.error,
      });

      console.log("[RG_DELETE_BLOCKS_RESULT]", {
        boletimId,
        block_id: b.block_id ?? null,
        action: "Nenhum DELETE em blocks executado pela tela RG; FK boletins_rg.block_id usa ON DELETE SET NULL e properties.block_id usa ON DELETE CASCADE.",
      });

      await offlineDb.boletins_rg.delete(boletimId);
      const cacheAfter = await offlineDb.boletins_rg.get(boletimId);
      console.log("[RG_OFFLINE_CACHE_AFTER_DELETE]", {
        boletimId,
        cacheExists: !!cacheAfter,
      });

      setBoletins((arr) => {
        const next = arr.filter((x) => x.id !== boletimId);
        console.log("[RG_AFTER_DELETE_COUNT]", next.length);
        return next;
      });
      void refreshRGRecords();
      toast.success("Boletim excluído.", { id: t });
    } catch (e: any) {
      console.error("[RG] delete boletim", e);
      console.log("[RG_AFTER_DELETE_COUNT]", boletins.length);
      toast.error("Erro ao excluir: " + e.message, { id: t });
    } finally {
      setDeleteBusy(null);
      setPendingDelete(null);
    }
  }

  function handleView(b: BoletimRow) {
    console.log("[RG] Ver Boletim ID:", b.id, b);
    if (!b?.id) {
      toast.error("ID do boletim inválido.");
      return;
    }
    setViewBusy(b.id);
    toast.loading("Abrindo...", { id: `view-${b.id}`, duration: 1500 });
    navigate({ to: "/rg/boletim/$id", params: { id: b.id } });
  }

  function handleEdit(b: BoletimRow) {
    console.log("[RG] Editar Boletim ID:", b.id, b);
    if (!b?.id) {
      toast.error("ID do boletim inválido.");
      return;
    }
    setEditBusy(b.id);
    toast.dismiss(`edit-${b.id}`);
    navigate({ to: "/rg/editar/$id", params: { id: b.id } });
  }

  async function handlePDF(b: BoletimRow) {
    console.log("[RG PDF] Boletim selecionado:", b.id, b);
    setPdfBusy(b.id);
    const tid = toast.loading("Gerando PDF...");
    try {
      // Load properties linked to this boletim (fallback to block_number).
      let { data: props } = await supabase
        .from("properties")
        .select("id, number, complement, type, street_name, side, sequence, inhabitants, status, observations")
        .eq("boletim_id", b.id)
        .order("sequence", { ascending: true });

      if ((!props || props.length === 0) && b.block_number) {
        const fb = await supabase
          .from("properties")
          .select("id, number, complement, type, street_name, side, sequence, inhabitants, status, observations")
          .eq("block_number", b.block_number)
          .order("sequence", { ascending: true });
        props = fb.data || [];
      }

      console.log("[RG PDF] Imóveis retornados:", props?.length || 0);

      if (!props || props.length === 0) {
        toast.error("Este boletim não possui imóveis vinculados.", { id: tid });
        return;
      }

      const stats = props.reduce(
        (acc: any, p: any) => {
          const t = (p.type || "").toLowerCase();
          if (t === "residence" || t === "residential") acc.R++;
          else if (t === "commerce" || t === "commercial") acc.C++;
          else if (t === "vacant_lot") acc.TB++;
          else if (t === "strategic_point") acc.PE++;
          else acc.O++;
          acc.total++;
          acc.hab += p.inhabitants || 0;
          return acc;
        },
        { R: 0, C: 0, TB: 0, PE: 0, O: 0, total: 0, hab: 0 },
      );

      const blockLabel = b.block_number || "SN";

      // Hybrid location from block (if any)
      let blockLoc: { address?: string | null; neighborhood?: string | null; latitude?: number | null; longitude?: number | null; location_source?: "gps" | "manual" | null } = {};
      if (b.block_id) {
        const { data: blk } = await supabase
          .from("blocks")
          .select("address, neighborhood, latitude, longitude, location_source")
          .eq("id", b.block_id)
          .maybeSingle();
        if (blk) blockLoc = blk as any;
      }

      const doc = await generateRGPDF(
        props as any,
        {
          municipality: b.municipality || agentDefaults.municipality || "",
          name: b.agent_name || agentDefaults.name || "",
          registrationId: agentDefaults.registration_id || "MAT-0000",
          cycle: "",
          week: "",
          block: blockLabel,
          street: b.locality || (props[0] as any)?.street_name || "",
          address: blockLoc.address ?? null,
          neighborhood: blockLoc.neighborhood ?? null,
          latitude: blockLoc.latitude ?? null,
          longitude: blockLoc.longitude ?? null,
          locationSource: blockLoc.location_source ?? null,
        },
        {
          total: stats.total, residences: stats.R, commerce: stats.C,
          lots: stats.TB, strategicPoints: stats.PE, others: stats.O, inhabitants: stats.hab,
        },
        { type: "block", value: blockLabel },
      );

      const fileName = `RG_QTR_${blockLabel}_${(b.municipality || "").toUpperCase()}_${safeFormatDate(b.created_at, "yyyyMMdd", "sem_data")}.pdf`;
      doc.save(fileName);
      toast.success("PDF gerado.", { id: tid });
    } catch (e: any) {
      console.error("[RG PDF] erro", e);
      toast.error("Erro ao gerar PDF: " + e.message, { id: tid });
    } finally {
      setPdfBusy(null);
    }
  }

  return (
    <div className="min-h-screen pb-24" style={{ background: C.bg }}>
      {/* HEADER */}
      <header style={{ background: C.hdrBg, padding: "14px" }} className="sticky top-0 z-40 pt-[calc(14px+env(safe-area-inset-top))]">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between">
            <button onClick={() => window.history.back()} style={{ color: C.hdrMute }} className="p-1 -ml-1 hover:opacity-80" aria-label="Voltar">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-white" style={{ fontSize: "15px", fontWeight: 700 }}>RG Digital</h1>
            <button onClick={() => navigate({ to: "/dashboard" })} style={{ color: C.hdrMute }} className="p-1 -mr-1 hover:opacity-80" aria-label="Fechar">
              <X className="h-5 w-5" />
            </button>
          </div>

          <p className="text-center mt-1" style={{ color: C.hdrMute, fontSize: "9px" }}>
            Boletins de Reconhecimento Geográfico · {boletins.length} cadastrado{boletins.length === 1 ? "" : "s"}
          </p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-[14px] space-y-3">
        {/* Toolbar */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: C.text2 }} />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por quarteirão, logradouro ou agente"
              className="pl-9 h-11 bg-white"
            />
          </div>
          <button
            onClick={() => setShowNew(true)}
            style={{ background: C.hdrBg, color: "#fff", borderRadius: 10 }}
            className="h-11 px-4 flex items-center gap-2 text-xs font-bold whitespace-nowrap"
          >
            <Plus className="h-4 w-4" /> Novo Boletim
          </button>
        </div>





        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: C.text }} />
          </div>
        ) : (
          <BoletimCardList
            boletins={filtered}
            pdfBusy={pdfBusy}
            viewBusy={viewBusy}
            editBusy={editBusy}
            deleteBusy={deleteBusy}
            onView={handleView}
            onPDF={handlePDF}
            onEdit={handleEdit}
            onDelete={setPendingDelete}
            emptyFallback={(
              <div style={{ background: C.card, border: `1px dashed ${C.border}`, borderRadius: 14 }} className="p-10 text-center">
                <FileText className="h-10 w-10 mx-auto mb-3" style={{ color: C.text2 }} />
                <div className="font-semibold" style={{ color: C.text }}>Nenhum boletim cadastrado</div>
                <div className="text-xs mt-1" style={{ color: C.text2 }}>Clique em "Novo Boletim" para começar.</div>
              </div>
            )}
          />
        )}
      </main>

      {/* New boletim dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base" style={{ color: C.text }}>
              <MapIcon className="h-5 w-5" style={{ color: C.blue }} /> Novo Boletim
            </DialogTitle>
          </DialogHeader>
          <NewBoletimForm onSubmit={handleNewBoletim} onCancel={() => setShowNew(false)} />
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base" style={{ color: C.text }}>
              <AlertCircle className="h-5 w-5" style={{ color: C.red }} /> Excluir boletim?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm" style={{ color: C.text2 }}>
            Esta ação não pode ser desfeita. Os imóveis vinculados serão desvinculados, mas não excluídos.
            {pendingDelete && (
              <> Boletim <strong>Q{pendingDelete.block_number || "—"}</strong>{pendingDelete.locality ? ` (${pendingDelete.locality})` : ""}.</>
            )}
          </p>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <Button variant="outline" onClick={() => setPendingDelete(null)}>Cancelar</Button>
            <Button
              onClick={() => pendingDelete && handleDelete(pendingDelete)}
              style={{ background: C.red, color: "#fff" }}
            >
              <Trash2 className="h-4 w-4 mr-1" /> Excluir
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BoletimCardList({ boletins, pdfBusy, viewBusy, editBusy, deleteBusy, emptyFallback, onView, onPDF, onEdit, onDelete }: {
  boletins: BoletimRow[];
  pdfBusy: string | null;
  viewBusy: string | null;
  editBusy: string | null;
  deleteBusy: string | null;
  emptyFallback?: ReactNode;
  onView: (b: BoletimRow) => void;
  onPDF: (b: BoletimRow) => void;
  onEdit: (b: BoletimRow) => void;
  onDelete: (b: BoletimRow) => void;
}) {
  console.log("[RG_COMPONENT_RENDER]", boletins.length);
  console.log("[RG_IDS]", boletins.map((b) => b.id));
  console.log("[RG_BLOCKS]", boletins.map((b) => `${b.block_number ?? "null"}-${b.locality ?? "null"}`));
  console.log(
    "[RG_BLOCK_DETAILS]",
    boletins.map((b) => ({
      id: b.id,
      block_number: b.block_number,
      locality: b.locality,
      status: (b as any).status,
      created_at: (b as any).created_at,
      property_count: (b as any).property_count,
    })),
  );
  const groupedMap = boletins.reduce<Record<string, string[]>>((acc, item) => {
    const key = `${item.block_number ?? "null"}-${item.locality ?? "null"}`;
    (acc[key] ??= []).push(item.id);
    return acc;
  }, {});
  const grouped = Object.entries(groupedMap).map(([block, ids]) => ({ block, ids }));
  console.log("[RG_GROUPED_BLOCKS]", grouped);
  console.log("[RG_GROUPED_BLOCKS_JSON]", JSON.stringify(grouped, null, 2));
  const duplicates = grouped.filter((g) => g.ids.length > 1);
  console.log("[RG_DUPLICATE_BLOCKS]", duplicates);
  console.log("[RG_DUPLICATE_BLOCKS_JSON]", JSON.stringify(duplicates, null, 2));
  const duplicateIds = new Set(duplicates.flatMap((g) => g.ids));
  const duplicateDetails = boletins
    .filter((b) => duplicateIds.has(b.id))
    .map((b) => ({
      id: b.id,
      block_number: b.block_number,
      locality: b.locality,
      created_at: (b as any).created_at,
      agent_id: (b as any).agent_id ?? (b as any).user_id,
    }));
  console.log("[RG_DUPLICATE_DETAILS]", duplicateDetails);
  console.log("[RG_DUPLICATE_DETAILS_JSON]", JSON.stringify(duplicateDetails, null, 2));


  return (
    <div className="space-y-2">
      {boletins.length === 0 && emptyFallback ? emptyFallback : boletins.map((b) => (
        <BoletimCard
          key={b.id}
          b={b}
          pdfBusy={pdfBusy === b.id}
          viewBusy={viewBusy === b.id}
          editBusy={editBusy === b.id}
          deleteBusy={deleteBusy === b.id}
          onView={() => onView(b)}
          onPDF={() => onPDF(b)}
          onEdit={() => onEdit(b)}
          onDelete={() => onDelete(b)}
        />
      ))}
    </div>
  );
}

function BoletimCard({ b, pdfBusy, viewBusy, editBusy, deleteBusy, onView, onPDF, onEdit, onDelete }: {
  b: BoletimRow;
  pdfBusy: boolean;
  viewBusy: boolean;
  editBusy: boolean;
  deleteBusy: boolean;
  onView: () => void;
  onPDF: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const status = b.finalized_at ? "Finalizado" : "Em aberto";
  const statusBg = b.finalized_at ? "#dcfce7" : C.blueBg;
  const statusFg = b.finalized_at ? "#15803d" : C.blue;
  const anyBusy = pdfBusy || viewBusy || editBusy || deleteBusy;

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14 }} className="p-4">
      <div className="flex items-start gap-3">
        <div style={{ background: C.blueBg, color: C.blue, borderRadius: 10 }} className="h-12 w-12 flex flex-col items-center justify-center shrink-0">
          <span className="text-[8px] font-bold tracking-wider opacity-75">QTR</span>
          <span className="text-sm font-bold leading-none">{(b as any).block_number || (b as any).quarteirao || (b as any).block || (b as any).block_id || "-"}</span>
        </div>
        <div className="flex-1 min-w-0">
          {(() => {
            const quarteirao = (b as any).block_number || (b as any).quarteirao || (b as any).block || (b as any).block_id || "-";
            const titulo =
              (b as any).logradouro ||
              b.locality ||
              (b as any).street_name ||
              `Quarteirão ${quarteirao}`;
            return (
              <>
                <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.text2 }}>
                  Quarteirão {quarteirao}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="font-bold text-sm truncate" style={{ color: C.text }}>
                    {titulo}
                  </div>
                  <span style={{ background: statusBg, color: statusFg, borderRadius: 6 }} className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                    {status}
                  </span>
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: C.text2 }}>
                  {b.total_imoveis} imóve{b.total_imoveis === 1 ? "l" : "is"} cadastrado{b.total_imoveis === 1 ? "" : "s"}
                </div>
              </>
            );
          })()}
        </div>

      </div>

      <div className="grid grid-cols-4 gap-2 mt-3">
        <ActionBtn onClick={onView} icon={viewBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} label={viewBusy ? "Abrindo..." : "Ver"} bg={C.hdrBg} fg="#fff" disabled={anyBusy} />
        <ActionBtn onClick={onPDF} icon={pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} label={pdfBusy ? "Gerando..." : "PDF"} bg={C.green} fg="#fff" disabled={anyBusy} />
        <ActionBtn onClick={onEdit} icon={editBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />} label={editBusy ? "Abrindo..." : "Editar"} bg={C.blueBg} fg={C.blue} disabled={anyBusy} />
        <ActionBtn onClick={onDelete} icon={deleteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} label={deleteBusy ? "Excluindo..." : "Excluir"} bg="#fee2e2" fg="#b91c1c" disabled={anyBusy} />
      </div>
    </div>
  );
}

function ActionBtn({ onClick, icon, label, bg, fg, disabled }: {
  onClick: () => void; icon: ReactNode; label: string; bg: string; fg: string; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(); }}
      disabled={disabled}
      style={{ background: bg, color: fg, borderRadius: 10 }}
      className="h-10 flex items-center justify-center gap-1.5 text-[11px] font-bold disabled:opacity-60 cursor-pointer active:scale-[0.98] transition-transform"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function NewBoletimForm({ onSubmit, onCancel }: {
  onSubmit: (p: { block_number: string; locality: string }) => Promise<void> | void;
  onCancel: () => void;
}) {
  const [block, setBlock] = useState("");
  const [side, setSide] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!block.trim()) { toast.error("Informe o número do quarteirão"); return; }
    setSaving(true);
    try {
      // locality fica vazio: logradouro agora pertence ao imóvel, não ao quarteirão.
      await onSubmit({ block_number: block.trim(), locality: "" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <Label className="text-[10px] uppercase tracking-widest font-bold" style={{ color: C.text2 }}>Quarteirão Nº</Label>
        <Input value={block} onChange={(e) => setBlock(e.target.value)} placeholder="Ex: 05" className="h-10 mt-1" autoFocus />
      </div>
      <div>
        <Label className="text-[10px] uppercase tracking-widest font-bold" style={{ color: C.text2 }}>Lado</Label>
        <Input value={side} onChange={(e) => setSide(e.target.value)} placeholder="Ex: Par / Ímpar" className="h-10 mt-1" />
        <p className="text-[10px] mt-1" style={{ color: C.text2 }}>
          O logradouro agora é informado em cada imóvel.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={saving} style={{ background: C.hdrBg, color: "#fff" }}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1" /> Criar</>}
        </Button>
      </div>
    </form>
  );
}
