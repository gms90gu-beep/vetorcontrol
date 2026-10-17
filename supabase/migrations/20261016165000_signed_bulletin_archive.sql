create function public.signed_bulletin_epi_week_matches(
  p_start date,
  p_end date,
  p_week integer,
  p_year integer
)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $function$
declare
  v_jan1 date := make_date(p_year, 1, 1);
  v_next_jan1 date := make_date(p_year + 1, 1, 1);
  v_days_to_saturday integer;
  v_next_days_to_saturday integer;
  v_first_sunday date;
  v_next_first_sunday date;
begin
  v_days_to_saturday := mod(6 - extract(dow from v_jan1)::integer + 7, 7);
  v_first_sunday := v_jan1 + v_days_to_saturday
    - case when v_days_to_saturday >= 4 then 7 else 0 end - 6;

  v_next_days_to_saturday := mod(6 - extract(dow from v_next_jan1)::integer + 7, 7);
  v_next_first_sunday := v_next_jan1 + v_next_days_to_saturday
    - case when v_next_days_to_saturday >= 4 then 7 else 0 end - 6;

  return p_week between 1 and 53
    and p_start = v_first_sunday + ((p_week - 1) * 7)
    and p_start < v_next_first_sunday
    and p_end = p_start + 6;
end;
$function$;

revoke all on function public.signed_bulletin_epi_week_matches(date, date, integer, integer)
  from public, anon;
grant execute on function public.signed_bulletin_epi_week_matches(date, date, integer, integer)
  to authenticated;

create table public.signed_bulletin_archive (
  id uuid primary key default gen_random_uuid(),
  agent_profile_id uuid not null references public.profiles(id) on delete restrict,
  agent_name_snapshot text not null,
  registration_snapshot text,
  report_type text not null check (report_type in ('daily', 'weekly')),
  period_start date not null,
  period_end date not null,
  epi_week integer,
  epi_year integer,
  cycle_id uuid not null references public.cycles(id) on delete restrict,
  source_daily_record_id uuid references public.daily_work_records(id) on delete restrict,
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
  ),
  constraint signed_bulletin_week_metadata check (
    (report_type = 'daily' and epi_week is null and epi_year is null)
    or (
      report_type = 'weekly'
      and epi_week is not null and epi_week between 1 and 53
      and epi_year is not null and epi_year between 2000 and 2200
      and public.signed_bulletin_epi_week_matches(period_start, period_end, epi_week, epi_year)
    )
  )
);

create index signed_bulletin_archive_period_idx
  on public.signed_bulletin_archive (report_type, period_start desc);
create index signed_bulletin_archive_agent_idx
  on public.signed_bulletin_archive (agent_profile_id, period_start desc);
create index signed_bulletin_archive_cycle_idx
  on public.signed_bulletin_archive (cycle_id, period_start desc);
create unique index signed_bulletin_archive_one_official_issue
  on public.signed_bulletin_archive (
    agent_profile_id,
    report_type,
    period_start,
    period_end,
    cycle_id
  );

alter table public.signed_bulletin_archive enable row level security;
revoke all on public.signed_bulletin_archive from public, anon, authenticated;
grant select on public.signed_bulletin_archive to authenticated;
grant insert (
  agent_profile_id,
  agent_name_snapshot,
  registration_snapshot,
  report_type,
  period_start,
  period_end,
  epi_week,
  epi_year,
  cycle_id,
  source_daily_record_id,
  file_name,
  storage_path,
  signature_method
) on public.signed_bulletin_archive to authenticated;
grant update (status, document_sha256) on public.signed_bulletin_archive to authenticated;

create policy signed_bulletins_read_scoped
  on public.signed_bulletin_archive for select to authenticated
  using (
    (status = 'ready' and public.can_supervise_user(agent_profile_id))
    or (status = 'pending' and agent_profile_id = (select auth.uid()))
  );

create policy signed_bulletins_insert_self
  on public.signed_bulletin_archive for insert to authenticated
  with check (
    agent_profile_id = (select auth.uid())
    and status = 'pending'
    and uploaded_at is null
    and document_sha256 is null
    and signature_method = 'authenticated_user_confirmation'
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and coalesce(p.is_active, false)
        and p.full_name = agent_name_snapshot
    )
    and exists (
      select 1 from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.role::text in ('agente', 'agent')
    )
    and exists (
      select 1 from public.cycles c
      where c.id = signed_bulletin_archive.cycle_id
        and c.start_date <= period_end
        and c.end_date >= period_start
    )
    and (
      (
        report_type = 'daily'
        and exists (
          select 1 from public.daily_work_records d
          where d.id = source_daily_record_id
            and d.agent_id = (select auth.uid())
            and d.work_date = period_start
            and d.cycle_id = signed_bulletin_archive.cycle_id
            and d.status = 'completed'
            and exists (
              select 1 from public.cycles c
              where c.id = d.cycle_id
                and d.work_date between c.start_date and c.end_date
            )
        )
      )
      or
      (
        report_type = 'weekly'
        and public.signed_bulletin_epi_week_matches(period_start, period_end, epi_week, epi_year)
        and exists (
          select 1 from public.daily_work_records d
          where d.agent_id = (select auth.uid())
            and d.work_date between period_start and period_end
            and d.status = 'completed'
            and d.cycle_id = signed_bulletin_archive.cycle_id
            and exists (
              select 1 from public.cycles c
              where c.id = d.cycle_id
                and d.work_date between c.start_date and c.end_date
            )
        )
        and not exists (
          select 1 from public.daily_work_records d
          where d.agent_id = (select auth.uid())
            and d.work_date between period_start and period_end
            and (
              d.status <> 'completed'
              or d.cycle_id <> signed_bulletin_archive.cycle_id
              or not exists (
                select 1 from public.cycles c
                where c.id = d.cycle_id
                  and d.work_date between c.start_date and c.end_date
              )
            )
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
  new.uploaded_at := statement_timestamp();
  return new;
end;
$function$;

create trigger signed_bulletin_immutable
  before update on public.signed_bulletin_archive
  for each row execute function public.keep_signed_bulletin_immutable();

-- Storage API privileges are distinct from RLS policies. Uploads need INSERT;
-- downloads need SELECT. Do not grant UPDATE or DELETE for these immutable PDFs.
grant insert, select on storage.objects to authenticated;

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

