-- Corrige a consolidação de boletins diários após o fechamento de jornadas.
--
-- Causa corrigida:
--   * visits.agent_id e daily_work_records.agent_id usam profiles.id;
--   * daily_work_records.legacy_agent_id usa agents.id;
--   * a rotina anterior comparava legacy_agent_id diretamente com o profile id;
--   * o gatilho só observava status = closed, enquanto os fluxos normais usam
--     completed/paused.
--
-- Esta migration também reconstrói, uma única vez, o boletim de 30/09/2026
-- para o agente afetado. A sessão pausada de 01/10 não possui visitas e não
-- será transformada nem receberá boletim por esta reconstrução.

CREATE OR REPLACE FUNCTION public.rebuild_daily_work_records(
  _from date DEFAULT NULL::date,
  _to date DEFAULT NULL::date,
  _agent uuid DEFAULT NULL::uuid
)
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
  v_legacy_agent_id uuid;
  v_today date := public.operational_date(now());
BEGIN
  RAISE NOTICE '[DWR_REBUILD_START] from=% to=% agent=% tz=America/Sao_Paulo', _from, _to, _agent;

  FOR r IN
    SELECT
      v.agent_id AS agent_id,
      public.operational_date(v.visit_date) AS work_date,
      count(DISTINCT v.property_id) AS worked,
      count(DISTINCT v.property_id) FILTER (WHERE v.status::text = 'closed') AS closed,
      count(DISTINCT v.property_id) FILTER (WHERE v.status::text = 'refused') AS refused,
      count(DISTINCT v.property_id) FILTER (WHERE v.has_focus = true) AS positive,
      COALESCE(sum(v.tubitos_coletados), 0) AS tubitos,
      COALESCE(sum(v.treatment_amount), 0) AS larvicide,
      min(v.visit_date) AS start_ts,
      max(v.visit_date) AS end_ts
    FROM public.visits v
    WHERE v.agent_id IS NOT NULL
      AND v.visit_date IS NOT NULL
      AND (_from IS NULL OR public.operational_date(v.visit_date) >= _from)
      AND (_to IS NULL OR public.operational_date(v.visit_date) <= _to)
      AND (_agent IS NULL OR v.agent_id = _agent)
    GROUP BY v.agent_id, public.operational_date(v.visit_date)
  LOOP
    v_days := v_days + 1;

    -- Converte o profile id usado nas visitas para o agents.id legado.
    SELECT a.id INTO v_legacy_agent_id
      FROM public.agents a
     WHERE a.profile_id = r.agent_id
     ORDER BY a.created_at
     LIMIT 1;

    IF v_legacy_agent_id IS NULL THEN
      RAISE WARNING '[DWR_REBUILD_AGENT_NOT_FOUND] profile=% date=%', r.agent_id, r.work_date;
      CONTINUE;
    END IF;

    SELECT cycle_id, week_id INTO v_cycle_id, v_week_id
      FROM public.resolve_cycle_week(r.work_date);

    v_epi_week := EXTRACT(week FROM r.work_date)::int;
    v_epi_year := EXTRACT(isoyear FROM r.work_date)::int;

    SELECT id, properties_worked, properties_closed, properties_refused,
           properties_positive, tubitos_collected, larvicide_amount, positive_foci
      INTO v_existing
      FROM public.daily_work_records
     WHERE agent_id = r.agent_id
       AND work_date = r.work_date;

    IF FOUND THEN
      UPDATE public.daily_work_records
         SET legacy_agent_id = v_legacy_agent_id,
             properties_worked = r.worked,
             properties_closed = r.closed,
             properties_refused = r.refused,
             properties_positive = r.positive,
             positive_foci = r.positive,
             tubitos_collected = r.tubitos,
             larvicide_amount = r.larvicide,
             cycle_id = COALESCE(v_cycle_id, cycle_id),
             week_id = COALESCE(v_week_id, week_id),
             epi_week = v_epi_week,
             epi_year = v_epi_year,
             data_integrity_log = COALESCE(data_integrity_log, '{}'::jsonb)
               || jsonb_build_object('rebuild', jsonb_build_object(
                    'at', now(), 'tz', 'America/Sao_Paulo',
                    'source', 'rebuild_daily_work_records')),
             updated_at = now()
       WHERE id = v_existing.id;
      v_corrected := v_corrected + 1;
    ELSE
      INSERT INTO public.daily_work_records (
        agent_id, legacy_agent_id, cycle_id, week_id, work_date,
        status, start_time, end_time, is_retroactive,
        properties_worked, properties_closed, properties_refused, properties_positive,
        tubitos_collected, larvicide_amount, positive_foci,
        epi_week, epi_year, data_integrity_log
      ) VALUES (
        r.agent_id, v_legacy_agent_id, v_cycle_id, v_week_id, r.work_date,
        'completed', r.start_ts, r.end_ts, (r.work_date < v_today),
        r.worked, r.closed, r.refused, r.positive,
        r.tubitos, r.larvicide, r.positive,
        v_epi_week, v_epi_year,
        jsonb_build_object('rebuild', jsonb_build_object(
          'at', now(), 'tz', 'America/Sao_Paulo',
          'source', 'rebuild_daily_work_records'))
      )
      ON CONFLICT (agent_id, work_date) DO UPDATE SET
        legacy_agent_id = EXCLUDED.legacy_agent_id,
        properties_worked = EXCLUDED.properties_worked,
        properties_closed = EXCLUDED.properties_closed,
        properties_refused = EXCLUDED.properties_refused,
        properties_positive = EXCLUDED.properties_positive,
        positive_foci = EXCLUDED.positive_foci,
        tubitos_collected = EXCLUDED.tubitos_collected,
        larvicide_amount = EXCLUDED.larvicide_amount,
        cycle_id = COALESCE(EXCLUDED.cycle_id, daily_work_records.cycle_id),
        week_id = COALESCE(EXCLUDED.week_id, daily_work_records.week_id),
        epi_week = EXCLUDED.epi_week,
        epi_year = EXCLUDED.epi_year,
        data_integrity_log = COALESCE(daily_work_records.data_integrity_log, '{}'::jsonb)
          || EXCLUDED.data_integrity_log,
        updated_at = now();
      v_rebuilt := v_rebuilt + 1;
    END IF;
  END LOOP;

  INSERT INTO public.audit_log(action, entity, actor_id, metadata)
  VALUES ('rebuild_daily_work_records', 'system', auth.uid(),
          jsonb_build_object('from', _from, 'to', _to, 'agent', _agent,
                             'days', v_days, 'rebuilt', v_rebuilt,
                             'corrected', v_corrected,
                             'tz', 'America/Sao_Paulo'));

  RETURN jsonb_build_object(
    'days', v_days, 'rebuilt', v_rebuilt, 'corrected', v_corrected,
    'tz', 'America/Sao_Paulo');
END;
$function$;

CREATE OR REPLACE FUNCTION public.rebuild_dwr_after_session_close()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_work_date date;
  v_found_date boolean := false;
  v_result jsonb;
BEGIN
  IF NEW.status::text IN ('closed', 'completed', 'paused')
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    -- Uma sessão pode atravessar a meia-noite. Reconstrói cada data real das
    -- visitas vinculadas, em vez de forçar tudo para session_date.
    FOR v_work_date IN
      SELECT DISTINCT public.operational_date(v.visit_date)
        FROM public.visits v
       WHERE v.agent_id = NEW.user_id
         AND v.field_work_session_id = NEW.id
         AND v.visit_date IS NOT NULL
    LOOP
      v_found_date := true;
      v_result := public.rebuild_daily_work_records(v_work_date, v_work_date, NEW.user_id);
      RAISE NOTICE '[DWR_AUTO_REBUILD_SESSION_CLOSE] session=% user=% date=% status=% result=%',
        NEW.id, NEW.user_id, v_work_date, NEW.status, v_result;
    END LOOP;

    IF NOT v_found_date THEN
      v_result := public.rebuild_daily_work_records(NEW.session_date, NEW.session_date, NEW.user_id);
      RAISE NOTICE '[DWR_AUTO_REBUILD_SESSION_CLOSE] session=% user=% date=% status=% fallback=session_date result=%',
        NEW.id, NEW.user_id, NEW.session_date, NEW.status, v_result;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[DWR_AUTO_REBUILD_FAILED] session=% user=% date=% status=% error=%',
      NEW.id, NEW.user_id, NEW.session_date, NEW.status, SQLERRM;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_rebuild_dwr_after_session_close ON public.field_work_sessions;

CREATE TRIGGER trg_rebuild_dwr_after_session_close
AFTER INSERT OR UPDATE OF status
ON public.field_work_sessions
FOR EACH ROW
EXECUTE FUNCTION public.rebuild_dwr_after_session_close();

REVOKE ALL ON FUNCTION public.rebuild_dwr_after_session_close() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_dwr_after_session_close() TO service_role;

COMMENT ON FUNCTION public.rebuild_daily_work_records(date, date, uuid) IS
  'Reconstrói boletins por profiles.id e resolve agents.id para legacy_agent_id.';

COMMENT ON FUNCTION public.rebuild_dwr_after_session_close() IS
  'Reconstrói daily_work_records ao fechar, concluir ou pausar uma jornada; execução somente pelo trigger.';

-- Recuperação autorizada e limitada ao fechamento perdido de 30/09/2026.
-- A sessão de 01/10 foi um teste de produção futura e não é tocada.
SELECT public.rebuild_daily_work_records(
  '2026-09-30'::date,
  '2026-09-30'::date,
  '30f520ba-b5b8-4516-932e-0008ceab854d'::uuid
);

NOTIFY pgrst, 'reload schema';
