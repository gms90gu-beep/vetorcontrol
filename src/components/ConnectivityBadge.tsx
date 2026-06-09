import { useEffect, useState } from "react";
import { Wifi, WifiOff, RefreshCw, CloudUpload } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { db } from "@/lib/offline/db";
import { flushMutations, onSyncChange } from "@/lib/offline/sync";

export function ConnectivityBadge({ className }: { className?: string }) {
  const online = useOnlineStatus();
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const n = await db.mutations.count();
      if (active) setPending(n);
    };
    refresh();
    const off = onSyncChange(refresh);
    const t = setInterval(refresh, 5000);
    return () => { active = false; off(); clearInterval(t); };
  }, []);

  const handleSync = async () => {
    if (!online || syncing) return;
    setSyncing(true);
    try { await flushMutations(); } finally { setSyncing(false); }
  };

  return (
    <button
      type="button"
      onClick={handleSync}
      title={online ? "Online — clique para sincronizar agora" : "Offline — trabalho salvo localmente"}
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 rounded-full border text-[10px] font-black uppercase tracking-tight transition-colors",
        online
          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20"
          : "bg-red-500/10 border-red-500/30 text-red-300",
        className
      )}
    >
      {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
      <span>{online ? "Online" : "Offline"}</span>
      {pending > 0 && (
        <span className="flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
          {syncing ? <RefreshCw className="h-3 w-3 animate-spin" /> : <CloudUpload className="h-3 w-3" />}
          {pending}
        </span>
      )}
    </button>
  );
}
