CREATE OR REPLACE FUNCTION public.sync_property_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_block_id uuid;
  v_subarea_id uuid;
  v_locality text;
BEGIN
  IF NEW.block_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.boletim_id IS NOT NULL THEN
    SELECT block_id INTO v_block_id
    FROM public.boletins_rg
    WHERE id = NEW.boletim_id;

    IF v_block_id IS NOT NULL THEN
      NEW.block_id := v_block_id;
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.block_number IS NOT NULL THEN
    SELECT id INTO v_subarea_id FROM public.subareas LIMIT 1;

    IF NEW.boletim_id IS NOT NULL THEN
      SELECT COALESCE(NULLIF(trim(locality), ''), 'sem-localidade')
        INTO v_locality
      FROM public.boletins_rg
      WHERE id = NEW.boletim_id;
    END IF;

    v_locality := COALESCE(v_locality, 'sem-localidade');

    SELECT id INTO v_block_id
    FROM public.blocks
    WHERE lower(trim(coalesce(locality, 'sem-localidade'))) = lower(trim(v_locality))
      AND number = NEW.block_number
    LIMIT 1;

    IF v_block_id IS NULL THEN
      INSERT INTO public.blocks (number, total_properties, status, subarea_id, locality)
      VALUES (NEW.block_number, 0, 'not_started'::public.block_status, v_subarea_id, v_locality)
      RETURNING id INTO v_block_id;
    END IF;

    NEW.block_id := v_block_id;
  END IF;

  RETURN NEW;
END;
$$;