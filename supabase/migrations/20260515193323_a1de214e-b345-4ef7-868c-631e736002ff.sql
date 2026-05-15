-- Add unique constraint to weeks
ALTER TABLE public.weeks ADD CONSTRAINT unique_week_cycle_number UNIQUE (cycle_id, "number");

-- Update ensure_annual_cycles to create weeks
CREATE OR REPLACE FUNCTION public.ensure_annual_cycles(target_year INTEGER)
RETURNS VOID AS $$
DECLARE
    i INTEGER;
    j INTEGER;
    cycle_name TEXT;
    start_date DATE;
    end_date DATE;
    new_cycle_id UUID;
    week_start DATE;
    week_end DATE;
BEGIN
    FOR i IN 1..6 LOOP
        cycle_name := 'Ciclo ' || i || ' / ' || target_year;
        
        -- Approximate dates: each cycle is ~2 months
        start_date := (target_year || '-' || ((i-1)*2 + 1) || '-01')::DATE;
        end_date := (start_date + INTERVAL '2 months' - INTERVAL '1 day')::DATE;

        INSERT INTO public.cycles (name, number, year, start_date, end_date, status)
        VALUES (cycle_name, i, target_year, start_date, end_date, 'not_started')
        ON CONFLICT (year, number) DO UPDATE 
        SET name = EXCLUDED.name,
            start_date = EXCLUDED.start_date,
            end_date = EXCLUDED.end_date
        RETURNING id INTO new_cycle_id;

        -- Create 8 weeks for each cycle
        FOR j IN 1..8 LOOP
            week_start := start_date + ((j-1) * 7);
            week_end := week_start + 6;
            
            -- Ensure week doesn't exceed cycle end_date too much
            IF week_start <= end_date THEN
                INSERT INTO public.weeks (cycle_id, number, start_date, end_date)
                VALUES (new_cycle_id, j, week_start, week_end)
                ON CONFLICT (cycle_id, number) DO NOTHING;
            END IF;
        END LOOP;
    END LOOP;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Re-run for current year to ensure weeks exist
SELECT public.ensure_annual_cycles(EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER);
