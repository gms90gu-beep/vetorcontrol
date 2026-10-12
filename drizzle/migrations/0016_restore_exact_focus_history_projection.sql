-- Restore the history projection exactly as specified by 20261012134017; no data writes.
CREATE OR REPLACE FUNCTION private.list_focus_samples_v2(p_cycle uuid,p_status text,p_offset integer,p_agent uuid,p_from date,p_to date,p_search text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active IS TRUE) THEN RAISE EXCEPTION 'Conta desativada ou acesso indisponível'; END IF;
 IF p_offset IS NULL OR p_offset<0 OR p_offset>100000 THEN RAISE EXCEPTION 'Página inválida'; END IF;
 IF p_status IS NOT NULL AND p_status NOT IN ('pending','positive','negative','inconclusive') THEN RAISE EXCEPTION 'Resultado inválido'; END IF;
 IF p_from>p_to OR length(coalesce(p_search,''))>200 THEN RAISE EXCEPTION 'Filtros inválidos'; END IF;
 WITH base AS MATERIALIZED (
   SELECT v.id, v.visit_date, jsonb_build_object(
     'id',v.id,'visit_date',v.visit_date,'agent_id',v.agent_id,'agent_name',a.full_name,
     'cycle_id',v.cycle_id,'cycle_name',c.name,'property_number',p.number,
     'street',p.street_name,'block_number',p.block_number,'tubes',v.tubitos_coletados,
     'version',v.focus_result_version,
     'status',coalesce(v.focus_analysis_status, CASE WHEN EXISTS (SELECT 1 FROM public.visit_deposits d WHERE d.visit_id=v.id AND d.is_positive) THEN 'positive' ELSE 'pending' END),
     'deposits',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'type_code',d.type_code,'quantity',d.quantity,'positive',d.is_positive) ORDER BY d.type_code) FROM public.visit_deposits d WHERE d.visit_id=v.id AND (d.focus_found IS TRUE OR (d.focus_found IS NULL AND d.is_positive))),'[]'::jsonb),
     'needs_focus_identification',NOT EXISTS(SELECT 1 FROM public.visit_deposits d WHERE d.visit_id=v.id AND (d.focus_found IS TRUE OR (d.focus_found IS NULL AND d.is_positive))),
     'inspected_deposits',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'type_code',d.type_code,'quantity',d.quantity) ORDER BY d.type_code) FROM public.visit_deposits d WHERE d.visit_id=v.id),'[]'::jsonb),
     'history',coalesce((SELECT jsonb_agg(jsonb_build_object('status',h.result_status,'analysis_date',h.analysis_date,'reference',h.laboratory_reference,'reason',h.reason,'actor',actor.full_name,'recorded_at',h.recorded_at,'positive_deposit_ids',h.positive_deposit_ids) ORDER BY h.version DESC) FROM public.focus_result_history h LEFT JOIN public.profiles actor ON actor.id=h.actor_id WHERE h.visit_id=v.id),'[]'::jsonb),
     'can_record',private.focus_access(v.agent_id,true),
     'can_correct',private.focus_access(v.agent_id,true) AND public.get_user_role(auth.uid()) IN ('coordenador','admin_master')
   ) row_data
   FROM public.visits v JOIN public.profiles a ON a.id=v.agent_id
   LEFT JOIN public.properties p ON p.id=v.property_id LEFT JOIN public.cycles c ON c.id=v.cycle_id
   WHERE (v.sample_collected = true OR v.has_focus = true) AND private.focus_access(v.agent_id,false)
     AND (p_cycle IS NULL OR v.cycle_id=p_cycle)
     AND (p_agent IS NULL OR v.agent_id=p_agent)
     AND (p_from IS NULL OR (v.visit_date AT TIME ZONE 'America/Sao_Paulo')::date >= p_from)
     AND (p_to IS NULL OR (v.visit_date AT TIME ZONE 'America/Sao_Paulo')::date <= p_to)
     AND (coalesce(trim(p_search),'')='' OR strpos(lower(concat_ws(' ',a.full_name,p.number,p.street_name,p.block_number)),lower(trim(p_search)))>0
       OR EXISTS (SELECT 1 FROM public.focus_result_history h WHERE h.visit_id=v.id AND strpos(lower(h.laboratory_reference),lower(trim(p_search)))>0))

 ), matching AS (SELECT * FROM base WHERE p_status IS NULL OR row_data->>'status'=p_status),
 page AS (SELECT * FROM matching ORDER BY visit_date DESC,id LIMIT 50 OFFSET p_offset)
 SELECT jsonb_build_object(
   'samples',coalesce((SELECT jsonb_agg(row_data ORDER BY visit_date DESC,id) FROM page),'[]'::jsonb),
   'total',(SELECT count(*) FROM matching),
   'counts',jsonb_build_object('pending',(SELECT count(*) FROM base WHERE row_data->>'status'='pending'),'positive',(SELECT count(*) FROM base WHERE row_data->>'status'='positive'),'negative',(SELECT count(*) FROM base WHERE row_data->>'status'='negative'),'inconclusive',(SELECT count(*) FROM base WHERE row_data->>'status'='inconclusive')),
   'agents',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'name',a.full_name) ORDER BY a.full_name,a.id) FROM public.profiles a WHERE EXISTS(SELECT 1 FROM public.visits v WHERE v.agent_id=a.id AND (v.sample_collected OR v.has_focus) AND private.focus_access(v.agent_id,false))),'[]'::jsonb)
 ) INTO result;
 RETURN result;
END;
$$;
NOTIFY pgrst,'reload schema';