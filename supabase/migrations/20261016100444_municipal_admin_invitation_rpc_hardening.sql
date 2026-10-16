-- The browser reaches this operation only through an authenticated server
-- function. Keep the database RPC restricted to service_role and avoid a
-- SECURITY DEFINER endpoint in the exposed public schema.
begin;

drop function public.accept_municipal_admin_invitation();

create function public.accept_municipal_admin_invitation(actor uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  current_user_id uuid := actor;
  current_email text;
  target_request public.municipal_admin_requests%rowtype;
  municipality_name text;
begin
  if current_user_id is null then
    raise exception 'É necessário entrar pela tela do convite.' using errcode = '42501';
  end if;

  select lower(u.email) into current_email
  from auth.users u
  where u.id = current_user_id and u.email_confirmed_at is not null;
  if current_email is null then
    raise exception 'Confirme o endereço de e-mail antes de ativar o acesso.'
      using errcode = '42501';
  end if;

  select r.* into target_request
  from public.municipal_admin_requests r
  join public.municipalities m on m.id = r.municipality_id
  join public.profiles p on p.id = current_user_id
  where r.email = current_email
    and r.state = 'pending'
    and r.profile_id is null
    and m.state = 'active'
    and p.municipality_id = r.municipality_id
    and p.role::text = 'admin_master'
    and p.is_active is false
  for update of r;

  if not found then
    if exists (
      select 1 from public.municipal_admin_requests r
      where r.email = current_email
        and r.profile_id = current_user_id
        and r.state = 'linked'
    ) then
      return 'linked';
    end if;
    raise exception 'Não há convite municipal válido para esta conta.'
      using errcode = '42501';
  end if;

  select m.name into municipality_name
  from public.municipalities m where m.id = target_request.municipality_id;

  update public.profiles
  set is_active = true
  where id = current_user_id
    and municipality_id = target_request.municipality_id
    and role::text = 'admin_master'
    and is_active is false;

  if not found then
    raise exception 'Não foi possível ativar o perfil do Admin Master.';
  end if;

  insert into public.user_roles (user_id, role, municipality_id)
  values (
    current_user_id,
    'admin_master'::public.app_role,
    target_request.municipality_id
  )
  on conflict (user_id, role)
  do update set municipality_id = excluded.municipality_id;

  update public.municipal_admin_requests
  set profile_id = current_user_id, state = 'linked'
  where id = target_request.id and state = 'pending' and profile_id is null;

  insert into public.platform_audit_log
    (actor_id, municipality_id, action, metadata)
  values (
    current_user_id,
    target_request.municipality_id,
    'municipal_administrator_invitation_accepted',
    jsonb_build_object('email', current_email)
  );

  return municipality_name;
end;
$function$;

revoke all on function public.accept_municipal_admin_invitation(uuid)
  from public, anon, authenticated;
grant execute on function public.accept_municipal_admin_invitation(uuid)
  to service_role;

commit;
