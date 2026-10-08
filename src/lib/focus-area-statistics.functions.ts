import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapVisitInPeriod } from "@/lib/map-visit-period";
import { operationalDateBoundsUtcIso } from "@/lib/operational-date";

type CycleOption = { id: string; name: string; number: number | null; year: number | null; start_date: string; end_date: string };
type FocusAreaRow = {
  areaId: string;
  area: string;
  focusEvents: number;
  focusProperties: number;
  visitedProperties: number;
  positivityRate: number;
};
type FocusNeighborhoodRow = FocusAreaRow & { neighborhood: string };

export interface FocusAreaStatistics {
  years: number[];
  cycles: CycleOption[];
  totals: {
    focusEvents: number;
    focusProperties: number;
    visitedProperties: number;
    positivityRate: number;
    areasWithFocus: number;
  };
  byArea: FocusAreaRow[];
  byNeighborhood: FocusNeighborhoodRow[];
  monthlyTrend: Array<{ period: string; focusEvents: number; focusProperties: number }>;
}

const EMPTY_TOTALS = {
  focusEvents: 0,
  focusProperties: 0,
  visitedProperties: 0,
  positivityRate: 0,
  areasWithFocus: 0,
};

function chunks<T>(items: T[], size = 500): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

async function fetchRowsByIds(
  db: any,
  table: string,
  select: string,
  column: string,
  ids: string[],
): Promise<any[]> {
  const rows: any[] = [];
  for (const batch of chunks(ids)) {
    const { data, error } = await db.from(table).select(select).in(column, batch);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
  }
  return rows;
}

export const getFocusAreaStatistics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { year?: number | null; cycleId?: string | null }) => input)
  .handler(async ({ data, context }): Promise<FocusAreaStatistics> => {
    const db = context.supabase as any;
    const userId = context.userId;
    const { data: roleData, error: roleError } = await db.rpc("get_user_role", { u_id: userId });
    if (roleError) throw new Error(roleError.message);
    const role = String(roleData || "");
    if (!["supervisor", "coordenador", "admin_master"].includes(role)) {
      throw new Error("Acesso restrito à supervisão, coordenação e administração master.");
    }

    // Define o escopo de agentes no servidor antes de consultar visitas.
    let agentIds: string[] = [];
    if (role === "supervisor") {
      const { data: agents, error } = await db
        .from("profiles")
        .select("id")
        .eq("role", "agente")
        .eq("supervisor_id", userId);
      if (error) throw new Error(error.message);
      agentIds = (agents || []).map((row: any) => row.id);
    } else if (role === "coordenador") {
      const { data: supervisors, error: supervisorError } = await db
        .from("profiles")
        .select("id")
        .eq("role", "supervisor")
        .eq("coordinator_id", userId);
      if (supervisorError) throw new Error(supervisorError.message);
      const supervisorIds = (supervisors || []).map((row: any) => row.id);
      if (supervisorIds.length) {
        const { data: agents, error } = await db
          .from("profiles")
          .select("id")
          .eq("role", "agente")
          .in("supervisor_id", supervisorIds);
        if (error) throw new Error(error.message);
        agentIds = (agents || []).map((row: any) => row.id);
      }
    } else {
      const { data: agents, error } = await db.from("profiles").select("id").eq("role", "agente");
      if (error) throw new Error(error.message);
      agentIds = (agents || []).map((row: any) => row.id);
    }

    const { data: cycleRows, error: cyclesError } = await db
      .from("cycles")
      .select("id, name, number, year, start_date, end_date")
      .order("year", { ascending: false })
      .order("number", { ascending: true });
    if (cyclesError) throw new Error(cyclesError.message);
    const cycles = (cycleRows || []) as CycleOption[];
    const years = Array.from(
      new Set(cycles.map((cycle) => Number(cycle.year)).filter((year) => Number.isInteger(year) && year > 0)),
    ).sort((a, b) => b - a);

    const requestedYear = Number.isInteger(data.year) && (data.year || 0) > 0 ? data.year ?? null : null;
    let selectedCycles = requestedYear
      ? cycles.filter((cycle) => Number(cycle.year) === requestedYear)
      : cycles;

    if (data.cycleId) {
      const selectedCycle = cycles.find((cycle) => cycle.id === data.cycleId);
      if (!selectedCycle || (requestedYear && Number(selectedCycle.year) !== requestedYear)) {
        throw new Error("O ciclo selecionado não pertence ao ano informado.");
      }
      selectedCycles = [selectedCycle];
    }

    if (!agentIds.length || !selectedCycles.length) {
      return { years, cycles, totals: { ...EMPTY_TOTALS }, byArea: [], byNeighborhood: [], monthlyTrend: [] };
    }

    const cycleIds = selectedCycles.map((cycle) => cycle.id);
    const periodStart = operationalDateBoundsUtcIso(selectedCycles.map((c) => c.start_date).sort()[0]).startIso;
    const periodEnd = operationalDateBoundsUtcIso(selectedCycles.map((c) => c.end_date).sort().at(-1) ?? selectedCycles[0].end_date).endIso;
    const visits: any[] = [];
    const PAGE_SIZE = 1000;
    for (let offset = 0; ; offset += PAGE_SIZE) {
      let query = db
        .from("visits")
        .select("agent_id, property_id, cycle_id, visit_date, has_focus")
        .in("agent_id", agentIds)
        .gte("visit_date", periodStart)
        .lte("visit_date", periodEnd)
        .order("visit_date", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      const { data: page, error } = await query;
      if (error) throw new Error(error.message);
      visits.push(...(page || []).filter((visit: { cycle_id: string | null; visit_date: string }) => mapVisitInPeriod(visit, periodStart, periodEnd, cycleIds)));
      if (!page || page.length < PAGE_SIZE) break;
    }

    const propertyIds = Array.from(new Set(visits.map((visit) => visit.property_id).filter(Boolean)));
    const properties = propertyIds.length
      ? await fetchRowsByIds(db, "properties", "id, block_id, neighborhood", "id", propertyIds)
      : [];
    const propertyById = new Map(properties.map((property: any) => [property.id, property]));

    const blockIds = Array.from(new Set(properties.map((property: any) => property.block_id).filter(Boolean)));
    const blocks = blockIds.length
      ? await fetchRowsByIds(db, "blocks", "id, subarea_id, neighborhood", "id", blockIds)
      : [];
    const blockById = new Map(blocks.map((block: any) => [block.id, block]));

    const subareaIds = Array.from(new Set(blocks.map((block: any) => block.subarea_id).filter(Boolean)));
    const subareas = subareaIds.length
      ? await fetchRowsByIds(db, "subareas", "id, locality_id, name", "id", subareaIds)
      : [];
    const subareaById = new Map(subareas.map((subarea: any) => [subarea.id, subarea]));

    const localityIds = Array.from(new Set(subareas.map((subarea: any) => subarea.locality_id).filter(Boolean)));
    const localities = localityIds.length
      ? await fetchRowsByIds(db, "localities", "id, area_id, name", "id", localityIds)
      : [];
    const localityById = new Map(localities.map((locality: any) => [locality.id, locality]));

    const areaIds = Array.from(new Set(localities.map((locality: any) => locality.area_id).filter(Boolean)));
    const areas = areaIds.length
      ? await fetchRowsByIds(db, "areas", "id, name", "id", areaIds)
      : [];
    const areaById = new Map(areas.map((area: any) => [area.id, area]));

    type Bucket = { events: number; focusPropertyIds: Set<string>; visitedPropertyIds: Set<string> };
    const areaBuckets = new Map<string, Bucket & { name: string }>();
    const neighborhoodBuckets = new Map<string, Bucket & { areaId: string; area: string; neighborhood: string }>();
    const monthBuckets = new Map<string, { year: number; month: number; events: number; focusPropertyIds: Set<string> }>();

    const getBucket = (map: Map<string, any>, key: string, create: () => any) => {
      let bucket = map.get(key);
      if (!bucket) {
        bucket = create();
        map.set(key, bucket);
      }
      return bucket;
    };

    for (const visit of visits) {
      const property = propertyById.get(visit.property_id) as any;
      const block = property?.block_id ? blockById.get(property.block_id) as any : null;
      const subarea = block?.subarea_id ? subareaById.get(block.subarea_id) as any : null;
      const locality = subarea?.locality_id ? localityById.get(subarea.locality_id) as any : null;
      const areaId = locality?.area_id || "unassigned";
      const areaName = areaId === "unassigned"
        ? "Área não identificada"
        : ((areaById.get(areaId) as any)?.name || "Área não identificada");
      const neighborhood = String(property?.neighborhood || block?.neighborhood || locality?.name || "Bairro não informado");
      const propertyId = String(visit.property_id);
      const areaBucket = getBucket(areaBuckets, areaId, () => ({
        name: areaName,
        events: 0,
        focusPropertyIds: new Set<string>(),
        visitedPropertyIds: new Set<string>(),
      }));
      const neighborhoodKey = areaId + "::" + neighborhood;
      const neighborhoodBucket = getBucket(neighborhoodBuckets, neighborhoodKey, () => ({
        areaId,
        area: areaName,
        neighborhood,
        events: 0,
        focusPropertyIds: new Set<string>(),
        visitedPropertyIds: new Set<string>(),
      }));

      areaBucket.visitedPropertyIds.add(propertyId);
      neighborhoodBucket.visitedPropertyIds.add(propertyId);

      if (visit.has_focus === true) {
        areaBucket.events += 1;
        areaBucket.focusPropertyIds.add(propertyId);
        neighborhoodBucket.events += 1;
        neighborhoodBucket.focusPropertyIds.add(propertyId);

        const visitYear = Number(String(visit.visit_date || "").slice(0, 4));
        const visitMonth = Number(String(visit.visit_date || "").slice(5, 7));
        if (visitYear > 0 && visitMonth > 0) {
          const period = visitYear + "-" + String(visitMonth).padStart(2, "0");
          const monthBucket = getBucket(monthBuckets, period, () => ({
            year: visitYear,
            month: visitMonth,
            events: 0,
            focusPropertyIds: new Set<string>(),
          }));
          monthBucket.events += 1;
          monthBucket.focusPropertyIds.add(propertyId);
        }
      }
    }

    const toRow = (bucket: Bucket) => {
      const visitedProperties = bucket.visitedPropertyIds.size;
      const focusProperties = bucket.focusPropertyIds.size;
      return {
        focusEvents: bucket.events,
        focusProperties,
        visitedProperties,
        positivityRate: visitedProperties ? Math.round((focusProperties / visitedProperties) * 1000) / 10 : 0,
      };
    };

    const byArea: FocusAreaRow[] = Array.from(areaBuckets.entries())
      .map(([areaId, bucket]) => ({ areaId, area: bucket.name, ...toRow(bucket) }))
      .sort((a, b) => b.focusProperties - a.focusProperties || b.focusEvents - a.focusEvents);

    const byNeighborhood: FocusNeighborhoodRow[] = Array.from(neighborhoodBuckets.entries())
      .map(([, bucket]) => ({ areaId: bucket.areaId, area: bucket.area, neighborhood: bucket.neighborhood, ...toRow(bucket) }))
      .filter((row) => row.focusEvents > 0)
      .sort((a, b) => b.focusProperties - a.focusProperties || b.focusEvents - a.focusEvents);

    const totalEvents = byArea.reduce((sum, row) => sum + row.focusEvents, 0);
    const totalFocusProperties = new Set(visits.filter((visit) => visit.has_focus === true).map((visit) => String(visit.property_id))).size;
    const totalVisitedProperties = new Set(visits.map((visit) => String(visit.property_id))).size;
    const monthlyTrend = Array.from(monthBuckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, bucket]) => ({
        period: String(bucket.month).padStart(2, "0") + "/" + bucket.year,
        focusEvents: bucket.events,
        focusProperties: bucket.focusPropertyIds.size,
      }));

    return {
      years,
      cycles,
      totals: {
        focusEvents: totalEvents,
        focusProperties: totalFocusProperties,
        visitedProperties: totalVisitedProperties,
        positivityRate: totalVisitedProperties ? Math.round((totalFocusProperties / totalVisitedProperties) * 1000) / 10 : 0,
        areasWithFocus: byArea.filter((row) => row.focusProperties > 0).length,
      },
      byArea,
      byNeighborhood,
      monthlyTrend,
    };
  });
