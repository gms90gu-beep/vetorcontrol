
-- 1. TABLE
CREATE TABLE IF NOT EXISTS public.block_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.cycles(id) ON DELETE CASCADE,
  block_number text NOT NULL,
  agent_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'NOT_STARTED'
    CHECK (status IN ('NOT_STARTED','IN_PROGRESS','PAUSED','COMPLETED')),
  completion_percentage numeric(5,2) NOT NULL DEFAULT 0,
  total_properties integer NOT NULL DEFAULT 0,
  visited_properties integer NOT NULL DEFAULT 0,
  pending_properties integer NOT NULL DEFAULT 0,
  closed_properties integer NOT NULL DEFAULT 0,
  recovered_properties integer NOT NULL DEFAULT 0,
  positive_focus integer NOT NULL DEFAULT 0,
  negative_focus integer NOT NULL DEFAULT 0,
  tb_properties integer NOT NULL DEFAULT 0,
  pe_properties integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  last_visit_at timestamptz,
  last_operational_date date,
  last_sync timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT block_progress_unique UNIQUE (cycle_id, block_number, agent_id)
);

CREATE INDEX IF NOT EXISTS block_progress_agent_idx ON public.block_progress (agent_id);
CREATE INDEX IF NOT EXISTS block_progress_cycle_idx ON public.block_progress (cycle_id);
CREATE INDEX IF NOT EXISTS block_progress_status_idx ON public.block_progress (status);

-- 2. GRANTS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.block_progress TO authenticated;
GRANT ALL ON public.block_progress TO service_role;

-- 3. RLS
ALTER TABLE public.block_progress ENABLE ROW LEVEL SECURITY;

-- 4. POLICIES
CREATE POLICY "Agents manage own block progress"
  ON public.block_progress
  FOR ALL
  TO authenticated
  USING (agent_id = auth.uid())
  WITH CHECK (agent_id = auth.uid());

CREATE POLICY "Supervision reads all block progress"
  ON public.block_progress
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin_master'::app_role)
    OR public.has_role(auth.uid(), 'coordenador'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
  );

-- updated_at trigger
CREATE TRIGGER trg_block_progress_updated_at
  BEFORE UPDATE ON public.block_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. RECOMPUTE FUNCTION
CREATE OR REPLACE FUNCTION public.recompute_block_progress(
  _cycle_id uuid,
  _block_number text,
  _agent_id uuid
) RETURNS public.block_progress
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int := 0;
  v_visited int := 0;
  v_closed int := 0;
  v_refused int := 0;
  v_recovered int := 0;
  v_positive int := 0;
  v_pending int := 0;
  v_tb int := 0;
  v_pe int := 0;
  v_last_visit timestamptz;
  v_last_op_date date;
  v_started timestamptz;
  v_status text;
  v_pct numeric(5,2);
  v_row public.block_progress;
BEGIN
  IF _cycle_id IS NULL OR _block_number IS NULL OR _agent_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_total
    FROM public.properties p
   WHERE p.block_number = _block_number;

  SELECT
    count(DISTINCT v.property_id) FILTER (WHERE v.status::text = 'visited'),
    count(DISTINCT v.property_id) FILTER (WHERE v.status::text = 'closed'),
    count(DISTINCT v.property_id) FILTER (WHERE v.status::text = 'refused'),
    count(DISTINCT v.property_id) FILTER (WHERE v.is_recovery = true),
    count(DISTINCT v.property_id) FILTER (WHERE v.has_focus = true),
    max(v.visit_date),
    max(public.operational_date(v.visit_date)),
    min(v.visit_date)
  INTO v_visited, v_closed, v_refused, v_recovered, v_positive,
       v_last_visit, v_last_op_date, v_started
  FROM public.visits v
  JOIN public.properties p ON p.id = v.property_id
  WHERE p.block_number = _block_number
    AND v.agent_id = _agent_id
    AND v.cycle_id = _cycle_id;

  v_pending := GREATEST(0, v_total - (COALESCE(v_visited,0) + COALESCE(v_closed,0) + COALESCE(v_refused,0)));
  v_pct := CASE WHEN v_total > 0
    THEN ROUND(((COALESCE(v_visited,0)+COALESCE(v_closed,0)+COALESCE(v_refused,0))::numeric / v_total) * 100, 2)
    ELSE 0 END;

  v_status := CASE
    WHEN v_total > 0 AND v_pending = 0 THEN 'COMPLETED'
    WHEN v_last_visit IS NOT NULL THEN 'IN_PROGRESS'
    ELSE 'NOT_STARTED'
  END;

  INSERT INTO public.block_progress (
    cycle_id, block_number, agent_id, status, completion_percentage,
    total_properties, visited_properties, pending_properties, closed_properties,
    recovered_properties, positive_focus, negative_focus, tb_properties, pe_properties,
    started_at, completed_at, last_visit_at, last_operational_date, last_sync
  ) VALUES (
    _cycle_id, _block_number, _agent_id, v_status, v_pct,
    v_total, COALESCE(v_visited,0), v_pending, COALESCE(v_closed,0),
    COALESCE(v_recovered,0), COALESCE(v_positive,0), 0, 0, 0,
    v_started, CASE WHEN v_status='COMPLETED' THEN now() ELSE NULL END,
    v_last_visit, v_last_op_date, now()
  )
  ON CONFLICT (cycle_id, block_number, agent_id) DO UPDATE SET
    status = EXCLUDED.status,
    completion_percentage = EXCLUDED.completion_percentage,
    total_properties = EXCLUDED.total_properties,
    visited_properties = EXCLUDED.visited_properties,
    pending_properties = EXCLUDED.pending_properties,
    closed_properties = EXCLUDED.closed_properties,
    recovered_properties = EXCLUDED.recovered_properties,
    positive_focus = EXCLUDED.positive_focus,
    started_at = COALESCE(public.block_progress.started_at, EXCLUDED.started_at),
    completed_at = CASE WHEN EXCLUDED.status='COMPLETED'
                        THEN COALESCE(public.block_progress.completed_at, now())
                        ELSE NULL END,
    last_visit_at = EXCLUDED.last_visit_at,
    last_operational_date = EXCLUDED.last_operational_date,
    last_sync = now(),
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END $$;

GRANT EXECUTE ON FUNCTION public.recompute_block_progress(uuid, text, uuid) TO authenticated, service_role;

-- 6. TRIGGER ON visits
CREATE OR REPLACE FUNCTION public.trg_visits_recompute_block_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_block_number text;
  v_target_property uuid;
  v_agent uuid;
  v_cycle uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_target_property := OLD.property_id;
    v_agent := OLD.agent_id;
    v_cycle := OLD.cycle_id;
  ELSE
    v_target_property := NEW.property_id;
    v_agent := NEW.agent_id;
    v_cycle := NEW.cycle_id;
  END IF;

  IF v_target_property IS NULL OR v_agent IS NULL OR v_cycle IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT block_number INTO v_block_number FROM public.properties WHERE id = v_target_property;
  IF v_block_number IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM public.recompute_block_progress(v_cycle, v_block_number, v_agent);

  -- Handle agent/block change on UPDATE (recompute old key too)
  IF TG_OP = 'UPDATE' THEN
    IF OLD.agent_id IS DISTINCT FROM NEW.agent_id
       OR OLD.cycle_id IS DISTINCT FROM NEW.cycle_id
       OR OLD.property_id IS DISTINCT FROM NEW.property_id THEN
      DECLARE
        v_old_block text;
      BEGIN
        SELECT block_number INTO v_old_block FROM public.properties WHERE id = OLD.property_id;
        IF v_old_block IS NOT NULL AND OLD.agent_id IS NOT NULL AND OLD.cycle_id IS NOT NULL THEN
          PERFORM public.recompute_block_progress(OLD.cycle_id, v_old_block, OLD.agent_id);
        END IF;
      END;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_visits_block_progress ON public.visits;
CREATE TRIGGER trg_visits_block_progress
  AFTER INSERT OR UPDATE OR DELETE ON public.visits
  FOR EACH ROW EXECUTE FUNCTION public.trg_visits_recompute_block_progress();
