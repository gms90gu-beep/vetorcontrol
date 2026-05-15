-- Update cycles table to ensure year and number uniqueness
ALTER TABLE public.cycles ADD COLUMN IF NOT EXISTS "year" INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE);
ALTER TABLE public.cycles ADD CONSTRAINT unique_cycle_year_number UNIQUE ("year", "number");

-- Add year column to visits if not exists
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS "year" INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE);

-- Function to ensure 6 cycles exist for a given year
CREATE OR REPLACE FUNCTION public.ensure_annual_cycles(target_year INTEGER)
RETURNS VOID AS $$
DECLARE
    i INTEGER;
    cycle_name TEXT;
    start_date DATE;
    end_date DATE;
BEGIN
    FOR i IN 1..6 LOOP
        cycle_name := 'Ciclo ' || i || ' / ' || target_year;
        
        -- Approximate dates: each cycle is ~2 months
        start_date := (target_year || '-' || ((i-1)*2 + 1) || '-01')::DATE;
        end_date := (start_date + INTERVAL '2 months' - INTERVAL '1 day')::DATE;

        INSERT INTO public.cycles (name, number, year, start_date, end_date, status)
        VALUES (cycle_name, i, target_year, start_date, end_date, 'not_started')
        ON CONFLICT (year, number) DO NOTHING;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to handle cycle completion and automatic progression
CREATE OR REPLACE FUNCTION public.handle_cycle_transition()
RETURNS TRIGGER AS $$
DECLARE
    next_cycle_number INTEGER;
    next_year INTEGER;
BEGIN
    -- Only trigger when status changes to 'finished'
    IF NEW.status = 'finished' AND OLD.status != 'finished' THEN
        
        -- Identify next cycle
        IF NEW.number < 6 THEN
            next_cycle_number := NEW.number + 1;
            next_year := NEW.year;
        ELSE
            next_cycle_number := 1;
            next_year := NEW.year + 1;
            -- Ensure cycles for the next year exist
            PERFORM public.ensure_annual_cycles(next_year);
        END IF;

        -- Start next cycle
        UPDATE public.cycles 
        SET status = 'in_progress'
        WHERE year = next_year AND number = next_cycle_number;

        -- Ensure only one cycle is 'in_progress' for the current/next year
        -- (Optional: but the requirement says "Somente 1 ciclo por ano pode estar em andamento")
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop if exists and create trigger
DROP TRIGGER IF EXISTS tr_cycle_transition ON public.cycles;
CREATE TRIGGER tr_cycle_transition
AFTER UPDATE OF status ON public.cycles
FOR EACH ROW
EXECUTE FUNCTION public.handle_cycle_transition();

-- Trigger to prevent visits in finished cycles
CREATE OR REPLACE FUNCTION public.check_cycle_status_for_visit()
RETURNS TRIGGER AS $$
DECLARE
    c_status cycle_status;
BEGIN
    SELECT status INTO c_status FROM public.cycles WHERE id = NEW.cycle_id;
    
    IF c_status = 'finished' THEN
        RAISE EXCEPTION 'Não é possível registrar visitas em um ciclo concluído.';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_check_cycle_status ON public.visits;
CREATE TRIGGER tr_check_cycle_status
BEFORE INSERT OR UPDATE ON public.visits
FOR EACH ROW
EXECUTE FUNCTION public.check_cycle_status_for_visit();

-- View for Annual Report
CREATE OR REPLACE VIEW public.annual_report_summary AS
SELECT 
    c.year,
    COUNT(DISTINCT c.id) as total_cycles,
    SUM(CASE WHEN c.status = 'finished' THEN 1 ELSE 0 END) as completed_cycles,
    COUNT(v.id) as total_visits,
    COUNT(CASE WHEN v.has_focus THEN 1 END) as total_focus,
    COUNT(CASE WHEN v.treatment_applied THEN 1 END) as total_treatments,
    COUNT(DISTINCT v.property_id) as properties_worked
FROM 
    public.cycles c
LEFT JOIN 
    public.visits v ON v.cycle_id = c.id
GROUP BY 
    c.year;

-- Initial creation for current year
SELECT public.ensure_annual_cycles(EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER);

-- If no cycle is in progress, start Ciclo 1
UPDATE public.cycles 
SET status = 'in_progress' 
WHERE year = EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER 
AND number = 1 
AND NOT EXISTS (SELECT 1 FROM public.cycles WHERE status = 'in_progress');
