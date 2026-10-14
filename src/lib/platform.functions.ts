import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { assertPlatformAdministrator, normalizeMunicipalityDraft } from './platform-policy.mjs';

async function requirePlatform(supabase: any, userId: string) {
  const { data, error } = await supabase.from('platform_administrators').select('is_active').eq('user_id', userId).maybeSingle();
  if (error) throw new Error('Não foi possível validar o acesso à plataforma.');
  assertPlatformAdministrator(data);
}

export const getPlatformMunicipalities = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePlatform(context.supabase, context.userId);
    // This query uses the authenticated client and its RLS, never service role.
    const { data, error } = await (context.supabase as any).from('municipalities')
      .select('id,name,state_code,slug,state,created_at').order('name');
    if (error) throw new Error('Não foi possível consultar os municípios.');
    return data as {id:string;name:string;state_code:string;slug:string;state:string;created_at:string}[];
  });

export const createMunicipalityDraft = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string; stateCode: string; slug: string }) => normalizeMunicipalityDraft(input))
  .handler(async ({ data, context }) => {
    await requirePlatform(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: result, error } = await (supabaseAdmin as any).rpc('create_municipality_draft', {
      actor: context.userId, municipality_name: data.name, state_code_value: data.stateCode, municipality_slug: data.slug,
    });
    if (error) throw new Error(error.code === '23505' ? 'Já existe um município com esse identificador.' : 'Não foi possível cadastrar o rascunho.');
    return { id: result as string };
  });
