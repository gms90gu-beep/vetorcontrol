ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS field_work_session_id uuid REFERENCES public.field_work_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS block_id uuid REFERENCES public.blocks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_visits_field_work_session_id ON public.visits(field_work_session_id);
CREATE INDEX IF NOT EXISTS idx_visits_block_id ON public.visits(block_id);

ALTER TABLE public.visits DISABLE TRIGGER USER;

UPDATE public.visits v
   SET block_id = p.block_id
  FROM public.properties p
 WHERE v.property_id = p.id
   AND v.block_id IS NULL
   AND p.block_id IS NOT NULL;

-- Match each visit to the most recent session (same agent + block) created on/before the visit
WITH matches AS (
  SELECT DISTINCT ON (v.id) v.id AS visit_id, s.id AS session_id
    FROM public.visits v
    JOIN public.properties p ON p.id = v.property_id
    JOIN public.field_work_sessions s
      ON s.user_id = v.agent_id
     AND s.block_number = p.block_number
     AND s.created_at <= v.visit_date + interval '12 hours'
   WHERE v.field_work_session_id IS NULL
   ORDER BY v.id, s.created_at DESC
)
UPDATE public.visits v
   SET field_work_session_id = m.session_id
  FROM matches m
 WHERE v.id = m.visit_id;

ALTER TABLE public.visits ENABLE TRIGGER USER;

CREATE TABLE IF NOT EXISTS public.visits_backfill_report (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL,
  agent_id uuid,
  property_id uuid,
  block_id uuid,
  cycle_id uuid,
  visit_date timestamptz,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.visits_backfill_report TO authenticated;
GRANT ALL ON public.visits_backfill_report TO service_role;
ALTER TABLE public.visits_backfill_report ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read backfill report" ON public.visits_backfill_report;
CREATE POLICY "Admins read backfill report"
  ON public.visits_backfill_report FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin_master'::app_role));

TRUNCATE public.visits_backfill_report;
INSERT INTO public.visits_backfill_report (visit_id, agent_id, property_id, block_id, cycle_id, visit_date, reason)
SELECT v.id, v.agent_id, v.property_id, v.block_id, v.cycle_id, v.visit_date,
       CASE
         WHEN v.block_id IS NULL THEN 'missing_block_id'
         WHEN v.cycle_id IS NULL THEN 'missing_cycle_id'
         ELSE 'no_matching_session'
       END
  FROM public.visits v
 WHERE v.field_work_session_id IS NULL;

CREATE OR REPLACE FUNCTION public.visits_auto_link_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_block_id uuid;
  v_session record;
BEGIN
  IF NEW.block_id IS NULL AND NEW.property_id IS NOT NULL THEN
    SELECT block_id INTO v_block_id FROM public.properties WHERE id = NEW.property_id;
    NEW.block_id := v_block_id;
  END IF;

  IF NEW.field_work_session_id IS NULL AND NEW.agent_id IS NOT NULL AND NEW.property_id IS NOT NULL THEN
    SELECT s.id, s.cycle_id
      INTO v_session
      FROM public.field_work_sessions s
      JOIN public.properties p ON p.block_number = s.block_number
     WHERE s.user_id = NEW.agent_id
       AND p.id = NEW.property_id
       AND s.status = 'in_progress'
     ORDER BY s.created_at DESC
     LIMIT 1;

    IF FOUND THEN
      NEW.field_work_session_id := v_session.id;
      IF NEW.cycle_id IS NULL THEN
        NEW.cycle_id := v_session.cycle_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_visits_auto_link_session ON public.visits;
CREATE TRIGGER trg_visits_auto_link_session
  BEFORE INSERT OR UPDATE ON public.visits
  FOR EACH ROW EXECUTE FUNCTION public.visits_auto_link_session();
