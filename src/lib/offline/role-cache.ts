// role-cache.ts — leitura offline-first do papel do usuário.
// Cacheia em localStorage para que beforeLoad das rotas protegidas continue
// funcionando sem internet.

import { supabase } from "@/integrations/supabase/client";
import { safeFetch } from "./safe-fetch";

const KEY = (uid: string) => `vc_role_${uid}`;

export async function getCachedUserRole(userId: string): Promise<string | null> {
  return safeFetch<string | null>(
    async () => {
      const { data, error } = await supabase.rpc("get_user_role", { u_id: userId });
      if (error) throw error;
      const role = (data as string | null) ?? null;
      try { if (role) localStorage.setItem(KEY(userId), role); } catch {}
      return role;
    },
    async () => {
      try { return localStorage.getItem(KEY(userId)); } catch { return null; }
    },
    { label: "user_role" },
  );
}

export function readCachedUserRole(userId: string): string | null {
  try { return localStorage.getItem(KEY(userId)); } catch { return null; }
}
