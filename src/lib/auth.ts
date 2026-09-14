/**
 * auth.ts
 * Autenticação offline-first.
 *
 * Princípio: sessão local é sempre fonte da verdade.
 * Supabase é usado apenas para validar/renovar quando online.
 * NUNCA bloqueie navegação esperando resposta de rede.
 */

import { db, type LocalSession } from '../db/database';
import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';

// ─── Leitura de sessão (offline-safe) ────────────────────────────────────────

/**
 * Retorna a sessão salva localmente.
 * Nunca faz chamada de rede. Sempre instantâneo.
 */
export async function getLocalSession(): Promise<LocalSession | null> {
  try {
    return (await db.sessions.get('current')) ?? null;
  } catch {
    return null;
  }
}

/**
 * Verifica se há uma sessão local válida (não expirada).
 * Usado por guardas de rota — sem rede.
 */
export async function hasValidLocalSession(): Promise<boolean> {
  const session = await getLocalSession();
  if (session && session.expiresAt > Date.now() - 60_000) return true;
  // Fallback: aceitar sessão persistida pelo próprio Supabase no localStorage.
  // Cobre usuários que logaram antes do espelhamento Dexie estar ativo.
  return hasSupabaseLocalStorageSession();
}

/**
 * Lê de forma síncrona o token persistido pelo Supabase no localStorage.
 * Não toca rede. Retorna true se houver token não expirado.
 */
function supabaseAuthStorageKeys(): string[] {
  if (typeof window === "undefined") return [];
  const projectId = (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID as string | undefined;
  if (projectId) return [`sb-${projectId}-auth-token`];

  try {
    // O project ID pode não estar exposto no preview, mas a sessão ainda pode
    // existir no localStorage. Limitar o padrão ao formato oficial do Supabase.
    return Object.keys(window.localStorage).filter((key) => /^sb-.+-auth-token$/.test(key));
  } catch {
    return [];
  }
}

export function getPersistedSupabaseSession(): Session | null {
  for (const key of supabaseAuthStorageKeys()) {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(key) || "null");
      const session = parsed?.currentSession ?? parsed;
      if (session?.access_token && session?.user?.id) return session as Session;
    } catch {}
  }
  return null;
}

export function hasSupabaseLocalStorageSession(): boolean {
  try {
    const session = getPersistedSupabaseSession();
    if (!session) return false;
    const expiresAt = session.expires_at;
    if (!expiresAt) return true;
    return expiresAt * 1000 > Date.now() - 60_000;
  } catch {
    return false;
  }
}


// ─── Persistência de sessão ───────────────────────────────────────────────────

export async function saveSessionLocally(session: {
  user: { id: string; email?: string };
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in?: number;
}): Promise<void> {
  const expiresAt = session.expires_at
    ? session.expires_at * 1000
    : Date.now() + (session.expires_in ?? 3600) * 1000;

  await db.sessions.put({
    id: 'current',
    userId: session.user.id,
    email: session.user.email ?? '',
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt,
    createdAt: Date.now(),
  });
}

export async function clearLocalSession(): Promise<void> {
  await db.sessions.delete('current');
}

// ─── Login ────────────────────────────────────────────────────────────────────

export async function signIn(email: string, password: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
      return { success: false, error: error?.message ?? 'Login falhou' };
    }

    await saveSessionLocally(data.session);
    return { success: true };
  } catch {
    return { success: false, error: 'Sem conexão com o servidor' };
  }
}

// ─── Logout ───────────────────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
  await clearLocalSession();
  // Tenta revogar no servidor mas não bloqueia
  supabase.auth.signOut().catch(() => {});
}

// ─── Sync de sessão (background, quando online) ───────────────────────────────

/**
 * Tenta renovar o token em background.
 * Não bloqueia nada — falha silenciosamente se offline.
 */
export async function syncSessionInBackground(): Promise<void> {
  const local = await getLocalSession();
  if (!local) return;

  try {
    const { data, error } = await supabase.auth.setSession({
      access_token: local.accessToken,
      refresh_token: local.refreshToken,
    });

    if (!error && data.session) {
      await saveSessionLocally(data.session);
    }
  } catch {
    // offline — ignora, sessão local continua válida
  }
}

// ─── Hook de estado reativo ───────────────────────────────────────────────────

/**
 * Exporta o cliente Supabase para uso direto quando necessário.
 * Mas nunca use `supabase.auth.getUser()` para bloquear rotas.
 */
export { supabase };
