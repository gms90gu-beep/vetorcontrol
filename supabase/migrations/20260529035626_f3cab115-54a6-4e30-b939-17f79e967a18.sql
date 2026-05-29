-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create Enums safely
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
        CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'agent');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cycle_status') THEN
        CREATE TYPE public.cycle_status AS ENUM ('not_started', 'in_progress', 'finished');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'property_type') THEN
        CREATE TYPE public.property_type AS ENUM ('residence', 'commerce', 'vacant_lot', 'strategic_point', 'others');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'visit_status') THEN
        CREATE TYPE public.visit_status AS ENUM ('visited', 'closed', 'refused', 'abandoned');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'activity_type') THEN
        CREATE TYPE public.activity_type AS ENUM ('routine', 'infestation_survey', 'pending');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'block_status') THEN
        CREATE TYPE public.block_status AS ENUM ('not_started', 'in_progress', 'completed', 'finished');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'property_status') THEN
        CREATE TYPE public.property_status AS ENUM ('active', 'pending', 'deactivated');
    END IF;
END $$;

-- Helper function to update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- User roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    UNIQUE (user_id, role)
);

-- Cycles management
CREATE TABLE IF NOT EXISTS public.cycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status cycle_status DEFAULT 'not_started' NOT NULL,
    "number" INTEGER,
    "year" INTEGER DEFAULT extract(year from now()),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Territorial structure
CREATE TABLE IF NOT EXISTS public.areas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS public.localities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    area_id UUID REFERENCES public.areas(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.subareas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    locality_id UUID REFERENCES public.localities(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subarea_id UUID REFERENCES public.subareas(id) ON DELETE CASCADE NOT NULL,
    number TEXT NOT NULL,
    status block_status DEFAULT 'not_started' NOT NULL,
    total_properties INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.streets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL
);

-- Properties
CREATE TABLE IF NOT EXISTS public.properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    block_id UUID REFERENCES public.blocks(id) ON DELETE CASCADE,
    street_id UUID REFERENCES public.streets(id),
    number TEXT NOT NULL,
    type property_type DEFAULT 'residence' NOT NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    complement TEXT,
    neighborhood TEXT,
    block_number TEXT,
    street_name TEXT,
    reference TEXT,
    container_count INTEGER DEFAULT 0,
    observations TEXT,
    is_abandoned BOOLEAN DEFAULT false,
    is_frequently_closed BOOLEAN DEFAULT false,
    had_previous_focus BOOLEAN DEFAULT false,
    status property_status DEFAULT 'active',
    user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Weeks table
CREATE TABLE IF NOT EXISTS public.weeks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id UUID NOT NULL REFERENCES public.cycles(id) ON DELETE CASCADE,
    number INTEGER NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Visits
CREATE TABLE IF NOT EXISTS public.visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE NOT NULL,
    agent_id UUID REFERENCES auth.users(id) NOT NULL,
    cycle_id UUID REFERENCES public.cycles(id),
    week_id UUID REFERENCES public.weeks(id),
    status visit_status NOT NULL,
    activity_type activity_type DEFAULT 'routine' NOT NULL,
    visit_date TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    week_number INTEGER,
    has_focus BOOLEAN DEFAULT FALSE,
    sample_collected BOOLEAN DEFAULT FALSE,
    treatment_applied BOOLEAN DEFAULT FALSE,
    treatment_amount DECIMAL,
    elimination_done BOOLEAN DEFAULT FALSE,
    elimination_amount INTEGER
);

-- Deposits (breeding sites)
CREATE TABLE IF NOT EXISTS public.visit_deposits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id UUID REFERENCES public.visits(id) ON DELETE CASCADE NOT NULL,
    type_code TEXT NOT NULL,
    description TEXT,
    quantity INTEGER DEFAULT 1,
    is_positive BOOLEAN DEFAULT FALSE,
    is_treated BOOLEAN DEFAULT FALSE,
    is_eliminated BOOLEAN DEFAULT FALSE
);

-- Field work sessions
CREATE TABLE IF NOT EXISTS public.field_work_sessions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    cycle_id UUID REFERENCES public.cycles(id),
    week_id UUID REFERENCES public.weeks(id),
    block_number TEXT NOT NULL,
    street_name TEXT NOT NULL,
    property_count INTEGER NOT NULL,
    session_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Weekly bulletins
CREATE TABLE IF NOT EXISTS public.weekly_bulletins (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    cycle_id UUID REFERENCES public.cycles(id),
    agent_id UUID REFERENCES auth.users(id),
    week_number INTEGER NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    inspected_count INTEGER DEFAULT 0,
    visited_count INTEGER DEFAULT 0,
    closed_count INTEGER DEFAULT 0,
    refused_count INTEGER DEFAULT 0,
    abandoned_count INTEGER DEFAULT 0,
    informed_count INTEGER DEFAULT 0,
    residence_count INTEGER DEFAULT 0,
    commerce_count INTEGER DEFAULT 0,
    vacant_lot_count INTEGER DEFAULT 0,
    strategic_point_count INTEGER DEFAULT 0,
    other_type_count INTEGER DEFAULT 0,
    deposits_inspected JSONB DEFAULT '{}',
    deposits_treated JSONB DEFAULT '{}',
    deposits_eliminated JSONB DEFAULT '{}',
    deposits_positive JSONB DEFAULT '{}',
    positive_focus_count INTEGER DEFAULT 0,
    positive_property_count INTEGER DEFAULT 0,
    focal_treatment_count INTEGER DEFAULT 0,
    perifocal_treatment_count INTEGER DEFAULT 0,
    insecticide_type TEXT,
    insecticide_amount NUMERIC DEFAULT 0,
    territory_property_count INTEGER DEFAULT 0,
    worked_property_count INTEGER DEFAULT 0,
    completion_percentage NUMERIC DEFAULT 0,
    infestation_index NUMERIC DEFAULT 0,
    pdf_url TEXT,
    status TEXT DEFAULT 'generated',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Helper function to check role
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

-- Helper function to get epidemiological week
CREATE OR REPLACE FUNCTION public.get_epi_week(d DATE)
RETURNS INTEGER AS $$
BEGIN
    RETURN (SELECT extract(week from d)::integer);
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

-- Function to check block completion
CREATE OR REPLACE FUNCTION public.check_block_completion(p_block_id UUID, p_cycle_id UUID)
RETURNS VOID AS $$
DECLARE
    v_total_properties INTEGER;
    v_visited_properties INTEGER;
BEGIN
    SELECT count(*) INTO v_total_properties FROM public.properties WHERE block_id = p_block_id;
    SELECT count(DISTINCT property_id) INTO v_visited_properties
    FROM public.visits
    WHERE cycle_id = p_cycle_id 
    AND property_id IN (SELECT id FROM public.properties WHERE block_id = p_block_id);
    
    IF v_total_properties > 0 AND v_visited_properties >= v_total_properties THEN
        UPDATE public.blocks SET status = 'finished' WHERE id = p_block_id;
    ELSIF v_visited_properties > 0 THEN
        UPDATE public.blocks SET status = 'in_progress' WHERE id = p_block_id;
    ELSE
        UPDATE public.blocks SET status = 'not_started' WHERE id = p_block_id;
    END IF;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger function for visits to update block status
CREATE OR REPLACE FUNCTION public.on_visit_upsert_update_block()
RETURNS TRIGGER AS $$
DECLARE
    v_block_id UUID;
BEGIN
    SELECT block_id INTO v_block_id FROM public.properties WHERE id = NEW.property_id;
    IF v_block_id IS NOT NULL AND NEW.cycle_id IS NOT NULL THEN
        PERFORM public.check_block_completion(v_block_id, NEW.cycle_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

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
ALTER TABLE public.field_work_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_bulletins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weeks ENABLE ROW LEVEL SECURITY;

-- Grant permissions
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT SELECT ON public.cycles TO authenticated;
GRANT SELECT ON public.areas TO authenticated;
GRANT SELECT ON public.localities TO authenticated;
GRANT SELECT ON public.subareas TO authenticated;
GRANT SELECT, UPDATE ON public.blocks TO authenticated;
GRANT SELECT ON public.streets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.properties TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.visits TO authenticated;
GRANT SELECT, INSERT ON public.visit_deposits TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.field_work_sessions TO authenticated;
GRANT SELECT, INSERT ON public.weekly_bulletins TO authenticated;
GRANT SELECT ON public.weeks TO authenticated;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Policies
DO $$ BEGIN
    CREATE POLICY "Public profiles are viewable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Roles viewable by authenticated" ON public.user_roles FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Territorial data viewable by authenticated" ON public.areas FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Territorial data viewable by authenticated_localities" ON public.localities FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Territorial data viewable by authenticated_subareas" ON public.subareas FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Territorial data viewable by authenticated_blocks" ON public.blocks FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Territorial data viewable by authenticated_streets" ON public.streets FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Users can view all properties" ON public.properties FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Users can insert their own properties" ON public.properties FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Users can update their own properties" ON public.properties FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Users can delete their own properties" ON public.properties FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Cycles viewable by authenticated" ON public.cycles FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Weeks are viewable by everyone" ON public.weeks FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Visits viewable by authenticated" ON public.visits FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Agents can insert visits" ON public.visits FOR INSERT TO authenticated WITH CHECK (auth.uid() = agent_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Deposits viewable by authenticated" ON public.visit_deposits FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Agents can insert deposits" ON public.visit_deposits FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.visits WHERE id = visit_id AND agent_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Users can view their own field work sessions" ON public.field_work_sessions FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Users can create their own field work sessions" ON public.field_work_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Users can update their own field work sessions" ON public.field_work_sessions FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Users can view their own bulletins" ON public.weekly_bulletins FOR SELECT USING (auth.uid() = agent_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Users can insert their own bulletins" ON public.weekly_bulletins FOR INSERT WITH CHECK (auth.uid() = agent_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Triggers
DROP TRIGGER IF EXISTS update_field_work_sessions_updated_at ON public.field_work_sessions;
CREATE TRIGGER update_field_work_sessions_updated_at BEFORE UPDATE ON public.field_work_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS tr_visit_update_block ON public.visits;
CREATE TRIGGER tr_visit_update_block AFTER INSERT OR UPDATE ON public.visits FOR EACH ROW EXECUTE FUNCTION public.on_visit_upsert_update_block();

-- View
CREATE OR REPLACE VIEW public.cycle_coverage_summary WITH (security_invoker = true) AS
SELECT 
    c.id as cycle_id,
    c.name as cycle_name,
    count(DISTINCT p.id) as total_properties,
    count(DISTINCT v.property_id) as worked_properties,
    CASE 
        WHEN count(DISTINCT p.id) = 0 THEN 0
        ELSE ROUND((count(DISTINCT v.property_id)::NUMERIC / count(DISTINCT p.id)::NUMERIC) * 100, 2)
    END as coverage_percentage
FROM 
    public.cycles c
LEFT JOIN 
    public.visits v ON v.cycle_id = c.id
CROSS JOIN 
    public.properties p
GROUP BY 
    c.id, c.name;

-- Seed data for cycles and weeks
DO $$
DECLARE
    cycle_id UUID;
    i INTEGER;
    j INTEGER;
    base_date DATE := (extract(year from now()) || '-01-01')::DATE;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.cycles LIMIT 1) THEN
        FOR i IN 1..6 LOOP
            INSERT INTO public.cycles (name, "number", start_date, end_date, "year")
            VALUES ('Ciclo ' || i, i, base_date + (i-1) * INTERVAL '60 days', base_date + i * INTERVAL '60 days' - INTERVAL '1 day', extract(year from now())::INTEGER)
            RETURNING id INTO cycle_id;
            
            FOR j IN 1..4 LOOP
                INSERT INTO public.weeks (cycle_id, "number", start_date, end_date)
                VALUES (cycle_id, j, (base_date + (i-1) * INTERVAL '60 days' + (j-1) * INTERVAL '15 days')::DATE, (base_date + (i-1) * INTERVAL '60 days' + j * INTERVAL '15 days' - INTERVAL '1 day')::DATE);
            END LOOP;
        END LOOP;
    END IF;
END $$;
