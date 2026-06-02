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
