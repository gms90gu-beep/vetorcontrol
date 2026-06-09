ALTER TABLE public.daily_work_records
  ADD COLUMN IF NOT EXISTS deposits_a1 integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposits_a2 integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposits_b  integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposits_c  integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposits_d1 integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposits_d2 integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposits_e  integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS blocks_worked integer DEFAULT 0;