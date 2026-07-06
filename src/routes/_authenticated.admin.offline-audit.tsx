import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Activity,
  Database,
  HardDrive,
  RefreshCw,
  ShieldCheck,
  Wifi,
  WifiOff,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { KPICard } from "@/components/ui/kpi-card";
import { db } from "@/lib/offline/db";
import { pendingMutationCount, pendingByTable, getLastSyncAt, flushMutations } from "@/lib/offline/sync";
import { cleanupOrphanCache } from "@/lib/offline/cache-cleanup";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { runRC1Suite, getLastRC1Report, type RC1Report } from "@/lib/audit/rc1-suite";
import { downloadMarkdown, downloadPdf } from "@/lib/audit/rc1-report";
import { runGoLive, getLastGoLiveReport, type GoLiveReport } from "@/lib/audit/go-live";
import { downloadMarkdown as downloadGoLiveMd, downloadPdf as downloadGoLivePdf } from "@/lib/audit/go-live-report";
import { FileDown, FileText, PlayCircle, Award } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/offline-audit")({
  ssr: false,
  component: OfflineAuditPage,
});

const PROTECTED_ROUTES = [
  "/dashboard",
  "/rg",
  "/field-work",
  "/field-work-list",
  "/pending",
  "/map",
  "/heatmap",
  "/reports",
  "/relatorios",
  "/settings",
  "/sync-status",
];

const DEXIE_TABLES = [
  "properties",
  "blocks",
  "boletins_rg",
  "visits",
  "visit_deposits",
  "property_pendencies",
  "property_recovery_attempts",
  "field_work_sessions",
  "daily_work_records",
  "cycles",
  "weeks",
  "profiles",
  "agents",
] as const;

interface RouteCheck { route: string; cached: boolean; status: "ok" | "miss" | "error"; }
interface DexieCheck { name: string; count: number; }

function OfflineAuditPage() {
  const online = useOnlineStatus();
  const { user } = useAuth();
  const [rc1, setRc1] = useState<RC1Report | null>(null);
  const [rc1Busy, setRc1Busy] = useState(false);
  const [goLive, setGoLive] = useState<GoLiveReport | null>(null);
  const [goLiveBusy, setGoLiveBusy] = useState(false);
  const [swActive, setSwActive] = useState<boolean>(false);
  const [swScope, setSwScope] = useState<string>("");
  const [cacheKeys, setCacheKeys] = useState<string[]>([]);
  const [routeChecks, setRouteChecks] = useState<RouteCheck[]>([]);
  const [dexie, setDexie] = useState<DexieCheck[]>([]);
  const [pending, setPending] = useState(0);
  const [byTable, setByTable] = useState<Record<string, number>>({});
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    console.log("[OFFLINE_ROUTE] iniciando auditoria");
    try {
      // Service Worker
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        setSwActive(!!reg?.active);
        setSwScope(reg?.scope || "");
      }

      // Cache Storage
      if ("caches" in window) {
        const keys = await caches.keys();
        setCacheKeys(keys);
      }

      // Rotas: testa se cada uma resolve via cache
      const checks: RouteCheck[] = [];
      for (const route of PROTECTED_ROUTES) {
        try {
          const res = await fetch(route, { method: "GET", cache: "force-cache" });
          checks.push({
            route,
            cached: res.ok,
            status: res.ok ? "ok" : "miss",
          });
          console.log(`[OFFLINE_ROUTE] ${route} → ${res.status}`);
        } catch (e) {
          checks.push({ route, cached: false, status: "error" });
          console.log(`[OFFLINE_ROUTE] ${route} → ERROR`);
        }
      }
      setRouteChecks(checks);

      // Dexie
      const counts: DexieCheck[] = [];
      for (const name of DEXIE_TABLES) {
        try {
          const n = await (db as any)[name].count();
          counts.push({ name, count: n });
        } catch {
          counts.push({ name, count: -1 });
        }
      }
      setDexie(counts);
      console.log("[OFFLINE_DEXIE]", counts);

      // Fila
      const [p, bt] = await Promise.all([pendingMutationCount(), pendingByTable()]);
      setPending(p);
      setByTable(bt);
      setLastSync(getLastSyncAt());
      console.log("[OFFLINE_QUEUE]", { pending: p, byTable: bt });
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    getLastRC1Report().then(setRc1);
    getLastGoLiveReport().then(setGoLive);
  }, [refresh]);

  const runRc1 = useCallback(async () => {
    if (!user?.id) { toast.error("Sessão não disponível"); return; }
    setRc1Busy(true);
    try {
      const r = await runRC1Suite(user.id);
      setRc1(r);
      toast.success(`RC-1: ${r.verdict} (${r.globalScore}%)`);
    } catch (e: any) {
      toast.error(`Falha RC-1: ${e?.message || e}`);
    } finally { setRc1Busy(false); }
  }, [user?.id]);

  const runGoLiveNow = useCallback(async () => {
    if (!user?.id) { toast.error("Sessão não disponível"); return; }
    setGoLiveBusy(true);
    try {
      const r = await runGoLive(user.id);
      setGoLive(r);
      setRc1(r.rc1);
      toast.success(`Go-Live: ${r.verdict} (${r.globalScore}%)`);
    } catch (e: any) {
      toast.error(`Falha Go-Live: ${e?.message || e}`);
    } finally { setGoLiveBusy(false); }
  }, [user?.id]);

  // Score 0–100
  const swScore = swActive ? 25 : 0;
  const dexieScore = dexie.some((d) => d.count > 0) ? 25 : dexie.length > 0 ? 15 : 0;
  const queueScore = pending === 0 ? 25 : pending < 10 ? 18 : 10;
  const routesOk = routeChecks.filter((r) => r.status === "ok").length;
  const routesScore = Math.round((routesOk / Math.max(1, routeChecks.length)) * 25);
  const score = swScore + dexieScore + queueScore + routesScore;

  const totalRows = dexie.reduce((a, b) => a + Math.max(0, b.count), 0);

  const doSync = async () => {
    setBusy(true);
    const { ok, failed } = await flushMutations();
    toast.success(`Sincronização: ${ok} ok, ${failed} falhou`);
    await refresh();
  };

  const doCacheCleanup = async () => {
    setBusy(true);
    const t0 = performance.now();
    try {
      const report = await cleanupOrphanCache();
      const ms = Math.round(performance.now() - t0);
      console.log("[CACHE_CLEANUP_MANUAL]", { ...report, durationMs: ms });
      if (report.aborted) {
        toast.warning(`Limpeza abortada: ${report.aborted}`);
      } else {
        const checked = Object.values(report.perTable).reduce((a, b) => a + b.checked, 0);
        const removed = Object.values(report.perTable).reduce((a, b) => a + b.removed, 0);
        toast.success(`Cache: ${checked} verificados, ${removed} removidos em ${ms}ms`);
      }
      await refresh();
    } catch (e: any) {
      toast.error(`Falha na limpeza: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
      <PageHeader
        title="Auditoria Offline-First"
        description="Diagnóstico em tempo real da camada offline: Service Worker, Dexie, fila e rotas."
        icon={<ShieldCheck className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={refresh} disabled={busy}>
              <RefreshCw className={`mr-2 h-4 w-4 ${busy ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            <Button size="sm" onClick={doSync} disabled={busy || !online}>
              Sincronizar agora
            </Button>
          </div>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KPICard
          title="Score Geral"
          value={`${score}%`}
          icon={<Activity className="h-4 w-4" />}
          tone={score >= 80 ? "success" : score >= 50 ? "warning" : "danger"}
        />
        <KPICard
          title="Conectividade"
          value={online ? "Online" : "Offline"}
          icon={online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
          tone={online ? "success" : "warning"}
        />
        <KPICard
          title="Registros em cache"
          value={totalRows.toLocaleString("pt-BR")}
          icon={<Database className="h-4 w-4" />}
        />
        <KPICard
          title="Pendências de sync"
          value={pending}
          icon={<HardDrive className="h-4 w-4" />}
          tone={pending === 0 ? "success" : pending < 10 ? "warning" : "danger"}
        />
      </div>

      {/* Service Worker */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Service Worker
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            {swActive ? (
              <Badge className="bg-emerald-600">Ativo</Badge>
            ) : (
              <Badge variant="destructive">Inativo</Badge>
            )}
            <span className="text-muted-foreground">{swScope || "—"}</span>
          </div>
          <div>
            <div className="text-muted-foreground">Caches:</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {cacheKeys.length === 0 && <span className="text-xs text-muted-foreground">nenhum</span>}
              {cacheKeys.map((k) => (
                <Badge key={k} variant="outline" className="font-mono text-xs">{k}</Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Rotas */}
      <Card>
        <CardHeader>
          <CardTitle>Rotas protegidas offline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {routeChecks.map((r) => (
              <div key={r.route} className="flex items-center justify-between rounded-md border px-3 py-2">
                <code className="text-xs">{r.route}</code>
                {r.status === "ok" ? (
                  <Badge className="bg-emerald-600"><CheckCircle2 className="mr-1 h-3 w-3" /> cache</Badge>
                ) : r.status === "miss" ? (
                  <Badge variant="outline">sem cache</Badge>
                ) : (
                  <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3" /> erro</Badge>
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            Cobertura: {routesOk}/{routeChecks.length}
          </div>
          <Progress value={(routesOk / Math.max(1, routeChecks.length)) * 100} className="mt-2 h-1" />
        </CardContent>
      </Card>

      {/* Dexie */}
      <Card>
        <CardHeader>
          <CardTitle>Tabelas Dexie (IndexedDB)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {dexie.map((d) => (
              <div key={d.name} className="rounded-md border px-3 py-2 text-sm">
                <div className="text-muted-foreground text-xs">{d.name}</div>
                <div className="font-semibold">{d.count < 0 ? "erro" : d.count.toLocaleString("pt-BR")}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Fila */}
      <Card>
        <CardHeader>
          <CardTitle>Fila de sincronização</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>Total pendente: <strong>{pending}</strong></div>
          {lastSync && (
            <div className="text-muted-foreground text-xs">
              Última sincronização: {new Date(lastSync).toLocaleString("pt-BR")}
            </div>
          )}
          {Object.keys(byTable).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {Object.entries(byTable).map(([k, v]) => (
                <Badge key={k} variant="outline" className="text-xs">{k}: {v}</Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Release Candidate 1 */}
      <Card className="border-primary/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Release Candidate (RC-1)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={runRc1} disabled={rc1Busy}>
              <PlayCircle className={`mr-2 h-4 w-4 ${rc1Busy ? "animate-spin" : ""}`} />
              Executar suíte RC-1
            </Button>
            <Button size="sm" variant="outline" disabled={!rc1} onClick={() => rc1 && downloadMarkdown(rc1)}>
              <FileText className="mr-2 h-4 w-4" /> Markdown
            </Button>
            <Button size="sm" variant="outline" disabled={!rc1} onClick={() => rc1 && downloadPdf(rc1)}>
              <FileDown className="mr-2 h-4 w-4" /> PDF
            </Button>
          </div>
          {rc1 ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <Badge className={rc1.verdict === "APROVADO" ? "bg-emerald-600" : rc1.verdict === "INDETERMINADO" ? "bg-amber-600" : "bg-red-600"}>
                  {rc1.verdict}
                </Badge>
                <span>Score: <strong>{rc1.globalScore}%</strong></span>
                <span className="text-muted-foreground text-xs">
                  Executado em {new Date(rc1.ts).toLocaleString("pt-BR")}
                </span>
              </div>
              <div className="space-y-1">
                {rc1.modules.map((m) => (
                  <div key={m.id} className="flex items-center justify-between rounded border px-2 py-1">
                    <span>{m.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs">{m.durationMs} ms</span>
                      {m.status === "APROVADO" ? (
                        <Badge className="bg-emerald-600">APROVADO</Badge>
                      ) : (
                        <Badge variant="destructive">REPROVADO</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {rc1.crossIntegrity && (
                <div className="rounded border p-2">
                  <div className="font-medium mb-1">Integridade cruzada</div>
                  <div className="grid grid-cols-2 gap-1 text-xs md:grid-cols-3">
                    {rc1.crossIntegrity.checks.map((c) => (
                      <div key={c.module} className="flex justify-between gap-2">
                        <span>{c.module}</span>
                        <span className={c.ok ? "text-emerald-600" : "text-red-600"}>
                          {c.local}/{c.server}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-muted-foreground text-xs">
              Nenhuma execução. Clique em "Executar suíte RC-1" para gerar o relatório institucional.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Certificação Go-Live */}
      <Card className="border-emerald-500/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-4 w-4" /> Certificação Go-Live
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={runGoLiveNow} disabled={goLiveBusy}>
              <PlayCircle className={`mr-2 h-4 w-4 ${goLiveBusy ? "animate-spin" : ""}`} />
              Executar Certificação Go-Live
            </Button>
            <Button size="sm" variant="outline" disabled={!goLive} onClick={() => goLive && downloadGoLiveMd(goLive)}>
              <FileText className="mr-2 h-4 w-4" /> Parecer (MD)
            </Button>
            <Button size="sm" variant="outline" disabled={!goLive} onClick={() => goLive && downloadGoLivePdf(goLive)}>
              <FileDown className="mr-2 h-4 w-4" /> Parecer (PDF)
            </Button>
          </div>
          {goLive ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <Badge className={goLive.verdict === "APROVADO" ? "bg-emerald-600" : goLive.verdict === "INDETERMINADO" ? "bg-amber-600" : "bg-red-600"}>
                  {goLive.verdict}
                </Badge>
                <span>Score Global: <strong>{goLive.globalScore}%</strong></span>
                <span className="text-muted-foreground text-xs">{new Date(goLive.ts).toLocaleString("pt-BR")}</span>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <div className="rounded border p-2">
                  <div className="text-xs text-muted-foreground">RC-1</div>
                  <div className="font-semibold">{goLive.rc1.globalScore}%</div>
                </div>
                <div className="rounded border p-2">
                  <div className="text-xs text-muted-foreground">Performance</div>
                  <div className="font-semibold">{goLive.performance.score}%</div>
                </div>
                <div className="rounded border p-2">
                  <div className="text-xs text-muted-foreground">Segurança</div>
                  <div className="font-semibold">{goLive.security.score}%</div>
                </div>
              </div>
              <div className="rounded border p-2">
                <div className="font-medium mb-1">Performance</div>
                <div className="space-y-1">
                  {goLive.performance.metrics.map((m) => (
                    <div key={m.name} className="flex items-center justify-between text-xs">
                      <span>{m.name}{m.detail ? ` — ${m.detail}` : ""}</span>
                      <span className={m.ok ? "text-emerald-600" : "text-red-600"}>{m.ms} ms</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded border p-2">
                <div className="font-medium mb-1">Segurança</div>
                <div className="space-y-1">
                  {goLive.security.checks.map((c) => (
                    <div key={c.id} className="flex items-center justify-between text-xs">
                      <span>{c.name}{c.detail ? ` — ${c.detail}` : ""}</span>
                      {c.pass ? <Badge className="bg-emerald-600">OK</Badge> : <Badge variant="destructive">FALHA</Badge>}
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded border border-emerald-500/40 bg-emerald-500/5 p-3">
                <div className="font-semibold mb-1">Parecer Técnico</div>
                <div className="text-sm">{goLive.conclusion}</div>
              </div>
            </>
          ) : (
            <div className="text-muted-foreground text-xs">
              Nenhuma certificação executada. A suíte Go-Live agrega RC-1, performance e segurança e gera o parecer executivo.
            </div>
          )}
        </CardContent>
      </Card>


      <p className="text-xs text-muted-foreground">
        Para varrer consultas sem fallback no código-fonte, rode:{" "}
        <code className="rounded bg-muted px-1 py-0.5">bun run scripts/audit-offline.ts</code>
      </p>
    </div>
  );
}
