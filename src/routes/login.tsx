import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ShieldCheck, Mail, Lock, Loader2 } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

async function getSessionAfterLogin() {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    console.debug(`[Login] Tentativa ${attempt} de restaurar sessão pós-login:`, {
      hasSession: Boolean(session),
      userId: session?.user.id,
      error,
    });

    if (session?.user) return session;
    await new Promise((resolve) => window.setTimeout(resolve, 150));
  }

  return null;
}

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  const handleForgotPassword = async () => {
    const target = email.trim();
    if (!target) {
      toast.error("Digite seu e-mail para receber o link de redefinição.");
      return;
    }
    const loginEmail = target.includes("@") ? target : `${target}@vetor.com`;
    setForgotLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(loginEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("E-mail de redefinição enviado com sucesso. Verifique sua caixa de entrada.");
    } catch (err: any) {
      console.error("[Login] Erro ao enviar reset:", err);
      toast.error(err.message || "Erro ao enviar e-mail de redefinição.");
    } finally {
      setForgotLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const loginEmail = email.includes("@") ? email : `${email}@vetor.com`;
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password,
      });

      if (error) throw error;
      if (!data.user) throw new Error("Usuário não encontrado");

      console.debug("[Login] Login autenticado para:", data.user.email ?? data.user.id);

      const session = await getSessionAfterLogin();
      const authenticatedUser = session?.user ?? data.user;

      // Se o admin marcou senha temporária, força troca antes de continuar
      const mustChange = (authenticatedUser.user_metadata as any)?.must_change_password === true;
      if (mustChange) {
        toast.message("Você deve alterar sua senha antes de continuar.");
        await navigate({ to: "/reset-password", replace: true });
        return;
      }

      const { data: roleData, error: roleError } = await supabase.rpc("get_user_role", { u_id: authenticatedUser.id });
      const role = roleData as string | null;

      console.debug("[Login] Role encontrado via RPC:", role, "erro:", roleError);

      toast.success("Login realizado com sucesso!");

      if (role === "admin_master") {
        await navigate({ to: "/admin-master", replace: true });
      } else if (role === "coordenador") {
        await navigate({ to: "/coordenador" as any, replace: true });
      } else if (role === "supervisor") {
        await navigate({ to: "/supervisor" as any, replace: true });
      } else if (role === "agente") {
        await navigate({ to: "/agente" as any, replace: true });
      } else {
        await navigate({ to: "/dashboard", replace: true });
      }
    } catch (error: any) {
      console.error("[Login] Erro:", error);
      toast.error(error.message || "Erro ao fazer login");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <Card className="w-full max-w-md border-white/10 shadow-2xl bg-slate-900 text-white rounded-[2.5rem] overflow-hidden">
        <CardHeader className="space-y-1 text-center pt-10 pb-6">
          <div className="flex justify-center mb-6">
            <div className="h-20 w-20 rounded-[2rem] bg-primary flex items-center justify-center text-primary-foreground shadow-2xl shadow-primary/40 rotate-12 transition-transform hover:rotate-0">
              <ShieldCheck className="h-10 w-10" />
            </div>
          </div>
          <CardTitle className="text-4xl font-black tracking-tighter text-primary">VetorControl</CardTitle>
          <CardDescription className="text-base font-medium text-slate-400">
            Sistema de Controle Vetorial Urbano
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <CardContent className="grid gap-6 px-8">
            <div className="grid gap-2">
              <Label htmlFor="email" className="text-[10px] font-bold uppercase tracking-widest ml-1 text-slate-400">
                E-mail ou Matrícula
              </Label>
              <div className="relative">
                <Mail className="absolute left-4 top-4 h-5 w-5 text-slate-500" />
                <Input
                  id="email"
                  placeholder="exemplo@vetor.com ou 12345"
                  className="pl-12 h-14 rounded-2xl border-white/5 bg-slate-800 focus-visible:ring-primary/30 text-base"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="password"
                  className="text-[10px] font-bold uppercase tracking-widest ml-1 text-slate-400"
                >
                  Senha
                </Label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={forgotLoading}
                  className="text-[11px] font-semibold text-primary hover:underline disabled:opacity-50"
                >
                  {forgotLoading ? "Enviando..." : "Esqueci minha senha"}
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-4 top-4 h-5 w-5 text-slate-500" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className="pl-12 h-14 rounded-2xl border-white/5 bg-slate-800 focus-visible:ring-primary/30 text-base"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>
            <Button
              className="w-full h-14 rounded-2xl text-lg font-bold shadow-xl shadow-primary/20 active:scale-[0.98] transition-all mt-2"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Entrando...
                </>
              ) : (
                "Entrar"
              )}
            </Button>
          </CardContent>
        </form>
        <CardFooter className="flex justify-center pb-10">
          <p className="text-sm text-slate-500 font-medium">
            Não tem uma conta?{" "}
            <Link to="/signup" className="text-primary font-bold hover:underline">
              Solicitar acesso
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
