import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Users, 
  UserPlus, 
  Search, 
  UserCheck, 
  UserX, 
  MoreVertical,
  Activity,
  MapPin,
  ClipboardList,
  Eye
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SupervisionDashboard() {
  const [agents, setAgents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddingAgent, setIsAddingAgent] = useState(false);
  const [newAgent, setNewAgent] = useState({
    full_name: "",
    email: "",
    password: "",
    registration_number: "",
    city: ""
  });

  useEffect(() => {
    fetchAgents();
  }, []);

  async function fetchAgents() {
    setIsLoading(true);
    try {
      // Fetch agents
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select(`
          *,
          user_roles(role)
        `);

      if (profileError) throw profileError;
      
      const filteredAgents = profiles.filter((p: any) => 
        p.user_roles?.some((r: any) => r.role === 'agent')
      );

      // Fetch stats for each agent
      const { data: visits, error: visitError } = await supabase
        .from("visits")
        .select("agent_id, status, has_focus");

      if (visitError) throw visitError;

      const agentsWithStats = filteredAgents.map(agent => {
        const agentVisits = visits.filter(v => v.agent_id === agent.id);
        return {
          ...agent,
          stats: {
            worked: agentVisits.length,
            closed: agentVisits.filter(v => v.status === 'closed').length,
            focus: agentVisits.filter(v => v.has_focus).length
          }
        };
      });
      
      setAgents(agentsWithStats);
    } catch (error) {
      console.error("Error fetching agents:", error);
      toast.error("Erro ao carregar lista de agentes");
    } finally {
      setIsLoading(false);
    }
  }

  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    toast.info("Criando novo agente...");
    
    try {
      const { data, error } = await supabase.functions.invoke('manage-agents', {
        body: { 
          action: 'create',
          agentData: newAgent
        }
      });

      if (error) throw error;

      toast.success("Agente cadastrado com sucesso!");
      setIsAddingAgent(false);
      setNewAgent({
        full_name: "",
        email: "",
        password: "",
        registration_number: "",
        city: ""
      });
      fetchAgents();
    } catch (error: any) {
      console.error("Error creating agent:", error);
      toast.error(`Erro: ${error.message || "Não foi possível cadastrar o agente"}`);
    }
  };

  const handleToggleStatus = async (userId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase.functions.invoke('manage-agents', {
        body: { 
          action: 'update_status',
          agentData: { userId, active: !currentStatus }
        }
      });

      if (error) throw error;

      toast.success(`Agente ${!currentStatus ? 'ativado' : 'desativado'} com sucesso`);
      fetchAgents();
    } catch (error) {
      console.error("Error toggling agent status:", error);
      toast.error("Erro ao alterar status do agente");
    }
  };

  const filteredAgents = agents.filter(a => 
    a.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.registration_number?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Badge className="bg-primary/10 text-primary mb-2 border-none">Painel de Supervisão</Badge>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white uppercase">Gestão de Equipe</h1>
          <p className="text-sm font-medium text-slate-500">Monitore, cadastre e gerencie seus agentes de campo.</p>
        </div>
        
        <Dialog open={isAddingAgent} onOpenChange={setIsAddingAgent}>
          <DialogTrigger asChild>
            <Button className="rounded-2xl h-12 px-6 font-bold bg-slate-900 hover:bg-slate-800 text-white shadow-lg transition-all active:scale-95">
              <UserPlus className="mr-2 h-5 w-5" /> Novo Agente
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px] rounded-[2rem] border-none shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black uppercase tracking-tight">Cadastrar Agente</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateAgent} className="space-y-4 mt-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nome Completo</label>
                <Input 
                  value={newAgent.full_name} 
                  onChange={e => setNewAgent({...newAgent, full_name: e.target.value})}
                  className="rounded-xl bg-slate-50 border-slate-100" 
                  placeholder="Ex: João da Silva" 
                  required 
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">E-mail (Login)</label>
                <Input 
                  type="email"
                  value={newAgent.email} 
                  onChange={e => setNewAgent({...newAgent, email: e.target.value})}
                  className="rounded-xl bg-slate-50 border-slate-100" 
                  placeholder="exemplo@email.com" 
                  required 
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Senha Temporária</label>
                <Input 
                  type="password"
                  value={newAgent.password} 
                  onChange={e => setNewAgent({...newAgent, password: e.target.value})}
                  className="rounded-xl bg-slate-50 border-slate-100" 
                  placeholder="Min. 6 caracteres" 
                  required 
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Matrícula</label>
                  <Input 
                    value={newAgent.registration_number} 
                    onChange={e => setNewAgent({...newAgent, registration_number: e.target.value})}
                    className="rounded-xl bg-slate-50 border-slate-100" 
                    placeholder="00000" 
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Município</label>
                  <Input 
                    value={newAgent.city} 
                    onChange={e => setNewAgent({...newAgent, city: e.target.value})}
                    className="rounded-xl bg-slate-50 border-slate-100" 
                    placeholder="Ex: Natal" 
                    required 
                  />
                </div>
              </div>
              <Button type="submit" className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold mt-2">
                Salvar Cadastro
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatsCard title="Total de Agentes" value={agents.length} icon={Users} color="bg-blue-50 text-blue-600" />
        <StatsCard title="Ativos em Campo" value={agents.filter(a => a.is_active).length} icon={Activity} color="bg-emerald-50 text-emerald-600" />
        <StatsCard title="Inativos" value={agents.filter(a => !a.is_active).length} icon={UserX} color="bg-rose-50 text-rose-600" />
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-6 shadow-sm border border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Buscar por nome ou matrícula..." 
              className="pl-10 rounded-2xl bg-slate-50 dark:bg-slate-800 border-none h-12"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-3">
          {isLoading ? (
            <div className="py-20 text-center text-slate-400 font-medium">Carregando agentes...</div>
          ) : filteredAgents.length === 0 ? (
            <div className="py-20 text-center text-slate-400 font-medium">Nenhum agente encontrado.</div>
          ) : (
            filteredAgents.map(agent => (
              <div 
                key={agent.id} 
                className="group flex flex-col md:flex-row md:items-center justify-between p-4 rounded-3xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
              >
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 flex items-center justify-center font-black text-slate-400">
                    {agent.full_name?.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800 dark:text-white uppercase tracking-tight leading-none mb-1">
                      {agent.full_name}
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Matrícula: {agent.registration_number}</span>
                      <span className="text-slate-300">•</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{agent.city}</span>
                    </div>
                    {/* Production stats */}
                    <div className="flex items-center gap-4 mt-2">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Trabalhados</span>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{agent.stats?.worked || 0}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Fechados</span>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{agent.stats?.closed || 0}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Focos</span>
                        <span className="text-xs font-bold text-rose-500">{agent.stats?.focus || 0}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between md:justify-end gap-3 mt-4 md:mt-0">
                  <Badge className={cn(
                    "rounded-lg px-2 py-1 font-black text-[9px] uppercase tracking-widest border-none",
                    agent.is_active ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                  )}>
                    {agent.is_active ? "ATIVO" : "INATIVO"}
                  </Badge>
                  
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="rounded-xl hover:bg-white dark:hover:bg-slate-700 shadow-sm transition-all active:scale-90">
                      <Eye className="h-4 w-4 text-slate-400" />
                    </Button>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="rounded-xl hover:bg-white dark:hover:bg-slate-700 shadow-sm transition-all active:scale-90">
                          <MoreVertical className="h-4 w-4 text-slate-400" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="rounded-xl border-slate-100 dark:border-slate-800 shadow-xl">
                        <DropdownMenuItem 
                          onClick={() => handleToggleStatus(agent.id, agent.is_active)}
                          className="flex items-center gap-2 font-bold text-xs uppercase tracking-tight py-2"
                        >
                          {agent.is_active ? <UserX className="h-4 w-4 text-rose-500" /> : <UserCheck className="h-4 w-4 text-emerald-500" />}
                          {agent.is_active ? "Desativar Agente" : "Ativar Agente"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function StatsCard({ title, value, icon: Icon, color }: any) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-6 border border-slate-100 dark:border-slate-800 shadow-sm">
      <div className="flex items-center gap-4">
        <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center", color)}>
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">{title}</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">{value}</p>
        </div>
      </div>
    </div>
  );
}

import { cn } from "@/lib/utils";
