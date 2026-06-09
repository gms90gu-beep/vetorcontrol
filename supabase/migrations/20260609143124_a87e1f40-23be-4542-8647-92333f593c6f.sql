
-- 1) Atualiza trigger para NÃO criar tentativas/pendências automaticamente
--    para visitas fechadas/recusadas/ausentes quando não há pendência prévia.
--    Tentativas só são registradas via trigger quando existe pendência aberta
--    (significa que o agente está fazendo uma tentativa de recuperação).
CREATE OR REPLACE FUNCTION public.on_visit_create_recovery_attempt()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  mapped_result public.recovery_result;
  has_pendency boolean;
BEGIN
  mapped_result := CASE NEW.status::text
    WHEN 'closed' THEN 'closed'::recovery_result
    WHEN 'refused' THEN 'refused'::recovery_result
    WHEN 'abandoned' THEN 'absent'::recovery_result
    WHEN 'visited' THEN 'visited'::recovery_result
    ELSE NULL
  END;

  IF mapped_result IS NULL THEN RETURN NEW; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.property_pendencies
    WHERE property_id = NEW.property_id
  ) INTO has_pendency;

  -- Nova regra: pendências só nascem ao encerrar o expediente (finalize_shift_pendencies).
  -- Trigger registra tentativa SOMENTE quando já existe pendência prévia (follow-up).
  IF NOT has_pendency THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.property_recovery_attempts (property_id, visit_id, agent_id, result, notes, attempted_at)
  VALUES (NEW.property_id, NEW.id, NEW.agent_id, mapped_result, NEW.notes, NEW.visit_date);

  RETURN NEW;
END $function$;

-- 2) Função para consolidar pendências no encerramento da jornada.
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
  v_mapped recovery_result;
BEGIN
  -- Para cada imóvel visitado pelo agente na data, pega o status da ÚLTIMA visita.
  FOR r IN
    SELECT DISTINCT property_id
    FROM public.visits
    WHERE agent_id = p_agent_id
      AND cycle_id = p_cycle_id
      AND visit_date::date = p_date
      AND property_id IS NOT NULL
  LOOP
    SELECT v.status::text, v.id, v.notes
      INTO v_last_status, v_last_visit_id, v_last_notes
    FROM public.visits v
    WHERE v.property_id = r.property_id
      AND v.agent_id = p_agent_id
      AND v.cycle_id = p_cycle_id
      AND v.visit_date::date = p_date
    ORDER BY v.visit_date DESC
    LIMIT 1;

    -- Se última visita do dia foi visited → recuperação no dia (não gera pendência).
    IF v_last_status = 'visited' THEN
      -- Considera recuperação se havia ocorrência anterior de fechado/recusado no mesmo dia
      IF EXISTS (
        SELECT 1 FROM public.visits v2
        WHERE v2.property_id = r.property_id
          AND v2.agent_id = p_agent_id
          AND v2.cycle_id = p_cycle_id
          AND v2.visit_date::date = p_date
          AND v2.status::text IN ('closed','refused')
      ) THEN
        v_recovered := v_recovered + 1;
      END IF;
      CONTINUE;
    END IF;

    -- Se última visita foi closed/refused/abandoned e ainda não existe pendência → cria.
    v_mapped := CASE v_last_status
      WHEN 'closed' THEN 'closed'::recovery_result
      WHEN 'refused' THEN 'refused'::recovery_result
      WHEN 'abandoned' THEN 'absent'::recovery_result
      ELSE NULL
    END;

    IF v_mapped IS NULL THEN CONTINUE; END IF;

    IF EXISTS (SELECT 1 FROM public.property_pendencies WHERE property_id = r.property_id) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.property_recovery_attempts
      (property_id, visit_id, agent_id, result, notes, attempted_at)
    VALUES
      (r.property_id, v_last_visit_id, p_agent_id, v_mapped, v_last_notes, now());

    v_created := v_created + 1;
    IF v_last_status = 'closed' THEN v_closed := v_closed + 1;
    ELSIF v_last_status = 'refused' THEN v_refused := v_refused + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'pendencies_created', v_created,
    'recovered_in_day', v_recovered,
    'closed_pendencies', v_closed,
    'refused_pendencies', v_refused
  );
END $function$;

GRANT EXECUTE ON FUNCTION public.finalize_shift_pendencies(uuid, uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_shift_pendencies(uuid, uuid, date) TO service_role;
