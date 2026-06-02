import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  LogOut,
  PlayCircle,
  CalendarCheck,
  MapPin,
  BarChart3,
  AlertTriangle,
  History,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { blockManagersGuard } from "@/lib/role-guards";

export const Route = createFileRoute("/_authenticated/dashboard")({
  beforeLoad: blockManagersGuard,
  component: DashboardPage,
});

type ShiftStatus = "encerrado" | "trabalho" | "pausa";

type ActivityItem = {
  id: string;
  type: "visit" | "focus";
  title: string;
  address: string;
  time: string;
};

function initialsFrom(name?: string | null, email?: string | null) {
  const base = (name && name.trim()) || (email ? email.split("@")[0] : "") || "";
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "AG";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function DashboardPage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const [profile, setProfile] = useState<{
    full_name: string | null;
    registration_number: string | null;
    city: string | null;
  } | null>(null);

  const [shift, setShift] = useState<ShiftStatus>("encerrado");
  const [session, setSession] = useState({ trabalhados: 0, fechados: 0, focos: 0 });
  const [cycle, setCycle] = useState<{ name: string; year: number; week: number } | null>(null);
  const [coverage, setCoverage] = useState({ visited: 0, total: 0, percent: 0 });
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [hasActiveSession, setHasActiveSession] = useState(false);
  const [reportsSeen, setReportsSeen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("reports_seen_v1") === "1";
  });

  useEffect(() => {
    document.title = "Painel do Agente — VetorControl";
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data: p } = await supabase
        .from("profiles")
        .select("full_name, registration_number, city")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setProfile(p ?? null);

      const today = new Date().toISOString().split("T")[0];
      const { data: active } = await supabase
        .from("field_work_sessions")
        .select("id, status")
        .eq("user_id", user.id)
        .eq("status", "in_progress")
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      setHasActiveSession(!!active);
      setShift(active ? "trabalho" : "encerrado");

      const currentYear = new Date().getFullYear();
      const { data: c } = await supabase
        .from("cycles")
        .select("id, name, year, number")
        .eq("status", "in_progress")
        .eq("year", currentYear)
        .order("number", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (c) {
        const { data: week } = await supabase
          .from("weeks")
          .select("number")
          .eq("cycle_id", c.id)
          .lte("start_date", today)
          .gte("end_date", today)
          .maybeSingle();

        setCycle({
          name: c.name || `Ciclo ${c.number}`,
          year: c.year,
          week: week?.number ?? 1,
        });

        const { data: cov } = await supabase
          .from("cycle_coverage_summary")
          .select("worked_properties, total_properties, coverage_percentage")
          .eq("cycle_id", c.id)
          .maybeSingle();
        if (cov) {
          setCoverage({
            visited: cov.worked_properties ?? 0,
            total: cov.total_properties ?? 0,
            percent: Math.round(Number(cov.coverage_percentage) || 0),
          });
        }

        const { data: visits } = await supabase
          .from("visits")
          .select("id, status, created_at")
          .eq("user_id", user.id)
          .gte("created_at", `${today}T00:00:00`)
          .order("created_at", { ascending: false });

        if (visits) {
          setSession({
            trabalhados: visits.length,
            fechados: visits.filter((v) => v.status === "closed").length,
            focos: visits.filter((v) => v.status === "focus_found").length,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const fullName = profile?.full_name || user?.email?.split("@")[0] || "Agente";
  const initials = initialsFrom(profile?.full_name, user?.email);
  const matricula = profile?.registration_number || "—";
  const cidade = profile?.city || "—";

  const shiftBadge = useMemo(() => {
    if (shift === "trabalho") return { bg: "#1a3a2a", color: "#34d399", label: "Em trabalho" };
    if (shift === "pausa") return { bg: "#1a1500", color: "#fbbf24", label: "Em pausa" };
    return { bg: "#1a1a2e", color: "#6366f1", label: "Expediente encerrado" };
  }, [shift]);

  const handleLogout = async () => {
    await signOut();
    window.location.href = "/login";
  };

  const markReportsSeen = () => {
    localStorage.setItem("reports_seen_v1", "1");
    setReportsSeen(true);
  };

  return (
    <div className="min-h-full" style={{ background: "#f4f5f7" }}>
      {/* Header escuro */}
      <header style={{ background: "#0b1520", padding: "14px" }}>
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full mb-2"
              style={{ background: shiftBadge.bg }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: shiftBadge.color }}
              />
              <span
                className="text-[10px] font-semibold"
                style={{ color: shiftBadge.color }}
              >
                {shiftBadge.label}
              </span>
            </div>
            <div className="text-white font-bold text-base leading-tight truncate">{fullName}</div>
            <div
              className="text-[9px] uppercase tracking-wider font-semibold mt-0.5"
              style={{ color: "#4a6b80" }}
            >
              Painel do Agente
            </div>
            <div className="text-[9px] mt-0.5" style={{ color: "#2e4a60" }}>
              {matricula} · {cidade}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handleLogout}
              aria-label="Sair"
              className="transition-opacity hover:opacity-80"
              style={{ color: "#2e4a60" }}
            >
              <LogOut className="h-5 w-5" />
            </button>
            <div
              className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold"
              style={{ background: "#1a3a5a", color: "#60a5fa", border: "1px solid #2a5a8a" }}
            >
              {initials}
            </div>
          </div>
        </div>

        <div className="my-3" style={{ height: 0.5, background: "#1e3048" }} />

        <div
          className="text-center text-[8px] uppercase tracking-widest mb-2"
          style={{ color: "#2e4a60" }}
        >
          {hasActiveSession ? "Sessão de trabalho em andamento" : "Nenhuma sessão de trabalho ativa"}
        </div>

        {/* Cards de sessão */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Trabalhados", value: session.trabalhados, color: "#ffffff" },
            { label: "Fechados", value: session.fechados, color: "#ffffff" },
            { label: "Focos", value: `+${session.focos}`, color: "#f87171" },
          ].map((s) => (
            <div
              key={s.label}
              className="py-2.5 text-center"
              style={{ background: "#111e2e", border: "1px solid #1e3048", borderRadius: 8 }}
            >
              <div className="text-lg font-bold" style={{ color: s.color }}>
                {s.value}
              </div>
              <div
                className="text-[8px] uppercase tracking-widest font-semibold mt-0.5"
                style={{ color: "#2e4a60" }}
              >
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* Barra de ciclo */}
        <div
          className="mt-2.5 p-3"
          style={{ background: "#111e2e", border: "1px solid #1e3048", borderRadius: 10 }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div
                className="text-[8px] uppercase tracking-widest font-semibold"
                style={{ color: "#2e4a60" }}
              >
                Cobertura do ciclo
              </div>
              <div className="text-white font-bold leading-none mt-1" style={{ fontSize: 22 }}>
                {coverage.percent}%
              </div>
              <div className="text-[9px] mt-1" style={{ color: "#2e4a60" }}>
                Progresso geral
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <div
                className="px-2 py-0.5 text-[9px] font-bold"
                style={{ background: "#1a3a6a", color: "#60a5fa", borderRadius: 6 }}
              >
                {cycle ? `${cycle.name} / ${cycle.year}` : "Sem ciclo"}
              </div>
              <div className="text-[9px]" style={{ color: "#4a6b80" }}>
                Semana {cycle?.week ?? 1}
              </div>
            </div>
          </div>
          <div
            className="mt-3 overflow-hidden"
            style={{ height: 3, background: "#1e3048", borderRadius: 999 }}
          >
            <div
              className="h-full transition-all"
              style={{
                width: `${Math.min(100, coverage.percent)}%`,
                background: "#34d399",
              }}
            />
          </div>
          <div
            className="text-[8px] text-right mt-1.5 uppercase tracking-wider"
            style={{ color: "#2e4a60" }}
          >
            {coverage.visited} / {coverage.total} imóveis
          </div>
        </div>
      </header>

      {/* Corpo claro */}
      <div style={{ padding: "14px" }} className="space-y-5">
        {/* Botão Iniciar jornada diária */}
        <button
          onClick={() => navigate({ to: "/field-work" })}
          className="w-full flex items-center justify-center gap-2 font-bold text-[13px] active:scale-[0.98] transition-transform"
          style={{
            background: "#059669",
            color: "#ffffff",
            borderRadius: 12,
            padding: 13,
          }}
        >
          <PlayCircle className="h-5 w-5" />
          Iniciar jornada diária
        </button>

        {/* Acesso rápido */}
        <section>
          <div
            className="text-[9px] uppercase tracking-widest font-bold mb-2"
            style={{ color: "#8a9ab0" }}
          >
            Acesso rápido
          </div>
          <div className="grid grid-cols-2 gap-3">
            <QuickCard
              to="/field-work"
              icon={<CalendarCheck className="h-5 w-5" />}
              iconBg="#eaf3de"
              iconColor="#3b6d11"
              title="Diário"
              subtitle="Iniciar jornada"
            />
            <QuickCard
              to="/rg"
              icon={<MapPin className="h-5 w-5" />}
              iconBg="#e6f1fb"
              iconColor="#185fa5"
              title="RG"
              subtitle="Cadastro de imóveis"
            />
            <QuickCard
              to="/reports"
              onClick={markReportsSeen}
              icon={<BarChart3 className="h-5 w-5" />}
              iconBg="#faeeda"
              iconColor="#854f0b"
              title="Relatórios"
              subtitle="Ver histórico"
              badge={!reportsSeen ? { label: "3 novos", bg: "#e6f1fb", color: "#185fa5" } : undefined}
            />
            <QuickCard
              to="/pending"
              icon={<AlertTriangle className="h-5 w-5" />}
              iconBg="#fcebeb"
              iconColor="#a32d2d"
              title="Pendências"
              subtitle="Imóveis abertos"
              badge={{ label: "0 abertos", bg: "#eaf3de", color: "#3b6d11" }}
            />
          </div>
        </section>

        {/* Atividade recente */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <div
              className="text-[9px] uppercase tracking-widest font-bold"
              style={{ color: "#8a9ab0" }}
            >
              Atividade recente
            </div>
            <Link to="/reports" className="text-[10px] font-semibold" style={{ color: "#185fa5" }}>
              Ver tudo
            </Link>
          </div>
          {activities.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center text-center"
              style={{
                background: "#ffffff",
                border: "1px solid #e0e4ea",
                borderRadius: 10,
                padding: 16,
              }}
            >
              <History className="h-6 w-6 mb-1" style={{ color: "#e0e4ea" }} />
              <div className="text-[11px]" style={{ color: "#c0c8d4" }}>
                Nenhuma atividade registrada hoje
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {activities.slice(0, 5).map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-3 p-3"
                  style={{
                    background: "#ffffff",
                    border: "1px solid #e0e4ea",
                    borderRadius: 10,
                  }}
                >
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ background: a.type === "focus" ? "#f87171" : "#34d399" }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-semibold truncate" style={{ color: "#0b1520" }}>
                      {a.title}
                    </div>
                    <div className="text-[10px] truncate" style={{ color: "#8a9ab0" }}>
                      {a.address}
                    </div>
                  </div>
                  <div className="text-[10px] shrink-0" style={{ color: "#8a9ab0" }}>
                    {a.time}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function QuickCard({
  to,
  onClick,
  icon,
  iconBg,
  iconColor,
  title,
  subtitle,
  badge,
}: {
  to: string;
  onClick?: () => void;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle: string;
  badge?: { label: string; bg: string; color: string };
}) {
  return (
    <Link
      to={to as any}
      onClick={onClick}
      className="block active:scale-[0.98] transition-transform"
      style={{
        background: "#ffffff",
        border: "1px solid #e0e4ea",
        borderRadius: 12,
        padding: "14px 12px",
      }}
    >
      <div
        className="flex items-center justify-center mb-2"
        style={{
          width: 36,
          height: 36,
          background: iconBg,
          color: iconColor,
          borderRadius: 10,
        }}
      >
        {icon}
      </div>
      <div className="text-[13px] font-bold leading-tight" style={{ color: "#0b1520" }}>
        {title}
      </div>
      <div className="text-[10px] mt-0.5" style={{ color: "#aab0bc" }}>
        {subtitle}
      </div>
      {badge && (
        <div
          className="inline-block mt-2 px-2 py-0.5 text-[9px] font-semibold rounded-full"
          style={{ background: badge.bg, color: badge.color }}
        >
          {badge.label}
        </div>
      )}
    </Link>
  );
}
