import {
  LayoutDashboard,
  Map as MapIcon,
  FileText,
  Settings,
  RefreshCw,
  Layers,
  AlertTriangle,
  MapPin,
  Home,
  CheckSquare,
  ShieldCheck,
  Users,
  BarChart3,
  type LucideIcon,
} from "lucide-react";

export type NavGroup = "operacao" | "administracao" | "conta";

export type BadgeKey =
  | "pendencias"
  | "weekly"
  | "sync";

export type NavItem = {
  /** Stable React key — must be unique even when two items point to the same route. */
  key: string;
  label: string;
  icon: LucideIcon;
  to: string;
  group: NavGroup;
  /** Accessible name; defaults to label. */
  ariaLabel?: string;
  /** Optional badge bucket — surfaces a numeric indicator when value > 0. */
  badge?: BadgeKey;
  /** Tag used by the bottom navigation to pick primary shortcuts. */
  primary?: boolean;
};

export const NAV_GROUP_LABEL: Record<NavGroup, string> = {
  operacao: "Operação",
  administracao: "Administração",
  conta: "Conta",
};

export function isManagerRole(role: string | null | undefined): boolean {
  return role === "supervisor" || role === "coordenador" || role === "admin_master";
}

export function getPanelTitle(role: string | null): string {
  switch (role) {
    case "admin_master":
      return "Painel Administrativo";
    case "coordenador":
      return "Painel do Coordenador";
    case "supervisor":
      return "Painel do Supervisor";
    case "agente":
      return "Painel do Agente";
    default:
      return "Painel";
  }
}

/**
 * SINGLE SOURCE OF TRUTH for every navigation surface
 * (desktop sidebar, mobile bottom nav, mobile drawer).
 */
export function buildNavItems(userRole: string | null): NavItem[] {
  const manager = isManagerRole(userRole);

  if (manager) {
    const items: NavItem[] = [
      // ── Operação ────────────────────────────────────────────────
      { key: "mgr-panel", label: "Painel", icon: Home, to: "/supervision", group: "operacao", primary: true },
      { key: "mgr-team", label: "Equipe", icon: Users, to: "/supervision", group: "operacao", primary: true },
      { key: "mgr-weekly", label: "Boletim Semanal", icon: BarChart3, to: "/weekly-comparison", group: "operacao", badge: "weekly" },
      { key: "mgr-intel", label: "Intelligence", icon: BarChart3, to: "/reports", group: "operacao" },
      { key: "mgr-map", label: "Mapa", icon: MapIcon, to: "/map", group: "operacao", primary: true },
      { key: "mgr-heatmap", label: "Mapa Epidemiológico", icon: MapPin, to: "/heatmap", group: "operacao" },
      { key: "mgr-pendencias", label: "Pendências", icon: AlertTriangle, to: "/admin/pendencias", group: "operacao", badge: "pendencias", primary: true },

      // ── Administração ───────────────────────────────────────────
      { key: "mgr-reports", label: "Relatórios", icon: FileText, to: "/relatorios", group: "administracao" },
      { key: "mgr-gps-audit", label: "Auditoria GPS", icon: MapPin, to: "/admin/georef-audit", group: "administracao" },
      { key: "mgr-sync", label: "Sincronização", icon: RefreshCw, to: "/sync-status", group: "administracao", badge: "sync" },
      { key: "mgr-settings", label: "Configurações", icon: Settings, to: "/settings", group: "administracao" },
    ];

    if (userRole === "admin_master") {
      items.push(
        { key: "adm-exec", label: "Dashboard Admin", icon: BarChart3, to: "/admin/dashboard", group: "administracao" },
        { key: "adm-master", label: "Central de Comando", icon: ShieldCheck, to: "/admin-master", group: "administracao" },
        { key: "adm-audit", label: "Auditoria", icon: ShieldCheck, to: "/admin/auditoria", group: "administracao" },
        { key: "adm-cycle-audit", label: "Auditoria de Ciclos", icon: ShieldCheck, to: "/admin/cycle-audit", group: "administracao" },
        { key: "adm-data-audit", label: "Auditoria de Dados", icon: ShieldCheck, to: "/admin/data-audit", group: "administracao" },
      );
    }

    return items;
  }

  // Agente
  return [
    // ── Operação ──────────────────────────────────────────────────
    { key: "agt-home", label: getPanelTitle(userRole), icon: LayoutDashboard, to: "/dashboard", group: "operacao", primary: true },
    { key: "agt-cycles", label: "Ciclos", icon: Layers, to: "/cycles", group: "operacao" },
    { key: "agt-field", label: "Trabalho", icon: CheckSquare, to: "/field-work", group: "operacao", primary: true },
    { key: "agt-rg", label: "RG", icon: MapPin, to: "/rg", group: "operacao", primary: true },
    { key: "agt-pendencias", label: "Pendências", icon: AlertTriangle, to: "/pending", group: "operacao", badge: "pendencias" },
    { key: "agt-weekly", label: "Boletim Semanal", icon: BarChart3, to: "/weekly-comparison", group: "operacao", badge: "weekly" },

    // ── Administração ─────────────────────────────────────────────
    { key: "agt-reports", label: "Relatórios", icon: FileText, to: "/relatorios", group: "administracao", primary: true },
    { key: "agt-sync", label: "Sincronização", icon: RefreshCw, to: "/sync-status", group: "administracao", badge: "sync" },
    { key: "agt-settings", label: "Configurações", icon: Settings, to: "/settings", group: "administracao" },
  ];
}

/** Items grouped for the drawer. Preserves order from buildNavItems. */
export function groupNavItems(items: NavItem[]): Array<{ group: NavGroup; items: NavItem[] }> {
  const order: NavGroup[] = ["operacao", "administracao", "conta"];
  return order
    .map((g) => ({ group: g, items: items.filter((i) => i.group === g) }))
    .filter((s) => s.items.length > 0);
}
