import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  FileText,
  Calendar,
  TrendingUp,
  BarChart3,
  Users,
  MapPin,
  ClipboardList,
  FileSpreadsheet,
  RotateCw,
} from "lucide-react";
import { logDirectSource } from "@/lib/operational-metrics";
logDirectSource({ module: "routes/relatorios", file: "src/routes/_authenticated.relatorios.tsx", source: "daily_work_records", note: "tela relatórios — usar getDashboardMetrics após refator" });
import { useOperationalDate } from "@/hooks/useOperationalDate";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { AgentReportsSimple } from "@/components/agent/AgentReportsSimple";
import { useServerFn } from "@tanstack/react-start";
import { rebuildDailyRecords } from "@/lib/reports-reconcile.functions";
import { getOperationalDate } from "@/lib/operational-date";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/relatorios")({
  component: RelatoriosPage,
});

function RelatoriosPage() {
  const { userRole } = useOperationalDate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const rebuildFn = useServerFn(rebuildDailyRecords);

  if (!userRole)
    return <div className="p-8 text-sm text-muted-foreground">Carregando…</div>;

  const isAgent = userRole === "agente";
  const isSupervisor = userRole === "supervisor";
  const isCoordinator = userRole === "coordenador";
  const isAdmin = userRole === "admin_master";
  const canRebuild = isSupervisor || isCoordinator || isAdmin;

  const handleRebuild = async () => {
    setConfirmOpen(false);
    setRebuilding(true);
    const to = getOperationalDate();
    const [ty, tm, td] = to.split("-").map(Number);
    const fromDate = new Date(ty, tm - 1, td);
    fromDate.setDate(fromDate.getDate() - 90);
    const from = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, "0")}-${String(fromDate.getDate()).padStart(2, "0")}`;
    console.log("[PRODUCTION_INTEGRITY_START]", { from, to });
    try {
      const res = await rebuildFn({ data: { from, to } });
      console.log("[PRODUCTION_INTEGRITY_FINISH]", res);
      toast.success(
        `Reconstrução concluída — ${res.updated}/${res.scanned} diária(s) atualizada(s).`,
      );
    } catch (e: any) {
      console.error("[PRODUCTION_INTEGRITY_ERROR]", e);
      toast.error(`Falha na reconstrução: ${e?.message || "erro desconhecido"}`);
    } finally {
      setRebuilding(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6 pb-24 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="space-y-1">
          <Badge className="bg-blue-600 text-white font-black text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-md">
            Módulo de Relatórios
          </Badge>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">
            Relatórios
          </h1>
          <p className="text-sm text-slate-500 font-medium">
            {isAgent && "Histórico operacional, auditoria e geração de PDFs."}
            {(isSupervisor || isAdmin) &&
              "Relatórios da equipe — por agente, área e pendências."}
            {isCoordinator && "Relatórios municipais e boletins oficiais."}
          </p>
        </div>
        {canRebuild && (
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={rebuilding}
            variant="outline"
            className="border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-2xl h-12 px-5 font-black text-xs uppercase tracking-widest shadow-sm"
          >
            <RotateCw className={`mr-2 h-4 w-4 ${rebuilding ? "animate-spin" : ""}`} />
            {rebuilding ? "Reconstruindo…" : "Reconstruir Relatórios"}
          </Button>
        )}
      </header>

      {isAgent && <AgentReportsSimple />}
      {(isSupervisor || isAdmin) && <SupervisorReports />}
      {isCoordinator && <CoordinatorReports />}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reconstruir os resumos da produção?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá recalcular os Daily Work Records utilizando as visitas
              existentes dos últimos 90 dias.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRebuild}>Reconstruir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ─────────────────────── SUPERVISOR ─────────────────────── */

function SupervisorReports() {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <NavCard
          icon={<Users className="h-6 w-6" />}
          title="Relatórios por Agente"
          description="Produção individual da equipe."
          to="/supervision"
        />
        <NavCard
          icon={<MapPin className="h-6 w-6" />}
          title="Relatórios por Área"
          description="Cobertura territorial e desempenho por área."
          to="/map"
        />
        <NavCard
          icon={<Calendar className="h-6 w-6" />}
          title="Boletins Semanais"
          description="Consolidados oficiais por semana epidemiológica."
          to="/reports"
        />
        <NavCard
          icon={<ClipboardList className="h-6 w-6" />}
          title="Pendências & Recuperação"
          description="Acompanhe pendências e tentativas de recuperação."
          to="/pending"
        />
      </div>
      <IntelligenceShortcut />
    </>
  );
}

/* ─────────────────────── COORDENADOR ────────────────────── */

function CoordinatorReports() {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <NavCard
          icon={<BarChart3 className="h-6 w-6" />}
          title="Relatórios Municipais"
          description="Indicadores consolidados do município."
          to="/supervision"
        />
        <NavCard
          icon={<TrendingUp className="h-6 w-6" />}
          title="Relatórios por Ciclo"
          description="Comparativo e fechamento de ciclos."
          to="/cycles"
        />
        <NavCard
          icon={<FileText className="h-6 w-6" />}
          title="Boletins Oficiais"
          description="Boletins semanais e consolidados oficiais."
          to="/reports"
        />
        <NavCard
          icon={<FileSpreadsheet className="h-6 w-6" />}
          title="Indicadores Consolidados"
          description="Painel analítico estratégico."
          to="/reports"
        />
      </div>
      <IntelligenceShortcut />
    </>
  );
}

function NavCard({
  icon,
  title,
  description,
  to,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  to: string;
}) {
  return (
    <Link to={to as any} className="block group">
      <Card className="p-6 rounded-3xl border-slate-100 hover:border-slate-900 hover:shadow-lg transition-all active:scale-[0.98] h-full">
        <div className="h-12 w-12 rounded-2xl bg-slate-100 group-hover:bg-slate-900 group-hover:text-white text-slate-700 flex items-center justify-center mb-4 transition-colors">
          {icon}
        </div>
        <h3 className="text-base font-black tracking-tight text-slate-800 mb-1">
          {title}
        </h3>
        <p className="text-xs text-slate-500 font-medium leading-relaxed">
          {description}
        </p>
      </Card>
    </Link>
  );
}

function IntelligenceShortcut() {
  return (
    <Card className="p-6 rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 text-white border-0">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Badge className="bg-blue-500 mb-3 font-black uppercase tracking-widest text-[9px]">
            VetorControl Intelligence
          </Badge>
          <h3 className="text-xl font-black tracking-tight">
            Painéis Analíticos & Estratégicos
          </h3>
          <p className="text-sm text-slate-300 max-w-md mt-1">
            Cobertura territorial, ranking, indicadores em tempo real e alertas
            operacionais.
          </p>
        </div>
        <Button
          asChild
          className="bg-white text-slate-900 hover:bg-slate-100 rounded-xl h-12 px-6 font-black uppercase tracking-wide text-xs"
        >
          <Link to="/reports">
            <BarChart3 className="mr-2 h-4 w-4" /> Abrir Intelligence
          </Link>
        </Button>
      </div>
    </Card>
  );
}

