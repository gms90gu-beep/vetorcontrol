
CREATE OR REPLACE FUNCTION public.get_operational_block_status(_block_id uuid, _work_date date)
RETURNS TABLE(
  block_id uuid,
  work_date date,
  total integer,
  visited integer,
  closed integer,
  refused integer,
  recovered integer,
  pending integer,
  status text,
  completion_percentage numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int := 0;
  v_visited int := 0;
  v_closed int := 0;
  v_refused int := 0;
  v_recovered int := 0;
  v_done int := 0;
  v_pending int := 0;
  v_status text;
  v_pct numeric(5,2);
BEGIN
  SELECT count(*) INTO v_total FROM public.properties WHERE properties.block_id = _block_id;

  SELECT
    count(DISTINCT v.property_id) FILTER (WHERE v.status::text = 'visited'),
    count(DISTINCT v.property_id) FILTER (WHERE v.status::text = 'closed'),
    count(DISTINCT v.property_id) FILTER (WHERE v.status::text = 'refused'),
    count(DISTINCT v.property_id) FILTER (WHERE v.is_recovery = true)
  INTO v_visited, v_closed, v_refused, v_recovered
  FROM public.visits v
  JOIN public.properties p ON p.id = v.property_id
  WHERE p.block_id = _block_id
    AND public.operational_date(v.visit_date) = _work_date;

  v_done := COALESCE(v_visited,0) + COALESCE(v_closed,0) + COALESCE(v_refused,0);
  v_pending := GREATEST(0, v_total - v_done);
  v_status := CASE
    WHEN v_total > 0 AND v_pending = 0 THEN 'CONCLUIDO'
    WHEN v_done > 0 THEN 'EM_ANDAMENTO'
    ELSE 'PENDENTE'
  END;
  v_pct := CASE WHEN v_total > 0 THEN ROUND((v_done::numeric / v_total) * 100, 2) ELSE 0 END;

  RETURN QUERY SELECT _block_id, _work_date, v_total, COALESCE(v_visited,0),
    COALESCE(v_closed,0), COALESCE(v_refused,0), COALESCE(v_recovered,0),
    v_pending, v_status, v_pct;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_operational_block_status(uuid, date) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
