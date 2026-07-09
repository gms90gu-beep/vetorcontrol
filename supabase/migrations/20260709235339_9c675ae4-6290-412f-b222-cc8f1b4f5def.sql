
-- 1) Função central: data operacional (America/Sao_Paulo)
CREATE OR REPLACE FUNCTION public.operational_date(ts timestamptz)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT (ts AT TIME ZONE 'America/Sao_Paulo')::date;
$$;

GRANT EXECUTE ON FUNCTION public.operational_date(timestamptz) TO authenticated, anon, service_role;

-- 2) Trigger fill_cycle_week_from_date usa operational_date para visits
CREATE OR REPLACE FUNCTION public.fill_cycle_week_from_date()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE ref_date date; r record;
BEGIN
  IF TG_TABLE_NAME = 'visits' THEN
    ref_date := COALESCE(public.operational_date(NEW.visit_date), CURRENT_DATE);
  ELSIF TG_TABLE_NAME = 'daily_work_records' THEN
    ref_date := COALESCE(NEW.work_date, CURRENT_DATE);
  ELSIF TG_TABLE_NAME = 'field_work_sessions' THEN
    ref_date := COALESCE(NEW.session_date, CURRENT_DATE);
  ELSE ref_date := CURRENT_DATE;
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

-- 3) finalize_shift_pendencies agrupa por operational_date
CREATE OR REPLACE FUNCTION public.finalize_shift_pendencies(p_agent_id uuid, p_cycle_id uuid, p_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_created integer := 0;
  v_recovered integer := 0;
  v_closed integer := 0;
  v_refused integer := 0;
  r record;
  v_last_status text;
  v_last_visit_id uuid;
  v_last_notes text;
  v_mapped recovery_result;
BEGIN
  FOR r IN
    SELECT DISTINCT property_id
    FROM public.visits
    WHERE agent_id = p_agent_id
      AND cycle_id = p_cycle_id
      AND public.operational_date(visit_date) = p_date
      AND property_id IS NOT NULL
  LOOP
    SELECT v.status::text, v.id, v.notes
      INTO v_last_status, v_last_visit_id, v_last_notes
    FROM public.visits v
    WHERE v.property_id = r.property_id
      AND v.agent_id = p_agent_id
      AND v.cycle_id = p_cycle_id
      AND public.operational_date(v.visit_date) = p_date
    ORDER BY v.visit_date DESC
    LIMIT 1;

    IF v_last_status = 'visited' THEN
      IF EXISTS (
        SELECT 1 FROM public.visits v2
        WHERE v2.property_id = r.property_id
          AND v2.agent_id = p_agent_id
          AND v2.cycle_id = p_cycle_id
          AND public.operational_date(v2.visit_date) = p_date
          AND v2.status::text IN ('closed','refused')
      ) THEN
        v_recovered := v_recovered + 1;
      END IF;
      CONTINUE;
    END IF;

    v_mapped := CASE v_last_status
      WHEN 'closed' THEN 'closed'::recovery_result
      WHEN 'refused' THEN 'refused'::recovery_result
      WHEN 'abandoned' THEN 'absent'::recovery_result
      ELSE NULL
    END;

    IF v_mapped IS NULL THEN CONTINUE; END IF;

    IF EXISTS (SELECT 1 FROM public.property_pendencies WHERE property_id = r.property_id) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.property_recovery_attempts
      (property_id, visit_id, agent_id, result, notes, attempted_at)
    VALUES
      (r.property_id, v_last_visit_id, p_agent_id, v_mapped, v_last_notes, now());

    v_created := v_created + 1;
    IF v_last_status = 'closed' THEN v_closed := v_closed + 1;
    ELSIF v_last_status = 'refused' THEN v_refused := v_refused + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'pendencies_created', v_created,
    'recovered_in_day', v_recovered,
    'closed_pendencies', v_closed,
    'refused_pendencies', v_refused
  );
END $function$;

-- 4) recover_session_visits agrupa por operational_date
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
      'completed', (s.session_date < CURRENT_DATE),
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
