// Shim para imports relativos `../auth/auth`. Implementação real em `@/lib/auth`.
// `supabase` é re-exportado como `any` para permitir uso com nomes de tabela dinâmicos.
import { supabase as _supabase } from '@/lib/auth';

export { getLocalSession, hasValidLocalSession, signIn, signOut, syncSessionInBackground, saveSessionLocally, clearLocalSession } from '@/lib/auth';

export const supabase: any = _supabase;
