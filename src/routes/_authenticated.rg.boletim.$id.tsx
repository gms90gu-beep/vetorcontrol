import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { safeGetUser } from "@/lib/offline/safe-auth";
import { Button } from "@/components/ui/button";
import {
  Printer,
  Download,
  ArrowLeft,
  Loader2,
  Map as MapIcon,
  Home,
  MapPin,
  AlertTriangle,
  Target,
  ArrowDown,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { BlockMapDialog } from "@/components/rg/BlockMapDialog";
import { GeorefButton } from "@/components/property/GeorefButton";

export const Route = createFileRoute("/_authenticated/rg/boletim/$id")({
  component: BoletimView,
});

const LINHAS_POR_FOLHA = 40;

type Property = {
  id: string;
  street_name: string | null;
  side: string | null;
  number: string;
  sequence: number | null;
  complement: string | null;
  type: string;
  inhabitants: number | null;
  latitude: number | null;
  longitude: number | null;
  geocoded_at: string | null;
  had_previous_focus: boolean | null;
  status: string | null;
};

type Boletim = {
  id: string;
  block_id: string | null;
  block_number: string | null;
  agent_id: string;
  uf: string | null;
  municipality: string | null;
  locality: string | null;
  sublocality: string | null;
  district: string | null;
  subdistrict: string | null;
  category_1: string | null;
  category_2: string | null;
  sequence: string | null;
  side: string | null;
  inspector_general: string | null;
  inspector: string | null;
  team_lead: string | null;
  agent_name: string | null;
  agent_registration: string | null;
  created_at: string;
};

function tipoCodigo(t: string): "R" | "C" | "TB" | "PE" | "O" {
  const x = (t || "").toLowerCase();
  if (x === "residence" || x === "residential" || x === "r") return "R";
  if (x === "commerce" || x === "commercial" || x === "c") return "C";
  if (x === "vacant_lot" || x === "tb") return "TB";
  if (x === "strategic_point" || x === "pe") return "PE";
  return "O";
}

function comparePropertyNumber(a: Property, b: Property) {
  return (Number.parseInt(a.number, 10) || 0) - (Number.parseInt(b.number, 10) || 0);
}

function BoletimView() {
  const { id } = useParams({ from: "/_authenticated/rg/boletim/$id" });
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [boletim, setBoletim] = useState<Boletim | null>(null);
  const [imoveis, setImoveis] = useState<Property[]>([]);
  const [viewerBlock, setViewerBlock] = useState<Record<string, any> | null>(null);
  const [viewerFilters, setViewerFilters] = useState<Record<string, any> | null>(null);
  const [loadError, setLoadError] = useState<{ kind: "not_found" | "forbidden" | "generic"; message: string } | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const tableRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [geoFilter, setGeoFilter] = useState<"all" | "geo" | "pending">("all");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await safeGetUser();
      setCurrentUserId(user?.id ?? null);
    })();
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Auto-scale do documento somente em telas estreitas
  useEffect(() => {
    const computeScale = () => {
      const w = window.innerWidth;
      if (w < 480) setScale(0.7);
      else if (w < 768) setScale(0.82);
      else setScale(1);
    };
    computeScale();
    window.addEventListener("resize", computeScale);
    return () => window.removeEventListener("resize", computeScale);
  }, []);

  async function load() {
    setLoading(true);
    setLoadError(null);
      setViewerBlock(null);
      setViewerFilters(null);
    try {
      const { listRemoteOrCache, getLocal } = await import("@/lib/offline/repos");
      const online = typeof navigator !== "undefined" ? navigator.onLine : true;
      let b: Boletim | null = null;

      // 1) Boletim por id (online → Supabase + hidrata Dexie; offline → Dexie)
      try {
        const rows = await listRemoteOrCache<any>({
          name: "boletins_rg",
          remote: () => supabase.from("boletins_rg").select("*").eq("id", id) as any,
          filter: (r) => r.id === id,
        });
        if (rows && rows.length > 0) b = rows[0] as Boletim;
      } catch (e: any) {
        const msg = e?.message || "";
        if (/permission|denied|policy|rls/i.test(msg)) {
          setLoadError({ kind: "forbidden", message: "Você não possui acesso a este boletim." });
          return;
        }
      }

      // 2) Fallback: id pode ser block_id
      if (!b) {
        try {
          const rows = await listRemoteOrCache<any>({
            name: "boletins_rg",
            remote: () =>
              supabase.from("boletins_rg").select("*").eq("block_id", id).order("created_at", { ascending: false }).limit(1) as any,
            filter: (r) => r.block_id === id,
          });
          if (rows && rows.length > 0) {
            b = [...rows].sort((x: any, y: any) => String(y.created_at || "").localeCompare(String(x.created_at || "")))[0] as Boletim;
          }
        } catch {}
      }

      // 3) Online: criar boletim a partir do block. Offline: não criar.
      if (!b && online) {
        const { data: { user } } = await safeGetUser();
        if (!user) throw new Error("Não autenticado");

        const { data: blockRow } = await supabase
          .from("blocks").select("*").eq("id", id).maybeSingle();

        if (!blockRow) {
          setLoadError({ kind: "not_found", message: "Boletim não encontrado." });
          return;
        }

        const { data: profile } = await supabase
          .from("profiles").select("full_name, registration_number, city")
          .eq("id", user.id).maybeSingle();

        const { data: agentRow } = await supabase
          .from("agents").select("name, registration_id, municipality")
          .eq("profile_id", user.id).maybeSingle();

        const insertPayload = {
          block_id: blockRow.id,
          block_number: blockRow.number ?? null,
          agent_id: user.id,
          uf: "CE",
          municipality: agentRow?.municipality ?? profile?.city ?? null,
          agent_name: agentRow?.name ?? profile?.full_name ?? null,
          agent_registration: agentRow?.registration_id ?? profile?.registration_number ?? null,
        };
        const { data: created, error: createErr } = await supabase
          .from("boletins_rg").insert(insertPayload).select().single();
        if (createErr) {
          if (/permission|denied|policy|rls/i.test(createErr.message)) {
            setLoadError({ kind: "forbidden", message: "Você não possui acesso para criar este boletim." });
            return;
          }
          throw createErr;
        }
        b = created as Boletim;
      }

      if (!b) {
        setLoadError({
          kind: "not_found",
          message: online ? "Boletim não encontrado." : "Boletim indisponível no modo offline (sem cache local).",
        });
        return;
      }

      // ── Fallback robusto do número do quarteirão ──
      try {
        const fromBoletim = (b as any).block_number;
        const fromQuarteirao = (b as any).quarteirao;
        let resolved =
          (fromBoletim !== null && fromBoletim !== undefined && fromBoletim !== "" ? fromBoletim : null) ??
          (fromQuarteirao !== null && fromQuarteirao !== undefined && fromQuarteirao !== "" ? fromQuarteirao : null);
        console.log("[RG_BLOCK]", { id: b.id, block_id: b.block_id, from_boletim: fromBoletim, from_quarteirao: fromQuarteirao });
        if (!resolved && b.block_id) {
          const cachedBlock = await getLocal<any>("blocks", b.block_id);
          console.log("[RG_CACHE]", { block_id: b.block_id, cached: !!cachedBlock, number: cachedBlock?.number });
          if (cachedBlock?.number) resolved = cachedBlock.number;
        }
        if (resolved && !(b as any).block_number) {
          (b as any).block_number = resolved;
        }
        console.log("[RG_HEADER]", { block_number: (b as any).block_number || "-" });
      } catch (e) {
        console.warn("[RG_BLOCK] fallback falhou:", e);
      }

      const blockForUi = b.block_id ? await getLocal<any>("blocks", b.block_id) : null;
      setViewerBlock(blockForUi);

      setBoletim(b);

      // 4) Imóveis — resolução em cadeia (boletim_id → block_id → block_number).
      //    Qualquer relacionamento que produzir resultado é utilizado.
      const lookupFilters = { boletim_id: b.id, block_id: b.block_id, block_number: b.block_number };
      setViewerFilters(lookupFilters);
      console.log("[RG_VIEWER_LOOKUP]", lookupFilters);

      let usedRel: "boletim_id" | "block_id" | "block_number" | "none" = "none";
      let propsRaw: any[] = [];
      let viewerSource: string = "remote";

      // (a) por boletim_id
      const byBoletim = await listRemoteOrCache<any>({
        name: "properties",
        remote: () =>
          supabase
            .from("properties")
            .select("id, street_name, side, number, sequence, complement, type, inhabitants, latitude, longitude, geocoded_at, had_previous_focus, status, boletim_id, block_id, block_number")
            .eq("boletim_id", b!.id)
            .order("sequence", { ascending: true }) as any,
        filter: (p) => p.boletim_id === b!.id,
      });
      viewerSource = (byBoletim as any)?.source || "remote";
      if (byBoletim && byBoletim.length) {
        propsRaw = byBoletim as any[];
        usedRel = "boletim_id";
      }

      // (b) fallback por block_id (Dexie + remoto)
      if (!propsRaw.length && b.block_id) {
        const byBlockId = await listRemoteOrCache<any>({
          name: "properties",
          remote: () =>
            supabase
              .from("properties")
              .select("id, street_name, side, number, sequence, complement, type, inhabitants, latitude, longitude, geocoded_at, had_previous_focus, status, boletim_id, block_id, block_number")
              .eq("block_id", b!.block_id as string)
              .order("sequence", { ascending: true }) as any,
          filter: (p) => p.block_id === b!.block_id,
        });
        if (byBlockId && byBlockId.length) {
          propsRaw = byBlockId as any[];
          usedRel = "block_id";
          viewerSource = (byBlockId as any)?.source || viewerSource;
        }
        console.log("[RG_VIEWER_BLOCK_FILTER]", { block_id: b.block_id, count: byBlockId?.length || 0 });
      }

      // (c) fallback por block_number (cache local; resolve também o block_id pelo número)
      if (!propsRaw.length && b.block_number) {
        const byNumber = await listRemoteOrCache<any>({
          name: "properties",
          remote: () => Promise.resolve({ data: [] as any[], error: null }) as any,
          filter: (p) => String(p.block_number) === String(b!.block_number),
        });
        if (byNumber && byNumber.length) {
          propsRaw = byNumber as any[];
          usedRel = "block_number";
          viewerSource = (byNumber as any)?.source || "cache";
        }
      }

      console.log("[RG_VIEWER_PROPERTIES]", { boletim_id: b.id, relationship: usedRel, count: propsRaw.length, source: viewerSource });

      const props: Property[] = [...((propsRaw || []) as Property[])].sort(comparePropertyNumber);
      console.log("[RG_VIEWER_RESULT]", { boletim_id: b.id, count: props.length, relationship: usedRel, source: viewerSource, online });
      if (!props.length) {
        console.log("[RG_VIEWER_EMPTY]", { boletim_id: b.id, block_id: b.block_id, block_number: b.block_number, online });
        console.log("[RG_VIEWER_EMPTY_FILTER]", lookupFilters);
      }
      setImoveis(props);
    } catch (e: any) {
      console.error("[BRG] erro ao carregar:", e);
      setLoadError({ kind: "generic", message: e?.message || "Erro desconhecido ao carregar boletim." });
    } finally {
      setLoading(false);
    }
  }


  const imoveisFiltrados = useMemo(() => {
    if (geoFilter === "all") return imoveis;
    if (geoFilter === "geo") return imoveis.filter((p) => p.latitude != null && p.longitude != null);
    return imoveis.filter((p) => p.latitude == null || p.longitude == null);
  }, [imoveis, geoFilter]);

  const totalFolhas = Math.max(1, Math.ceil(imoveisFiltrados.length / LINHAS_POR_FOLHA));
  const folhas = useMemo(() => {
    const out: Property[][] = [];
    for (let i = 0; i < totalFolhas; i++) {
      out.push(imoveisFiltrados.slice(i * LINHAS_POR_FOLHA, (i + 1) * LINHAS_POR_FOLHA));
    }
    return out;
  }, [imoveisFiltrados, totalFolhas]);

  function handleGeorefUpdate(propertyId: string, lat: number, lng: number) {
    setImoveis((prev) =>
      prev.map((p) =>
        p.id === propertyId
          ? { ...p, latitude: lat, longitude: lng, geocoded_at: new Date().toISOString() }
          : p,
      ),
    );
  }

  const counts = useMemo(() => {
    const c = { R: 0, C: 0, TB: 0, PE: 0, O: 0 };
    imoveis.forEach((p) => { c[tipoCodigo(p.type)]++; });
    return c;
  }, [imoveis]);

  const totalImoveis = imoveis.length;
  const totalHabitantes = imoveis.reduce((acc, p) => acc + (p.inhabitants || 0), 0);

  const gpsStats = useMemo(() => {
    const total = imoveis.length;
    const geo = imoveis.filter((p) => p.latitude != null && p.longitude != null).length;
    const pendentes = total - geo;
    const cobertura = total > 0 ? (geo / total) * 100 : 0;
    return { total, geo, pendentes, cobertura };
  }, [imoveis]);

  async function gerarPDF() {
    if (!boletim) return;
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();

      folhas.forEach((folha, idx) => {
        if (idx > 0) doc.addPage();
        const isLast = idx === folhas.length - 1;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text("MINISTÉRIO DA SAÚDE - FUNASA", pageWidth / 2, 12, { align: "center" });
        doc.setFontSize(10);
        doc.text("BOLETIM DE RECONHECIMENTO GEOGRÁFICO (BRG)", pageWidth / 2, 17, { align: "center" });

        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        const h1y = 24;
        const labels1 = [
          ["UF", boletim.uf || ""],
          ["Município", boletim.municipality || ""],
          ["Localidade", boletim.locality || ""],
          ["Sublocal", boletim.sublocality || ""],
        ];
        const labels2 = [
          ["Distrito", boletim.district || ""],
          ["Subdistrito", boletim.subdistrict || ""],
          ["Categoria 1", boletim.category_1 || ""],
          ["Categoria 2", boletim.category_2 || ""],
        ];
        const labels3 = [
          ["Quarteirão", boletim.block_number || ""],
          ["Sequência", boletim.sequence || ""],
          ["Lado", boletim.side || ""],
          ["Folha", `${idx + 1}/${folhas.length}`],
        ];
        const drawRow = (y: number, items: string[][]) => {
          const colW = (pageWidth - 20) / items.length;
          items.forEach(([lbl, val], i) => {
            const x = 10 + i * colW;
            doc.rect(x, y, colW, 8);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(6.5);
            doc.text(lbl.toUpperCase(), x + 1.5, y + 3);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(9);
            doc.text(String(val), x + 1.5, y + 7);
          });
        };
        drawRow(h1y, labels1);
        drawRow(h1y + 8, labels2);
        drawRow(h1y + 16, labels3);

        const ry = h1y + 26;
        const resp = [
          ["Inspetor Geral", boletim.inspector_general || ""],
          ["Inspetor", boletim.inspector || ""],
          ["Chefe de Equipe", boletim.team_lead || ""],
          ["Agente", boletim.agent_name || ""],
        ];
        drawRow(ry, resp);

        const tableY = ry + 12;
        const body = folha.map((p) => [
          p.street_name || "",
          p.side || "",
          p.number || "",
          p.sequence != null ? String(p.sequence) : "",
          p.complement || "",
          tipoCodigo(p.type),
          String(p.inhabitants ?? 0),
        ]);

        autoTable(doc, {
          startY: tableY,
          head: [["Rua ou Logradouro", "Lado", "Número", "SEQ", "Comp.", "Tipo", "Hab."]],
          body,
          theme: "grid",
          styles: { fontSize: 8, cellPadding: 1.5, lineColor: [0, 0, 0], lineWidth: 0.1 },
          headStyles: { fillColor: [230, 230, 230], textColor: [0, 0, 0], fontStyle: "bold" },
          columnStyles: {
            0: { cellWidth: 60 },
            1: { cellWidth: 14, halign: "center" },
            2: { cellWidth: 22, halign: "center" },
            3: { cellWidth: 14, halign: "center" },
            4: { cellWidth: 28, halign: "center" },
            5: { cellWidth: 16, halign: "center" },
            6: { cellWidth: 16, halign: "center" },
          },
          margin: { left: 10, right: 10 },
        });

        if (isLast) {
          const finalY = (doc as any).lastAutoTable.finalY + 4;
          autoTable(doc, {
            startY: finalY,
            head: [["R", "C", "TB", "PE", "O", "Total Geral", "Habitantes"]],
            body: [[
              String(counts.R),
              String(counts.C),
              String(counts.TB),
              String(counts.PE),
              String(counts.O),
              String(totalImoveis),
              String(totalHabitantes),
            ]],
            theme: "grid",
            styles: { fontSize: 9, halign: "center", lineColor: [0, 0, 0], lineWidth: 0.1 },
            headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold" },
            margin: { left: 10, right: 10 },
          });

          autoTable(doc, {
            startY: (doc as any).lastAutoTable.finalY + 2,
            head: [["Imóveis", "Georreferenciados", "Pendentes", "Cobertura GPS"]],
            body: [[
              String(gpsStats.total),
              String(gpsStats.geo),
              String(gpsStats.pendentes),
              `${gpsStats.cobertura.toFixed(2)}%`,
            ]],
            theme: "grid",
            styles: { fontSize: 9, halign: "center", lineColor: [0, 0, 0], lineWidth: 0.1 },
            headStyles: { fillColor: [220, 240, 230], textColor: [0, 0, 0], fontStyle: "bold" },
            margin: { left: 10, right: 10 },
          });

          const sigY = (doc as any).lastAutoTable.finalY + 14;
          doc.setFontSize(8);
          doc.setFont("helvetica", "normal");
          doc.line(15, sigY, 95, sigY);
          doc.text("Assinatura do Agente", 55, sigY + 4, { align: "center" });
          doc.line(110, sigY, 195, sigY);
          doc.text("Assinatura do Supervisor", 152, sigY + 4, { align: "center" });

          doc.setFontSize(7);
          doc.text(
            `Nº Agente: ${boletim.agent_registration || "—"}    Data: ${format(new Date(), "dd/MM/yyyy")}`,
            15, sigY + 12,
          );
          doc.text("FA-D-05", pageWidth - 15, sigY + 12, { align: "right" });
        }
      });

      const dataStr = format(new Date(), "yyyy-MM-dd");
      doc.save(`BRG_Q${boletim.block_number || "SN"}_${dataStr}.pdf`);
    } catch (e: any) {
      toast.error("Erro ao gerar PDF: " + e.message);
    }
  }

  function exportCSV() {
    if (!boletim || imoveis.length === 0) {
      toast.info("Nenhum imóvel para exportar.");
      return;
    }
    const headers = ["Rua", "Lado", "Número", "SEQ", "Complemento", "Tipo", "Habitantes", "Latitude", "Longitude"];
    const lines = imoveis.map((p) =>
      [
        p.street_name || "",
        p.side || "",
        p.number || "",
        p.sequence ?? "",
        (p.complement || "").replace(/[,;\n]/g, " "),
        tipoCodigo(p.type),
        p.inhabitants ?? 0,
        p.latitude ?? "",
        p.longitude ?? "",
      ].join(",")
    );
    const csv = [headers.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `BRG_Q${boletim.block_number || "SN"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function scrollToTable() {
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError || !boletim) {
    const kind = loadError?.kind ?? "not_found";
    const title =
      kind === "forbidden"
        ? "Você não possui acesso a este boletim."
        : kind === "not_found"
          ? "Boletim não encontrado."
          : "Não foi possível carregar o boletim.";
    const detail = loadError?.message && kind === "generic" ? loadError.message : null;
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-6 text-center">
        <p className="font-bold text-foreground text-lg">{title}</p>
        {detail && <p className="text-sm text-muted-foreground max-w-md">{detail}</p>}
        <p className="text-xs text-muted-foreground">ID: {id}</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => load()}>Tentar novamente</Button>
          <Button onClick={() => navigate({ to: "/rg" })}>Voltar para RG</Button>
        </div>
      </div>
    );
  }

  console.log("[RG_VIEWER_INPUT]", boletim);
  console.log("[RG_VIEWER_BLOCK]", viewerBlock);
  console.log("[RG_VIEWER_PROPERTIES]", imoveis);
  console.log("[RG_VIEWER_INPUT_KEYS]", Object.keys(boletim ?? {}));
  console.log("[RG_VIEWER_BLOCK_KEYS]", Object.keys(viewerBlock ?? {}));
  console.log("[RG_VIEWER_PROPERTIES_KEYS]", Object.keys(imoveis[0] ?? {}));
  if (imoveis.length === 0) console.log("[RG_VIEWER_EMPTY_FILTER_RENDER]", viewerFilters);

  return (
    <div className="min-h-screen bg-muted/40 brg-screen">
      <style>{`
        /* Documento e tabela */
        .brg-page {
          width: 210mm;
          min-height: 297mm;
          padding: 12mm;
          background: white;
          box-shadow: 0 4px 20px rgba(0,0,0,.08);
          margin: 12px auto;
        }
        .brg-cell { border: 1px solid #000; padding: 2px 4px; font-size: 10px; }
        .brg-label { font-size: 7px; font-weight: 700; text-transform: uppercase; color: #333; letter-spacing: .04em; }
        .brg-value { font-size: 11px; font-weight: 600; min-height: 14px; }
        .brg-table { width: 100%; border-collapse: collapse; }
        .brg-table th, .brg-table td { border: 1px solid #000; padding: 3px 4px; font-size: 10px; }
        .brg-table th {
          background: #eee;
          font-weight: 700;
          text-align: center;
          position: sticky;
          top: 0;
          z-index: 1;
        }

        /* Wrapper de scroll horizontal aplicado SOMENTE à tabela */
        .brg-table-scroll {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }

        /* Zoom auto do documento (somente em tela). Impressão é resetada abaixo. */
        .brg-scale-wrap {
          transform: scale(var(--brg-scale, 1));
          transform-origin: top center;
          width: 100%;
        }

        @media print {
          body { background: white !important; }
          .brg-no-print { display: none !important; }
          .brg-page { box-shadow: none !important; margin: 0 !important; page-break-after: always; }
          .brg-page:last-child { page-break-after: auto; }
          .brg-scale-wrap { transform: none !important; }
          aside, nav, header[data-app-header], .sidebar, [data-bottom-nav] { display: none !important; }
          .brg-table th { position: static !important; }
        }
      `}</style>

      {/* Cabeçalho mobile-first */}
      <div className="brg-no-print sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border">
        <div className="mx-auto flex h-12 w-full max-w-7xl items-center gap-2 px-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            aria-label="Voltar"
            onClick={() => navigate({ to: "/rg" })}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-tight">
            BRG · FA-D-05 · Quarteirão {(boletim as any).block_number ?? (boletim as any).quarteirao ?? "-"}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 px-2.5 text-xs"
            onClick={() => setMapOpen(true)}
            aria-label="Ver mapa do quarteirão"
          >
            <MapIcon className="h-4 w-4" />
            <span className="hidden xs:inline sm:inline">Mapa</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 px-2.5 text-xs"
            onClick={() => window.print()}
            aria-label="Imprimir"
          >
            <Printer className="h-4 w-4" />
            <span className="hidden sm:inline">Imprimir</span>
          </Button>
          <Button
            size="sm"
            className="h-9 gap-1.5 px-2.5 text-xs"
            onClick={gerarPDF}
            aria-label="Baixar PDF"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">PDF</span>
          </Button>
        </div>
      </div>

      {/* KPIs compactos — máx ~90px */}
      <div className="brg-no-print mx-auto w-full max-w-7xl px-2 pt-2 sm:px-4">
        <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
          <KpiMini icon={<Home className="h-4 w-4" />} value={gpsStats.total} label="Imóveis" tone="default" />
          <KpiMini icon={<MapPin className="h-4 w-4" />} value={gpsStats.geo} label="Georref." tone="success" />
          <KpiMini
            icon={<AlertTriangle className="h-4 w-4" />}
            value={gpsStats.pendentes}
            label="Pendentes"
            tone={gpsStats.pendentes > 0 ? "warning" : "muted"}
          />
          <KpiMini
            icon={<Target className="h-4 w-4" />}
            value={`${gpsStats.cobertura.toFixed(gpsStats.cobertura % 1 === 0 ? 0 : 2)}%`}
            label="Cobertura GPS"
            tone="info"
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex rounded-lg border border-border bg-background p-0.5 text-xs">
            {(
              [
                { key: "all", label: `Todos (${gpsStats.total})` },
                { key: "geo", label: `🟢 Georref. (${gpsStats.geo})` },
                { key: "pending", label: `🔴 Pendentes (${gpsStats.pendentes})` },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setGeoFilter(opt.key)}
                className={
                  "rounded-md px-2.5 py-1 font-semibold transition " +
                  (geoFilter === opt.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted")
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-xs text-muted-foreground"
            onClick={exportCSV}
          >
            <Download className="h-3.5 w-3.5" /> Exportar CSV
          </Button>
        </div>
      </div>


      <BlockMapDialog
        open={mapOpen}
        onOpenChange={setMapOpen}
        blockNumber={boletim.block_number}
        properties={imoveis.map((p) => ({
          id: p.id,
          number: p.number,
          street_name: p.street_name,
          type: p.type,
          latitude: p.latitude,
          longitude: p.longitude,
          had_previous_focus: p.had_previous_focus,
          status: p.status,
        }))}
      />

      {/* Documento com auto-scale */}
      <div
        className="brg-scale-wrap"
        style={{ ["--brg-scale" as any]: String(scale) }}
      >
        {folhas.map((folha, idx) => {
          const isLast = idx === folhas.length - 1;
          return (
            <section
              key={idx}
              className="brg-page"
              ref={idx === 0 ? tableRef : undefined}
            >
              <div className="text-center mb-3">
                <div className="text-[10px] font-bold uppercase tracking-widest">Ministério da Saúde — FUNASA</div>
                <div className="text-sm font-black uppercase tracking-tight mt-0.5">
                  Boletim de Reconhecimento Geográfico (BRG)
                </div>
              </div>

              <HeaderRow items={[
                ["UF", boletim.uf],
                ["Município", boletim.municipality],
                ["Localidade", boletim.locality],
                ["Sublocal", boletim.sublocality],
              ]} />
              <HeaderRow items={[
                ["Distrito", boletim.district],
                ["Subdistrito", boletim.subdistrict],
                ["Categoria 1", boletim.category_1],
                ["Categoria 2", boletim.category_2],
              ]} />
              <HeaderRow items={[
                ["Quarteirão", boletim.block_number],
                ["Sequência", boletim.sequence],
                ["Lado", boletim.side],
                ["Folha", `${idx + 1}/${folhas.length}`],
              ]} />

              <div className="h-2" />

              <HeaderRow items={[
                ["Inspetor Geral", boletim.inspector_general],
                ["Inspetor", boletim.inspector],
                ["Chefe de Equipe", boletim.team_lead],
                ["Agente", boletim.agent_name],
              ]} />

              <div className="h-2" />

              <div className="brg-table-scroll">
                <table className="brg-table">
                  <thead>
                    <tr>
                      <th style={{ width: "34%" }}>Rua ou Logradouro</th>
                      <th style={{ width: "6%" }}>Lado</th>
                      <th style={{ width: "10%" }}>Número</th>
                      <th style={{ width: "6%" }}>SEQ</th>
                      <th style={{ width: "12%" }}>Comp.</th>
                      <th style={{ width: "8%" }}>Tipo</th>
                      <th style={{ width: "8%" }}>Hab.</th>
                      <th className="brg-no-print" style={{ width: "16%" }}>GPS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {folha.length === 0 ? (
                      <tr><td colSpan={8} className="text-center text-slate-400 py-6">Nenhum imóvel.</td></tr>
                    ) : folha.map((p) => {
                      const hasCoords = p.latitude != null && p.longitude != null;
                      return (
                        <tr key={p.id}>
                          <td>{p.street_name || ""}</td>
                          <td className="text-center">{p.side || ""}</td>
                          <td className="text-center font-bold">{p.number}</td>
                          <td className="text-center">{p.sequence ?? ""}</td>
                          <td className="text-center">{p.complement || ""}</td>
                          <td className="text-center font-bold">{tipoCodigo(p.type)}</td>
                          <td className="text-center">{p.inhabitants ?? 0}</td>
                          <td className="brg-no-print text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <span
                                title={hasCoords ? "Georreferenciado" : "Pendente"}
                                className={"inline-block h-2 w-2 rounded-full " + (hasCoords ? "bg-emerald-500" : "bg-rose-500")}
                              />
                              <GeorefButton
                                propertyId={p.id}
                                actorId={currentUserId}
                                hasCoords={hasCoords}
                                onDone={(lat, lng) => handleGeorefUpdate(p.id, lat, lng)}
                                label={hasCoords ? "Atualizar" : "Georref."}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>


              {isLast && (
                <>
                  <div className="h-3" />
                  <div className="brg-table-scroll">
                    <table className="brg-table">
                      <thead>
                        <tr>
                          <th>R</th><th>C</th><th>TB</th><th>PE</th><th>O</th>
                          <th>Total Geral</th><th>Habitantes</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="text-center font-bold">
                          <td>{counts.R}</td>
                          <td>{counts.C}</td>
                          <td>{counts.TB}</td>
                          <td>{counts.PE}</td>
                          <td>{counts.O}</td>
                          <td>{totalImoveis}</td>
                          <td>{totalHabitantes}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="grid grid-cols-2 gap-8 mt-10">
                    <div className="text-center">
                      <div className="border-t border-black pt-1 text-[10px] font-bold uppercase">Assinatura do Agente</div>
                    </div>
                    <div className="text-center">
                      <div className="border-t border-black pt-1 text-[10px] font-bold uppercase">Assinatura do Supervisor</div>
                    </div>
                  </div>

                  <div className="flex items-end justify-between mt-6 text-[10px] font-semibold text-slate-700">
                    <div>
                      Nº Agente: <span className="font-bold">{boletim.agent_registration || "—"}</span>
                      <span className="mx-3">·</span>
                      Data: <span className="font-bold">{format(new Date(), "dd/MM/yyyy")}</span>
                    </div>
                    <div className="font-black tracking-widest">FA-D-05</div>
                  </div>
                </>
              )}
            </section>
          );
        })}
      </div>

      {/* FAB: ir para a tabela */}
      <button
        type="button"
        onClick={scrollToTable}
        aria-label="Ir para a tabela"
        className="brg-no-print fixed bottom-20 right-4 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition active:scale-95 sm:bottom-6"
      >
        <ArrowDown className="h-5 w-5" />
      </button>
    </div>
  );
}

function HeaderRow({ items }: { items: [string, string | null | undefined][] }) {
  return (
    <div className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
      {items.map(([label, value], i) => (
        <div key={i} className="brg-cell" style={{ marginLeft: i === 0 ? 0 : -1, marginTop: -1 }}>
          <div className="brg-label">{label}</div>
          <div className="brg-value">{value || "—"}</div>
        </div>
      ))}
    </div>
  );
}

type KpiTone = "default" | "success" | "warning" | "info" | "muted";

function KpiMini({
  icon,
  value,
  label,
  tone = "default",
}: {
  icon: React.ReactNode;
  value: number | string;
  label: string;
  tone?: KpiTone;
}) {
  const tones: Record<KpiTone, { icon: string; value: string; ring: string }> = {
    default: { icon: "bg-muted text-foreground", value: "text-foreground", ring: "border-border" },
    success: { icon: "bg-emerald-100 text-emerald-700", value: "text-emerald-700", ring: "border-emerald-100" },
    warning: { icon: "bg-amber-100 text-amber-700", value: "text-amber-700", ring: "border-amber-100" },
    info:    { icon: "bg-blue-100 text-blue-700",   value: "text-blue-700",   ring: "border-blue-100" },
    muted:   { icon: "bg-muted text-muted-foreground", value: "text-muted-foreground", ring: "border-border" },
  };
  const s = tones[tone];
  return (
    <div
      className={`flex h-[78px] flex-col items-center justify-center gap-0.5 rounded-xl border bg-card px-1 py-1.5 shadow-xs ${s.ring}`}
    >
      <div className={`grid h-6 w-6 place-items-center rounded-md ${s.icon}`}>{icon}</div>
      <div className={`text-base font-bold leading-none tabular-nums ${s.value}`}>{value}</div>
      <div className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground truncate max-w-full">{label}</div>
    </div>
  );
}
