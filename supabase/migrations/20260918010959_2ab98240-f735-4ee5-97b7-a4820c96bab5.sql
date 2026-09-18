-- daily_work_records: supervisor escopo por equipe (can_supervise_user), nunca por role global
DROP POLICY IF EXISTS dwr_insert_self_or_admin ON public.daily_work_records;
CREATE POLICY dwr_insert_self_or_admin
  ON public.daily_work_records
  FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin_master'::app_role)
    OR (
      public.can_supervise_user(agent_id)
      AND (legacy_agent_id IS NULL OR public.can_supervise_user(legacy_agent_id))
    )
  );

DROP POLICY IF EXISTS dwr_update_self_or_admin ON public.daily_work_records;
CREATE POLICY dwr_update_self_or_admin
  ON public.daily_work_records
  FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin_master'::app_role)
    OR (
      public.can_supervise_user(agent_id)
      AND (legacy_agent_id IS NULL OR public.can_supervise_user(legacy_agent_id))
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin_master'::app_role)
    OR (
      public.can_supervise_user(agent_id)
      AND (legacy_agent_id IS NULL OR public.can_supervise_user(legacy_agent_id))
    )
  );

-- field_work_sessions: dono + gestor com escopo de equipe/área
DROP POLICY IF EXISTS "Users can view their own field work sessions" ON public.field_work_sessions;
CREATE POLICY "Users and supervisors can view field work sessions"
  ON public.field_work_sessions
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.can_supervise_user(user_id)
    OR has_role(auth.uid(), 'admin_master'::app_role)
  );

DROP POLICY IF EXISTS "Users can create their own field work sessions" ON public.field_work_sessions;
CREATE POLICY "Users and supervisors can create field work sessions"
  ON public.field_work_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    OR public.can_supervise_user(user_id)
    OR has_role(auth.uid(), 'admin_master'::app_role)
  );

DROP POLICY IF EXISTS "Users can update their own field work sessions" ON public.field_work_sessions;
CREATE POLICY "Users and supervisors can update field work sessions"
  ON public.field_work_sessions
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.can_supervise_user(user_id)
    OR has_role(auth.uid(), 'admin_master'::app_role)
  )
  WITH CHECK (
    auth.uid() = user_id
    OR public.can_supervise_user(user_id)
    OR has_role(auth.uid(), 'admin_master'::app_role)
  );