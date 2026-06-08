-- Ajusta on_visit_create_recovery_attempt para só registrar tentativa de
-- recuperação quando já existe pendência para o imóvel. Visitas normais
-- (primeira passagem) não devem gerar status "Recuperado".
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

  -- Verifica se o imóvel já possui pendência (ativa ou histórica)
  SELECT EXISTS (
    SELECT 1 FROM public.property_pendencies
    WHERE property_id = NEW.property_id
  ) INTO has_pendency;

  -- Regra: só gera tentativa de recuperação se já houve pendência registrada.
  -- Casos:
  --  1) Resultado "visited" sem pendência prévia => visita normal, não é recuperação.
  --  2) Resultados negativos (closed/refused/absent) sem pendência prévia
  --     ainda devem abrir a pendência inicial — permitimos passar.
  IF mapped_result = 'visited' AND NOT has_pendency THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.property_recovery_attempts (property_id, visit_id, agent_id, result, notes, attempted_at)
  VALUES (NEW.property_id, NEW.id, NEW.agent_id, mapped_result, NEW.notes, NEW.visit_date);

  RETURN NEW;
END $function$;