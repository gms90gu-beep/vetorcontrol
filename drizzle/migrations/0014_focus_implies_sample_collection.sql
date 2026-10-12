-- Focus found implies collection; function-only compatibility for existing visits, no backfill.
-- Requires both focus sample migrations from 20261011 and 20261012.
CREATE OR REPLACE FUNCTION private.mark_focus_collection() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.has_focus IS TRUE AND coalesce(NEW.focus_result_version,0)=0 THEN NEW.sample_collected := true; END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.mark_focus_collection() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER a_mark_focus_collection BEFORE INSERT OR UPDATE ON public.visits
FOR EACH ROW EXECUTE FUNCTION private.mark_focus_collection();
CREATE OR REPLACE FUNCTION private.list_focus_samples(p_cycle uuid, p_status text, p_offset integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
 IF p_offset < 0 OR p_offset > 100000 THEN RAISE EXCEPTION 'Página inválida'; END IF;
 SELECT coalesce(jsonb_agg(row_data ORDER BY visit_date DESC, id), '[]'::jsonb) INTO result FROM (
   SELECT v.id, v.visit_date, jsonb_build_object(
     'id',v.id,'visit_date',v.visit_date,'agent_id',v.agent_id,'agent_name',a.full_name,
     'cycle_id',v.cycle_id,'cycle_name',c.name,'property_number',p.number,
     'street',p.street_name,'block_number',p.block_number,'tubes',v.tubitos_coletados,
     'version',v.focus_result_version,
     'status',coalesce(v.focus_analysis_status, CASE WHEN EXISTS (SELECT 1 FROM public.visit_deposits d WHERE d.visit_id=v.id AND d.is_positive) THEN 'positive' ELSE 'pending' END),
     'deposits',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'type_code',d.type_code,'quantity',d.quantity,'positive',d.is_positive) ORDER BY d.type_code) FROM public.visit_deposits d WHERE d.visit_id=v.id),'[]'::jsonb),
     'history',coalesce((SELECT jsonb_agg(jsonb_build_object('status',h.result_status,'analysis_date',h.analysis_date,'reference',h.laboratory_reference,'reason',h.reason,'actor',actor.full_name,'recorded_at',h.recorded_at) ORDER BY h.version DESC) FROM public.focus_result_history h LEFT JOIN public.profiles actor ON actor.id=h.actor_id WHERE h.visit_id=v.id),'[]'::jsonb),
     'can_record',private.focus_access(v.agent_id,true),
     'can_correct',private.focus_access(v.agent_id,true) AND public.get_user_role(auth.uid()) IN ('coordenador','admin_master')
   ) row_data
   FROM public.visits v JOIN public.profiles a ON a.id=v.agent_id
   LEFT JOIN public.properties p ON p.id=v.property_id LEFT JOIN public.cycles c ON c.id=v.cycle_id
   WHERE (v.sample_collected = true OR v.has_focus = true) AND private.focus_access(v.agent_id,false)
     AND (p_cycle IS NULL OR v.cycle_id=p_cycle)
     AND (p_status IS NULL OR coalesce(v.focus_analysis_status, CASE WHEN EXISTS (SELECT 1 FROM public.visit_deposits d WHERE d.visit_id=v.id AND d.is_positive) THEN 'positive' ELSE 'pending' END)=p_status)
   ORDER BY v.visit_date DESC,v.id LIMIT 50 OFFSET p_offset
 ) samples;
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION private.list_focus_samples(uuid,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.list_focus_samples(uuid,text,integer) TO authenticated;
CREATE OR REPLACE FUNCTION public.list_focus_samples(p_cycle uuid DEFAULT NULL,p_status text DEFAULT NULL,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$ SELECT private.list_focus_samples(p_cycle,p_status,p_offset); $$;
REVOKE ALL ON FUNCTION public.list_focus_samples(uuid,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_focus_samples(uuid,text,integer) TO authenticated;

CREATE OR REPLACE FUNCTION private.record_focus_result(p_visit uuid,p_status text,p_positive uuid[],p_reference text,p_analysis_date date,p_reason text,p_version integer,p_request uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v public.visits%ROWTYPE; old_status text; role_name text; next_version integer; old_request public.focus_result_history%ROWTYPE;
BEGIN
 SELECT * INTO v FROM public.visits WHERE id=p_visit FOR UPDATE;
 IF NOT FOUND OR NOT private.focus_access(v.agent_id,true) THEN RAISE EXCEPTION 'Coleta fora da sua equipe ou acesso somente para consulta'; END IF;
 SELECT * INTO old_request FROM public.focus_result_history WHERE request_id=p_request;
 IF FOUND THEN
   IF old_request.visit_id <> p_visit OR old_request.actor_id <> auth.uid() THEN RAISE EXCEPTION 'Solicitação inválida'; END IF;
   RETURN old_request.version;
 END IF;
 IF NOT (coalesce(v.sample_collected,false) OR coalesce(v.has_focus,false)) THEN RAISE EXCEPTION 'Visita sem coleta registrada'; END IF;
 IF p_status IS NULL OR p_status NOT IN ('positive','negative','inconclusive') THEN RAISE EXCEPTION 'Resultado inválido'; END IF;
 IF p_version IS DISTINCT FROM v.focus_result_version THEN RAISE EXCEPTION 'Resultado atualizado por outra pessoa. Atualize a lista'; END IF;
 IF p_analysis_date IS NULL OR p_analysis_date < (v.visit_date AT TIME ZONE 'America/Sao_Paulo')::date OR p_analysis_date > (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN RAISE EXCEPTION 'Data da análise inválida'; END IF;
 IF length(trim(coalesce(p_reference,''))) < 2 OR length(p_reference)>200 OR length(coalesce(p_reason,''))>2000 THEN RAISE EXCEPTION 'Informe a referência do laboratório'; END IF;
 old_status := coalesce(v.focus_analysis_status, CASE WHEN EXISTS(SELECT 1 FROM public.visit_deposits d WHERE d.visit_id=p_visit AND d.is_positive) THEN 'positive' ELSE 'pending' END);
 role_name := public.get_user_role(auth.uid());
 IF old_status <> 'pending' THEN
   IF role_name NOT IN ('coordenador','admin_master') THEN RAISE EXCEPTION 'Correção de resultado requer coordenador ou administrador'; END IF;
   IF length(trim(coalesce(p_reason,''))) < 5 THEN RAISE EXCEPTION 'Informe a justificativa da correção'; END IF;
 END IF;
 p_positive := coalesce(p_positive,'{}'::uuid[]);
 IF p_status='positive' AND cardinality(p_positive)=0 THEN RAISE EXCEPTION 'Selecione os depósitos positivos'; END IF;
 IF p_status <> 'positive' AND cardinality(p_positive)>0 THEN RAISE EXCEPTION 'Resultado não positivo não admite depósitos positivos'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_positive) x WHERE NOT EXISTS(SELECT 1 FROM public.visit_deposits d WHERE d.id=x AND d.visit_id=p_visit)) THEN RAISE EXCEPTION 'Depósito não pertence à coleta'; END IF;
 next_version := v.focus_result_version+1;
 UPDATE public.visit_deposits SET is_positive=(id=ANY(p_positive)) WHERE visit_id=p_visit;
 UPDATE public.visits SET sample_collected=true,has_focus=CASE WHEN p_status='positive' THEN true ELSE has_focus END,focus_analysis_status=p_status,focus_result_version=next_version WHERE id=p_visit;
 INSERT INTO public.focus_result_history(request_id,visit_id,actor_id,previous_status,result_status,positive_deposit_ids,laboratory_reference,analysis_date,reason,version)
 VALUES(p_request,p_visit,auth.uid(),old_status,p_status,p_positive,trim(p_reference),p_analysis_date,trim(coalesce(p_reason,'')),next_version);
 -- Refresh only confirmed-focus indicators of existing daily records; never create a new work day.
 UPDATE public.daily_work_records r SET
   samples_collected=(SELECT count(*) FROM public.visits x WHERE x.agent_id=v.agent_id AND x.cycle_id IS NOT DISTINCT FROM v.cycle_id AND (x.visit_date AT TIME ZONE 'America/Sao_Paulo')::date=r.work_date AND (x.sample_collected OR x.has_focus)),
   properties_positive=(SELECT count(DISTINCT x.property_id) FROM public.visits x WHERE x.agent_id=v.agent_id AND x.cycle_id IS NOT DISTINCT FROM v.cycle_id AND (x.visit_date AT TIME ZONE 'America/Sao_Paulo')::date=r.work_date AND EXISTS(SELECT 1 FROM public.visit_deposits d WHERE d.visit_id=x.id AND d.is_positive)),
   positive_foci=(SELECT count(*) FROM public.visits x WHERE x.agent_id=v.agent_id AND x.cycle_id IS NOT DISTINCT FROM v.cycle_id AND (x.visit_date AT TIME ZONE 'America/Sao_Paulo')::date=r.work_date AND EXISTS(SELECT 1 FROM public.visit_deposits d WHERE d.visit_id=x.id AND d.is_positive)),
   foci_by_type=coalesce((SELECT jsonb_object_agg(code,qty) FROM (SELECT lower(d.type_code) code,sum(d.quantity) qty FROM public.visits x JOIN public.visit_deposits d ON d.visit_id=x.id WHERE x.agent_id=v.agent_id AND x.cycle_id IS NOT DISTINCT FROM v.cycle_id AND (x.visit_date AT TIME ZONE 'America/Sao_Paulo')::date=r.work_date AND d.is_positive GROUP BY lower(d.type_code)) totals),'{}'::jsonb)
 WHERE r.agent_id=v.agent_id AND r.cycle_id IS NOT DISTINCT FROM v.cycle_id AND r.work_date=(v.visit_date AT TIME ZONE 'America/Sao_Paulo')::date;
 RETURN next_version;
END;
$$;
REVOKE ALL ON FUNCTION private.record_focus_result(uuid,text,uuid[],text,date,text,integer,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.record_focus_result(uuid,text,uuid[],text,date,text,integer,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.record_focus_result(p_visit uuid,p_status text,p_positive uuid[],p_reference text,p_analysis_date date,p_reason text,p_version integer,p_request uuid)
RETURNS integer LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT private.record_focus_result(p_visit,p_status,p_positive,p_reference,p_analysis_date,p_reason,p_version,p_request); $$;
REVOKE ALL ON FUNCTION public.record_focus_result(uuid,text,uuid[],text,date,text,integer,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_focus_result(uuid,text,uuid[],text,date,text,integer,uuid) TO authenticated;

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
     'deposits',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'type_code',d.type_code,'quantity',d.quantity,'positive',d.is_positive) ORDER BY d.type_code) FROM public.visit_deposits d WHERE d.visit_id=v.id),'[]'::jsonb),
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
REVOKE ALL ON FUNCTION private.list_focus_samples_v2(uuid,text,integer,uuid,date,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.list_focus_samples_v2(uuid,text,integer,uuid,date,date,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.list_focus_samples_v2(p_cycle uuid DEFAULT NULL,p_status text DEFAULT NULL,p_offset integer DEFAULT 0,p_agent uuid DEFAULT NULL,p_from date DEFAULT NULL,p_to date DEFAULT NULL,p_search text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT private.list_focus_samples_v2(p_cycle,p_status,p_offset,p_agent,p_from,p_to,p_search); $$;
REVOKE ALL ON FUNCTION public.list_focus_samples_v2(uuid,text,integer,uuid,date,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_focus_samples_v2(uuid,text,integer,uuid,date,date,text) TO authenticated;
NOTIFY pgrst,'reload schema';
