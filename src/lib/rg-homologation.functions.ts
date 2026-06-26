import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RgHomologationReport = {
  ts: number;
  approved: boolean;
  counts: {
    boletins: number;
    blocks: number;
    properties: number;
    propertiesWithoutBoletim: number;
    propertiesWithoutBlock: number;
    boletinsWithoutBlock: number;
    orphanBoletins: number;
    orphanProperties: number;
    orphanBlocks: number;
    gpsCovered: number;
    gpsMissing: number;
  };
  tests: {
    id: string;
    name: string;
    pass: boolean;
    details?: any;
  }[];
  divergences: {
    boletim_id: string;
    block_number: string | null;
    locality: string | null;
    headerCount: number;
    viewerCount: number;
  }[];
};

async function assertAdmin(supabase: any, userId: string) {
  const { data: ok } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin_master",
  });
  if (!ok) throw new Error("Forbidden");
}

export const runRgHomologation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RgHomologationReport> => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: boletins }, { data: blocks }, { data: properties }] = await Promise.all([
      supabaseAdmin.from("boletins_rg").select("id, block_id, block_number, locality, agent_id"),
      supabaseAdmin.from("blocks").select("id, number, locality, total_properties"),
      supabaseAdmin.from("properties").select("id, boletim_id, block_id, block_number, user_id, latitude, longitude"),
    ]);

    const B = boletins ?? [];
    const Bl = blocks ?? [];
    const P = properties ?? [];

    const blockIds = new Set(Bl.map((b: any) => b.id));
    const boletimIds = new Set(B.map((b: any) => b.id));

    // Divergence: header vs viewer per boletim
    const divergences: RgHomologationReport["divergences"] = [];
    const propsByBoletim = new Map<string, number>();
    for (const p of P) {
      if (p.boletim_id) propsByBoletim.set(p.boletim_id, (propsByBoletim.get(p.boletim_id) ?? 0) + 1);
    }
    for (const b of B) {
      const viewer = propsByBoletim.get(b.id) ?? 0;
      // "Header" fallback simulating list view: by block_id OR (block_number + agent)
      const header = P.filter(
        (p: any) =>
          (b.block_id && p.block_id === b.block_id) ||
          (p.block_number != null &&
            String(p.block_number) === String(b.block_number) &&
            p.user_id === b.agent_id),
      ).length;
      if (header !== viewer) {
        divergences.push({
          boletim_id: b.id,
          block_number: b.block_number ?? null,
          locality: b.locality ?? null,
          headerCount: header,
          viewerCount: viewer,
        });
      }
    }

    const orphanBoletins = B.filter((b: any) => b.block_id && !blockIds.has(b.block_id)).length;
    const orphanProperties = P.filter((p: any) => p.block_id && !blockIds.has(p.block_id)).length;
    const orphanBlocksList = Bl.filter(
      (bl: any) =>
        !B.some((b: any) => b.block_id === bl.id) &&
        !P.some((p: any) => p.block_id === bl.id),
    );
    const boletinsWithoutBlock = B.filter((b: any) => !b.block_id).length;
    const propertiesWithoutBoletim = P.filter((p: any) => !p.boletim_id).length;
    const propertiesWithoutBlock = P.filter((p: any) => !p.block_id).length;
    const gpsCovered = P.filter((p: any) => p.latitude != null && p.longitude != null).length;
    const gpsMissing = P.length - gpsCovered;

    // Idempotency: simulate reconcile preview rows for non-ok status
    const norm = (s: any) => String(s ?? "").trim().toLowerCase();
    let pendingPreview = 0;
    for (const b of B) {
      const matches = Bl.filter(
        (bl: any) =>
          String(bl.number) === String(b.block_number) && norm(bl.locality) === norm(b.locality),
      );
      const matched = matches.length === 1 ? matches[0] : null;
      const blockIdForCount = b.block_id ?? matched?.id ?? null;
      const propsForBlock = blockIdForCount
        ? P.filter((p: any) => p.block_id === blockIdForCount)
        : [];
      const withoutBoletim = propsForBlock.filter((p: any) => p.boletim_id == null).length;
      const ok =
        b.block_id &&
        matches.length <= 1 &&
        withoutBoletim === 0 &&
        !(matches.length === 0 && !b.block_id);
      if (!ok && b.block_number) pendingPreview++;
    }

    const tests: RgHomologationReport["tests"] = [
      {
        id: "T1+T2",
        name: "Viewer = Cabeçalho (mesma fonte de dados)",
        pass: divergences.length === 0,
        details: { divergences: divergences.length },
      },
      {
        id: "T6",
        name: "PDF/Tabela/Cabeçalho convergem (boletim_id presente)",
        pass: propertiesWithoutBoletim === 0,
        details: { propertiesWithoutBoletim },
      },
      {
        id: "T8",
        name: "Cobertura GPS (informativo)",
        pass: true,
        details: { gpsCovered, gpsMissing, total: P.length },
      },
      {
        id: "T9",
        name: "Sem relacionamentos órfãos (FKs íntegras)",
        pass: orphanBoletins === 0 && orphanProperties === 0,
        details: { orphanBoletins, orphanProperties },
      },
      {
        id: "T10",
        name: "Reconciliação idempotente (0 pendências)",
        pass: pendingPreview === 0,
        details: { pendingPreview, orphanBlocks: orphanBlocksList.length },
      },
    ];

    const report: RgHomologationReport = {
      ts: Date.now(),
      approved: tests.every((t) => t.pass),
      counts: {
        boletins: B.length,
        blocks: Bl.length,
        properties: P.length,
        propertiesWithoutBoletim,
        propertiesWithoutBlock,
        boletinsWithoutBlock,
        orphanBoletins,
        orphanProperties,
        orphanBlocks: orphanBlocksList.length,
        gpsCovered,
        gpsMissing,
      },
      tests,
      divergences: divergences.slice(0, 50),
    };
    return report;
  });
