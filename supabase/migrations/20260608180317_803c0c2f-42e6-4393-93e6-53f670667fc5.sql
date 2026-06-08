
-- Extend daily_work_records with all operational fields required for daily reports
ALTER TABLE public.daily_work_records
  ADD COLUMN IF NOT EXISTS properties_recovered integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposits_existing integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposits_inspected integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS larvicide_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS larvicide_unit text,
  ADD COLUMN IF NOT EXISTS tubitos_collected integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS samples_collected integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS blocks_completed integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS epi_week integer,
  ADD COLUMN IF NOT EXISTS epi_year integer;

-- Trigger to auto-populate epidemiological week/year from work_date so agents
-- never select it manually and weekly reports can aggregate by epi week.
CREATE OR REPLACE FUNCTION public.populate_daily_epi_week()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.work_date IS NOT NULL THEN
    NEW.epi_week := EXTRACT(week FROM NEW.work_date)::integer;
    NEW.epi_year := EXTRACT(isoyear FROM NEW.work_date)::integer;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_daily_work_records_epi_week ON public.daily_work_records;
CREATE TRIGGER tr_daily_work_records_epi_week
  BEFORE INSERT OR UPDATE OF work_date ON public.daily_work_records
  FOR EACH ROW EXECUTE FUNCTION public.populate_daily_epi_week();

-- Backfill epi_week/epi_year for existing rows
UPDATE public.daily_work_records
SET epi_week = EXTRACT(week FROM work_date)::integer,
    epi_year = EXTRACT(isoyear FROM work_date)::integer
WHERE epi_week IS NULL;

CREATE INDEX IF NOT EXISTS idx_daily_work_records_epi
  ON public.daily_work_records (agent_id, epi_year, epi_week);
