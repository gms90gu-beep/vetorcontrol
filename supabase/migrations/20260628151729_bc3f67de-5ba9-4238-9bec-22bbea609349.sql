
DO $$ BEGIN
  CREATE TYPE public.week_status AS ENUM ('open', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.weeks ADD COLUMN IF NOT EXISTS status public.week_status NOT NULL DEFAULT 'open';
ALTER TABLE public.weeks ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DO $$
DECLARE c RECORD; i INT; total_days INT; base_len INT; remainder INT;
  cur_start DATE; cur_end DATE; len INT;
BEGIN
  FOR c IN SELECT id, start_date, end_date FROM public.cycles LOOP
    total_days := (c.end_date - c.start_date) + 1;
    base_len := total_days / 8;
    remainder := total_days - (base_len * 8);
    cur_start := c.start_date;
    FOR i IN 1..8 LOOP
      len := base_len + CASE WHEN i <= remainder THEN 1 ELSE 0 END;
      cur_end := cur_start + (len - 1);
      UPDATE public.weeks SET start_date = cur_start, end_date = cur_end, updated_at = now()
       WHERE cycle_id = c.id AND number = i;
      IF NOT FOUND THEN
        INSERT INTO public.weeks (cycle_id, number, start_date, end_date)
        VALUES (c.id, i, cur_start, cur_end);
      END IF;
      cur_start := cur_end + 1;
    END LOOP;
    DELETE FROM public.weeks WHERE cycle_id = c.id AND number > 8;
  END LOOP;
END $$;

UPDATE public.weeks w SET status = 'closed'
  FROM public.cycles c
 WHERE w.cycle_id = c.id AND (c.status = 'finished' OR w.end_date < CURRENT_DATE);

CREATE OR REPLACE FUNCTION public.regenerate_cycle_weeks(_cycle_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c RECORD; i INT; total_days INT; base_len INT; remainder INT;
  cur_start DATE; cur_end DATE; len INT;
BEGIN
  SELECT id, start_date, end_date INTO c FROM public.cycles WHERE id = _cycle_id;
  IF NOT FOUND THEN RETURN; END IF;
  total_days := (c.end_date - c.start_date) + 1;
  base_len := total_days / 8;
  remainder := total_days - (base_len * 8);
  cur_start := c.start_date;
  FOR i IN 1..8 LOOP
    len := base_len + CASE WHEN i <= remainder THEN 1 ELSE 0 END;
    cur_end := cur_start + (len - 1);
    UPDATE public.weeks SET start_date = cur_start, end_date = cur_end, updated_at = now()
     WHERE cycle_id = c.id AND number = i;
    IF NOT FOUND THEN
      INSERT INTO public.weeks (cycle_id, number, start_date, end_date)
      VALUES (c.id, i, cur_start, cur_end);
    END IF;
    cur_start := cur_end + 1;
  END LOOP;
  DELETE FROM public.weeks WHERE cycle_id = c.id AND number > 8;
END $$;

CREATE OR REPLACE FUNCTION public.trg_cycle_generate_weeks()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.regenerate_cycle_weeks(NEW.id); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS cycle_generate_weeks_aiu ON public.cycles;
CREATE TRIGGER cycle_generate_weeks_aiu
AFTER INSERT OR UPDATE OF start_date, end_date ON public.cycles
FOR EACH ROW EXECUTE FUNCTION public.trg_cycle_generate_weeks();

CREATE OR REPLACE FUNCTION public.get_current_cycle()
RETURNS public.cycles LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.cycles
   WHERE CURRENT_DATE BETWEEN start_date AND end_date
   ORDER BY year DESC, number LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.resolve_cycle_week(_date date)
RETURNS TABLE (cycle_id uuid, week_id uuid, week_number int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT w.cycle_id, w.id, w.number
    FROM public.weeks w
    JOIN public.cycles c ON c.id = w.cycle_id
   WHERE _date BETWEEN w.start_date AND w.end_date
     AND _date BETWEEN c.start_date AND c.end_date
   ORDER BY c.year DESC, c.number, w.number
   LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.fill_cycle_week_from_date()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ref_date date; r record;
BEGIN
  IF TG_TABLE_NAME = 'visits' THEN ref_date := COALESCE(NEW.visit_date::date, CURRENT_DATE);
  ELSIF TG_TABLE_NAME = 'daily_work_records' THEN ref_date := COALESCE(NEW.work_date, CURRENT_DATE);
  ELSIF TG_TABLE_NAME = 'field_work_sessions' THEN ref_date := COALESCE(NEW.session_date, CURRENT_DATE);
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
END $$;

DROP TRIGGER IF EXISTS fill_cycle_week_biu ON public.visits;
CREATE TRIGGER fill_cycle_week_biu BEFORE INSERT OR UPDATE ON public.visits
FOR EACH ROW EXECUTE FUNCTION public.fill_cycle_week_from_date();

DROP TRIGGER IF EXISTS fill_cycle_week_biu ON public.daily_work_records;
CREATE TRIGGER fill_cycle_week_biu BEFORE INSERT OR UPDATE ON public.daily_work_records
FOR EACH ROW EXECUTE FUNCTION public.fill_cycle_week_from_date();

DROP TRIGGER IF EXISTS fill_cycle_week_biu ON public.field_work_sessions;
CREATE TRIGGER fill_cycle_week_biu BEFORE INSERT OR UPDATE ON public.field_work_sessions
FOR EACH ROW EXECUTE FUNCTION public.fill_cycle_week_from_date();

CREATE OR REPLACE FUNCTION public.close_week(_week_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w record; next_week_id uuid; next_cycle_id uuid;
BEGIN
  SELECT * INTO w FROM public.weeks WHERE id = _week_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Semana não encontrada'; END IF;
  UPDATE public.weeks SET status = 'closed', updated_at = now() WHERE id = _week_id;
  IF w.number < 8 THEN
    UPDATE public.weeks SET status = 'open' WHERE cycle_id = w.cycle_id AND number = w.number + 1
      RETURNING id INTO next_week_id;
    RETURN jsonb_build_object('closed_week', w.number, 'next_week_id', next_week_id);
  END IF;
  UPDATE public.cycles SET status = 'finished' WHERE id = w.cycle_id;
  SELECT id INTO next_cycle_id FROM public.cycles
    WHERE year >= (SELECT year FROM public.cycles WHERE id = w.cycle_id)
      AND status = 'not_started'
    ORDER BY year, number LIMIT 1;
  IF next_cycle_id IS NOT NULL THEN
    UPDATE public.cycles SET status = 'in_progress' WHERE id = next_cycle_id;
  END IF;
  RETURN jsonb_build_object('closed_week', 8, 'cycle_finished', w.cycle_id, 'next_cycle_id', next_cycle_id);
END $$;

GRANT EXECUTE ON FUNCTION public.close_week(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.regenerate_cycle_weeks(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_cycle() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.resolve_cycle_week(date) TO authenticated, anon;

-- Backfill via subselect correlacionado (evita issue de LATERAL no target)
UPDATE public.visits v SET
  cycle_id = COALESCE(v.cycle_id, (SELECT cycle_id FROM public.resolve_cycle_week(v.visit_date::date))),
  week_id  = COALESCE(v.week_id,  (SELECT week_id  FROM public.resolve_cycle_week(v.visit_date::date)))
WHERE v.cycle_id IS NULL OR v.week_id IS NULL;

UPDATE public.daily_work_records d SET
  cycle_id = COALESCE(d.cycle_id, (SELECT cycle_id FROM public.resolve_cycle_week(d.work_date))),
  week_id  = COALESCE(d.week_id,  (SELECT week_id  FROM public.resolve_cycle_week(d.work_date)))
WHERE d.cycle_id IS NULL OR d.week_id IS NULL;

UPDATE public.field_work_sessions s SET
  cycle_id = COALESCE(s.cycle_id, (SELECT cycle_id FROM public.resolve_cycle_week(s.session_date))),
  week_id  = COALESCE(s.week_id,  (SELECT week_id  FROM public.resolve_cycle_week(s.session_date)))
WHERE s.cycle_id IS NULL OR s.week_id IS NULL;
