-- Create system_settings table
CREATE TABLE public.system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    allow_weekend_operation BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_by UUID REFERENCES public.profiles(id)
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "System settings are viewable by all authenticated users"
ON public.system_settings FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "System settings can be updated by admins and supervisors"
ON public.system_settings FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid()
        AND role IN ('admin', 'supervisor')
    )
);

-- Insert initial record
INSERT INTO public.system_settings (allow_weekend_operation) VALUES (false);
