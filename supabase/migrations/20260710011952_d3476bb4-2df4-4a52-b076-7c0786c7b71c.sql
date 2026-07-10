CREATE OR REPLACE FUNCTION public.get_session_visits(_agent_id uuid, _session_date date)
RETURNS SETOF public.visits
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT *
    FROM public.visits
   WHERE agent_id = _agent_id
     AND public.operational_date(visit_date) = _session_date;
$$;

REVOKE ALL ON FUNCTION public.get_session_visits(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_session_visits(uuid, date) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_session_visits(uuid, date) IS
'Retorna todas as visitas do agente cuja data operacional (America/Sao_Paulo) é igual à data da jornada. Fonte canônica usada por Tela de Trabalho, DWR, Boletim, Dashboard e Relatórios.';