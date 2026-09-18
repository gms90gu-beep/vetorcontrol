CREATE OR REPLACE FUNCTION public.dwr_write_allowed(_agent_id uuid, _legacy_agent_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    public.has_role(auth.uid(), 'admin_master')
    OR (
      public.can_supervise_user(_agent_id)
      AND (
        _legacy_agent_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.agents a
          WHERE a.id = _legacy_agent_id
            AND (a.profile_id = _agent_id OR a.profile_id IS NULL)
        )
        OR public.can_supervise_user(_legacy_agent_id)
      )
    );
$$;

REVOKE ALL ON FUNCTION public.dwr_write_allowed(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dwr_write_allowed(uuid, uuid) TO authenticated, service_role;

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