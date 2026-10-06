-- Corrige a escrita de daily_work_records depois da migração dos IDs.
--
-- agent_id       = profiles.id (auth.uid())
-- legacy_agent_id = agents.id
--
-- A política anterior chamava can_supervise_user(legacy_agent_id), tratando
-- agents.id como se fosse profiles.id. Isso bloqueava o próprio agente e
-- deixava a diária offline presa na fila, embora a produção estivesse válida.

CREATE OR REPLACE FUNCTION public.dwr_write_allowed(
  target_profile_id uuid,
  target_agent_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(auth.uid(), 'admin_master'::app_role)
    OR target_profile_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.agents a
      WHERE a.id = target_agent_id
        AND a.profile_id = auth.uid()
    )
    OR (
      public.can_supervise_user(target_profile_id)
      AND (
        target_agent_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.agents a
          WHERE a.id = target_agent_id
            AND public.can_supervise_user(a.profile_id)
        )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.dwr_write_allowed(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dwr_write_allowed(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS dwr_insert_self_or_admin ON public.daily_work_records;
CREATE POLICY dwr_insert_self_or_admin
  ON public.daily_work_records
  FOR INSERT
  TO authenticated
  WITH CHECK (public.dwr_write_allowed(agent_id, legacy_agent_id));

DROP POLICY IF EXISTS dwr_update_self_or_admin ON public.daily_work_records;
CREATE POLICY dwr_update_self_or_admin
  ON public.daily_work_records
  FOR UPDATE
  TO authenticated
  USING (public.dwr_write_allowed(agent_id, legacy_agent_id))
  WITH CHECK (public.dwr_write_allowed(agent_id, legacy_agent_id));

COMMENT ON FUNCTION public.dwr_write_allowed(uuid, uuid) IS
  'Autoriza daily_work_records usando profiles.id e traduz legacy_agent_id para agents.profile_id.';

