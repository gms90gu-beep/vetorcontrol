/**
 * Georeferencing Audit — diagnostic only.
 * Never overwrites latitude/longitude.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireManager(supabase: any, userId: string) {
  const { data: role } = await supabase.rpc("get_user_role", { u_id: userId });
  const r = (role as string) || "";
  if (!["admin_master", "coordenador", "supervisor"].includes(r)) {
    throw new Error("Forbidden: requer supervisor, coordenador ou admin_master");
  }
  return r as "admin_master" | "coordenador" | "supervisor";
}

function isValidLat(n: any) {
  return typeof n === "number" && Number.isFinite(n) && n >= -90 && n <= 90 && n !== 0;
}
function isValidLng(n: any) {
  return typeof n === "number" && Number.isFinite(n) && n >= -180 && n <= 180 && n !== 0;
}

export interface GeorefAuditResult {
  generated_at: string;
  kpis: {
    total_properties: number;
    georeferenced: number;
    without_gps: number;
    coverage_pct: number;
    invalid_coords: number;
    duplicated_coords: number;
    blocks_total: number;
    blocks_full_coverage: number;
    blocks_partial: number;
    blocks_none: number;
    last_geocoded_at: string | null;
  };
  properties: Array<{
    id: string;
    street_name: string | null;
    number: string | null;
    block_number: string | null;
    locality: string | null;
    agent_name: string | null;
    latitude: number | null;
    longitude: number | null;
    geocoded_at: string | null;
    status: "valid" | "missing" | "invalid" | "duplicated";
  }>;
  blocks: Array<{
    id: string;
    number: string;
    locality: string | null;
    total: number;
    geo: number;
    pending: number;
    coverage_pct: number;
    rg_id: string | null;
    updated_at: string | null;
  }>;
  orphans: {
    properties_without_block: number;
    properties_without_boletim: number;
    blocks_without_properties: number;
    boletins_without_properties: number;
  };
  history_sample: Array<{
    property_id: string;
    geocoded_at: string | null;
    geocoded_by: string | null;
    geocoded_by_name: string | null;
  }>;
}

export const getGeorefAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      locality?: string | null;
      supervisorId?: string | null;
      agentId?: string | null;
      onlyIssues?: boolean;
    }) => input || {},
  )
  .handler(async ({ data, context }): Promise<GeorefAuditResult> => {
    const { supabase, userId } = context;
    const role = await requireManager(supabase, userId);

    // Scope agents
    let profQ = supabase.from("profiles").select("id, full_name, supervisor_id, role");
    if (role === "supervisor") profQ = profQ.eq("supervisor_id", userId);
    if (data.supervisorId) profQ = profQ.eq("supervisor_id", data.supervisorId);
    const { data: profiles } = await profQ;
    const profMap = new Map<string, string>(
      (profiles || []).map((p: any) => [p.id, p.full_name || ""]),
    );
    const scopedAgentIds = role === "admin_master" && !data.supervisorId && !data.agentId
      ? null
      : new Set((profiles || []).map((p: any) => p.id));

    // Properties + boletim/agent linkage
    let propQ = supabase
      .from("properties")
      .select(
        "id, street_name, number, block_number, block_id, latitude, longitude, geocoded_at, geocoded_by, boletim_id, user_id",
      )
      .limit(5000);
    if (data.agentId) propQ = propQ.eq("user_id", data.agentId);
    const { data: props } = await propQ;
    const properties = (props || []).filter((p: any) =>
      !scopedAgentIds || !p.user_id || scopedAgentIds.has(p.user_id),
    );

    // Boletins for locality lookup
    const boletimIds = Array.from(
      new Set(properties.map((p: any) => p.boletim_id).filter(Boolean)),
    );
    const { data: boletins } = boletimIds.length
      ? await supabase
          .from("boletins_rg")
          .select("id, locality, block_number, agent_id, updated_at")
          .in("id", boletimIds as string[])
      : { data: [] as any[] };
    const bolMap = new Map<string, any>((boletins || []).map((b: any) => [b.id, b]));

    // Filter by locality if requested
    let scoped = properties;
    if (data.locality) {
      const loc = data.locality.toLowerCase();
      scoped = scoped.filter((p: any) => {
        const b = p.boletim_id ? bolMap.get(p.boletim_id) : null;
        return (b?.locality || "").toLowerCase() === loc;
      });
    }

    // Coord dedupe map
    const coordKey = (p: any) =>
      p.latitude != null && p.longitude != null
        ? `${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`
        : null;
    const coordCounts = new Map<string, number>();
    for (const p of scoped) {
      const k = coordKey(p);
      if (k) coordCounts.set(k, (coordCounts.get(k) || 0) + 1);
    }

    let georef = 0;
    let invalid = 0;
    let duplicated = 0;
    let lastGeo: string | null = null;

    const rows = scoped.map((p: any) => {
      const b = p.boletim_id ? bolMap.get(p.boletim_id) : null;
      const hasCoord = p.latitude != null && p.longitude != null;
      let status: "valid" | "missing" | "invalid" | "duplicated" = "missing";
      if (hasCoord) {
        if (!isValidLat(p.latitude) || !isValidLng(p.longitude)) {
          status = "invalid";
          invalid++;
        } else {
          georef++;
          const k = coordKey(p)!;
          if ((coordCounts.get(k) || 0) > 1) {
            status = "duplicated";
            duplicated++;
          } else {
            status = "valid";
          }
          if (p.geocoded_at && (!lastGeo || p.geocoded_at > lastGeo)) lastGeo = p.geocoded_at;
        }
      }
      return {
        id: p.id,
        street_name: p.street_name,
        number: p.number,
        block_number: p.block_number || b?.block_number || null,
        locality: b?.locality || null,
        agent_name: p.user_id ? profMap.get(p.user_id) || null : null,
        latitude: p.latitude,
        longitude: p.longitude,
        geocoded_at: p.geocoded_at,
        status,
      };
    });

    const filteredRows = data.onlyIssues
      ? rows.filter((r) => r.status !== "valid")
      : rows;

    // Blocks aggregation
    const byBlock = new Map<string, { number: string; locality: string | null; total: number; geo: number; updated_at: string | null; rg_id: string | null }>();
    for (const p of scoped) {
      const bid = p.block_id || `num:${p.block_number || "unknown"}`;
      const b = p.boletim_id ? bolMap.get(p.boletim_id) : null;
      const entry = byBlock.get(bid) || {
        number: p.block_number || b?.block_number || "—",
        locality: b?.locality || null,
        total: 0,
        geo: 0,
        updated_at: b?.updated_at || null,
        rg_id: p.boletim_id || null,
      };
      entry.total++;
      if (p.latitude != null && p.longitude != null && isValidLat(p.latitude) && isValidLng(p.longitude)) {
        entry.geo++;
      }
      byBlock.set(bid, entry);
    }
    const blocks = Array.from(byBlock.entries()).map(([id, b]) => ({
      id,
      number: b.number,
      locality: b.locality,
      total: b.total,
      geo: b.geo,
      pending: b.total - b.geo,
      coverage_pct: b.total ? Math.round((b.geo / b.total) * 100) : 0,
      rg_id: b.rg_id,
      updated_at: b.updated_at,
    }));

    const blocks_full = blocks.filter((b) => b.coverage_pct === 100).length;
    const blocks_partial = blocks.filter((b) => b.coverage_pct > 0 && b.coverage_pct < 100).length;
    const blocks_none = blocks.filter((b) => b.coverage_pct === 0).length;

    // Orphans
    const propsWithoutBlock = scoped.filter((p: any) => !p.block_id && !p.block_number).length;
    const propsWithoutBoletim = scoped.filter((p: any) => !p.boletim_id).length;

    const { data: allBlocks } = await supabase.from("blocks").select("id");
    const usedBlockIds = new Set(scoped.map((p: any) => p.block_id).filter(Boolean));
    const blocksWithoutProps = (allBlocks || []).filter((b: any) => !usedBlockIds.has(b.id)).length;

    const { data: boletinsAll } = await supabase
      .from("boletins_rg")
      .select("id");
    const usedBol = new Set(scoped.map((p: any) => p.boletim_id).filter(Boolean));
    const boletinsWithoutProps = (boletinsAll || []).filter((b: any) => !usedBol.has(b.id)).length;

    // History (recent geocoded)
    const historySample = scoped
      .filter((p: any) => p.geocoded_at)
      .sort((a: any, b: any) => (a.geocoded_at < b.geocoded_at ? 1 : -1))
      .slice(0, 25)
      .map((p: any) => ({
        property_id: p.id,
        geocoded_at: p.geocoded_at,
        geocoded_by: p.geocoded_by,
        geocoded_by_name: p.geocoded_by ? profMap.get(p.geocoded_by) || null : null,
      }));

    const total = scoped.length;
    return {
      generated_at: new Date().toISOString(),
      kpis: {
        total_properties: total,
        georeferenced: georef,
        without_gps: total - georef - invalid,
        coverage_pct: total ? Math.round((georef / total) * 100) : 0,
        invalid_coords: invalid,
        duplicated_coords: duplicated,
        blocks_total: blocks.length,
        blocks_full_coverage: blocks_full,
        blocks_partial,
        blocks_none,
        last_geocoded_at: lastGeo,
      },
      properties: filteredRows.slice(0, 1000),
      blocks: blocks.sort((a, b) => a.coverage_pct - b.coverage_pct).slice(0, 500),
      orphans: {
        properties_without_block: propsWithoutBlock,
        properties_without_boletim: propsWithoutBoletim,
        blocks_without_properties: blocksWithoutProps,
        boletins_without_properties: boletinsWithoutProps,
      },
      history_sample: historySample,
    };
  });
