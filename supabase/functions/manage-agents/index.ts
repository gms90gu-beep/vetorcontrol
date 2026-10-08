import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const managerRoles = ["supervisor", "coordenador", "admin_master"];

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

async function createAuthUser(supabaseAdmin: any, userData: { email: string; password: string; full_name: string }) {
  const { data: authUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: userData.email,
    password: userData.password,
    email_confirm: true,
    user_metadata: { full_name: userData.full_name },
  });

  if (!createError) return authUser.user;

  const message = createError.message || "";
  if (message.toLowerCase().includes("already") || message.toLowerCase().includes("registered")) {
    throw new Error("Já existe uma conta com este e-mail. Use a edição do usuário existente ou outro e-mail.");
  }
  throw createError;
}

async function requireProfile(supabaseAdmin: any, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, role, is_active, supervisor_id, coordinator_id, full_name, email")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Usuário não encontrado.");
  return data;
}

async function countActiveAdminMasters(supabaseAdmin: any) {
  const { count, error } = await supabaseAdmin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin_master")
    .eq("is_active", true);
  if (error) throw error;
  return count ?? 0;
}

async function writeAudit(supabaseAdmin: any, actor: any, targetId: string | null, action: string, metadata: Record<string, unknown> = {}) {
  const { error } = await supabaseAdmin.from("audit_log").insert({
    actor_id: actor.id,
    actor_email: actor.email,
    target_id: targetId,
    action,
    entity: "user",
    metadata,
  });
  if (error) throw new Error(`Operação não concluída: não foi possível registrar a auditoria (${error.message}).`);
}

function generateTemporaryPassword() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const base = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("").slice(0, 12);
  return `${base}aA1!`;
}

async function ensureAuthUserExists(supabaseAdmin: any, userId: string): Promise<boolean> {
  // Retry a few times to absorb any propagation delay right after createUser
  for (let i = 0; i < 4; i++) {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (!error && data?.user?.id === userId) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

async function safeUpsertUserRole(supabaseAdmin: any, userId: string, role: string) {
  const exists = await ensureAuthUserExists(supabaseAdmin, userId);
  if (!exists) {
    throw new Error(
      `Não foi possível sincronizar o perfil: usuário ${userId} não existe em auth.users. Recrie o usuário ou remova o registro órfão.`,
    );
  }
  // Clear existing roles for this user then insert the new one (single role per user)
  const { error: delErr } = await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
  if (delErr) throw delErr;
  const { error: insErr } = await supabaseAdmin.from("user_roles").insert({ user_id: userId, role });
  if (insErr) throw insErr;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    // Valida o usuário chamador
    const {
      data: { user },
      error: authError,
    } = await createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "").auth.getUser(
      authHeader.replace("Bearer ", ""),
    );

    if (authError || !user) throw new Error("Unauthorized");

    const body = await req.json();
    const { action, agentData, userData } = body;

    const { data: callerRole } = await supabaseAdmin.rpc("get_user_role", { u_id: user.id });
    if (!managerRoles.includes(callerRole)) throw new Error("Forbidden: perfil sem permissão para gerenciar usuários");

    // ── CREATE AGENT ─────────────────────────────────────────────────────────
    // Supervisores criam agentes vinculados automaticamente (supervisor_id = caller).
    // Coordenadores criam agentes vinculados a si (coordinator_id = caller).
    // Admin Master cria sem vínculo automático.
    if (action === "create") {
      const { email, password, full_name, registration_number, city, supervisor_id } = agentData;

      if (!email || !password || !full_name) {
        throw new Error("Campos obrigatórios faltando: nome, e-mail e senha.");
      }

      const autoSupervisorId =
        callerRole === "supervisor" ? user.id : (supervisor_id ?? null);
      const autoCoordinatorId = callerRole === "coordenador" ? user.id : null;

      if (!autoSupervisorId) {
        throw new Error("Todo agente deve ser vinculado a um supervisor (supervisor_id obrigatório).");
      }

      const authUser = await createAuthUser(supabaseAdmin, { email, password, full_name });

      const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
        id: authUser.id,
        full_name,
        email,
        registration_number,
        city,
        is_active: true,
        role: "agente",
        supervisor_id: autoSupervisorId,
        coordinator_id: autoCoordinatorId,
      });
      if (profileError) throw profileError;

      await safeUpsertUserRole(supabaseAdmin, authUser.id, "agente");

      await writeAudit(supabaseAdmin, user, authUser.id, "create_agent", {
        full_name, email, supervisor_id: autoSupervisorId, coordinator_id: autoCoordinatorId,
      });

      return jsonResponse({ success: true, user: authUser });
    }

    // ── CREATE MANAGER (supervisor / agente / coordenador / admin_master) ───
    if (action === "create_manager") {
      const { email, password, full_name, role = "agente" } = userData;

      if (!["supervisor", "coordenador", "agente", "admin_master"].includes(role)) {
        throw new Error("Invalid role: " + role);
      }
      if (!email || !password || !full_name) {
        throw new Error("Missing required fields: email, password, full_name");
      }
      if (callerRole !== "admin_master") throw new Error("Forbidden: apenas Admin Master pode criar usuários por este fluxo");

      const authUser = await createAuthUser(supabaseAdmin, { email, password, full_name });

      // Cadastro isolado: NÃO herda supervisor_id/coordinator_id da sessão do criador.
      // Vínculos devem ser feitos posteriormente via update_user explícito.
      const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
        id: authUser.id,
        full_name,
        email,
        is_active: true,
        role,
        supervisor_id: null,
        coordinator_id: null,
      });

      if (profileError) throw profileError;

      await safeUpsertUserRole(supabaseAdmin, authUser.id, role);

      await writeAudit(supabaseAdmin, user, authUser.id, "create_user", { role, full_name, email });

      return jsonResponse({ success: true, user: authUser });
    }



    if (action === "update_status") {
      const { userId, active } = agentData;
      if (callerRole !== "admin_master") throw new Error("Forbidden: apenas Admin Master pode alterar status de usuários");
      if (!userId || typeof active !== "boolean") throw new Error("userId e active são obrigatórios");
      const target = await requireProfile(supabaseAdmin, userId);
      if (userId === user.id && !active) throw new Error("Você não pode desativar o próprio usuário logado.");
      if (target.role === "admin_master" && !active && (await countActiveAdminMasters(supabaseAdmin)) <= 1) {
        throw new Error("Não é possível desativar o último Admin Master ativo.");
      }

      const { error: updateError } = await supabaseAdmin
        .from("profiles")
        .update({ is_active: active })
        .eq("id", userId);
      if (updateError) throw updateError;

      await writeAudit(supabaseAdmin, user, userId, "update_status", { active });

      return jsonResponse({ success: true });
    }

    // ── UPDATE USER (admin master edits profile/role) ───────────────────────
    if (action === "update_user") {
      const { userId, full_name, email, phone, role, is_active, supervisor_id, coordinator_id } = body.userData ?? {};
      if (!userId) throw new Error("userId is required");
      if (callerRole !== "admin_master") throw new Error("Forbidden: apenas Admin Master pode editar usuários");

      const { data: authLookup } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (!authLookup?.user) {
        return jsonResponse(
          {
            error: "Usuário não existe mais. A lista foi sincronizada — atualize a página.",
            code: "USER_NOT_FOUND",
          },
          404,
        );
      }

      const target = await requireProfile(supabaseAdmin, userId);
      if (userId === user.id && role && role !== "admin_master") {
        throw new Error("Você não pode remover o próprio perfil de Admin Master.");
      }
      if (userId === user.id && is_active === false) {
        throw new Error("Você não pode desativar o próprio usuário logado.");
      }
      if (target.role === "admin_master" && is_active === false && (await countActiveAdminMasters(supabaseAdmin)) <= 1) {
        throw new Error("Não é possível desativar o último Admin Master ativo.");
      }

      const profileUpdate: Record<string, unknown> = {};
      if (typeof full_name === "string") profileUpdate.full_name = full_name;
      if (typeof email === "string") profileUpdate.email = email;
      if (typeof is_active === "boolean") profileUpdate.is_active = is_active;
      if (role) {
        if (!["agente", "supervisor", "coordenador", "admin_master"].includes(role)) {
          throw new Error("Invalid role: " + role);
        }
        profileUpdate.role = role;
        if (role !== "agente") profileUpdate.supervisor_id = null;
        if (role !== "supervisor") profileUpdate.coordinator_id = null;
      }
      if (supervisor_id !== undefined) {
        if (supervisor_id) {
          const supervisor = await requireProfile(supabaseAdmin, supervisor_id);
          if (supervisor.role !== "supervisor") throw new Error("O vínculo informado não é um Supervisor válido.");
        }
        profileUpdate.supervisor_id = supervisor_id ?? null;
      }
      if (coordinator_id !== undefined) {
        if (coordinator_id) {
          const coordinator = await requireProfile(supabaseAdmin, coordinator_id);
          if (coordinator.role !== "coordenador") throw new Error("O vínculo informado não é um Coordenador válido.");
        }
        profileUpdate.coordinator_id = coordinator_id ?? null;
      }
      if (Object.keys(profileUpdate).length > 0) {
        const { error: pErr } = await supabaseAdmin.from("profiles").update(profileUpdate).eq("id", userId);
        if (pErr) throw pErr;
      }

      if (typeof email === "string" && email !== target.email) {
        const { error: aErr } = await supabaseAdmin.auth.admin.updateUserById(userId, { email });
        if (aErr) throw aErr;
      }

      if (role) {
        await safeUpsertUserRole(supabaseAdmin, userId, role);
      }

      const agentUpdate: Record<string, unknown> = {};
      if (typeof full_name === "string") agentUpdate.name = full_name;
      if (typeof phone === "string") agentUpdate.phone = phone;
      if (typeof is_active === "boolean") agentUpdate.status = is_active ? "active" : "inactive";
      if (Object.keys(agentUpdate).length > 0) {
        const { error: agentError } = await supabaseAdmin.from("agents").update(agentUpdate).eq("profile_id", userId);
        if (agentError) throw agentError;
      }

      await writeAudit(supabaseAdmin, user, userId, "update_user", profileUpdate);

      return jsonResponse({ success: true });

    }

    // ── RESET PASSWORD ───────────────────────────────────────────────────────
    if (action === "reset_password") {
      const { userId, newPassword } = body;
      if (!userId) throw new Error("userId is required");
      if (callerRole !== "admin_master") throw new Error("Forbidden: apenas Admin Master pode redefinir senhas");
      await requireProfile(supabaseAdmin, userId);

      // Generate temp password if not provided
      const tempPassword = newPassword || generateTemporaryPassword();
      const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: tempPassword });
      if (pwErr) throw pwErr;
      await writeAudit(supabaseAdmin, user, userId, "reset_password");

      return jsonResponse({ success: true, tempPassword });
    }

    // ── DELETE USER ──────────────────────────────────────────────────────────
    if (action === "delete_user") {
      const { userId } = body;
      if (!userId) throw new Error("userId is required");
      if (callerRole !== "admin_master") throw new Error("Forbidden: apenas Admin Master pode excluir usuários");
      if (userId === user.id) throw new Error("Você não pode excluir o próprio usuário logado.");
      const target = await requireProfile(supabaseAdmin, userId);
      if (target.role === "admin_master" && (await countActiveAdminMasters(supabaseAdmin)) <= 1) {
        throw new Error("Não é possível excluir o último Admin Master ativo.");
      }
      await writeAudit(supabaseAdmin, user, userId, "delete_user", { role: target.role });

      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (deleteError) throw deleteError;

      return jsonResponse({ success: true });
    }

    throw new Error("Invalid action: " + action);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[manage-agents] Error:", message);
    return jsonResponse({ error: message }, 400);
  }
});
