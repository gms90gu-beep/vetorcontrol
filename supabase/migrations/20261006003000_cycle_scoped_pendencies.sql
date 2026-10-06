-- Pendências devem pertencer ao ciclo operacional em que foram geradas.
-- A alteração é aditiva: não remove registros e preserva pendências legadas
-- que não possam ser vinculadas automaticamente a uma visita.

ALTER TABLE public.property_pendencies
  ADD COLUMN IF NOT EXISTS cycle_id uuid,
  ADD COLUMN IF NOT EXISTS week_id uuid;

ALTER TABLE public.property_recovery_attempts
  ADD COLUMN IF NOT EXISTS cycle_id uuid,
  ADD COLUMN IF NOT EXISTS week_id uuid;

-- Primeiro recupera o contexto diretamente da visita que originou a tentativa.
UPDATE public.property_recovery_attempts pra
SET cycle_id = COALESCE(pra.cycle_id, v.cycle_id),
    week_id = COALESCE(pra.week_id, v.week_id)
FROM public.visits v
WHERE pra.visit_id = v.id
  AND (pra.cycle_id IS NULL OR pra.week_id IS NULL);

-- Depois vincula a pendência ao contexto da tentativa mais recente do imóvel.
WITH latest_attempt AS (
  SELECT DISTINCT ON (property_id)
    property_id, cycle_id, week_id
  FROM public.property_recovery_attempts
  WHERE cycle_id IS NOT NULL
  ORDER BY property_id, attempted_at DESC, created_at DESC
)
UPDATE public.property_pendencies p
SET cycle_id = latest_attempt.cycle_id,
    week_id = COALESCE(p.week_id, latest_attempt.week_id)
FROM latest_attempt
WHERE p.property_id = latest_attempt.property_id
  AND p.cycle_id IS NULL;

-- Último fallback para pendências antigas que não têm tentativa vinculada.
WITH latest_visit AS (
  SELECT DISTINCT ON (property_id)
    property_id, cycle_id, week_id
  FROM public.visits
  WHERE property_id IS NOT NULL
    AND cycle_id IS NOT NULL
  ORDER BY property_id, visit_date DESC, id DESC
)
UPDATE public.property_pendencies p
SET cycle_id = latest_visit.cycle_id,
    week_id = COALESCE(p.week_id, latest_visit.week_id)
FROM latest_visit
WHERE p.property_id = latest_visit.property_id
  AND p.cycle_id IS NULL;

-- A regra antiga property_id UNIQUE impedia a mesma casa de voltar a gerar
-- pendência em outro ciclo. Mantemos as linhas legadas, mas a nova unicidade
-- passa a ser imóvel+ciclo. Linhas sem ciclo continuam aceitas para auditoria.
ALTER TABLE public.property_pendencies
  DROP CONSTRAINT IF EXISTS property_pendencies_property_id_key;

DROP INDEX IF EXISTS public.property_pendencies_property_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS property_pendencies_property_cycle_key
  ON public.property_pendencies (property_id, cycle_id)
  WHERE cycle_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pp_agent_cycle_open
  ON public.property_pendencies (agent_id, cycle_id, last_attempt_at DESC)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pp_cycle_week
  ON public.property_pendencies (cycle_id, week_id, current_status);

CREATE INDEX IF NOT EXISTS idx_pra_property_cycle
  ON public.property_recovery_attempts (property_id, cycle_id, attempted_at DESC);

-- Tentativas feitas a partir de uma visita seguem o ciclo da visita. A criação
-- automática só ocorre quando a jornada já foi pausada/encerrada; assim uma
-- visita reparada pela fila offline não perde a pendência, sem criar uma antes
-- do encerramento real da jornada.
CREATE OR REPLACE FUNCTION public.on_visit_create_recovery_attempt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  mapped_result public.recovery_result;
  has_pendency boolean;
  session_is_closed boolean := false;
BEGIN
  mapped_result := CASE NEW.status::text
    WHEN 'closed' THEN 'closed'::recovery_result
    WHEN 'refused' THEN 'refused'::recovery_result
    WHEN 'abandoned' THEN 'absent'::recovery_result
    WHEN 'visited' THEN 'visited'::recovery_result
    ELSE NULL
  END;

  IF mapped_result IS NULL OR NEW.property_id IS NULL THEN RETURN NEW; END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.property_pendencies p
    WHERE p.property_id = NEW.property_id
      AND (
        p.cycle_id = NEW.cycle_id
        OR (p.cycle_id IS NULL AND NEW.cycle_id IS NULL)
      )
  ) INTO has_pendency;

  SELECT COALESCE(f.status::text IN ('paused', 'completed', 'closed'), false)
  INTO session_is_closed
  FROM public.field_work_sessions f
  WHERE f.id = NEW.field_work_session_id;

  -- Uma visita normal/positiva nunca cria pendência por si só. Ela só gera
  -- tentativa de recuperação quando já havia uma pendência aberta.
  IF NOT has_pendency AND (NOT session_is_closed OR mapped_result = 'visited') THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.property_recovery_attempts
    (property_id, visit_id, agent_id, cycle_id, week_id, result, notes, attempted_at)
  VALUES
    (NEW.property_id, NEW.id, NEW.agent_id, NEW.cycle_id, NEW.week_id,
     mapped_result, NEW.notes, NEW.visit_date);

  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_on_visit_create_recovery_attempt ON public.visits;
CREATE TRIGGER trg_on_visit_create_recovery_attempt
  AFTER INSERT ON public.visits
  FOR EACH ROW EXECUTE FUNCTION public.on_visit_create_recovery_attempt();

CREATE OR REPLACE FUNCTION public.on_recovery_attempt_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  is_resolution boolean;
  next_attempt integer;
BEGIN
  is_resolution := NEW.result IN ('visited', 'unoccupied', 'demolished');

  SELECT COALESCE(MAX(attempt_number), 0) + 1
  INTO next_attempt
  FROM public.property_recovery_attempts
  WHERE property_id = NEW.property_id
    AND id <> NEW.id
    AND (
      cycle_id = NEW.cycle_id
      OR (cycle_id IS NULL AND NEW.cycle_id IS NULL)
    );

  UPDATE public.property_recovery_attempts
  SET attempt_number = next_attempt
  WHERE id = NEW.id;

  INSERT INTO public.property_pendencies
    (property_id, cycle_id, week_id, agent_id, current_status, reason,
     attempt_count, last_attempt_at, resolved_at, resolved_status)
  VALUES (
    NEW.property_id, NEW.cycle_id, NEW.week_id, NEW.agent_id, NEW.result,
    NEW.notes, next_attempt, NEW.attempted_at,
    CASE WHEN is_resolution THEN NEW.attempted_at ELSE NULL END,
    CASE WHEN is_resolution THEN NEW.result ELSE NULL END
  )
  ON CONFLICT (property_id, cycle_id) WHERE cycle_id IS NOT NULL DO UPDATE SET
    agent_id = EXCLUDED.agent_id,
    week_id = COALESCE(EXCLUDED.week_id, public.property_pendencies.week_id),
    current_status = EXCLUDED.current_status,
    reason = EXCLUDED.reason,
    attempt_count = EXCLUDED.attempt_count,
    last_attempt_at = EXCLUDED.last_attempt_at,
    resolved_at = CASE WHEN is_resolution THEN EXCLUDED.last_attempt_at ELSE NULL END,
    resolved_status = CASE WHEN is_resolution THEN EXCLUDED.current_status ELSE NULL END,
    updated_at = now();

  IF NEW.result IN ('unoccupied', 'demolished', 'visited') THEN
    UPDATE public.properties
    SET status = NEW.result::text::property_status
    WHERE id = NEW.property_id;
  END IF;

  INSERT INTO public.audit_log(action, entity, actor_id, target_id, metadata)
  VALUES (
    'recovery_attempt', 'property', NEW.agent_id, NEW.property_id,
    jsonb_build_object(
      'result', NEW.result,
      'attempt_number', next_attempt,
      'cycle_id', NEW.cycle_id,
      'week_id', NEW.week_id,
      'notes', NEW.notes
    )
  );

  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_on_recovery_attempt_insert ON public.property_recovery_attempts;
CREATE TRIGGER trg_on_recovery_attempt_insert
  AFTER INSERT ON public.property_recovery_attempts
  FOR EACH ROW EXECUTE FUNCTION public.on_recovery_attempt_insert();

CREATE OR REPLACE FUNCTION public.finalize_shift_pendencies(
  p_agent_id uuid,
  p_cycle_id uuid,
  p_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_created integer := 0;
  v_recovered integer := 0;
  v_closed integer := 0;
  v_refused integer := 0;
  r record;
  v_last_status text;
  v_last_visit_id uuid;
  v_last_notes text;
  v_week_id uuid;
  v_mapped public.recovery_result;
BEGIN
  FOR r IN
    SELECT DISTINCT property_id
    FROM public.visits
    WHERE agent_id = p_agent_id
      AND cycle_id = p_cycle_id
      AND public.operational_date(visit_date) = p_date
      AND property_id IS NOT NULL
  LOOP
    SELECT v.status::text, v.id, v.notes, v.week_id
    INTO v_last_status, v_last_visit_id, v_last_notes, v_week_id
    FROM public.visits v
    WHERE v.property_id = r.property_id
      AND v.agent_id = p_agent_id
      AND v.cycle_id = p_cycle_id
      AND public.operational_date(v.visit_date) = p_date
    ORDER BY v.visit_date DESC
    LIMIT 1;

    IF v_last_status = 'visited' THEN
      IF EXISTS (
        SELECT 1 FROM public.visits v2
        WHERE v2.property_id = r.property_id
          AND v2.agent_id = p_agent_id
          AND v2.cycle_id = p_cycle_id
          AND public.operational_date(v2.visit_date) = p_date
          AND v2.status::text IN ('closed', 'refused', 'abandoned')
      ) THEN
        v_recovered := v_recovered + 1;
      END IF;
      CONTINUE;
    END IF;

    v_mapped := CASE v_last_status
      WHEN 'closed' THEN 'closed'::public.recovery_result
      WHEN 'refused' THEN 'refused'::public.recovery_result
      WHEN 'abandoned' THEN 'absent'::public.recovery_result
      ELSE NULL
    END;

    IF v_mapped IS NULL THEN CONTINUE; END IF;

    IF EXISTS (
      SELECT 1 FROM public.property_pendencies p
      WHERE p.property_id = r.property_id
        AND p.cycle_id = p_cycle_id
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.property_recovery_attempts
      (property_id, visit_id, agent_id, cycle_id, week_id, result, notes, attempted_at)
    VALUES
      (r.property_id, v_last_visit_id, p_agent_id, p_cycle_id, v_week_id,
       v_mapped, v_last_notes, now());

    v_created := v_created + 1;
    IF v_last_status = 'closed' THEN v_closed := v_closed + 1;
    ELSIF v_last_status = 'refused' THEN v_refused := v_refused + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'pendencies_created', v_created,
    'recovered_in_day', v_recovered,
    'closed_pendencies', v_closed,
    'refused_pendencies', v_refused,
    'cycle_id', p_cycle_id,
    'operational_date', p_date
  );
END $function$;

GRANT EXECUTE ON FUNCTION public.finalize_shift_pendencies(uuid, uuid, date)
  TO authenticated, service_role;
