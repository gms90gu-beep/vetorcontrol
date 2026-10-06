-- Preserva jornadas pausadas reais mesmo quando ainda não possuem visitas.
--
-- A reconstrução anterior era baseada exclusivamente em visits. Com isso,
-- uma produção futura real, aberta e pausada antes da primeira visita, ficava
-- sem daily_work_records e desaparecia dos relatórios.

CREATE OR REPLACE FUNCTION public.ensure_dwr_for_empty_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_legacy_agent_id uuid;
  v_cycle_id uuid;
  v_week_id uuid;
  v_status text;
BEGIN
  IF NEW.status::text IN ('paused', 'completed', 'closed')
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
     AND NOT EXISTS (
       SELECT 1
         FROM public.visits v
        WHERE v.field_work_session_id = NEW.id
     )
     AND NOT EXISTS (
       SELECT 1
         FROM public.daily_work_records d
        WHERE d.agent_id = NEW.user_id
          AND d.work_date = NEW.session_date
     ) THEN
    SELECT a.id
      INTO v_legacy_agent_id
      FROM public.agents a
     WHERE a.profile_id = NEW.user_id
     ORDER BY a.created_at
     LIMIT 1;

    IF v_legacy_agent_id IS NULL THEN
      RAISE WARNING '[DWR_EMPTY_SESSION_AGENT_NOT_FOUND] profile=% session=%', NEW.user_id, NEW.id;
      RETURN NEW;
    END IF;

    v_cycle_id := NEW.cycle_id;
    v_week_id := NEW.week_id;
    IF v_cycle_id IS NULL THEN
      SELECT cycle_id, week_id
        INTO v_cycle_id, v_week_id
        FROM public.resolve_cycle_week(NEW.session_date);
    END IF;

    IF v_cycle_id IS NULL THEN
      RAISE WARNING '[DWR_EMPTY_SESSION_CYCLE_NOT_FOUND] session=% date=%', NEW.id, NEW.session_date;
      RETURN NEW;
    END IF;

    -- A jornada pausada continua aberta/resumível; a coluna histórica aceita
    -- apenas in_progress/completed, por isso paused é representada como
    -- in_progress no boletim diário.
    v_status := CASE WHEN NEW.status::text = 'paused' THEN 'in_progress' ELSE 'completed' END;

    INSERT INTO public.daily_work_records (
      agent_id, legacy_agent_id, cycle_id, week_id, work_date,
      status, start_time, end_time, is_retroactive,
      properties_worked, properties_closed, properties_refused,
      properties_positive, positive_foci, pending_visits,
      data_integrity_log
    ) VALUES (
      NEW.user_id, v_legacy_agent_id, v_cycle_id, v_week_id, NEW.session_date,
      v_status, COALESCE(NEW.created_at, now()),
      CASE WHEN v_status = 'completed' THEN COALESCE(NEW.updated_at, now()) ELSE NULL END,
      NEW.session_date < public.operational_date(now()),
      0, 0, 0, 0, 0, COALESCE(NEW.property_count, 0),
      jsonb_build_object(
        'source', 'empty_field_work_session',
        'session_id', NEW.id,
        'session_status', NEW.status,
        'production_is_real', true,
        'at', now(),
        'tz', 'America/Sao_Paulo'
      )
    )
    ON CONFLICT (agent_id, work_date) DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[DWR_EMPTY_SESSION_FAILED] session=% user=% date=% error=%',
      NEW.id, NEW.user_id, NEW.session_date, SQLERRM;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_ensure_dwr_for_empty_session ON public.field_work_sessions;

CREATE TRIGGER trg_ensure_dwr_for_empty_session
AFTER INSERT OR UPDATE OF status
ON public.field_work_sessions
FOR EACH ROW
EXECUTE FUNCTION public.ensure_dwr_for_empty_session();

REVOKE ALL ON FUNCTION public.ensure_dwr_for_empty_session() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_dwr_for_empty_session() TO service_role;

COMMENT ON FUNCTION public.ensure_dwr_for_empty_session() IS
  'Cria daily_work_records para jornadas reais pausadas/concluídas sem visitas, preservando produção futura e retroativa.';

-- Recupera a produção real de 01/10/2026 sem encerrar nem alterar a sessão.
INSERT INTO public.daily_work_records (
  agent_id, legacy_agent_id, cycle_id, week_id, work_date,
  status, start_time, end_time, is_retroactive,
  properties_worked, properties_closed, properties_refused,
  properties_positive, positive_foci, pending_visits,
  data_integrity_log
)
SELECT
  s.user_id,
  a.id,
  COALESCE(s.cycle_id, rw.cycle_id),
  COALESCE(s.week_id, rw.week_id),
  s.session_date,
  CASE WHEN s.status::text = 'paused' THEN 'in_progress' ELSE 'completed' END,
  COALESCE(s.created_at, now()),
  CASE WHEN s.status::text = 'paused' THEN NULL ELSE COALESCE(s.updated_at, now()) END,
  s.session_date < public.operational_date(now()),
  0, 0, 0, 0, 0, COALESCE(s.property_count, 0),
  jsonb_build_object(
    'source', 'real_production_2026_10_01',
    'session_id', s.id,
    'production_is_real', true,
    'at', now(),
    'tz', 'America/Sao_Paulo'
  )
FROM public.field_work_sessions s
JOIN public.agents a ON a.profile_id = s.user_id
LEFT JOIN LATERAL public.resolve_cycle_week(s.session_date) rw ON true
WHERE s.id = 'ce55ea47-0443-4795-9baf-cf20f222d9ef'::uuid
  AND s.status::text IN ('paused', 'completed', 'closed')
  AND COALESCE(s.cycle_id, rw.cycle_id) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
      FROM public.daily_work_records d
     WHERE d.agent_id = s.user_id
       AND d.work_date = s.session_date
  )
ON CONFLICT (agent_id, work_date) DO NOTHING;

NOTIFY pgrst, 'reload schema';
