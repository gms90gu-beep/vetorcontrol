import { useEffect, useState } from "react";
import { db } from "@/lib/offline/db";
import { getLastSyncAt, isSyncing, onSyncChange, pendingByTable, listFailedMutations } from "@/lib/offline/sync";
import { useOnlineStatus } from "./useOnlineStatus";

export type ConnState = "online" | "offline" | "syncing" | "synced" | "error";

export function useSyncStatus() {
  const online = useOnlineStatus();
  const [pending, setPending] = useState(0);
  const [byTable, setByTable] = useState<Record<string, number>>({});
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(getLastSyncAt());
  const [failedCount, setFailedCount] = useState(0);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const [n, byT, failed] = await Promise.all([
        db.mutations.count(),
        pendingByTable(),
        listFailedMutations(),
      ]);
      if (!active) return;
      setPending(n);
      setByTable(byT);
      setSyncing(isSyncing());
      setLastSync(getLastSyncAt());
      setFailedCount(failed.length);
    };
    refresh();
    const off = onSyncChange(refresh);
    const t = setInterval(refresh, 4000);
    return () => { active = false; off(); clearInterval(t); };
  }, []);

  // Prioridade: offline explica por que nada sincroniza; erro definitivo (mutações
  // que esgotaram as tentativas) precisa de ação do usuário e não deve se disfarçar
  // de "pendente normal" (que se resolve sozinho).
  let state: ConnState;
  if (!online) state = "offline";
  else if (failedCount > 0) state = "error";
  else if (syncing) state = "syncing";
  else if (pending > 0) state = "online";
  else state = "synced";

  return { state, online, syncing, pending, byTable, lastSync, failedCount };
}
