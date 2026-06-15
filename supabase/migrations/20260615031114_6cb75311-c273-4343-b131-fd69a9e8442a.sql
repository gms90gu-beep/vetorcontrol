
-- 1) Adicionar coluna locality em blocks (texto, normalizado em lower-trim por índice)
ALTER TABLE public.blocks ADD COLUMN IF NOT EXISTS locality text;

-- 2) Backfill: pega a localidade mais comum dos boletins por block_number
UPDATE public.blocks b
SET locality = sub.locality
FROM (
  SELECT DISTINCT ON (block_number) block_number, COALESCE(NULLIF(trim(locality),''), 'sem-localidade') AS locality
  FROM public.boletins_rg
  WHERE block_number IS NOT NULL
  ORDER BY block_number, created_at DESC
) sub
WHERE b.number = sub.block_number AND b.locality IS NULL;

UPDATE public.blocks SET locality = 'sem-localidade' WHERE locality IS NULL OR trim(locality) = '';

-- 3) Remover unicidade global e criar unicidade territorial (case-insensitive)
ALTER TABLE public.blocks DROP CONSTRAINT IF EXISTS blocks_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS blocks_locality_number_uidx
  ON public.blocks (lower(trim(coalesce(locality,'sem-localidade'))), number);

-- 4) Trigger sync_property_block: usa locality do boletim ao criar blocks
CREATE OR REPLACE FUNCTION public.sync_property_block()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
    v_block_id   uuid;
    v_subarea_id uuid;
    v_locality   text;
BEGIN
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    IF NEW.block_number IS NOT NULL THEN
      SELECT id INTO v_subarea_id FROM public.subareas LIMIT 1;

      IF NEW.boletim_id IS NOT NULL THEN
        SELECT COALESCE(NULLIF(trim(locality),''), 'sem-localidade')
          INTO v_locality FROM public.boletins_rg WHERE id = NEW.boletim_id;
      END IF;
      v_locality := COALESCE(v_locality, 'sem-localidade');

      -- procura bloco existente nesta localidade + número
      SELECT id INTO v_block_id
      FROM public.blocks
      WHERE lower(trim(coalesce(locality,'sem-localidade'))) = lower(trim(v_locality))
        AND number = NEW.block_number
      LIMIT 1;

      IF v_block_id IS NULL THEN
        INSERT INTO public.blocks (number, total_properties, status, subarea_id, locality)
        VALUES (NEW.block_number, 0, 'not_started'::public.block_status, v_subarea_id, v_locality)
        RETURNING id INTO v_block_id;
      END IF;

      NEW.block_id := v_block_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 5) Validações scopadas por localidade (em vez de globais por número)
CREATE OR REPLACE FUNCTION public.validate_boletim_agent_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  caller_role text;
  foreign_count integer;
  v_locality text := COALESCE(NULLIF(trim(NEW.locality),''),'sem-localidade');
BEGIN
  caller_role := public.get_user_role(auth.uid());
  IF caller_role IN ('admin_master','coordenador','supervisor') THEN
    RETURN NEW;
  END IF;

  IF NEW.block_number IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO foreign_count
  FROM public.boletins_rg b
  WHERE b.block_number = NEW.block_number
    AND lower(trim(coalesce(b.locality,'sem-localidade'))) = lower(trim(v_locality))
    AND b.agent_id IS NOT NULL
    AND b.agent_id <> NEW.agent_id
    AND b.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF foreign_count > 0 THEN
    RAISE EXCEPTION 'Quarteirão % na localidade % já está vinculado a outro agente.', NEW.block_number, v_locality
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_property_block_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  caller_role text;
  new_agent uuid;
  v_locality text;
  foreign_count integer;
BEGIN
  caller_role := public.get_user_role(auth.uid());
  IF caller_role IN ('admin_master','coordenador','supervisor') THEN
    RETURN NEW;
  END IF;

  IF NEW.boletim_id IS NULL OR NEW.block_number IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT agent_id, COALESCE(NULLIF(trim(locality),''),'sem-localidade')
    INTO new_agent, v_locality
    FROM public.boletins_rg WHERE id = NEW.boletim_id;

  SELECT count(*) INTO foreign_count
  FROM public.properties p
  JOIN public.boletins_rg b ON b.id = p.boletim_id
  WHERE p.block_number = NEW.block_number
    AND lower(trim(coalesce(b.locality,'sem-localidade'))) = lower(trim(v_locality))
    AND p.id <> NEW.id
    AND b.agent_id IS NOT NULL
    AND b.agent_id <> new_agent;

  IF foreign_count > 0 THEN
    RAISE EXCEPTION 'Imóvel pertence a quarteirão % de outro agente na localidade %.', NEW.block_number, v_locality
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

-- 6) check_and_delete_empty_block: deleta apenas o bloco da localidade certa
CREATE OR REPLACE FUNCTION public.check_and_delete_empty_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    prop_count integer;
BEGIN
    SELECT count(*) INTO prop_count FROM public.properties WHERE block_id = OLD.block_id;
    IF prop_count = 0 AND OLD.block_id IS NOT NULL THEN
        DELETE FROM public.blocks WHERE id = OLD.block_id;
    END IF;
    RETURN OLD;
END;
$function$;
