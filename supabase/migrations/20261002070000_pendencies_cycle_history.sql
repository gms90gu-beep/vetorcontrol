-- Preserve property pendencies and recovery attempts by epidemiological cycle.
-- Older installations have a single pendency row per property. This migration
-- backfills cycles from linked visits and date ranges before storing one
-- snapshot per property and cycle.
ALTER TABLE public.property_pendencies
  ADD COLUMN IF NOT EXISTS cycle_id uuid;

ALTER TABLE public.property_recovery_attempts
  ADD COLUMN IF NOT EXISTS cycle_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'property_pendencies_cycle_id_fkey'
      AND conrelid = 'public.property_pendencies'::regclass
  ) THEN
    ALTER TABLE public.property_pendencies
      ADD CONSTRAINT property_pendencies_cycle_id_fkey
      FOREIGN KEY (cycle_id) REFERENCES public.cycles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'property_recovery_attempts_cycle_id_fkey'
      AND conrelid = 'public.property_recovery_attempts'::regclass
  ) THEN
    ALTER TABLE public.property_recovery_attempts
      ADD CONSTRAINT property_recovery_attempts_cycle_id_fkey
      FOREIGN KEY (cycle_id) REFERENCES public.cycles(id) ON DELETE SET NULL;
  END IF;
END $$;

UPDATE public.property_recovery_attempts pra
SET cycle_id = v.cycle_id
FROM public.visits v
WHERE pra.cycle_id IS NULL
  AND pra.visit_id = v.id
  AND v.cycle_id IS NOT NULL;

UPDATE public.property_recovery_attempts pra
SET cycle_id = c.id
FROM public.cycles c
WHERE pra.cycle_id IS NULL
  AND pra.attempted_at::date BETWEEN c.start_date AND c.end_date;

UPDATE public.property_pendencies p
SET cycle_id = (
  SELECT pra.cycle_id
  FROM public.property_recovery_attempts pra
  WHERE pra.property_id = p.property_id
    AND pra.cycle_id IS NOT NULL
  ORDER BY pra.attempted_at DESC, pra.created_at DESC
  LIMIT 1
)
WHERE p.cycle_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.property_recovery_attempts pra
    WHERE pra.property_id = p.property_id AND pra.cycle_id IS NOT NULL
  );

UPDATE public.property_pendencies p
SET cycle_id = c.id
FROM public.cycles c
WHERE p.cycle_id IS NULL
  AND COALESCE(p.last_attempt_at, p.created_at)::date BETWEEN c.start_date AND c.end_date;

ALTER TABLE public.property_pendencies
  DROP CONSTRAINT IF EXISTS property_pendencies_property_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS property_pendencies_property_cycle_key
  ON public.property_pendencies (property_id, cycle_id) NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_property_pendencies_cycle_open
  ON public.property_pendencies (cycle_id, resolved_at);

CREATE INDEX IF NOT EXISTS idx_property_recovery_attempts_cycle_date
  ON public.property_recovery_attempts (cycle_id, attempted_at DESC);

-- Rebuild older cycle snapshots from attempt history already present.
WITH grouped AS (
  SELECT
    property_id,
    cycle_id,
    (array_agg(agent_id ORDER BY attempted_at DESC, created_at DESC))[1] AS agent_id,
    (array_agg(result ORDER BY attempted_at DESC, created_at DESC))[1] AS current_status,
    (array_agg(attempted_at ORDER BY attempted_at DESC, created_at DESC))[1] AS last_attempt_at,
    COUNT(*)::integer AS attempt_count
  FROM public.property_recovery_attempts
  WHERE cycle_id IS NOT NULL
  GROUP BY property_id, cycle_id
)
INSERT INTO public.property_pendencies (
  property_id, cycle_id, agent_id, current_status, attempt_count,
  last_attempt_at, resolved_at, resolved_status
)
SELECT
  g.property_id,
  g.cycle_id,
  g.agent_id,
  g.current_status,
  g.attempt_count,
  g.last_attempt_at,
  CASE WHEN g.current_status IN ('visited', 'unoccupied', 'demolished') THEN g.last_attempt_at END,
  CASE WHEN g.current_status IN ('visited', 'unoccupied', 'demolished') THEN g.current_status END
FROM grouped g
ON CONFLICT (property_id, cycle_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.on_recovery_attempt_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_resolution boolean;
  next_attempt integer;
  resolved_cycle_id uuid;
BEGIN
  resolved_cycle_id := NEW.cycle_id;

  IF resolved_cycle_id IS NULL AND NEW.visit_id IS NOT NULL THEN
    SELECT v.cycle_id INTO resolved_cycle_id
    FROM public.visits v
    WHERE v.id = NEW.visit_id;
  END IF;

  IF resolved_cycle_id IS NULL THEN
    SELECT c.id INTO resolved_cycle_id
    FROM public.cycles c
    WHERE NEW.attempted_at::date BETWEEN c.start_date AND c.end_date
    ORDER BY c.start_date DESC
    LIMIT 1;
  END IF;

  is_resolution := NEW.result IN ('visited', 'unoccupied', 'demolished');

  SELECT COALESCE(MAX(attempt_number), 0) + 1 INTO next_attempt
  FROM public.property_recovery_attempts
  WHERE property_id = NEW.property_id AND id <> NEW.id;

  UPDATE public.property_recovery_attempts
  SET attempt_number = next_attempt, cycle_id = resolved_cycle_id
  WHERE id = NEW.id;

  INSERT INTO public.property_pendencies (
    property_id, cycle_id, agent_id, current_status, reason, attempt_count,
    last_attempt_at, resolved_at, resolved_status
  )
  VALUES (
    NEW.property_id, resolved_cycle_id, NEW.agent_id, NEW.result, NEW.notes,
    next_attempt, NEW.attempted_at,
    CASE WHEN is_resolution THEN NEW.attempted_at END,
    CASE WHEN is_resolution THEN NEW.result END
  )
  ON CONFLICT (property_id, cycle_id) DO UPDATE SET
    agent_id = EXCLUDED.agent_id,
    current_status = EXCLUDED.current_status,
    reason = EXCLUDED.reason,
    attempt_count = EXCLUDED.attempt_count,
    last_attempt_at = EXCLUDED.last_attempt_at,
    resolved_at = EXCLUDED.resolved_at,
    resolved_status = EXCLUDED.resolved_status,
    updated_at = now();

  IF NEW.result IN ('unoccupied', 'demolished', 'visited') THEN
    UPDATE public.properties
    SET status = NEW.result::text::public.property_status
    WHERE id = NEW.property_id;
  END IF;

  INSERT INTO public.audit_log(action, entity, actor_id, target_id, metadata)
  VALUES (
    'recovery_attempt',
    'property',
    NEW.agent_id,
    NEW.property_id,
    jsonb_build_object('result', NEW.result, 'attempt_number', next_attempt, 'notes', NEW.notes, 'cycle_id', resolved_cycle_id)
  );

  RETURN NEW;
END;
$$;
