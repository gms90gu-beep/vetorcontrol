import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertMasterRole } from "@/lib/admin-policy";

export const finishCycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { cycleId: string }) => z.object({ cycleId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: allowed, error: roleError } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin_master" });
    if (roleError) throw new Error(roleError.message);
    assertMasterRole(allowed ? "admin_master" : "");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: cycle, error: cycleError } = await supabaseAdmin
      .from("cycles")
      .select("id, status, name")
      .eq("id", data.cycleId)
      .maybeSingle();
    if (cycleError) throw new Error(cycleError.message);
    if (!cycle) throw new Error("Ciclo não encontrado.");
    if (cycle.status === "finished") return { success: true, alreadyFinished: true };

    const { error: updateError } = await supabaseAdmin
      .from("cycles")
      .update({ status: "finished" })
      .eq("id", data.cycleId);
    if (updateError) throw new Error(updateError.message);

    const { data: actor } = await supabaseAdmin.from("profiles").select("email").eq("id", userId).maybeSingle();
    const { error: auditError } = await supabaseAdmin.from("audit_log").insert({
      actor_id: userId,
      actor_email: actor?.email ?? null,
      target_id: data.cycleId,
      action: "finish_cycle",
      entity: "cycle",
      metadata: { previous_status: cycle.status, name: cycle.name },
    });
    if (auditError) throw new Error(`Ciclo atualizado, mas a auditoria falhou: ${auditError.message}`);

    return { success: true, alreadyFinished: false };
  });
