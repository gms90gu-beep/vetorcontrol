import React, { useState, useEffect, useCallback } from "react";
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
  KeyRound,
  Save,
  Power,
  Loader2,
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  registration_number: string | null;
  city: string | null;
  is_active: boolean | null;
  created_at: string;
};

type EditState = {
  full_name: string;
  email: string;
  phone: string;
  role: string;
  is_active: boolean;
};

type HistoryStats = {
  visits: number;
  blocks: number;
  lastActivity: string | null;
};

export function AdminMasterDashboard() {
  const { role: currentUserRole, user: currentUser } = useAuth();
  const isAdminMaster =
    currentUserRole === "admin_master" || currentUser?.email === "gms90gu@gmail.com";

  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUser, setNewUser] = useState({
    full_name: "",
    email: "",
    password: "",
    role: "supervisor" as "supervisor" | "coordenador" | "agente",
  });

  // Detail/edit drawer state
  const [selected, setSelected] = useState<ProfileRow | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [history, setHistory] = useState<HistoryStats | null>(null);
  const [agentPhone, setAgentPhone] = useState<string>("");

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setUsers((data as ProfileRow[]) ?? []);
    } catch (error) {
      console.error("Error fetching users:", error);
      toast.error("Erro ao carregar usuários");
    } finally {
      setIsLoading(false);
    }
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    toast.info("Processando cadastro...");
    try {
      const { error } = await supabase.functions.invoke("manage-agents", {
        body: { action: "create_manager", userData: newUser },
      });
      if (error) throw error;
      toast.success(`${newUser.role} cadastrado com sucesso!`);
      setIsAddingUser(false);
      setNewUser({ full_name: "", email: "", password: "", role: "supervisor" });
      fetchUsers();
    } catch (error: any) {
      console.error("Error creating user:", error);
      toast.error("Erro ao cadastrar: " + (error.message ?? "desconhecido"));
    }
  };

  const openDetails = useCallback(async (u: ProfileRow) => {
    setSelected(u);
    setEdit({
      full_name: u.full_name ?? "",
      email: u.email ?? "",
      phone: "",
      role: u.role,
      is_active: u.is_active ?? true,
    });
    setHistory(null);
    setAgentPhone("");

    setHistoryLoading(true);
    try {
      // Get agent record for phone + agent_id
      const { data: agent } = await supabase
        .from("agents")
        .select("id, phone")
        .eq("profile_id", u.id)
        .maybeSingle();

      if (agent?.phone) {
        setAgentPhone(agent.phone);
        setEdit((prev) => (prev ? { ...prev, phone: agent.phone ?? "" } : prev));
      }

      let visitCount = 0;
      let blockCount = 0;
      let lastActivity: string | null = null;

      if (agent?.id) {
        const { count: vc } = await supabase
          .from("visits")
          .select("*", { count: "exact", head: true })
          .eq("agent_id", agent.id);
        visitCount = vc ?? 0;

        const { data: lastVisit } = await supabase
          .from("visits")
          .select("visit_date")
          .eq("agent_id", agent.id)
          .order("visit_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        lastActivity = lastVisit?.visit_date ?? null;

        const { data: dailyRecs } = await supabase
          .from("daily_work_records")
          .select("properties_worked")
          .eq("agent_id", agent.id);
        blockCount = (dailyRecs ?? []).reduce(
          (acc, r: any) => acc + (r.properties_worked ?? 0),
          0,
        );
      }

      setHistory({ visits: visitCount, blocks: blockCount, lastActivity });
    } catch (e) {
      console.error("[Admin] Erro carregando histórico:", e);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const handleSave = async () => {
    if (!selected || !edit) return;
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke("manage-agents", {
        body: {
          action: "update_user",
          userData: {
            userId: selected.id,
            full_name: edit.full_name,
            email: edit.email,
            phone: edit.phone,
            role: isAdminMaster ? edit.role : undefined,
            is_active: edit.is_active,
          },
        },
      });
      if (error) throw error;
      toast.success("Alterações salvas");
      await fetchUsers();
      setSelected(null);
    } catch (e: any) {
      console.error("Save error:", e);
      toast.error("Erro ao salvar: " + (e.message ?? "desconhecido"));
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!selected) return;
    if (!confirm("Gerar nova senha temporária para este usuário?\n\nNo próximo login, ele será obrigado a definir uma nova senha.")) return;
    try {
      const { data, error } = await supabase.functions.invoke("manage-agents", {
        body: { action: "reset_password", userId: selected.id },
      });
      if (error) throw error;
      const temp = (data as any)?.tempPassword;
      if (temp) {
        toast.success("Senha temporária: " + temp, {
          duration: 20000,
          description: "Compartilhe com o usuário. Ele será obrigado a trocá-la no próximo login.",
        });
      } else {
        toast.success("Senha redefinida");
      }
    } catch (e: any) {
      console.error("[AdminMaster] Erro ao redefinir senha:", e);
      toast.error("Erro ao redefinir senha: " + (e.message ?? ""));
    }
  };

  const handleSendResetEmail = async () => {
    if (!selected?.email) {
      toast.error("Usuário sem e-mail cadastrado.");
      return;
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(selected.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("E-mail de redefinição enviado para " + selected.email);
    } catch (e: any) {
      console.error("[AdminMaster] Erro ao enviar e-mail de redefinição:", e);
      toast.error("Erro ao enviar e-mail: " + (e.message ?? ""));
    }
  };

  const handleToggleActive = async () => {
    if (!selected || !edit) return;
    setEdit({ ...edit, is_active: !edit.is_active });
  };

  const handleDelete = async () => {
    if (!selected) return;
    if (!confirm(`Excluir definitivamente ${selected.full_name}?`)) return;
    try {
      const { error } = await supabase.functions.invoke("manage-agents", {
        body: { action: "delete_user", userId: selected.id },
      });
      if (error) throw error;
      toast.success("Usuário excluído");
      await fetchUsers();
      setSelected(null);
    } catch (e: any) {
      toast.error("Erro ao excluir: " + (e.message ?? ""));
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchTerm.toLowerCase()),
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
          <p className="text-slate-400 font-medium">Gestão global: Supervisores, Agentes e Coordenadores.</p>
        </div>

        <Dialog open={isAddingUser} onOpenChange={setIsAddingUser}>
          <div className="flex flex-wrap gap-4">
            <DialogTrigger asChild>
              <Button
                onClick={() => setNewUser((prev) => ({ ...prev, role: "supervisor" }))}
                className="rounded-2xl h-14 px-8 font-black bg-blue-600 text-white hover:bg-blue-700 transition-all active:scale-95 shadow-2xl shadow-blue-500/10 uppercase tracking-widest text-xs"
              >
                <UserPlus className="mr-2 h-5 w-5" /> Novo Supervisor
              </Button>
            </DialogTrigger>
            <DialogTrigger asChild>
              <Button
                onClick={() => setNewUser((prev) => ({ ...prev, role: "agente" }))}
                className="rounded-2xl h-14 px-8 font-black bg-emerald-600 text-white hover:bg-emerald-700 transition-all active:scale-95 shadow-2xl shadow-emerald-500/10 uppercase tracking-widest text-xs"
              >
                <UserPlus className="mr-2 h-5 w-5" /> Novo Agente
              </Button>
            </DialogTrigger>
          </div>
          <DialogContent className="sm:max-w-[425px] bg-slate-900 border-slate-800 text-white rounded-[2.5rem]">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black uppercase tracking-tight italic">Novo Gestor</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateUser} className="space-y-4 mt-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Nome</label>
                <Input value={newUser.full_name} onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })} className="bg-slate-800 border-none rounded-xl" required />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">E-mail</label>
                <Input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} className="bg-slate-800 border-none rounded-xl" required />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Senha</label>
                <Input type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} className="bg-slate-800 border-none rounded-xl" required />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Nível de Acesso</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value as any })}
                  className="w-full bg-slate-800 border-none rounded-xl h-10 px-3 text-sm font-bold text-white outline-none"
                >
                  <option value="supervisor">SUPERVISOR</option>
                  <option value="agente">AGENTE</option>
                  <option value="coordenador">COORDENADOR</option>
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
              placeholder="Localizar usuário por nome ou e-mail..."
              className="pl-12 bg-slate-950/50 border-none rounded-2xl h-14 text-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="p-4 space-y-3">
          {isLoading ? (
            <div className="py-20 text-center text-slate-500 font-bold animate-pulse uppercase tracking-[0.3em]">Carregando Sistema...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-20 text-center text-slate-500 uppercase font-black opacity-30">Vazio</div>
          ) : (
            filteredUsers.map((user) => (
              <div
                key={user.id}
                onClick={() => openDetails(user)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") openDetails(user);
                }}
                className="group flex items-center justify-between p-6 rounded-3xl bg-slate-950/30 hover:bg-slate-950/60 transition-all border border-transparent hover:border-amber-500/30 cursor-pointer"
              >
                <div className="flex items-center gap-6">
                  <div className="h-14 w-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center font-black text-slate-600 text-xl group-hover:text-amber-500 group-hover:border-amber-500/30 transition-all">
                    {user.full_name?.charAt(0) ?? "?"}
                  </div>
                  <div>
                    <h3 className="font-black text-white uppercase text-lg italic tracking-tight">{user.full_name}</h3>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{user.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {user.is_active === false && (
                    <Badge className="bg-rose-500/20 text-rose-400 border-none text-[9px] font-black uppercase">Inativo</Badge>
                  )}
                  <Badge
                    className={cn(
                      "px-3 py-1 font-black text-[9px] uppercase tracking-[0.2em] border-none rounded-md",
                      user.role === "admin_master"
                        ? "bg-amber-500 text-slate-950"
                        : user.role === "coordenador"
                          ? "bg-blue-500 text-white"
                          : user.role === "supervisor"
                            ? "bg-purple-500 text-white"
                            : user.role === "agente"
                              ? "bg-emerald-500 text-white"
                              : "bg-slate-800 text-slate-400",
                    )}
                  >
                    {user.role?.replace("_", " ")}
                  </Badge>
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
        </div>

        <div className="p-8 rounded-[2.5rem] bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 relative overflow-hidden group">
          <div className="absolute -right-8 -bottom-8 opacity-5 group-hover:rotate-12 transition-transform duration-700">
            <Lock className="h-40 w-40 text-white" />
          </div>
          <h4 className="text-xl font-black text-white uppercase italic mb-2">Segurança</h4>
          <p className="text-slate-400 text-sm font-medium">Logs de auditoria e controle de acesso.</p>
        </div>
      </div>

      {/* ── Drawer de Detalhes/Edição ───────────────────────────────────── */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-xl bg-slate-950 border-l border-slate-800 text-white overflow-y-auto"
        >
          {selected && edit && (
            <>
              <SheetHeader>
                <SheetTitle className="text-2xl font-black uppercase italic tracking-tight text-white">
                  Detalhes do Usuário
                </SheetTitle>
                <SheetDescription className="text-slate-400">
                  Cadastrado em{" "}
                  {selected.created_at ? new Date(selected.created_at).toLocaleDateString("pt-BR") : "—"}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-5">
                <Field label="Nome completo">
                  <Input
                    value={edit.full_name}
                    onChange={(e) => setEdit({ ...edit, full_name: e.target.value })}
                    className="bg-slate-900 border-slate-800 rounded-xl"
                  />
                </Field>

                <Field label="E-mail">
                  <Input
                    type="email"
                    value={edit.email}
                    onChange={(e) => setEdit({ ...edit, email: e.target.value })}
                    className="bg-slate-900 border-slate-800 rounded-xl"
                  />
                </Field>

                <Field label="Telefone">
                  <Input
                    value={edit.phone}
                    onChange={(e) => setEdit({ ...edit, phone: e.target.value })}
                    placeholder="(11) 99999-9999"
                    className="bg-slate-900 border-slate-800 rounded-xl"
                  />
                </Field>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Matrícula">
                    <Input
                      readOnly
                      value={selected.registration_number ?? "—"}
                      className="bg-slate-900/60 border-slate-800 rounded-xl text-slate-400"
                    />
                  </Field>
                  <Field label="Município/Área">
                    <Input
                      readOnly
                      value={selected.city ?? "—"}
                      className="bg-slate-900/60 border-slate-800 rounded-xl text-slate-400"
                    />
                  </Field>
                </div>

                <Field label="Perfil">
                  <select
                    value={edit.role}
                    disabled={!isAdminMaster}
                    onChange={(e) => setEdit({ ...edit, role: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl h-10 px-3 text-sm font-bold text-white outline-none disabled:opacity-60"
                  >
                    <option value="agente">AGENTE</option>
                    <option value="supervisor">SUPERVISOR</option>
                    <option value="coordenador">COORDENADOR</option>
                    <option value="admin_master">ADMIN MASTER</option>
                  </select>
                  {!isAdminMaster && (
                    <p className="text-[10px] text-slate-500 mt-1">Somente Admin Master pode alterar perfis.</p>
                  )}
                </Field>

                <Field label="Status">
                  <div className="flex items-center gap-3">
                    <Badge className={edit.is_active ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"}>
                      {edit.is_active ? "ATIVO" : "INATIVO"}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleToggleActive}
                      className="border-slate-800 text-slate-300 hover:bg-slate-900"
                    >
                      <Power className="mr-2 h-3 w-3" />
                      {edit.is_active ? "Desativar" : "Ativar"}
                    </Button>
                  </div>
                </Field>

                {/* História */}
                <div className="pt-4 border-t border-slate-800">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Histórico</h4>
                  {historyLoading ? (
                    <div className="flex items-center gap-2 text-slate-400 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" /> Carregando histórico...
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-3">
                      <Stat label="Visitas" value={history?.visits ?? 0} />
                      <Stat label="Imóveis" value={history?.blocks ?? 0} />
                      <Stat
                        label="Última atividade"
                        value={
                          history?.lastActivity
                            ? new Date(history.lastActivity).toLocaleDateString("pt-BR")
                            : "—"
                        }
                      />
                    </div>
                  )}
                </div>

                {/* Ações */}
                <div className="pt-4 border-t border-slate-800 space-y-3">
                  <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full h-12 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black uppercase tracking-widest text-xs"
                  >
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Salvar Alterações
                  </Button>
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      onClick={handleResetPassword}
                      variant="outline"
                      className="h-11 rounded-xl border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
                    >
                      <KeyRound className="mr-2 h-4 w-4" /> Redefinir Senha
                    </Button>
                    {isAdminMaster && selected.role !== "admin_master" && (
                      <Button
                        onClick={handleDelete}
                        variant="outline"
                        className="h-11 rounded-xl border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Excluir
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</label>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</p>
      <p className="text-lg font-black text-white mt-1">{value}</p>
    </div>
  );
}
