import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { saveSessionLocally } from "@/auth/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ShieldCheck, Mail, Lock, Loader2, Eye, EyeOff } from "lucide-react";

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
  const [showPassword, setShowPassword] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = forgotEmail.trim();
    if (!target || !target.includes("@")) {
      toast.error("Informe um e-mail válido.");
      return;
    }
    setForgotLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(target, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Link de recuperação enviado! Verifique seu e-mail.");
      setForgotOpen(false);
      setForgotEmail("");
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar e-mail de recuperação.");
    } finally {
      setForgotLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const t0 = performance.now();
    const mark = (tag: string, extra?: any) =>
      console.log(`[${tag}] +${Math.round(performance.now() - t0)}ms`, extra ?? "");

    // Promise utility with timeout to avoid hangs
    const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> =>
      Promise.race([
        p,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout ${label} após ${ms}ms`)), ms),
        ),
      ]);

    try {
      mark("AUTH_START", { email });
      const loginEmail = email.includes("@") ? email : `${email}@vetor.com`;

      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({ email: loginEmail, password }),
        15000,
        "signInWithPassword",
      );

      if (error) throw error;
      if (!data.user) throw new Error("Usuário não encontrado");
      mark("AUTH_SUCCESS", { userId: data.user.id });

      if (data.session) {
        try {
          await withTimeout(saveSessionLocally(data.session), 3000, "saveSessionLocally");
        } catch (e) {
          console.warn("[AUTH] saveSessionLocally falhou (seguindo):", e);
        }
      }

      // Busca o role via RPC (SECURITY DEFINER — ignora RLS)
      mark("PROFILE_LOAD");
      let role: string | null = null;
      try {
        const { data: roleData, error: roleError } = await withTimeout(
          supabase.rpc("get_user_role", { u_id: data.user.id }),
          8000,
          "get_user_role",
        );
        if (roleError) console.error("[PROFILE_LOAD] erro RPC:", roleError);
        role = (roleData as string | null) ?? null;
      } catch (e) {
        console.error("[PROFILE_LOAD] timeout/exceção (fallback /dashboard):", e);
      }
      mark("AGENT_LOAD", { role });

      toast.success("Login realizado com sucesso!");

      const target =
        role === "admin_master" ? "/admin-master"
        : role === "coordenador" ? "/coordenador"
        : role === "supervisor" ? "/supervisor"
        : role === "agente" ? "/agente"
        : "/dashboard";

      mark("AUTH_REDIRECT", { target });
      // Não aguardar navigate — evita prender o botão se algum loader travar
      navigate({ to: target as any, replace: true });
      mark("AUTH_FINISH");
    } catch (error: any) {
      console.error("[AUTH_ERROR]", error);
      toast.error(error?.message || "Erro ao fazer login");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-auth-background px-4 py-6">
      <Card className="w-full max-w-md border-auth-field-border shadow-2xl bg-auth-card text-auth-foreground rounded-[2.5rem] overflow-hidden">
        <CardHeader className="space-y-1 text-center pt-10 pb-6">
          <div className="flex justify-center mb-6">
            <div className="h-20 w-20 rounded-[2rem] bg-primary flex items-center justify-center text-primary-foreground shadow-2xl shadow-primary/40 rotate-12 transition-transform hover:rotate-0">
              <ShieldCheck className="h-10 w-10" />
            </div>
          </div>
          <CardTitle className="text-4xl font-black tracking-tighter text-primary">VetorControl</CardTitle>
          <CardDescription className="text-base font-medium text-auth-muted">
            Sistema de Controle Vetorial Urbano
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <CardContent className="grid gap-6 px-8">
            <div className="grid gap-2">
              <Label htmlFor="email" className="text-[10px] font-bold uppercase tracking-widest ml-1 text-auth-muted">
                E-mail ou Matrícula
              </Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-auth-icon" />
                <Input
                  id="email"
                  placeholder="exemplo@vetor.com ou 12345"
                  className="pl-12 h-14 rounded-2xl border-auth-field-border bg-auth-field text-base text-auth-foreground placeholder:text-auth-muted/70 focus-visible:ring-auth-link/40"
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
                  className="text-[10px] font-bold uppercase tracking-widest ml-1 text-auth-muted"
                >
                  Senha
                </Label>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-auth-icon" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  className="pl-12 pr-16 h-14 rounded-2xl border-auth-field-border bg-auth-field text-base text-auth-foreground placeholder:text-auth-muted/70 focus-visible:ring-auth-link/40"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-auth-icon transition-colors hover:bg-auth-field-border hover:text-auth-icon-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-auth-link/60"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setForgotEmail(email.includes("@") ? email : "");
                  setForgotOpen(true);
                }}
                className="min-h-11 self-end rounded-xl px-2 text-sm font-bold text-auth-link underline-offset-4 transition-colors hover:text-auth-link-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-auth-link/60"
              >
                Esqueceu sua senha?
              </button>
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
          <p className="text-sm text-auth-muted font-medium">
            Não tem uma conta?{" "}
            <Link to="/signup" className="text-auth-link font-bold hover:text-auth-link-hover hover:underline">
              Solicitar acesso
            </Link>
          </p>
        </CardFooter>
      </Card>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="bg-auth-card border-auth-field-border text-auth-foreground rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black text-primary">Recuperar Senha</DialogTitle>
            <DialogDescription className="text-auth-muted">
              Informe o e-mail cadastrado e enviaremos um link para você redefinir sua senha.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleForgotPassword} className="grid gap-4 mt-2">
            <div className="grid gap-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-auth-muted">E-mail cadastrado</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-auth-icon" />
                <Input
                  type="email"
                  placeholder="exemplo@vetor.com"
                  className="pl-12 h-12 rounded-xl border-auth-field-border bg-auth-field text-base text-auth-foreground placeholder:text-auth-muted/70 focus-visible:ring-auth-link/40"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            <DialogFooter className="mt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setForgotOpen(false)}
                className="text-auth-muted hover:text-auth-foreground hover:bg-auth-field"
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={forgotLoading} className="min-h-11 rounded-xl font-bold">
                {forgotLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  "Enviar link de recuperação"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
