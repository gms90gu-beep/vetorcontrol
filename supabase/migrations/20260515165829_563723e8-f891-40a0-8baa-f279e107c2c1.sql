-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'agent');
CREATE TYPE public.cycle_status AS ENUM ('not_started', 'in_progress', 'finished');
CREATE TYPE public.property_type AS ENUM ('residence', 'commerce', 'vacant_lot', 'strategic_point', 'others');
CREATE TYPE public.visit_status AS ENUM ('visited', 'closed', 'refused', 'abandoned');
CREATE TYPE public.activity_type AS ENUM ('routine', 'infestation_survey', 'pending');
CREATE TYPE public.block_status AS ENUM ('not_started', 'in_progress', 'completed');

-- Profiles table
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- User roles table (Security pattern)
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    UNIQUE (user_id, role)
);

-- Cycles management
CREATE TABLE public.cycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status cycle_status DEFAULT 'not_started' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Territorial structure
CREATE TABLE public.areas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT UNIQUE
);

CREATE TABLE public.localities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    area_id UUID REFERENCES public.areas(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL
);

CREATE TABLE public.subareas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    locality_id UUID REFERENCES public.localities(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL
);

CREATE TABLE public.blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subarea_id UUID REFERENCES public.subareas(id) ON DELETE CASCADE NOT NULL,
    number TEXT NOT NULL,
    status block_status DEFAULT 'not_started' NOT NULL,
    total_properties INTEGER DEFAULT 0
);

CREATE TABLE public.streets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL
);

-- Properties
CREATE TABLE public.properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    block_id UUID REFERENCES public.blocks(id) ON DELETE CASCADE NOT NULL,
    street_id UUID REFERENCES public.streets(id) NOT NULL,
    number TEXT NOT NULL,
    type property_type DEFAULT 'residence' NOT NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Visits
CREATE TABLE public.visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE NOT NULL,
    agent_id UUID REFERENCES auth.users(id) NOT NULL,
    cycle_id UUID REFERENCES public.cycles(id) NOT NULL,
    status visit_status NOT NULL,
    activity_type activity_type DEFAULT 'routine' NOT NULL,
    visit_date TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    has_focus BOOLEAN DEFAULT FALSE,
    sample_collected BOOLEAN DEFAULT FALSE,
    treatment_applied BOOLEAN DEFAULT FALSE,
    treatment_amount DECIMAL,
    elimination_done BOOLEAN DEFAULT FALSE,
    elimination_amount INTEGER
);

-- Deposits (breeding sites)
CREATE TABLE public.visit_deposits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id UUID REFERENCES public.visits(id) ON DELETE CASCADE NOT NULL,
    type_code TEXT NOT NULL, -- A1, A2, B, etc.
    description TEXT, -- water tank, tire, etc.
    quantity INTEGER DEFAULT 1,
    is_positive BOOLEAN DEFAULT FALSE,
    is_treated BOOLEAN DEFAULT FALSE,
    is_eliminated BOOLEAN DEFAULT FALSE
);

-- RLS helper function
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.localities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subareas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visit_deposits ENABLE ROW LEVEL SECURITY;

-- Basic Policies
CREATE POLICY "Public profiles are viewable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE POLICY "Roles viewable by authenticated" ON public.user_roles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Territorial data viewable by authenticated" ON public.areas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Territorial data viewable by authenticated" ON public.localities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Territorial data viewable by authenticated" ON public.subareas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Territorial data viewable by authenticated" ON public.blocks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Territorial data viewable by authenticated" ON public.streets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Territorial data viewable by authenticated" ON public.properties FOR SELECT TO authenticated USING (true);

CREATE POLICY "Cycles viewable by authenticated" ON public.cycles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Visits viewable by authenticated" ON public.visits FOR SELECT TO authenticated USING (true);
CREATE POLICY "Agents can insert visits" ON public.visits FOR INSERT TO authenticated WITH CHECK (auth.uid() = agent_id);

CREATE POLICY "Deposits viewable by authenticated" ON public.visit_deposits FOR SELECT TO authenticated USING (true);
CREATE POLICY "Agents can insert deposits" ON public.visit_deposits FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.visits WHERE id = visit_id AND agent_id = auth.uid()));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.visits;
ALTER PUBLICATION supabase_realtime ADD TABLE public.blocks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.properties;
