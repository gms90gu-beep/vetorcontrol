-- Create daily_work_records table
CREATE TABLE public.daily_work_records (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    cycle_id UUID NOT NULL REFERENCES public.cycles(id),
    week_id UUID REFERENCES public.weeks(id),
    work_date DATE NOT NULL DEFAULT CURRENT_DATE,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    end_time TIMESTAMP WITH TIME ZONE,
    status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed')),
    
    -- Production summary for the day
    properties_worked INTEGER DEFAULT 0,
    properties_closed INTEGER DEFAULT 0,
    properties_refused INTEGER DEFAULT 0,
    deposits_treated INTEGER DEFAULT 0,
    deposits_eliminated INTEGER DEFAULT 0,
    positive_foci INTEGER DEFAULT 0,
    pending_visits INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add status to agents table
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS work_status TEXT DEFAULT 'available' CHECK (work_status IN ('available', 'in_work', 'work_completed'));

-- Enable RLS
ALTER TABLE public.daily_work_records ENABLE ROW LEVEL SECURITY;

-- Policies for daily_work_records - using profile_id to link to auth.uid()
CREATE POLICY "Agents can view their own records"
ON public.daily_work_records FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.agents 
    WHERE public.agents.id = public.daily_work_records.agent_id 
    AND public.agents.profile_id = auth.uid()
));

CREATE POLICY "Agents can insert their own records"
ON public.daily_work_records FOR INSERT
WITH CHECK (EXISTS (
    SELECT 1 FROM public.agents 
    WHERE public.agents.id = public.daily_work_records.agent_id 
    AND public.agents.profile_id = auth.uid()
));

CREATE POLICY "Agents can update their own records"
ON public.daily_work_records FOR UPDATE
USING (EXISTS (
    SELECT 1 FROM public.agents 
    WHERE public.agents.id = public.daily_work_records.agent_id 
    AND public.agents.profile_id = auth.uid()
));

-- Create function for updating updated_at if not exists
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_daily_work_records_updated_at ON public.daily_work_records;
CREATE TRIGGER update_daily_work_records_updated_at
BEFORE UPDATE ON public.daily_work_records
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
