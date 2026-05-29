-- Create an enum for roles if it doesn't exist, or just use a check constraint
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role_type') THEN
        CREATE TYPE public.user_role_type AS ENUM ('admin_master', 'coordenador', 'supervisor', 'agente');
    END IF;
END $$;

-- Add role column to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS role public.user_role_type DEFAULT 'agente';

-- Update existing profiles to have a role if they don't
UPDATE public.profiles SET role = 'agente' WHERE role IS NULL;

-- Ensure role is not null
ALTER TABLE public.profiles ALTER COLUMN role SET NOT NULL;

-- Add role column to user_roles table if it's still used, but we'll transition to profiles.role
-- Actually, let's keep it simple and use profiles.role as requested.

-- Update RLS policies to use profiles.role
-- This is a broad update, we might need to adjust specific policies later.
-- For now, let's ensure basic access based on the new role column.

-- Grant permissions
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- Example policy for profiles: users can read all profiles but only update their own
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles are viewable by authenticated users" 
ON public.profiles 
FOR SELECT 
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" 
ON public.profiles 
FOR UPDATE 
TO authenticated
USING (auth.uid() = id);

-- Admin Master can do anything on profiles
CREATE POLICY "Admin Master can manage all profiles" 
ON public.profiles 
FOR ALL 
TO authenticated
USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin_master'
);
