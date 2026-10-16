import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { assertPlatformAdministrator, normalizeMunicipalityDraft, normalizeMunicipalAdministrator } from './platform-policy.mjs';

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

export const registerMunicipalAdministrator = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { municipalityId: string; email: string }) => normalizeMunicipalAdministrator(input))
  .handler(async ({ data, context }) => {
    await requirePlatform(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: state, error } = await (supabaseAdmin as any).rpc('register_municipal_administrator', {
      actor: context.userId,
      target_municipality: data.municipalityId,
      administrator_email: data.email,
    });
    if (error) {
      if (error.code === '42501') throw new Error('A conta informada precisa ser Admin Master ativo deste município.');
      if (error.code === '22023' && error.message?.includes('município em operação')) {
        throw new Error('Convites só podem ser enviados para municípios em operação.');
      }
      if (error.code === '22023') throw new Error('Essa conta não está apta para ser Admin Master municipal.');
      if (error.code === '23505') throw new Error('Já existe um registro para esse e-mail neste município.');
      throw new Error('Não foi possível registrar o Admin Master.');
    }
    return { state: state as 'pending'|'linked' };
  });

export const sendMunicipalAdministratorInvitation = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { municipalityId: string; email: string }) => normalizeMunicipalAdministrator(input))
  .handler(async ({ data, context }) => {
    await requirePlatform(context.supabase, context.userId);

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: municipality, error: municipalityError } = await (supabaseAdmin as any)
      .from('municipalities')
      .select('id,state')
      .eq('id', data.municipalityId)
      .maybeSingle();
    if (municipalityError || municipality?.state !== 'active') {
      throw new Error('Convites só podem ser enviados para um município em operação.');
    }

    const { data: request, error: requestError } = await (supabaseAdmin as any)
      .from('municipal_admin_requests')
      .select('state,invited_at')
      .eq('municipality_id', data.municipalityId)
      .eq('email', data.email)
      .maybeSingle();
    if (requestError || !request || request.state !== 'pending') {
      throw new Error('Não há convite pendente para este e-mail e município.');
    }
    if (request.invited_at) return { state: 'already_sent' as const };

    // This feature is intentionally deployed only on the validation copy.
    // The fixed origin prevents an authenticated request from choosing an
    // arbitrary redirect destination for a privileged invitation.
    const redirectTo = 'https://vetorcontrol-copy-validation.vetorcontrol-reserva-gms90gu.workers.dev/reset-password?invite=1';
    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      redirectTo,
    });
    if (inviteError) {
      throw new Error('Não foi possível enviar o convite. Confira o e-mail e a configuração de envio do Supabase.');
    }

    const { error: updateError } = await (supabaseAdmin as any)
      .from('municipal_admin_requests')
      .update({ invited_at: new Date().toISOString() })
      .eq('municipality_id', data.municipalityId)
      .eq('email', data.email)
      .eq('state', 'pending');
    if (updateError) {
      // The email is already sent. The acceptance RPC can still safely match
      // the pending request to the confirmed email and dormant profile.
      console.error('[platform] Invitation sent but status timestamp could not be saved.');
    }

    return { state: 'sent' as const };
  });

export const acceptMunicipalAdministratorInvitation = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(() => ({}))
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data, error } = await (supabaseAdmin as any)
      .rpc('accept_municipal_admin_invitation', { actor: context.userId });
    if (error) {
      if (error.code === '42501') throw new Error(error.message || 'Este convite não é válido para esta conta.');
      throw new Error('Não foi possível ativar o acesso municipal. Entre em contato com o Administrador Geral.');
    }
    return { municipalityName: data as string };
  });
