import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { AdminMasterDashboard } from "@/components/supervision/AdminMasterDashboard";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldAlert, KeyRound, ArrowRight, LogOut, LayoutDashboard } from "lucide-react";
import { toast } from "sonner";

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
  const [password, setPassword] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === "VETOR_ADMIN_2026") {
      setIsAuthorized(true);
      toast.success("Acesso Master Autorizado");
    } else {
      toast.error("Senha Master Incorreta");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-white/10 bg-slate-900 text-white shadow-2xl">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-2xl bg-red-500/20 flex items-center justify-center text-red-500 border border-red-500/30">
                <ShieldAlert className="h-8 w-8" />
              </div>
            </div>
            <CardTitle className="text-2xl font-black uppercase tracking-tighter">Painel Admin Master</CardTitle>
            <CardDescription className="text-slate-400">
              Área restrita. Insira a senha master para continuar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <KeyRound className="absolute left-3 top-3 h-5 w-5 text-slate-500" />
                <Input
                  type="password"
                  placeholder="Senha Master"
                  className="pl-10 h-12 bg-slate-800 border-white/10 focus:ring-red-500/50"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                />
              </div>
              <Button className="w-full h-12 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all">
                Acessar Sistema <ArrowRight className="h-4 w-4" />
              </Button>
            </form>
          </CardContent>
        </Card>
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
