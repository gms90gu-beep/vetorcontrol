-- Copy validation only: invite the municipal administrator by email and keep
-- the account inactive until the recipient confirms the address and sets a password.
begin;

alter table public.municipal_admin_requests
  add column invited_at timestamptz;

create unique index municipal_admin_requests_one_pending_email
  on public.municipal_admin_requests (email)
  where state = 'pending';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  invited_municipality uuid;
begin
  select r.municipality_id
    into invited_municipality
  from public.municipal_admin_requests r
  join public.municipalities m on m.id = r.municipality_id
  where r.email = lower(btrim(new.email))
    and r.state = 'pending'
    and m.state = 'active'
  limit 1;

  if invited_municipality is not null then
    insert into public.profiles
      (id, full_name, email, role, municipality_id, is_active)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.email),
      lower(new.email),
      'admin_master'::public.user_role_type,
      invited_municipality,
      false
    )
    on conflict (id) do nothing;
  else
    insert into public.profiles (id, full_name, email, role)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.email),
      new.email,
      'agente'::public.user_role_type
    )
    on conflict (id) do nothing;
  end if;

  return new;
end;
$function$;

create or replace function public.ensure_agent_for_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.role = 'agente'::public.user_role_type then
    insert into public.agents (profile_id, name, status, municipality_id)
    values (
      new.id,
      coalesce(nullif(new.full_name, ''), new.email, 'Agente'),
      'active',
      new.municipality_id
    )
    on conflict (profile_id) do nothing;
  end if;
  return new;
end;
$function$;

revoke all on function public.handle_new_user()
  from public, anon, authenticated;
revoke all on function public.ensure_agent_for_profile()
  from public, anon, authenticated;

create or replace function public.register_municipal_administrator(
  actor uuid,
  target_municipality uuid,
  administrator_email text
)
returns text
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  target public.profiles%rowtype;
  request_state text := 'pending';
  request_profile uuid;
  pending_exists boolean;
begin
  if not exists (
    select 1 from public.platform_administrators
    where user_id = actor and is_active
  ) then
    raise exception 'Platform administrator required' using errcode = '42501';
  end if;

  perform 1 from public.municipalities
  where id = target_municipality and state = 'active'
  for update;
  if not found then
    raise exception 'Convites só podem ser enviados para um município em operação.'
      using errcode = '22023';
  end if;

  select exists (
    select 1 from public.municipal_admin_requests r
    where r.email = lower(btrim(administrator_email))
      and r.municipality_id = target_municipality
      and r.state = 'pending'
  ) into pending_exists;

  select p.* into target
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(u.email) = lower(btrim(administrator_email));

  if found then
    if target.municipality_id <> target_municipality then
      raise exception 'Essa conta pertence a outro município.' using errcode = '42501';
    end if;
    if target.role::text <> 'admin_master' then
      raise exception 'A conta informada já existe e não é um Admin Master convidado.'
        using errcode = '22023';
    end if;
    if target.is_active is true then
      if not exists (
        select 1 from auth.users
        where id = target.id and email_confirmed_at is not null
      ) then
        raise exception 'O e-mail da conta ainda não foi confirmado.';
      end if;
      request_state := 'linked';
      request_profile := target.id;
    elsif not pending_exists then
      raise exception 'A conta está inativa e não tem um convite pendente.'
        using errcode = '22023';
    end if;
  end if;

  insert into public.municipal_admin_requests
    (municipality_id, email, profile_id, state)
  values (
    target_municipality,
    lower(btrim(administrator_email)),
    request_profile,
    request_state
  )
  on conflict (municipality_id, email)
  do update set profile_id = excluded.profile_id, state = excluded.state;

  insert into public.platform_audit_log
    (actor_id, municipality_id, action, metadata)
  values (
    actor,
    target_municipality,
    'municipal_administrator_registered',
    jsonb_build_object('email', lower(btrim(administrator_email)), 'state', request_state)
  );

  return request_state;
end;
$function$;

create or replace function public.accept_municipal_admin_invitation()
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := auth.uid();
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
    and r.invited_at is not null
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

revoke all on function public.accept_municipal_admin_invitation()
  from public, anon;
grant execute on function public.accept_municipal_admin_invitation()
  to authenticated;

commit;
