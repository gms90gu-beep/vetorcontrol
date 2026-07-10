CREATE OR REPLACE FUNCTION public.check_block_completion(p_block_id uuid, p_cycle_id uuid)
RETURNS void
LANGUAGE plpgsql
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

    RAISE LOG '[BLOCK_STATUS_SENT] block=% cycle=% status=%', p_block_id, p_cycle_id, v_new_status;
    RAISE LOG '[BLOCK_STATUS_DATABASE] allowed=not_started,in_progress,completed';

    BEGIN
        UPDATE public.blocks SET status = v_new_status WHERE id = p_block_id;
    EXCEPTION WHEN OTHERS THEN
        RAISE LOG '[BLOCK_STATUS_ERROR] block=% attempted=% error=%', p_block_id, v_new_status, SQLERRM;
        RAISE;
    END;
END;
$function$;

-- Normaliza qualquer linha antiga eventualmente gravada como texto inválido (defensivo).
UPDATE public.blocks SET status = 'completed'::public.block_status
 WHERE status::text = 'finished';