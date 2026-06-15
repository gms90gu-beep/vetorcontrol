/**
 * Geolocalização inteligente de imóveis.
 * - Captura GPS apenas quando o imóvel ainda não foi georreferenciado.
 * - NÃO rastreia o agente: jamais usa watchPosition nem armazena trajetos.
 */
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/offline/db";
import { enqueueMutation } from "@/lib/offline/db";
import { isOnline } from "@/lib/offline/safe-fetch";

export interface Coords {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export function requestCurrentPosition(
  opts: PositionOptions = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocalização não suportada neste dispositivo."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      (err) => reject(err),
      opts,
    );
  });
}

/**
 * Persiste lat/lng no imóvel (online + offline).
 * O trigger no banco rejeita sobrescritas de agentes — UI já oculta o botão de
 * "Atualizar localização" para quem não pode.
 */
export async function savePropertyLocation(
  propertyId: string,
  coords: Coords,
  actorId: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  const patch = {
    latitude: coords.latitude,
    longitude: coords.longitude,
    geocoded_at: now,
    geocoded_by: actorId ?? null,
  };

  // Atualiza cache local imediatamente
  const cached = await db.properties.get(propertyId);
  if (cached) {
    await db.properties.put({
      id: propertyId,
      data: { ...cached.data, ...patch },
      updatedAt: now,
    });
  }

  if (isOnline()) {
    const { error } = await supabase.from("properties").update(patch).eq("id", propertyId);
    if (error) throw error;
    return;
  }

  // Offline: enfileira para sync
  await enqueueMutation({
    table: "properties",
    op: "update",
    pk: propertyId,
    payload: patch,
  });
}
