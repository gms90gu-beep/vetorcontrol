import { focusResultInput } from "@/lib/focus-results-input";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getFocusSamples = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ cycleId: z.string().uuid().optional(), status: z.enum(["pending", "positive", "negative", "inconclusive"]).optional(), page: z.number().int().min(0).max(2000) }))
  .handler(async ({ data, context }) => {
    const client = context.supabase as any;
    const { data: samples, error } = await client.rpc("list_focus_samples", { p_cycle: data.cycleId ?? null, p_status: data.status ?? null, p_offset: data.page * 50 });
    if (error) {
      if (["PGRST202", "42883", "42P01"].includes(error.code)) throw new Error("A área de resultados ainda aguarda ativação no banco. Suas coletas permanecem preservadas.");
      throw new Error(`Não foi possível carregar as coletas: ${error.message}`);
    }
    const { data: cycles, error: cycleError } = await client.from("cycles").select("id,name,year,number").order("year", { ascending: false }).order("number", { ascending: false });
    if (cycleError) throw new Error(`Não foi possível carregar ciclos: ${cycleError.message}`);
    return { samples: (samples ?? []) as FocusSample[], cycles: (cycles ?? []) as { id: string; name: string; year: number; number: number }[] };
  });

export interface FocusSample {
  id: string; visit_date: string; agent_id: string; agent_name: string; cycle_id: string; cycle_name: string;
  property_number: string; street: string; block_number: string; tubes: number; version: number;
  status: "pending" | "positive" | "negative" | "inconclusive";
  can_record: boolean; can_correct: boolean;
  deposits: { id: string; type_code: string; quantity: number; positive: boolean }[];
  history: { status: string; analysis_date: string; reference: string; reason: string; actor: string; recorded_at: string }[];
}
export const recordFocusResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(focusResultInput)
  .handler(async ({ data, context }) => {
    const { data: version, error } = await (context.supabase as any).rpc("record_focus_result", {
      p_visit: data.visitId, p_status: data.status, p_positive: data.positiveDepositIds,
      p_reference: data.reference, p_analysis_date: data.analysisDate, p_reason: data.reason,
      p_version: data.version, p_request: data.requestId,
    });
    if (error) throw new Error(error.message);
    return { version };
  });
