begin;

create or replace function public.has_active_profile(_user_id uuid)
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
    and exists (
      select 1 from public.profiles p
      where p.id = _user_id and coalesce(p.is_active, true)
    );
$function$;

create or replace function public.agent_integrity_check(_fix boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_municipality uuid := private.current_municipality();
  v_total_profiles int;
  v_total_agents int;
  v_missing int;
  v_created int := 0;
begin
  if auth.uid() is null or v_municipality is null
     or not public.has_active_profile(auth.uid())
     or not public.has_role(auth.uid(), 'admin_master'::public.app_role) then
    raise exception 'Acesso restrito ao Admin Master ativo deste município.'
      using errcode = '42501';
  end if;

  select count(*) into v_total_profiles
  from public.profiles p where p.municipality_id = v_municipality;
  select count(*) into v_total_agents
  from public.agents a where a.municipality_id = v_municipality;
  select count(*) into v_missing
  from public.profiles p
  left join public.agents a
    on a.profile_id = p.id and a.municipality_id = v_municipality
  where p.municipality_id = v_municipality and a.profile_id is null;

  if _fix and v_missing > 0 then
    with ins as (
      insert into public.agents (profile_id, name, status, municipality_id)
      select p.id, coalesce(nullif(p.full_name, ''), p.email, 'Agente'),
             'active', v_municipality
      from public.profiles p
      left join public.agents a
        on a.profile_id = p.id and a.municipality_id = v_municipality
      where p.municipality_id = v_municipality and a.profile_id is null
      on conflict (profile_id) do nothing
      returning 1
    )
    select count(*) into v_created from ins;

    insert into public.audit_log(action, entity, actor_id, metadata)
    values ('agent_health_check', 'system', auth.uid(),
      jsonb_build_object(
        'profiles_verificados', v_total_profiles,
        'agents_criados', v_created,
        'executed_at', now(),
        'municipality_id', v_municipality
      ));
  end if;

  return jsonb_build_object(
    'total_profiles', v_total_profiles,
    'total_agents', v_total_agents,
    'profiles_sem_agent', v_missing - v_created,
    'agents_criados', v_created
  );
end;
$function$;

create or replace function public.rg_integrity_check()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_municipality uuid := private.current_municipality();
  v_bol_no_block jsonb;
  v_prop_no_bol jsonb;
  v_prop_block_mismatch jsonb;
  v_dup_blocks jsonb;
  v_count_divergence jsonb;
  v_ok boolean;
begin
  if auth.uid() is null or v_municipality is null
     or not public.has_role(auth.uid(), 'admin_master'::public.app_role) then
    raise exception 'Acesso restrito ao Admin Master do município.'
      using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'block_number', block_number, 'locality', locality)), '[]'::jsonb)
    into v_bol_no_block
    from public.boletins_rg
   where block_id is null and municipality_id = v_municipality;

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'block_id', block_id, 'block_number', block_number)), '[]'::jsonb)
    into v_prop_no_bol
    from public.properties
   where boletim_id is null and municipality_id = v_municipality;

  select coalesce(jsonb_agg(jsonb_build_object('property_id', p.id, 'boletim_id', p.boletim_id, 'prop_block_id', p.block_id, 'boletim_block_id', b.block_id)), '[]'::jsonb)
    into v_prop_block_mismatch
    from public.properties p
    join public.boletins_rg b on b.id = p.boletim_id
   where p.block_id is distinct from b.block_id
     and p.municipality_id = v_municipality
     and b.municipality_id = v_municipality;

  select coalesce(jsonb_agg(jsonb_build_object('number', number, 'locality', locality, 'count', cnt)), '[]'::jsonb)
    into v_dup_blocks
    from (
      select number, coalesce(locality, 'sem-localidade') as locality, count(*) as cnt
      from public.blocks
      where municipality_id = v_municipality
      group by number, coalesce(locality, 'sem-localidade')
      having count(*) > 1
    ) d;

  select coalesce(jsonb_agg(jsonb_build_object(
           'boletim_id', b.id, 'block_number', b.block_number,
           'card_count', (select count(*) from public.properties pp where pp.boletim_id = b.id and pp.municipality_id = v_municipality),
           'detail_count', (select count(*) from public.properties pd where pd.boletim_id = b.id and pd.municipality_id = v_municipality)
         )), '[]'::jsonb)
    into v_count_divergence
    from public.boletins_rg b
   where b.municipality_id = v_municipality
     and (select count(*) from public.properties pp where pp.boletim_id = b.id and pp.municipality_id = v_municipality)
      <> (select count(*) from public.properties pd where pd.boletim_id = b.id and pd.municipality_id = v_municipality);

  v_ok := jsonb_array_length(v_bol_no_block) = 0
      and jsonb_array_length(v_prop_block_mismatch) = 0
      and jsonb_array_length(v_dup_blocks) = 0
      and jsonb_array_length(v_count_divergence) = 0;

  return jsonb_build_object(
    'status', case when v_ok then 'OK' else 'FAIL' end,
    'boletins_sem_block', v_bol_no_block,
    'properties_sem_boletim', v_prop_no_bol,
    'properties_block_divergente', v_prop_block_mismatch,
    'blocks_duplicados', v_dup_blocks,
    'divergencia_card_detalhe', v_count_divergence
  );
end;
$function$;

create or replace function public.recompute_block_progress(
  _cycle_id uuid,
  _block_number text,
  _agent_id uuid
)
returns public.block_progress
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_municipality uuid := private.current_municipality();
  v_total int := 0;
  v_visited int := 0;
  v_closed int := 0;
  v_refused int := 0;
  v_recovered int := 0;
  v_positive int := 0;
  v_pending int := 0;
  v_last_visit timestamptz;
  v_last_op_date date;
  v_started timestamptz;
  v_status text;
  v_pct numeric(5,2);
  v_row public.block_progress;
  v_block_ids uuid[];
begin
  if auth.uid() is null or v_municipality is null
     or not public.has_active_profile(auth.uid())
     or not public.can_supervise_user(_agent_id)
     or not exists (
       select 1 from public.cycles c
       where c.id = _cycle_id and c.municipality_id = v_municipality
     ) then
    raise exception 'Acesso negado para recalcular o progresso deste usuário/ciclo.'
      using errcode = '42501';
  end if;
  if _cycle_id is null or _block_number is null or _agent_id is null then
    return null;
  end if;

  select array_agg(b.id) into v_block_ids
  from public.blocks b
  where b.number::text = _block_number
    and b.municipality_id = v_municipality;

  select count(*) into v_total
  from public.properties p
  where p.municipality_id = v_municipality
    and (
      p.block_number = _block_number
      or (v_block_ids is not null and p.block_id = any(v_block_ids))
    );

  select
    count(distinct v.property_id) filter (where v.status::text = 'visited'),
    count(distinct v.property_id) filter (where v.status::text = 'closed'),
    count(distinct v.property_id) filter (where v.status::text = 'refused'),
    count(distinct v.property_id) filter (where v.is_recovered = true),
    count(distinct v.property_id) filter (where v.has_focus = true),
    max(v.visit_date),
    max(public.operational_date(v.visit_date)),
    min(v.visit_date)
  into v_visited, v_closed, v_refused, v_recovered, v_positive,
       v_last_visit, v_last_op_date, v_started
  from public.visits v
  join public.properties p on p.id = v.property_id
  where p.municipality_id = v_municipality
    and v.municipality_id = v_municipality
    and (
      p.block_number = _block_number
      or (v_block_ids is not null and p.block_id = any(v_block_ids))
    )
    and v.agent_id = _agent_id
    and v.cycle_id = _cycle_id;

  v_pending := greatest(0, v_total - (coalesce(v_visited,0) + coalesce(v_closed,0) + coalesce(v_refused,0)));
  v_pct := case when v_total > 0
    then round(((coalesce(v_visited,0)+coalesce(v_closed,0)+coalesce(v_refused,0))::numeric / v_total) * 100, 2)
    else 0 end;

  v_status := case
    when v_total > 0 and v_pending = 0 then 'COMPLETED'
    when v_last_visit is not null then 'IN_PROGRESS'
    else 'NOT_STARTED'
  end;

  insert into public.block_progress (
    cycle_id, block_number, agent_id, status, completion_percentage,
    total_properties, visited_properties, pending_properties, closed_properties,
    recovered_properties, positive_focus, negative_focus, tb_properties, pe_properties,
    started_at, completed_at, last_visit_at, last_operational_date, last_sync,
    municipality_id
  ) values (
    _cycle_id, _block_number, _agent_id, v_status, v_pct,
    v_total, coalesce(v_visited,0), v_pending, coalesce(v_closed,0),
    coalesce(v_recovered,0), coalesce(v_positive,0), 0, 0, 0,
    v_started, case when v_status = 'COMPLETED' then now() else null end,
    v_last_visit, v_last_op_date, now(), v_municipality
  )
  on conflict (cycle_id, block_number, agent_id) do update set
    status = excluded.status,
    completion_percentage = excluded.completion_percentage,
    total_properties = excluded.total_properties,
    visited_properties = excluded.visited_properties,
    pending_properties = excluded.pending_properties,
    closed_properties = excluded.closed_properties,
    recovered_properties = excluded.recovered_properties,
    positive_focus = excluded.positive_focus,
    started_at = coalesce(public.block_progress.started_at, excluded.started_at),
    completed_at = case when excluded.status = 'COMPLETED'
                        then coalesce(public.block_progress.completed_at, now())
                        else null end,
    last_visit_at = excluded.last_visit_at,
    last_operational_date = excluded.last_operational_date,
    last_sync = now(),
    updated_at = now()
  where public.block_progress.municipality_id = v_municipality
  returning * into v_row;

  return v_row;
end;
$function$;

-- Routines without client call sites stay backend-only until tenant scoped.
revoke all on function public.check_block_completion(uuid, uuid) from public, anon, authenticated;
grant execute on function public.check_block_completion(uuid, uuid) to service_role;
revoke all on function public.regenerate_cycle_weeks(uuid) from public, anon, authenticated;
grant execute on function public.regenerate_cycle_weeks(uuid) to service_role;
revoke all on function public.sync_cycle_statuses() from public, anon, authenticated;
grant execute on function public.sync_cycle_statuses() to service_role;

-- Trigger functions are invoked through their triggers; they are not RPCs.
revoke all on function public.enforce_property_geocode_update() from public, anon, authenticated;
revoke all on function public.ensure_agent_for_profile() from public, anon, authenticated;
revoke all on function public.fill_cycle_week_from_date() from public, anon, authenticated;
revoke all on function public.fill_property_block_number() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.on_recovery_attempt_insert() from public, anon, authenticated;
revoke all on function public.on_visit_create_recovery_attempt() from public, anon, authenticated;
revoke all on function public.on_visit_upsert_update_block() from public, anon, authenticated;
revoke all on function public.protect_last_active_master() from public, anon, authenticated;
revoke all on function public.sync_property_block() from public, anon, authenticated;
revoke all on function public.trg_cycle_generate_weeks() from public, anon, authenticated;
revoke all on function public.trg_visits_recompute_block_progress() from public, anon, authenticated;
revoke all on function public.update_block_property_count() from public, anon, authenticated;
revoke all on function public.validate_boletim_agent_block() from public, anon, authenticated;
revoke all on function public.validate_field_work_session_block() from public, anon, authenticated;
revoke all on function public.validate_property_block_ownership() from public, anon, authenticated;
revoke all on function public.validate_property_boletim_block_match() from public, anon, authenticated;
revoke all on function public.visits_auto_link_session() from public, anon, authenticated;

commit;
