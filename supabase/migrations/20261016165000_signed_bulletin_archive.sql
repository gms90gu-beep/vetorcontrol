begin;

create table public.signed_bulletin_archive (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null default private.current_municipality()
    references public.municipalities(id),
  agent_profile_id uuid not null references public.profiles(id) on delete restrict,
  agent_name_snapshot text not null,
  registration_snapshot text,
  report_type text not null check (report_type in ('daily', 'weekly')),
  period_start date not null,
  period_end date not null,
  epi_week integer,
  epi_year integer,
  cycle_id uuid,
  source_daily_record_id uuid,
  file_name text not null,
  storage_path text not null unique,
  document_sha256 text,
  signed_at timestamptz not null default now(),
  signature_method text not null default 'authenticated_user_confirmation',
  status text not null default 'pending' check (status in ('pending', 'ready')),
  uploaded_at timestamptz,
  created_at timestamptz not null default now(),
  constraint signed_bulletin_period_valid check (period_end >= period_start),
  constraint signed_bulletin_hash_valid check (document_sha256 is null or document_sha256 ~ '^[0-9a-f]{64}$'),
  constraint signed_bulletin_status_consistent check (
    (status = 'pending' and uploaded_at is null and document_sha256 is null)
    or (status = 'ready' and uploaded_at is not null and document_sha256 is not null)
  ),
  constraint signed_bulletin_path_owner check (storage_path = agent_profile_id::text || '/' || id::text || '.pdf'),
  constraint signed_bulletin_daily_source check (
    (report_type = 'daily' and source_daily_record_id is not null and period_start = period_end)
    or (report_type = 'weekly' and source_daily_record_id is null)
  )
);

create index signed_bulletin_archive_period_idx
  on public.signed_bulletin_archive (municipality_id, report_type, period_start desc);
create index signed_bulletin_archive_agent_idx
  on public.signed_bulletin_archive (agent_profile_id, period_start desc);
create index signed_bulletin_archive_cycle_idx
  on public.signed_bulletin_archive (municipality_id, cycle_id, period_start desc)
  where cycle_id is not null;
create unique index signed_bulletin_archive_one_official_issue
  on public.signed_bulletin_archive (
    agent_profile_id,
    report_type,
    period_start,
    period_end,
    coalesce(cycle_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

alter table public.signed_bulletin_archive enable row level security;
revoke all on public.signed_bulletin_archive from public, anon, authenticated;
grant select, insert on public.signed_bulletin_archive to authenticated;
grant update (status, uploaded_at, document_sha256) on public.signed_bulletin_archive to authenticated;

create policy signed_bulletins_read_scoped
  on public.signed_bulletin_archive for select to authenticated
  using (
    municipality_id = (select private.current_municipality())
    and (
      (status = 'ready' and public.can_supervise_user(agent_profile_id))
      or (status = 'pending' and agent_profile_id = (select auth.uid()))
    )
  );

create policy signed_bulletins_insert_self
  on public.signed_bulletin_archive for insert to authenticated
  with check (
    agent_profile_id = (select auth.uid())
    and municipality_id = (select private.current_municipality())
    and status = 'pending'
    and uploaded_at is null
    and document_sha256 is null
    and signature_method = 'authenticated_user_confirmation'
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.municipality_id = (select private.current_municipality())
        and p.role::text in ('agente', 'agent')
        and coalesce(p.is_active, false)
        and p.full_name = agent_name_snapshot
    )
    and (
      (
        report_type = 'daily'
        and exists (
          select 1 from public.daily_work_records d
          where d.id = source_daily_record_id
            and d.agent_id = (select auth.uid())
            and d.work_date = period_start
            and d.status = 'completed'
            and d.municipality_id = (select private.current_municipality())
        )
      )
      or
      (
        report_type = 'weekly'
        and exists (
          select 1 from public.daily_work_records d
          where d.agent_id = (select auth.uid())
            and d.work_date between period_start and period_end
            and d.status = 'completed'
            and d.municipality_id = (select private.current_municipality())
        )
        and not exists (
          select 1 from public.daily_work_records d
          where d.agent_id = (select auth.uid())
            and d.work_date between period_start and period_end
            and d.status <> 'completed'
            and d.municipality_id = (select private.current_municipality())
        )
      )
    )
  );

create policy signed_bulletins_update_upload_only
  on public.signed_bulletin_archive for update to authenticated
  using (agent_profile_id = (select auth.uid()) and status = 'pending')
  with check (
    agent_profile_id = (select auth.uid())
    and status = 'ready'
    and uploaded_at is not null
    and document_sha256 ~ '^[0-9a-f]{64}$'
  );

create function public.keep_signed_bulletin_immutable()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if old.status <> 'pending'
     or new.status <> 'ready'
     or old.uploaded_at is not null
     or old.document_sha256 is not null
     or (to_jsonb(new) - 'status' - 'uploaded_at' - 'document_sha256')
        is distinct from (to_jsonb(old) - 'status' - 'uploaded_at' - 'document_sha256') then
    raise exception 'Signed bulletins are immutable';
  end if;
  return new;
end;
$function$;

create trigger signed_bulletin_immutable
  before update on public.signed_bulletin_archive
  for each row execute function public.keep_signed_bulletin_immutable();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signed-bulletins', 'signed-bulletins', false, 20971520, array['application/pdf'])
on conflict (id) do update
set public = false,
    file_size_limit = 20971520,
    allowed_mime_types = array['application/pdf'];

create policy signed_bulletins_upload_pending_own
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'signed-bulletins'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.signed_bulletin_archive a
      where a.storage_path = name
        and a.agent_profile_id = (select auth.uid())
        and a.status = 'pending'
    )
  );

create policy signed_bulletins_read_scoped
  on storage.objects for select to authenticated
  using (
    bucket_id = 'signed-bulletins'
    and exists (
      select 1 from public.signed_bulletin_archive a
      where a.storage_path = name
        and a.status = 'ready'
        and public.can_supervise_user(a.agent_profile_id)
    )
  );

commit;
