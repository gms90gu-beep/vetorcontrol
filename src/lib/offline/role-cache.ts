// role-cache.ts — leitura offline-first do papel do usuário.
// Cacheia em localStorage para que beforeLoad das rotas protegidas continue
// funcionando sem internet.

import { supabase } from "@/integrations/supabase/client";
import { safeFetch } from "./safe-fetch";

const KEY = (uid: string) => `vc_role_${uid}`;

export async function getCachedUserRole(userId: string): Promise<string | null> {
  // Offline-first imediato: se temos cache local, devolve já e revalida em background.
  let cached: string | null = null;
  try { cached = localStorage.getItem(KEY(userId)); } catch {}

  const remote = () => safeFetch<string | null>(
    async () => {
      const { data, error } = await supabase.rpc("get_user_role", { u_id: userId });
      if (error) throw error;
      const role = (data as string | null) ?? null;
      try { if (role) localStorage.setItem(KEY(userId), role); } catch {}
      return role;
    },
    async () => cached,
    { label: "user_role" },
  );

  if (cached) {
    // Não bloqueia a UI; revalida em background.
    remote().catch(() => {});
    return cached;
  }

  // Sem cache: aguarda remoto com timeout curto para não travar layout offline.
  try {
    return await Promise.race([
      remote(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
    ]);
  } catch {
    return null;
  }
}


export function readCachedUserRole(userId: string): string | null {
  try { return localStorage.getItem(KEY(userId)); } catch { return null; }
}
