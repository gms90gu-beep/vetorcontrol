
-- Função central de reconstrução dos DWRs — agrupa visitas por data operacional (America/Sao_Paulo).
CREATE OR REPLACE FUNCTION public.rebuild_daily_work_records(
  _from date DEFAULT NULL,
  _to   date DEFAULT NULL,
  _agent uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
BEGIN
  RAISE NOTICE '[DWR_REBUILD_START] from=% to=% agent=% tz=America/Sao_Paulo', _from, _to, _agent;

  FOR r IN
    SELECT
      v.agent_id                                              AS agent_id,
      public.operational_date(v.visit_date)                   AS work_date,
      count(DISTINCT v.property_id)                                                                     AS worked,
      count(DISTINCT v.property_id) FILTER (WHERE v.status::text = 'closed')                            AS closed,
      count(DISTINCT v.property_id) FILTER (WHERE v.status::text = 'refused')                           AS refused,
      count(DISTINCT v.property_id) FILTER (WHERE v.has_focus = true)                                   AS positive,
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

    -- Resolve ciclo/semana pela data operacional
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
        'completed', r.start_ts, r.end_ts, (r.work_date < CURRENT_DATE),
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
$$;

REVOKE ALL ON FUNCTION public.rebuild_daily_work_records(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rebuild_daily_work_records(date, date, uuid) TO authenticated, service_role;

-- Executa reconstrução histórica completa.
SELECT public.rebuild_daily_work_records(NULL, NULL, NULL);
