
ALTER TABLE public.field_work_sessions
  ADD COLUMN IF NOT EXISTS is_retroactive boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retroactive_reason text;

ALTER TABLE public.daily_work_records
  ADD COLUMN IF NOT EXISTS is_retroactive boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retroactive_reason text;
