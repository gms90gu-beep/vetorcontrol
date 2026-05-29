import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ShieldAlert, UserPlus, Mail, Lock, Loader2 } from "lucide-react";

export const Route = createFileRoute("/setup")({
  beforeLoad: async () => {
    // Check if there are any users in the profiles table
    // (We use profiles as a proxy since we can't count auth.users from client without RPC or service role)
    const { count, error } = await supabase
      .from("profiles")
      .select("*", { count: 'exact', head: true });
    
    // If there are already users, don't allow access to setup
    if (!error && count && count > 0) {
      throw redirect({ to: "/login" });
    }
  },
  component: SetupPage,
});

function SetupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // 1. Sign up the user
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name,
          }
        }
      });

      if (signUpError) {
        // If user already exists, try to log in automatically
        if (signUpError.message.toLowerCase().includes("user already registered")) {
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password
          });

          if (signInError) {
            toast.error(
              <div className="flex flex-col gap-2">
                <span>Usuário já existe. Acesse pelo login.</span>
                <Button variant="outline" size="sm" onClick={() => navigate({ to: "/login" })}>
                  Ir para Login
                </Button>
              </div>,
              { duration: 5000 }
            );
            return;
          }

          if (signInData.user) {
            // Check if admin_master role is set
            const { data: profile } = await supabase
              .from("profiles")
              .select("role")
              .eq("id", signInData.user.id)
              .maybeSingle();

            if (!profile || profile.role !== 'admin_master') {
              await supabase
                .from("profiles")
                .update({ role: "admin_master" })
                .eq("id", signInData.user.id);
            }

            toast.success("Login automático realizado como Admin Master");
            navigate({ to: "/admin-master" as any });
            return;
          }
        }
        throw signUpError;
      }

      if (!authData.user) throw new Error("Erro ao criar usuário");

      // 2. Set as admin_master
      // Wait a bit for triggers to finish.
      await new Promise(resolve => setTimeout(resolve, 1500));

      const { error: roleError } = await supabase
        .from("profiles")
        .update({ role: "admin_master" })
        .eq("id", authData.user.id);

      if (roleError) {
        console.error("Role error:", roleError);
      }

      toast.success("Administrador Master criado com sucesso!");
      navigate({ to: "/admin-master" as any });
    } catch (error: any) {
      toast.error(error.message || "Erro ao configurar sistema");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <Card className="w-full max-w-md border-white/10 bg-slate-900 text-white shadow-2xl">
        <CardHeader className="text-center space-y-1">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 rounded-2xl bg-primary/20 flex items-center justify-center text-primary border border-primary/30">
              <ShieldAlert className="h-8 w-8" />
            </div>
          </div>
          <CardTitle className="text-3xl font-black uppercase tracking-tighter">Configuração Inicial</CardTitle>
          <CardDescription className="text-slate-400">
            Crie a conta do Administrador Master para começar.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSetup}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome Completo</Label>
              <Input
                id="name"
                placeholder="Seu nome"
                className="bg-slate-800 border-white/10"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@vetorcontrol.com"
                  className="pl-10 bg-slate-800 border-white/10"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className="pl-10 bg-slate-800 border-white/10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button 
              type="submit" 
              className="w-full h-12 text-lg font-bold" 
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Configurando...
                </>
              ) : (
                <>
                  <UserPlus className="mr-2 h-5 w-5" />
                  Criar Conta Master
                </>
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
