begin;

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
    )), '[]'::jsonb) from (select * from public.blocks order by number, id limit 25) b)
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


commit;
