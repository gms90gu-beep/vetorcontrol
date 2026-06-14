import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, ShieldAlert, Database, Activity, AlertTriangle } from "lucide-react";
import { getAuditSnapshot } from "@/lib/audit.functions";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";

export const Route = createFileRoute("/_authenticated/admin/auditoria")({
  component: AuditPage,
});

function AuditPage() {
  const router = useRouter();
  const { role, isLoading } = useAuth();
  const fetchSnapshot = useServerFn(getAuditSnapshot);

  useEffect(() => {
    if (!isLoading && role !== "admin_master") router.navigate({ to: "/dashboard" });
  }, [role, isLoading, router]);

  const { data, isFetching, refetch, error } = useQuery({
    queryKey: ["audit-snapshot"],
    queryFn: () => fetchSnapshot(),
    enabled: role === "admin_master",
    refetchOnWindowFocus: false,
  });

  if (role !== "admin_master") return null;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-primary" />
            Auditoria do Sistema
          </h1>
          <p className="text-sm text-muted-foreground">
            Visão consolidada de RG, Trabalho de Campo e Consistência.
          </p>
        </div>
        <Button onClick={() => refetch()} disabled={isFetching} variant="outline" size="sm">
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-destructive text-sm">
            {(error as Error).message}
          </CardContent>
        </Card>
      )}

      {!data && isFetching && (
        <p className="text-sm text-muted-foreground">Carregando snapshot…</p>
      )}

      {data && (
        <>
          <Section title="RG (Registro Geral)" icon={<Database className="h-4 w-4" />}>
            <Stat label="Boletins RG" value={data.rg.boletins} />
            <Stat label="Quarteirões" value={data.rg.blocks} />
            <Stat label="Imóveis cadastrados" value={data.rg.properties} />
          </Section>

          <Section title="Trabalho de Campo" icon={<Activity className="h-4 w-4" />}>
            <Stat label="Imóveis trabalhados (Σ)" value={data.trabalho.properties_worked} />
            <Stat label="Imóveis fechados (Σ)" value={data.trabalho.properties_closed} />
            <Stat label="Visitas registradas" value={data.trabalho.visits} />
            <Stat label="Boletins diários" value={data.trabalho.daily_records} />
          </Section>

          <Section
            title="Consistência"
            icon={<AlertTriangle className="h-4 w-4 text-amber-600" />}
            warn
          >
            <Stat label="Quarteirões sem imóveis" value={data.consistencia.blocks_sem_imoveis} />
            <Stat
              label="Imóveis sem quarteirão"
              value={data.consistencia.imoveis_sem_quarteirao}
            />
            <Stat label="Visitas sem imóvel" value={data.consistencia.visitas_sem_imovel} />
            <Stat
              label="Boletins reconciliados (integridade)"
              value={data.consistencia.boletins_reconciliados}
            />
          </Section>
        </>
      )}
    </div>
  );
}

function Section({
  title,
  icon,
  children,
  warn,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  warn?: boolean;
}) {
  return (
    <Card className={warn ? "border-amber-300/50" : ""}>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">{children}</CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold">{value.toLocaleString("pt-BR")}</p>
    </div>
  );
}
