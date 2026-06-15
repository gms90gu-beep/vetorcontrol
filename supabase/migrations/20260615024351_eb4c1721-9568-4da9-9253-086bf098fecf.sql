
CREATE OR REPLACE FUNCTION public.sync_cycle_statuses()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := CURRENT_DATE;
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
$$;

GRANT EXECUTE ON FUNCTION public.sync_cycle_statuses() TO authenticated, service_role;

ALTER TABLE public.cycles DISABLE TRIGGER USER;

UPDATE public.cycles SET status = 'not_started' WHERE year = 2026;
UPDATE public.cycles SET status = 'finished'    WHERE year = 2026 AND number IN (1,2);
UPDATE public.cycles SET status = 'in_progress' WHERE year = 2026 AND number = 3;

ALTER TABLE public.cycles ENABLE TRIGGER USER;

DROP INDEX IF EXISTS public.cycles_one_in_progress_per_year;
CREATE UNIQUE INDEX cycles_one_in_progress_per_year
  ON public.cycles(year) WHERE status = 'in_progress';
