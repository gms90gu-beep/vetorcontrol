import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { runRbacAudit, type RBACAuditResult } from "@/lib/rbac-audit.functions";
import { supabase } from "@/integrations/supabase/client";
import { getCachedUserRole } from "@/lib/offline/role-cache";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ShieldCheck, AlertTriangle, Download, RefreshCw } from "lucide-react";
import { generateInstitutionalPDF, downloadCSV, downloadXLSX } from "@/lib/institutional-export";
import { requireAdminMasterGuard } from "@/lib/role-guards";

export const Route = createFileRoute("/_authenticated/admin/rbac-audit")({
  beforeLoad: requireAdminMasterGuard,
  component: RbacAuditPage,
});

function statusColor(s: string) {
  if (s === "ok" || s === "pass" || s === "healthy") return "bg-emerald-500/10 text-emerald-600 border-emerald-500/30";
  if (s === "warning") return "bg-amber-500/10 text-amber-700 border-amber-500/30";
  return "bg-rose-500/10 text-rose-700 border-rose-500/30";
}

function RbacAuditPage() {
  const run = useServerFn(runRbacAudit);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<RBACAuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { setAllowed(false); return; }
      const r = await getCachedUserRole(u.user.id);
      setAllowed(r === "admin_master" || u.user.email === "gms90gu@gmail.com");
    })();
  }, []);

  const execute = async () => {
    setLoading(true); setError(null);
    try { setData(await run({})); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (allowed) execute(); }, [allowed]);

  if (allowed === false) {
    return <div className="p-8 text-center text-muted-foreground">Acesso restrito ao Admin Master.</div>;
  }
  if (allowed === null) return <div className="p-8 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Validando…</div>;

  const exportPDF = () => {
    if (!data) return;
    generateInstitutionalPDF(
      `rbac-audit-${Date.now()}.pdf`,
      { title: "Auditoria RBAC — VetorControl", subtitle: `Score ${data.score}% · ${data.health.toUpperCase()}`, issuedBy: "Admin Master" },
      [
        { title: "Identificadores", head: ["Tabela", "Campo", "Identificador", "Status"], body: data.identifiers.map((i) => [i.table, i.field, i.identifier_used, i.status]) },
        { title: "Relacionamentos", head: ["Relação", "Total", "Órfãos", "Status"], body: data.relationships.map((r) => [r.table, r.total, r.orphans, r.status]) },
        { title: "RBAC por Perfil", head: ["Perfil", "Usuário", "Módulo", "Esperado", "Obtido", "Diff"], body: data.rbacByRole.map((r) => [r.role, r.user_name || "—", r.module, r.expected, r.obtained, r.diff]) },
        { title: "Cross-check", head: ["Escopo", "Módulo A", "Valor A", "Módulo B", "Valor B", "Diff"], body: data.crossCheck.map((c) => [c.scope, c.module_a, c.value_a, c.module_b, c.value_b, c.diff]) },
        { title: "Consultas", head: ["Nome", "Arquivo", "Padrão", "Chave RBAC", "Status"], body: data.queries.map((q) => [q.name, q.file, q.pattern, q.rbac_key, q.status]) },
        { title: "Testes Automáticos", head: ["ID", "Teste", "Status"], body: data.tests.map((t) => [t.id, t.name, t.status]) },
      ],
    );
  };

  const exportCSV = () => {
    if (!data) return;
    downloadCSV(`rbac-rbac-by-role-${Date.now()}.csv`, ["role","user","module","expected","obtained","diff"],
      data.rbacByRole.map((r) => [r.role, r.user_name || "", r.module, r.expected, r.obtained, r.diff]));
  };
  const exportXLSX = () => {
    if (!data) return;
    downloadXLSX(`rbac-audit-${Date.now()}`, "RBAC", ["role","user","module","expected","obtained","diff","status"],
      data.rbacByRole.map((r) => [r.role, r.user_name || "", r.module, r.expected, r.obtained, r.diff, r.status]));
  };
  const exportLogs = () => {
    if (!data) return;
    const blob = new Blob([data.logs.join("\n")], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `rbac-audit-logs-${Date.now()}.txt`; a.click();
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-primary" /> Auditoria RBAC</h1>
          <p className="text-sm text-muted-foreground">Diagnóstico read-only do controle de acesso (profiles.id)</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={execute} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Reexecutar
          </Button>
          <Button variant="outline" onClick={exportPDF} disabled={!data}><Download className="h-4 w-4 mr-2" />PDF</Button>
          <Button variant="outline" onClick={exportXLSX} disabled={!data}><Download className="h-4 w-4 mr-2" />XLSX</Button>
          <Button variant="outline" onClick={exportCSV} disabled={!data}><Download className="h-4 w-4 mr-2" />CSV</Button>
        </div>
      </div>

      {error && <Card className="border-rose-500/30"><CardContent className="p-4 text-rose-700 flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{error}</CardContent></Card>}

      {loading && !data && <div className="flex items-center gap-2 p-8"><Loader2 className="h-5 w-5 animate-spin" />Executando auditoria…</div>}

      {data && (
        <>
          {/* Dashboard */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <KpiCard label="Saúde RBAC" value={`${data.score}%`} variant={data.health} />
            <KpiCard label="Usuários" value={data.kpis.users_audited} />
            <KpiCard label="Consultas" value={data.kpis.queries_analyzed} />
            <KpiCard label="Inconsistências" value={data.kpis.inconsistencies} variant={data.kpis.inconsistencies > 0 ? "critical" : "healthy"} />
            <KpiCard label="FKs inválidas" value={data.kpis.invalid_fks} variant={data.kpis.invalid_fks > 0 ? "critical" : "healthy"} />
            <KpiCard label="Escopos divergentes" value={data.kpis.scope_divergences} variant={data.kpis.scope_divergences > 0 ? "warning" : "healthy"} />
            <KpiCard label="Última auditoria" value={new Date(data.kpis.last_audit).toLocaleTimeString("pt-BR")} />
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Score RBAC</CardTitle></CardHeader>
            <CardContent>
              <Progress value={data.score} indicatorClassName={data.health === "healthy" ? "bg-emerald-500" : data.health === "warning" ? "bg-amber-500" : "bg-rose-500"} />
              <p className="mt-1 text-xs text-muted-foreground">{data.score}% · {data.health.toUpperCase()}</p>
            </CardContent>
          </Card>

          <Tabs defaultValue="ids" className="w-full">
            <TabsList className="flex flex-wrap h-auto">
              <TabsTrigger value="ids">Identificadores</TabsTrigger>
              <TabsTrigger value="rel">Relacionamentos</TabsTrigger>
              <TabsTrigger value="rbac">RBAC</TabsTrigger>
              <TabsTrigger value="cross">Cross-check</TabsTrigger>
              <TabsTrigger value="queries">Consultas</TabsTrigger>
              <TabsTrigger value="tests">Testes</TabsTrigger>
              <TabsTrigger value="logs">Logs</TabsTrigger>
            </TabsList>

            <TabsContent value="ids">
              <SimpleTable head={["Tabela","Campo","Tipo","Identificador","Status","Nota"]} rows={data.identifiers.map((i)=>[i.table,i.field,i.type,i.identifier_used,<Badge key="b" variant="outline" className={statusColor(i.status)}>{i.status}</Badge>,i.note||"—"])} />
            </TabsContent>
            <TabsContent value="rel">
              <SimpleTable head={["Relação","Total","Órfãos","Status","Nota"]} rows={data.relationships.map((r)=>[r.table,r.total,r.orphans,<Badge key="b" variant="outline" className={statusColor(r.status)}>{r.status}</Badge>,r.note||"—"])} />
            </TabsContent>
            <TabsContent value="rbac">
              <SimpleTable head={["Perfil","Usuário","Módulo","Esperado","Obtido","Diff","Status"]} rows={data.rbacByRole.map((r)=>[r.role,r.user_name||"—",r.module,r.expected,r.obtained,r.diff,<Badge key="b" variant="outline" className={statusColor(r.status)}>{r.status}</Badge>])} />
            </TabsContent>
            <TabsContent value="cross">
              <SimpleTable head={["Escopo","Módulo A","Valor A","Módulo B","Valor B","Diff","Status"]} rows={data.crossCheck.map((c)=>[c.scope,c.module_a,c.value_a,c.module_b,c.value_b,c.diff,<Badge key="b" variant="outline" className={statusColor(c.status)}>{c.status}</Badge>])} />
            </TabsContent>
            <TabsContent value="queries">
              <SimpleTable head={["Nome","Arquivo","Padrão","Chave RBAC","Status","Nota"]} rows={data.queries.map((q)=>[q.name,q.file,<code key="c" className="text-xs">{q.pattern}</code>,q.rbac_key,<Badge key="b" variant="outline" className={statusColor(q.status)}>{q.status}</Badge>,q.note||"—"])} />
            </TabsContent>
            <TabsContent value="tests">
              <SimpleTable head={["ID","Teste","Status","Detalhe"]} rows={data.tests.map((t)=>[t.id,t.name,<Badge key="b" variant="outline" className={statusColor(t.status)}>{t.status}</Badge>,t.detail||"—"])} />
            </TabsContent>
            <TabsContent value="logs">
              <Card>
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm">Logs ({data.logs.length})</CardTitle>
                  <Button size="sm" variant="outline" onClick={exportLogs}><Download className="h-3 w-3 mr-1" />Baixar</Button>
                </CardHeader>
                <CardContent>
                  <pre className="text-xs bg-muted p-3 rounded max-h-[400px] overflow-auto whitespace-pre-wrap">{data.logs.join("\n")}</pre>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function KpiCard({ label, value, variant }: { label: string; value: any; variant?: "healthy" | "warning" | "critical" }) {
  const cls = variant === "critical" ? "border-rose-500/30 bg-rose-500/5"
    : variant === "warning" ? "border-amber-500/30 bg-amber-500/5"
    : variant === "healthy" ? "border-emerald-500/30 bg-emerald-500/5" : "";
  return (
    <Card className={cls}>
      <CardContent className="p-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-lg font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function SimpleTable({ head, rows }: { head: string[]; rows: any[][] }) {
  return (
    <Card>
      <CardContent className="p-0 overflow-auto">
        <Table>
          <TableHeader><TableRow>{head.map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i}>{r.map((c, j) => <TableCell key={j} className="text-xs">{c as any}</TableCell>)}</TableRow>
            ))}
            {rows.length === 0 && <TableRow><TableCell colSpan={head.length} className="text-center text-muted-foreground py-6">Sem dados.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
