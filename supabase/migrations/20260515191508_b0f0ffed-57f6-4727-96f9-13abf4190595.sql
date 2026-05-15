-- Adjust cycles table
ALTER TABLE public.cycles ADD COLUMN IF NOT EXISTS "number" INTEGER;
ALTER TABLE public.cycles ADD COLUMN IF NOT EXISTS "year" INTEGER DEFAULT extract(year from now());
ALTER TABLE public.cycles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Ensure status is a string if it was a custom type that caused issues
-- (We'll just make sure columns exist for the seed)

-- Weeks table
CREATE TABLE IF NOT EXISTS public.weeks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id UUID NOT NULL REFERENCES public.cycles(id) ON DELETE CASCADE,
    number INTEGER NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add references to visits and field_work_sessions
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS cycle_id UUID REFERENCES public.cycles(id);
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS week_id UUID REFERENCES public.weeks(id);
ALTER TABLE public.field_work_sessions ADD COLUMN IF NOT EXISTS cycle_id UUID REFERENCES public.cycles(id);
ALTER TABLE public.field_work_sessions ADD COLUMN IF NOT EXISTS week_id UUID REFERENCES public.weeks(id);

-- Enable RLS for weeks
ALTER TABLE public.weeks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Weeks are viewable by everyone" ON public.weeks FOR SELECT USING (true);

-- Seed 6 cycles for this year if they don't exist
DO $$
DECLARE
    cycle_id UUID;
    i INTEGER;
    j INTEGER;
    base_date DATE := (extract(year from now()) || '-01-01')::DATE;
BEGIN
    FOR i IN 1..6 LOOP
        -- Upsert cycle
        INSERT INTO public.cycles (name, "number", start_date, end_date, "year")
        VALUES (
            'Ciclo ' || i,
            i,
            base_date + (i-1) * INTERVAL '60 days',
            base_date + i * INTERVAL '60 days' - INTERVAL '1 day',
            extract(year from now())::INTEGER
        )
        ON CONFLICT DO NOTHING;
        
        -- Get the id (either newly inserted or existing)
        SELECT id INTO cycle_id FROM public.cycles WHERE "number" = i AND "year" = extract(year from now())::INTEGER;

        -- Create 4 weeks per cycle (user requested 4 weeks)
        FOR j IN 1..4 LOOP
            INSERT INTO public.weeks (cycle_id, "number", start_date, end_date)
            VALUES (
                cycle_id,
                j,
                (base_date + (i-1) * INTERVAL '60 days' + (j-1) * INTERVAL '15 days')::DATE,
                (base_date + (i-1) * INTERVAL '60 days' + j * INTERVAL '15 days' - INTERVAL '1 day')::DATE
            )
            ON CONFLICT DO NOTHING;
        END LOOP;
    END LOOP;
END $$;