
CREATE OR REPLACE FUNCTION public.recover_session_visits(_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    RAISE LOG '[SESSION_AUTO_RECOVER_START] session=% NOT_FOUND', _session_id;
    RETURN jsonb_build_object('status','not_found');
  END IF;

  RAISE LOG '[SESSION_AUTO_RECOVER_START] session=% agent=% date=% block=% cycle=%',
    s.id, s.user_id, s.session_date, s.block_number, s.cycle_id;

  -- 1. Detecta visitas divergentes
  WITH candidates AS (
    SELECT v.id
      FROM public.visits v
      JOIN public.properties p ON p.id = v.property_id
     WHERE v.agent_id = s.user_id
       AND v.visit_date::date = s.session_date
       AND p.block_number = s.block_number
       AND (
         v.field_work_session_id IS DISTINCT FROM _session_id
         OR v.cycle_id IS DISTINCT FROM s.cycle_id
         OR v.week_id IS DISTINCT FROM s.week_id
       )
  )
  SELECT count(*) INTO v_updated FROM candidates;

  RAISE LOG '[SESSION_AUTO_RECOVER_FOUND] session=% mismatched=%', s.id, v_updated;

  IF v_updated > 0 THEN
    UPDATE public.visits v
       SET field_work_session_id = _session_id,
           cycle_id = s.cycle_id,
           week_id  = COALESCE(s.week_id, v.week_id),
           updated_at = now()
      FROM public.properties p
     WHERE v.property_id = p.id
       AND v.agent_id = s.user_id
       AND v.visit_date::date = s.session_date
       AND p.block_number = s.block_number
       AND (
         v.field_work_session_id IS DISTINCT FROM _session_id
         OR v.cycle_id IS DISTINCT FROM s.cycle_id
         OR v.week_id IS DISTINCT FROM s.week_id
       );

    RAISE LOG '[SESSION_AUTO_RECOVER_UPDATED] session=% updated=%', s.id, v_updated;
  END IF;

  -- 2. Garante o daily_work_record
  SELECT EXISTS (
    SELECT 1 FROM public.daily_work_records
     WHERE agent_id = s.user_id AND work_date = s.session_date
  ) INTO v_dwr_exists;

  IF NOT v_dwr_exists THEN
    -- Agrega totais a partir das visitas do dia
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
      AND v.visit_date::date = s.session_date
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
    RAISE LOG '[SESSION_AUTO_RECOVER_DWR] session=% dwr_generated=true worked=% closed=%',
      s.id, COALESCE(v_agg.worked, 0), COALESCE(v_agg.closed, 0);

    -- Gera pendências consistentes com a nova jornada
    PERFORM public.finalize_shift_pendencies(s.user_id, s.cycle_id, s.session_date);
  END IF;

  IF v_updated = 0 AND NOT v_dwr_generated THEN
    RAISE LOG '[SESSION_AUTO_RECOVER_NOT_NEEDED] session=%', s.id;
    RAISE LOG '[SESSION_AUTO_RECOVER_FINISH] session=% status=not_needed', s.id;
    RETURN jsonb_build_object('status','not_needed');
  END IF;

  INSERT INTO public.audit_log(action, entity, actor_id, target_id, metadata)
  VALUES ('session_auto_recover','field_work_sessions', s.user_id, s.id,
    jsonb_build_object(
      'updated', v_updated,
      'dwr_generated', v_dwr_generated,
      'session_date', s.session_date,
      'cycle_id', s.cycle_id,
      'week_id', s.week_id,
      'block_number', s.block_number
    ));

  RAISE LOG '[SESSION_AUTO_RECOVER_FINISH] session=% updated=% dwr_generated=%',
    s.id, v_updated, v_dwr_generated;

  RETURN jsonb_build_object(
    'status','recovered',
    'updated', v_updated,
    'dwr_generated', v_dwr_generated
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.recover_session_visits(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recover_session_visits(uuid) TO service_role;
