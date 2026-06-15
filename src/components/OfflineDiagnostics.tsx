import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/offline/db";

type SwInfo = {
  supported: boolean;
  registered: boolean;
  controlled: boolean;
  scope?: string;
  scriptURL?: string;
  state?: string;
};

type CacheInfo = { name: string; entries: number };

const CRITICAL_ROUTES = ["/rg", "/field-work", "/pending", "/reports", "/settings", "/sync-status"];
const TRACKED_TABLES = [
  "properties",
  "blocks",
  "boletins_rg",
  "daily_work_records",
  "visits",
  "field_work_sessions",
  "property_pendencies",
] as const;

export function OfflineDiagnostics() {
  const [sw, setSw] = useState<SwInfo>({ supported: false, registered: false, controlled: false });
  const [caches, setCaches] = useState<CacheInfo[]>([]);
  const [idb, setIdb] = useState<Record<string, number>>({});
  const [routes, setRoutes] = useState<Record<string, "ok" | "miss" | "?">>({});
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    (async () => {
      // Service Worker
      const supported = typeof navigator !== "undefined" && "serviceWorker" in navigator;
      if (supported) {
        const reg = await navigator.serviceWorker.getRegistration();
        const active = reg?.active;
        setSw({
          supported: true,
          registered: !!reg,
          controlled: !!navigator.serviceWorker.controller,
          scope: reg?.scope,
          scriptURL: active?.scriptURL,
          state: active?.state,
        });
      }

      // Cache Storage
      if (typeof caches !== "undefined") {
        try {
          const names = await window.caches.keys();
          const infos: CacheInfo[] = [];
          for (const name of names) {
            const c = await window.caches.open(name);
            const keys = await c.keys();
            infos.push({ name, entries: keys.length });
          }
          setCaches(infos);

          // Check critical routes presence in any cache (precache for index.html mainly)
          const routeStatus: Record<string, "ok" | "miss" | "?"> = {};
          for (const path of CRITICAL_ROUTES) {
            // SPA fallback: /index.html should be precached. Routes resolve via navigateFallback.
            const match = await window.caches.match("/index.html");
            routeStatus[path] = match ? "ok" : "miss";
          }
          setRoutes(routeStatus);
        } catch {
          /* ignore */
        }
      }

      // IndexedDB counts
      const counts: Record<string, number> = {};
      for (const t of TRACKED_TABLES) {
        try {
          counts[t] = await (db as any)[t].count();
        } catch {
          counts[t] = 0;
        }
      }
      setIdb(counts);
    })();
  }, [refreshKey]);

  const totalCacheEntries = caches.reduce((a, c) => a + c.entries, 0);
  const totalIdbRows = Object.values(idb).reduce((a, n) => a + n, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Diagnóstico Offline-First</h2>
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          className="text-xs underline text-muted-foreground"
        >
          Atualizar
        </button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Service Worker</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          <Row k="Suportado pelo navegador" v={sw.supported ? "Sim" : "Não"} ok={sw.supported} />
          <Row k="Registrado" v={sw.registered ? "Sim" : "Não"} ok={sw.registered} />
          <Row
            k="Controlando a página"
            v={sw.controlled ? "Sim" : "Não"}
            ok={sw.controlled}
            warn={!sw.controlled && sw.registered}
          />
          {sw.scriptURL && <Row k="Script" v={sw.scriptURL} mono />}
          {sw.scope && <Row k="Escopo" v={sw.scope} mono />}
          {sw.state && <Row k="Estado" v={sw.state} />}
          {!sw.registered && (
            <p className="text-xs text-muted-foreground pt-2">
              O Service Worker só é registrado no app publicado (não roda no preview da Lovable nem em dev).
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Cache Storage{" "}
            <Badge variant="secondary" className="ml-2">
              {caches.length} caches · {totalCacheEntries} arquivos
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          {caches.length === 0 ? (
            <p className="text-muted-foreground">Nenhum cache encontrado.</p>
          ) : (
            caches.map((c) => (
              <div key={c.name} className="flex justify-between border-b py-1">
                <span className="font-mono text-xs">{c.name}</span>
                <span className="font-bold">{c.entries}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rotas offline-críticas</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          {CRITICAL_ROUTES.map((r) => (
            <Row
              key={r}
              k={r}
              v={routes[r] === "ok" ? "Disponível (fallback /index.html)" : "Indisponível"}
              ok={routes[r] === "ok"}
              mono
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            IndexedDB{" "}
            <Badge variant="secondary" className="ml-2">
              {totalIdbRows} registros
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          {TRACKED_TABLES.map((t) => (
            <Row key={t} k={t} v={String(idb[t] ?? 0)} ok={(idb[t] ?? 0) > 0} mono />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({
  k,
  v,
  ok,
  warn,
  mono,
}: {
  k: string;
  v: string;
  ok?: boolean;
  warn?: boolean;
  mono?: boolean;
}) {
  const color = warn
    ? "text-amber-600"
    : ok === undefined
      ? ""
      : ok
        ? "text-emerald-600"
        : "text-destructive";
  return (
    <div className="flex justify-between gap-3 border-b py-1">
      <span className="text-muted-foreground">{k}</span>
      <span className={`${mono ? "font-mono text-xs" : ""} ${color} text-right break-all`}>{v}</span>
    </div>
  );
}
