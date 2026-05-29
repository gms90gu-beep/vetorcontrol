-- Add new values to existing enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin_master';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'coordenador';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'agente';

-- Create a helper function to check roles
CREATE OR REPLACE FUNCTION public.get_user_role(u_id UUID)
RETURNS TEXT AS $$
  SELECT role::TEXT FROM public.user_roles WHERE user_id = u_id;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- Update RLS for visits
DROP POLICY IF EXISTS "Users can view their own visits" ON public.visits;
DROP POLICY IF EXISTS "Role-based access for visits" ON public.visits;
CREATE POLICY "Role-based access for visits" 
ON public.visits FOR SELECT 
USING (
  auth.uid() = agent_id OR 
  public.get_user_role(auth.uid()) IN ('supervisor', 'coordenador', 'admin_master')
);

-- Update RLS for profiles
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Role-based access for profiles" ON public.profiles;
CREATE POLICY "Role-based access for profiles" 
ON public.profiles FOR SELECT 
USING (
  auth.uid() = id OR 
  public.get_user_role(auth.uid()) IN ('supervisor', 'coordenador', 'admin_master')
);

-- Policy for managing roles
DROP POLICY IF EXISTS "Supervisors can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "View roles based on hierarchy" ON public.user_roles;
CREATE POLICY "View roles based on hierarchy" 
ON public.user_roles FOR SELECT 
USING (
  auth.uid() = user_id OR 
  public.get_user_role(auth.uid()) IN ('supervisor', 'coordenador', 'admin_master')
);

DROP POLICY IF EXISTS "Admin and coordinators can manage roles" ON public.user_roles;
CREATE POLICY "Admin and coordinators can manage roles" 
ON public.user_roles FOR ALL 
USING (
  public.get_user_role(auth.uid()) IN ('admin_master', 'coordenador')
);
