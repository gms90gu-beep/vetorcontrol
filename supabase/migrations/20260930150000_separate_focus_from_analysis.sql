-- Separate foco observado em campo do resultado confirmado em análise.
-- Registros anteriores ficam NULL porque o histórico não comprova o resultado laboratorial.
ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS focus_analysis_status text
  CHECK (focus_analysis_status IN ('pending', 'positive', 'negative', 'inconclusive'));

CREATE OR REPLACE FUNCTION public.rebuild_daily_work_records(_from date DEFAULT NULL::date, _to date DEFAULT NULL::date, _agent uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rebuilt int := 0;
  v_corrected int := 0;
  v_days int := 0;
  r record;
  v_cycle_id uuid;
  v_week_id uuid;
  v_epi_week int;
  v_epi_year int;
  v_existing record;
  v_today date := public.operational_date(now());
BEGIN
  RAISE NOTICE '[DWR_REBUILD_START] from=% to=% agent=% tz=America/Sao_Paulo', _from, _to, _agent;

  FOR r IN
    SELECT
      v.agent_id                                              AS agent_id,
      public.operational_date(v.visit_date)                   AS work_date,
      count(DISTINCT v.property_id)                                                                     AS worked,
      count(DISTINCT v.property_id) FILTER (WHERE v.status::text = 'closed')                            AS closed,
      count(DISTINCT v.property_id) FILTER (WHERE v.status::text = 'refused')                           AS refused,
      count(DISTINCT v.property_id) FILTER (WHERE v.focus_analysis_status = 'positive')                                   AS positive,
      COALESCE(sum(v.tubitos_coletados), 0)                                                             AS tubitos,
      COALESCE(sum(v.treatment_amount), 0)                                                              AS larvicide,
      min(v.visit_date)                                                                                 AS start_ts,
      max(v.visit_date)                                                                                 AS end_ts
    FROM public.visits v
    WHERE v.agent_id IS NOT NULL
      AND v.visit_date IS NOT NULL
      AND (_from  IS NULL OR public.operational_date(v.visit_date) >= _from)
      AND (_to    IS NULL OR public.operational_date(v.visit_date) <= _to)
      AND (_agent IS NULL OR v.agent_id = _agent)
    GROUP BY v.agent_id, public.operational_date(v.visit_date)
  LOOP
    v_days := v_days + 1;

    RAISE NOTICE '[DWR_GROUPING] date=% agent=% visits=% tz=America/Sao_Paulo', r.work_date, r.agent_id, r.worked;

    SELECT cycle_id, week_id INTO v_cycle_id, v_week_id
    FROM public.resolve_cycle_week(r.work_date);

    v_epi_week := EXTRACT(week    FROM r.work_date)::int;
    v_epi_year := EXTRACT(isoyear FROM r.work_date)::int;

    SELECT id, properties_worked, properties_closed, properties_refused,
           properties_positive, tubitos_collected, larvicide_amount, positive_foci
      INTO v_existing
      FROM public.daily_work_records
     WHERE legacy_agent_id = r.agent_id
       AND work_date = r.work_date;

    IF FOUND THEN
      IF v_existing.properties_worked  IS DISTINCT FROM r.worked
      OR v_existing.properties_closed  IS DISTINCT FROM r.closed
      OR v_existing.properties_refused IS DISTINCT FROM r.refused
      OR v_existing.properties_positive IS DISTINCT FROM r.positive
      OR v_existing.tubitos_collected  IS DISTINCT FROM r.tubitos
      OR v_existing.larvicide_amount   IS DISTINCT FROM r.larvicide
      OR v_existing.positive_foci      IS DISTINCT FROM r.positive
      THEN
        UPDATE public.daily_work_records
           SET properties_worked   = r.worked,
               properties_closed   = r.closed,
               properties_refused  = r.refused,
               properties_positive = r.positive,
               positive_foci       = r.positive,
               tubitos_collected   = r.tubitos,
               larvicide_amount    = r.larvicide,
               cycle_id            = COALESCE(v_cycle_id, cycle_id),
               week_id             = COALESCE(v_week_id, week_id),
               epi_week            = v_epi_week,
               epi_year            = v_epi_year,
               data_integrity_log  = COALESCE(data_integrity_log, '{}'::jsonb)
                                     || jsonb_build_object(
                                          'rebuild', jsonb_build_object(
                                            'at', now(),
                                            'tz', 'America/Sao_Paulo',
                                            'source', 'rebuild_daily_work_records'
                                          )
                                        ),
               updated_at          = now()
         WHERE id = v_existing.id;
        v_corrected := v_corrected + 1;
      END IF;
    ELSE
      INSERT INTO public.daily_work_records (
        agent_id, legacy_agent_id, cycle_id, week_id, work_date,
        status, start_time, end_time, is_retroactive,
        properties_worked, properties_closed, properties_refused, properties_positive,
        tubitos_collected, larvicide_amount, positive_foci,
        epi_week, epi_year, data_integrity_log
      ) VALUES (
        r.agent_id, r.agent_id, v_cycle_id, v_week_id, r.work_date,
        'completed', r.start_ts, r.end_ts, (r.work_date < v_today),
        r.worked, r.closed, r.refused, r.positive,
        r.tubitos, r.larvicide, r.positive,
        v_epi_week, v_epi_year,
        jsonb_build_object('rebuild', jsonb_build_object(
          'at', now(), 'tz', 'America/Sao_Paulo', 'source', 'rebuild_daily_work_records'
        ))
      )
      ON CONFLICT (legacy_agent_id, work_date) DO NOTHING;
      v_rebuilt := v_rebuilt + 1;
    END IF;
  END LOOP;

  RAISE NOTICE '[DWR_REBUILD_FINISH] days=% rebuilt=% corrected=%', v_days, v_rebuilt, v_corrected;

  INSERT INTO public.audit_log(action, entity, actor_id, metadata)
  VALUES ('rebuild_daily_work_records', 'system', auth.uid(),
          jsonb_build_object('from', _from, 'to', _to, 'agent', _agent,
                             'days', v_days, 'rebuilt', v_rebuilt, 'corrected', v_corrected,
                             'tz', 'America/Sao_Paulo'));

  RETURN jsonb_build_object(
    'days', v_days,
    'rebuilt', v_rebuilt,
    'corrected', v_corrected,
    'tz', 'America/Sao_Paulo'
  );
END;
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
      count(DISTINCT v.property_id) FILTER (WHERE v.focus_analysis_status = 'positive')          AS positive,
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

CREATE OR REPLACE FUNCTION public.recompute_block_progress(_cycle_id uuid, _block_number text, _agent_id uuid)
 RETURNS block_progress
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
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
BEGIN
  IF _cycle_id IS NULL OR _block_number IS NULL OR _agent_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Resolve possible block UUIDs matching the number (properties may reference block_id only)
  SELECT array_agg(id) INTO v_block_ids
    FROM public.blocks WHERE number::text = _block_number;

  SELECT count(*) INTO v_total
    FROM public.properties p
   WHERE p.block_number = _block_number
      OR (v_block_ids IS NOT NULL AND p.block_id = ANY(v_block_ids));

  SELECT
    count(DISTINCT v.property_id) FILTER (WHERE v.status::text = 'visited'),
    count(DISTINCT v.property_id) FILTER (WHERE v.status::text = 'closed'),
    count(DISTINCT v.property_id) FILTER (WHERE v.status::text = 'refused'),
    count(DISTINCT v.property_id) FILTER (WHERE v.is_recovered = true),
    count(DISTINCT v.property_id) FILTER (WHERE v.focus_analysis_status = 'positive'),
    max(v.visit_date),
    max(public.operational_date(v.visit_date)),
    min(v.visit_date)
  INTO v_visited, v_closed, v_refused, v_recovered, v_positive,
       v_last_visit, v_last_op_date, v_started
  FROM public.visits v
  JOIN public.properties p ON p.id = v.property_id
  WHERE (p.block_number = _block_number
         OR (v_block_ids IS NOT NULL AND p.block_id = ANY(v_block_ids)))
    AND v.agent_id = _agent_id
    AND v.cycle_id = _cycle_id;

  v_pending := GREATEST(0, v_total - (COALESCE(v_visited,0) + COALESCE(v_closed,0) + COALESCE(v_refused,0)));
  v_pct := CASE WHEN v_total > 0
    THEN ROUND(((COALESCE(v_visited,0)+COALESCE(v_closed,0)+COALESCE(v_refused,0))::numeric / v_total) * 100, 2)
    ELSE 0 END;

  v_status := CASE
    WHEN v_total > 0 AND v_pending = 0 THEN 'COMPLETED'
    WHEN v_last_visit IS NOT NULL THEN 'IN_PROGRESS'
    ELSE 'NOT_STARTED'
  END;

  INSERT INTO public.block_progress (
    cycle_id, block_number, agent_id, status, completion_percentage,
    total_properties, visited_properties, pending_properties, closed_properties,
    recovered_properties, positive_focus, negative_focus, tb_properties, pe_properties,
    started_at, completed_at, last_visit_at, last_operational_date, last_sync
  ) VALUES (
    _cycle_id, _block_number, _agent_id, v_status, v_pct,
    v_total, COALESCE(v_visited,0), v_pending, COALESCE(v_closed,0),
    COALESCE(v_recovered,0), COALESCE(v_positive,0), 0, 0, 0,
    v_started, CASE WHEN v_status='COMPLETED' THEN now() ELSE NULL END,
    v_last_visit, v_last_op_date, now()
  )
  ON CONFLICT (cycle_id, block_number, agent_id) DO UPDATE SET
    status = EXCLUDED.status,
    completion_percentage = EXCLUDED.completion_percentage,
    total_properties = EXCLUDED.total_properties,
    visited_properties = EXCLUDED.visited_properties,
    pending_properties = EXCLUDED.pending_properties,
    closed_properties = EXCLUDED.closed_properties,
    recovered_properties = EXCLUDED.recovered_properties,
    positive_focus = EXCLUDED.positive_focus,
    started_at = COALESCE(public.block_progress.started_at, EXCLUDED.started_at),
    completed_at = CASE WHEN EXCLUDED.status='COMPLETED'
                        THEN COALESCE(public.block_progress.completed_at, now())
                        ELSE NULL END,
    last_visit_at = EXCLUDED.last_visit_at,
    last_operational_date = EXCLUDED.last_operational_date,
    last_sync = now(),
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END $function$;

GRANT EXECUTE ON FUNCTION public.recompute_block_progress(uuid, text, uuid) TO authenticated, service_role;
