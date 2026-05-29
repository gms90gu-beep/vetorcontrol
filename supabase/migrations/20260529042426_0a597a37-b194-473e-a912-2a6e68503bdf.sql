-- Update profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS registration_number TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Ensure user_roles table exists and has proper setup
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('agent', 'supervisor', 'admin')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Permissions for user_roles
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

-- Policies for user_roles
CREATE POLICY "Users can view their own role" 
ON public.user_roles FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Supervisors can view all roles" 
ON public.user_roles FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role IN ('supervisor', 'admin')
  )
);

-- Update RLS for visits
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own visits" ON public.visits;
CREATE POLICY "Users can view their own visits" 
ON public.visits FOR SELECT 
USING (
  auth.uid() = agent_id OR 
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role IN ('supervisor', 'admin')
  )
);

DROP POLICY IF EXISTS "Users can insert their own visits" ON public.visits;
CREATE POLICY "Users can insert their own visits" 
ON public.visits FOR INSERT 
WITH CHECK (auth.uid() = agent_id);

DROP POLICY IF EXISTS "Users can update their own visits" ON public.visits;
CREATE POLICY "Users can update their own visits" 
ON public.visits FOR UPDATE 
USING (
  auth.uid() = agent_id OR 
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role IN ('supervisor', 'admin')
  )
);

-- Update RLS for profiles
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles are viewable by everyone" 
ON public.profiles FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" 
ON public.profiles FOR UPDATE 
USING (
  auth.uid() = id OR 
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role IN ('supervisor', 'admin')
  )
);

-- Grant permissions for new columns
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
