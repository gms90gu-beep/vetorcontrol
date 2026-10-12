import { focusResultInput } from "@/lib/focus-results-input";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { readAllQueryPages } from "@/lib/query-pages";
import { z } from "zod";

export const getFocusSampleCycles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const client = context.supabase as any;
    const { data: actor, error } = await client.from("profiles").select("is_active").eq("id", context.userId).single();
    if (error || actor?.is_active !== true) throw new Error("Conta desativada ou acesso indisponível");
    // Independent of laboratory RPC activation and selected result filters.
    return await readAllQueryPages(client.from("cycles").select("id,name,year,number").order("year", { ascending: false }).order("number", { ascending: false }).order("id")) as { id: string; name: string; year: number; number: number }[];
  });

export const getFocusSamples = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ cycleId: z.string().uuid().optional(), status: z.enum(["pending", "positive", "negative", "inconclusive"]).optional(), agentId: z.string().uuid().optional(), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), search: z.string().trim().max(200).optional(), page: z.number().int().min(0).max(2000) }))
  .handler(async ({ data, context }) => {
    const client = context.supabase as any;
    const { data: actor, error: actorError } = await client.from("profiles").select("is_active").eq("id", context.userId).single();
    if (actorError || actor?.is_active !== true) throw new Error("Conta desativada ou acesso indisponível");
    if (data.from && data.to && data.from > data.to) throw new Error("Período inválido");
    const { data: result, error } = await client.rpc("list_focus_samples_v2", { p_cycle: data.cycleId ?? null, p_status: data.status ?? null, p_offset: data.page * 50, p_agent: data.agentId ?? null, p_from: data.from ?? null, p_to: data.to ?? null, p_search: data.search ?? null });
    if (error) {
      if (["PGRST202", "42883", "42P01"].includes(error.code)) throw new Error("A área de resultados ainda aguarda ativação no banco. Suas coletas permanecem preservadas.");
      throw new Error(`Não foi possível carregar as coletas: ${error.message}`);
    }
    return { samples: (result?.samples ?? []) as FocusSample[], total: Number(result?.total ?? 0), counts: result?.counts as Record<string, number>, agents: (result?.agents ?? []) as { id: string; name: string }[] };

  });

export interface FocusSample {
  id: string; visit_date: string; agent_id: string; agent_name: string; cycle_id: string; cycle_name: string;
  property_number: string; street: string; block_number: string; tubes: number; version: number;
  status: "pending" | "positive" | "negative" | "inconclusive";
  can_record: boolean; can_correct: boolean;
  deposits: { id: string; type_code: string; quantity: number; positive: boolean }[];
  history: { status: string; analysis_date: string; reference: string; reason: string; actor: string; recorded_at: string; positive_deposit_ids?: string[] }[];
}
export const recordFocusResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(focusResultInput)
  .handler(async ({ data, context }) => {
    const client = context.supabase as any;
    const { data: actor, error: actorError } = await client.from("profiles").select("is_active").eq("id", context.userId).single();
    if (actorError || actor?.is_active !== true) throw new Error("Conta desativada ou acesso indisponível");
    const { data: version, error } = await (context.supabase as any).rpc("record_focus_result", {
      p_visit: data.visitId, p_status: data.status, p_positive: data.positiveDepositIds,
      p_reference: data.reference, p_analysis_date: data.analysisDate, p_reason: data.reason,
      p_version: data.version, p_request: data.requestId,
    });
    if (error) throw new Error(error.message);
    // Confirmation already committed: a follow-up read failure must not invite duplicate correction.
    try {
      const { data: visit, error: visitError } = await client.from("visits").select("agent_id,cycle_id,visit_date").eq("id", data.visitId).single();
      if (visitError || !visit) return { version, bulletinState: "unknown" as const };
      const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(visit.visit_date));
      let query = client.from("daily_work_records").select("id", { count: "exact", head: true }).eq("agent_id", visit.agent_id).eq("work_date", day);
      query = visit.cycle_id ? query.eq("cycle_id", visit.cycle_id) : query.is("cycle_id", null);
      const { count, error: dailyError } = await query;
      return { version, bulletinState: dailyError ? "unknown" as const : count > 0 ? "present" as const : "missing" as const };
    } catch { return { version, bulletinState: "unknown" as const }; }
  });
