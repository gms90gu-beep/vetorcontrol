import { createFileRoute, redirect, useRouter, useNavigate } from "@tanstack/react-router";
import { AdminMasterDashboard } from "@/components/supervision/AdminMasterDashboard";
import { supabase } from "@/integrations/supabase/client";
import { getCachedUserRole } from "@/lib/offline/role-cache";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { LogOut, ArrowLeft, X, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { isOwnerBypass } from "@/lib/role-guards";

export const Route = createFileRoute("/admin-master")({
  beforeLoad: async () => {
    if (typeof window === "undefined") {
      console.debug("[Admin-Master Guard] SSR detectado; validação será feita no cliente.");
      return;
    }

    console.debug("[Admin-Master Guard] Iniciando verificação de acesso...");
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      console.error("[Admin-Master Guard] Erro ao restaurar sessão:", sessionError);
    }

    if (!session) {
      console.warn("[Admin-Master Guard] Sem sessão persistida, redirecionando para login");
      throw redirect({ to: "/login" });
    }

    const { data: verifiedUser, error: userError } = await supabase.auth.getUser();

    if (userError || !verifiedUser.user) {
      console.warn("[Admin-Master Guard] Sessão existe, mas usuário não foi validado:", userError);
      throw redirect({ to: "/login" });
    }

    const user = verifiedUser.user;

    // Acesso direto pelo e-mail do criador do sistema — sem query no banco
    if (isOwnerBypass(user.email)) {
      console.debug("[Admin-Master Guard] Acesso permitido via e-mail direto");
      return;
    }

    // Para outros usuários, verifica o role via cache offline-first.
    let role: string | null = null;
    let error: any = null;
    try {
      role = await getCachedUserRole(user.id);
    } catch (e) {
      error = e;
    }

    console.debug("[Admin-Master Guard] User ID:", user.id);
    console.debug("[Admin-Master Guard] Role via cache/RPC:", role);

    if (error) {
      console.error("[Admin-Master Guard] Erro ao validar role — redirecionando para dashboard:", error);
      throw redirect({ to: "/dashboard" });
    }

    if (role !== "admin_master") {
      console.warn("[Admin-Master Guard] Role inválido (" + role + ") — redirecionando para dashboard");
      throw redirect({ to: "/dashboard" });
    }

    console.debug("[Admin-Master Guard] Acesso permitido ✅");
  },
  component: AdminMasterPage,
});

function AdminMasterPage() {
  const router = useRouter();
  const navigate = useNavigate();
  const { user, role, isReady, isRoleLoading, signOut } = useAuth();
  const hasAdminAccess = isOwnerBypass(user?.email) || role === "admin_master";

  useEffect(() => {
    if (!isReady || isRoleLoading) return;

    if (!user) {
      router.navigate({ to: "/login", replace: true });
      return;
    }

    if (!hasAdminAccess) {
      router.navigate({ to: "/dashboard", replace: true });
    }
  }, [hasAdminAccess, isReady, isRoleLoading, role, router, user]);

  const handleLogout = async () => {
    await signOut();
    window.location.href = "/login";
  };

  const handleBack = () => {
    // Evita window.history.back() — no preview iframe da Lovable isso pode
    // sair do app e gerar "Lovable proxy error (404)". Navega sempre para
    // uma rota interna segura.
    navigate({ to: "/dashboard", replace: true });
  };

  const handleClose = () => {
    navigate({ to: "/dashboard", replace: true });
  };

  if (!isReady || isRoleLoading || !user || !hasAdminAccess) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 text-white">
        <Loader2 className="mr-3 h-5 w-5 animate-spin text-primary" />
        <span className="text-sm font-medium">Validando acesso master...</span>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-slate-950">
      {/* ── Header Administrativo Fixo ─────────────────────────────── */}
      <header className="sticky top-0 z-[1000] pointer-events-auto bg-slate-950/90 backdrop-blur-md border-b border-slate-800">
        <div className="relative z-[1001] pointer-events-auto max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={handleBack}
            aria-label="Voltar para a tela anterior"
            className="relative z-[1002] pointer-events-auto cursor-pointer touch-manipulation select-none min-h-11 min-w-24 text-slate-300 hover:text-white hover:bg-white/10 active:bg-white/15 active:scale-95 h-11 px-3 gap-2 text-sm font-bold"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>

          <div className="hidden sm:flex flex-col items-center leading-tight">
            <h2 className="text-sm font-black uppercase tracking-[0.3em] text-amber-500">
              Comando
            </h2>
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">
              Gestão Global · Supervisores · Agentes · Admins
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={handleClose}
              aria-label="Fechar painel Admin Master e voltar ao dashboard"
              className="relative z-[1002] pointer-events-auto cursor-pointer touch-manipulation select-none min-h-11 min-w-24 text-slate-300 hover:text-white hover:bg-white/10 active:bg-white/15 active:scale-95 h-11 px-3 gap-2 text-sm font-bold"
            >
              <X className="h-4 w-4" /> Fechar
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={handleLogout}
              className="relative z-[1002] pointer-events-auto cursor-pointer touch-manipulation select-none min-h-11 text-slate-300 hover:text-rose-400 hover:bg-rose-500/10 active:bg-rose-500/15 active:scale-95 h-11 px-3 gap-2 text-sm font-bold"
            >
              <LogOut className="h-4 w-4" /> Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="relative z-0 p-4 sm:p-6">
        <AdminMasterDashboard />
      </main>
    </div>
  );
}
