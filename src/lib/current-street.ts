/**
 * CURRENT STREET — Logradouro atual do Quarteirão.
 *
 * Esta lógica só é acionada DURANTE a execução de campo (primeira visita ou
 * captura GPS subsequente). NUNCA é executada durante o planejamento de RG.
 *
 * Fontes priorizadas:
 *   1. blocks.current_street (rua confirmada pelo agente)
 *   2. Histórico do quarteirão (properties.street_name)
 *   3. Cache local de reverse geocoding
 *   4. Reverse geocoding remoto (GPS)
 *   5. Digitação manual
 *
 * Nada é aplicado sem confirmação explícita do agente.
 */
import Dexie, { type Table } from "dexie";
import { supabase } from "@/integrations/supabase/client";
import { reverseGeocode } from "@/lib/geocoding.functions";
import { isOnline } from "@/lib/offline/safe-fetch";

// ─── Cache local de reverse geocoding ────────────────────────────────────────
interface StreetCacheRow {
  key: string; // `${lat3}|${lng3}` (~110m)
  latitude: number;
  longitude: number;
  road: string;
  neighborhood?: string;
  city?: string;
  updatedAt: number;
}

class StreetCacheDB extends Dexie {
  streets!: Table<StreetCacheRow, string>;
  constructor() {
    super("CurrentStreetCacheDB");
    this.version(1).stores({ streets: "key, updatedAt" });
  }
}
const cacheDb = new StreetCacheDB();
const cacheKey = (lat: number, lng: number) => `${lat.toFixed(3)}|${lng.toFixed(3)}`;

function normalize(s: string | null | undefined) {
  return (s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// ─── API pública ─────────────────────────────────────────────────────────────

export interface BlockStreetInfo {
  blockId: string;
  currentStreet: string | null;
  confirmedAt: string | null;
  confirmedBy: string | null;
  history: string[]; // ruas já usadas em properties.street_name
}

export async function getBlockCurrentStreet(blockId: string): Promise<BlockStreetInfo | null> {
  if (!blockId) return null;
  try {
    const { data: block } = await supabase
      .from("blocks")
      .select("id, current_street, current_street_confirmed_at, current_street_confirmed_by")
      .eq("id", blockId)
      .maybeSingle();
    if (!block) return null;

    const { data: props } = await supabase
      .from("properties")
      .select("street_name")
      .eq("block_id", blockId)
      .not("street_name", "is", null)
      .limit(500);

    const seen = new Set<string>();
    const history: string[] = [];
    for (const p of props || []) {
      const s = (p.street_name || "").trim();
      if (!s) continue;
      const k = normalize(s);
      if (seen.has(k)) continue;
      seen.add(k);
      history.push(s);
    }
    if (history.length) console.log("[CURRENT_STREET_HISTORY_FOUND]", history);

    return {
      blockId: block.id,
      currentStreet: block.current_street ?? null,
      confirmedAt: block.current_street_confirmed_at ?? null,
      confirmedBy: block.current_street_confirmed_by ?? null,
      history,
    };
  } catch (e) {
    console.warn("[CURRENT_STREET_READ_ERROR]", e);
    return null;
  }
}

export interface GpsStreetDetection {
  street: string | null;
  neighborhood?: string;
  city?: string;
  source: "cache" | "reverse" | "none";
}

export async function detectFromGPS(coords: {
  latitude: number;
  longitude: number;
}): Promise<GpsStreetDetection> {
  console.log("[CURRENT_STREET_FIRST_GPS]", coords);
  // Cache
  try {
    const c = await cacheDb.streets.get(cacheKey(coords.latitude, coords.longitude));
    if (c?.road) {
      console.log("[CURRENT_STREET_GPS_DETECTED]", c.road);
      return { street: c.road, neighborhood: c.neighborhood, city: c.city, source: "cache" };
    }
  } catch {
    /* ignore */
  }

  if (!isOnline()) return { street: null, source: "none" };

  try {
    const res = await reverseGeocode({
      data: { lat: coords.latitude, lng: coords.longitude },
    });
    if (!res.ok || !res.address) return { street: null, source: "none" };
    console.log("[CURRENT_STREET_GPS_DETECTED]", res.address);
    try {
      await cacheDb.streets.put({
        key: cacheKey(coords.latitude, coords.longitude),
        latitude: coords.latitude,
        longitude: coords.longitude,
        road: res.address,
        neighborhood: res.neighborhood,
        city: res.city,
        updatedAt: Date.now(),
      });
    } catch {
      /* ignore */
    }
    return {
      street: res.address,
      neighborhood: res.neighborhood,
      city: res.city,
      source: "reverse",
    };
  } catch (e) {
    console.warn("[CURRENT_STREET_GPS_ERROR]", e);
    return { street: null, source: "none" };
  }
}

export async function confirmBlockStreet(params: {
  blockId: string;
  street: string;
  actorId: string | null;
}): Promise<void> {
  const street = params.street.trim();
  if (!street) return;
  const { error } = await supabase
    .from("blocks")
    .update({
      current_street: street,
      current_street_confirmed_at: new Date().toISOString(),
      current_street_confirmed_by: params.actorId,
    })
    .eq("id", params.blockId);
  if (error) throw error;
  console.log("[CURRENT_STREET_CONFIRMED]", street);
}

/**
 * Preenche street_name apenas em imóveis do quarteirão que ainda estão sem rua.
 * Nunca sobrescreve um valor digitado pelo agente.
 */
export async function propagateToEmptyProperties(
  blockId: string,
  street: string,
): Promise<number> {
  const value = street.trim();
  if (!value || !blockId) return 0;
  try {
    const { data, error } = await supabase
      .from("properties")
      .update({ street_name: value })
      .eq("block_id", blockId)
      .or("street_name.is.null,street_name.eq.")
      .select("id");
    if (error) throw error;
    const ids = (data || []).map((r) => r.id);
    ids.forEach((id) => console.log("[CURRENT_STREET_PROPERTY_INHERITED]", id));
    return ids.length;
  } catch (e) {
    console.warn("[CURRENT_STREET_PROPAGATE_ERROR]", e);
    return 0;
  }
}

export function isSameStreet(a?: string | null, b?: string | null) {
  return normalize(a) === normalize(b);
}
