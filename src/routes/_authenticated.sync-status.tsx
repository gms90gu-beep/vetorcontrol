import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Wifi, WifiOff, Trash2, RotateCcw } from "lucide-react";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import {
  flushMutations,
  retryFailedMutations,
  listFailedMutations,
  type FailedMutationInfo,
} from "@/lib/offline/sync";
import { db, clearOfflineDB } from "@/lib/offline/db";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/sync-status")({
  component: SyncStatusPage,
});

function SyncStatusPage() {
  const { state, online, syncing, pending, byTable, lastSync } = useSyncStatus();
  const [failed, setFailed] = useState<FailedMutationInfo[]>([]);
  const [busy, setBusy] = useState(false);

  const reloadFailed = async () => setFailed(await listFailedMutations());

  useEffect(() => {
    reloadFailed();
    const t = setInterval(reloadFailed, 5000);
    return () => clearInterval(t);
  }, []);

  const doSync = async () => {
    setBusy(true);
    const { ok, failed: f } = await flushMutations();
    setBusy(false);
    toast.success(`Sincronização: ${ok} ok, ${f} falhou`);
    reloadFailed();
  };

  const doRetry = async () => {
    setBusy(true);
    const n = await retryFailedMutations();
    setBusy(false);
    toast.info(`${n} mutações reenviadas à fila`);
    reloadFailed();
  };

  const doClear = async () => {
    const pendingCount = await db.mutations.count();
    if (pendingCount > 0) {
      toast.error(
        `Existem ${pendingCount} mutações pendentes. Sincronize antes de limpar o cache.`
      );
      return;
    }
    if (!confirm("Limpar TODO o cache local? Esta ação é irreversível.")) return;
    await clearOfflineDB();
    toast.success("Cache local limpo. Recarregue a página.");
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Status de Sincronização</h1>
        <p className="text-sm text-muted-foreground">
          Acompanhe a fila offline e force operações manuais.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            {online ? (
              <Wifi className="h-4 w-4 text-emerald-500" />
            ) : (
              <WifiOff className="h-4 w-4 text-destructive" />
            )}
            Conexão
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat
            label="Status"
            value={online ? "🟢 Online" : "🔴 Offline"}
            highlight={state}
          />
          <Stat label="Pendentes" value={pending} />
          <Stat label="Erros" value={failed.length} />
          <Stat
            label="Última sync"
            value={lastSync ? new Date(lastSync).toLocaleTimeString("pt-BR") : "—"}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Por tabela</CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(byTable).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma pendência.</p>
          ) : (
            <div className="space-y-1">
              {Object.entries(byTable).map(([t, n]) => (
                <div key={t} className="flex justify-between text-sm border-b py-1">
                  <span className="font-mono">{t}</span>
                  <span className="font-bold">{n}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button onClick={doSync} disabled={!online || syncing || busy}>
          <RefreshCw className={`h-4 w-4 mr-2 ${syncing || busy ? "animate-spin" : ""}`} />
          Sincronizar agora
        </Button>
        <Button onClick={doRetry} variant="outline" disabled={busy || failed.length === 0}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Reprocessar fila ({failed.length})
        </Button>
        <Button onClick={doClear} variant="destructive">
          <Trash2 className="h-4 w-4 mr-2" />
          Limpar cache local
        </Button>
      </div>

      {failed.length > 0 && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-base text-destructive">
              Mutações com erro persistente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs font-mono">
            {failed.map((f) => (
              <div key={f.id} className="border rounded p-2">
                <div>
                  <strong>{f.op}</strong> em <strong>{f.table}</strong> — {f.tries} tentativas
                </div>
                {f.lastError && (
                  <div className="text-destructive mt-1">{f.lastError}</div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number | string;
  highlight?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold">{value}</p>
      {highlight && <p className="text-[10px] uppercase text-muted-foreground">{highlight}</p>}
    </div>
  );
}
