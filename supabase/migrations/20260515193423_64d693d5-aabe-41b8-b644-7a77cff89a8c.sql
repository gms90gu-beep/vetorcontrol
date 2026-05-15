-- Create agents table
CREATE TABLE public.agents (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    profile_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    name TEXT NOT NULL,
    registration_id TEXT UNIQUE,
    municipality TEXT DEFAULT 'São Paulo',
    phone TEXT,
    photo_url TEXT,
    team TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Agents can view their own data" 
ON public.agents FOR SELECT 
USING (auth.uid() = profile_id);

CREATE POLICY "Agents can update their own data" 
ON public.agents FOR UPDATE 
USING (auth.uid() = profile_id);

-- Trigger for updated_at
CREATE TRIGGER update_agents_updated_at
BEFORE UPDATE ON public.agents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to handle new user and create agent profile
CREATE OR REPLACE FUNCTION public.handle_new_user_agent()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.agents (profile_id, name, registration_id)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', 'Agente'), 'ACE-' || floor(random() * 9000 + 1000)::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to create agent on signup
CREATE TRIGGER on_auth_user_created_agent
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_agent();

-- Backfill existing users into agents table if any
INSERT INTO public.agents (profile_id, name, registration_id)
SELECT id, COALESCE(raw_user_meta_data->>'full_name', 'Agente'), 'ACE-' || floor(random() * 9000 + 1000)::text
FROM auth.users
ON CONFLICT (profile_id) DO NOTHING;
