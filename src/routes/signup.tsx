import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  ShieldCheck, 
  Mail, 
  Lock, 
  UserPlus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({ 
        email, 
        password,
        options: {
          data: {
            full_name: fullName,
          }
        }
      });
      if (error) throw error;
      
      if (data.user && data.session) {
        toast.success("Conta criada com sucesso!");
        navigate({ to: "/dashboard" as any });
      } else {
        toast.success("Verifique seu e-mail para confirmar o cadastro.");
        navigate({ to: "/login" as any });
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar conta");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md border-none shadow-2xl bg-background/80 backdrop-blur-xl rounded-[2.5rem] overflow-hidden">
        <CardHeader className="space-y-1 text-center pt-10 pb-6">
          <div className="flex justify-center mb-6">
            <div className="h-20 w-20 rounded-[2rem] bg-primary flex items-center justify-center text-primary-foreground shadow-2xl shadow-primary/40 -rotate-6 transition-transform hover:rotate-0">
              <UserPlus className="h-10 w-10" />
            </div>
          </div>
          <CardTitle className="text-4xl font-black tracking-tighter text-primary">Criar Conta</CardTitle>
          <CardDescription className="text-base font-medium">
            Solicite seu acesso ao VetorControl
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSignup}>
          <CardContent className="grid gap-6 px-8">
            <div className="grid gap-2">
              <Label htmlFor="fullName" className="text-[10px] font-bold uppercase tracking-widest ml-1">Nome Completo</Label>
              <div className="relative">
                <ShieldCheck className="absolute left-4 top-4 h-5 w-5 text-muted-foreground" />
                <Input
                  id="fullName"
                  type="text"
                  placeholder="Seu nome"
                  className="pl-12 h-14 rounded-2xl border-none bg-accent/50 focus-visible:ring-primary/30 text-base"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email" className="text-[10px] font-bold uppercase tracking-widest ml-1">E-mail</Label>
              <div className="relative">
                <Mail className="absolute left-4 top-4 h-5 w-5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  className="pl-12 h-14 rounded-2xl border-none bg-accent/50 focus-visible:ring-primary/30 text-base"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password" className="text-[10px] font-bold uppercase tracking-widest ml-1">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-4 top-4 h-5 w-5 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  className="pl-12 h-14 rounded-2xl border-none bg-accent/50 focus-visible:ring-primary/30 text-base"
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
              {isLoading ? "Criando conta..." : "Criar Conta"}
            </Button>
          </CardContent>
        </form>
        <CardFooter className="flex justify-center pb-10">
          <p className="text-sm text-muted-foreground font-medium">
            Já tem uma conta? <Button variant="link" onClick={() => navigate({ to: "/login" as any })} className="p-0 h-auto text-primary font-bold hover:underline">Entrar</Button>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
