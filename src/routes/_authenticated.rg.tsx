import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { blockManagersGuard } from "@/lib/role-guards";
import { useState, useEffect, useMemo, Component, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Plus,
  Search,
  Map as MapIcon,
  FileText,
  Printer,
  Save,
  Trash2,
  AlertCircle,
  ArrowLeft,
  X,
  Eye,
  Download,
  Share2,
  ChevronRight,
} from "lucide-react";
import { generateRGPDF, uploadBlockPDF } from "@/lib/pdf-generator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { RGBulletinHeader } from "@/components/rg/RGBulletinHeader";
import { RGBulletinTable, type Property } from "@/components/rg/RGBulletinTable";
import { RGBulletinFooter } from "@/components/rg/RGBulletinFooter";

// ===== Design tokens (spec exact hex) =====
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
  blueRing: "#3b9ede",
  red: "#f87171",
  amber: "#854f0b",
  amberBg: "#faeeda",
  purple: "#534ab7",
  purpleBg: "#eeedfe",
  grayBg: "#f4f5f7",
  grayTx: "#5a6a7a",
  sep: "#f0f2f4",
  dash: "#c0c8d4",
  tabInactive: "#aab0bc",
};

type TipoKey = "R" | "C" | "TB" | "PE" | "O";
const TIPO_META: Record<TipoKey, { label: string; bg: string; fg: string; dbType: Property["type"] }> = {
  R: { label: "Residencial", bg: C.blueBg, fg: C.blue, dbType: "residence" },
  C: { label: "Comercial", bg: C.amberBg, fg: C.amber, dbType: "commerce" },
  TB: { label: "Terreno Baldio", bg: C.amberBg, fg: C.amber, dbType: "vacant_lot" },
  PE: { label: "Pto. Estratégico", bg: C.purpleBg, fg: C.purple, dbType: "strategic_point" },
  O: { label: "Outros", bg: C.grayBg, fg: C.grayTx, dbType: "others" },
};

function dbToTipo(t?: string | null): TipoKey {
  const x = (t || "").toLowerCase();
  if (x === "residence" || x === "residential") return "R";
  if (x === "commerce" || x === "commercial") return "C";
  if (x === "vacant_lot") return "TB";
  if (x === "strategic_point") return "PE";
  return "O";
}

class ErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
  constructor(props: any) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() { return this.state.hasError ? this.props.fallback : this.props.children; }
}

export const Route = createFileRoute("/_authenticated/rg")({
  beforeLoad: blockManagersGuard,
  component: () => (
    <ErrorBoundary
      fallback={
        <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
          <h2 className="text-xl font-bold mb-4">Erro ao carregar o módulo RG</h2>
          <Button onClick={() => window.location.reload()}>Tentar novamente</Button>
        </div>
      }
    >
      <RGPage />
    </ErrorBoundary>
  ),
});

type TabKey = "cadastro" | "imoveis" | "boletim" | "historico";

function RGPage() {
  const navigate = useNavigate();

  const [tab, setTab] = useState<TabKey>("cadastro");
  const [properties, setProperties] = useState<Property[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [archivedPDFs, setArchivedPDFs] = useState<any[]>([]);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [agent, setAgent] = useState<any>(null);
  const [activeCycle, setActiveCycle] = useState<any>(null);
  const [activeWeek, setActiveWeek] = useState<any>(null);

  const [bulletinHeader, setBulletinHeader] = useState({
    uf: "CE",
    municipio: "",
    localidade: "",
    distrito: "",
    categoria: "URBANA",
    quarteirao: "",
    sequencia: "01",
    lado: "01",
    agente: "",
  });

  // delete confirm dialog
  const [pendingDelete, setPendingDelete] = useState<Property | null>(null);
  const [pendingDeleteBlock, setPendingDeleteBlock] = useState(false);

  // tab Imóveis filters
  const [search, setSearch] = useState("");
  const [tipoFilter, setTipoFilter] = useState<"ALL" | TipoKey>("ALL");

  useEffect(() => {
    fetchInitialData();
    fetchArchivedPDFs();
  }, []);

  async function fetchArchivedPDFs() {
    try {
      const { data, error } = await supabase.storage.from("block-reports").list("", {
        limit: 100, offset: 0, sortBy: { column: "created_at", order: "desc" },
      });
      if (error) throw error;
      setArchivedPDFs(data || []);
    } catch (e: any) { console.error(e.message); }
  }

  async function fetchInitialData() {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: agentData } = await supabase.from("agents").select("*").eq("profile_id", user.id).maybeSingle();
      if (agentData) {
        setAgent(agentData);
        setBulletinHeader((p) => ({ ...p, municipio: agentData.municipality || "", agente: agentData.name || "" }));
      }

      const { data: session } = await supabase
        .from("field_work_sessions").select("*")
        .eq("user_id", user.id).eq("status", "in_progress")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (session) {
        setActiveSession(session);
        setBulletinHeader((p) => ({ ...p, quarteirao: session.block_number || "" }));
      }

      const { data: cycle } = await supabase.from("cycles").select("*").eq("status", "in_progress").maybeSingle();
      if (cycle) {
        setActiveCycle(cycle);
        const { data: week } = await supabase.from("weeks").select("*").eq("cycle_id", cycle.id).order("number", { ascending: true }).limit(1).maybeSingle();
        if (week) setActiveWeek(week);
      }

      const { data, error } = await supabase
        .from("properties").select("*")
        .eq("user_id", user.id)
        .order("sequence", { ascending: true })
        .order("street_name", { ascending: true });
      if (error) throw error;
      setProperties(data as Property[]);
    } catch (e: any) {
      toast.error("Erro ao carregar dados: " + e.message);
    } finally {
      setIsLoading(false);
    }
  }

  // current quarteirão = bulletinHeader.quarteirao (fallback: empty filter shows all)
  const currentBlock = bulletinHeader.quarteirao;

  const blockProperties = useMemo(
    () => properties.filter((p) => !currentBlock || p.block_number === currentBlock),
    [properties, currentBlock],
  );

  const stats = useMemo(() => {
    const c = { R: 0, C: 0, TB: 0, PE: 0, O: 0, total: 0, hab: 0 };
    for (const p of blockProperties) {
      c[dbToTipo(p.type)]++;
      c.total++;
      c.hab += p.inhabitants || 0;
    }
    return c;
  }, [blockProperties]);

  // session stats (placeholder — derived from session if present)
  const sessionStats = {
    trabalhados: activeSession?.properties_worked ?? blockProperties.length,
    fechados: activeSession?.properties_closed ?? 0,
    focos: activeSession?.foci_found ?? 0,
  };

  // ====== handlers ======
  async function handleDeleteProperty(id: string) {
    try {
      const { error } = await supabase.from("properties").delete().eq("id", id);
      if (error) throw error;
      setProperties((p) => p.filter((x) => x.id !== id));
      toast.success("Imóvel removido");
    } catch (e: any) { toast.error("Erro: " + e.message); }
  }

  async function handleSaveHeader() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const { error } = await supabase.from("agents")
        .update({ municipality: bulletinHeader.municipio, name: bulletinHeader.agente })
        .eq("profile_id", user.id);
      if (error) throw error;
      toast.success("Cabeçalho salvo");
    } catch (e: any) { toast.error("Erro: " + e.message); }
  }

  async function handleExportBlockPDF() {
    console.log("[RG PDF] Gerando PDF do boletim atual", {
      quarteirao: currentBlock || "(sem quarteirão)",
      totalImoveis: blockProperties.length,
      boletimHeader: bulletinHeader,
    });

    if (blockProperties.length === 0) {
      toast.error("Este boletim não possui imóveis cadastrados.");
      return;
    }

    try {
      toast.loading("Gerando PDF...");
      const agentInfo = {
        municipality: bulletinHeader.municipio,
        name: bulletinHeader.agente,
        registrationId: agent?.registration_id || "MAT-0000",
        cycle: activeCycle?.number || "01/26",
        week: activeWeek?.number?.toString() || "1",
        block: currentBlock || "S/N",
        street: blockProperties[0]?.street_name || "",
      };
      const metadata = {
        total: stats.total, residences: stats.R, commerce: stats.C,
        lots: stats.TB, strategicPoints: stats.PE, others: stats.O, inhabitants: stats.hab,
      };
      const blockLabel = currentBlock || "SN";
      const doc = await generateRGPDF(blockProperties, agentInfo, metadata, { type: "block", value: blockLabel });
      const fileName = `RG_QTR_${blockLabel}_${(bulletinHeader.municipio || "").toUpperCase()}_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`;
      doc.save(fileName);
      try {
        await uploadBlockPDF(doc, blockLabel, bulletinHeader.municipio);
        fetchArchivedPDFs();
        toast.success("PDF gerado e arquivado");
      } catch { toast.info("PDF baixado (sem arquivamento)"); }
      toast.dismiss();
    } catch (e: any) {
      toast.dismiss();
      console.error("[RG PDF] Erro ao gerar PDF", e);
      toast.error("Erro ao gerar PDF: " + e.message);
    }
  }

  function handleBack() { window.history.back(); }
  function handleClose() { navigate({ to: "/dashboard" }); }

  return (
    <div className="min-h-screen pb-24" style={{ background: C.bg }}>
      {/* ============ HEADER ESCURO ============ */}
      <header style={{ background: C.hdrBg, padding: "14px" }} className="sticky top-0 z-40 pt-[calc(14px+env(safe-area-inset-top))]">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between">
            <button onClick={handleBack} style={{ color: C.hdrMute }} className="p-1 -ml-1 hover:opacity-80" aria-label="Voltar">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-white" style={{ fontSize: "15px", fontWeight: 700 }}>RG Digital</h1>
            <button onClick={handleClose} style={{ color: C.hdrMute }} className="p-1 -mr-1 hover:opacity-80" aria-label="Fechar">
              <X className="h-5 w-5" />
            </button>
          </div>

          <p className="text-center mt-1" style={{ color: C.hdrMute, fontSize: "9px" }}>
            Ciclo {activeCycle?.number ?? 1} / Semana {activeWeek?.number ?? 1}
            {currentBlock ? ` · Quarteirão ${currentBlock}` : ""}
            {bulletinHeader.municipio ? ` · ${bulletinHeader.municipio}` : ""}
            {bulletinHeader.uf ? ` – ${bulletinHeader.uf}` : ""}
          </p>

          <div className="grid grid-cols-3 gap-2 mt-3">
            {[
              { lbl: "Trabalhados", val: sessionStats.trabalhados, color: "#fff" },
              { lbl: "Fechados", val: sessionStats.fechados, color: "#fff" },
              { lbl: "Focos (+)", val: sessionStats.focos, color: C.red },
            ].map((s) => (
              <div key={s.lbl} style={{ background: C.hdrCard, border: `1px solid ${C.hdrBorder}`, borderRadius: 7 }} className="px-3 py-2.5 text-center">
                <div style={{ color: C.hdrLabel, fontSize: "8px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.lbl}</div>
                <div style={{ color: s.color, fontSize: "20px", fontWeight: 800, lineHeight: 1.1, marginTop: 2 }}>{s.val}</div>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* ============ TABS ============ */}
      <nav style={{ background: C.card, borderBottom: `1px solid ${C.border}` }} className="sticky z-30" >
        <div className="max-w-3xl mx-auto flex">
          {([
            ["cadastro", "Cadastro"],
            ["imoveis", `Imóveis (${blockProperties.length})`],
            ["boletim", "Boletim"],
            ["historico", "Histórico"],
          ] as [TabKey, string][]).map(([k, lbl]) => {
            const active = tab === k;
            return (
              <button
                key={k}
                onClick={() => setTab(k)}
                className="flex-1 py-3 text-xs font-bold transition-colors"
                style={{
                  color: active ? C.text : C.tabInactive,
                  borderBottom: active ? `2px solid ${C.text}` : "2px solid transparent",
                }}
              >
                {lbl}
              </button>
            );
          })}
        </div>
      </nav>

      <main className="max-w-3xl mx-auto p-[14px]">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: C.text }} />
          </div>
        ) : (
          <>
            {tab === "cadastro" && (
              <CadastroTab
                C={C}
                header={bulletinHeader}
                setHeader={setBulletinHeader}
                properties={blockProperties}
                stats={stats}
                onExportPDF={handleExportBlockPDF}
                onSaveHeader={handleSaveHeader}
                onDeleteProperty={(p) => setPendingDelete(p)}
                onAdd={async (data) => {
                  try {
                    const { data: { user } } = await supabase.auth.getUser();
                    if (!user) throw new Error("Não autenticado");
                    const payload = {
                      ...data,
                      block_number: bulletinHeader.quarteirao,
                      user_id: user.id,
                      status: "active" as const,
                    };
                    const { data: saved, error } = await supabase.from("properties").insert(payload).select().single();
                    if (error) throw error;
                    setProperties((p) => [...p, saved as Property]);
                    toast.success("Imóvel adicionado");
                  } catch (e: any) { toast.error("Erro: " + e.message); }
                }}
              />
            )}

            {tab === "imoveis" && (
              <ImoveisTab
                C={C}
                properties={blockProperties}
                search={search}
                setSearch={setSearch}
                tipoFilter={tipoFilter}
                setTipoFilter={setTipoFilter}
                onDelete={(p) => setPendingDelete(p)}
              />
            )}

            {tab === "boletim" && (
              <BoletimTab
                C={C}
                header={bulletinHeader}
                setHeader={setBulletinHeader}
                properties={blockProperties}
                stats={stats}
                onPrint={() => window.print()}
                onPDF={handleExportBlockPDF}
                onOpenOfficial={() => {
                  const blockId = blockProperties.find((p) => p.block_id)?.block_id;
                  if (!blockId) { toast.error("Cadastre ao menos um imóvel."); return; }
                  navigate({ to: "/rg/boletim/$id", params: { id: blockId } });
                }}
              />
            )}

            {tab === "historico" && (
              <HistoricoTab
                C={C}
                files={archivedPDFs}
                onOpen={async (name) => {
                  const { data } = await supabase.storage.from("block-reports").createSignedUrl(name, 60);
                  if (data?.signedUrl) window.open(data.signedUrl, "_blank");
                }}
                onShare={(name) => {
                  const text = encodeURIComponent(`Boletim Digital. Arquivo: ${name}`);
                  window.open(`https://wa.me/?text=${text}`, "_blank");
                }}
              />
            )}
          </>
        )}
      </main>

      {/* delete property dialog */}
      <Dialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base" style={{ color: C.text }}>
              <AlertCircle className="h-5 w-5" style={{ color: C.red }} /> Excluir imóvel?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm" style={{ color: C.text2 }}>
            Esta ação não pode ser desfeita.
            {pendingDelete && <> Imóvel <strong>{pendingDelete.number}</strong> {pendingDelete.street_name ? `(${pendingDelete.street_name})` : ""}.</>}
          </p>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <Button variant="outline" onClick={() => setPendingDelete(null)}>Cancelar</Button>
            <Button
              onClick={async () => { if (pendingDelete) { await handleDeleteProperty(pendingDelete.id); setPendingDelete(null); } }}
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

// =================== CADASTRO TAB ===================
function CadastroTab(props: {
  C: typeof C;
  header: any;
  setHeader: (h: any) => void;
  properties: Property[];
  stats: { R: number; C: number; TB: number; PE: number; O: number; total: number; hab: number };
  onExportPDF: () => void;
  onSaveHeader: () => void;
  onDeleteProperty: (p: Property) => void;
  onAdd: (data: any) => Promise<void>;
}) {
  const { C, header, setHeader, properties, stats, onExportPDF, onSaveHeader, onDeleteProperty, onAdd } = props;
  const nextSeq = (properties.reduce((m, p) => Math.max(m, p.sequence || 0), 0) || properties.length) + 1;

  return (
    <div className="space-y-4">
      {/* identidade card */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14 }} className="p-4 flex items-center gap-3">
        <div style={{ background: C.blueBg, borderRadius: 10 }} className="h-11 w-11 flex items-center justify-center">
          <MapIcon className="h-5 w-5" style={{ color: C.blue }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[15px]" style={{ color: C.text }}>RG Digital</div>
          <div className="text-[9px] uppercase tracking-widest" style={{ color: C.text2 }}>Reconhecimento Geográfico</div>
        </div>
      </div>

      {/* ações */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={onExportPDF} style={{ background: C.hdrBg, color: "#fff", borderRadius: 12 }} className="h-12 flex items-center justify-center gap-2 text-xs font-bold">
          <FileText className="h-4 w-4" /> PDF Quarteirão
        </button>
        <button onClick={onSaveHeader} style={{ background: C.green, color: "#fff", borderRadius: 12 }} className="h-12 flex items-center justify-center gap-2 text-xs font-bold">
          <Save className="h-4 w-4" /> Salvar
        </button>
      </div>

      {/* dados do quarteirão (editáveis) */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14 }} className="overflow-hidden">
        <div className="px-4 py-3 text-[9px] uppercase tracking-widest font-bold" style={{ color: C.text2, borderBottom: `1px solid ${C.sep}` }}>
          Dados do Quarteirão
        </div>
        {[
          ["UF", "uf"], ["Município", "municipio"], ["Localidade", "localidade"],
          ["Distrito", "distrito"], ["Categoria", "categoria"],
          ["Quarteirão Nº", "quarteirao"], ["Sequência", "sequencia"], ["Lado", "lado"],
        ].map(([lbl, key], i, arr) => (
          <div key={key} className="flex items-center px-4 py-2.5" style={{ borderBottom: i < arr.length - 1 ? `0.5px solid ${C.sep}` : "none" }}>
            <div className="flex-1 text-[11px]" style={{ color: C.text2 }}>{lbl}</div>
            {key === "categoria" ? (
              <span style={{ background: C.blueBg, color: C.blue, borderRadius: 6 }} className="px-2 py-0.5 text-[10px] font-bold uppercase">
                {header[key] || "—"}
              </span>
            ) : (
              <input
                value={header[key] || ""}
                onChange={(e) => setHeader({ ...header, [key]: e.target.value })}
                className="text-right text-sm font-bold bg-transparent outline-none w-32"
                style={{ color: C.text }}
              />
            )}
          </div>
        ))}
      </div>

      {/* totalizadores */}
      <div className="grid grid-cols-3 gap-2">
        <TotalCard C={C} label="Resid. (R)" value={stats.R} />
        <TotalCard C={C} label="Comerc. (C)" value={stats.C} />
        <TotalCard C={C} label="Ter. Baldio" value={stats.TB} />
        <TotalCard C={C} label="Pto. Estrat." value={stats.PE} />
        <TotalCard C={C} label="Outros" value={stats.O} />
        <TotalCard C={C} label="Total Geral" value={stats.total} dark />
      </div>
      <div style={{ background: C.green, borderRadius: 10 }} className="p-3 flex items-center justify-between text-white">
        <div className="text-[9px] uppercase tracking-widest font-bold opacity-90">Total Habitantes</div>
        <div style={{ fontSize: 20, fontWeight: 800 }}>{stats.hab}</div>
      </div>

      {/* lista imóveis */}
      <div>
        <div className="text-[9px] uppercase tracking-widest font-bold mb-2" style={{ color: C.text2 }}>
          Imóveis cadastrados
        </div>
        {properties.length === 0 ? (
          <div style={{ background: C.card, border: `1px dashed ${C.dash}`, borderRadius: 12, color: C.text2 }} className="p-6 text-center text-sm">
            Nenhum imóvel cadastrado neste quarteirão.
          </div>
        ) : (
          <div className="space-y-2">
            {properties.map((p, idx) => {
              const meta = TIPO_META[dbToTipo(p.type)];
              const seq = String(p.sequence || idx + 1).padStart(3, "0");
              return (
                <div key={p.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12 }} className="p-3 flex items-center gap-3 group">
                  <span style={{ background: C.grayBg, color: C.grayTx, borderRadius: 6 }} className="px-2 py-1 text-[10px] font-bold tabular-nums">{seq}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate" style={{ color: C.text }}>
                      {p.number} {p.complement ? `· ${p.complement}` : ""} {p.street_name ? `— ${p.street_name}` : ""}
                    </div>
                    <div className="text-[10px]" style={{ color: C.text2 }}>
                      Lado {p.side || "—"} · HAB: {p.inhabitants ?? 0}
                    </div>
                  </div>
                  <span style={{ background: meta.bg, color: meta.fg, borderRadius: 6 }} className="px-2 py-1 text-[10px] font-bold">
                    {dbToTipo(p.type)}
                  </span>
                  <button
                    onClick={() => onDeleteProperty(p)}
                    className="p-1.5 rounded transition-colors"
                    style={{ color: C.border }}
                    onMouseEnter={(e) => ((e.currentTarget.style.color = C.red))}
                    onMouseLeave={(e) => ((e.currentTarget.style.color = C.border))}
                    aria-label="Excluir"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* form adicionar */}
      <QuickAddCard C={C} nextSeq={nextSeq} defaultStreet={properties[properties.length - 1]?.street_name || ""} defaultSide={header.lado || ""} onAdd={onAdd} />
    </div>
  );
}

function TotalCard({ C, label, value, dark }: { C: any; label: string; value: number; dark?: boolean }) {
  return (
    <div
      style={{
        background: dark ? C.hdrBg : C.card,
        border: dark ? "none" : `1px solid ${C.border}`,
        borderRadius: 10,
        color: dark ? "#fff" : C.text,
      }}
      className="p-3 text-center"
    >
      <div style={{ color: dark ? "#fff" : C.text2, opacity: dark ? 0.7 : 1 }} className="text-[9px] uppercase tracking-widest font-bold">{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.1, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function QuickAddCard(props: { C: any; nextSeq: number; defaultStreet: string; defaultSide: string; onAdd: (d: any) => Promise<void> }) {
  const { C, nextSeq, defaultStreet, defaultSide, onAdd } = props;
  const [street, setStreet] = useState(defaultStreet);
  const [side, setSide] = useState(defaultSide);
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [inhabitants, setInhabitants] = useState<number>(0);
  const [tipo, setTipo] = useState<TipoKey>("R");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (defaultStreet && !street) setStreet(defaultStreet); }, [defaultStreet]);
  useEffect(() => { if (defaultSide && !side) setSide(defaultSide); }, [defaultSide]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!street.trim()) { toast.error("Informe a Rua"); return; }
    setSaving(true);
    try {
      await onAdd({
        number: number || "S/N",
        complement: complement || null,
        type: TIPO_META[tipo].dbType,
        street_name: street,
        side,
        sequence: nextSeq,
        inhabitants,
      });
      setNumber(""); setComplement(""); setInhabitants(0);
    } finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} style={{ border: `1.5px dashed ${C.dash}`, borderRadius: 12, background: C.card }} className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-bold text-sm" style={{ color: C.text }}>Novo Imóvel</div>
        <span style={{ background: C.grayBg, color: C.grayTx, borderRadius: 6 }} className="px-2 py-0.5 text-[10px] font-bold">SEQ: {String(nextSeq).padStart(3, "0")}</span>
      </div>

      <div>
        <Label className="text-[9px] uppercase tracking-widest font-bold" style={{ color: C.text2 }}>Rua / Logradouro</Label>
        <Input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Nome da rua" className="h-10 mt-1" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-[9px] uppercase tracking-widest font-bold" style={{ color: C.text2 }}>Lado</Label>
          <Input value={side} onChange={(e) => setSide(e.target.value)} className="h-10 mt-1" />
        </div>
        <div>
          <Label className="text-[9px] uppercase tracking-widest font-bold" style={{ color: C.text2 }}>Número</Label>
          <Input value={number} onChange={(e) => setNumber(e.target.value)} inputMode="numeric" className="h-10 mt-1" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-[9px] uppercase tracking-widest font-bold" style={{ color: C.text2 }}>Complemento</Label>
          <Input value={complement} onChange={(e) => setComplement(e.target.value)} className="h-10 mt-1" />
        </div>
        <div>
          <Label className="text-[9px] uppercase tracking-widest font-bold" style={{ color: C.text2 }}>Habitantes</Label>
          <Input value={inhabitants} onChange={(e) => setInhabitants(parseInt(e.target.value) || 0)} type="number" className="h-10 mt-1" />
        </div>
      </div>

      <div>
        <Label className="text-[9px] uppercase tracking-widest font-bold" style={{ color: C.text2 }}>Tipo</Label>
        <div className="grid grid-cols-5 gap-2 mt-1">
          {(Object.keys(TIPO_META) as TipoKey[]).map((k) => {
            const active = tipo === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setTipo(k)}
                className="h-10 text-[12px] font-bold rounded-md transition-all"
                style={{
                  background: active ? C.blueBg : C.grayBg,
                  color: active ? C.blue : C.grayTx,
                  border: active ? `1.5px solid ${C.blueRing}` : "1.5px solid transparent",
                }}
              >
                {k}
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="submit"
        disabled={saving}
        style={{ background: C.hdrBg, color: "#fff", borderRadius: 10 }}
        className="w-full h-12 flex items-center justify-center gap-2 text-xs font-bold disabled:opacity-60"
      >
        <Plus className="h-4 w-4" /> Adicionar Imóvel
      </button>
    </form>
  );
}

// =================== IMÓVEIS TAB ===================
function ImoveisTab(props: {
  C: any;
  properties: Property[];
  search: string;
  setSearch: (v: string) => void;
  tipoFilter: "ALL" | TipoKey;
  setTipoFilter: (v: "ALL" | TipoKey) => void;
  onDelete: (p: Property) => void;
}) {
  const { C, properties, search, setSearch, tipoFilter, setTipoFilter, onDelete } = props;
  const filtered = properties.filter((p) => {
    const okSearch = !search ||
      (p.street_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (p.number || "").toLowerCase().includes(search.toLowerCase());
    const okTipo = tipoFilter === "ALL" || dbToTipo(p.type) === tipoFilter;
    return okSearch && okTipo;
  });

  return (
    <div className="space-y-3">
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12 }} className="p-3 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: C.text2 }} />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por endereço ou número" className="pl-9 h-10" />
        </div>
        <div className="flex gap-2">
          {(["ALL", "R", "C", "TB", "PE", "O"] as const).map((k) => {
            const active = tipoFilter === k;
            return (
              <button
                key={k}
                onClick={() => setTipoFilter(k)}
                className={cn("flex-1 h-9 text-[11px] font-bold rounded-md")}
                style={{
                  background: active ? C.blueBg : C.grayBg,
                  color: active ? C.blue : C.grayTx,
                  border: active ? `1.5px solid ${C.blueRing}` : "1.5px solid transparent",
                }}
              >
                {k === "ALL" ? "Todos" : k}
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ background: C.card, border: `1px dashed ${C.dash}`, borderRadius: 12, color: C.text2 }} className="p-6 text-center text-sm">
          Nenhum imóvel encontrado.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((p, idx) => {
            const meta = TIPO_META[dbToTipo(p.type)];
            const seq = String(p.sequence || idx + 1).padStart(3, "0");
            return (
              <div key={p.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12 }} className="p-3 flex items-center gap-3">
                <span style={{ background: C.grayBg, color: C.grayTx, borderRadius: 6 }} className="px-2 py-1 text-[10px] font-bold tabular-nums">{seq}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate" style={{ color: C.text }}>
                    {p.number} {p.street_name ? `— ${p.street_name}` : ""}
                  </div>
                  <div className="text-[10px]" style={{ color: C.text2 }}>
                    Lado {p.side || "—"} · HAB: {p.inhabitants ?? 0}
                  </div>
                </div>
                <span style={{ background: meta.bg, color: meta.fg, borderRadius: 6 }} className="px-2 py-1 text-[10px] font-bold">
                  {dbToTipo(p.type)}
                </span>
                <button onClick={() => onDelete(p)} className="p-1.5 rounded transition-colors" style={{ color: C.border }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = C.red)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = C.border)}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// =================== BOLETIM TAB ===================
function BoletimTab(props: {
  C: any;
  header: any;
  setHeader: (h: any) => void;
  properties: Property[];
  stats: { R: number; C: number; TB: number; PE: number; O: number; total: number; hab: number };
  onPrint: () => void;
  onPDF: () => void;
  onOpenOfficial: () => void;
}) {
  const { C, header, setHeader, properties, stats, onPrint, onPDF, onOpenOfficial } = props;
  const adapted = {
    residence: stats.R, commerce: stats.C, vacant_lot: stats.TB,
    strategic_point: stats.PE, others: stats.O, total: stats.total, inhabitants: stats.hab,
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 no-print">
        <button onClick={onPrint} style={{ background: C.hdrBg, color: "#fff", borderRadius: 10 }} className="h-11 flex items-center justify-center gap-2 text-xs font-bold">
          <Printer className="h-4 w-4" /> Imprimir
        </button>
        <button onClick={onPDF} style={{ background: C.green, color: "#fff", borderRadius: 10 }} className="h-11 flex items-center justify-center gap-2 text-xs font-bold">
          <Download className="h-4 w-4" /> Baixar PDF
        </button>
        <button onClick={onOpenOfficial} style={{ background: C.blue, color: "#fff", borderRadius: 10 }} className="h-11 flex items-center justify-center gap-2 text-xs font-bold">
          <Eye className="h-4 w-4" /> BRG Oficial
        </button>
      </div>

      <div className="rounded-md overflow-hidden bg-white border" style={{ borderColor: C.border }}>
        <RGBulletinHeader data={header} onChange={(f, v) => setHeader({ ...header, [f]: v })} />
        <div className="overflow-x-auto">
          <RGBulletinTable properties={properties} onEdit={() => {}} onDelete={() => {}} />
        </div>
        <RGBulletinFooter stats={adapted} />
      </div>

      <style>{`@media print { .no-print { display: none !important; } header, nav { display: none !important; } }`}</style>
    </div>
  );
}

// =================== HISTÓRICO TAB ===================
function HistoricoTab(props: { C: any; files: any[]; onOpen: (name: string) => void; onShare: (name: string) => void }) {
  const { C, files, onOpen, onShare } = props;
  if (!files.length) {
    return (
      <div style={{ background: C.card, border: `1px dashed ${C.dash}`, borderRadius: 12, color: C.text2 }} className="p-8 text-center text-sm">
        Nenhum boletim arquivado ainda.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {files.map((f, i) => (
        <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12 }} className="p-3 flex items-center gap-3">
          <div style={{ background: C.blueBg, borderRadius: 8 }} className="h-10 w-10 flex items-center justify-center">
            <FileText className="h-5 w-5" style={{ color: C.blue }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate" style={{ color: C.text }}>{f.name}</div>
            <div className="text-[10px]" style={{ color: C.text2 }}>
              {f.created_at ? format(new Date(f.created_at), "dd/MM/yyyy HH:mm") : "—"}
            </div>
          </div>
          <button onClick={() => onShare(f.name)} className="p-2 rounded" style={{ color: C.green }} aria-label="Compartilhar">
            <Share2 className="h-4 w-4" />
          </button>
          <button onClick={() => onOpen(f.name)} className="p-2 rounded" style={{ color: C.blue }} aria-label="Visualizar">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
