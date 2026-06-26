
CREATE OR REPLACE FUNCTION public.reconcile_rg_integrity()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_blocks_linked int := 0;
  v_blocks_created int := 0;
  v_properties_linked int := 0;
  v_orphans_removed int := 0;
  v_subarea uuid;
  r record;
  v_block_id uuid;
  v_loc text;
BEGIN
  SELECT id INTO v_subarea FROM public.subareas LIMIT 1;

  FOR r IN
    SELECT id, block_number, locality, agent_id
      FROM public.boletins_rg
     WHERE block_id IS NULL AND block_number IS NOT NULL
  LOOP
    v_loc := COALESCE(NULLIF(trim(r.locality), ''), 'sem-localidade');

    SELECT id INTO v_block_id
      FROM public.blocks
     WHERE lower(trim(COALESCE(locality, 'sem-localidade'))) = lower(v_loc)
       AND number = r.block_number
     LIMIT 1;

    IF v_block_id IS NULL THEN
      INSERT INTO public.blocks (number, total_properties, status, subarea_id, locality)
      VALUES (r.block_number, 0, 'not_started'::public.block_status, v_subarea, v_loc)
      RETURNING id INTO v_block_id;
      v_blocks_created := v_blocks_created + 1;
    END IF;

    UPDATE public.boletins_rg SET block_id = v_block_id WHERE id = r.id;
    v_blocks_linked := v_blocks_linked + 1;
  END LOOP;

  WITH cand AS (
    SELECT p.id AS prop_id, b.id AS boletim_id
      FROM public.properties p
      JOIN public.boletins_rg b ON b.block_id = p.block_id
     WHERE p.boletim_id IS NULL
       AND p.block_id IS NOT NULL
       AND (b.agent_id IS NULL OR p.user_id IS NULL OR b.agent_id = p.user_id)
  ),
  uniq AS (
    SELECT prop_id, (array_agg(boletim_id))[1] AS boletim_id
      FROM cand
     GROUP BY prop_id
    HAVING count(DISTINCT boletim_id) = 1
  )
  UPDATE public.properties p
     SET boletim_id = u.boletim_id
    FROM uniq u
   WHERE p.id = u.prop_id;
  GET DIAGNOSTICS v_properties_linked = ROW_COUNT;

  WITH del AS (
    DELETE FROM public.blocks b
     WHERE NOT EXISTS (SELECT 1 FROM public.boletins_rg br WHERE br.block_id = b.id)
       AND NOT EXISTS (SELECT 1 FROM public.properties pr WHERE pr.block_id = b.id)
       AND COALESCE(b.total_properties, 0) = 0
    RETURNING 1
  )
  SELECT count(*) INTO v_orphans_removed FROM del;

  INSERT INTO public.audit_log(action, entity, actor_id, metadata)
  VALUES ('reconcile_rg_integrity', 'system', auth.uid(),
          jsonb_build_object(
            'blocks_linked', v_blocks_linked,
            'blocks_created', v_blocks_created,
            'properties_linked', v_properties_linked,
            'orphans_removed', v_orphans_removed
          ));

  RETURN jsonb_build_object(
    'blocks_linked', v_blocks_linked,
    'blocks_created', v_blocks_created,
    'properties_linked', v_properties_linked,
    'orphans_removed', v_orphans_removed
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_rg_integrity() TO authenticated, service_role;

SELECT public.reconcile_rg_integrity();

ALTER TABLE public.boletins_rg ALTER COLUMN block_id SET NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_property_boletim_block_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bol_block uuid;
BEGIN
  IF NEW.boletim_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT block_id INTO v_bol_block FROM public.boletins_rg WHERE id = NEW.boletim_id;
  IF v_bol_block IS NULL THEN RETURN NEW; END IF;
  IF NEW.block_id IS NULL THEN
    NEW.block_id := v_bol_block;
  ELSIF NEW.block_id <> v_bol_block THEN
    RAISE EXCEPTION 'Imóvel % vinculado ao boletim % com block_id divergente (% != %).',
      NEW.id, NEW.boletim_id, NEW.block_id, v_bol_block
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_property_boletim_block_match ON public.properties;
CREATE TRIGGER trg_validate_property_boletim_block_match
  BEFORE INSERT OR UPDATE OF boletim_id, block_id ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.validate_property_boletim_block_match();

CREATE OR REPLACE FUNCTION public.rg_integrity_check()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bol_no_block jsonb;
  v_prop_no_bol jsonb;
  v_prop_block_mismatch jsonb;
  v_dup_blocks jsonb;
  v_count_divergence jsonb;
  v_ok boolean;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'block_number', block_number, 'locality', locality)), '[]'::jsonb)
    INTO v_bol_no_block
    FROM public.boletins_rg WHERE block_id IS NULL;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'block_id', block_id, 'block_number', block_number)), '[]'::jsonb)
    INTO v_prop_no_bol
    FROM public.properties WHERE boletim_id IS NULL;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('property_id', p.id, 'boletim_id', p.boletim_id, 'prop_block_id', p.block_id, 'boletim_block_id', b.block_id)), '[]'::jsonb)
    INTO v_prop_block_mismatch
    FROM public.properties p
    JOIN public.boletins_rg b ON b.id = p.boletim_id
   WHERE p.block_id IS DISTINCT FROM b.block_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('number', number, 'locality', locality, 'count', cnt)), '[]'::jsonb)
    INTO v_dup_blocks
    FROM (
      SELECT number, COALESCE(locality, 'sem-localidade') AS locality, count(*) AS cnt
        FROM public.blocks
       GROUP BY number, COALESCE(locality, 'sem-localidade')
      HAVING count(*) > 1
    ) d;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'boletim_id', b.id, 'block_number', b.block_number,
           'card_count', (SELECT count(*) FROM public.properties pp WHERE pp.boletim_id = b.id),
           'detail_count', (SELECT count(*) FROM public.properties pd WHERE pd.boletim_id = b.id)
         )), '[]'::jsonb)
    INTO v_count_divergence
    FROM public.boletins_rg b
   WHERE (SELECT count(*) FROM public.properties pp WHERE pp.boletim_id = b.id)
      <> (SELECT count(*) FROM public.properties pd WHERE pd.boletim_id = b.id);

  v_ok := jsonb_array_length(v_bol_no_block) = 0
      AND jsonb_array_length(v_prop_block_mismatch) = 0
      AND jsonb_array_length(v_dup_blocks) = 0
      AND jsonb_array_length(v_count_divergence) = 0;

  RETURN jsonb_build_object(
    'status', CASE WHEN v_ok THEN 'OK' ELSE 'FAIL' END,
    'boletins_sem_block', v_bol_no_block,
    'properties_sem_boletim', v_prop_no_bol,
    'properties_block_divergente', v_prop_block_mismatch,
    'blocks_duplicados', v_dup_blocks,
    'divergencia_card_detalhe', v_count_divergence
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rg_integrity_check() TO authenticated, service_role;
