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
    throw redirect({ to: "/login" });
  },
  component: () => null,
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
      // 1. Try to sign up the user
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name,
          }
        }
      });

      let user = authData.user;

      if (signUpError) {
        // If user already exists, try to log in
        if (signUpError.message.toLowerCase().includes("user already registered")) {
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password
          });

          if (signInError) {
            toast.error("Usuário já existe com senha diferente. Acesse pelo login.");
            navigate({ to: "/login" });
            return;
          }
          user = signInData.user;
        } else {
          throw signUpError;
        }
      }

      if (!user) throw new Error("Erro ao acessar conta");

      // 2. Ensure profile exists and has admin_master role
      // Wait a bit for auth triggers to complete profile creation if it was a new signup
      await new Promise(resolve => setTimeout(resolve, 1000));

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile) {
        // Insert profile if missing
        await supabase
          .from("profiles")
          .insert({ 
            id: user.id, 
            role: "admin_master",
            full_name: name 
          });
      } else if (profile.role !== "admin_master") {
        // Update role if exists but not admin
        await supabase
          .from("profiles")
          .update({ role: "admin_master" })
          .eq("id", user.id);
      }

      toast.success("Administrador Master configurado!");
      navigate({ to: "/dashboard" as any });
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
