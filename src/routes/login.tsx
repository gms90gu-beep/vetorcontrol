import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ShieldCheck, Mail, Lock, Loader2 } from "lucide-react";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    // Check if system needs setup (no users)
    const { count, error } = await supabase
      .from("profiles")
      .select("*", { count: 'exact', head: true });
    
    if (!error && count === 0) {
      throw redirect({ to: "/setup" });
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      // 1. Try normal login
      const { data, error } = await supabase.auth.signInWithPassword({ 
        email: email.includes('@') ? email : `${email}@vetor.com`, 
        password 
      });

      if (error) {
        throw error;
      }

      if (!data.user) throw new Error("Usuário não encontrado");

      // Check if it's the admin email from env vars
      const adminEmail = import.meta.env.VITE_ADMIN_EMAIL;
      const userEmail = data.user?.email;

      let userRole = 'agente';

      // Ensure profile exists and check role
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();

      if (profile) {
        userRole = profile.role;
      }

      // If it's the admin email, force admin_master role if not set
      if (adminEmail && userEmail === adminEmail && userRole !== 'admin_master') {
        const { error: updateError } = await supabase
          .from("profiles")
          .update({ role: 'admin_master' })
          .eq("id", data.user.id);
        
        if (!updateError) {
          userRole = 'admin_master';
        }
      }

      toast.success("Login realizado com sucesso!");
      
      // Redirect based on role
      if (userRole === 'admin_master') {
        navigate({ to: "/admin-master" as any });
      } else if (userRole === 'supervisor' || userRole === 'coordenador') {
        navigate({ to: "/supervision" as any });
      } else {
        navigate({ to: "/dashboard" as any });
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao fazer login");
    } finally {
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
              <Label htmlFor="email" className="text-[10px] font-bold uppercase tracking-widest ml-1 text-slate-400">E-mail ou Matrícula</Label>
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
                <Label htmlFor="password" className="text-[10px] font-bold uppercase tracking-widest ml-1 text-slate-400">Senha</Label>
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
              ) : "Entrar"}
            </Button>
          </CardContent>
        </form>
        <CardFooter className="flex justify-center pb-10">
          <p className="text-sm text-slate-500 font-medium">
            Não tem uma conta? <Link to="/signup" className="text-primary font-bold hover:underline">Solicitar acesso</Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
