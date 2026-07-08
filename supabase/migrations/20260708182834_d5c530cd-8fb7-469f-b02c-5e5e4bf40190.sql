ALTER TABLE public.field_work_sessions
  ADD COLUMN IF NOT EXISTS started_at timestamptz;

UPDATE public.field_work_sessions
   SET started_at = created_at
 WHERE started_at IS NULL;