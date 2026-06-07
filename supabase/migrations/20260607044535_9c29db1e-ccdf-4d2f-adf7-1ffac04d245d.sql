
-- Validação: impedir que um agente abra sessão de campo (field_work_sessions)
-- em quarteirão cujos imóveis pertencem a boletins RG de outro agente.
-- Supervisores/coordenadores/admin_master continuam liberados.

CREATE OR REPLACE FUNCTION public.validate_field_work_session_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text;
  foreign_count integer;
BEGIN
  -- Bypass para perfis elevados
  caller_role := public.get_user_role(auth.uid());
  IF caller_role IN ('admin_master','coordenador','supervisor') THEN
    RETURN NEW;
  END IF;

  -- Conta imóveis do quarteirão vinculados a boletins de OUTROS agentes
  SELECT count(*) INTO foreign_count
  FROM public.properties p
  JOIN public.boletins_rg b ON b.id = p.boletim_id
  WHERE p.block_number = NEW.block_number
    AND b.agent_id IS NOT NULL
    AND b.agent_id <> NEW.user_id;

  IF foreign_count > 0 THEN
    RAISE EXCEPTION 'Quarteirão % pertence a outro agente e não pode ser associado.', NEW.block_number
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_field_work_session_block ON public.field_work_sessions;
CREATE TRIGGER trg_validate_field_work_session_block
BEFORE INSERT OR UPDATE OF block_number, user_id
ON public.field_work_sessions
FOR EACH ROW
EXECUTE FUNCTION public.validate_field_work_session_block();


-- Validação: ao criar/atualizar um boletim_rg, se o quarteirão já tem
-- imóveis vinculados a boletim de outro agente, bloquear (apenas agentes).
CREATE OR REPLACE FUNCTION public.validate_boletim_agent_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text;
  foreign_count integer;
BEGIN
  caller_role := public.get_user_role(auth.uid());
  IF caller_role IN ('admin_master','coordenador','supervisor') THEN
    RETURN NEW;
  END IF;

  IF NEW.block_number IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO foreign_count
  FROM public.properties p
  JOIN public.boletins_rg b ON b.id = p.boletim_id
  WHERE p.block_number = NEW.block_number
    AND b.agent_id IS NOT NULL
    AND b.agent_id <> NEW.agent_id;

  IF foreign_count > 0 THEN
    RAISE EXCEPTION 'Quarteirão % já está vinculado a outro agente.', NEW.block_number
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_boletim_agent_block ON public.boletins_rg;
CREATE TRIGGER trg_validate_boletim_agent_block
BEFORE INSERT OR UPDATE OF block_number, agent_id
ON public.boletins_rg
FOR EACH ROW
EXECUTE FUNCTION public.validate_boletim_agent_block();


-- Validação: ao vincular um imóvel (properties.boletim_id) garantir que
-- o boletim alvo pertença ao mesmo agente dono dos demais imóveis do quarteirão.
CREATE OR REPLACE FUNCTION public.validate_property_block_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text;
  new_agent uuid;
  foreign_count integer;
BEGIN
  caller_role := public.get_user_role(auth.uid());
  IF caller_role IN ('admin_master','coordenador','supervisor') THEN
    RETURN NEW;
  END IF;

  IF NEW.boletim_id IS NULL OR NEW.block_number IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT agent_id INTO new_agent FROM public.boletins_rg WHERE id = NEW.boletim_id;

  SELECT count(*) INTO foreign_count
  FROM public.properties p
  JOIN public.boletins_rg b ON b.id = p.boletim_id
  WHERE p.block_number = NEW.block_number
    AND p.id <> NEW.id
    AND b.agent_id IS NOT NULL
    AND b.agent_id <> new_agent;

  IF foreign_count > 0 THEN
    RAISE EXCEPTION 'Imóvel pertence a quarteirão de outro agente (%).', NEW.block_number
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_property_block_ownership ON public.properties;
CREATE TRIGGER trg_validate_property_block_ownership
BEFORE INSERT OR UPDATE OF boletim_id, block_number
ON public.properties
FOR EACH ROW
EXECUTE FUNCTION public.validate_property_block_ownership();
