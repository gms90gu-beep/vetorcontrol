import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";

export type PlaceSuggestion = {
  placeId: string;
  primary: string;
  secondary: string;
  full: string;
};

export const placesAutocomplete = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      input: z.string().min(2).max(200),
      lat: z.number().optional(),
      lng: z.number().optional(),
    }).parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; suggestions?: PlaceSuggestion[]; reason?: string }> => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY;
    if (!LOVABLE_API_KEY || !GOOGLE_KEY) return { ok: false, reason: "google_maps_not_connected" };
    try {
      const body: any = {
        input: data.input,
        languageCode: "pt-BR",
        regionCode: "BR",
        includedPrimaryTypes: ["route", "street_address", "premise"],
      };
      if (data.lat != null && data.lng != null) {
        body.locationBias = {
          circle: { center: { latitude: data.lat, longitude: data.lng }, radius: 5000 },
        };
      }
      const res = await fetch(`${GATEWAY}/places/v1/places:autocomplete`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": GOOGLE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const json: any = await res.json();
      if (!res.ok) return { ok: false, reason: json?.error?.message || `http_${res.status}` };
      const suggestions: PlaceSuggestion[] = (json.suggestions || [])
        .map((s: any) => s.placePrediction)
        .filter(Boolean)
        .map((p: any) => ({
          placeId: p.placeId,
          primary: p.structuredFormat?.mainText?.text || p.text?.text || "",
          secondary: p.structuredFormat?.secondaryText?.text || "",
          full: p.text?.text || "",
        }));
      return { ok: true, suggestions };
    } catch (e: any) {
      return { ok: false, reason: e?.message || "unknown" };
    }
  });

export const placeDetails = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ placeId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY;
    if (!LOVABLE_API_KEY || !GOOGLE_KEY) return { ok: false as const, reason: "google_maps_not_connected" };
    try {
      const res = await fetch(`${GATEWAY}/places/v1/places/${encodeURIComponent(data.placeId)}?languageCode=pt-BR`, {
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": GOOGLE_KEY,
          "X-Goog-FieldMask": "id,displayName,formattedAddress,location,addressComponents",
        },
      });
      const json: any = await res.json();
      if (!res.ok) return { ok: false as const, reason: json?.error?.message || `http_${res.status}` };
      const comps: Array<{ longText: string; types: string[] }> = json.addressComponents || [];
      const find = (t: string) => comps.find((c) => c.types.includes(t))?.longText;
      return {
        ok: true as const,
        address: find("route") || json.displayName?.text || "",
        neighborhood: find("sublocality_level_1") || find("sublocality") || find("political") || "",
        city: find("administrative_area_level_2") || find("locality") || "",
        state: find("administrative_area_level_1") || "",
        formatted: json.formattedAddress || "",
        latitude: json.location?.latitude ?? null,
        longitude: json.location?.longitude ?? null,
      };
    } catch (e: any) {
      return { ok: false as const, reason: e?.message || "unknown" };
    }
  });
