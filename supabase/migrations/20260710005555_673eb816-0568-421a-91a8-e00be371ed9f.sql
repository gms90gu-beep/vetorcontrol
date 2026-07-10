
-- 1) Guard trigger: prevent status='completed' with end_time IS NULL
CREATE OR REPLACE FUNCTION public.ensure_dwr_end_time()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND NEW.end_time IS NULL THEN
    NEW.end_time := COALESCE(NEW.updated_at, now());
    RAISE NOTICE 'ensure_dwr_end_time: end_time preenchido automaticamente para DWR %', NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_dwr_end_time ON public.daily_work_records;
CREATE TRIGGER trg_ensure_dwr_end_time
BEFORE INSERT OR UPDATE OF status, end_time
ON public.daily_work_records
FOR EACH ROW
EXECUTE FUNCTION public.ensure_dwr_end_time();

-- 2) Backfill existing broken DWRs.
-- Priority: (a) last visit of the agent on that operational date;
--          (b) latest field_work_sessions.updated_at for same user/session_date;
--          (c) start_time (last resort).
WITH broken AS (
  SELECT id, legacy_agent_id, agent_id, work_date, start_time
  FROM public.daily_work_records
  WHERE status = 'completed' AND end_time IS NULL
),
last_visit AS (
  SELECT b.id AS dwr_id, max(v.visit_date) AS ts
  FROM broken b
  LEFT JOIN public.visits v
    ON v.agent_id = b.agent_id
   AND public.operational_date(v.visit_date) = b.work_date
  GROUP BY b.id
),
last_session AS (
  SELECT b.id AS dwr_id, max(s.updated_at) AS ts
  FROM broken b
  LEFT JOIN public.field_work_sessions s
    ON s.user_id = b.legacy_agent_id
   AND s.session_date = b.work_date
  GROUP BY b.id
)
UPDATE public.daily_work_records d
SET end_time = COALESCE(lv.ts, ls.ts, d.start_time),
    data_integrity_log = COALESCE(d.data_integrity_log, '{}'::jsonb)
      || jsonb_build_object(
        'end_time_backfill', jsonb_build_object(
          'source', CASE
            WHEN lv.ts IS NOT NULL THEN 'last_visit'
            WHEN ls.ts IS NOT NULL THEN 'field_work_sessions.updated_at'
            ELSE 'start_time_fallback'
          END,
          'backfilled_at', now()
        )
      ),
    updated_at = now()
FROM broken b
LEFT JOIN last_visit lv ON lv.dwr_id = b.id
LEFT JOIN last_session ls ON ls.dwr_id = b.id
WHERE d.id = b.id;
