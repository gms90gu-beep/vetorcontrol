import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { KPICard } from "@/components/ui/kpi-card";
import { InfoCard } from "@/components/ui/info-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { SearchInput } from "@/components/ui/search-input";
import { Toolbar } from "@/components/ui/toolbar";
import {
  EmptyState, NoResultsState, ErrorState, OfflineState,
  NoPermissionState, LoadingState, InlineSpinner,
} from "@/components/ui/states";
import { MapPanel, MapLegend } from "@/components/ui/map-panel";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Activity, Bug, Layers, MapPin, Palette, Plus, Shield, Trash2,
  Users, Zap,
} from "lucide-react";
import { notify } from "@/lib/notify";

export const Route = createFileRoute("/_authenticated/admin/design-system")({
  component: DesignSystemPage,
});

function DesignSystemPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [search, setSearch] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [activeKpi, setActiveKpi] = useState<string | null>("focus");

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { setAllowed(false); return; }
      const { data: r } = await supabase.rpc("get_user_role", { u_id: u.user.id });
      setAllowed(r === "admin_master" || u.user.email === "gms90gu@gmail.com");
    })();
  }, []);

  if (allowed === null) return <LoadingState rows={4} className="p-6" />;
  if (!allowed) return <NoPermissionState />;

  return (
    <div className="min-h-dvh bg-background pb-16">
      <PageHeader
        sticky
        icon={<Palette className="h-5 w-5" />}
        title="Design System"
        description="Catálogo vivo dos componentes da plataforma"
        actions={<StatusBadge tone="primary" dot>v1.0</StatusBadge>}
      />

      <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* Tokens */}
        <Section title="Tokens" description="Cores, sombras, raios e tipografia">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { name: "background", cls: "bg-background border" },
              { name: "card", cls: "bg-card border" },
              { name: "primary", cls: "bg-primary" },
              { name: "muted", cls: "bg-muted" },
              { name: "success", cls: "bg-success" },
              { name: "warning", cls: "bg-warning" },
              { name: "danger", cls: "bg-danger" },
              { name: "info", cls: "bg-info" },
            ].map((t) => (
              <div key={t.name} className="flex items-center gap-3 rounded-xl border border-border-subtle p-3">
                <div className={`h-10 w-10 rounded-lg ${t.cls}`} aria-hidden />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">--color-{t.name}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* KPI Cards */}
        <Section title="KPI Cards" description="Indicadores clicáveis para dashboards e mapas">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KPICard
              title="Imóveis"
              value="1.284"
              icon={<Layers className="h-5 w-5" />}
              tone="primary"
              delta={12}
              deltaLabel="vs semana"
              interactive
              active={activeKpi === "imoveis"}
              onClick={() => setActiveKpi("imoveis")}
            />
            <KPICard
              title="Focos"
              value="38"
              icon={<Bug className="h-5 w-5" />}
              tone="danger"
              delta={-4}
              interactive
              active={activeKpi === "focus"}
              onClick={() => setActiveKpi("focus")}
            />
            <KPICard
              title="Equipe"
              value="14"
              icon={<Users className="h-5 w-5" />}
              tone="info"
              hint="ativos hoje"
            />
            <KPICard
              title="Carregando"
              value="—"
              icon={<Activity className="h-5 w-5" />}
              tone="success"
              loading
            />
          </div>
        </Section>

        {/* InfoCard variants */}
        <Section title="InfoCard" description="Variantes semânticas">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(["default", "primary", "success", "warning", "danger", "glass"] as const).map((v) => (
              <InfoCard key={v} variant={v}>
                <p className="text-sm font-semibold capitalize">{v}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Exemplo de conteúdo informativo com tom {v}.
                </p>
              </InfoCard>
            ))}
          </div>
        </Section>

        {/* Buttons */}
        <Section title="Buttons" description="Variantes e tamanhos">
          <div className="flex flex-wrap items-center gap-2">
            <Button>Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button disabled>Disabled</Button>
            <Button size="sm">Small</Button>
            <Button size="lg">Large</Button>
            <Button size="icon" aria-label="Adicionar"><Plus className="h-4 w-4" /></Button>
          </div>
        </Section>

        {/* Inputs */}
        <Section title="Inputs" description="Mesma altura, foco e tom em todos os formulários">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input placeholder="Texto padrão" />
            <SearchInput value={search} onChange={setSearch} placeholder="Buscar componente..." />
            <Select>
              <SelectTrigger><SelectValue placeholder="Selecione uma opção" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="a">Opção A</SelectItem>
                <SelectItem value="b">Opção B</SelectItem>
              </SelectContent>
            </Select>
            <Textarea placeholder="Observações..." />
          </div>
        </Section>

        {/* Badges */}
        <Section title="Status Badges">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="neutral" dot>Neutro</StatusBadge>
            <StatusBadge tone="primary" dot>Primary</StatusBadge>
            <StatusBadge tone="success" dot>Sucesso</StatusBadge>
            <StatusBadge tone="warning" dot>Atenção</StatusBadge>
            <StatusBadge tone="danger" dot>Crítico</StatusBadge>
            <StatusBadge tone="info" dot>Info</StatusBadge>
            <StatusBadge tone="outline">Outline</StatusBadge>
            <Badge>shadcn Badge</Badge>
          </div>
        </Section>

        {/* Toolbar */}
        <Section title="Toolbar / ActionBar">
          <Toolbar>
            <SearchInput value={search} onChange={setSearch} className="max-w-xs" />
            <Button variant="outline" size="sm"><Shield className="mr-1.5 h-4 w-4" />Filtrar</Button>
            <div className="ml-auto flex items-center gap-2">
              <InlineSpinner label="Sincronizando" />
              <Button size="sm"><Zap className="mr-1.5 h-4 w-4" />Executar</Button>
            </div>
          </Toolbar>
        </Section>

        {/* States */}
        <Section title="Estados globais" description="Loading, vazio, erro, offline, sem permissão">
          <div className="grid gap-3 lg:grid-cols-2">
            <EmptyState description="Nenhum item para exibir aqui ainda." />
            <NoResultsState description="Refine os filtros para encontrar registros." />
            <ErrorState onRetry={() => notify.info("Tentando novamente...")} />
            <OfflineState />
            <NoPermissionState />
            <LoadingState rows={3} />
          </div>
        </Section>

        {/* Map panel */}
        <Section title="Map Panel" description="Painéis flutuantes do mapa">
          <div className="relative h-56 overflow-hidden rounded-2xl border border-border-subtle bg-[linear-gradient(135deg,oklch(0.95_0.02_245),oklch(0.92_0.04_180))]">
            <MapPanel position="top-left" width="220px">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">Quarteirão 12</p>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">46 imóveis · 3 focos</p>
            </MapPanel>
            <MapPanel position="bottom-right" width="200px">
              <MapLegend
                items={[
                  { label: "Sem visita", color: "#94a3b8", count: 12 },
                  { label: "Visitado", color: "#10b981", count: 28 },
                  { label: "Foco", color: "#ef4444", count: 6 },
                ]}
              />
            </MapPanel>
          </div>
        </Section>

        {/* Feedback */}
        <Section title="Feedback" description="Toasts e diálogos de confirmação">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => notify.success("Salvo com sucesso")}>Toast success</Button>
            <Button variant="outline" onClick={() => notify.error("Algo deu errado", "Detalhes do erro.")}>Toast error</Button>
            <Button variant="outline" onClick={() => notify.warning("Atenção")}>Toast warning</Button>
            <Button variant="outline" onClick={() => notify.info("Apenas informativo")}>Toast info</Button>
            <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
              <Trash2 className="mr-1.5 h-4 w-4" />Confirmar exclusão
            </Button>
          </div>
        </Section>

        <ConfirmationDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          tone="danger"
          title="Excluir registro?"
          description="Esta ação não pode ser desfeita."
          confirmLabel="Excluir"
          onConfirm={() => {
            notify.success("Registro excluído");
            setConfirmOpen(false);
          }}
        />
      </main>
    </div>
  );
}
