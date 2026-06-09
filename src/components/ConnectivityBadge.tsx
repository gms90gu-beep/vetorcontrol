import { useEffect, useState } from "react";
import { Wifi, WifiOff, RefreshCw, CloudCheck, CloudUpload } from "lucide-react";
import { cn } from "@/lib/utils";
import { flushMutations } from "@/lib/offline/sync";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { SyncStatusModal } from "@/components/SyncStatusModal";

export function ConnectivityBadge({ className }: { className?: string }) {
  const { state, online, pending } = useSyncStatus();
  const [open, setOpen] = useState(false);
  const [manualSyncing, setManualSyncing] = useState(false);

  const handleClick = async () => {
    setOpen(true);
  };

  // Auto-resync attempt when a click triggers it externally
  useEffect(() => { /* no-op */ }, []);

  const tone =
    state === "offline" ? "bg-red-500/10 border-red-500/30 text-red-300"
    : state === "syncing" ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
    : state === "synced" ? "bg-sky-500/10 border-sky-500/30 text-sky-300"
    : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300";

  const icon =
    state === "offline" ? <WifiOff className="h-3 w-3" />
    : state === "syncing" ? <RefreshCw className="h-3 w-3 animate-spin" />
    : state === "synced" ? <CloudCheck className="h-3 w-3" />
    : <Wifi className="h-3 w-3" />;

  const label =
    state === "offline" ? "Offline"
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
        {pending > 0 && state !== "syncing" && (
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
