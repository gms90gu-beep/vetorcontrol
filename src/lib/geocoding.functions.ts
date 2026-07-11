import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export type ReverseGeocodeResult = {
  ok: boolean;
  address?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  formatted?: string;
  reason?: string;
};

async function nominatimReverse(lat: number, lng: number): Promise<ReverseGeocodeResult> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=pt-BR&zoom=18&addressdetails=1`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "VetorControl/1.0 (reverse-geocode fallback)",
        Accept: "application/json",
      },
    });
    if (!res.ok) return { ok: false, reason: `osm_http_${res.status}` };
    const json: any = await res.json();
    const a = json.address || {};
    const address = a.road || a.pedestrian || a.footway || a.residential || a.path || a.cycleway || undefined;
    if (!address) return { ok: false, reason: "osm_no_address" };
    return {
      ok: true,
      address,
      neighborhood: a.suburb || a.neighbourhood || a.quarter || a.village,
      city: a.city || a.town || a.municipality || a.county,
      state: a.state,
      formatted: json.display_name,
    };
  } catch (e: any) {
    return { ok: false, reason: e?.message || "osm_unknown" };
  }
}

export const reverseGeocode = createServerFn({ method: "POST" })
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data }): Promise<ReverseGeocodeResult> => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY;
    // Se o Google Maps não estiver conectado, cai direto no fallback OSM.
    if (!LOVABLE_API_KEY || !GOOGLE_KEY) {
      const osm = await nominatimReverse(data.lat, data.lng);
      return osm.ok ? osm : { ok: false, reason: "google_maps_not_connected" };
    }
    try {
      const url = `https://connector-gateway.lovable.dev/google_maps/maps/api/geocode/json?latlng=${data.lat},${data.lng}&language=pt-BR`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": GOOGLE_KEY,
        },
      });
      const json: any = await res.json();
      if (!res.ok || json.status !== "OK" || !json.results?.length) {
        // Fallback OSM quando Google falha (ZERO_RESULTS, quota, http error).
        const osm = await nominatimReverse(data.lat, data.lng);
        if (osm.ok) return osm;
        return { ok: false, reason: json.status || `http_${res.status}` };
      }
      const first = json.results[0];
      const comps: Array<{ long_name: string; types: string[] }> = first.address_components || [];
      const find = (t: string) => comps.find((c) => c.types.includes(t))?.long_name;
      return {
        ok: true,
        address: find("route"),
        neighborhood: find("sublocality_level_1") || find("sublocality") || find("political"),
        city: find("administrative_area_level_2") || find("locality"),
        state: find("administrative_area_level_1"),
        formatted: first.formatted_address,
      };
    } catch (e: any) {
      const osm = await nominatimReverse(data.lat, data.lng);
      if (osm.ok) return osm;
      return { ok: false, reason: e?.message || "unknown" };
    }
  });
