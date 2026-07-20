import { useEffect, useState } from "react";
import { Wifi, WifiOff, RefreshCw, CloudCheck, CloudUpload, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { flushMutations } from "@/lib/offline/sync";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { SyncStatusModal } from "@/components/SyncStatusModal";

export function ConnectivityBadge({ className }: { className?: string }) {
  const { state, online, pending, failedCount } = useSyncStatus();
  const [open, setOpen] = useState(false);
  const [manualSyncing, setManualSyncing] = useState(false);

  const handleClick = async () => {
    setOpen(true);
  };

  // Auto-resync attempt when a click triggers it externally
  useEffect(() => { /* no-op */ }, []);

  const tone =
    state === "offline" ? "bg-red-500/10 border-red-500/30 text-red-300"
    : state === "error" ? "bg-rose-600/15 border-rose-500/40 text-rose-300"
    : state === "syncing" ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
    : state === "synced" ? "bg-sky-500/10 border-sky-500/30 text-sky-300"
    : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300";

  const icon =
    state === "offline" ? <WifiOff className="h-3 w-3" />
    : state === "error" ? <AlertTriangle className="h-3 w-3" />
    : state === "syncing" ? <RefreshCw className="h-3 w-3 animate-spin" />
    : state === "synced" ? <CloudCheck className="h-3 w-3" />
    : <Wifi className="h-3 w-3" />;

  const label =
    state === "offline" ? "Offline"
    : state === "error" ? "Falha na sincronização"
    : state === "syncing" ? "Sincronizando"
    : state === "synced" ? "Sincronizado"
    : "Online";

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        title={
          state === "offline" ? "Offline — trabalho salvo localmente"
          : state === "error" ? `${failedCount} registro(s) não sincronizaram após várias tentativas — clique para ver detalhes`
          : state === "syncing" ? "Enviando registros para o servidor..."
          : state === "synced" ? "Tudo sincronizado"
          : "Online — clique para ver o status"
        }
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-full border text-[10px] font-black uppercase tracking-tight transition-colors hover:brightness-110",
          tone,
          className,
        )}
      >
        {icon}
        <span>{label}</span>
        {state === "error" ? (
          <span className="flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded-full bg-rose-600/25 text-rose-200 border border-rose-500/40">
            <AlertTriangle className="h-3 w-3" />
            {failedCount}
          </span>
        ) : pending > 0 && state !== "syncing" && (
          <span className="flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
            <CloudUpload className="h-3 w-3" />
            {pending}
          </span>
        )}
      </button>
      <SyncStatusModal
        open={open}
        onOpenChange={setOpen}
        onSyncNow={async () => {
          if (!online || manualSyncing) return;
          setManualSyncing(true);
          try { await flushMutations(); } finally { setManualSyncing(false); }
        }}
      />
    </>
  );
}
