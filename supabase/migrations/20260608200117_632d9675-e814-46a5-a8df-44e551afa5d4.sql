
CREATE OR REPLACE FUNCTION public.set_dwr_epi_week()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  iso_week int;
  iso_year int;
BEGIN
  iso_week := EXTRACT(ISOYEAR FROM NEW.work_date)::int; -- placeholder, overwritten below
  iso_week := EXTRACT(WEEK   FROM NEW.work_date)::int;
  iso_year := EXTRACT(ISOYEAR FROM NEW.work_date)::int;
  IF NEW.epi_week IS NULL THEN NEW.epi_week := iso_week; END IF;
  IF NEW.epi_year IS NULL THEN NEW.epi_year := iso_year; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dwr_set_epi_week ON public.daily_work_records;
CREATE TRIGGER trg_dwr_set_epi_week
BEFORE INSERT OR UPDATE ON public.daily_work_records
FOR EACH ROW EXECUTE FUNCTION public.set_dwr_epi_week();

UPDATE public.daily_work_records
SET epi_week = EXTRACT(WEEK    FROM work_date)::int,
    epi_year = EXTRACT(ISOYEAR FROM work_date)::int
WHERE epi_week IS NULL OR epi_year IS NULL;
