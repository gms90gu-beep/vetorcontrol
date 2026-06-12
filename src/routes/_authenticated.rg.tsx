import { createFileRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { blockManagersGuard } from "@/lib/role-guards";
import { useState, useEffect, useMemo, Component, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { safeGetUser } from "@/lib/offline/safe-auth";
import { useRGRecords } from "@/hooks/useOfflineData";
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

function RGPage() {
  const navigate = useNavigate();

  const [userId, setUserId] = useState<string | undefined>(undefined);
  const { data: rgData, loading: rgLoading, error: rgError } = useRGRecords(userId);

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

  // Painel de diagnóstico visível
  const [diag, setDiag] = useState({
    authUid: "—",
    supabaseCount: -1 as number,
    online: typeof navigator !== "undefined" ? navigator.onLine : true,
    swRegistered: false,
    cacheCount: -1 as number,
  });

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const uid = data?.session?.user?.id ?? null;
        let supabaseCount = -1;
        if (uid) {
          const { count } = await supabase
            .from("boletins_rg")
            .select("id", { count: "exact", head: true })
            .eq("agent_id", uid);
          supabaseCount = count ?? 0;
        }
        let swRegistered = false;
        if ("serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          swRegistered = regs.length > 0;
        }
        let cacheCount = -1;
        if ("caches" in window) {
          const keys = await caches.keys();
          cacheCount = keys.length;
        }
        setDiag((d) => ({
          ...d,
          authUid: uid ?? "—",
          supabaseCount,
          online: navigator.onLine,
          swRegistered,
          cacheCount,
        }));
      } catch (e) {
        console.warn("[RG_DIAG] erro", e);
      }
    })();
  }, [userId, rgData.length]);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await safeGetUser();
        if (!user) return;
        console.log('[RG_AUTH] user.id:', user.id);
        setUserId(user.id);
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
    setBoletins((rgData as any[]).map((r) => ({ ...r, total_imoveis: (r as any).total_imoveis ?? 0 })) as BoletimRow[]);
  }, [rgData]);


  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = !q
      ? boletins
      : boletins.filter((b) =>
          (b.block_number || "").toLowerCase().includes(q) ||
          (b.locality || "").toLowerCase().includes(q) ||
          (b.agent_name || "").toLowerCase().includes(q),
        );
    return [...base].sort((a, b) => {
      const na = parseInt((a.block_number || "").replace(/\D/g, ""), 10);
      const nb = parseInt((b.block_number || "").replace(/\D/g, ""), 10);
      const aHas = !isNaN(na);
      const bHas = !isNaN(nb);
      if (aHas && bHas && na !== nb) return na - nb;
      if (aHas && !bHas) return -1;
      if (!aHas && bHas) return 1;
      return (a.block_number || "").localeCompare(b.block_number || "");
    });
  }, [boletins, search]);

  useEffect(() => {
    console.log(`Após filtros restaram ${filtered.length} boletins`, {
      totalUseRGRecords: rgData.length,
      totalTelaAntesFiltros: boletins.length,
      search,
      filtered,
    });
  }, [filtered, rgData.length, boletins.length, search]);

  async function handleNewBoletim(payload: { block_number: string; locality: string }) {
    try {
      const { data: { user } } = await safeGetUser();
      if (!user) throw new Error("Não autenticado");

      const insert = {
        agent_id: user.id,
        block_number: payload.block_number,
        locality: payload.locality || null,
        municipality: agentDefaults.municipality || null,
        uf: "CE",
        agent_name: agentDefaults.name || null,
        agent_registration: agentDefaults.registration_id || null,
      };
      const { data, error } = await supabase
        .from("boletins_rg").insert(insert).select().single();
      if (error) throw error;
      setShowNew(false);
      toast.success("Boletim criado");
      navigate({ to: "/rg/boletim/$id", params: { id: data.id } });
    } catch (e: any) {
      console.error("[RG] new boletim", e);
      toast.error("Erro: " + e.message);
    }
  }

  async function handleDelete(b: BoletimRow) {
    setDeleteBusy(b.id);
    const t = toast.loading("Excluindo...");
    try {
      await supabase.from("properties").update({ boletim_id: null }).eq("boletim_id", b.id);
      const { error } = await supabase.from("boletins_rg").delete().eq("id", b.id);
      if (error) throw error;
      setBoletins((arr) => arr.filter((x) => x.id !== b.id));
      toast.success("Boletim excluído.", { id: t });
    } catch (e: any) {
      console.error("[RG] delete boletim", e);
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

      const fileName = `RG_QTR_${blockLabel}_${(b.municipality || "").toUpperCase()}_${format(new Date(b.created_at), "yyyyMMdd")}.pdf`;
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

        {/* DIAGNÓSTICO RG */}
        <div style={{ background: "#0b1520", color: "#cde", borderRadius: 10, padding: 10, fontSize: 11, fontFamily: "monospace", lineHeight: 1.5 }}>
          <div style={{ fontWeight: 700, color: "#fff", marginBottom: 4 }}>🔍 DIAGNÓSTICO RG</div>
          <div>USER auth.uid(): <span style={{ color: "#9fe" }}>{diag.authUid}</span></div>
          <div>RG RECORDS (Supabase): <span style={{ color: "#9fe" }}>{diag.supabaseCount === -1 ? "…" : diag.supabaseCount}</span></div>
          <div>RG RECORDS (Dexie): <span style={{ color: "#9fe" }}>{rgData.length}</span></div>
          <div>RG RECORDS após filtros: <span style={{ color: "#9fe" }}>{filtered.length}</span></div>
          <div>ONLINE: <span style={{ color: diag.online ? "#9fe" : "#f87" }}>{String(diag.online)}</span></div>
          <div>SERVICE WORKER registrado: <span style={{ color: "#9fe" }}>{diag.swRegistered ? "sim" : "não"}</span></div>
          <div>CACHE STORAGE: <span style={{ color: "#9fe" }}>{diag.cacheCount === -1 ? "…" : diag.cacheCount}</span></div>
        </div>


        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: C.text }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ background: C.card, border: `1px dashed ${C.border}`, borderRadius: 14 }} className="p-10 text-center">
            <FileText className="h-10 w-10 mx-auto mb-3" style={{ color: C.text2 }} />
            <div className="font-semibold" style={{ color: C.text }}>Nenhum boletim cadastrado</div>
            <div className="text-xs mt-1" style={{ color: C.text2 }}>Clique em "Novo Boletim" para começar.</div>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((b) => (
              <BoletimCard
                key={b.id}
                b={b}
                pdfBusy={pdfBusy === b.id}
                viewBusy={viewBusy === b.id}
                editBusy={editBusy === b.id}
                deleteBusy={deleteBusy === b.id}
                onView={() => handleView(b)}
                onPDF={() => handlePDF(b)}
                onEdit={() => handleEdit(b)}
                onDelete={() => setPendingDelete(b)}
              />
            ))}
          </div>
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
          <span className="text-sm font-bold leading-none">{b.block_number || "—"}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-bold text-sm truncate" style={{ color: C.text }}>
              {b.locality || "Logradouro não informado"}
            </div>
            <span style={{ background: statusBg, color: statusFg, borderRadius: 6 }} className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider">
              {status}
            </span>
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: C.text2 }}>
            {b.total_imoveis} imóve{b.total_imoveis === 1 ? "l" : "is"} · {format(new Date(b.created_at), "dd/MM/yyyy")}
            {b.agent_name ? ` · ${b.agent_name}` : ""}
          </div>
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
  const [locality, setLocality] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!block.trim()) { toast.error("Informe o número do quarteirão"); return; }
    setSaving(true);
    try {
      await onSubmit({ block_number: block.trim(), locality: locality.trim() });
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
        <Label className="text-[10px] uppercase tracking-widest font-bold" style={{ color: C.text2 }}>Logradouro / Localidade</Label>
        <Input value={locality} onChange={(e) => setLocality(e.target.value)} placeholder="Ex: Rua Castro Alves" className="h-10 mt-1" />
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
