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

    // ── CREATE AGENT (fluxo antigo) ──────────────────────────────────────────
    if (action === "create") {
      const { email, password, full_name, registration_number, city } = agentData;

      const authUser = await getOrCreateAuthUser(supabaseAdmin, { email, password, full_name });

      const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
        id: authUser.id,
        full_name,
        email,
        registration_number,
        city,
        is_active: true,
        role: "agente",
      });
      if (profileError) throw profileError;

      const { error: roleError } = await supabaseAdmin.from("user_roles").upsert({
        user_id: authUser.id,
        role: "agente",
      }, { onConflict: "user_id,role" });
      if (roleError) throw roleError;

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

    // ── CREATE MANAGER (supervisor / agente / coordenador) ───────────────────
    if (action === "create_manager") {
      const { email, password, full_name, role = "agente" } = userData;

      if (!["supervisor", "coordenador", "agente"].includes(role)) {
        throw new Error("Invalid role: " + role);
      }
      if (!email || !password || !full_name) {
        throw new Error("Missing required fields: email, password, full_name");
      }

      const authUser = await getOrCreateAuthUser(supabaseAdmin, { email, password, full_name });

      const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
        id: authUser.id,
        full_name,
        email,
        is_active: true,
        role,
      });
      if (profileError) throw profileError;

      const { error: roleError } = await supabaseAdmin.from("user_roles").upsert({
        user_id: authUser.id,
        role,
      }, { onConflict: "user_id,role" });
      if (roleError) throw roleError;

      return jsonResponse({ success: true, user: authUser });
    }

    // ── UPDATE STATUS ────────────────────────────────────────────────────────
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
      const { userId, full_name, email, phone, role, is_active } = body.userData ?? {};
      if (!userId) throw new Error("userId is required");

      const isAdminMaster = callerRole === "admin_master";

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

      if (Object.keys(profileUpdate).length > 0) {
        const { error: pErr } = await supabaseAdmin.from("profiles").update(profileUpdate).eq("id", userId);
        if (pErr) throw pErr;
      }

      // Verify the auth user actually exists (orphan profiles would break FK on user_roles)
      const { data: authLookup, error: authLookupErr } = await supabaseAdmin.auth.admin.getUserById(userId);
      const authUserExists = !authLookupErr && !!authLookup?.user;

      // Update auth email if changed and auth user exists
      if (typeof email === "string" && authUserExists) {
        const { error: aErr } = await supabaseAdmin.auth.admin.updateUserById(userId, { email });
        if (aErr) console.warn("[manage-agents] auth email update warning:", aErr.message);
      }

      // Sync user_roles when role is provided (admin master only)
      if (role && isAdminMaster) {
        if (!authUserExists) {
          throw new Error(
            "Não é possível alterar o perfil: este usuário não possui conta de autenticação ativa. Recrie o usuário ou remova o registro órfão.",
          );
        }
        await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
        const { error: rErr } = await supabaseAdmin.from("user_roles").insert({ user_id: userId, role });
        if (rErr) throw rErr;
      }

      // Sync agents table (name + phone) if record exists
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
