import React, { useState, useEffect, useCallback, useMemo } from "react";
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
  UserCog,
  Shield,
  UserCheck,
  Wrench,
  AlertTriangle,

} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
  supervisor_id: string | null;
};

type EditState = {
  full_name: string;
  email: string;
  phone: string;
  role: string;
  is_active: boolean;
  supervisor_id: string | null;
};

type HistoryStats = {
  visits: number;
  blocks: number;
  lastActivity: string | null;
};

type RoleFilter = "all" | "supervisor" | "agente" | "coordenador" | "admin_master";

type NewUserRole = "supervisor" | "coordenador" | "agente" | "admin_master";

const ROLE_LABELS: Record<string, string> = {
  admin_master: "Admin Master",
  coordenador: "Coordenador",
  supervisor: "Supervisor",
  agente: "Agente",
};

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function roleBadgeClass(role: string): string {
  switch (role) {
    case "admin_master":
      return "bg-purple-500 text-white";
    case "coordenador":
      return "bg-amber-500 text-slate-950";
    case "supervisor":
      return "bg-blue-500 text-white";
    case "agente":
      return "bg-emerald-500 text-white";
    default:
      return "bg-slate-800 text-slate-400";
  }
}

export function AdminMasterDashboard() {
  const { role: currentUserRole, user: currentUser } = useAuth();
  const isAdminMaster =
    currentUserRole === "admin_master" || currentUser?.email === "gms90gu@gmail.com";

  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUser, setNewUser] = useState({
    full_name: "",
    email: "",
    password: "",
    role: "supervisor" as NewUserRole,
  });

  // Detail/edit drawer state
  const [selected, setSelected] = useState<ProfileRow | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [history, setHistory] = useState<HistoryStats | null>(null);

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

  const handleOpenCreate = (role: NewUserRole) => {
    setNewUser({ full_name: "", email: "", password: "", role });
    setIsAddingUser(true);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    toast.info("Processando cadastro...");
    try {
      if (newUser.role === "admin_master") {
        // Create as coordenador first, then promote via update_user (admin only)
        const { error: cErr } = await supabase.functions.invoke("manage-agents", {
          body: {
            action: "create_manager",
            userData: { ...newUser, role: "coordenador" },
          },
        });
        if (cErr) throw cErr;
        // Find created user id by listing
        const { data: created } = await supabase
          .from("profiles")
          .select("id")
          .eq("email", newUser.email)
          .maybeSingle();
        if (created?.id) {
          const { error: pErr } = await supabase.functions.invoke("manage-agents", {
            body: {
              action: "update_user",
              userData: { userId: created.id, role: "admin_master" },
            },
          });
          if (pErr) throw pErr;
        }
      } else {
        const { error } = await supabase.functions.invoke("manage-agents", {
          body: { action: "create_manager", userData: newUser },
        });
        if (error) throw error;
      }
      toast.success(`${ROLE_LABELS[newUser.role]} cadastrado com sucesso!`);
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
      supervisor_id: u.supervisor_id ?? null,
    });
    setHistory(null);

    setHistoryLoading(true);
    try {
      const { data: agent } = await supabase
        .from("agents")
        .select("id, phone")
        .eq("profile_id", u.id)
        .maybeSingle();

      if (agent?.phone) {
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
            supervisor_id: edit.role === "agente" ? edit.supervisor_id : null,
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
    if (!confirm("Gerar nova senha temporária para este usuário?")) return;
    try {
      const { data, error } = await supabase.functions.invoke("manage-agents", {
        body: { action: "reset_password", userId: selected.id },
      });
      if (error) throw error;
      const temp = (data as any)?.tempPassword;
      if (temp) {
        toast.success("Senha temporária: " + temp, { duration: 15000 });
      } else {
        toast.success("Senha redefinida");
      }
    } catch (e: any) {
      toast.error("Erro ao redefinir senha: " + (e.message ?? ""));
    }
  };

  const handleToggleActive = () => {
    if (!selected || !edit) return;
    setEdit({ ...edit, is_active: !edit.is_active });
  };

  const handleDelete = async () => {
    if (!selected) return;
    // Prevent deleting yourself
    if (currentUser?.id === selected.id) {
      toast.error("Você não pode excluir o próprio usuário logado.");
      return;
    }
    // Prevent deleting last admin master
    if (selected.role === "admin_master") {
      const adminCount = users.filter((u) => u.role === "admin_master").length;
      if (adminCount <= 1) {
        toast.error("Não é possível excluir o último Admin Master do sistema.");
        return;
      }
    }
    if (!confirm(`Deseja realmente excluir ${selected.full_name}?`)) return;
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

  // ── Derived data ──────────────────────────────────────────────────────────
  const counts = useMemo(() => {
    let supervisors = 0;
    let agents = 0;
    let admins = 0;
    let coordinators = 0;
    for (const u of users) {
      if (u.role === "supervisor") supervisors++;
      else if (u.role === "agente") agents++;
      else if (u.role === "admin_master") admins++;
      else if (u.role === "coordenador") coordinators++;
    }
    return { supervisors, agents, admins, coordinators, total: users.length };
  }, [users]);

  const supervisorOptions = useMemo(
    () => users.filter((u) => u.role === "supervisor" && u.is_active !== false),
    [users],
  );

  const filteredUsers = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (!term) return true;
      return (
        u.full_name?.toLowerCase().includes(term) ||
        u.email?.toLowerCase().includes(term) ||
        u.registration_number?.toLowerCase().includes(term)
      );
    });
  }, [users, searchTerm, roleFilter]);

  const supervisorNameById = useMemo(() => {
    const map = new Map<string, string>();
    users.forEach((u) => map.set(u.id, u.full_name ?? u.email ?? "—"));
    return map;
  }, [users]);

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-700">
      {/* ── Cabeçalho ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
            <ShieldCheck className="h-6 w-6 text-amber-500" />
          </div>
          <Badge variant="outline" className="border-amber-500/30 text-amber-500 font-black uppercase tracking-[0.2em] text-[10px]">
            Comando
          </Badge>
        </div>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tighter text-white uppercase italic">
          Central de Comando
        </h1>
        <p className="text-slate-400 font-medium text-sm sm:text-base">
          Gestão Global · Supervisores · Agentes · Administradores
        </p>
      </div>

      {/* ── Cards de Resumo ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <SummaryCard label="Supervisores" value={counts.supervisors} icon={UserCog} accent="text-blue-400 border-blue-500/20 bg-blue-500/5" />
        <SummaryCard label="Agentes" value={counts.agents} icon={UserCheck} accent="text-emerald-400 border-emerald-500/20 bg-emerald-500/5" />
        <SummaryCard label="Admins" value={counts.admins} icon={Shield} accent="text-purple-400 border-purple-500/20 bg-purple-500/5" />
        <SummaryCard label="Usuários" value={counts.total} icon={Users} accent="text-amber-400 border-amber-500/20 bg-amber-500/5" />
      </div>

      {/* ── Ações Rápidas ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <QuickActionButton onClick={() => handleOpenCreate("supervisor")} className="bg-blue-600 hover:bg-blue-700 shadow-blue-500/10">
          <UserPlus className="mr-2 h-4 w-4" /> Novo Supervisor
        </QuickActionButton>
        <QuickActionButton onClick={() => handleOpenCreate("agente")} className="bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/10">
          <UserPlus className="mr-2 h-4 w-4" /> Novo Agente
        </QuickActionButton>
        {isAdminMaster && (
          <>
            <QuickActionButton onClick={() => handleOpenCreate("coordenador")} className="bg-amber-600 hover:bg-amber-700 shadow-amber-500/10">
              <UserPlus className="mr-2 h-4 w-4" /> Novo Coordenador
            </QuickActionButton>
            <QuickActionButton onClick={() => handleOpenCreate("admin_master")} className="bg-purple-600 hover:bg-purple-700 shadow-purple-500/10">
              <UserPlus className="mr-2 h-4 w-4" /> Novo Admin Master
            </QuickActionButton>
          </>
        )}
      </div>

      {/* ── Busca + Filtros ────────────────────────────────────────── */}
      <div className="bg-slate-900/50 rounded-3xl border border-slate-800 overflow-hidden shadow-2xl backdrop-blur-xl">
        <div className="p-4 sm:p-6 border-b border-slate-800 space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
            <Input
              placeholder="Buscar por nome, e-mail ou matrícula..."
              className="pl-12 bg-slate-950/50 border-none rounded-2xl h-12 sm:h-14 text-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {(
              [
                { key: "all", label: "Todos" },
                { key: "supervisor", label: "Supervisores" },
                { key: "agente", label: "Agentes" },
                { key: "coordenador", label: "Coordenadores" },
                { key: "admin_master", label: "Admin Master" },
              ] as { key: RoleFilter; label: string }[]
            ).map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setRoleFilter(f.key)}
                className={cn(
                  "min-h-11 px-4 rounded-full text-[11px] font-black uppercase tracking-widest transition-all active:scale-95",
                  roleFilter === f.key
                    ? "bg-amber-500 text-slate-950"
                    : "bg-slate-950/50 text-slate-400 hover:text-white hover:bg-slate-800",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
            {filteredUsers.length}{" "}
            {filteredUsers.length === 1 ? "usuário encontrado" : "usuários encontrados"}
          </p>
        </div>

        <div className="p-3 sm:p-4 space-y-2 sm:space-y-3">
          {isLoading ? (
            <div className="py-20 text-center text-slate-500 font-bold animate-pulse uppercase tracking-[0.3em]">
              Carregando Sistema...
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-20 text-center text-slate-500 uppercase font-black opacity-30">
              Nenhum usuário
            </div>
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
                className="group flex items-center justify-between gap-3 p-4 sm:p-5 rounded-2xl bg-slate-950/30 hover:bg-slate-950/60 transition-all border border-transparent hover:border-amber-500/30 cursor-pointer min-h-[68px]"
              >
                <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                  <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center font-black text-slate-500 text-base group-hover:text-amber-500 group-hover:border-amber-500/30 transition-all shrink-0">
                    {getInitials(user.full_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-black text-white uppercase text-sm sm:text-base italic tracking-tight truncate">
                      {user.full_name ?? "(sem nome)"}
                    </h3>
                    <p className="text-[11px] font-bold text-slate-500 tracking-wide truncate">
                      {user.email}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {user.is_active === false && (
                    <Badge className="bg-rose-500/20 text-rose-400 border-none text-[9px] font-black uppercase">
                      Inativo
                    </Badge>
                  )}
                  <Badge
                    className={cn(
                      "px-2 py-1 font-black text-[9px] uppercase tracking-[0.15em] border-none rounded-md",
                      roleBadgeClass(user.role),
                    )}
                  >
                    {ROLE_LABELS[user.role] ?? user.role}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Dialog: Criar Usuário ──────────────────────────────────── */}
      <Dialog open={isAddingUser} onOpenChange={setIsAddingUser}>
        <DialogContent className="sm:max-w-[425px] bg-slate-900 border-slate-800 text-white rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase tracking-tight italic">
              Novo {ROLE_LABELS[newUser.role]}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateUser} className="space-y-4 mt-2">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Nome</label>
              <Input
                value={newUser.full_name}
                onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                className="bg-slate-800 border-none rounded-xl h-11"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">E-mail</label>
              <Input
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                className="bg-slate-800 border-none rounded-xl h-11"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Senha</label>
              <Input
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                className="bg-slate-800 border-none rounded-xl h-11"
                required
                minLength={6}
              />
            </div>
            <Button type="submit" className="w-full h-12 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black uppercase tracking-widest text-xs">
              Confirmar Cadastro
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Drawer de Detalhes/Edição ──────────────────────────────── */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent
          side="right"
          className="w-[90vw] sm:max-w-xl bg-slate-950 border-l border-slate-800 text-white overflow-y-auto"
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
                    className="bg-slate-900 border-slate-800 rounded-xl h-11"
                  />
                </Field>

                <Field label="E-mail">
                  <Input
                    type="email"
                    value={edit.email}
                    onChange={(e) => setEdit({ ...edit, email: e.target.value })}
                    className="bg-slate-900 border-slate-800 rounded-xl h-11"
                  />
                </Field>

                <Field label="Telefone">
                  <Input
                    value={edit.phone}
                    onChange={(e) => setEdit({ ...edit, phone: e.target.value })}
                    placeholder="(11) 99999-9999"
                    className="bg-slate-900 border-slate-800 rounded-xl h-11"
                  />
                </Field>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Matrícula">
                    <Input
                      readOnly
                      value={selected.registration_number ?? "—"}
                      className="bg-slate-900/60 border-slate-800 rounded-xl text-slate-400 h-11"
                    />
                  </Field>
                  <Field label="Município/Área">
                    <Input
                      readOnly
                      value={selected.city ?? "—"}
                      className="bg-slate-900/60 border-slate-800 rounded-xl text-slate-400 h-11"
                    />
                  </Field>
                </div>

                <Field label="Perfil">
                  <select
                    value={edit.role}
                    disabled={!isAdminMaster}
                    onChange={(e) => setEdit({ ...edit, role: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl h-11 px-3 text-sm font-bold text-white outline-none disabled:opacity-60"
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

                {edit.role === "agente" && (
                  <Field label="Supervisor responsável">
                    <select
                      value={edit.supervisor_id ?? ""}
                      onChange={(e) =>
                        setEdit({ ...edit, supervisor_id: e.target.value || null })
                      }
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl h-11 px-3 text-sm font-bold text-white outline-none"
                    >
                      <option value="">— Sem supervisor —</option>
                      {supervisorOptions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.full_name ?? s.email}
                        </option>
                      ))}
                    </select>
                    {edit.supervisor_id && (
                      <p className="text-[10px] text-slate-500 mt-1">
                        Vinculado a {supervisorNameById.get(edit.supervisor_id) ?? "—"}
                      </p>
                    )}
                  </Field>
                )}

                <Field label="Status">
                  <div className="flex items-center gap-3">
                    <Badge className={edit.is_active ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"}>
                      {edit.is_active ? "ATIVO" : "INATIVO"}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleToggleActive}
                      className="border-slate-800 text-slate-300 hover:bg-slate-900 min-h-11"
                    >
                      <Power className="mr-2 h-3 w-3" />
                      {edit.is_active ? "Desativar" : "Ativar"}
                    </Button>
                  </div>
                </Field>

                <div className="pt-4 border-t border-slate-800">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">
                    Histórico
                  </h4>
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
                    {isAdminMaster && currentUser?.id !== selected.id && (
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

function SummaryCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}) {
  return (
    <div className={cn("rounded-2xl border bg-slate-900/40 p-4 sm:p-5 backdrop-blur-sm", accent)}>
      <div className="flex items-center justify-between mb-2">
        <Icon className="h-4 w-4 sm:h-5 sm:w-5 opacity-80" />
      </div>
      <p className="text-2xl sm:text-3xl font-black text-white tabular-nums">{value}</p>
      <p className="text-[10px] sm:text-[11px] font-black uppercase tracking-widest text-slate-400 mt-1">
        {label}
      </p>
    </div>
  );
}

function QuickActionButton({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-2xl h-12 sm:h-14 px-4 font-black text-white transition-all active:scale-95 shadow-2xl uppercase tracking-widest text-[11px] sm:text-xs",
        className,
      )}
    >
      {children}
    </Button>
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
