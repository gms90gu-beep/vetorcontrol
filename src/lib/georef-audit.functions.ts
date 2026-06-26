/**
 * Georeferencing Audit — diagnostic only.
 * Never overwrites latitude/longitude/geocoded_at/geocoded_by.
 *
 * Centro de Qualidade Territorial (Fase 2).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  currentEpiRange,
  previousEpiRange,
  lastNWeeksRange,
  type EpiRange,
} from "@/lib/epi-week";

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

export type AlertSeverity = "critical" | "warning" | "info";
export type AlertKind =
  | "block_low_coverage"
  | "property_no_gps"
  | "coords_invalid"
  | "coords_duplicated"
  | "coords_out_of_area"
  | "block_no_geo"
  | "focus_no_gps"
  | "old_pendency_no_gps";

export interface GeorefAlert {
  id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  message: string;
  property_id?: string | null;
  block_id?: string | null;
  block_number?: string | null;
  rg_id?: string | null;
}

export interface AgentRankRow {
  agent_id: string;
  agent_name: string;
  supervisor_name: string | null;
  visited: number;
  georeferenced: number;
  without_gps: number;
  coverage_pct: number;
  last_sync_at: string | null;
}

export interface SupervisorRankRow {
  supervisor_id: string;
  supervisor_name: string;
  team_size: number;
  total: number;
  georeferenced: number;
  coverage_pct: number;
  pendencies: number;
  duplicates: number;
  score: number;
}

export interface WeekCoverage {
  label: string;
  from: string;
  to: string;
  visited: number;
  georeferenced: number;
  coverage_pct: number;
}

export interface GeorefAuditResult {
  generated_at: string;
  quality_score: number;
  score_breakdown: {
    coverage: number;
    duplicates_penalty: number;
    invalid_penalty: number;
    orphans_penalty: number;
    offline_health: number;
  };
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
    rg_without_properties: number;
    properties_without_rg: number;
    last_sync_at: string | null;
  };
  properties: Array<{
    id: string;
    street_name: string | null;
    number: string | null;
    block_number: string | null;
    block_id: string | null;
    locality: string | null;
    agent_name: string | null;
    latitude: number | null;
    longitude: number | null;
    geocoded_at: string | null;
    has_focus: boolean;
    has_pendency: boolean;
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
  weekly_coverage: WeekCoverage[];
  agents_ranking: AgentRankRow[];
  supervisors_ranking: SupervisorRankRow[];
  alerts: GeorefAlert[];
  history_sample: Array<{
    property_id: string;
    geocoded_at: string | null;
    geocoded_by: string | null;
    geocoded_by_name: string | null;
    source: string;
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

    // Profiles in scope
    let profQ = supabase
      .from("profiles")
      .select("id, full_name, supervisor_id, role");
    if (role === "supervisor") profQ = profQ.eq("supervisor_id", userId);
    if (data.supervisorId) profQ = profQ.eq("supervisor_id", data.supervisorId);
    const { data: profiles } = await profQ;
    const allProfilesList = (profiles || []) as any[];
    const profMap = new Map<string, any>(
      allProfilesList.map((p: any) => [p.id, p]),
    );
    const scopedAgentIds =
      role === "admin_master" && !data.supervisorId && !data.agentId
        ? null
        : new Set(allProfilesList.map((p: any) => p.id));

    // Properties
    let propQ = supabase
      .from("properties")
      .select(
        "id, street_name, number, block_number, block_id, latitude, longitude, geocoded_at, geocoded_by, boletim_id, user_id, status, updated_at",
      )
      .limit(8000);
    if (data.agentId) propQ = propQ.eq("user_id", data.agentId);
    const { data: props } = await propQ;
    const properties = ((props || []) as any[]).filter(
      (p: any) => !scopedAgentIds || !p.user_id || scopedAgentIds.has(p.user_id),
    );

    // Boletins
    const boletimIds = Array.from(
      new Set(properties.map((p: any) => p.boletim_id).filter(Boolean)),
    );
    const { data: boletins } = boletimIds.length
      ? await supabase
          .from("boletins_rg")
          .select("id, locality, block_number, agent_id, updated_at")
          .in("id", boletimIds as string[])
      : { data: [] as any[] };
    const bolMap = new Map<string, any>(
      ((boletins || []) as any[]).map((b: any) => [b.id, b]),
    );

    // Locality filter
    let scoped = properties;
    if (data.locality) {
      const loc = data.locality.toLowerCase();
      scoped = scoped.filter((p: any) => {
        const b = p.boletim_id ? bolMap.get(p.boletim_id) : null;
        return (b?.locality || "").toLowerCase().includes(loc);
      });
    }

    // Visits & focos (positives) for focus/pendency annotation + agent ranking
    const propIds = scoped.map((p: any) => p.id);
    const { data: visitsRaw } = propIds.length
      ? await supabase
          .from("visits")
          .select("id, property_id, agent_id, visit_date, has_focus")
          .in("property_id", propIds as string[])
          .limit(20000)
      : { data: [] as any[] };
    const visits = (visitsRaw || []) as any[];
    const focusByProp = new Set<string>(
      visits.filter((v: any) => v.has_focus).map((v: any) => v.property_id),
    );

    const { data: pendsRaw } = propIds.length
      ? await supabase
          .from("property_pendencies")
          .select("property_id, current_status, last_attempt_at, resolved_at")
          .in("property_id", propIds as string[])
          .limit(20000)
      : { data: [] as any[] };
    const pendencies = (pendsRaw || []) as any[];
    const pendByProp = new Map<string, any>();
    for (const p of pendencies) {
      if (!p.resolved_at) pendByProp.set(p.property_id, p);
    }

    // Coord dedupe map
    const coordKey = (p: any) =>
      p.latitude != null && p.longitude != null
        ? `${Number(p.latitude).toFixed(6)},${Number(p.longitude).toFixed(6)}`
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
    let lastSync: string | null = null;

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
          if (p.geocoded_at && (!lastGeo || p.geocoded_at > lastGeo))
            lastGeo = p.geocoded_at;
        }
      }
      if (p.updated_at && (!lastSync || p.updated_at > lastSync))
        lastSync = p.updated_at;

      const ag = p.user_id ? profMap.get(p.user_id) : null;
      return {
        id: p.id,
        street_name: p.street_name,
        number: p.number,
        block_number: p.block_number || b?.block_number || null,
        block_id: p.block_id || null,
        locality: b?.locality || null,
        agent_name: ag?.full_name || null,
        agent_id: p.user_id || null,
        latitude: p.latitude,
        longitude: p.longitude,
        geocoded_at: p.geocoded_at,
        geocoded_by: p.geocoded_by,
        has_focus: focusByProp.has(p.id),
        has_pendency: pendByProp.has(p.id),
        status,
      };
    });

    const filteredRows = data.onlyIssues
      ? rows.filter((r) => r.status !== "valid")
      : rows;

    // Blocks aggregation
    const byBlock = new Map<
      string,
      {
        number: string;
        locality: string | null;
        total: number;
        geo: number;
        updated_at: string | null;
        rg_id: string | null;
      }
    >();
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
      if (
        p.latitude != null &&
        p.longitude != null &&
        isValidLat(p.latitude) &&
        isValidLng(p.longitude)
      ) {
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
    const blocks_partial = blocks.filter(
      (b) => b.coverage_pct > 0 && b.coverage_pct < 100,
    ).length;
    const blocks_none = blocks.filter((b) => b.coverage_pct === 0).length;

    // Orphans
    const propsWithoutBlock = scoped.filter(
      (p: any) => !p.block_id && !p.block_number,
    ).length;
    const propsWithoutBoletim = scoped.filter((p: any) => !p.boletim_id).length;

    const { data: allBlocks } = await supabase.from("blocks").select("id");
    const usedBlockIds = new Set(
      scoped.map((p: any) => p.block_id).filter(Boolean),
    );
    const blocksWithoutProps = ((allBlocks || []) as any[]).filter(
      (b: any) => !usedBlockIds.has(b.id),
    ).length;

    const { data: boletinsAll } = await supabase
      .from("boletins_rg")
      .select("id");
    const usedBol = new Set(scoped.map((p: any) => p.boletim_id).filter(Boolean));
    const boletinsWithoutProps = ((boletinsAll || []) as any[]).filter(
      (b: any) => !usedBol.has(b.id),
    ).length;

    // === Weekly coverage (últimas 4 SE) ===
    const weeklyRanges: EpiRange[] = [];
    for (let i = 3; i >= 0; i--) {
      weeklyRanges.push(lastNWeeksRange(i + 1));
    }
    // lastNWeeksRange returns range covering N weeks back; collapse to 4 distinct weeks
    const cur = currentEpiRange();
    const prev = previousEpiRange();
    const week2 = lastNWeeksRange(3);
    const week3 = lastNWeeksRange(4);
    const distinctWeeks: EpiRange[] = [
      { ...week3, label: "SE -3" },
      { ...week2, label: "SE -2" },
      { ...prev, label: "Anterior" },
      { ...cur, label: "Atual" },
    ];

    const weekly_coverage: WeekCoverage[] = distinctWeeks.map((w) => {
      const inWeek = visits.filter((v: any) => {
        const d = (v.visit_date || "").slice(0, 10);
        return d >= w.from && d <= w.to;
      });
      const visitedProps = new Set(inWeek.map((v: any) => v.property_id));
      let geo = 0;
      const propIndex = new Map(scoped.map((p: any) => [p.id, p]));
      for (const pid of visitedProps) {
        const p: any = propIndex.get(pid);
        if (p && isValidLat(p.latitude) && isValidLng(p.longitude)) geo++;
      }
      const total = visitedProps.size;
      return {
        label: w.label,
        from: w.from,
        to: w.to,
        visited: total,
        georeferenced: geo,
        coverage_pct: total ? Math.round((geo / total) * 100) : 0,
      };
    });

    // === Agents ranking ===
    const agentMap = new Map<
      string,
      {
        visited: Set<string>;
        geo: number;
        no_gps: number;
        last_sync: string | null;
      }
    >();
    for (const v of visits) {
      if (!v.agent_id || !v.property_id) continue;
      const entry =
        agentMap.get(v.agent_id) ||
        { visited: new Set<string>(), geo: 0, no_gps: 0, last_sync: null };
      entry.visited.add(v.property_id);
      if (v.visit_date && (!entry.last_sync || v.visit_date > entry.last_sync))
        entry.last_sync = v.visit_date;
      agentMap.set(v.agent_id, entry);
    }
    const propIndex = new Map(scoped.map((p: any) => [p.id, p]));
    for (const [, entry] of agentMap) {
      for (const pid of entry.visited) {
        const p: any = propIndex.get(pid);
        if (p && isValidLat(p.latitude) && isValidLng(p.longitude)) entry.geo++;
        else entry.no_gps++;
      }
    }
    const agents_ranking: AgentRankRow[] = Array.from(agentMap.entries())
      .map(([aid, e]) => {
        const prof: any = profMap.get(aid);
        const sup: any = prof?.supervisor_id ? profMap.get(prof.supervisor_id) : null;
        const total = e.visited.size;
        return {
          agent_id: aid,
          agent_name: prof?.full_name || aid.slice(0, 8),
          supervisor_name: sup?.full_name || null,
          visited: total,
          georeferenced: e.geo,
          without_gps: e.no_gps,
          coverage_pct: total ? Math.round((e.geo / total) * 100) : 0,
          last_sync_at: e.last_sync,
        };
      })
      .sort((a, b) => b.coverage_pct - a.coverage_pct || b.visited - a.visited);

    // === Supervisors ranking ===
    const supMap = new Map<
      string,
      { team: Set<string>; total: number; geo: number; pend: number; dup: number }
    >();
    for (const r of rows) {
      const ag: any = r.agent_id ? profMap.get(r.agent_id) : null;
      const sid = ag?.supervisor_id;
      if (!sid) continue;
      const entry =
        supMap.get(sid) ||
        { team: new Set<string>(), total: 0, geo: 0, pend: 0, dup: 0 };
      entry.team.add(r.agent_id!);
      entry.total++;
      if (r.status === "valid") entry.geo++;
      if (r.status === "duplicated") entry.dup++;
      if (r.has_pendency) entry.pend++;
      supMap.set(sid, entry);
    }
    const supervisors_ranking: SupervisorRankRow[] = Array.from(supMap.entries())
      .map(([sid, e]) => {
        const sup: any = profMap.get(sid);
        const cov = e.total ? Math.round((e.geo / e.total) * 100) : 0;
        const dupPen = e.total ? Math.round((e.dup / e.total) * 100) : 0;
        const pendPen = e.total ? Math.round((e.pend / e.total) * 100) : 0;
        const score = Math.max(
          0,
          Math.round(cov * 0.7 + (100 - dupPen) * 0.15 + (100 - pendPen) * 0.15),
        );
        return {
          supervisor_id: sid,
          supervisor_name: sup?.full_name || sid.slice(0, 8),
          team_size: e.team.size,
          total: e.total,
          georeferenced: e.geo,
          coverage_pct: cov,
          pendencies: e.pend,
          duplicates: e.dup,
          score,
        };
      })
      .sort((a, b) => b.score - a.score);

    // === Alerts ===
    const alerts: GeorefAlert[] = [];
    for (const b of blocks) {
      if (b.coverage_pct === 0 && b.total > 0) {
        alerts.push({
          id: `block_no_geo_${b.id}`,
          kind: "block_no_geo",
          severity: "warning",
          message: `Quarteirão ${b.number} (${b.locality || "—"}) sem nenhum imóvel georreferenciado.`,
          block_id: b.id,
          block_number: b.number,
          rg_id: b.rg_id,
        });
      } else if (b.coverage_pct < 70 && b.total >= 5) {
        alerts.push({
          id: `block_low_${b.id}`,
          kind: "block_low_coverage",
          severity: "critical",
          message: `Quarteirão ${b.number} com cobertura ${b.coverage_pct}% (< 70%).`,
          block_id: b.id,
          block_number: b.number,
          rg_id: b.rg_id,
        });
      }
    }
    for (const r of rows) {
      if (r.status === "invalid") {
        alerts.push({
          id: `inv_${r.id}`,
          kind: "coords_invalid",
          severity: "critical",
          message: `Coordenadas inválidas em ${r.street_name || r.id.slice(0, 8)}.`,
          property_id: r.id,
          block_number: r.block_number,
        });
      } else if (r.status === "duplicated") {
        alerts.push({
          id: `dup_${r.id}`,
          kind: "coords_duplicated",
          severity: "critical",
          message: `Coordenadas duplicadas em ${r.street_name || r.id.slice(0, 8)}.`,
          property_id: r.id,
          block_number: r.block_number,
        });
      } else if (r.status === "missing") {
        if (r.has_focus) {
          alerts.push({
            id: `focus_${r.id}`,
            kind: "focus_no_gps",
            severity: "critical",
            message: `Imóvel com foco confirmado sem GPS: ${r.street_name || r.id.slice(0, 8)}.`,
            property_id: r.id,
            block_number: r.block_number,
          });
        } else if (r.has_pendency) {
          alerts.push({
            id: `pend_${r.id}`,
            kind: "old_pendency_no_gps",
            severity: "warning",
            message: `Pendência sem localização: ${r.street_name || r.id.slice(0, 8)}.`,
            property_id: r.id,
            block_number: r.block_number,
          });
        } else {
          alerts.push({
            id: `nogps_${r.id}`,
            kind: "property_no_gps",
            severity: "warning",
            message: `Imóvel sem GPS: ${r.street_name || r.id.slice(0, 8)}.`,
            property_id: r.id,
            block_number: r.block_number,
          });
        }
      }
    }
    // Order: critical first, cap at 500
    alerts.sort((a, b) => {
      const w = { critical: 0, warning: 1, info: 2 };
      return w[a.severity] - w[b.severity];
    });
    const limitedAlerts = alerts.slice(0, 500);

    // === History (recent geocoded) ===
    const historySample = scoped
      .filter((p: any) => p.geocoded_at)
      .sort((a: any, b: any) => (a.geocoded_at < b.geocoded_at ? 1 : -1))
      .slice(0, 50)
      .map((p: any) => ({
        property_id: p.id,
        geocoded_at: p.geocoded_at,
        geocoded_by: p.geocoded_by,
        geocoded_by_name: p.geocoded_by
          ? (profMap.get(p.geocoded_by) as any)?.full_name || null
          : null,
        source: p.geocoded_by ? "Captura manual" : "Sincronização",
      }));

    const total = scoped.length;
    const coverage_pct = total ? Math.round((georef / total) * 100) : 0;
    const dup_pct = total ? Math.round((duplicated / total) * 100) : 0;
    const inv_pct = total ? Math.round((invalid / total) * 100) : 0;
    const orph_pct = total
      ? Math.round(
          ((propsWithoutBlock + propsWithoutBoletim) / (total * 2)) * 100,
        )
      : 0;
    const offline_health = lastSync ? 100 : 50;

    const quality_score = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          coverage_pct * 0.4 +
            (100 - dup_pct) * 0.2 +
            (100 - inv_pct) * 0.2 +
            (100 - orph_pct) * 0.15 +
            offline_health * 0.05,
        ),
      ),
    );

    // RG sem imóveis (boletins) e imóveis sem RG (no scope)
    const rgWithoutProps = boletinsWithoutProps;
    const propsWithoutRg = propsWithoutBoletim;

    return {
      generated_at: new Date().toISOString(),
      quality_score,
      score_breakdown: {
        coverage: coverage_pct,
        duplicates_penalty: dup_pct,
        invalid_penalty: inv_pct,
        orphans_penalty: orph_pct,
        offline_health,
      },
      kpis: {
        total_properties: total,
        georeferenced: georef,
        without_gps: total - georef - invalid,
        coverage_pct,
        invalid_coords: invalid,
        duplicated_coords: duplicated,
        blocks_total: blocks.length,
        blocks_full_coverage: blocks_full,
        blocks_partial,
        blocks_none,
        last_geocoded_at: lastGeo,
        rg_without_properties: rgWithoutProps,
        properties_without_rg: propsWithoutRg,
        last_sync_at: lastSync,
      },
      properties: filteredRows.slice(0, 1500).map((r) => {
        const { agent_id: _aid, geocoded_by: _gb, ...rest } = r as any;
        void _aid; void _gb;
        return rest;
      }) as any,
      blocks: blocks.sort((a, b) => a.coverage_pct - b.coverage_pct).slice(0, 1000),
      orphans: {
        properties_without_block: propsWithoutBlock,
        properties_without_boletim: propsWithoutBoletim,
        blocks_without_properties: blocksWithoutProps,
        boletins_without_properties: boletinsWithoutProps,
      },
      weekly_coverage,
      agents_ranking,
      supervisors_ranking,
      alerts: limitedAlerts,
      history_sample: historySample,
    };
  });
