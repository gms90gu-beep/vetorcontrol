CREATE OR REPLACE FUNCTION public.data_audit_report()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb := '{}'::jsonb;
  today date := public.operational_date(now());
BEGIN
  -- RG (quarteirões)
  v := v || jsonb_build_object('rg', jsonb_build_object(
    'total_blocks', (SELECT count(*) FROM blocks),
    'blocks_with_properties', (SELECT count(DISTINCT block_id) FROM properties WHERE block_id IS NOT NULL),
    'blocks_without_properties', (SELECT count(*) FROM blocks b WHERE NOT EXISTS (SELECT 1 FROM properties p WHERE p.block_id = b.id)),
    'duplicated_blocks', (SELECT count(*) FROM (SELECT number FROM blocks GROUP BY number HAVING count(*) > 1) x),
    'blocks_without_owner', (SELECT count(DISTINCT b.id) FROM blocks b LEFT JOIN boletins_rg br ON br.block_number = b.number WHERE br.agent_id IS NULL),
    'sample', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'block', b.number,
        'agent', (SELECT p.full_name FROM boletins_rg br LEFT JOIN profiles p ON p.id = br.agent_id WHERE br.block_number = b.number LIMIT 1),
        'properties', (SELECT count(*) FROM properties pp WHERE pp.block_id = b.id),
        'status', b.status
      )), '[]'::jsonb) FROM (SELECT * FROM blocks ORDER BY created_at DESC LIMIT 25) b)
  ));

  -- Imóveis
  v := v || jsonb_build_object('properties', jsonb_build_object(
    'total', (SELECT count(*) FROM properties),
    'without_block', (SELECT count(*) FROM properties WHERE block_id IS NULL AND block_number IS NULL),
    'without_boletim', (SELECT count(*) FROM properties WHERE boletim_id IS NULL),
    'without_street', (SELECT count(*) FROM properties WHERE (street_name IS NULL OR street_name = '') AND street_id IS NULL),
    'without_number', (SELECT count(*) FROM properties WHERE number IS NULL OR number = ''),
    'without_user', (SELECT count(*) FROM properties WHERE user_id IS NULL),
    'duplicates', (SELECT count(*) FROM (
      SELECT block_number, number, street_name FROM properties
       WHERE block_number IS NOT NULL AND number IS NOT NULL
       GROUP BY block_number, number, street_name HAVING count(*) > 1) d)
  ));

  -- GPS
  v := v || jsonb_build_object('gps', jsonb_build_object(
    'total', (SELECT count(*) FROM properties),
    'geocoded', (SELECT count(*) FROM properties WHERE latitude IS NOT NULL AND longitude IS NOT NULL),
    'missing', (SELECT count(*) FROM properties WHERE latitude IS NULL OR longitude IS NULL),
    'invalid', (SELECT count(*) FROM properties
                 WHERE (latitude IS NOT NULL AND (latitude < -90 OR latitude > 90))
                    OR (longitude IS NOT NULL AND (longitude < -180 OR longitude > 180))),
    'duplicated_coords', (SELECT count(*) FROM (
      SELECT latitude, longitude FROM properties
       WHERE latitude IS NOT NULL AND longitude IS NOT NULL
       GROUP BY latitude, longitude HAVING count(*) > 1) d)
  ));

  -- Visitas
  v := v || jsonb_build_object('visits', jsonb_build_object(
    'total', (SELECT count(*) FROM visits),
    'without_property', (SELECT count(*) FROM visits WHERE property_id IS NULL),
    'without_agent', (SELECT count(*) FROM visits WHERE agent_id IS NULL),
    'without_date', (SELECT count(*) FROM visits WHERE visit_date IS NULL),
    'orphan', (SELECT count(*) FROM visits v LEFT JOIN properties p ON p.id = v.property_id WHERE p.id IS NULL),
    'without_cycle', (SELECT count(*) FROM visits WHERE cycle_id IS NULL)
  ));

  -- Focos
  v := v || jsonb_build_object('foci', jsonb_build_object(
    'positive_visits', (SELECT count(*) FROM visits WHERE has_focus = true),
    'deposits_total', (SELECT count(*) FROM visit_deposits),
    'positive_without_deposit', (SELECT count(*) FROM visits v WHERE v.has_focus = true AND NOT EXISTS (SELECT 1 FROM visit_deposits d WHERE d.visit_id = v.id)),
    'positive_deposit_without_visit', (SELECT count(*) FROM visit_deposits d LEFT JOIN visits v ON v.id = d.visit_id WHERE d.is_positive = true AND v.id IS NULL),
    'deposit_without_type', (SELECT count(*) FROM visit_deposits WHERE type_code IS NULL OR type_code = ''),
    'positive_visit_without_property', (SELECT count(*) FROM visits WHERE has_focus = true AND property_id IS NULL)
  ));

  -- Usuários
  v := v || jsonb_build_object('users', jsonb_build_object(
    'total', (SELECT count(*) FROM profiles),
    'inactive', (SELECT count(*) FROM profiles WHERE is_active = false),
    'agents_without_supervisor', (SELECT count(*) FROM profiles WHERE role = 'agente' AND supervisor_id IS NULL),
    'supervisors_without_team', (SELECT count(*) FROM profiles s WHERE s.role = 'supervisor' AND NOT EXISTS (SELECT 1 FROM profiles a WHERE a.supervisor_id = s.id)),
    'duplicated_emails', (SELECT count(*) FROM (SELECT email FROM profiles WHERE email IS NOT NULL GROUP BY email HAVING count(*) > 1) d),
    'sample', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'name', full_name, 'role', role, 'supervisor', supervisor_id, 'active', is_active
    )), '[]'::jsonb) FROM (SELECT * FROM profiles ORDER BY created_at DESC LIMIT 25) p)
  ));

  -- Ciclos
  v := v || jsonb_build_object('cycles', jsonb_build_object(
    'by_date', (SELECT to_jsonb(c) FROM cycles c WHERE today BETWEEN start_date AND end_date ORDER BY year DESC, number LIMIT 1),
    'by_status', (SELECT to_jsonb(c) FROM cycles c WHERE status = 'in_progress' ORDER BY year DESC LIMIT 1),
    'multiple_in_progress', (SELECT count(*) > 1 FROM cycles WHERE status = 'in_progress'),
    'expired_in_progress', (SELECT count(*) FROM cycles WHERE status = 'in_progress' AND end_date < today)
  ));

  RETURN v;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fill_cycle_week_from_date()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE ref_date date; r record;
BEGIN
  IF TG_TABLE_NAME = 'visits' THEN
    ref_date := COALESCE(public.operational_date(NEW.visit_date), public.operational_date(now()));
  ELSIF TG_TABLE_NAME = 'daily_work_records' THEN
    ref_date := COALESCE(NEW.work_date, public.operational_date(now()));
  ELSIF TG_TABLE_NAME = 'field_work_sessions' THEN
    ref_date := COALESCE(NEW.session_date, public.operational_date(now()));
  ELSE ref_date := public.operational_date(now());
  END IF;
  IF NEW.cycle_id IS NULL OR NEW.week_id IS NULL THEN
    SELECT * INTO r FROM public.resolve_cycle_week(ref_date);
    IF FOUND THEN
      IF NEW.cycle_id IS NULL THEN NEW.cycle_id := r.cycle_id; END IF;
      IF NEW.week_id IS NULL THEN NEW.week_id := r.week_id; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.get_current_cycle()
 RETURNS cycles
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT * FROM public.cycles
   WHERE public.operational_date(now()) BETWEEN start_date AND end_date
   ORDER BY year DESC, number LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public.recover_session_visits(_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  s RECORD;
  v_updated int := 0;
  v_dwr_exists boolean;
  v_dwr_generated boolean := false;
  v_agg RECORD;
BEGIN
  SELECT id, user_id, session_date, cycle_id, week_id, block_number
    INTO s
    FROM public.field_work_sessions
   WHERE id = _session_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','not_found');
  END IF;

  WITH candidates AS (
    SELECT v.id
      FROM public.visits v
      JOIN public.properties p ON p.id = v.property_id
     WHERE v.agent_id = s.user_id
       AND public.operational_date(v.visit_date) = s.session_date
       AND p.block_number = s.block_number
       AND (
         v.field_work_session_id IS DISTINCT FROM _session_id
         OR v.cycle_id IS DISTINCT FROM s.cycle_id
         OR v.week_id IS DISTINCT FROM s.week_id
       )
  )
  SELECT count(*) INTO v_updated FROM candidates;

  IF v_updated > 0 THEN
    UPDATE public.visits v
       SET field_work_session_id = _session_id,
           cycle_id = s.cycle_id,
           week_id  = COALESCE(s.week_id, v.week_id),
           updated_at = now()
      FROM public.properties p
     WHERE v.property_id = p.id
       AND v.agent_id = s.user_id
       AND public.operational_date(v.visit_date) = s.session_date
       AND p.block_number = s.block_number
       AND (
         v.field_work_session_id IS DISTINCT FROM _session_id
         OR v.cycle_id IS DISTINCT FROM s.cycle_id
         OR v.week_id IS DISTINCT FROM s.week_id
       );
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.daily_work_records
     WHERE agent_id = s.user_id AND work_date = s.session_date
  ) INTO v_dwr_exists;

  IF NOT v_dwr_exists THEN
    SELECT
      count(DISTINCT v.property_id) FILTER (WHERE v.status::text = 'visited')  AS worked,
      count(DISTINCT v.property_id) FILTER (WHERE v.status::text = 'closed')   AS closed,
      count(DISTINCT v.property_id) FILTER (WHERE v.status::text = 'refused')  AS refused,
      count(DISTINCT v.property_id) FILTER (WHERE v.has_focus = true)          AS positive,
      COALESCE(sum(v.tubitos_coletados), 0)                                    AS tubitos,
      COALESCE(sum(v.treatment_amount), 0)                                     AS larvicide
    INTO v_agg
    FROM public.visits v
    WHERE v.agent_id = s.user_id
      AND public.operational_date(v.visit_date) = s.session_date
      AND v.field_work_session_id = _session_id;

    INSERT INTO public.daily_work_records (
      agent_id, legacy_agent_id, cycle_id, week_id, work_date,
      status, is_retroactive,
      properties_worked, properties_closed, properties_refused, properties_positive,
      tubitos_collected, larvicide_amount,
      epi_week, epi_year
    ) VALUES (
      s.user_id, s.user_id, s.cycle_id, s.week_id, s.session_date,
      'completed', (s.session_date < public.operational_date(now())),
      COALESCE(v_agg.worked, 0), COALESCE(v_agg.closed, 0),
      COALESCE(v_agg.refused, 0), COALESCE(v_agg.positive, 0),
      COALESCE(v_agg.tubitos, 0), COALESCE(v_agg.larvicide, 0),
      EXTRACT(week FROM s.session_date)::int,
      EXTRACT(isoyear FROM s.session_date)::int
    )
    ON CONFLICT (legacy_agent_id, work_date) DO NOTHING;

    v_dwr_generated := true;

    PERFORM public.finalize_shift_pendencies(s.user_id, s.cycle_id, s.session_date);
  END IF;

  IF v_updated = 0 AND NOT v_dwr_generated THEN
    RETURN jsonb_build_object('status','not_needed');
  END IF;

  INSERT INTO public.audit_log(action, entity, actor_id, target_id, metadata)
  VALUES ('session_auto_recover','field_work_sessions', s.user_id, s.id,
    jsonb_build_object(
      'updated', v_updated,
      'dwr_generated', v_dwr_generated,
      'session_date', s.session_date,
      'timezone', 'America/Sao_Paulo'
    ));

  RETURN jsonb_build_object(
    'status','recovered',
    'updated', v_updated,
    'dwr_generated', v_dwr_generated
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_cycle_statuses()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today date := public.operational_date(now());
  v_finished int := 0;
  v_activated int := 0;
  r record;
BEGIN
  UPDATE public.cycles SET status = 'finished'
   WHERE end_date < v_today AND status <> 'finished';
  GET DIAGNOSTICS v_finished = ROW_COUNT;

  FOR r IN
    SELECT DISTINCT ON (year) id, year FROM public.cycles
     WHERE v_today BETWEEN start_date AND end_date
     ORDER BY year, number
  LOOP
    UPDATE public.cycles SET status = 'not_started'
     WHERE year = r.year AND id <> r.id AND status = 'in_progress';
    UPDATE public.cycles SET status = 'in_progress'
     WHERE id = r.id AND status <> 'in_progress';
    IF FOUND THEN v_activated := v_activated + 1; END IF;
  END LOOP;

  INSERT INTO public.audit_log(action, entity, actor_id, metadata)
  VALUES ('sync_cycle_statuses', 'system', auth.uid(),
          jsonb_build_object('finished', v_finished, 'activated', v_activated, 'date', v_today));

  RETURN jsonb_build_object('finished', v_finished, 'activated', v_activated, 'date', v_today);
END;
$function$;

ALTER TABLE public.field_work_sessions ALTER COLUMN session_date SET DEFAULT public.operational_date(now());
ALTER TABLE public.daily_work_records ALTER COLUMN work_date SET DEFAULT public.operational_date(now());
ALTER TABLE public.visits ALTER COLUMN year SET DEFAULT EXTRACT(year FROM public.operational_date(now()));