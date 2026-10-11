-- Additive only: no reconstruction, backfill or changes to existing results.
CREATE SCHEMA IF NOT EXISTS private;
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS focus_analysis_status text;
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS focus_result_version integer NOT NULL DEFAULT 0;

CREATE TABLE public.focus_result_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE,
  visit_id uuid NOT NULL REFERENCES public.visits(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES public.profiles(id),
  previous_status text,
  result_status text NOT NULL CHECK (result_status IN ('positive','negative','inconclusive')),
  positive_deposit_ids uuid[] NOT NULL DEFAULT '{}',
  laboratory_reference text NOT NULL,
  analysis_date date NOT NULL,
  reason text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL,
  UNIQUE (visit_id, version)
);
CREATE INDEX focus_result_history_visit_idx ON public.focus_result_history (visit_id, version DESC);
CREATE INDEX focus_collected_visits_idx ON public.visits (agent_id, cycle_id, visit_date DESC) WHERE sample_collected = true;
ALTER TABLE public.focus_result_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.focus_result_history FROM anon, authenticated;
GRANT SELECT ON public.focus_result_history TO authenticated;
GRANT ALL ON public.focus_result_history TO service_role;

-- Explicit, strict team/coordination scope; agent may read only their own samples.
CREATE OR REPLACE FUNCTION private.focus_access(p_agent uuid, p_write boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT auth.uid() IS NOT NULL AND (
   (NOT p_write AND auth.uid() = p_agent)
   OR public.get_user_role(auth.uid()) = 'admin_master'
   OR EXISTS (
     SELECT 1 FROM public.profiles a LEFT JOIN public.profiles s ON s.id = a.supervisor_id
     WHERE a.id = p_agent AND (
       (public.get_user_role(auth.uid()) = 'supervisor' AND a.supervisor_id = auth.uid())
       OR (public.get_user_role(auth.uid()) = 'coordenador' AND
           (a.coordinator_id = auth.uid() OR s.coordinator_id = auth.uid()))
     )
   )
 );
$$;
REVOKE ALL ON FUNCTION private.focus_access(uuid,boolean) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.focus_access(uuid,boolean) TO authenticated;
CREATE POLICY focus_history_scoped_read ON public.focus_result_history FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.visits v WHERE v.id = visit_id AND private.focus_access(v.agent_id,false)));

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
   WHERE v.sample_collected = true AND private.focus_access(v.agent_id,false)
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
 IF NOT coalesce(v.sample_collected,false) THEN RAISE EXCEPTION 'Visita sem coleta registrada'; END IF;
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
 UPDATE public.visits SET has_focus=CASE WHEN p_status='positive' THEN true ELSE has_focus END,focus_analysis_status=p_status,focus_result_version=next_version WHERE id=p_visit;
 INSERT INTO public.focus_result_history(request_id,visit_id,actor_id,previous_status,result_status,positive_deposit_ids,laboratory_reference,analysis_date,reason,version)
 VALUES(p_request,p_visit,auth.uid(),old_status,p_status,p_positive,trim(p_reference),p_analysis_date,trim(coalesce(p_reason,'')),next_version);
 -- Refresh only confirmed-focus indicators of existing daily records; never create a new work day.
 UPDATE public.daily_work_records r SET
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

-- Authenticated direct/offline writes cannot confirm or erase laboratory results.
CREATE OR REPLACE FUNCTION private.guard_focus_result() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE confirmed boolean;
BEGIN
 IF current_user NOT IN ('authenticated','anon') THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
 IF TG_TABLE_NAME='visits' THEN
   IF TG_OP='DELETE' THEN
     IF OLD.focus_result_version>0 THEN RAISE EXCEPTION 'Coleta com resultado confirmado não pode ser excluída'; END IF;
     RETURN OLD;
   END IF;
   IF TG_OP='INSERT' THEN
     IF coalesce(NEW.focus_result_version,0)<>0 OR NEW.focus_analysis_status IN ('positive','negative','inconclusive') THEN RAISE EXCEPTION 'Resultado deve ser lançado em Amostras e resultados'; END IF;
   ELSIF NEW.focus_result_version IS DISTINCT FROM OLD.focus_result_version OR NEW.focus_analysis_status IS DISTINCT FROM OLD.focus_analysis_status THEN
     RAISE EXCEPTION 'Resultado deve ser lançado em Amostras e resultados';
   END IF;
   IF TG_OP='UPDATE' AND OLD.focus_result_version>0 AND (NEW.agent_id IS DISTINCT FROM OLD.agent_id OR NEW.property_id IS DISTINCT FROM OLD.property_id OR NEW.visit_date IS DISTINCT FROM OLD.visit_date OR NEW.cycle_id IS DISTINCT FROM OLD.cycle_id OR NEW.sample_collected IS DISTINCT FROM OLD.sample_collected OR NEW.has_focus IS DISTINCT FROM OLD.has_focus) THEN RAISE EXCEPTION 'Coleta confirmada: vínculo e data protegidos'; END IF;
   RETURN NEW;
 END IF;
 SELECT bool_or(v.focus_result_version>0) INTO confirmed FROM public.visits v WHERE v.id=CASE WHEN TG_OP='DELETE' THEN OLD.visit_id ELSE NEW.visit_id END OR (TG_OP='UPDATE' AND v.id=OLD.visit_id);
 IF coalesce(confirmed,false) THEN
   IF TG_OP IN ('INSERT','DELETE') THEN RAISE EXCEPTION 'Depósitos de coleta confirmada estão protegidos'; END IF;
   IF NEW.is_positive IS DISTINCT FROM OLD.is_positive OR NEW.visit_id IS DISTINCT FROM OLD.visit_id OR NEW.type_code IS DISTINCT FROM OLD.type_code OR NEW.quantity IS DISTINCT FROM OLD.quantity THEN RAISE EXCEPTION 'Depósito confirmado: use Amostras e resultados'; END IF;
 ELSE
   IF (TG_OP='INSERT' AND coalesce(NEW.is_positive,false)) OR (TG_OP='UPDATE' AND NEW.is_positive IS DISTINCT FROM OLD.is_positive) THEN RAISE EXCEPTION 'Positividade deve ser confirmada em Amostras e resultados'; END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_focus_result() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_visit_focus_result BEFORE INSERT OR UPDATE OR DELETE ON public.visits FOR EACH ROW EXECUTE FUNCTION private.guard_focus_result();
CREATE TRIGGER guard_deposit_focus_result BEFORE INSERT OR UPDATE OR DELETE ON public.visit_deposits FOR EACH ROW EXECUTE FUNCTION private.guard_focus_result();
NOTIFY pgrst, 'reload schema';

-- A queued daily summary cannot overwrite confirmed indicators after a lab result.
CREATE OR REPLACE FUNCTION private.keep_confirmed_daily_focus() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM public.visits x WHERE x.agent_id=NEW.agent_id AND x.cycle_id IS NOT DISTINCT FROM NEW.cycle_id AND (x.visit_date AT TIME ZONE 'America/Sao_Paulo')::date=NEW.work_date AND x.focus_result_version>0) THEN
   SELECT count(DISTINCT x.property_id),count(*) INTO NEW.properties_positive,NEW.positive_foci
   FROM public.visits x WHERE x.agent_id=NEW.agent_id AND x.cycle_id IS NOT DISTINCT FROM NEW.cycle_id AND (x.visit_date AT TIME ZONE 'America/Sao_Paulo')::date=NEW.work_date
     AND EXISTS(SELECT 1 FROM public.visit_deposits d WHERE d.visit_id=x.id AND d.is_positive);
   SELECT coalesce(jsonb_object_agg(code,qty),'{}'::jsonb) INTO NEW.foci_by_type FROM (
     SELECT lower(d.type_code) code,sum(d.quantity) qty FROM public.visits x JOIN public.visit_deposits d ON d.visit_id=x.id
     WHERE x.agent_id=NEW.agent_id AND x.cycle_id IS NOT DISTINCT FROM NEW.cycle_id AND (x.visit_date AT TIME ZONE 'America/Sao_Paulo')::date=NEW.work_date AND d.is_positive GROUP BY lower(d.type_code)
   ) totals;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.keep_confirmed_daily_focus() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER keep_confirmed_daily_focus BEFORE INSERT OR UPDATE ON public.daily_work_records FOR EACH ROW EXECUTE FUNCTION private.keep_confirmed_daily_focus();
