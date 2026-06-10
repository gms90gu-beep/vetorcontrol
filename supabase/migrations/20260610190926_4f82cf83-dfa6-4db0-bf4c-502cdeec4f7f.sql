
ALTER TABLE public.daily_work_records
  ADD COLUMN IF NOT EXISTS tubitos_properties integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS samples_total integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS properties_positive integer NOT NULL DEFAULT 0;
