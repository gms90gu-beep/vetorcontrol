import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // ── CREATE AGENT (fluxo antigo) ──────────────────────────────────────────
    if (action === "create") {
      const { email, password, full_name, registration_number, city } = agentData;

      const { data: authUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      });
      if (createError) throw createError;

      const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
        id: authUser.user.id,
        full_name,
        registration_number,
        city,
        is_active: true,
        role: "agente",
      });
      if (profileError) throw profileError;

      return new Response(JSON.stringify({ success: true, user: authUser.user }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
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

      const { data: authUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      });
      if (createError) throw createError;

      const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
        id: authUser.user.id,
        full_name,
        email,
        is_active: true,
        role,
      });
      if (profileError) throw profileError;

      return new Response(JSON.stringify({ success: true, user: authUser.user }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // ── UPDATE STATUS ────────────────────────────────────────────────────────
    if (action === "update_status") {
      const { userId, active } = agentData;

      const { error: updateError } = await supabaseAdmin
        .from("profiles")
        .update({ is_active: active })
        .eq("id", userId);
      if (updateError) throw updateError;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // ── DELETE USER ──────────────────────────────────────────────────────────
    if (action === "delete_user") {
      const { userId } = body;

      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (deleteError) throw deleteError;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    throw new Error("Invalid action: " + action);
  } catch (error) {
    console.error("[manage-agents] Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
