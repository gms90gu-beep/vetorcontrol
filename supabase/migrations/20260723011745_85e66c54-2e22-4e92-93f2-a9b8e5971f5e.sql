CREATE OR REPLACE FUNCTION public.recompute_block_progress(_cycle_id uuid, _block_number text, _agent_id uuid)
 RETURNS block_progress
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total int := 0;
  v_visited int := 0;
  v_closed int := 0;
  v_refused int := 0;
  v_recovered int := 0;
  v_positive int := 0;
  v_pending int := 0;
  v_last_visit timestamptz;
  v_last_op_date date;
  v_started timestamptz;
  v_status text;
  v_pct numeric(5,2);
  v_row public.block_progress;
  v_block_ids uuid[];
BEGIN
  IF _cycle_id IS NULL OR _block_number IS NULL OR _agent_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Resolve possible block UUIDs matching the number (properties may reference block_id only)
  SELECT array_agg(id) INTO v_block_ids
    FROM public.blocks WHERE number::text = _block_number;

  SELECT count(*) INTO v_total
    FROM public.properties p
   WHERE p.block_number = _block_number
      OR (v_block_ids IS NOT NULL AND p.block_id = ANY(v_block_ids));

  SELECT
    count(DISTINCT v.property_id) FILTER (WHERE v.status::text = 'visited'),
    count(DISTINCT v.property_id) FILTER (WHERE v.status::text = 'closed'),
    count(DISTINCT v.property_id) FILTER (WHERE v.status::text = 'refused'),
    count(DISTINCT v.property_id) FILTER (WHERE v.is_recovered = true),
    count(DISTINCT v.property_id) FILTER (WHERE v.has_focus = true),
    max(v.visit_date),
    max(public.operational_date(v.visit_date)),
    min(v.visit_date)
  INTO v_visited, v_closed, v_refused, v_recovered, v_positive,
       v_last_visit, v_last_op_date, v_started
  FROM public.visits v
  JOIN public.properties p ON p.id = v.property_id
  WHERE (p.block_number = _block_number
         OR (v_block_ids IS NOT NULL AND p.block_id = ANY(v_block_ids)))
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
END $function$;