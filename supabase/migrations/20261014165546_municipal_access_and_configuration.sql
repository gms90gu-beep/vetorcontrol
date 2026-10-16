-- Captured from the already-applied copy-project migration.
-- Keep this file aligned with Supabase migration version 20261014165546.
-- This restores version-controlled schema history; it is not intended to be
-- re-applied to a database that already records this version.
begin;

create table public.municipality_settings (
  municipality_id uuid primary key references public.municipalities(id),
  ibge_code text unique check (ibge_code is null or ibge_code ~ '^[0-9]{7}$'),
  contact_name text not null default '' check (length(contact_name) <= 120),
  contact_email text not null default '' check (length(contact_email) <= 254),
  contact_phone text not null default '' check (length(contact_phone) <= 30),
  max_active_users integer check (max_active_users >= 1 and max_active_users <= 10000),
  updated_at timestamptz not null default now()
);

create table public.municipal_admin_requests (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipalities(id),
  email text not null check (
    email = lower(btrim(email))
    and length(email) <= 254
    and email like '%@%'
  ),
  profile_id uuid references public.profiles(id),
  state text not null check (state in ('pending', 'linked')),
  created_at timestamptz not null default now(),
  unique (municipality_id, email),
  check (
    (state = 'pending' and profile_id is null)
    or (state = 'linked' and profile_id is not null)
  )
);

alter table public.platform_audit_log
  add column metadata jsonb not null default '{}'::jsonb;

alter table public.municipality_settings enable row level security;
alter table public.municipal_admin_requests enable row level security;

revoke all on public.municipality_settings, public.municipal_admin_requests
  from public, anon, authenticated;
grant select on public.municipality_settings, public.municipal_admin_requests
  to authenticated;
grant all on public.municipality_settings, public.municipal_admin_requests
  to service_role;

create policy settings_platform_read
  on public.municipality_settings
  for select to authenticated
  using (
    exists (
      select 1
      from public.platform_administrators a
      where a.user_id = auth.uid()
        and a.is_active
    )
  );

create policy admins_platform_read
  on public.municipal_admin_requests
  for select to authenticated
  using (
    exists (
      select 1
      from public.platform_administrators a
      where a.user_id = auth.uid()
        and a.is_active
    )
  );

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
begin
  if not exists (
    select 1
    from public.platform_administrators
    where user_id = actor and is_active
  ) then
    raise exception 'Platform administrator required' using errcode = '42501';
  end if;

  perform 1
  from public.municipalities
  where id = target_municipality
  for update;
  if not found then
    raise exception 'Município não encontrado.';
  end if;

  select p.* into target
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(u.email) = lower(btrim(administrator_email));

  if found then
    if target.municipality_id <> target_municipality then
      raise exception 'Essa conta pertence a outro município.'
        using errcode = '42501';
    end if;
    if target.role::text <> 'admin_master' or target.is_active is not true then
      raise exception 'A conta precisa ser um Admin Master municipal ativo.'
        using errcode = '22023';
    end if;
    if not exists (
      select 1
      from auth.users
      where id = target.id and email_confirmed_at is not null
    ) then
      raise exception 'O e-mail da conta ainda não foi confirmado.';
    end if;
    request_state := 'linked';
    request_profile := target.id;
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
end
$function$;

create or replace function public.save_municipality_configuration(
  actor uuid,
  target_municipality uuid,
  configuration jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  requested_limit integer;
  old_settings jsonb;
begin
  if not exists (
    select 1
    from public.platform_administrators
    where user_id = actor and is_active
  ) then
    raise exception 'Platform administrator required' using errcode = '42501';
  end if;

  perform 1
  from public.municipalities
  where id = target_municipality
  for update;
  if not found then
    raise exception 'Município não encontrado.';
  end if;

  requested_limit := nullif(configuration ->> 'maxActiveUsers', '')::integer;
  if requested_limit is not null
     and requested_limit < (
       select count(*)
       from public.profiles
       where municipality_id = target_municipality and is_active is true
     ) then
    raise exception 'O limite é menor que a quantidade de usuários ativos.'
      using errcode = '22023';
  end if;

  select to_jsonb(s) into old_settings
  from public.municipality_settings s
  where municipality_id = target_municipality;

  insert into public.municipality_settings
    (municipality_id, ibge_code, contact_name, contact_email, contact_phone, max_active_users)
  values (
    target_municipality,
    nullif(configuration ->> 'ibgeCode', ''),
    coalesce(configuration ->> 'contactName', ''),
    coalesce(configuration ->> 'contactEmail', ''),
    coalesce(configuration ->> 'contactPhone', ''),
    requested_limit
  )
  on conflict (municipality_id)
  do update set
    ibge_code = excluded.ibge_code,
    contact_name = excluded.contact_name,
    contact_email = excluded.contact_email,
    contact_phone = excluded.contact_phone,
    max_active_users = excluded.max_active_users,
    updated_at = now();

  insert into public.platform_audit_log
    (actor_id, municipality_id, action, metadata)
  values (
    actor,
    target_municipality,
    'municipality_configuration_updated',
    jsonb_build_object('previous', old_settings, 'configuration', configuration)
  );
end
$function$;

revoke all on function public.register_municipal_administrator(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.register_municipal_administrator(uuid, uuid, text)
  to service_role;

revoke all on function public.save_municipality_configuration(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_municipality_configuration(uuid, uuid, jsonb)
  to service_role;

commit;
