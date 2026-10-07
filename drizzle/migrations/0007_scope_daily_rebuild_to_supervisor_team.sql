DO $migration$
DECLARE
  definition text;
BEGIN
  SELECT pg_get_functiondef('public.rebuild_daily_work_records(date,date,uuid)'::regprocedure) INTO definition;
  IF position('[DWR_TEAM_AUTH]' in definition) = 0 THEN
    definition := replace(definition, 'BEGIN
  RAISE NOTICE', 'BEGIN
  -- [DWR_TEAM_AUTH] Validate authenticated callers; internal trigger calls retain their existing behavior.
  IF auth.uid() IS NOT NULL AND coalesce(auth.role(), '''') <> ''service_role'' THEN
    IF public.get_user_role(auth.uid()) NOT IN (''agente'', ''agent'', ''supervisor'', ''coordenador'', ''admin_master'') OR public.get_user_role(auth.uid()) IS NULL THEN
      RAISE EXCEPTION ''Forbidden'' USING ERRCODE = ''42501'';
    END IF;
    IF public.get_user_role(auth.uid()) IN (''agente'', ''agent'') AND (_agent IS NULL OR _agent <> auth.uid()) THEN
      RAISE EXCEPTION ''Agente só pode reconstruir os próprios relatórios'' USING ERRCODE = ''42501'';
    END IF;
    IF public.get_user_role(auth.uid()) = ''supervisor'' AND _agent IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _agent AND p.supervisor_id = auth.uid()) THEN
      RAISE EXCEPTION ''Agente não vinculado à própria equipe'' USING ERRCODE = ''42501'';
    END IF;
  END IF;
  RAISE NOTICE');
    definition := replace(definition, 'AND (_agent IS NULL OR v.agent_id = _agent)', 'AND (_agent IS NULL OR v.agent_id = _agent)
      AND (auth.uid() IS NULL OR coalesce(auth.role(), '''') = ''service_role'' OR public.get_user_role(auth.uid()) IN (''coordenador'', ''admin_master'') OR (public.get_user_role(auth.uid()) IN (''agente'', ''agent'') AND v.agent_id = auth.uid()) OR (public.get_user_role(auth.uid()) = ''supervisor'' AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v.agent_id AND p.supervisor_id = auth.uid())))');
    IF position('[DWR_TEAM_AUTH]' in definition) = 0 THEN RAISE EXCEPTION 'Rebuild function layout changed; migration halted'; END IF;
    EXECUTE definition;
  END IF;
END
$migration$;
REVOKE EXECUTE ON FUNCTION public.rebuild_daily_work_records(date,date,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rebuild_daily_work_records(date,date,uuid) TO authenticated, service_role;