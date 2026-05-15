-- Trigger function to populate visit metadata
CREATE OR REPLACE FUNCTION public.populate_visit_metadata()
RETURNS TRIGGER AS $$
BEGIN
    -- Populate year and cycle from the cycle_id if provided
    IF NEW.cycle_id IS NOT NULL THEN
        SELECT year INTO NEW.year FROM public.cycles WHERE id = NEW.cycle_id;
    END IF;
    
    -- If year is still null, use current year
    IF NEW.year IS NULL THEN
        NEW.year := EXTRACT(YEAR FROM CURRENT_DATE);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS tr_populate_visit_metadata ON public.visits;
CREATE TRIGGER tr_populate_visit_metadata
BEFORE INSERT ON public.visits
FOR EACH ROW
EXECUTE FUNCTION public.populate_visit_metadata();
