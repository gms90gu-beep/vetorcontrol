import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface AuditSnapshot {
  rg: {
    boletins: number;
    blocks: number;
    properties: number;
    lastSync: string | null;
  };
  trabalho: {
    properties_worked: number;
    properties_closed: number;
    visits: number;
    daily_records: number;
  };
  consistencia: {
    blocks_sem_imoveis: number;
    imoveis_sem_quarteirao: number;
    visitas_sem_imovel: number;
    boletins_reconciliados: number;
  };
}

export const getAuditSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AuditSnapshot> => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin_master" as any,
    });
    if (!isAdmin) throw new Error("Forbidden: requer admin_master");

    const count = async (
      table: string,
      filter?: (q: any) => any
    ): Promise<number> => {
      let q: any = supabase.from(table as any).select("*", { count: "exact", head: true });
      if (filter) q = filter(q);
      const { count: c, error } = await q;
      if (error) {
        console.warn(`[audit] count(${table})`, error.message);
        return 0;
      }
      return c ?? 0;
    };

    const [
      boletins,
      blocks,
      properties,
      visits,
      daily_records,
      properties_worked_agg,
      properties_closed_agg,
      imoveis_sem_quart,
      visitas_sem_imovel,
      boletins_reconciliados,
    ] = await Promise.all([
      count("boletins_rg"),
      count("blocks"),
      count("properties"),
      count("visits"),
      count("daily_work_records"),
      supabase.from("daily_work_records").select("properties_worked"),
      supabase.from("daily_work_records").select("properties_closed"),
      count("properties", (q) => q.is("block_number", null)),
      count("visits", (q) => q.is("property_id", null)),
      count("daily_work_records", (q) =>
        q.contains("data_integrity_log", { reconciled: true })
      ),
    ]);

    const sumField = (rows: any) =>
      (rows.data ?? []).reduce(
        (acc: number, r: any) => acc + (Number(r.properties_worked ?? r.properties_closed) || 0),
        0
      );

    // blocks sem imóveis
    const { data: blocksAll } = await supabase.from("blocks").select("id");
    const { data: propsBlocks } = await supabase
      .from("properties")
      .select("block_id")
      .not("block_id", "is", null);
    const blocksWithProps = new Set((propsBlocks ?? []).map((p: any) => p.block_id));
    const blocks_sem_imoveis = (blocksAll ?? []).filter(
      (b: any) => !blocksWithProps.has(b.id)
    ).length;

    return {
      rg: {
        boletins,
        blocks,
        properties,
        lastSync: new Date().toISOString(),
      },
      trabalho: {
        properties_worked: sumField(properties_worked_agg),
        properties_closed: sumField(properties_closed_agg),
        visits,
        daily_records,
      },
      consistencia: {
        blocks_sem_imoveis,
        imoveis_sem_quarteirao: imoveis_sem_quart,
        visitas_sem_imovel,
        boletins_reconciliados,
      },
    };
  });
