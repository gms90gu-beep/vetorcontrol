import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { db as offlineDb } from '@/lib/offline/db';
import { db as appDb } from '@/db/database';
import {
  reconcile,
  getReconcileConflicts,
  clearReconcileConflicts,
  type ReconcileConflict,
} from '@/lib/offline/reconciler';
import {
  cleanupGhosts,
  getLastCleanupReport,
  type GhostReport,
} from '@/lib/offline/cleanup-ghosts';
import { auditTerritory, type TerritoryRow } from '@/lib/audit/territory';
import { OPERATIONAL_AGENTS } from '@/lib/audit/operational-agents';
import {
  runHomologation,
  getLastHomologationReport,
  type HomologationReport,
} from '@/lib/audit/homologation';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { requireAdminMasterGuard } from "@/lib/role-guards";

export const Route = createFileRoute('/_authenticated/admin/rg-pipeline')({
  beforeLoad: requireAdminMasterGuard,
  component: RGPipelinePage,
});

type ServerRow = { id: string; agent_id: string; block_id: string | null; updated_at: string };

interface Snapshot {
  server: ServerRow[];
  local: { id: string; agent_id: string; block_id: string | null; updated_at?: string }[];
  legacy: number;
  legacySample: any[];
}

function RGPipelinePage() {
  const { user, isReady } = useAuth();
  const userId = isReady ? user?.id : undefined;

  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [conflicts, setConflicts] = useState<ReconcileConflict[]>([]);
  const [lastCleanup, setLastCleanup] = useState<GhostReport | null>(null);
  const [territory, setTerritory] = useState<TerritoryRow[] | null>(null);
  const [opSnapshot, setOpSnapshot] = useState<
    { id: string; name: string; server: number; offline: number; render: number; ok: boolean }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [lastReport, setLastReport] = useState<any>(null);
  const [homolog, setHomolog] = useState<HomologationReport | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data: rows } = await (supabase as any)
        .from('boletins_rg').select('id,agent_id,block_id,updated_at').eq('agent_id', userId);
      const all = await offlineDb.boletins_rg.toArray();
      const local = all
        .filter((r) => r.data?.agent_id === userId)
        .map((r) => ({
          id: r.id,
          agent_id: r.data.agent_id,
          block_id: r.data.block_id ?? null,
          updated_at: r.updatedAt,
        }));
      const legacy = await appDb.rg.count();
      const legacySample = legacy > 0 ? await appDb.rg.limit(5).toArray() : [];
      setSnap({ server: (rows ?? []) as ServerRow[], local, legacy, legacySample });
      setConflicts(await getReconcileConflicts());
      setLastCleanup(await getLastCleanupReport());
      setHomolog(await getLastHomologationReport());
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
        module: 'rg', userId,
        serverRows: rows ?? [],
        localStore: offlineDb.boletins_rg,
        ownerKey: 'agent_id',
      });
      setLastReport(report);
      await refresh();
    } finally { setLoading(false); }
  };

  const runCleanup = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const rep = await cleanupGhosts(userId);
      setLastReport(rep);
      await refresh();
    } finally { setLoading(false); }
  };

  const runAuditTerritory = async () => {
    if (!userId) return;
    setLoading(true);
    try { setTerritory(await auditTerritory(userId)); }
    finally { setLoading(false); }
  };

  const runOperationalSnapshot = async () => {
    setLoading(true);
    try {
      const results = await Promise.all(
        OPERATIONAL_AGENTS.map(async (a) => {
          const { data: srv } = await (supabase as any)
            .from('boletins_rg').select('id').eq('agent_id', a.id);
          const all = await offlineDb.boletins_rg.toArray();
          const local = all.filter((r) => r.data?.agent_id === a.id);
          const server = srv?.length ?? 0;
          const offline = local.length;
          const render = local.length;
          return { id: a.id, name: a.name, server, offline, render, ok: server === offline && offline === render };
        }),
      );
      setOpSnapshot(results);
    } finally { setLoading(false); }
  };

  const runHomolog = async () => {
    if (!userId) return;
    setLoading(true);
    try { setHomolog(await runHomologation(userId)); }
    finally { setLoading(false); }
  };

  if (!isReady) return <div className="p-6">Carregando autenticação…</div>;
  if (!userId) return <div className="p-6">Necessário estar autenticado.</div>;

  const serverCount = snap?.server.length ?? 0;
  const localCount = snap?.local.length ?? 0;
  const legacy = snap?.legacy ?? 0;
  const allMatch = snap !== null && serverCount === localCount && legacy === 0;

  // Group by agente
  const byAgent = new Map<string, { server: number; local: number }>();
  for (const r of snap?.server ?? []) {
    const e = byAgent.get(r.agent_id) ?? { server: 0, local: 0 };
    e.server++; byAgent.set(r.agent_id, e);
  }
  for (const r of snap?.local ?? []) {
    const e = byAgent.get(r.agent_id) ?? { server: 0, local: 0 };
    e.local++; byAgent.set(r.agent_id, e);
  }

  // Group by quarteirão (block_id)
  const byBlock = new Map<string, { server: number; local: number }>();
  for (const r of snap?.server ?? []) {
    const k = r.block_id ?? '∅';
    const e = byBlock.get(k) ?? { server: 0, local: 0 };
    e.server++; byBlock.set(k, e);
  }
  for (const r of snap?.local ?? []) {
    const k = r.block_id ?? '∅';
    const e = byBlock.get(k) ?? { server: 0, local: 0 };
    e.local++; byBlock.set(k, e);
  }

  // Por boletim — união de IDs
  const allIds = Array.from(new Set([
    ...(snap?.server ?? []).map((r) => r.id),
    ...(snap?.local ?? []).map((r) => r.id),
  ]));
  const serverIds = new Set((snap?.server ?? []).map((r) => r.id));
  const localIds = new Set((snap?.local ?? []).map((r) => r.id));

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">RG Pipeline — Diagnóstico</h1>
        <p className="text-sm text-muted-foreground">userId: <code>{userId}</code></p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Stat label="Servidor" value={serverCount} />
        <Stat label="Cache oficial" value={localCount} />
        <Stat label="Renderizados" value={localCount} />
        <Stat label="Cache legado" value={legacy} warn={legacy > 0} />
      </div>

      <div className={`p-3 rounded text-sm ${allMatch ? 'bg-green-100 text-green-900' : 'bg-yellow-100 text-yellow-900'}`}>
        {allMatch ? '✓ Servidor = Cache = Tela' : '⚠ Divergência detectada'}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={refresh} disabled={loading} variant="outline">Atualizar</Button>
        <Button onClick={runReconcile} disabled={loading}>Reconciliar agora</Button>
        <Button onClick={runCleanup} disabled={loading} variant="destructive">Executar limpeza (Fase E)</Button>
        <Button onClick={async () => { await clearReconcileConflicts(); await refresh(); }} variant="ghost">
          Limpar conflitos
        </Button>
      </div>

      <Tabs defaultValue="boletim">
        <TabsList>
          <TabsTrigger value="boletim">Por boletim</TabsTrigger>
          <TabsTrigger value="agente">Por agente</TabsTrigger>
          <TabsTrigger value="quarteirao">Por quarteirão</TabsTrigger>
          <TabsTrigger value="territorial">Auditoria territorial</TabsTrigger>
          <TabsTrigger value="snapshot">Snapshot operacional</TabsTrigger>
          <TabsTrigger value="conflitos">Conflitos ({conflicts.length})</TabsTrigger>
          <TabsTrigger value="limpeza">Limpeza</TabsTrigger>
          <TabsTrigger value="homologacao">Homologação</TabsTrigger>
        </TabsList>

        <TabsContent value="boletim">
          <Table>
            <TableHeader>
              <TableRow><TableHead>ID</TableHead><TableHead>Servidor</TableHead><TableHead>Local</TableHead><TableHead>Render</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {allIds.map((id) => {
                const s = serverIds.has(id), l = localIds.has(id);
                const bad = s !== l;
                return (
                  <TableRow key={id} className={bad ? 'bg-yellow-50' : ''}>
                    <TableCell className="font-mono text-xs">{id}</TableCell>
                    <TableCell>{s ? '✓' : '—'}</TableCell>
                    <TableCell>{l ? '✓' : '—'}</TableCell>
                    <TableCell>{l ? '✓' : '—'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="agente">
          <Table>
            <TableHeader><TableRow><TableHead>agent_id</TableHead><TableHead>Servidor</TableHead><TableHead>Local</TableHead></TableRow></TableHeader>
            <TableBody>
              {[...byAgent.entries()].map(([aid, c]) => (
                <TableRow key={aid} className={c.server !== c.local ? 'bg-yellow-50' : ''}>
                  <TableCell className="font-mono text-xs">{aid}</TableCell>
                  <TableCell>{c.server}</TableCell>
                  <TableCell>{c.local}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="quarteirao">
          <Table>
            <TableHeader><TableRow><TableHead>block_id</TableHead><TableHead>Servidor</TableHead><TableHead>Local</TableHead></TableRow></TableHeader>
            <TableBody>
              {[...byBlock.entries()].map(([bid, c]) => (
                <TableRow key={bid} className={c.server !== c.local ? 'bg-yellow-50' : ''}>
                  <TableCell className="font-mono text-xs">{bid}</TableCell>
                  <TableCell>{c.server}</TableCell>
                  <TableCell>{c.local}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="territorial" className="space-y-3">
          <Button onClick={runAuditTerritory} disabled={loading}>Executar auditoria</Button>
          {territory && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>block_id</TableHead><TableHead>Server</TableHead>
                  <TableHead>Properties</TableHead><TableHead>Local</TableHead><TableHead>Render</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {territory.map((t) => (
                  <TableRow key={t.block_id} className={t.ok ? '' : 'bg-red-50'}>
                    <TableCell className="font-mono text-xs">{t.block_id}</TableCell>
                    <TableCell>{t.inServer ? '✓' : '✗'}</TableCell>
                    <TableCell>{t.inProperties ? '✓' : '✗'}</TableCell>
                    <TableCell>{t.inLocal ? '✓' : '✗'}</TableCell>
                    <TableCell>{t.renderedCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="snapshot" className="space-y-3">
          <Button onClick={runOperationalSnapshot} disabled={loading}>Rodar snapshot</Button>
          {opSnapshot.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agente</TableHead><TableHead>Servidor</TableHead>
                  <TableHead>Offline</TableHead><TableHead>Render</TableHead><TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {opSnapshot.map((r) => (
                  <TableRow key={r.id} className={r.ok ? 'bg-green-50' : 'bg-yellow-50'}>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>{r.server}</TableCell>
                    <TableCell>{r.offline}</TableCell>
                    <TableCell>{r.render}</TableCell>
                    <TableCell>{r.ok ? '✓' : '⚠'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="conflitos">
          {conflicts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum conflito.</p>
          ) : (
            <ul className="text-xs space-y-1 max-h-96 overflow-auto">
              {conflicts.slice(-100).reverse().map((c, i) => (
                <li key={i} className="border-b py-1">
                  <code>{c.id}</code> — {c.reason} · local={c.localUpdatedAt} · server={c.serverUpdatedAt}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="limpeza">
          {lastCleanup ? (
            <pre className="bg-slate-900 text-slate-100 p-3 rounded text-xs overflow-auto">
              {JSON.stringify(lastCleanup, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma limpeza registrada ainda.</p>
          )}
          {(snap?.legacySample.length ?? 0) > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium mb-1">Amostra cache legado:</p>
              <pre className="bg-slate-900 text-slate-100 p-3 rounded text-xs overflow-auto">
                {JSON.stringify(snap?.legacySample, null, 2)}
              </pre>
            </div>
          )}
        </TabsContent>

        <TabsContent value="homologacao" className="space-y-3">
          <div className="flex gap-2 items-center">
            <Button onClick={runHomolog} disabled={loading}>Executar suite de homologação</Button>
            {homolog && (
              <span className={`px-2 py-1 rounded text-xs font-semibold ${homolog.approved ? 'bg-green-200 text-green-900' : 'bg-red-200 text-red-900'}`}>
                {homolog.approved ? '✓ APROVADO' : '⚠ REPROVADO'}
              </span>
            )}
          </div>
          {homolog && (
            <Table>
              <TableHeader>
                <TableRow><TableHead>Teste</TableHead><TableHead>Nome</TableHead><TableHead>Status</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {homolog.results.map((r) => (
                  <TableRow key={r.id} className={r.pass ? '' : 'bg-red-50'}>
                    <TableCell className="font-mono text-xs">{r.id}</TableCell>
                    <TableCell className="text-sm">{r.name}</TableCell>
                    <TableCell>{r.pass ? '✓' : '✗'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {homolog && (
            <pre className="bg-slate-900 text-slate-100 p-3 rounded text-xs overflow-auto max-h-96">
              {JSON.stringify(homolog, null, 2)}
            </pre>
          )}
          <div className="text-xs text-muted-foreground border-t pt-2">
            <p className="font-semibold">Testes manuais (não automáticos):</p>
            <p>T4 — Offline real: abrir RG/Trabalho/Pendências, desligar internet, fechar e reabrir o app.</p>
            <p>T7 — Criar boletim novo (Localidade Teste / Quarteirão 99) e validar em RG, Trabalho, offline e após sync.</p>
          </div>
        </TabsContent>
      </Tabs>

      {lastReport && (
        <pre className="bg-slate-900 text-slate-100 p-3 rounded text-xs overflow-auto">
          {JSON.stringify(lastReport, null, 2)}
        </pre>
      )}
    </div>
  );
}

function Stat({ label, value, warn = false }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={`rounded border p-4 ${warn ? 'border-yellow-500 bg-yellow-50' : 'border-slate-200 bg-white'}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-3xl font-bold">{value}</div>
    </div>
  );
}
