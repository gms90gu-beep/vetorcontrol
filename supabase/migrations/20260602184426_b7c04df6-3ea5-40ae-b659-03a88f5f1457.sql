
-- 1. Add supervisor_id to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS supervisor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_supervisor_id ON public.profiles(supervisor_id);

-- 2. Security-definer helper: can the current user view/manage target_user_id?
CREATE OR REPLACE FUNCTION public.can_supervise_user(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() = target_user_id
    OR public.get_user_role(auth.uid()) IN ('admin_master', 'coordenador')
    OR (
      public.get_user_role(auth.uid()) = 'supervisor'
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = target_user_id AND p.supervisor_id = auth.uid()
      )
    );
$$;

-- 3. Profiles: replace broad "managers can view all" with scoped policy
DROP POLICY IF EXISTS "Managers can view team profiles" ON public.profiles;
CREATE POLICY "Users and supervisors can view team profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.can_supervise_user(id));

-- 4. Agents: scope by supervisor relationship
DROP POLICY IF EXISTS "Agents can view own profile or managers view agents" ON public.agents;
CREATE POLICY "Agents and supervisors can view linked agents"
  ON public.agents FOR SELECT TO authenticated
  USING (public.can_supervise_user(profile_id));

DROP POLICY IF EXISTS "Agents can update own profile or managers update agents" ON public.agents;
CREATE POLICY "Agents and supervisors can update linked agents"
  ON public.agents FOR UPDATE TO authenticated
  USING (public.can_supervise_user(profile_id))
  WITH CHECK (public.can_supervise_user(profile_id));

-- 5. Visits: scope by supervisor relationship to the agent
DROP POLICY IF EXISTS "Visits visible by owner or managers" ON public.visits;
CREATE POLICY "Visits visible by owner or linked supervisors"
  ON public.visits FOR SELECT TO authenticated
  USING (public.can_supervise_user(agent_id));

DROP POLICY IF EXISTS "Visits updateable by owner or managers" ON public.visits;
CREATE POLICY "Visits updateable by owner or linked supervisors"
  ON public.visits FOR UPDATE TO authenticated
  USING (public.can_supervise_user(agent_id))
  WITH CHECK (public.can_supervise_user(agent_id));

-- 6. Daily work records: scope through agents.profile_id
DROP POLICY IF EXISTS "Daily records visible by owner or managers" ON public.daily_work_records;
CREATE POLICY "Daily records visible by owner or linked supervisors"
  ON public.daily_work_records FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.id = daily_work_records.agent_id
        AND public.can_supervise_user(a.profile_id)
    )
  );

-- 7. user_roles: keep admin_master full + supervisors can see roles of their team
DROP POLICY IF EXISTS "Managers can view roles" ON public.user_roles;
CREATE POLICY "Supervisors can view linked roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (public.can_supervise_user(user_id));
