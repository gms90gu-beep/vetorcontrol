-- Phase 1, COPY ONLY. This is a registry/foundation, not multi-tenant activation.
-- Legacy privileged RPCs and offline scopes must be migrated before unlocking tenants.
begin;

create table public.municipalities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 3 and 120),
  state_code text not null check (state_code ~ '^[A-Z]{2}$'),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  state text not null default 'draft' check (state in ('draft','active')),
  created_at timestamptz not null default now(),
  constraint municipal_activation_phase_one check (state = 'draft' or slug = 'euclides-da-cunha-ba')
);
create table public.platform_administrators (
  user_id uuid primary key references auth.users(id) on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.platform_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id),
  municipality_id uuid references public.municipalities(id),
  action text not null,
  created_at timestamptz not null default now()
);

alter table public.municipalities enable row level security;
alter table public.platform_administrators enable row level security;
alter table public.platform_audit_log enable row level security;
revoke all on public.municipalities, public.platform_administrators, public.platform_audit_log from public, anon, authenticated;
grant select on public.municipalities, public.platform_administrators, public.platform_audit_log to authenticated;
grant all on public.municipalities, public.platform_administrators, public.platform_audit_log to service_role;
create policy platform_admin_self_read on public.platform_administrators for select to authenticated using (user_id = (select auth.uid()));

insert into public.municipalities(name,state_code,slug,state) values ('Euclides da Cunha','BA','euclides-da-cunha-ba','active');

do $migration$
declare municipality uuid; relation text;
begin
  select id into strict municipality from public.municipalities where slug='euclides-da-cunha-ba';
  foreach relation in array array[
    'agents','areas','audit_log','block_progress','blocks','boletins_rg','cycles','daily_work_records',
    'data_audit_snapshots','field_work_records','field_work_sessions','focus_deposit_selection_history',
    'focus_result_history','localities','pending_records','profiles','properties','property_pendencies',
    'property_recovery_attempts','rg_ocr_imports','rg_pdf_exports','rg_records','rg_uploads','streets',
    'subareas','system_settings','user_roles','vehicles','visit_deposits','visits','visits_backfill_report',
    'weekly_bulletins','weeks'
  ] loop
    -- Constant default preserves old/offline payloads and does not run UPDATE triggers.
    execute format('alter table public.%I add column municipality_id uuid not null default %L::uuid references public.municipalities(id)',relation,municipality);
    execute format('create index %I on public.%I(municipality_id)',relation||'_municipality_idx',relation);
    -- Explicit temporary fence: no second municipality can hold operational data yet.
    execute format('alter table public.%I add constraint %I check (municipality_id = %L::uuid)',relation,relation||'_municipality_phase_one',municipality);
  end loop;
end $migration$;

create policy municipality_visible_to_member on public.municipalities for select to authenticated using (
  id in (select p.municipality_id from public.profiles p where p.id=(select auth.uid()))
  or exists (select 1 from public.platform_administrators a where a.user_id=(select auth.uid()) and a.is_active)
);
create policy platform_audit_admin_read on public.platform_audit_log for select to authenticated using (
  exists (select 1 from public.platform_administrators a where a.user_id=(select auth.uid()) and a.is_active)
);

create function public.create_municipality_draft(actor uuid, municipality_name text, state_code_value text, municipality_slug text)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $function$
declare created_id uuid;
begin
  if not exists(select 1 from public.platform_administrators where user_id=actor and is_active) then
    raise exception 'Platform administrator required' using errcode='42501';
  end if;
  insert into public.municipalities(name,state_code,slug,state)
  values(btrim(municipality_name),upper(state_code_value),municipality_slug,'draft') returning id into created_id;
  insert into public.platform_audit_log(actor_id,municipality_id,action) values(actor,created_id,'municipality_draft_created');
  return created_id;
end $function$;
revoke all on function public.create_municipality_draft(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.create_municipality_draft(uuid,text,text,text) to service_role;
commit;
