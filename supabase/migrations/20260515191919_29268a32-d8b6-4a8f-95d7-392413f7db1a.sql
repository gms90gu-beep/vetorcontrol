-- Function to check if a block is completed in a specific cycle
CREATE OR REPLACE FUNCTION public.check_block_completion(p_block_id UUID, p_cycle_id UUID)
RETURNS VOID AS $$
DECLARE
    v_total_properties INTEGER;
    v_visited_properties INTEGER;
BEGIN
    -- Get total properties in the block
    SELECT count(*) INTO v_total_properties 
    FROM public.properties 
    WHERE block_id = p_block_id;

    -- Get visited properties in this cycle for this block
    -- Only count visits that are "completed" (visited, closed, refused, abandoned)
    -- We assume any visit in the current cycle counts as a 'visit' to that property
    SELECT count(DISTINCT property_id) INTO v_visited_properties
    FROM public.visits
    WHERE cycle_id = p_cycle_id 
    AND property_id IN (SELECT id FROM public.properties WHERE block_id = p_block_id);

    -- If total > 0 and visited >= total, mark block as finished for this cycle
    -- Note: Since blocks are shared across cycles, we might need a block_cycle_status table
    -- but for simplicity based on the prompt "Cada quarteirão deve possuir: não iniciado, em andamento, concluído"
    -- we will update the status on the block itself, assuming it refers to the 'active' cycle.
    
    IF v_total_properties > 0 AND v_visited_properties >= v_total_properties THEN
        UPDATE public.blocks SET status = 'finished' WHERE id = p_block_id;
    ELSIF v_visited_properties > 0 THEN
        UPDATE public.blocks SET status = 'in_progress' WHERE id = p_block_id;
    ELSE
        UPDATE public.blocks SET status = 'not_started' WHERE id = p_block_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger function for visits
CREATE OR REPLACE FUNCTION public.on_visit_upsert_update_block()
RETURNS TRIGGER AS $$
DECLARE
    v_block_id UUID;
BEGIN
    -- Get block_id from property
    SELECT block_id INTO v_block_id FROM public.properties WHERE id = NEW.property_id;
    
    IF v_block_id IS NOT NULL AND NEW.cycle_id IS NOT NULL THEN
        PERFORM public.check_block_completion(v_block_id, NEW.cycle_id);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS tr_visit_update_block ON public.visits;
CREATE TRIGGER tr_visit_update_block
AFTER INSERT OR UPDATE ON public.visits
FOR EACH ROW EXECUTE FUNCTION public.on_visit_upsert_update_block();

-- View for Cycle Coverage
CREATE OR REPLACE VIEW public.cycle_coverage_summary AS
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
