import { PROPERTY_TYPE_LABELS } from "@/lib/focus-observations";
import { supabase } from "@/integrations/supabase/client";
import { operationalDateBoundsUtcIso, toOperationalDate } from "@/lib/operational-date";
import { readAllQueryPages } from "@/lib/query-pages";

export type CollectionTubito = {
  position: number;
  collection_year: number;
  serial: number;
  collection_number: number;
  deposit_type: string;
};

export type TubitoReportRow = CollectionTubito & {
  date: string;
  agent: string;
  block: string;
  street: string;
  property: string;
  propertyType: string;
};

export function formatCollectionNumber(serial: number, year: number) {
  return `${String(serial).padStart(3, "0")}/${year}`;
}

export function tubitoNumber(tube: CollectionTubito) {
  return formatCollectionNumber(tube.serial, tube.collection_year);
}

export async function fetchTubitosForVisit(visitId: string) {
  const { data, error } = await supabase
    .from("visits")
    .select("collection_tubitos(position,collection_year,serial,collection_number,deposit_type)")
    .eq("id", visitId)
    .maybeSingle();
  if (error) throw error;
  return (data?.collection_tubitos ?? []).sort((a, b) => a.position - b.position);
}

type TubitoVisit = {
  visit_date: string;
  properties: { number: string; block_number: string; street_name: string; type: string } | null;
  collection_tubitos: CollectionTubito[];
};

export async function fetchTubitoReportRows(
  agentId: string,
  start: string,
  end: string,
  agent: string,
  client = supabase,
  scope?: { cycleId: string | null },
): Promise<TubitoReportRow[]> {
  let query = client.from("visits")
    .select("visit_date,properties(number,block_number,street_name,type),collection_tubitos!inner(position,collection_year,serial,collection_number,deposit_type)")
    .eq("agent_id", agentId)
    .gte("visit_date", operationalDateBoundsUtcIso(start).startIso)
    .lte("visit_date", operationalDateBoundsUtcIso(end).endIso)
    .order("visit_date").order("id");
  if (scope) query = scope.cycleId
    ? query.eq("cycle_id", scope.cycleId)
    : query.is("cycle_id", null);

  const visits = await readAllQueryPages<TubitoVisit>(query);
  return visits.flatMap((visit) => visit.collection_tubitos
    .sort((a, b) => a.serial - b.serial)
    .map((tube) => ({
      ...tube,
      date: (toOperationalDate(visit.visit_date) ?? "").split("-").reverse().join("/"),
      agent,
      block: visit.properties?.block_number ?? "—",
      street: visit.properties?.street_name ?? "—",
      property: visit.properties?.number ?? "—",
      propertyType: PROPERTY_TYPE_LABELS[visit.properties?.type ?? ""] ?? visit.properties?.type ?? "—",
    })));
}
