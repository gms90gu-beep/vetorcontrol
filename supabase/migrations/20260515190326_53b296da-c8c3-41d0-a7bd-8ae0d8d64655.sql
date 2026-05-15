-- Add week_number to visits table if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'visits' AND column_name = 'week_number') THEN
        ALTER TABLE public.visits ADD COLUMN week_number INTEGER;
    END IF;
END $$;

-- Create weekly_bulletins table
CREATE TABLE IF NOT EXISTS public.weekly_bulletins (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    cycle_id UUID REFERENCES public.cycles(id),
    agent_id UUID REFERENCES auth.users(id),
    week_number INTEGER NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    
    -- Metrics (Imóveis)
    inspected_count INTEGER DEFAULT 0,
    visited_count INTEGER DEFAULT 0,
    closed_count INTEGER DEFAULT 0,
    refused_count INTEGER DEFAULT 0,
    abandoned_count INTEGER DEFAULT 0,
    informed_count INTEGER DEFAULT 0,
    
    -- Metrics (Tipos de Imóveis)
    residence_count INTEGER DEFAULT 0,
    commerce_count INTEGER DEFAULT 0,
    vacant_lot_count INTEGER DEFAULT 0,
    strategic_point_count INTEGER DEFAULT 0,
    other_type_count INTEGER DEFAULT 0,
    
    -- Metrics (Depósitos)
    deposits_inspected JSONB DEFAULT '{}', -- { "A1": 0, "A2": 0, ... }
    deposits_treated JSONB DEFAULT '{}',
    deposits_eliminated JSONB DEFAULT '{}',
    deposits_positive JSONB DEFAULT '{}',
    
    -- Metrics (Focos)
    positive_focus_count INTEGER DEFAULT 0,
    positive_property_count INTEGER DEFAULT 0,
    
    -- Metrics (Tratamento)
    focal_treatment_count INTEGER DEFAULT 0,
    perifocal_treatment_count INTEGER DEFAULT 0,
    insecticide_type TEXT,
    insecticide_amount NUMERIC DEFAULT 0,
    
    -- Metrics (Cobertura)
    territory_property_count INTEGER DEFAULT 0,
    worked_property_count INTEGER DEFAULT 0,
    completion_percentage NUMERIC DEFAULT 0,
    infestation_index NUMERIC DEFAULT 0,
    
    pdf_url TEXT,
    status TEXT DEFAULT 'generated',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.weekly_bulletins ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own bulletins" 
ON public.weekly_bulletins 
FOR SELECT 
USING (auth.uid() = agent_id);

CREATE POLICY "Users can insert their own bulletins" 
ON public.weekly_bulletins 
FOR INSERT 
WITH CHECK (auth.uid() = agent_id);

-- Helper function to get epidemiological week (standardized)
CREATE OR REPLACE FUNCTION public.get_epi_week(d DATE)
RETURNS INTEGER AS $$
BEGIN
    RETURN (SELECT extract(week from d)::integer);
END;
$$ LANGUAGE plpgsql IMMUTABLE;
