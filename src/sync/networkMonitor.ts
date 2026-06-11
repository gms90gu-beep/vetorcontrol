/**
 * networkMonitor.ts
 * Monitora conectividade e dispara sync automaticamente.
 */

import { processQueue, pullFromServer } from '../sync/syncEngine';
import { syncSessionInBackground, getLocalSession } from '../auth/auth';

type ConnectivityListener = (online: boolean) => void;

let _isOnline = navigator.onLine;
const listeners = new Set<ConnectivityListener>();

export function isOnline(): boolean {
  return _isOnline;
}

export function onConnectivityChange(cb: ConnectivityListener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notify(online: boolean): void {
  if (online === _isOnline) return;
  _isOnline = online;
  listeners.forEach((cb) => cb(online));
}

const HEARTBEAT_URL = 'https://www.gstatic.com/generate_204';
const HEARTBEAT_INTERVAL = 30_000;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

async function checkHeartbeat(): Promise<boolean> {
  try {
    const res = await fetch(HEARTBEAT_URL, {
      method: 'HEAD',
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
    return res.ok || res.status === 204;
  } catch {
    return false;
  }
}

async function onCameOnline(): Promise<void> {
  console.log('[Network] Online — iniciando sync...');
  syncSessionInBackground().catch(() => {});
  await processQueue();
  const session = await getLocalSession();
  if (session?.userId) {
    await pullFromServer(session.userId);
  }
}

export function initNetworkMonitor(): void {
  window.addEventListener('online', async () => {
    const real = await checkHeartbeat();
    notify(real);
    if (real) onCameOnline();
  });

  window.addEventListener('offline', () => {
    notify(false);
  });

  heartbeatTimer = setInterval(async () => {
    const real = await checkHeartbeat();
    const wasOffline = !_isOnline;
    notify(real);
    if (real && wasOffline) onCameOnline();
  }, HEARTBEAT_INTERVAL);

  checkHeartbeat().then((real) => {
    notify(real);
    if (real) onCameOnline();
  });
}

export function destroyNetworkMonitor(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}
