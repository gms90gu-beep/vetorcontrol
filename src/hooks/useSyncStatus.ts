import { useEffect, useState } from "react";
import { db } from "@/lib/offline/db";
import { getLastSyncAt, isSyncing, onSyncChange, pendingByTable } from "@/lib/offline/sync";
import { useOnlineStatus } from "./useOnlineStatus";

export type ConnState = "online" | "offline" | "syncing" | "synced";

export function useSyncStatus() {
  const online = useOnlineStatus();
  const [pending, setPending] = useState(0);
  const [byTable, setByTable] = useState<Record<string, number>>({});
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(getLastSyncAt());

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const [n, byT] = await Promise.all([db.mutations.count(), pendingByTable()]);
      if (!active) return;
      setPending(n);
      setByTable(byT);
      setSyncing(isSyncing());
      setLastSync(getLastSyncAt());
    };
    refresh();
    const off = onSyncChange(refresh);
    const t = setInterval(refresh, 4000);
    return () => { active = false; off(); clearInterval(t); };
  }, []);

  let state: ConnState;
  if (!online) state = "offline";
  else if (syncing) state = "syncing";
  else if (pending > 0) state = "online";
  else state = "synced";

  return { state, online, syncing, pending, byTable, lastSync };
}
