import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Smartphone,
  Download,
  RefreshCw,
  Trash2,
  Database,
  Activity,
  CheckCircle2,
  AlertCircle,
  ArrowUpCircle,
} from "lucide-react";
import { toast } from "sonner";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import {
  applyPwaUpdate,
  getPwaUpdateState,
  subscribePwaUpdate,
} from "@/lib/pwa/update-state";
import { db, clearOfflineDB } from "@/lib/offline/db";
import { flushMutations } from "@/lib/offline/sync";
import { supabase } from "@/integrations/supabase/client";

const APP_VERSION = "2.1.0";
const BUILD_DATE = "2026-06-28";

type SwState = {
  registered: boolean;
  controlled: boolean;
  scriptURL?: string;
  state?: string;
  scope?: string;
};

function fmtDate(ts: number | null | undefined) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "—";
  }
}

function fmtBytes(n?: number | null) {
  if (!n || n <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${units[i]}`;
}

export function PwaManagerSection() {
  const { installed, canInstall, promptInstall } = usePwaInstall();
  const { lastSync, pending, online, syncing } = useSyncStatus();
  const [, force] = useState(0);

  useEffect(() => subscribePwaUpdate(() => force((n) => n + 1)), []);
  const update = getPwaUpdateState();

  useEffect(() => {
    console.log("[PWA_SETTINGS]", { installed, canInstall, online, pending });
  }, [installed, canInstall, online, pending]);

  const handleInstall = useCallback(async () => {
    console.log("[PWA_INSTALL]", { stage: "prompt-start" });
    const r = await promptInstall();
    console.log("[PWA_INSTALL]", { outcome: r });
    if (r === "accepted") toast.success("Aplicativo instalado com sucesso.");
    else if (r === "dismissed") toast.info("Instalação cancelada.");
    else toast.info("Instalação não disponível neste navegador no momento.");
  }, [promptInstall]);

  const handleUpdate = useCallback(async () => {
    console.log("[PWA_UPDATE]", { stage: "apply-start" });
    await applyPwaUpdate();
  }, []);

  const handleForceSync = useCallback(async () => {
    console.log("[PWA_SYNC]", { stage: "force-start" });
    const r = await flushMutations();
    console.log("[PWA_SYNC]", { stage: "done", ...r });
    toast.success(`Sincronização concluída (${r.ok} ok, ${r.failed} falhas).`);
  }, []);

  const handleClearCache = useCallback(async () => {
    if (!confirm("Limpar todo o cache local (Cache Storage)? Os dados offline (Dexie) e a sessão serão mantidos.")) return;
    console.log("[PWA_CACHE]", { stage: "clear-start" });
    try {
      if (typeof caches !== "undefined") {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
        console.log("[PWA_CACHE]", { stage: "cleared", count: names.length });
      }
      toast.success("Cache local limpo. Recarregue para baixar novamente.");
    } catch (e: any) {
      console.warn("[PWA_CACHE]", { error: String(e?.message || e) });
      toast.error("Falha ao limpar cache.");
    }
  }, []);

  const handleReindex = useCallback(async () => {
    if (!confirm("Reindexar o banco offline irá APAGAR os dados em cache local (Dexie). Mutações pendentes serão preservadas. Continuar?")) return;
    console.log("[PWA_DIAGNOSTIC]", { stage: "reindex-start" });
    try {
      const pendingMuts = await db.mutations.toArray();
      await clearOfflineDB();
      if (pendingMuts.length) {
        await db.mutations.bulkAdd(pendingMuts.map(({ id, ...rest }) => rest));
      }
      console.log("[PWA_DIAGNOSTIC]", { stage: "reindex-done", preserved: pendingMuts.length });
      toast.success("Banco offline reindexado.");
    } catch (e: any) {
      console.warn("[PWA_DIAGNOSTIC]", { error: String(e?.message || e) });
      toast.error("Falha ao reindexar.");
    }
  }, []);

  return (
    <section className="space-y-3">
      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">
        📱 Aplicativo
      </h3>
      <Card className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-white">
        <CardContent className="p-5 space-y-3">
          {/* Status */}
          <InfoRow
            label="Status de instalação"
            value={installed ? "✔ Instalado" : "🌐 Navegador"}
            tone={installed ? "ok" : "muted"}
          />
          <Separator className="bg-slate-100" />
          <InfoRow label="Versão atual" value={`${APP_VERSION}`} />
          <Separator className="bg-slate-100" />
          <InfoRow label="Última atualização" value={BUILD_DATE} />
          <Separator className="bg-slate-100" />
          <InfoRow
            label="Status Offline"
            value={online ? "Online" : "Offline"}
            tone={online ? "ok" : "warn"}
          />
          <Separator className="bg-slate-100" />
          <InfoRow
            label="Última sincronização"
            value={fmtDate(lastSync)}
            tone={syncing ? "info" : "muted"}
          />
          <Separator className="bg-slate-100" />
          <InfoRow
            label="Pendências de sincronização"
            value={String(pending)}
            tone={pending > 0 ? "warn" : "ok"}
          />

          {/* Update banner */}
          {update.hasUpdate && update.canApply && (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 space-y-2">
              <div className="flex items-center gap-2 text-blue-700 font-bold text-sm">
                <ArrowUpCircle className="h-4 w-4" /> 🆕 Nova versão disponível
              </div>
              <p className="text-xs text-blue-700/80">
                {update.journeyActive
                  ? "Atualização será aplicada ao finalizar a jornada."
                  : "Atualize agora para receber correções e melhorias."}
              </p>
              <Button
                size="sm"
                onClick={handleUpdate}
                disabled={update.journeyActive}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                ⬆️ Atualizar agora
              </Button>
            </div>
          )}

          {/* Install / Installed */}
          {installed ? (
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold w-full justify-center">
              <CheckCircle2 className="h-4 w-4" /> ✔ Aplicativo instalado
            </div>
          ) : canInstall ? (
            <Button
              onClick={handleInstall}
              className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Download className="h-4 w-4" /> ⬇️ Instalar Aplicativo
            </Button>
          ) : (
            <div className="text-[11px] text-slate-500 text-center px-2">
              Instalação indisponível neste navegador no momento. Abra o app no Chrome/Edge em
              dispositivo móvel para receber o prompt de instalação.
            </div>
          )}

          <Separator className="bg-slate-100" />

          {/* Tools */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleForceSync}
              disabled={!online || syncing}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              Forçar sync
            </Button>
            <Button variant="outline" size="sm" onClick={handleClearCache} className="gap-2">
              <Trash2 className="h-4 w-4" /> Limpar cache
            </Button>
            <Button variant="outline" size="sm" onClick={handleReindex} className="gap-2">
              <Database className="h-4 w-4" /> Reindexar BD
            </Button>
            <DiagnosticsDialog />
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function InfoRow({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "muted" | "info";
}) {
  const color =
    tone === "ok"
      ? "text-emerald-600"
      : tone === "warn"
        ? "text-amber-600"
        : tone === "info"
          ? "text-blue-600"
          : "text-slate-900";
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</span>
      <span className={`text-sm font-black ${color}`}>{value}</span>
    </div>
  );
}

function DiagnosticsDialog() {
  const [open, setOpen] = useState(false);
  const [diag, setDiag] = useState<{
    sw: SwState;
    manifestOk: boolean;
    manifestName?: string;
    dexie: Record<string, number>;
    dexieTotal: number;
    pending: number;
    cacheEntries: number;
    cacheNames: string[];
    storage?: { usage?: number; quota?: number };
    session: boolean;
    lastSync: number | null;
  } | null>(null);

  const run = useCallback(async () => {
    console.log("[PWA_DIAGNOSTIC]", { stage: "run-start" });
    // SW
    let sw: SwState = { registered: false, controlled: false };
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      sw = {
        registered: !!reg,
        controlled: !!navigator.serviceWorker.controller,
        scriptURL: reg?.active?.scriptURL,
        state: reg?.active?.state,
        scope: reg?.scope,
      };
    }
    // Manifest
    let manifestOk = false;
    let manifestName: string | undefined;
    try {
      const r = await fetch("/manifest.webmanifest", { cache: "no-cache" });
      if (r.ok) {
        const m = await r.json();
        manifestOk = !!(m?.name && m?.icons?.length);
        manifestName = m?.name;
      }
    } catch {}
    // Dexie counts
    const tables = [
      "properties","blocks","boletins_rg","visits","visit_deposits",
      "property_pendencies","field_work_sessions","daily_work_records",
      "cycles","weeks","profiles","agents",
    ] as const;
    const dexie: Record<string, number> = {};
    let dexieTotal = 0;
    for (const t of tables) {
      try { const n = await (db as any)[t].count(); dexie[t] = n; dexieTotal += n; }
      catch { dexie[t] = 0; }
    }
    const pending = await db.mutations.count();
    // Cache Storage
    let cacheEntries = 0;
    let cacheNames: string[] = [];
    if (typeof caches !== "undefined") {
      try {
        cacheNames = await caches.keys();
        for (const n of cacheNames) {
          const c = await caches.open(n);
          cacheEntries += (await c.keys()).length;
        }
      } catch {}
    }
    // Storage estimate
    let storage: { usage?: number; quota?: number } | undefined;
    try {
      if (navigator.storage?.estimate) storage = await navigator.storage.estimate();
    } catch {}
    // Session
    let session = false;
    try {
      const { data } = await supabase.auth.getSession();
      session = !!data.session;
    } catch {}

    const result = {
      sw, manifestOk, manifestName, dexie, dexieTotal, pending,
      cacheEntries, cacheNames, storage, session,
      lastSync: (await import("@/lib/offline/sync")).getLastSyncAt(),
    };
    setDiag(result);
    console.log("[PWA_DIAGNOSTIC]", { stage: "run-done", summary: {
      sw: sw.registered, controlled: sw.controlled, manifestOk,
      dexieTotal, pending, cacheEntries, session,
    }});
  }, []);

  useEffect(() => { if (open) run(); }, [open, run]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Activity className="h-4 w-4" /> Diagnóstico
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>📊 Diagnóstico Offline</DialogTitle>
        </DialogHeader>
        {!diag ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <div className="space-y-2 text-sm">
            <Item label="Service Worker ativo" ok={diag.sw.registered && diag.sw.controlled}
              hint={diag.sw.state ? `(${diag.sw.state})` : ""} />
            <Item label="Manifest carregado" ok={diag.manifestOk} hint={diag.manifestName} />
            <Item label="Banco Dexie"
              ok={diag.dexieTotal > 0}
              hint={`${diag.dexieTotal} registros`} />
            <Item label="Sessão Offline" ok={diag.session}
              hint={diag.session ? "ativa" : "ausente"} />
            <Item label="Fila de sincronização"
              ok={diag.pending === 0}
              tone={diag.pending > 0 ? "warn" : "ok"}
              hint={`${diag.pending} pendência(s)`} />
            <Item label="Recursos em cache"
              ok={diag.cacheEntries > 0}
              hint={`${diag.cacheEntries} arquivos · ${diag.cacheNames.length} caches`} />
            <Item label="Última sincronização" ok={!!diag.lastSync} hint={fmtDate(diag.lastSync)} />
            <Item label="Espaço utilizado" ok={!!diag.storage?.usage}
              hint={`${fmtBytes(diag.storage?.usage)} / ${fmtBytes(diag.storage?.quota)}`} />
            <Item label="Versão instalada" ok={true} hint={APP_VERSION} />

            <details className="text-xs text-muted-foreground pt-2">
              <summary>Detalhes técnicos</summary>
              <pre className="mt-2 overflow-x-auto bg-slate-50 p-2 rounded text-[10px]">
{JSON.stringify({ sw: diag.sw, caches: diag.cacheNames, dexie: diag.dexie }, null, 2)}
              </pre>
            </details>

            <Button size="sm" variant="outline" className="w-full mt-2" onClick={run}>
              <RefreshCw className="h-4 w-4 mr-2" /> Atualizar diagnóstico
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Item({
  label, ok, hint, tone,
}: { label: string; ok: boolean; hint?: string; tone?: "ok" | "warn" }) {
  const useWarn = tone === "warn";
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-1.5">
      <span className="text-slate-700">{label}</span>
      <span className="flex items-center gap-2">
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        {ok && !useWarn ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        ) : useWarn ? (
          <AlertCircle className="h-4 w-4 text-amber-500" />
        ) : (
          <AlertCircle className="h-4 w-4 text-red-500" />
        )}
      </span>
    </div>
  );
}
