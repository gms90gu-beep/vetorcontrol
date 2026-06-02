import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Mail, Loader2, ShieldCheck, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = email.trim();
    if (!target) {
      toast.error("Digite seu e-mail.");
      return;
    }
    const loginEmail = target.includes("@") ? target : `${target}@vetor.com`;
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(loginEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Link de recuperação enviado para seu e-mail.");
      await navigate({ to: "/login", replace: true });
    } catch (err: any) {
      console.error("[ForgotPassword] Erro:", err);
      toast.error("Não foi possível enviar o e-mail de recuperação.");
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
          <CardTitle className="text-3xl font-black tracking-tighter text-primary">Recuperar Senha</CardTitle>
          <CardDescription className="text-base font-medium text-slate-400">
            Informe seu e-mail para receber o link
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="grid gap-6 px-8">
            <div className="grid gap-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest ml-1 text-slate-400">
                E-mail
              </Label>
              <div className="relative">
                <Mail className="absolute left-4 top-4 h-5 w-5 text-slate-500" />
                <Input
                  type="text"
                  placeholder="exemplo@vetor.com"
                  className="pl-12 h-14 rounded-2xl border-white/5 bg-slate-800 text-base"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            <Button
              className="w-full h-14 rounded-2xl text-lg font-bold shadow-xl shadow-primary/20 mt-2"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Enviando...
                </>
              ) : (
                "Enviar Link de Recuperação"
              )}
            </Button>
          </CardContent>
        </form>
        <CardFooter className="flex justify-center pb-10">
          <Link to="/login" className="text-sm text-slate-400 hover:text-primary font-medium inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Voltar ao login
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
