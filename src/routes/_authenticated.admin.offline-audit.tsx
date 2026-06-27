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
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { toast } from "sonner";

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

  useEffect(() => { refresh(); }, [refresh]);

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

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
      <PageHeader
        title="Auditoria Offline-First"
        description="Diagnóstico em tempo real da camada offline: Service Worker, Dexie, fila e rotas."
        icon={ShieldCheck}
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

      <p className="text-xs text-muted-foreground">
        Para varrer consultas sem fallback no código-fonte, rode:{" "}
        <code className="rounded bg-muted px-1 py-0.5">bun run scripts/audit-offline.ts</code>
      </p>
    </div>
  );
}
