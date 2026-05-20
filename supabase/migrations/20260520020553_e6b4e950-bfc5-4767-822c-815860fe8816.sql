-- Add missing RLS policies for the blocks table
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert, update, and delete blocks
-- (Since there is no user_id in blocks, we allow all authenticated users for now, 
-- consistent with the existing SELECT policy)
CREATE POLICY "Authenticated users can insert blocks" ON public.blocks
FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update blocks" ON public.blocks
FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete blocks" ON public.blocks
FOR DELETE TO authenticated USING (true);

-- Enhance the trigger function to be SECURITY DEFINER and more robust
CREATE OR REPLACE FUNCTION public.check_and_delete_empty_block()
RETURNS TRIGGER AS $$
DECLARE
    prop_count integer;
BEGIN
    -- Count remaining properties for this block
    SELECT count(*) INTO prop_count FROM public.properties WHERE block_number = OLD.block_number;
    
    -- If no properties left, delete the block
    IF prop_count = 0 THEN
        DELETE FROM public.blocks WHERE number = OLD.block_number;
    END IF;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Re-apply the trigger to ensure it's using the updated function
DROP TRIGGER IF EXISTS trigger_delete_empty_block ON public.properties;
CREATE TRIGGER trigger_delete_empty_block
AFTER DELETE ON public.properties
FOR EACH ROW
EXECUTE FUNCTION public.check_and_delete_empty_block();

-- Also handle updates
CREATE OR REPLACE FUNCTION public.check_and_delete_empty_block_on_update()
RETURNS TRIGGER AS $$
DECLARE
    prop_count integer;
BEGIN
    IF OLD.block_number IS DISTINCT FROM NEW.block_number THEN
        SELECT count(*) INTO prop_count FROM public.properties WHERE block_number = OLD.block_number;
        IF prop_count = 0 THEN
            DELETE FROM public.blocks WHERE number = OLD.block_number;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_delete_empty_block_on_update ON public.properties;
CREATE TRIGGER trigger_delete_empty_block_on_update
AFTER UPDATE ON public.properties
FOR EACH ROW
EXECUTE FUNCTION public.check_and_delete_empty_block_on_update();