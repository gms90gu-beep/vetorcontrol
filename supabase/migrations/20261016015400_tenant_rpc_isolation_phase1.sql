begin;

-- Role helpers may inspect users only within the caller's municipality.
create or replace function public.get_user_role(u_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select ur.role::text
  from public.user_roles ur
  where ur.user_id = u_id
    and auth.uid() is not null
    and (
      u_id = auth.uid()
      or exists (
        select 1
        from public.profiles target
        where target.id = u_id
          and target.municipality_id = private.current_municipality()
      )
    )
  order by case ur.role::text
    when 'admin_master' then 1
    when 'coordenador' then 2
    when 'supervisor' then 3
    when 'agente' then 4
    when 'admin' then 5
    when 'agent' then 6
    else 99
  end
  limit 1;
$function$;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select auth.uid() is not null
    and (
      _user_id = auth.uid()
      or exists (
        select 1
        from public.profiles target
        where target.id = _user_id
          and target.municipality_id = private.current_municipality()
      )
    )
    and exists (
      select 1
      from public.user_roles ur
      where ur.user_id = _user_id
        and ur.role = _role
    );
$function$;

create or replace function public.is_territory_manager(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select auth.uid() is not null
    and (
      _user_id = auth.uid()
      or exists (
        select 1 from public.profiles target
        where target.id = _user_id
          and target.municipality_id = private.current_municipality()
      )
    )
    and coalesce(
      public.has_role(_user_id, 'supervisor'::public.app_role)
      or public.has_role(_user_id, 'coordenador'::public.app_role)
      or public.has_role(_user_id, 'admin_master'::public.app_role)
      or public.has_role(_user_id, 'admin'::public.app_role)
      or exists (
        select 1 from public.profiles p
        where p.id = _user_id
          and p.municipality_id = private.current_municipality()
          and p.role in ('supervisor', 'coordenador', 'admin_master')
          and coalesce(p.is_active, true)
      ),
      false
    );
$function$;

-- Read RPCs must run with caller privileges so the municipality RLS boundary
-- applies to every table read by the function.
alter function public.get_current_cycle() security invoker;
alter function public.resolve_cycle_week(date) security invoker;
alter function public.get_operational_block_status(uuid, date) security invoker;
alter function public.get_coordinator_data(uuid) security invoker;

create or replace function public.get_coordinator_data(p_user_id uuid)
returns table(
  id uuid,
  full_name text,
  email text,
  role text,
  supervisor_id uuid,
  coordinator_id uuid,
  is_active boolean,
  city text,
  registration_number text
)
language plpgsql
stable
security invoker
set search_path = ''
as $function$
begin
  if auth.uid() is null
     or auth.uid() <> p_user_id
     or private.current_municipality() is null then
    return;
  end if;

  if public.get_user_role(p_user_id) = 'admin_master' then
    return query
    select p.id, p.full_name, p.email, p.role::text, p.supervisor_id,
           p.coordinator_id, p.is_active, p.city, p.registration_number
    from public.profiles p
    where p.municipality_id = private.current_municipality();
    return;
  end if;

  if public.get_user_role(p_user_id) = 'coordenador' then
    return query
    select p.id, p.full_name, p.email, p.role::text, p.supervisor_id,
           p.coordinator_id, p.is_active, p.city, p.registration_number
    from public.profiles p
    where p.municipality_id = private.current_municipality()
      and (
        p.id = p_user_id
        or (p.role = 'supervisor'
            and (p.coordinator_id = p_user_id or p.coordinator_id is null))
        or (
          p.role = 'agente'
          and (
            p.supervisor_id in (
              select s.id
              from public.profiles s
              where s.municipality_id = private.current_municipality()
                and s.role = 'supervisor'
                and (s.coordinator_id = p_user_id or s.coordinator_id is null)
            )
            or p.supervisor_id is null
          )
        )
      );
    return;
  end if;
end;
$function$;

-- The audit RPC is still available to the admin screen, but now runs under
-- RLS and checks the caller's municipal admin role.
create or replace function public.data_audit_report()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v jsonb := '{}'::jsonb;
  today date := public.operational_date(now());
begin
  if auth.uid() is null
     or private.current_municipality() is null
     or not public.has_role(auth.uid(), 'admin_master'::public.app_role) then
    raise exception 'Acesso restrito ao Admin Master do município.'
      using errcode = '42501';
  end if;

  v := v || jsonb_build_object('rg', jsonb_build_object(
    'total_blocks', (select count(*) from public.blocks),
    'blocks_with_properties', (select count(distinct block_id) from public.properties where block_id is not null),
    'blocks_without_properties', (select count(*) from public.blocks b where not exists (select 1 from public.properties p where p.block_id = b.id)),
    'duplicated_blocks', (select count(*) from (select number from public.blocks group by number having count(*) > 1) x),
    'blocks_without_owner', (select count(distinct b.id) from public.blocks b left join public.boletins_rg br on br.block_number = b.number where br.agent_id is null),
    'sample', (select coalesce(jsonb_agg(jsonb_build_object(
      'block', b.number,
      'agent', (select p.full_name from public.boletins_rg br left join public.profiles p on p.id = br.agent_id where br.block_number = b.number limit 1),
      'properties', (select count(*) from public.properties pp where pp.block_id = b.id),
      'status', b.status
    )), '[]'::jsonb) from (select * from public.blocks order by created_at desc limit 25) b)
  ));

  v := v || jsonb_build_object('properties', jsonb_build_object(
    'total', (select count(*) from public.properties),
    'without_block', (select count(*) from public.properties where block_id is null and block_number is null),
    'without_boletim', (select count(*) from public.properties where boletim_id is null),
    'without_street', (select count(*) from public.properties where (street_name is null or street_name = '') and street_id is null),
    'without_number', (select count(*) from public.properties where number is null or number = ''),
    'without_user', (select count(*) from public.properties where user_id is null),
    'duplicates', (select count(*) from (
      select block_number, number, street_name from public.properties
      where block_number is not null and number is not null
      group by block_number, number, street_name having count(*) > 1
    ) d)
  ));

  v := v || jsonb_build_object('gps', jsonb_build_object(
    'total', (select count(*) from public.properties),
    'geocoded', (select count(*) from public.properties where latitude is not null and longitude is not null),
    'missing', (select count(*) from public.properties where latitude is null or longitude is null),
    'invalid', (select count(*) from public.properties
      where (latitude is not null and (latitude < -90 or latitude > 90))
         or (longitude is not null and (longitude < -180 or longitude > 180))),
    'duplicated_coords', (select count(*) from (
      select latitude, longitude from public.properties
      where latitude is not null and longitude is not null
      group by latitude, longitude having count(*) > 1
    ) d)
  ));

  v := v || jsonb_build_object('visits', jsonb_build_object(
    'total', (select count(*) from public.visits),
    'without_property', (select count(*) from public.visits where property_id is null),
    'without_agent', (select count(*) from public.visits where agent_id is null),
    'without_date', (select count(*) from public.visits where visit_date is null),
    'orphan', (select count(*) from public.visits vv left join public.properties p on p.id = vv.property_id where p.id is null),
    'without_cycle', (select count(*) from public.visits where cycle_id is null)
  ));

  v := v || jsonb_build_object('foci', jsonb_build_object(
    'positive_visits', (select count(*) from public.visits where has_focus = true),
    'deposits_total', (select count(*) from public.visit_deposits),
    'positive_without_deposit', (select count(*) from public.visits vv where vv.has_focus = true and not exists (select 1 from public.visit_deposits d where d.visit_id = vv.id)),
    'positive_deposit_without_visit', (select count(*) from public.visit_deposits d left join public.visits vv on vv.id = d.visit_id where d.is_positive = true and vv.id is null),
    'deposit_without_type', (select count(*) from public.visit_deposits where type_code is null or type_code = ''),
    'positive_visit_without_property', (select count(*) from public.visits where has_focus = true and property_id is null)
  ));

  v := v || jsonb_build_object('users', jsonb_build_object(
    'total', (select count(*) from public.profiles),
    'inactive', (select count(*) from public.profiles where is_active = false),
    'agents_without_supervisor', (select count(*) from public.profiles where role = 'agente' and supervisor_id is null),
    'supervisors_without_team', (select count(*) from public.profiles s where s.role = 'supervisor' and not exists (select 1 from public.profiles a where a.supervisor_id = s.id)),
    'duplicated_emails', (select count(*) from (select email from public.profiles where email is not null group by email having count(*) > 1) d),
    'sample', (select coalesce(jsonb_agg(jsonb_build_object(
      'name', full_name, 'role', role, 'supervisor', supervisor_id, 'active', is_active
    )), '[]'::jsonb) from (select * from public.profiles order by created_at desc limit 25) p)
  ));

  v := v || jsonb_build_object('cycles', jsonb_build_object(
    'by_date', (select to_jsonb(c) from public.cycles c where today between start_date and end_date order by year desc, number limit 1),
    'by_status', (select to_jsonb(c) from public.cycles c where status = 'in_progress' order by year desc limit 1),
    'multiple_in_progress', (select count(*) > 1 from public.cycles where status = 'in_progress'),
    'expired_in_progress', (select count(*) from public.cycles where status = 'in_progress' and end_date < today)
  ));

  return v;
end;
$function$;

create or replace function public.ensure_block(_number text, _locality text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_block_id uuid;
  v_subarea_id uuid;
  v_municipality uuid := private.current_municipality();
  v_number text := btrim(_number);
  v_locality text := nullif(btrim(coalesce(_locality, '')), '');
begin
  if auth.uid() is null or v_municipality is null
     or not public.has_active_profile(auth.uid()) then
    raise exception 'Perfil ativo necessário.'
      using errcode = '42501';
  end if;
  if v_number is null or v_number = '' then
    raise exception 'Número do quarteirão obrigatório.';
  end if;

  select b.id into v_block_id
  from public.blocks b
  where b.municipality_id = v_municipality
    and b.number = v_number
    and (
      v_locality is null
      or lower(btrim(coalesce(b.locality, ''))) = lower(v_locality)
    )
  order by b.locality nulls last
  limit 1;

  if v_block_id is not null then
    return v_block_id;
  end if;

  select s.id into v_subarea_id
  from public.subareas s
  where s.municipality_id = v_municipality
  order by s.id
  limit 1;
  if v_subarea_id is null then
    raise exception 'Nenhuma subárea cadastrada para vincular o quarteirão.';
  end if;

  insert into public.blocks (number, locality, status, total_properties, subarea_id, municipality_id)
  values (v_number, v_locality, 'not_started', 0, v_subarea_id, v_municipality)
  returning id into v_block_id;

  return v_block_id;
end;
$function$;

create or replace function public.set_block_current_street(_block_id uuid, _street text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_municipality uuid := private.current_municipality();
begin
  if auth.uid() is null or v_municipality is null
     or not public.has_active_profile(auth.uid()) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  update public.blocks
  set current_street = _street,
      current_street_confirmed_at = now(),
      current_street_confirmed_by = auth.uid()
  where id = _block_id
    and municipality_id = v_municipality;

  if not found then
    raise exception 'Quarteirão não encontrado neste município.'
      using errcode = '42501';
  end if;
end;
$function$;

create or replace function public.set_block_location(
  _block_id uuid,
  _address text,
  _neighborhood text,
  _city text,
  _latitude double precision,
  _longitude double precision,
  _location_source text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_municipality uuid := private.current_municipality();
begin
  if auth.uid() is null or v_municipality is null
     or not public.has_active_profile(auth.uid()) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if _location_source is not null and _location_source not in ('gps', 'manual') then
    raise exception 'Origem de localização inválida.';
  end if;

  update public.blocks
  set address = _address,
      neighborhood = _neighborhood,
      city = _city,
      latitude = _latitude,
      longitude = _longitude,
      location_source = _location_source
  where id = _block_id
    and municipality_id = v_municipality;

  if not found then
    raise exception 'Quarteirão não encontrado neste município.'
      using errcode = '42501';
  end if;
end;
$function$;

create or replace function public.set_block_status(_block_id uuid, _status text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_municipality uuid := private.current_municipality();
begin
  if auth.uid() is null or v_municipality is null
     or not public.has_active_profile(auth.uid()) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if _status not in ('not_started', 'in_progress', 'completed') then
    raise exception 'Status inválido: %', _status;
  end if;

  update public.blocks
  set status = _status::public.block_status
  where id = _block_id
    and municipality_id = v_municipality;

  if not found then
    raise exception 'Quarteirão não encontrado neste município.'
      using errcode = '42501';
  end if;
end;
$function$;

create or replace function public.finalize_shift_pendencies(
  p_agent_id uuid,
  p_cycle_id uuid,
  p_date date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_created integer := 0;
  v_recovered integer := 0;
  v_closed integer := 0;
  v_refused integer := 0;
  v_municipality uuid := private.current_municipality();
  r record;
  v_last_status text;
  v_last_visit_id uuid;
  v_last_notes text;
  v_week_id uuid;
  v_mapped public.recovery_result;
begin
  if auth.uid() is null or v_municipality is null
     or not public.has_active_profile(auth.uid())
     or not public.can_supervise_user(p_agent_id)
     or not exists (
       select 1 from public.cycles c
       where c.id = p_cycle_id and c.municipality_id = v_municipality
     ) then
    raise exception 'Acesso negado para finalizar pendências deste usuário/ciclo.'
      using errcode = '42501';
  end if;

  for r in
    select distinct property_id
    from public.visits
    where agent_id = p_agent_id
      and cycle_id = p_cycle_id
      and municipality_id = v_municipality
      and public.operational_date(visit_date) = p_date
      and property_id is not null
  loop
    select v.status::text, v.id, v.notes, v.week_id
      into v_last_status, v_last_visit_id, v_last_notes, v_week_id
    from public.visits v
    where v.property_id = r.property_id
      and v.agent_id = p_agent_id
      and v.cycle_id = p_cycle_id
      and v.municipality_id = v_municipality
      and public.operational_date(v.visit_date) = p_date
    order by v.visit_date desc
    limit 1;

    if v_last_status = 'visited' then
      if exists (
        select 1 from public.visits v2
        where v2.property_id = r.property_id
          and v2.agent_id = p_agent_id
          and v2.cycle_id = p_cycle_id
          and v2.municipality_id = v_municipality
          and public.operational_date(v2.visit_date) = p_date
          and v2.status::text in ('closed', 'refused', 'abandoned')
      ) then
        v_recovered := v_recovered + 1;
      end if;
      continue;
    end if;

    v_mapped := case v_last_status
      when 'closed' then 'closed'::public.recovery_result
      when 'refused' then 'refused'::public.recovery_result
      when 'abandoned' then 'absent'::public.recovery_result
      else null
    end;
    if v_mapped is null then continue; end if;

    if exists (
      select 1 from public.property_pendencies p
      where p.property_id = r.property_id
        and p.cycle_id = p_cycle_id
        and p.municipality_id = v_municipality
    ) then
      continue;
    end if;

    insert into public.property_recovery_attempts
      (property_id, visit_id, agent_id, cycle_id, week_id, result, notes, attempted_at, municipality_id)
    values
      (r.property_id, v_last_visit_id, p_agent_id, p_cycle_id, v_week_id,
       v_mapped, v_last_notes, now(), v_municipality);

    v_created := v_created + 1;
    if v_last_status = 'closed' then v_closed := v_closed + 1;
    elsif v_last_status = 'refused' then v_refused := v_refused + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'pendencies_created', v_created,
    'recovered_in_day', v_recovered,
    'closed_pendencies', v_closed,
    'refused_pendencies', v_refused,
    'cycle_id', p_cycle_id,
    'operational_date', p_date
  );
end;
$function$;

create or replace function public.recover_session_visits(_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  s record;
  v_updated int := 0;
  v_dwr_exists boolean;
  v_dwr_generated boolean := false;
  v_agg record;
  v_municipality uuid := private.current_municipality();
begin
  if auth.uid() is null or v_municipality is null
     or not public.has_active_profile(auth.uid()) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  select id, user_id, session_date, cycle_id, week_id, block_number, municipality_id
    into s
  from public.field_work_sessions
  where id = _session_id
    and municipality_id = v_municipality;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if not public.can_supervise_user(s.user_id) then
    raise exception 'A sessão pertence a outro usuário/escopo.'
      using errcode = '42501';
  end if;
  if s.cycle_id is not null and not exists (
    select 1 from public.cycles c
    where c.id = s.cycle_id and c.municipality_id = v_municipality
  ) then
    raise exception 'Ciclo da sessão não pertence ao município ativo.'
      using errcode = '42501';
  end if;

  with candidates as (
    select v.id
    from public.visits v
    join public.properties p on p.id = v.property_id
    where v.agent_id = s.user_id
      and v.municipality_id = v_municipality
      and p.municipality_id = v_municipality
      and public.operational_date(v.visit_date) = s.session_date
      and p.block_number = s.block_number
      and (
        v.field_work_session_id is distinct from _session_id
        or v.cycle_id is distinct from s.cycle_id
        or v.week_id is distinct from s.week_id
      )
  )
  select count(*) into v_updated from candidates;

  if v_updated > 0 then
    update public.visits v
    set field_work_session_id = _session_id,
        cycle_id = s.cycle_id,
        week_id = coalesce(s.week_id, v.week_id),
        updated_at = now()
    from public.properties p
    where v.property_id = p.id
      and v.agent_id = s.user_id
      and v.municipality_id = v_municipality
      and p.municipality_id = v_municipality
      and public.operational_date(v.visit_date) = s.session_date
      and p.block_number = s.block_number
      and (
        v.field_work_session_id is distinct from _session_id
        or v.cycle_id is distinct from s.cycle_id
        or v.week_id is distinct from s.week_id
      );
  end if;

  select exists (
    select 1 from public.daily_work_records
    where agent_id = s.user_id
      and work_date = s.session_date
      and municipality_id = v_municipality
  ) into v_dwr_exists;

  if not v_dwr_exists then
    select
      count(distinct v.property_id) filter (where v.status::text = 'visited') as worked,
      count(distinct v.property_id) filter (where v.status::text = 'closed') as closed,
      count(distinct v.property_id) filter (where v.status::text = 'refused') as refused,
      count(distinct v.property_id) filter (where v.has_focus = true) as positive,
      coalesce(sum(v.tubitos_coletados), 0) as tubitos,
      coalesce(sum(v.treatment_amount), 0) as larvicide
    into v_agg
    from public.visits v
    where v.agent_id = s.user_id
      and v.municipality_id = v_municipality
      and public.operational_date(v.visit_date) = s.session_date
      and v.field_work_session_id = _session_id;

    insert into public.daily_work_records (
      agent_id, legacy_agent_id, cycle_id, week_id, work_date,
      status, is_retroactive,
      properties_worked, properties_closed, properties_refused, properties_positive,
      tubitos_collected, larvicide_amount,
      epi_week, epi_year, municipality_id
    ) values (
      s.user_id, s.user_id, s.cycle_id, s.week_id, s.session_date,
      'completed', (s.session_date < public.operational_date(now())),
      coalesce(v_agg.worked, 0), coalesce(v_agg.closed, 0),
      coalesce(v_agg.refused, 0), coalesce(v_agg.positive, 0),
      coalesce(v_agg.tubitos, 0), coalesce(v_agg.larvicide, 0),
      extract(week from s.session_date)::int,
      extract(isoyear from s.session_date)::int,
      v_municipality
    )
    on conflict (legacy_agent_id, work_date) do nothing;

    v_dwr_generated := true;
    perform public.finalize_shift_pendencies(s.user_id, s.cycle_id, s.session_date);
  end if;

  if v_updated = 0 and not v_dwr_generated then
    return jsonb_build_object('status', 'not_needed');
  end if;

  insert into public.audit_log(action, entity, actor_id, target_id, metadata)
  values ('session_auto_recover', 'field_work_sessions', auth.uid(), s.id,
    jsonb_build_object(
      'updated', v_updated,
      'dwr_generated', v_dwr_generated,
      'session_date', s.session_date,
      'timezone', 'America/Sao_Paulo',
      'municipality_id', v_municipality
    ));

  return jsonb_build_object(
    'status', 'recovered',
    'updated', v_updated,
    'dwr_generated', v_dwr_generated
  );
end;
$function$;

create or replace function public.close_week(_week_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  w record;
  next_week_id uuid;
  next_cycle_id uuid;
  v_municipality uuid := private.current_municipality();
begin
  if auth.uid() is null or v_municipality is null
     or not public.has_active_profile(auth.uid())
     or not public.has_role(auth.uid(), 'admin_master'::public.app_role) then
    raise exception 'Apenas o Admin Master ativo do município pode encerrar semanas.'
      using errcode = '42501';
  end if;

  select ww.*
  into w
  from public.weeks ww
  join public.cycles c on c.id = ww.cycle_id
  where ww.id = _week_id
    and ww.municipality_id = v_municipality
    and c.municipality_id = v_municipality;
  if not found then
    raise exception 'Semana não encontrada neste município.'
      using errcode = '42501';
  end if;

  update public.weeks
  set status = 'closed', updated_at = now()
  where id = _week_id and municipality_id = v_municipality;

  if w.number < 8 then
    update public.weeks
    set status = 'open'
    where cycle_id = w.cycle_id
      and municipality_id = v_municipality
      and number = w.number + 1
    returning id into next_week_id;

    return jsonb_build_object('closed_week', w.number, 'next_week_id', next_week_id);
  end if;

  update public.cycles
  set status = 'finished'
  where id = w.cycle_id and municipality_id = v_municipality;

  select id into next_cycle_id
  from public.cycles
  where municipality_id = v_municipality
    and year >= (
      select year from public.cycles
      where id = w.cycle_id and municipality_id = v_municipality
    )
    and status = 'not_started'
  order by year, number
  limit 1;

  if next_cycle_id is not null then
    update public.cycles
    set status = 'in_progress'
    where id = next_cycle_id and municipality_id = v_municipality;
  end if;

  return jsonb_build_object('closed_week', 8, 'cycle_finished', w.cycle_id, 'next_cycle_id', next_cycle_id);
end;
$function$;

-- These maintenance routines have no client callsite; leave them available to
-- trusted backend execution only until they receive municipal scoping.
revoke all on function public.auto_data_audit_snapshot() from public, anon, authenticated;
grant execute on function public.auto_data_audit_snapshot() to service_role;
revoke all on function public.reconcile_rg_integrity() from public, anon, authenticated;
grant execute on function public.reconcile_rg_integrity() to service_role;
revoke all on function public.save_data_audit_snapshot(integer, jsonb, integer, integer) from public, anon, authenticated;
grant execute on function public.save_data_audit_snapshot(integer, jsonb, integer, integer) to service_role;

-- Do not allow a logged-in user to invoke the database function with an
-- arbitrary user ID to create an agent record.
create or replace function public.autoheal_agent(_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_agent_id uuid;
  v_profile record;
  v_municipality uuid := private.current_municipality();
begin
  if auth.uid() is null or auth.uid() <> _user_id or v_municipality is null
     or not public.has_active_profile(auth.uid()) then
    raise exception 'Só o próprio usuário ativo pode reparar seu cadastro de agente.'
      using errcode = '42501';
  end if;

  select a.id into v_agent_id
  from public.agents a
  where a.profile_id = _user_id
    and a.municipality_id = v_municipality;
  if v_agent_id is not null then
    return v_agent_id;
  end if;

  select p.id, p.full_name, p.email, p.municipality_id
  into v_profile
  from public.profiles p
  where p.id = _user_id
    and p.municipality_id = v_municipality
    and coalesce(p.is_active, true);
  if not found then
    raise exception 'Perfil municipal ativo não encontrado.'
      using errcode = '42501';
  end if;

  insert into public.agents (profile_id, name, status, municipality_id)
  values (
    v_profile.id,
    coalesce(nullif(v_profile.full_name, ''), v_profile.email, 'Agente'),
    'active',
    v_profile.municipality_id
  )
  on conflict (profile_id) do nothing
  returning id into v_agent_id;

  if v_agent_id is null then
    select a.id into v_agent_id from public.agents a
    where a.profile_id = _user_id and a.municipality_id = v_municipality;
  end if;

  insert into public.audit_log(action, entity, actor_id, target_id, metadata)
  values ('autoheal_agent', 'agent', auth.uid(), v_agent_id,
    jsonb_build_object('created_at', now(), 'municipality_id', v_municipality));

  return v_agent_id;
end;
$function$;

revoke all on function public.get_user_role(uuid) from public, anon;
grant execute on function public.get_user_role(uuid) to authenticated, service_role;
revoke all on function public.has_role(uuid, public.app_role) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;
revoke all on function public.is_territory_manager(uuid) from public, anon;
grant execute on function public.is_territory_manager(uuid) to authenticated, service_role;
revoke all on function public.data_audit_report() from public, anon;
grant execute on function public.data_audit_report() to authenticated, service_role;

commit;
