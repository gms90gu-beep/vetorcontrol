-- Ensure all existing profile roles are represented in the authoritative user_roles table
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, p.role::text::public.app_role
FROM public.profiles p
WHERE p.role::text IN ('admin_master', 'coordenador', 'supervisor', 'agente')
ON CONFLICT (user_id, role) DO NOTHING;

-- Make role lookup deterministic and backed by the dedicated roles table
CREATE OR REPLACE FUNCTION public.get_user_role(u_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT ur.role::text
  FROM public.user_roles ur
  WHERE ur.user_id = u_id
  ORDER BY CASE ur.role::text
    WHEN 'admin_master' THEN 1
    WHEN 'coordenador' THEN 2
    WHEN 'supervisor' THEN 3
    WHEN 'agente' THEN 4
    WHEN 'admin' THEN 5
    WHEN 'agent' THEN 6
    ELSE 99
  END
  LIMIT 1;
$function$;

-- Tighten profile visibility and management around RBAC
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by authenticated" ON public.profiles;
DROP POLICY IF EXISTS "Role-based access for profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admin Master can manage all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admin master can manage all profiles" ON public.profiles;

CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Managers can view team profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.get_user_role(auth.uid()) IN ('supervisor', 'coordenador', 'admin_master'));

CREATE POLICY "Users can update own non-role profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()));

CREATE POLICY "Admin master can manage all profiles"
ON public.profiles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin_master'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin_master'::public.app_role));

-- Tighten role table access: users read their own role, managers read hierarchy, only admin_master changes roles
DROP POLICY IF EXISTS "Admin and coordinators can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Roles viewable by authenticated" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own role" ON public.user_roles;
DROP POLICY IF EXISTS "View roles based on hierarchy" ON public.user_roles;
DROP POLICY IF EXISTS "Supervisors can view all roles" ON public.user_roles;

CREATE POLICY "Users can view their own role"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Managers can view roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.get_user_role(auth.uid()) IN ('supervisor', 'coordenador', 'admin_master'));

CREATE POLICY "Admin master can manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin_master'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin_master'::public.app_role));

-- Allow supervisors/coordinators/admin_master to manage agent records, while agents manage only themselves
DROP POLICY IF EXISTS "Agents can view their own data" ON public.agents;
DROP POLICY IF EXISTS "Agents can update their own data" ON public.agents;

CREATE POLICY "Agents can view own profile or managers view agents"
ON public.agents
FOR SELECT
TO authenticated
USING (auth.uid() = profile_id OR public.get_user_role(auth.uid()) IN ('supervisor', 'coordenador', 'admin_master'));

CREATE POLICY "Agents can update own profile or managers update agents"
ON public.agents
FOR UPDATE
TO authenticated
USING (auth.uid() = profile_id OR public.get_user_role(auth.uid()) IN ('supervisor', 'coordenador', 'admin_master'))
WITH CHECK (auth.uid() = profile_id OR public.get_user_role(auth.uid()) IN ('supervisor', 'coordenador', 'admin_master'));

-- Replace broad operational visibility with role-aware access
DROP POLICY IF EXISTS "Visits viewable by authenticated" ON public.visits;
DROP POLICY IF EXISTS "Role-based access for visits" ON public.visits;

CREATE POLICY "Visits visible by owner or managers"
ON public.visits
FOR SELECT
TO authenticated
USING (auth.uid() = agent_id OR public.get_user_role(auth.uid()) IN ('supervisor', 'coordenador', 'admin_master'));

DROP POLICY IF EXISTS "Users can update their own visits" ON public.visits;
CREATE POLICY "Visits updateable by owner or managers"
ON public.visits
FOR UPDATE
TO authenticated
USING (auth.uid() = agent_id OR public.get_user_role(auth.uid()) IN ('supervisor', 'coordenador', 'admin_master'))
WITH CHECK (auth.uid() = agent_id OR public.get_user_role(auth.uid()) IN ('supervisor', 'coordenador', 'admin_master'));

-- Permit managers to see team daily records without exposing them to unauthenticated users
DROP POLICY IF EXISTS "Agents can view their own records" ON public.daily_work_records;
CREATE POLICY "Daily records visible by owner or managers"
ON public.daily_work_records
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.agents
    WHERE agents.id = daily_work_records.agent_id
      AND agents.profile_id = auth.uid()
  )
  OR public.get_user_role(auth.uid()) IN ('supervisor', 'coordenador', 'admin_master')
);

-- Territorial management is reserved to supervisors/coordinators/admin_master
DROP POLICY IF EXISTS "Authenticated users can delete blocks" ON public.blocks;
DROP POLICY IF EXISTS "Authenticated users can insert blocks" ON public.blocks;
DROP POLICY IF EXISTS "Authenticated users can update blocks" ON public.blocks;

CREATE POLICY "Managers can insert blocks"
ON public.blocks
FOR INSERT
TO authenticated
WITH CHECK (public.get_user_role(auth.uid()) IN ('supervisor', 'coordenador', 'admin_master'));

CREATE POLICY "Managers can update blocks"
ON public.blocks
FOR UPDATE
TO authenticated
USING (public.get_user_role(auth.uid()) IN ('supervisor', 'coordenador', 'admin_master'))
WITH CHECK (public.get_user_role(auth.uid()) IN ('supervisor', 'coordenador', 'admin_master'));

CREATE POLICY "Managers can delete blocks"
ON public.blocks
FOR DELETE
TO authenticated
USING (public.get_user_role(auth.uid()) IN ('supervisor', 'coordenador', 'admin_master'));

-- Fix system settings role name for current RBAC vocabulary
DROP POLICY IF EXISTS "System settings can be updated by admins and supervisors" ON public.system_settings;
CREATE POLICY "System settings can be updated by managers"
ON public.system_settings
FOR UPDATE
TO authenticated
USING (public.get_user_role(auth.uid()) IN ('supervisor', 'coordenador', 'admin_master'))
WITH CHECK (public.get_user_role(auth.uid()) IN ('supervisor', 'coordenador', 'admin_master'));
