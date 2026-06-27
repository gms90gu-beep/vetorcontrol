ALTER TABLE public.blocks
  ADD COLUMN IF NOT EXISTS current_street text,
  ADD COLUMN IF NOT EXISTS current_street_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS current_street_confirmed_by uuid;