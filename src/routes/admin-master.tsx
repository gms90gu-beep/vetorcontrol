import { createFileRoute, redirect, useRouter, useNavigate } from "@tanstack/react-router";
import { AdminMasterDashboard } from "@/components/supervision/AdminMasterDashboard";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { LogOut, ArrowLeft, X, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

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
    if (user.email === "gms90gu@gmail.com") {
      console.debug("[Admin-Master Guard] Acesso permitido via e-mail direto");
      return;
    }

    // Para outros usuários, verifica o role via RPC (SECURITY DEFINER — ignora RLS)
    const { data: role, error } = await supabase.rpc("get_user_role", { u_id: user.id });

    console.debug("[Admin-Master Guard] User ID:", user.id);
    console.debug("[Admin-Master Guard] Role via RPC:", role);
    console.debug("[Admin-Master Guard] Erro RPC:", error);

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
  const { user, role, isReady, isRoleLoading, signOut } = useAuth();
  const hasAdminAccess = user?.email === "gms90gu@gmail.com" || role === "admin_master";

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

  if (!isReady || isRoleLoading || !user || !hasAdminAccess) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 text-white">
        <Loader2 className="mr-3 h-5 w-5 animate-spin text-primary" />
        <span className="text-sm font-medium">Validando acesso master...</span>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-slate-950 p-6">
      <div className="max-w-6xl mx-auto flex justify-end gap-3 mb-4">
        <Link to="/dashboard">
          <Button variant="outline" className="border-white/10 text-slate-400 hover:text-white hover:bg-white/10">
            <LayoutDashboard className="mr-2 h-4 w-4" /> Ir para Dashboard
          </Button>
        </Link>
        <Button variant="ghost" onClick={handleLogout} className="text-slate-400 hover:text-white hover:bg-white/10">
          <LogOut className="mr-2 h-4 w-4" /> Sair
        </Button>
      </div>
      <AdminMasterDashboard />
    </div>
  );
}
