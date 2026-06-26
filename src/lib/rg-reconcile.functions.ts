import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ReconcilePreviewRow = {
  boletim_id: string;
  block_number: string | null;
  locality: string | null;
  agent_id: string | null;
  agent_name: string | null;
  current_block_id: string | null;
  matched_block_id: string | null;
  matched_block_locality: string | null;
  properties_total: number;
  properties_without_boletim: number;
  status:
    | "ok"
    | "missing_block_id"
    | "missing_properties_boletim"
    | "no_block_match"
    | "ambiguous_block_match";
};

export type ReconcilePreview = {
  rows: ReconcilePreviewRow[];
  orphanBlocks: { id: string; number: string; locality: string | null; total_properties: number }[];
  blocksWithoutLocality: number;
  totalBoletins: number;
};

async function assertAdmin(supabase: any, userId: string) {
  const { data: ok } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin_master",
  });
  if (!ok) throw new Error("Forbidden");
}

function norm(s: string | null | undefined) {
  return (s ?? "").trim().toLowerCase();
}

export const getReconcilePreview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReconcilePreview> => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: boletins }, { data: blocks }, { data: properties }, { data: profiles }] =
      await Promise.all([
        supabaseAdmin.from("boletins_rg").select("id, block_id, block_number, locality, agent_id"),
        supabaseAdmin.from("blocks").select("id, number, locality, total_properties"),
        supabaseAdmin.from("properties").select("id, boletim_id, block_id, block_number, user_id"),
        supabaseAdmin.from("profiles").select("id, full_name"),
      ]);

    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name]));
    const blocksList = blocks ?? [];
    const propsList = properties ?? [];

    const rows: ReconcilePreviewRow[] = [];
    for (const b of boletins ?? []) {
      const matches = blocksList.filter(
        (bl: any) =>
          String(bl.number) === String(b.block_number) &&
          norm(bl.locality) === norm(b.locality),
      );
      const matched = matches.length === 1 ? matches[0] : null;
      const blockIdForCount = b.block_id ?? matched?.id ?? null;
      const propsForBlock = blockIdForCount
        ? propsList.filter((p: any) => p.block_id === blockIdForCount)
        : propsList.filter(
            (p: any) =>
              String(p.block_number) === String(b.block_number) && p.user_id === b.agent_id,
          );
      const withoutBoletim = propsForBlock.filter((p: any) => p.boletim_id == null).length;

      let status: ReconcilePreviewRow["status"] = "ok";
      if (!b.block_id && matches.length === 1) status = "missing_block_id";
      else if (!b.block_id && matches.length === 0) status = "no_block_match";
      else if (matches.length > 1) status = "ambiguous_block_match";
      else if (withoutBoletim > 0) status = "missing_properties_boletim";

      if (status !== "ok") {
        rows.push({
          boletim_id: b.id,
          block_number: b.block_number ?? null,
          locality: b.locality ?? null,
          agent_id: b.agent_id ?? null,
          agent_name: profileMap.get(b.agent_id) ?? null,
          current_block_id: b.block_id ?? null,
          matched_block_id: matched?.id ?? null,
          matched_block_locality: matched?.locality ?? null,
          properties_total: propsForBlock.length,
          properties_without_boletim: withoutBoletim,
          status,
        });
      }
    }

    const usedBlockIds = new Set<string>();
    for (const b of boletins ?? []) if (b.block_id) usedBlockIds.add(b.block_id);
    for (const p of propsList) if (p.block_id) usedBlockIds.add(p.block_id);
    const orphanBlocks = blocksList
      .filter((bl: any) => !usedBlockIds.has(bl.id) && (bl.total_properties ?? 0) === 0)
      .map((bl: any) => ({
        id: bl.id,
        number: String(bl.number),
        locality: bl.locality ?? null,
        total_properties: bl.total_properties ?? 0,
      }));

    const blocksWithoutLocality = blocksList.filter((bl: any) => !bl.locality).length;

    return {
      rows,
      orphanBlocks,
      blocksWithoutLocality,
      totalBoletins: boletins?.length ?? 0,
    };
  });

export type ReconcileResult = {
  blocksLinked: number;
  propertiesLinked: number;
  details: { boletim_id: string; block_id: string; properties: number }[];
};

export const executeReconcile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReconcileResult> => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: boletins }, { data: blocks }] = await Promise.all([
      supabaseAdmin.from("boletins_rg").select("id, block_id, block_number, locality, agent_id"),
      supabaseAdmin.from("blocks").select("id, number, locality"),
    ]);

    let blocksLinked = 0;
    let propertiesLinked = 0;
    const details: ReconcileResult["details"] = [];

    for (const b of boletins ?? []) {
      if (!b.block_number) continue;
      const matches = (blocks ?? []).filter(
        (bl: any) =>
          String(bl.number) === String(b.block_number) &&
          norm(bl.locality) === norm(b.locality),
      );
      if (matches.length !== 1) continue;
      const blockId = matches[0].id;

      if (!b.block_id || b.block_id !== blockId) {
        const { error } = await supabaseAdmin
          .from("boletins_rg")
          .update({ block_id: blockId })
          .eq("id", b.id);
        if (!error) blocksLinked++;
        else continue;
      }

      const { data: updated, error: upErr } = await supabaseAdmin
        .from("properties")
        .update({ boletim_id: b.id })
        .eq("block_id", blockId)
        .eq("user_id", b.agent_id)
        .is("boletim_id", null)
        .select("id");
      if (!upErr && updated) {
        propertiesLinked += updated.length;
        if (updated.length > 0)
          details.push({ boletim_id: b.id, block_id: blockId, properties: updated.length });
      }
    }

    await supabaseAdmin.from("audit_log").insert({
      action: "rg_reconcile_execute",
      entity: "system",
      actor_id: userId,
      metadata: { blocksLinked, propertiesLinked, details } as any,
    });

    return { blocksLinked, propertiesLinked, details };
  });

export const deleteOrphanBlocks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ids: string[] }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!data.ids?.length) return { deleted: 0 };
    const { error, count } = await supabaseAdmin
      .from("blocks")
      .delete({ count: "exact" })
      .in("id", data.ids)
      .eq("total_properties", 0);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      action: "rg_reconcile_delete_orphans",
      entity: "blocks",
      actor_id: userId,
      metadata: { ids: data.ids, count } as any,
    });
    return { deleted: count ?? 0 };
  });

export type IntegrityValidation = {
  ok: boolean;
  missing: string[];
};

export function validateBoletimIntegrity(b: {
  block_id?: string | null;
  block_number?: string | null;
  locality?: string | null;
  agent_id?: string | null;
  id?: string | null;
}): IntegrityValidation {
  const missing: string[] = [];
  if (!b.id) missing.push("boletim_id");
  if (!b.block_id) missing.push("block_id");
  if (!b.block_number) missing.push("block_number");
  if (!b.locality) missing.push("locality");
  if (!b.agent_id) missing.push("agent_id");
  return { ok: missing.length === 0, missing };
}
