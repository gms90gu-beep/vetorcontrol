import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { safeFetch, isOnline } from "@/lib/offline/safe-fetch";
import {
  getReconcilePreview,
  executeReconcile,
  deleteOrphanBlocks,
} from "@/lib/rg-reconcile.functions";
import { runRgHomologation, type RgHomologationReport } from "@/lib/rg-homologation.functions";


export const Route = createFileRoute("/_authenticated/admin/rg-reconcile")({
  component: Page,
});

function Page() {
  const router = useRouter();
  const { role, isLoading } = useAuth();
  const fetchPreview = useServerFn(getReconcilePreview);
  const runExecute = useServerFn(executeReconcile);
  const runDeleteOrphans = useServerFn(deleteOrphanBlocks);
  const runHomolog = useServerFn(runRgHomologation);
  const [busy, setBusy] = useState(false);
  const [selectedOrphans, setSelectedOrphans] = useState<Set<string>>(new Set());
  const [homolog, setHomolog] = useState<RgHomologationReport | null>(null);
  const [integrity, setIntegrity] = useState<any | null>(null);

  async function onIntegrityCheck() {
    setBusy(true);
    try {
      const { data: chk, error } = await supabase.rpc("rg_integrity_check" as any);
      if (error) throw error;
      setIntegrity(chk);
      console.log("[RG_INTEGRITY_CHECK]", chk);
      const status = (chk as any)?.status;
      toast[status === "OK" ? "success" : "warning"](`Diagnóstico: ${status}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function onReconcileIdempotent() {
    if (!confirm("Executar reconciliação idempotente (segura para repetir)?")) return;
    setBusy(true);
    try {
      const { data: r, error } = await supabase.rpc("reconcile_rg_integrity" as any);
      if (error) throw error;
      console.log("[RG_RECONCILE_IDEMPOTENT]", r);
      const m = r as any;
      toast.success(`✓ ${m?.blocks_linked ?? 0} boletins · ${m?.properties_linked ?? 0} imóveis · ${m?.orphans_removed ?? 0} órfãos`);
      await refetch();
      await onIntegrityCheck();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }


  useEffect(() => {
    if (!isLoading && role !== "admin_master") router.navigate({ to: "/dashboard" });
  }, [role, isLoading, router]);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["rg-reconcile-preview"],
    queryFn: () => fetchPreview(),
    enabled: role === "admin_master",
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (data) console.log("[RG_RECONCILE_PREVIEW]", data);
  }, [data]);

  if (role !== "admin_master") return null;

  async function onExecute() {
    if (!confirm("Aplicar reconciliação? Boletins ganharão block_id e imóveis ganharão boletim_id quando houver match único.")) return;
    setBusy(true);
    try {
      const r = await runExecute();
      console.log("[RG_RECONCILE_DONE]", r);
      toast.success(`✓ ${r.blocksLinked} boletins · ${r.propertiesLinked} imóveis reconciliados`);
      await refetch();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteOrphans() {
    const ids = [...selectedOrphans];
    if (!ids.length) return;
    if (!confirm(`Excluir ${ids.length} bloco(s) órfão(s)?`)) return;
    setBusy(true);
    try {
      const r = await runDeleteOrphans({ data: { ids } });
      toast.success(`${r.deleted} blocos excluídos`);
      setSelectedOrphans(new Set());
      await refetch();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function onHomolog() {
    setBusy(true);
    try {
      const r = await runHomolog();
      setHomolog(r);
      console.log("[RG_RECONCILE_RESULT]", r);
      console.log("[RG_FINAL_COUNTS]", r.counts);
      for (const t of r.tests) {
        if (t.pass) console.log("[RG_VALIDATION_OK]", t.id, t.name, t.details);
        else console.warn("[RG_VALIDATION_ERROR]", t.id, t.name, t.details);
      }
      toast[r.approved ? "success" : "warning"](
        r.approved ? "Homologação aprovada ✓" : "Homologação com divergências",
      );
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  const rows = data?.rows ?? [];
  const orphans = data?.orphanBlocks ?? [];

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      missing_block_id: "bg-yellow-200 text-yellow-900",
      missing_properties_boletim: "bg-orange-200 text-orange-900",
      no_block_match: "bg-red-200 text-red-900",
      ambiguous_block_match: "bg-purple-200 text-purple-900",
    };
    return <span className={`px-2 py-0.5 rounded text-xs ${map[s] ?? ""}`}>{s}</span>;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Reconciliação RG × Blocks × Properties</h1>
          <p className="text-sm text-muted-foreground">
            Prévia somente leitura. Execução exige confirmação.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching || busy}>
            Atualizar prévia
          </Button>
          <Button variant="outline" onClick={onIntegrityCheck} disabled={busy}>
            Diagnóstico de Integridade
          </Button>
          <Button variant="secondary" onClick={onHomolog} disabled={busy}>
            Rodar Homologação
          </Button>
          <Button variant="secondary" onClick={onReconcileIdempotent} disabled={busy}>
            Reconciliar (idempotente)
          </Button>
          <Button onClick={onExecute} disabled={busy || rows.length === 0}>
            Executar reconciliação (legado)
          </Button>
        </div>
      </div>

      {integrity && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Diagnóstico de Integridade{" "}
              <Badge variant={integrity.status === "OK" ? "default" : "destructive"}>
                {integrity.status}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <Stat label="Boletins s/ block" value={integrity.boletins_sem_block?.length ?? 0} warn={(integrity.boletins_sem_block?.length ?? 0) > 0} />
              <Stat label="Imóveis s/ boletim" value={integrity.properties_sem_boletim?.length ?? 0} />
              <Stat label="Block divergente" value={integrity.properties_block_divergente?.length ?? 0} warn={(integrity.properties_block_divergente?.length ?? 0) > 0} />
              <Stat label="Blocks duplicados" value={integrity.blocks_duplicados?.length ?? 0} warn={(integrity.blocks_duplicados?.length ?? 0) > 0} />
              <Stat label="Div. card/detalhe" value={integrity.divergencia_card_detalhe?.length ?? 0} warn={(integrity.divergencia_card_detalhe?.length ?? 0) > 0} />
            </div>
            <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-72">{JSON.stringify(integrity, null, 2)}</pre>
          </CardContent>
        </Card>
      )}


      {homolog && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Homologação{" "}
              <Badge variant={homolog.approved ? "default" : "destructive"}>
                {homolog.approved ? "APROVADA" : "DIVERGÊNCIAS"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <Stat label="Boletins" value={homolog.counts.boletins} />
              <Stat label="Blocks" value={homolog.counts.blocks} />
              <Stat label="Imóveis" value={homolog.counts.properties} />
              <Stat label="Imóveis s/ boletim" value={homolog.counts.propertiesWithoutBoletim} warn={homolog.counts.propertiesWithoutBoletim > 0} />
              <Stat label="Boletins s/ block" value={homolog.counts.boletinsWithoutBlock} warn={homolog.counts.boletinsWithoutBlock > 0} />
              <Stat label="Boletins órfãos" value={homolog.counts.orphanBoletins} warn={homolog.counts.orphanBoletins > 0} />
              <Stat label="GPS cobertos" value={homolog.counts.gpsCovered} />
              <Stat label="GPS faltando" value={homolog.counts.gpsMissing} />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Teste</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Detalhes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {homolog.tests.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.id} — {t.name}</TableCell>
                    <TableCell>
                      <Badge variant={t.pass ? "default" : "destructive"}>{t.pass ? "OK" : "ERRO"}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{JSON.stringify(t.details)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {homolog.divergences.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Divergências Cabeçalho × Viewer (top 50)</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Boletim</TableHead>
                      <TableHead>Quart.</TableHead>
                      <TableHead>Localidade</TableHead>
                      <TableHead>Cabeçalho</TableHead>
                      <TableHead>Viewer</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {homolog.divergences.map((d) => (
                      <TableRow key={d.boletim_id}>
                        <TableCell className="font-mono text-xs">{d.boletim_id.slice(0, 8)}</TableCell>
                        <TableCell>{d.block_number ?? "—"}</TableCell>
                        <TableCell>{d.locality ?? "—"}</TableCell>
                        <TableCell>{d.headerCount}</TableCell>
                        <TableCell>{d.viewerCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {homolog.crosscheck && homolog.crosscheck.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2 text-destructive">
                  ⚠ T11 — Boletins Inconsistentes entre Módulos (top 50)
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Boletim</TableHead>
                      <TableHead>Quart.</TableHead>
                      <TableHead>Localidade</TableHead>
                      <TableHead>Lista</TableHead>
                      <TableHead>Viewer</TableHead>
                      <TableHead>PDF</TableHead>
                      <TableHead>Mapa</TableHead>
                      <TableHead>Georef</TableHead>
                      <TableHead>DataAudit</TableHead>
                      <TableHead>Banco</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {homolog.crosscheck.map((c) => (
                      <TableRow key={c.boletim_id}>
                        <TableCell className="font-mono text-xs">{c.boletim_id.slice(0, 8)}</TableCell>
                        <TableCell>{c.block_number ?? "—"}</TableCell>
                        <TableCell>{c.locality ?? "—"}</TableCell>
                        <TableCell>{c.lista}</TableCell>
                        <TableCell>{c.viewer}</TableCell>
                        <TableCell>{c.pdf}</TableCell>
                        <TableCell>{c.mapa}</TableCell>
                        <TableCell>{c.georef}</TableCell>
                        <TableCell>{c.dataAudit}</TableCell>
                        <TableCell>{c.banco}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total boletins" value={data?.totalBoletins ?? 0} />
        <Stat label="Com pendência" value={rows.length} warn={rows.length > 0} />
        <Stat label="Blocos órfãos" value={orphans.length} warn={orphans.length > 0} />
        <Stat label="Blocos s/ localidade" value={data?.blocksWithoutLocality ?? 0} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Boletins pendentes</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma pendência. Tudo consistente ✓</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quart.</TableHead>
                  <TableHead>Localidade</TableHead>
                  <TableHead>Agente</TableHead>
                  <TableHead>Block atual</TableHead>
                  <TableHead>Block sugerido</TableHead>
                  <TableHead>Imóveis</TableHead>
                  <TableHead>Sem boletim_id</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.boletim_id}>
                    <TableCell>{r.block_number ?? "—"}</TableCell>
                    <TableCell>{r.locality ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.agent_name ?? r.agent_id?.slice(0, 8)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.current_block_id?.slice(0, 8) ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.matched_block_id?.slice(0, 8) ?? "—"}
                    </TableCell>
                    <TableCell>{r.properties_total}</TableCell>
                    <TableCell>
                      {r.properties_without_boletim > 0 ? (
                        <Badge variant="destructive">{r.properties_without_boletim}</Badge>
                      ) : (
                        0
                      )}
                    </TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2 flex-wrap">
            <span>Blocos órfãos ({orphans.length})</span>
            <Button
              size="sm"
              variant="destructive"
              disabled={!selectedOrphans.size || busy}
              onClick={onDeleteOrphans}
            >
              Excluir selecionados ({selectedOrphans.size})
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {orphans.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem blocos órfãos.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Número</TableHead>
                  <TableHead>Localidade</TableHead>
                  <TableHead>Imóveis</TableHead>
                  <TableHead>ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orphans.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedOrphans.has(o.id)}
                        onChange={(e) => {
                          const next = new Set(selectedOrphans);
                          if (e.target.checked) next.add(o.id);
                          else next.delete(o.id);
                          setSelectedOrphans(next);
                        }}
                      />
                    </TableCell>
                    <TableCell>{o.number}</TableCell>
                    <TableCell>{o.locality ?? "—"}</TableCell>
                    <TableCell>{o.total_properties}</TableCell>
                    <TableCell className="font-mono text-xs">{o.id.slice(0, 8)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, warn = false }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={`rounded border p-4 ${warn ? "border-yellow-500 bg-yellow-50" : "bg-white"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}
