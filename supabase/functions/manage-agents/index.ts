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

async function getOrCreateAuthUser(supabaseAdmin: any, userData: { email: string; password: string; full_name: string }) {
  const { data: authUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: userData.email,
    password: userData.password,
    email_confirm: true,
    user_metadata: { full_name: userData.full_name },
  });

  if (!createError) return authUser.user;

  const message = createError.message || "";
  if (!message.toLowerCase().includes("already") && !message.toLowerCase().includes("registered")) {
    throw createError;
  }

  const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;

  const existingUser = usersData.users.find((u: any) => u.email?.toLowerCase() === userData.email.toLowerCase());
  if (!existingUser) throw createError;

  console.log("[manage-agents] E-mail já existia; sincronizando perfil e role:", userData.email);
  return existingUser;
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

    // Resolve supervisor_id for this agent:
    //  - admin_master / coordenador may pass any supervisor_id (or null)
    //  - supervisor always becomes the supervisor of their own creations
    function resolveSupervisorId(requested: string | null | undefined): string | null {
      if (callerRole === "supervisor") return user.id;
      if (requested === undefined) return null;
      return requested ?? null;
    }

    // ── CREATE AGENT (fluxo antigo) ──────────────────────────────────────────
    if (action === "create") {
      const { email, password, full_name, registration_number, city, supervisor_id } = agentData;
      const finalSupervisorId = resolveSupervisorId(supervisor_id);

      const authUser = await getOrCreateAuthUser(supabaseAdmin, { email, password, full_name });

      const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
        id: authUser.id,
        full_name,
        email,
        registration_number,
        city,
        is_active: true,
        role: "agente",
        supervisor_id: finalSupervisorId,
      });
      if (profileError) throw profileError;

      await safeUpsertUserRole(supabaseAdmin, authUser.id, "agente");

      const { error: agentError } = await supabaseAdmin.from("agents").upsert({
        profile_id: authUser.id,
        name: full_name,
        registration_id: registration_number,
        municipality: city || "São Paulo",
        status: "active",
      }, { onConflict: "profile_id" });
      if (agentError) throw agentError;

      return jsonResponse({ success: true, user: authUser });
    }

    // ── CREATE MANAGER (supervisor / agente / coordenador / admin_master) ───
    if (action === "create_manager") {
      const { email, password, full_name, role = "agente", supervisor_id, coordinator_id } = userData;

      if (!["supervisor", "coordenador", "agente", "admin_master"].includes(role)) {
        throw new Error("Invalid role: " + role);
      }
      if (!email || !password || !full_name) {
        throw new Error("Missing required fields: email, password, full_name");
      }
      // Only admin_master may create supervisor / coordenador / admin_master
      if (["supervisor", "coordenador", "admin_master"].includes(role) && callerRole !== "admin_master") {
        throw new Error("Forbidden: apenas Admin Master pode criar este perfil");
      }

      const finalSupervisorId = role === "agente" ? resolveSupervisorId(supervisor_id) : null;
      const finalCoordinatorId = role === "supervisor" ? (coordinator_id ?? null) : null;

      const authUser = await getOrCreateAuthUser(supabaseAdmin, { email, password, full_name });

      const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
        id: authUser.id,
        full_name,
        email,
        is_active: true,
        role,
        supervisor_id: finalSupervisorId,
        coordinator_id: finalCoordinatorId,
      });
      if (profileError) throw profileError;

      await safeUpsertUserRole(supabaseAdmin, authUser.id, role);

      // Audit
      await supabaseAdmin.from("audit_log").insert({
        actor_id: user.id,
        actor_email: user.email,
        target_id: authUser.id,
        action: "create_user",
        entity: "user",
        metadata: { role, full_name, email },
      });

      return jsonResponse({ success: true, user: authUser });
    }



    if (action === "update_status") {
      const { userId, active } = agentData;

      const { error: updateError } = await supabaseAdmin
        .from("profiles")
        .update({ is_active: active })
        .eq("id", userId);
      if (updateError) throw updateError;

      return jsonResponse({ success: true });
    }

    // ── UPDATE USER (admin master edits profile/role) ───────────────────────
    if (action === "update_user") {
      const { userId, full_name, email, phone, role, is_active, supervisor_id, coordinator_id } = body.userData ?? {};
      if (!userId) throw new Error("userId is required");

      const isAdminMaster = callerRole === "admin_master";

      // Verify the auth user exists FIRST. If not, treat as stale UI state and
      // clean up any orphan rows so the next refresh shows correct data.
      const { data: authLookup } = await supabaseAdmin.auth.admin.getUserById(userId);
      const authUserExists = !!authLookup?.user;

      if (!authUserExists) {
        // Clean up any orphan rows tied to this id
        await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
        await supabaseAdmin.from("agents").delete().eq("profile_id", userId);
        await supabaseAdmin.from("profiles").delete().eq("id", userId);
        return jsonResponse(
          {
            error: "Usuário não existe mais. A lista foi sincronizada — atualize a página.",
            code: "USER_NOT_FOUND",
          },
          404,
        );
      }

      const profileUpdate: Record<string, unknown> = {};
      if (typeof full_name === "string") profileUpdate.full_name = full_name;
      if (typeof email === "string") profileUpdate.email = email;
      if (typeof is_active === "boolean") profileUpdate.is_active = is_active;
      if (role && isAdminMaster) {
        if (!["agente", "supervisor", "coordenador", "admin_master"].includes(role)) {
          throw new Error("Invalid role: " + role);
        }
        profileUpdate.role = role;
      }
      // Allow admin_master/coordenador to (re)assign supervisor; supervisor caller forces self
      if (supervisor_id !== undefined) {
        profileUpdate.supervisor_id =
          callerRole === "supervisor" ? user.id : (supervisor_id ?? null);
      }
      // coordinator_id only settable by admin_master
      if (coordinator_id !== undefined && isAdminMaster) {
        profileUpdate.coordinator_id = coordinator_id ?? null;
      }

      // Audit
      await supabaseAdmin.from("audit_log").insert({
        actor_id: user.id,
        actor_email: user.email,
        target_id: userId,
        action: "update_user",
        entity: "user",
        metadata: profileUpdate,
      });




      if (Object.keys(profileUpdate).length > 0) {
        const { error: pErr } = await supabaseAdmin.from("profiles").update(profileUpdate).eq("id", userId);
        if (pErr) throw pErr;
      }

      if (typeof email === "string") {
        const { error: aErr } = await supabaseAdmin.auth.admin.updateUserById(userId, { email });
        if (aErr) console.warn("[manage-agents] auth email update warning:", aErr.message);
      }

      if (role && isAdminMaster) {
        await safeUpsertUserRole(supabaseAdmin, userId, role);
      }

      const agentUpdate: Record<string, unknown> = {};
      if (typeof full_name === "string") agentUpdate.name = full_name;
      if (typeof phone === "string") agentUpdate.phone = phone;
      if (typeof is_active === "boolean") agentUpdate.status = is_active ? "active" : "inactive";
      if (Object.keys(agentUpdate).length > 0) {
        await supabaseAdmin.from("agents").update(agentUpdate).eq("profile_id", userId);
      }

      return jsonResponse({ success: true });

    }

    // ── RESET PASSWORD ───────────────────────────────────────────────────────
    if (action === "reset_password") {
      const { userId, newPassword } = body;
      if (!userId) throw new Error("userId is required");

      // Generate temp password if not provided
      const tempPassword = newPassword || (Math.random().toString(36).slice(-10) + "A1!");
      const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: tempPassword });
      if (pwErr) throw pwErr;

      return jsonResponse({ success: true, tempPassword });
    }

    // ── DELETE USER ──────────────────────────────────────────────────────────
    if (action === "delete_user") {
      const { userId } = body;

      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (deleteError) throw deleteError;

      return jsonResponse({ success: true });
    }

    throw new Error("Invalid action: " + action);
  } catch (error) {
    console.error("[manage-agents] Error:", error.message);
    return jsonResponse({ error: error.message }, 400);
  }
});
