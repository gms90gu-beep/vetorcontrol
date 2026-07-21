-- Corrige duas inconsistencias em recompute_block_progress():
--
-- 1) Contagem duplicada em revisitas com desfecho diferente.
--    A versao anterior fazia count(DISTINCT property_id) FILTER (status = X)
--    separadamente para 'visited'/'closed'/'refused'. Se o mesmo imovel tiver
--    mais de uma visita (ex.: 1a tentativa "refused", depois revisitado e
--    marcado "visited"), ele e contado nos DOIS grupos ao mesmo tempo,
--    inflando visitados+fechados+recusas acima do total real de imoveis
--    distintos trabalhados. Como pending = GREATEST(0, total - soma), isso
--    podia fazer um quarteirao aparecer com 0 pendencias (CONCLUIDO) mesmo
--    com imoveis de verdade ainda nao visitados.
--    Fix: considerar so a ULTIMA visita por imovel (mesma regra ja usada no
--    cliente em operational-block-status.ts).
--
-- 2) Status 'abandoned' nunca contava como concluido - nem aqui nem no
--    cliente. E um 4o desfecho valido e selecionavel na tela de visita,
--    tratado como "trabalhado" em outros pontos do app (workedStatuses em
--    property-composition.ts). Fix: contar 'abandoned' junto de
--    visited/closed/refused como "feito".
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
  v_abandoned int := 0;
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

  -- Ultima visita por imovel (evita dupla contagem em revisitas com
  -- desfecho diferente - mesma regra do cliente em operational-block-status.ts).
  WITH last_visit AS (
    SELECT DISTINCT ON (v.property_id)
      v.property_id, v.status, v.is_recovery, v.has_focus, v.visit_date
    FROM public.visits v
    JOIN public.properties p ON p.id = v.property_id
    WHERE p.block_number = _block_number
      AND v.agent_id = _agent_id
      AND v.cycle_id = _cycle_id
    ORDER BY v.property_id, v.visit_date DESC, v.id DESC
  )
  SELECT
    count(*) FILTER (WHERE status::text = 'visited'),
    count(*) FILTER (WHERE status::text = 'closed'),
    count(*) FILTER (WHERE status::text = 'refused'),
    count(*) FILTER (WHERE status::text = 'abandoned'),
    count(*) FILTER (WHERE is_recovery = true),
    count(*) FILTER (WHERE has_focus = true),
    max(visit_date),
    max(public.operational_date(visit_date)),
    min(visit_date)
  INTO v_visited, v_closed, v_refused, v_abandoned, v_recovered, v_positive,
       v_last_visit, v_last_op_date, v_started
  FROM last_visit;

  v_pending := GREATEST(0, v_total - (COALESCE(v_visited,0) + COALESCE(v_closed,0) + COALESCE(v_refused,0) + COALESCE(v_abandoned,0)));
  v_pct := CASE WHEN v_total > 0
    THEN ROUND(((COALESCE(v_visited,0)+COALESCE(v_closed,0)+COALESCE(v_refused,0)+COALESCE(v_abandoned,0))::numeric / v_total) * 100, 2)
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

-- Re-executa para todo agente/quarteirao/ciclo com visitas registradas, para
-- corrigir imediatamente qualquer block_progress ja inflado pelo bug acima.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT v.cycle_id, p.block_number, v.agent_id
    FROM public.visits v
    JOIN public.properties p ON p.id = v.property_id
    WHERE v.cycle_id IS NOT NULL AND p.block_number IS NOT NULL AND v.agent_id IS NOT NULL
  LOOP
    PERFORM public.recompute_block_progress(r.cycle_id, r.block_number, r.agent_id);
  END LOOP;
END $$;
