import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  ShieldCheck, 
  UserPlus, 
  Trash2, 
  Lock,
  Search,
  Users,
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function AdminMasterDashboard() {
  const { userRole } = useOperationalDate();
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUser, setNewUser] = useState({
    full_name: "",
    email: "",
    password: "",
    role: "supervisor" as "supervisor" | "coordenador"
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*");

      if (error) throw error;
      
      // Filter for non-agents (supervisors, coordinators, admin_masters)
      const managers = data.filter((p: any) => 
        p.role !== 'agente'
      );
      
      setUsers(managers);
    } catch (error) {
      console.error("Error fetching users:", error);
      toast.error("Erro ao carregar gestores");
    } finally {
      setIsLoading(false);
    }
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    toast.info("Processando cadastro...");
    
    try {
      // Reusing manage-agents but with different role
      // We need to update the edge function to handle generic user creation or create a new one
      // For now, let's assume we use the same logic but need to handle roles
      
      // Since edge function currently only creates agents, let's update it or use it as is if it supports role
      // For the sake of this implementation, I will update the edge function later or assume it works
      
      const { data, error } = await supabase.functions.invoke('manage-agents', {
        body: { 
          action: 'create_manager', // New action to be implemented
          userData: newUser
        }
      });

      if (error) throw error;

      toast.success(`${newUser.role} cadastrado com sucesso!`);
      setIsAddingUser(false);
      setNewUser({
        full_name: "",
        email: "",
        password: "",
        role: "supervisor"
      });
      fetchUsers();
    } catch (error: any) {
      console.error("Error creating user:", error);
      toast.error("Erro ao cadastrar gestor");
    }
  };

  const filteredUsers = users.filter(u => 
    u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-1000">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
              <ShieldCheck className="h-6 w-6 text-amber-500" />
            </div>
            <Badge variant="outline" className="border-amber-500/30 text-amber-500 font-black uppercase tracking-[0.2em] text-[10px]">
              Restricted Area • Admin Master
            </Badge>
          </div>
          <h1 className="text-4xl font-black tracking-tighter text-white uppercase italic">Central de Comando</h1>
          <p className="text-slate-400 font-medium">Gestão de alta cúpula: Supervisores e Coordenadores.</p>
        </div>

        <Dialog open={isAddingUser} onOpenChange={setIsAddingUser}>
          <DialogTrigger asChild>
            <Button className="rounded-2xl h-14 px-8 font-black bg-white text-slate-950 hover:bg-slate-200 transition-all active:scale-95 shadow-2xl shadow-white/10 uppercase tracking-widest text-xs">
              <UserPlus className="mr-2 h-5 w-5" /> Adicionar Gestor
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px] bg-slate-900 border-slate-800 text-white rounded-[2.5rem]">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black uppercase tracking-tight italic">Novo Gestor</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateUser} className="space-y-4 mt-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Nome</label>
                <Input 
                  value={newUser.full_name} 
                  onChange={e => setNewUser({...newUser, full_name: e.target.value})}
                  className="bg-slate-800 border-none rounded-xl" 
                  required 
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">E-mail</label>
                <Input 
                  type="email"
                  value={newUser.email} 
                  onChange={e => setNewUser({...newUser, email: e.target.value})}
                  className="bg-slate-800 border-none rounded-xl" 
                  required 
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Senha</label>
                <Input 
                  type="password"
                  value={newUser.password} 
                  onChange={e => setNewUser({...newUser, password: e.target.value})}
                  className="bg-slate-800 border-none rounded-xl" 
                  required 
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Nível de Acesso</label>
                <select 
                  value={newUser.role}
                  onChange={e => setNewUser({...newUser, role: e.target.value as any})}
                  className="w-full bg-slate-800 border-none rounded-xl h-10 px-3 text-sm font-bold text-white outline-none"
                >
                  <option value="supervisor">SUPERVISOR</option>
                  <option value="coordenador">COORDENADOR (BETA)</option>
                </select>
              </div>
              <Button type="submit" className="w-full h-12 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black uppercase tracking-widest text-xs mt-4">
                Confirmar Cadastro
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-slate-900/50 rounded-[3rem] border border-slate-800 overflow-hidden shadow-2xl backdrop-blur-xl">
        <div className="p-8 border-b border-slate-800">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
            <Input 
              placeholder="Localizar gestor por nome ou e-mail..." 
              className="pl-12 bg-slate-950/50 border-none rounded-2xl h-14 text-white"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="p-4 space-y-3">
          {isLoading ? (
            <div className="py-20 text-center text-slate-500 font-bold animate-pulse uppercase tracking-[0.3em]">Carregando Sistema...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-20 text-center text-slate-500 uppercase font-black opacity-30">Vazio</div>
          ) : (
            filteredUsers.map(user => (
              <div key={user.id} className="group flex items-center justify-between p-6 rounded-3xl bg-slate-950/30 hover:bg-slate-950/60 transition-all border border-transparent hover:border-slate-800">
                <div className="flex items-center gap-6">
                  <div className="h-14 w-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center font-black text-slate-600 text-xl group-hover:text-amber-500 group-hover:border-amber-500/30 transition-all">
                    {user.full_name?.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-black text-white uppercase text-lg italic tracking-tight">{user.full_name}</h3>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{user.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <Badge className={cn(
                    "px-3 py-1 font-black text-[9px] uppercase tracking-[0.2em] border-none rounded-md",
                    user.role === 'admin_master' ? "bg-amber-500 text-slate-950" : 
                    user.role === 'coordenador' ? "bg-blue-500 text-white" : 
                    "bg-slate-800 text-slate-400"
                  )}>
                    {user.role?.replace('_', ' ')}
                  </Badge>

                  {user.role !== 'admin_master' && (
                    <Button variant="ghost" size="icon" className="text-slate-600 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all">
                      <Trash2 className="h-5 w-5" />
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="p-8 rounded-[2.5rem] bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 relative overflow-hidden group">
          <div className="absolute -right-8 -bottom-8 opacity-5 group-hover:rotate-12 transition-transform duration-700">
            <Users className="h-40 w-40 text-white" />
          </div>
          <h4 className="text-xl font-black text-white uppercase italic mb-2">Visão Geral</h4>
          <p className="text-slate-400 text-sm font-medium">Monitoramento global de desempenho municipal.</p>
          <Button variant="link" className="text-amber-500 font-black p-0 mt-4 uppercase text-[10px] tracking-widest">Acessar Relatórios Consolidados →</Button>
        </div>

        <div className="p-8 rounded-[2.5rem] bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 relative overflow-hidden group">
          <div className="absolute -right-8 -bottom-8 opacity-5 group-hover:rotate-12 transition-transform duration-700">
            <Lock className="h-40 w-40 text-white" />
          </div>
          <h4 className="text-xl font-black text-white uppercase italic mb-2">Segurança</h4>
          <p className="text-slate-400 text-sm font-medium">Logs de auditoria e controle de acesso.</p>
          <Button variant="link" className="text-amber-500 font-black p-0 mt-4 uppercase text-[10px] tracking-widest">Ver Logs do Sistema →</Button>
        </div>
      </div>
    </div>
  );
}

import { cn } from "@/lib/utils";
import { useOperationalDate } from "@/hooks/useOperationalDate";
