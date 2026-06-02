import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Lock, Loader2, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase coloca o token de recuperação no hash da URL (#access_token=...&type=recovery)
    // detectSessionInUrl do client trata isso automaticamente; aguardamos a sessão estar pronta.
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      console.debug("[ResetPassword] Sessão atual:", data.session?.user?.email);
      setReady(true);
    };
    init();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      console.debug("[ResetPassword] Evento auth:", event, session?.user?.email);
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      toast.error("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        throw new Error("Sessão inválida ou expirada. Solicite um novo link de redefinição.");
      }

      const { error } = await supabase.auth.updateUser({
        password,
        data: { must_change_password: false },
      });
      if (error) throw error;

      toast.success("Senha atualizada com sucesso!");
      await navigate({ to: "/login", replace: true });
    } catch (err: any) {
      console.error("[ResetPassword] Erro:", err);
      toast.error(err.message || "Erro ao salvar nova senha.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <Card className="w-full max-w-md border-white/10 shadow-2xl bg-slate-900 text-white rounded-[2.5rem] overflow-hidden">
        <CardHeader className="space-y-1 text-center pt-10 pb-6">
          <div className="flex justify-center mb-6">
            <div className="h-20 w-20 rounded-[2rem] bg-primary flex items-center justify-center text-primary-foreground shadow-2xl shadow-primary/40">
              <ShieldCheck className="h-10 w-10" />
            </div>
          </div>
          <CardTitle className="text-3xl font-black tracking-tighter text-primary">
            Redefinir Senha
          </CardTitle>
          <CardDescription className="text-base font-medium text-slate-400">
            Defina sua nova senha de acesso
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="grid gap-6 px-8 pb-8">
            <div className="grid gap-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest ml-1 text-slate-400">
                Nova senha
              </Label>
              <div className="relative">
                <Lock className="absolute left-4 top-4 h-5 w-5 text-slate-500" />
                <Input
                  type="password"
                  placeholder="••••••••"
                  className="pl-12 h-14 rounded-2xl border-white/5 bg-slate-800 text-base"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest ml-1 text-slate-400">
                Confirmar senha
              </Label>
              <div className="relative">
                <Lock className="absolute left-4 top-4 h-5 w-5 text-slate-500" />
                <Input
                  type="password"
                  placeholder="••••••••"
                  className="pl-12 h-14 rounded-2xl border-white/5 bg-slate-800 text-base"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>
            </div>
            <Button
              className="w-full h-14 rounded-2xl text-lg font-bold shadow-xl shadow-primary/20"
              disabled={loading || !ready}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Salvando...
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
