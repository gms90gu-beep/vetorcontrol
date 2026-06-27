/**
 * AUTO STREET — Preenchimento automático do logradouro via Reverse Geocoding.
 *
 * Implementação totalmente ISOLADA. Não altera RG, BRG, PDF, sync, mapa.
 * Controlada por feature flag (default: desligada).
 *
 * Fluxo:
 *   GPS → cache local → quarteirão próximo (<30m) → reverse geocoding remoto
 *   → atualiza properties.street_name (e neighborhood) APENAS se estiver vazio.
 *
 * O valor digitado pelo agente NUNCA é sobrescrito.
 */
import Dexie, { type Table } from "dexie";
import { supabase } from "@/integrations/supabase/client";
import { reverseGeocode } from "@/lib/geocoding.functions";
import { isOnline } from "@/lib/offline/safe-fetch";

// ─── Feature flag ─────────────────────────────────────────────────────────────
export const ENABLE_AUTO_STREET = false;

// ─── Cache local (Dexie isolado) ─────────────────────────────────────────────
interface StreetCacheRow {
  key: string; // `${lat3}|${lng3}` (precisão ~110m)
  latitude: number;
  longitude: number;
  road: string;
  neighborhood?: string;
  city?: string;
  confidence: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  updatedAt: number;
}

class StreetCacheDB extends Dexie {
  streets!: Table<StreetCacheRow, string>;
  constructor() {
    super("AutoStreetCacheDB");
    this.version(1).stores({ streets: "key, latitude, longitude, updatedAt" });
  }
}
const cacheDb = new StreetCacheDB();

const cacheKey = (lat: number, lng: number) =>
  `${lat.toFixed(3)}|${lng.toFixed(3)}`;

async function getCached(lat: number, lng: number) {
  try {
    return await cacheDb.streets.get(cacheKey(lat, lng));
  } catch {
    return undefined;
  }
}

async function putCached(row: StreetCacheRow) {
  try {
    await cacheDb.streets.put(row);
  } catch {
    /* ignore */
  }
}

// ─── Distância (Haversine, metros) ──────────────────────────────────────────
function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

// ─── Reaproveitamento por quarteirão ────────────────────────────────────────
async function nearbyBlockStreet(
  blockId: string | null,
  coords: { latitude: number; longitude: number },
): Promise<string | null> {
  if (!blockId) return null;
  try {
    const { data, error } = await supabase
      .from("properties")
      .select("latitude, longitude, street_name")
      .eq("block_id", blockId)
      .not("street_name", "is", null)
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .limit(50);
    if (error || !data) return null;
    for (const p of data) {
      const d = distanceMeters(
        { lat: coords.latitude, lng: coords.longitude },
        { lat: Number(p.latitude), lng: Number(p.longitude) },
      );
      if (d <= 30 && p.street_name) return p.street_name;
    }
  } catch {
    /* ignore */
  }
  return null;
}

// ─── Resultado público ──────────────────────────────────────────────────────
export interface AutoStreetResult {
  street?: string;
  neighborhood?: string;
  confidence: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  source: "cache" | "block" | "reverse" | "none";
}

/**
 * Resolve o logradouro a partir das coordenadas e — se o flag estiver ligado
 * e o imóvel ainda não tiver street_name preenchido — persiste em properties.
 * Nunca sobrescreve um valor já existente (manual ou anterior).
 */
export async function resolveAndApplyStreet(params: {
  propertyId: string;
  coords: { latitude: number; longitude: number };
  blockId?: string | null;
  currentStreet?: string | null;
}): Promise<AutoStreetResult> {
  console.log("[AUTO_STREET_START]");
  console.log("[AUTO_STREET_GPS]", params.coords);

  if (!ENABLE_AUTO_STREET) return { confidence: "UNKNOWN", source: "none" };

  // Cache local
  const cached = await getCached(params.coords.latitude, params.coords.longitude);
  if (cached?.road) {
    console.log("[AUTO_STREET_CACHE_HIT]", cached);
    return persistIfEmpty(params, {
      street: cached.road,
      neighborhood: cached.neighborhood,
      confidence: cached.confidence,
      source: "cache",
    });
  }
  console.log("[AUTO_STREET_CACHE_MISS]");

  // Reaproveitamento por quarteirão
  const blockStreet = await nearbyBlockStreet(params.blockId ?? null, params.coords);
  if (blockStreet) {
    return persistIfEmpty(params, {
      street: blockStreet,
      confidence: "MEDIUM",
      source: "block",
    });
  }

  // Reverse geocoding remoto (precisa estar online)
  if (!isOnline()) {
    console.log("[AUTO_STREET_OFFLINE]");
    return { confidence: "UNKNOWN", source: "none" };
  }

  try {
    const res = await reverseGeocode({
      data: { lat: params.coords.latitude, lng: params.coords.longitude },
    });
    console.log("[AUTO_STREET_REVERSE_RESULT]", res);
    if (!res.ok || !res.address) return { confidence: "LOW", source: "none" };

    await putCached({
      key: cacheKey(params.coords.latitude, params.coords.longitude),
      latitude: params.coords.latitude,
      longitude: params.coords.longitude,
      road: res.address,
      neighborhood: res.neighborhood,
      city: res.city,
      confidence: "HIGH",
      updatedAt: Date.now(),
    });

    return persistIfEmpty(params, {
      street: res.address,
      neighborhood: res.neighborhood,
      confidence: "HIGH",
      source: "reverse",
    });
  } catch (e) {
    console.warn("[AUTO_STREET_REVERSE_ERROR]", e);
    return { confidence: "UNKNOWN", source: "none" };
  }
}

async function persistIfEmpty(
  params: { propertyId: string; currentStreet?: string | null },
  result: AutoStreetResult,
): Promise<AutoStreetResult> {
  if (!result.street) return result;
  const current = (params.currentStreet || "").trim();
  if (current.length > 0) {
    // Nunca sobrescrever — apenas reportar (UI pode oferecer sugestão).
    console.log("[AUTO_STREET_SKIP_EXISTING]", { current, suggested: result.street });
    return result;
  }
  try {
    const patch: { street_name: string; neighborhood?: string } = {
      street_name: result.street,
    };
    if (result.neighborhood) patch.neighborhood = result.neighborhood;
    const { error } = await supabase
      .from("properties")
      .update(patch)
      .eq("id", params.propertyId);
    if (error) throw error;
    console.log("[AUTO_STREET_FILLED]", result.street);
  } catch (e) {
    console.warn("[AUTO_STREET_PERSIST_ERROR]", e);
  }
  return result;
}
