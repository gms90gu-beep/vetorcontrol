import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Lock, Loader2, Eye, EyeOff, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

function passwordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ["Muito fraca", "Fraca", "Razoável", "Boa", "Forte", "Excelente"];
  const colors = ["bg-red-500", "bg-red-400", "bg-yellow-500", "bg-yellow-400", "bg-green-500", "bg-green-600"];
  return { score, label: labels[score], color: colors[score] };
}

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showCf, setShowCf] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase coloca os tokens no hash; o cliente processa automaticamente.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReady(true);
      }
    });
    // Verifica se já existe sessão de recovery
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const strength = passwordStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("A senha deve ter no mínimo 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      toast.error("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Senha alterada com sucesso. Faça login novamente.");
      await supabase.auth.signOut();
      navigate({ to: "/login", replace: true });
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar senha.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-auth-background px-4 py-6">
      <Card className="w-full max-w-md border-auth-field-border shadow-2xl bg-auth-card text-auth-foreground rounded-[2.5rem] overflow-hidden">
        <CardHeader className="space-y-1 text-center pt-10 pb-6">
          <div className="flex justify-center mb-6">
            <div className="h-20 w-20 rounded-[2rem] bg-primary flex items-center justify-center text-primary-foreground shadow-2xl shadow-primary/40">
              <ShieldCheck className="h-10 w-10" />
            </div>
          </div>
          <CardTitle className="text-3xl font-black tracking-tighter text-primary">Redefinir Senha</CardTitle>
          <CardDescription className="text-base font-medium text-auth-muted">
            Crie uma nova senha segura para sua conta
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="grid gap-6 px-8 pb-10">
            {!ready && (
              <p className="text-sm text-auth-warning text-center">
                Validando link de recuperação... Se a página não liberar, solicite um novo link.
              </p>
            )}
            <div className="grid gap-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest ml-1 text-auth-muted">Nova Senha</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-auth-icon" />
                <Input
                  type={showPw ? "text" : "password"}
                  placeholder="Mínimo 8 caracteres"
                  className="pl-12 pr-16 h-14 rounded-2xl border-auth-field-border bg-auth-field text-base text-auth-foreground placeholder:text-auth-muted/70 focus-visible:ring-auth-link/40"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-auth-icon transition-colors hover:bg-auth-field-border hover:text-auth-icon-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-auth-link/60"
                  aria-label={showPw ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPw ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              {password && (
                <div className="space-y-1">
                  <div className="h-1.5 w-full bg-auth-field rounded-full overflow-hidden">
                    <div
                      className={`h-full ${strength.color} transition-all`}
                      style={{ width: `${(strength.score / 5) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-auth-muted ml-1">Força: {strength.label}</p>
                </div>
              )}
            </div>
            <div className="grid gap-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest ml-1 text-auth-muted">Confirmar Senha</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-auth-icon" />
                <Input
                  type={showCf ? "text" : "password"}
                  placeholder="Repita a senha"
                  className="pl-12 pr-16 h-14 rounded-2xl border-auth-field-border bg-auth-field text-base text-auth-foreground placeholder:text-auth-muted/70 focus-visible:ring-auth-link/40"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowCf((v) => !v)}
                  className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-auth-icon transition-colors hover:bg-auth-field-border hover:text-auth-icon-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-auth-link/60"
                  aria-label={showCf ? "Ocultar confirmação de senha" : "Mostrar confirmação de senha"}
                >
                  {showCf ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              {confirm && password !== confirm && (
                <p className="text-xs text-destructive ml-1">As senhas não coincidem</p>
              )}
            </div>
            <Button
              className="w-full h-14 rounded-2xl text-lg font-bold shadow-xl shadow-primary/20"
              disabled={loading || !ready}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar Nova Senha"
              )}
            </Button>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}
