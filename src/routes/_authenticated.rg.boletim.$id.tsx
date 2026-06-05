import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Printer, Download, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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

function BoletimView() {
  const { id } = useParams({ from: "/_authenticated/rg/boletim/$id" });
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [boletim, setBoletim] = useState<Boletim | null>(null);
  const [imoveis, setImoveis] = useState<Property[]>([]);
  const [loadError, setLoadError] = useState<{ kind: "not_found" | "forbidden" | "generic"; message: string } | null>(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function load() {
    console.log("[BRG] ID recebido:", id);
    setLoading(true);
    setLoadError(null);
    try {
      // The :id can be either a boletim_id or a block_id.
      // Try boletim first; if not found, treat as block_id and find-or-create.
      let b: Boletim | null = null;

      const { data: byBoletim, error: byBoletimErr } = await supabase
        .from("boletins_rg")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      console.log("[BRG] boletins_rg by id:", { data: byBoletim, error: byBoletimErr });

      if (byBoletimErr) {
        const msg = byBoletimErr.message || "";
        if (/permission|denied|policy|rls/i.test(msg)) {
          setLoadError({ kind: "forbidden", message: "Você não possui acesso a este boletim." });
          return;
        }
        throw byBoletimErr;
      }

      if (byBoletim) {
        b = byBoletim as Boletim;
      } else {
        // treat as block_id
        const { data: byBlock, error: byBlockErr } = await supabase
          .from("boletins_rg")
          .select("*")
          .eq("block_id", id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        console.log("[BRG] boletins_rg by block_id:", { data: byBlock, error: byBlockErr });

        if (byBlock) {
          b = byBlock as Boletim;
        } else {
          // create on the fly using context from block + agent
          const { data: { user } } = await supabase.auth.getUser();
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
          console.log("[BRG] create boletim:", { data: created, error: createErr });
          if (createErr) {
            if (/permission|denied|policy|rls/i.test(createErr.message)) {
              setLoadError({ kind: "forbidden", message: "Você não possui acesso para criar este boletim." });
              return;
            }
            throw createErr;
          }
          b = created as Boletim;
        }
      }

      if (!b) {
        setLoadError({ kind: "not_found", message: "Boletim não encontrado." });
        return;
      }
      setBoletim(b);

      // Load properties strictly linked to this boletim (no block_id fallback,
      // to evitar mostrar imóveis de outros boletins ou registros órfãos).
      const { data: byBoletimLink } = await supabase
        .from("properties")
        .select("id, street_name, side, number, sequence, complement, type, inhabitants")
        .eq("boletim_id", b.id)
        .order("sequence", { ascending: true });

      const props: Property[] = (byBoletimLink || []) as Property[];

      console.log("[BRG] imóveis carregados:", props.length);
      setImoveis(props);
    } catch (e: any) {
      console.error("[BRG] erro ao carregar:", e);
      setLoadError({ kind: "generic", message: e?.message || "Erro desconhecido ao carregar boletim." });
    } finally {
      setLoading(false);
    }
  }

  const totalFolhas = Math.max(1, Math.ceil(imoveis.length / LINHAS_POR_FOLHA));
  const folhas = useMemo(() => {
    const out: Property[][] = [];
    for (let i = 0; i < totalFolhas; i++) {
      out.push(imoveis.slice(i * LINHAS_POR_FOLHA, (i + 1) * LINHAS_POR_FOLHA));
    }
    return out;
  }, [imoveis, totalFolhas]);

  const counts = useMemo(() => {
    const c = { R: 0, C: 0, TB: 0, PE: 0, O: 0 };
    imoveis.forEach((p) => { c[tipoCodigo(p.type)]++; });
    return c;
  }, [imoveis]);

  const totalImoveis = imoveis.length;
  const totalHabitantes = imoveis.reduce((acc, p) => acc + (p.inhabitants || 0), 0);

  async function gerarPDF() {
    if (!boletim) return;
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();

      folhas.forEach((folha, idx) => {
        if (idx > 0) doc.addPage();
        const isLast = idx === folhas.length - 1;

        // Header
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

        // Responsáveis
        const ry = h1y + 26;
        const resp = [
          ["Inspetor Geral", boletim.inspector_general || ""],
          ["Inspetor", boletim.inspector || ""],
          ["Chefe de Equipe", boletim.team_lead || ""],
          ["Agente", boletim.agent_name || ""],
        ];
        drawRow(ry, resp);

        // Tabela
        const tableY = ry + 12;
        const body = folha.map((p, i) => [
          p.street_name || "",
          p.side || "",
          p.number || "",
          String(p.sequence ?? idx * LINHAS_POR_FOLHA + i + 1),
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
          // Fechamento (totais por tipo)
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
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
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-6 text-center">
        <p className="font-bold text-slate-700 text-lg">{title}</p>
        {detail && <p className="text-sm text-slate-500 max-w-md">{detail}</p>}
        <p className="text-xs text-slate-400">ID: {id}</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => load()}>Tentar novamente</Button>
          <Button onClick={() => navigate({ to: "/rg" })}>Voltar para RG</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-200 brg-screen">
      {/* Print styles + toolbar */}
      <style>{`
        @media print {
          body { background: white !important; }
          .brg-no-print { display: none !important; }
          .brg-page { box-shadow: none !important; margin: 0 !important; page-break-after: always; }
          .brg-page:last-child { page-break-after: auto; }
          aside, nav, header[data-app-header], .sidebar { display: none !important; }
        }
        .brg-page { width: 210mm; min-height: 297mm; padding: 12mm; margin: 12px auto; background: white; box-shadow: 0 4px 20px rgba(0,0,0,.08); }
        .brg-cell { border: 1px solid #000; padding: 2px 4px; font-size: 10px; }
        .brg-label { font-size: 7px; font-weight: 700; text-transform: uppercase; color: #333; letter-spacing: .04em; }
        .brg-value { font-size: 11px; font-weight: 600; min-height: 14px; }
        .brg-table th, .brg-table td { border: 1px solid #000; padding: 3px 4px; font-size: 10px; }
        .brg-table th { background: #eee; font-weight: 700; text-align: center; }
        @media (max-width: 900px) {
          .brg-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        }
      `}</style>

      <div className="brg-no-print sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-[230mm] mx-auto px-4 h-14 flex items-center justify-between">
          <div className="font-black text-xs uppercase tracking-widest text-slate-700">
            BRG · FA-D-05 · Quarteirão {boletim.block_number || "—"}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Imprimir
            </Button>
            <Button size="sm" className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={gerarPDF}>
              <Download className="h-4 w-4" /> Baixar PDF
            </Button>
            <Button variant="ghost" size="sm" className="gap-2" onClick={() => navigate({ to: "/rg" })}>
              <X className="h-4 w-4" /> Fechar
            </Button>
          </div>
        </div>
      </div>

      <div className="brg-scroll">
        {folhas.map((folha, idx) => {
          const isLast = idx === folhas.length - 1;
          return (
            <section key={idx} className="brg-page">
              {/* Cabeçalho oficial */}
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

              <table className="brg-table w-full border-collapse">
                <thead>
                  <tr>
                    <th style={{ width: "38%" }}>Rua ou Logradouro</th>
                    <th style={{ width: "8%" }}>Lado</th>
                    <th style={{ width: "12%" }}>Número</th>
                    <th style={{ width: "8%" }}>SEQ</th>
                    <th style={{ width: "14%" }}>Comp.</th>
                    <th style={{ width: "10%" }}>Tipo</th>
                    <th style={{ width: "10%" }}>Hab.</th>
                  </tr>
                </thead>
                <tbody>
                  {folha.length === 0 ? (
                    <tr><td colSpan={7} className="text-center text-slate-400 py-6">Nenhum imóvel.</td></tr>
                  ) : folha.map((p, i) => (
                    <tr key={p.id}>
                      <td>{p.street_name || ""}</td>
                      <td className="text-center">{p.side || ""}</td>
                      <td className="text-center font-bold">{p.number}</td>
                      <td className="text-center">{p.sequence ?? idx * LINHAS_POR_FOLHA + i + 1}</td>
                      <td className="text-center">{p.complement || ""}</td>
                      <td className="text-center font-bold">{tipoCodigo(p.type)}</td>
                      <td className="text-center">{p.inhabitants ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {isLast && (
                <>
                  <div className="h-3" />
                  <table className="brg-table w-full border-collapse">
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
