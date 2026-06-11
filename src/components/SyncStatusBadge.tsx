import { useSyncStatus } from '@/hooks/useOfflineData';
import { isOnline } from '@/sync/networkMonitor';
import { processQueue } from '@/sync/syncEngine';

export function SyncStatusBadge() {
  const { hasPending, pendingCount, errorCount, isSyncing } = useSyncStatus();

  if (!hasPending && errorCount === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: '16px',
        right: '16px',
        zIndex: 9998,
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        alignItems: 'flex-end',
      }}
    >
      {hasPending && (
        <Badge color="#3b82f6">
          {isSyncing ? '⟳ Sincronizando...' : `⏳ ${pendingCount} pendente${pendingCount > 1 ? 's' : ''}`}
        </Badge>
      )}
      {errorCount > 0 && (
        <Badge color="#ef4444">
          <span>⚠️ {errorCount} erro{errorCount > 1 ? 's' : ''} de sync</span>
          <button
            onClick={() => isOnline() && processQueue()}
            style={{
              marginLeft: '8px',
              background: 'none',
              border: '1px solid rgba(255,255,255,0.5)',
              borderRadius: '4px',
              color: 'white',
              cursor: 'pointer',
              fontSize: '11px',
              padding: '1px 6px',
            }}
          >
            Tentar novamente
          </button>
        </Badge>
      )}
    </div>
  );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div style={{
      backgroundColor: color,
      color: 'white',
      borderRadius: '8px',
      padding: '6px 12px',
      fontSize: '12px',
      fontWeight: 500,
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
    }}>
      {children}
    </div>
  );
}
