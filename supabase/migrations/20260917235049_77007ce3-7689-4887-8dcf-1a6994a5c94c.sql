-- Triggers internos precisam continuar atualizando blocks mesmo com política restrita
CREATE OR REPLACE FUNCTION public.check_block_completion(p_block_id uuid, p_cycle_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_total_properties INTEGER;
    v_visited_properties INTEGER;
    v_new_status public.block_status;
BEGIN
    SELECT count(*) INTO v_total_properties FROM public.properties WHERE block_id = p_block_id;
    SELECT count(DISTINCT property_id) INTO v_visited_properties
    FROM public.visits
    WHERE cycle_id = p_cycle_id
    AND property_id IN (SELECT id FROM public.properties WHERE block_id = p_block_id);

    IF v_total_properties > 0 AND v_visited_properties >= v_total_properties THEN
        v_new_status := 'completed'::public.block_status;
    ELSIF v_visited_properties > 0 THEN
        v_new_status := 'in_progress'::public.block_status;
    ELSE
        v_new_status := 'not_started'::public.block_status;
    END IF;

    UPDATE public.blocks SET status = v_new_status WHERE id = p_block_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.on_visit_upsert_update_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_block_id UUID;
BEGIN
    SELECT block_id INTO v_block_id FROM public.properties WHERE id = NEW.property_id;
    IF v_block_id IS NOT NULL AND NEW.cycle_id IS NOT NULL THEN
        PERFORM public.check_block_completion(v_block_id, NEW.cycle_id);
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_block_property_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        IF NEW.block_id IS NOT NULL THEN
            UPDATE public.blocks
            SET total_properties = (SELECT COUNT(*) FROM public.properties WHERE block_id = NEW.block_id)
            WHERE id = NEW.block_id;
        END IF;
    END IF;

    IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
        IF OLD.block_id IS NOT NULL THEN
            UPDATE public.blocks
            SET total_properties = (SELECT COUNT(*) FROM public.properties WHERE block_id = OLD.block_id)
            WHERE id = OLD.block_id;
        END IF;
    END IF;

    RETURN NULL;
END;
$function$;

-- Helper: perfil ativo (agente ou gestor)
CREATE OR REPLACE FUNCTION public.has_active_profile(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _user_id AND COALESCE(p.is_active, true)
  )
$$;
REVOKE EXECUTE ON FUNCTION public.has_active_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_profile(uuid) TO authenticated, service_role;

-- Ações operacionais do agente sobre o quarteirão (validadas no servidor)
CREATE OR REPLACE FUNCTION public.set_block_current_street(_block_id uuid, _street text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_active_profile(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  UPDATE public.blocks
  SET current_street = _street,
      current_street_confirmed_at = now(),
      current_street_confirmed_by = auth.uid()
  WHERE id = _block_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_block_current_street(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_block_current_street(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_block_status(_block_id uuid, _status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_active_profile(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF _status NOT IN ('not_started', 'in_progress', 'completed') THEN
    RAISE EXCEPTION 'Status inválido: %', _status;
  END IF;
  UPDATE public.blocks SET status = _status::public.block_status WHERE id = _block_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_block_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_block_status(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_block_location(
  _block_id uuid,
  _address text,
  _neighborhood text,
  _city text,
  _latitude double precision,
  _longitude double precision,
  _location_source text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_active_profile(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF _location_source IS NOT NULL AND _location_source NOT IN ('gps', 'manual') THEN
    RAISE EXCEPTION 'Origem de localização inválida';
  END IF;
  UPDATE public.blocks
  SET address = _address,
      neighborhood = _neighborhood,
      city = _city,
      latitude = _latitude,
      longitude = _longitude,
      location_source = _location_source
  WHERE id = _block_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_block_location(uuid, text, text, text, double precision, double precision, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_block_location(uuid, text, text, text, double precision, double precision, text) TO authenticated, service_role;

-- Política de UPDATE agora exclusiva de gestores
DROP POLICY IF EXISTS blocks_update ON public.blocks;
CREATE POLICY blocks_update
  ON public.blocks
  FOR UPDATE
  TO authenticated
  USING (public.is_territory_manager(auth.uid()))
  WITH CHECK (public.is_territory_manager(auth.uid()));