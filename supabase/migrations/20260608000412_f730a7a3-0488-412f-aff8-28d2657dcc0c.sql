
-- Enum for recovery attempt results
DO $$ BEGIN
  CREATE TYPE public.recovery_result AS ENUM (
    'closed','refused','absent','not_located','not_done',
    'visited','unoccupied','demolished'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Extend property_status enum
DO $$ BEGIN
  ALTER TYPE public.property_status ADD VALUE IF NOT EXISTS 'absent';
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.property_status ADD VALUE IF NOT EXISTS 'not_located';
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.property_status ADD VALUE IF NOT EXISTS 'unoccupied';
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.property_status ADD VALUE IF NOT EXISTS 'demolished';
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.property_status ADD VALUE IF NOT EXISTS 'visited';
EXCEPTION WHEN others THEN NULL; END $$;

-- ===== property_recovery_attempts =====
CREATE TABLE IF NOT EXISTS public.property_recovery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL,
  visit_id uuid,
  agent_id uuid NOT NULL,
  attempt_number integer NOT NULL DEFAULT 1,
  result public.recovery_result NOT NULL,
  notes text,
  latitude double precision,
  longitude double precision,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pra_property ON public.property_recovery_attempts(property_id);
CREATE INDEX IF NOT EXISTS idx_pra_agent_date ON public.property_recovery_attempts(agent_id, attempted_at DESC);

GRANT SELECT, INSERT ON public.property_recovery_attempts TO authenticated;
GRANT ALL ON public.property_recovery_attempts TO service_role;

ALTER TABLE public.property_recovery_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Recovery attempts visible by owner or supervisors" ON public.property_recovery_attempts;
CREATE POLICY "Recovery attempts visible by owner or supervisors"
  ON public.property_recovery_attempts FOR SELECT TO authenticated
  USING (public.can_supervise_user(agent_id));

DROP POLICY IF EXISTS "Agents can insert their own recovery attempts" ON public.property_recovery_attempts;
CREATE POLICY "Agents can insert their own recovery attempts"
  ON public.property_recovery_attempts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = agent_id);

-- ===== property_pendencies =====
CREATE TABLE IF NOT EXISTS public.property_pendencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL UNIQUE,
  agent_id uuid NOT NULL,
  current_status public.recovery_result NOT NULL,
  reason text,
  attempt_count integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  resolved_at timestamptz,
  resolved_status public.recovery_result,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pp_agent ON public.property_pendencies(agent_id) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pp_status ON public.property_pendencies(current_status);

GRANT SELECT, INSERT, UPDATE ON public.property_pendencies TO authenticated;
GRANT ALL ON public.property_pendencies TO service_role;

ALTER TABLE public.property_pendencies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Pendencies visible by owner or supervisors" ON public.property_pendencies;
CREATE POLICY "Pendencies visible by owner or supervisors"
  ON public.property_pendencies FOR SELECT TO authenticated
  USING (public.can_supervise_user(agent_id));

DROP POLICY IF EXISTS "Agents can insert their own pendencies" ON public.property_pendencies;
CREATE POLICY "Agents can insert their own pendencies"
  ON public.property_pendencies FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = agent_id);

DROP POLICY IF EXISTS "Owner or supervisors can update pendencies" ON public.property_pendencies;
CREATE POLICY "Owner or supervisors can update pendencies"
  ON public.property_pendencies FOR UPDATE TO authenticated
  USING (public.can_supervise_user(agent_id))
  WITH CHECK (public.can_supervise_user(agent_id));

DROP TRIGGER IF EXISTS trg_pp_updated_at ON public.property_pendencies;
CREATE TRIGGER trg_pp_updated_at BEFORE UPDATE ON public.property_pendencies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== Trigger: after recovery attempt insert =====
CREATE OR REPLACE FUNCTION public.on_recovery_attempt_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_resolution boolean;
  next_attempt integer;
BEGIN
  is_resolution := NEW.result IN ('visited','unoccupied','demolished');

  -- Compute attempt_number if 1 (default)
  SELECT COALESCE(MAX(attempt_number),0) + 1 INTO next_attempt
  FROM public.property_recovery_attempts
  WHERE property_id = NEW.property_id AND id <> NEW.id;
  UPDATE public.property_recovery_attempts SET attempt_number = next_attempt WHERE id = NEW.id;

  -- Upsert pendency
  INSERT INTO public.property_pendencies (property_id, agent_id, current_status, reason, attempt_count, last_attempt_at, resolved_at, resolved_status)
  VALUES (
    NEW.property_id, NEW.agent_id, NEW.result, NEW.notes, next_attempt, NEW.attempted_at,
    CASE WHEN is_resolution THEN NEW.attempted_at ELSE NULL END,
    CASE WHEN is_resolution THEN NEW.result ELSE NULL END
  )
  ON CONFLICT (property_id) DO UPDATE SET
    agent_id = EXCLUDED.agent_id,
    current_status = EXCLUDED.current_status,
    reason = EXCLUDED.reason,
    attempt_count = next_attempt,
    last_attempt_at = EXCLUDED.last_attempt_at,
    resolved_at = CASE WHEN is_resolution THEN EXCLUDED.last_attempt_at ELSE NULL END,
    resolved_status = CASE WHEN is_resolution THEN EXCLUDED.current_status ELSE NULL END,
    updated_at = now();

  -- Update property.status when applicable
  IF NEW.result IN ('unoccupied','demolished','visited') THEN
    UPDATE public.properties SET status = NEW.result::text::property_status WHERE id = NEW.property_id;
  END IF;

  -- Audit log
  INSERT INTO public.audit_log(action, entity, actor_id, target_id, metadata)
  VALUES ('recovery_attempt', 'property', NEW.agent_id, NEW.property_id,
    jsonb_build_object('result', NEW.result, 'attempt_number', next_attempt, 'notes', NEW.notes));

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_on_recovery_attempt_insert ON public.property_recovery_attempts;
CREATE TRIGGER trg_on_recovery_attempt_insert
  AFTER INSERT ON public.property_recovery_attempts
  FOR EACH ROW EXECUTE FUNCTION public.on_recovery_attempt_insert();

-- ===== Trigger: when a visit is recorded, auto-create attempt =====
CREATE OR REPLACE FUNCTION public.on_visit_create_recovery_attempt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  mapped_result public.recovery_result;
BEGIN
  mapped_result := CASE NEW.status::text
    WHEN 'closed' THEN 'closed'::recovery_result
    WHEN 'refused' THEN 'refused'::recovery_result
    WHEN 'abandoned' THEN 'absent'::recovery_result
    WHEN 'visited' THEN 'visited'::recovery_result
    ELSE NULL
  END;

  IF mapped_result IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.property_recovery_attempts (property_id, visit_id, agent_id, result, notes, attempted_at)
  VALUES (NEW.property_id, NEW.id, NEW.agent_id, mapped_result, NEW.notes, NEW.visit_date);

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_on_visit_create_recovery_attempt ON public.visits;
CREATE TRIGGER trg_on_visit_create_recovery_attempt
  AFTER INSERT ON public.visits
  FOR EACH ROW EXECUTE FUNCTION public.on_visit_create_recovery_attempt();
