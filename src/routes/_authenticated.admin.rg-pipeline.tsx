import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { db as offlineDb } from '@/lib/offline/db';
import { db as appDb } from '@/db/database';
import { reconcile, getReconcileConflicts, clearReconcileConflicts, type ReconcileConflict } from '@/lib/offline/reconciler';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/_authenticated/admin/rg-pipeline')({
  component: RGPipelinePage,
});

function RGPipelinePage() {
  const { user, isReady } = useAuth();
  const userId = isReady ? user?.id : undefined;

  const [server, setServer] = useState<number | null>(null);
  const [local, setLocal] = useState<number | null>(null);
  const [legacy, setLegacy] = useState<number | null>(null);
  const [conflicts, setConflicts] = useState<ReconcileConflict[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastReport, setLastReport] = useState<any>(null);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data: rows, error } = await (supabase as any)
        .from('boletins_rg').select('*').eq('agent_id', userId);
      if (error) throw error;
      setServer(rows?.length ?? 0);

      const all = await offlineDb.boletins_rg.toArray();
      setLocal(all.filter((r) => r.data?.agent_id === userId).length);
      setLegacy(await appDb.rg.count());
      setConflicts(await getReconcileConflicts());
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  const runReconcile = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data: rows } = await (supabase as any)
        .from('boletins_rg').select('*').eq('agent_id', userId);
      const report = await reconcile({
        module: 'rg',
        userId,
        serverRows: rows ?? [],
        localStore: offlineDb.boletins_rg,
        ownerKey: 'agent_id',
      });
      setLastReport(report);
      await refresh();
    } finally { setLoading(false); }
  };

  if (!isReady) return <div className="p-6">Carregando autenticação…</div>;
  if (!userId) return <div className="p-6">Necessário estar autenticado.</div>;

  const allMatch = server !== null && local !== null && server === local;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">RG Pipeline — Diagnóstico</h1>
      <p className="text-sm text-muted-foreground">userId: <code>{userId}</code></p>

      <div className="grid grid-cols-3 gap-4">
        <Card label="Servidor (boletins_rg)" value={server} />
        <Card label="Local (offlineDb)" value={local} />
        <Card label="Cache legado (AppDB.rg)" value={legacy} warn={(legacy ?? 0) > 0} />
      </div>

      <div className={`p-3 rounded text-sm ${allMatch ? 'bg-green-100 text-green-900' : 'bg-yellow-100 text-yellow-900'}`}>
        {allMatch ? '✓ Servidor = Local' : '⚠ Divergência detectada'}
      </div>

      <div className="flex gap-2">
        <Button onClick={refresh} disabled={loading} variant="outline">Atualizar</Button>
        <Button onClick={runReconcile} disabled={loading}>Reconciliar agora</Button>
        <Button onClick={async () => { await clearReconcileConflicts(); await refresh(); }} variant="ghost">
          Limpar conflitos
        </Button>
      </div>

      {lastReport && (
        <pre className="bg-slate-900 text-slate-100 p-3 rounded text-xs overflow-auto">
          {JSON.stringify(lastReport, null, 2)}
        </pre>
      )}

      <section>
        <h2 className="font-semibold mb-2">Conflitos registrados ({conflicts.length})</h2>
        {conflicts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum conflito.</p>
        ) : (
          <ul className="text-xs space-y-1 max-h-64 overflow-auto">
            {conflicts.slice(-50).reverse().map((c, i) => (
              <li key={i} className="border-b py-1">
                <code>{c.id}</code> — {c.reason} · local={c.localUpdatedAt} · server={c.serverUpdatedAt}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Card({ label, value, warn = false }: { label: string; value: number | null; warn?: boolean }) {
  return (
    <div className={`rounded border p-4 ${warn ? 'border-yellow-500 bg-yellow-50' : 'border-slate-200 bg-white'}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-3xl font-bold">{value ?? '—'}</div>
    </div>
  );
}
