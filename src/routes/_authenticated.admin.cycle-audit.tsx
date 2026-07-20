import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { listRemoteOrCache } from "@/lib/offline/repos";
import { safeFetch, isOnline } from "@/lib/offline/safe-fetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import { requireAdminMasterGuard } from "@/lib/role-guards";
import { getOperationalDate } from "@/lib/operational-date";

export const Route = createFileRoute("/_authenticated/admin/cycle-audit")({
  beforeLoad: requireAdminMasterGuard,
  component: CycleAuditPage,
});

type Cycle = {
  id: string;
  name: string | null;
  number: number | null;
  year: number | null;
  start_date: string;
  end_date: string;
  status: string;
};

function CycleAuditPage() {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const today = getOperationalDate();

  async function load() {
    setLoading(true);
    const data = await listRemoteOrCache<Cycle>({
      name: "cycles",
      remote: async () => await supabase
        .from("cycles")
        .select("id,name,number,year,start_date,end_date,status")
        .order("year", { ascending: false })
        .order("number", { ascending: true }),
    });
    setCycles((data as Cycle[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const byDate = cycles.find((c) => c.start_date <= today && c.end_date >= today) || null;
  const byStatus = cycles.find((c) => c.status === "in_progress") || null;
  const divergent = (byDate?.id ?? null) !== (byStatus?.id ?? null);
  const multipleInProgress = cycles.filter((c) => c.status === "in_progress").length > 1;

  async function runSync() {
    if (!isOnline()) {
      toast.error("Operação requer conexão");
      return;
    }
    setSyncing(true);
    const result = await safeFetch(
      async () => {
        const { data, error } = await supabase.rpc("sync_cycle_statuses");
        if (error) throw error;
        return data;
      },
      async () => null,
      { label: "sync_cycle_statuses" },
    );
    setSyncing(false);
    if (result == null) {
      toast.error("Sincronização indisponível");
      return;
    }
    toast.success(`Sincronizado: ${JSON.stringify(result)}`);
    load();
  }

  return (
    <div className="space-y-6 p-4 pb-24">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Auditoria de Ciclos</h1>
        <p className="text-sm text-muted-foreground">Data de referência: {today}</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-widest">Ciclo ativo POR DATA</CardTitle>
          </CardHeader>
          <CardContent>
            {byDate ? (
              <>
                <p className="text-xl font-bold">{byDate.name}</p>
                <p className="text-xs text-muted-foreground">
                  {byDate.start_date} → {byDate.end_date}
                </p>
                <Badge className="mt-2">{byDate.status}</Badge>
              </>
            ) : (
              <p className="text-muted-foreground">Nenhum ciclo cobre a data atual.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-widest">Ciclo ativo POR STATUS</CardTitle>
          </CardHeader>
          <CardContent>
            {byStatus ? (
              <>
                <p className="text-xl font-bold">{byStatus.name}</p>
                <p className="text-xs text-muted-foreground">
                  {byStatus.start_date} → {byStatus.end_date}
                </p>
                <Badge variant="secondary" className="mt-2">{byStatus.status}</Badge>
              </>
            ) : (
              <p className="text-muted-foreground">Nenhum ciclo com status in_progress.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className={divergent ? "border-amber-500" : "border-emerald-500"}>
        <CardContent className="flex items-center justify-between gap-3 py-4">
          <div className="flex items-center gap-3">
            {divergent ? (
              <AlertTriangle className="h-6 w-6 text-amber-500" />
            ) : (
              <CheckCircle2 className="h-6 w-6 text-emerald-500" />
            )}
            <div>
              <p className="font-bold">
                {divergent ? "⚠ Divergência detectada" : "✓ Sem divergência"}
              </p>
              <p className="text-xs text-muted-foreground">
                {multipleInProgress
                  ? "⚠ Mais de um ciclo com status='in_progress'."
                  : "Apenas um ciclo está marcado como em andamento."}
              </p>
            </div>
          </div>
          <Button onClick={runSync} disabled={syncing} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            Sincronizar agora
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-widest">Todos os ciclos</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p>Carregando...</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2">Ciclo</th>
                  <th>Início</th>
                  <th>Fim</th>
                  <th>Status</th>
                  <th>Cobre hoje?</th>
                </tr>
              </thead>
              <tbody>
                {cycles.map((c) => {
                  const covers = c.start_date <= today && c.end_date >= today;
                  return (
                    <tr key={c.id} className="border-t">
                      <td className="py-2 font-medium">{c.name}</td>
                      <td>{c.start_date}</td>
                      <td>{c.end_date}</td>
                      <td>
                        <Badge variant={c.status === "in_progress" ? "default" : "secondary"}>
                          {c.status}
                        </Badge>
                      </td>
                      <td>{covers ? "✓" : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
