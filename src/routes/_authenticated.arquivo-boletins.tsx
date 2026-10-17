import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Archive, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useOperationalDate } from "@/hooks/useOperationalDate";
import { getOperationalDate } from "@/lib/operational-date";
import { supabase } from "@/integrations/supabase/client";
import { readAllQueryPages } from "@/lib/query-pages";
import { buildZip, type ZipEntry } from "@/lib/zip";
import {
  downloadSignedBulletin,
  verifySignedBulletinHash,
  type SignedBulletinRow,
} from "@/lib/bulletin-archive";

export const Route = createFileRoute("/_authenticated/arquivo-boletins")({
  component: BulletinArchivePage,
});

type CycleOption = { id: string; name: string; number: number | null; year: number | null };
type ArchiveRow = SignedBulletinRow;

function BulletinArchivePage() {
  const { userRole } = useOperationalDate();
  const [rows, setRows] = useState<ArchiveRow[]>([]);
  const [cycles, setCycles] = useState<CycleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"month" | "cycle">("month");
  const [month, setMonth] = useState(() => getOperationalDate().slice(0, 7));
  const [cycleId, setCycleId] = useState("");
  const [agentId, setAgentId] = useState("all");
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState("");

  const isAgent = userRole === "agente" || userRole === "agent";

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const archiveQuery = supabase
          .from("signed_bulletin_archive")
          .select("*")
          .eq("status", "ready")
          .order("period_start", { ascending: false });
        const cycleQuery = supabase
          .from("cycles")
          .select("id,name,number,year")
          .order("start_date", { ascending: false });
        const [archiveRows, cycleResult] = await Promise.all([
          readAllQueryPages<ArchiveRow>(archiveQuery),
          cycleQuery,
        ]);
        if (cycleResult.error) console.warn("[BULLETIN_ARCHIVE_CYCLES]", cycleResult.error);
        if (!cancelled) {
          setRows(archiveRows);
          setCycles((cycleResult.data ?? []) as CycleOption[]);
          setCycleId(
            (current) => current || archiveRows.find((row) => row.cycle_id)?.cycle_id || "",
          );
        }
      } catch (error: unknown) {
        if (!cancelled)
          toast.error(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar o arquivo de boletins.",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const cycleById = useMemo(() => new Map(cycles.map((cycle) => [cycle.id, cycle])), [cycles]);
  const agents = useMemo(() => {
    const unique = new Map<string, string>();
    for (const row of rows) unique.set(row.agent_profile_id, row.agent_name_snapshot);
    return [...unique.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [rows]);

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        const matchesPeriod =
          mode === "month"
            ? row.period_start.slice(0, 7) === month
            : Boolean(cycleId) && row.cycle_id === cycleId;
        const matchesAgent = isAgent || agentId === "all" || row.agent_profile_id === agentId;
        return matchesPeriod && matchesAgent;
      }),
    [rows, mode, month, cycleId, isAgent, agentId],
  );

  async function fetchPdf(row: ArchiveRow) {
    const { data, error } = await supabase.storage
      .from("signed-bulletins")
      .download(row.storage_path);
    if (error || !data) throw error || new Error("PDF não encontrado no arquivo.");
    await verifySignedBulletinHash(data, row.document_sha256);
    return data;
  }

  async function downloadOne(row: ArchiveRow) {
    try {
      const blob = await fetchPdf(row);
      downloadSignedBulletin(blob, row.file_name);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Não foi possível baixar o boletim.");
    }
  }

  async function downloadPeriod() {
    if (filteredRows.length === 0 || downloading) return;
    setDownloading(true);
    setProgress("");
    try {
      const entries: ZipEntry[] = [];
      for (let index = 0; index < filteredRows.length; index += 1) {
        const row = filteredRows[index];
        setProgress(`Baixando ${index + 1} de ${filteredRows.length}…`);
        const blob = await fetchPdf(row);
        const folder = safeFileName(row.agent_name_snapshot || "Agente");
        const file = `${row.period_start}_${row.report_type === "daily" ? "diario" : "semanal"}_${row.id.slice(0, 8)}_${safeFileName(row.file_name)}`;
        entries.push({ name: `${folder}/${file}`, data: new Uint8Array(await blob.arrayBuffer()) });
      }
      const zip = buildZip(entries);
      const scopeLabel =
        mode === "month"
          ? month
          : safeFileName(cycleById.get(cycleId)?.name || `ciclo-${cycleId.slice(0, 8)}`);
      downloadSignedBulletin(
        zip,
        `Boletins_${mode === "month" ? "Mensal" : "Ciclo"}_${scopeLabel}.zip`,
      );
      toast.success(`${entries.length} boletim(ns) incluído(s) no ZIP.`);
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível preparar o pacote do período.",
      );
    } finally {
      setDownloading(false);
      setProgress("");
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 pb-24">
      <header className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-900 text-white">
          <Archive className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-tight">Arquivo de Boletins</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            PDFs assinados, organizados por período e agente. O acesso à equipe e ao município é
            validado no banco de dados.
          </p>
        </div>
      </header>

      <Card className="space-y-4 rounded-2xl p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-xs font-semibold">
            Agrupar por
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={mode}
              onChange={(event) => setMode(event.target.value as "month" | "cycle")}
            >
              <option value="month">Mês</option>
              <option value="cycle">Ciclo</option>
            </select>
          </label>
          {mode === "month" ? (
            <label className="space-y-1 text-xs font-semibold">
              Mês
              <Input
                type="month"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
              />
            </label>
          ) : (
            <label className="space-y-1 text-xs font-semibold">
              Ciclo
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={cycleId}
                onChange={(event) => setCycleId(event.target.value)}
              >
                <option value="">Selecione um ciclo</option>
                {Array.from(
                  new Set(rows.map((row) => row.cycle_id).filter(Boolean) as string[]),
                ).map((id) => {
                  const cycle = cycleById.get(id);
                  return (
                    <option key={id} value={id}>
                      {cycle?.name || `Ciclo ${cycle?.number ?? id.slice(0, 8)}`}{" "}
                      {cycle?.year ? `/${cycle.year}` : ""}
                    </option>
                  );
                })}
              </select>
            </label>
          )}
          {!isAgent && (
            <label className="space-y-1 text-xs font-semibold">
              Agente
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={agentId}
                onChange={(event) => setAgentId(event.target.value)}
              >
                <option value="all">Todos os agentes do meu escopo</option>
                {agents.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex items-end">
            <Button
              className="h-10 w-full"
              disabled={!filteredRows.length || downloading}
              onClick={downloadPeriod}
            >
              {downloading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {downloading ? progress || "Preparando ZIP…" : `Baixar ${filteredRows.length} em ZIP`}
            </Button>
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-between gap-3 text-sm">
        <p className="font-semibold">{filteredRows.length} boletim(ns) neste recorte</p>
        {mode === "cycle" && cycleId && (
          <p className="text-muted-foreground">
            {cycleById.get(cycleId)?.name || "Ciclo selecionado"}
          </p>
        )}
      </div>

      {loading ? (
        <Card className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando arquivo…
        </Card>
      ) : filteredRows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nenhum boletim assinado neste recorte. Assinaturas ficam disponíveis na área de Relatórios
          do agente.
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredRows.map((row) => (
            <Card
              key={row.id}
              className="flex flex-col justify-between gap-3 rounded-xl p-4 sm:flex-row sm:items-center"
            >
              <div className="min-w-0">
                <p className="truncate font-bold">
                  {row.agent_name_snapshot}{" "}
                  <span className="font-normal text-muted-foreground">
                    · {row.report_type === "daily" ? "Diário" : "Semanal"}
                  </span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {row.period_start === row.period_end
                    ? row.period_start
                    : `${row.period_start} a ${row.period_end}`}{" "}
                  ·{" "}
                  {row.epi_week
                    ? `SE ${String(row.epi_week).padStart(2, "0")}/${row.epi_year}`
                    : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  Assinado em{" "}
                  {new Intl.DateTimeFormat("pt-BR", {
                    dateStyle: "short",
                    timeStyle: "short",
                    timeZone: "America/Sao_Paulo",
                  }).format(new Date(row.signed_at))}{" "}
                  · SHA-256 {row.document_sha256.slice(0, 16)}…
                </p>
              </div>
              <Button variant="outline" onClick={() => void downloadOne(row)}>
                <Download className="mr-2 h-4 w-4" />
                Baixar PDF
              </Button>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}

function safeFileName(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "arquivo"
  );
}
