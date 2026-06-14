// FASE 4 — Validação RG → Trabalho
// Garante que apenas quarteirões com imóveis cadastrados no RG possam iniciar trabalho de campo.
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export async function blockHasProperties(blockNumber: number | string): Promise<boolean> {
  const { count, error } = await supabase
    .from("properties")
    .select("id", { count: "exact", head: true })
    .eq("block_number", String(blockNumber));
  if (error) {
    console.warn("[blockHasProperties]", error.message);
    return false;
  }
  return (count ?? 0) > 0;
}

/** Retorna true se o trabalho pode prosseguir; mostra toast bloqueante caso contrário. */
export async function ensureBlockHasProperties(blockNumber: number | string): Promise<boolean> {
  const ok = await blockHasProperties(blockNumber);
  if (!ok) {
    toast.error("Este quarteirão não possui imóveis cadastrados no RG.", {
      description: `Quarteirão ${blockNumber} precisa ser registrado no RG antes do trabalho de campo.`,
    });
  }
  return ok;
}
