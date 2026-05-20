-- Function to check if a block should be deleted when properties are removed
CREATE OR REPLACE FUNCTION public.check_and_delete_empty_block()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if there are any remaining properties for this block number
    IF NOT EXISTS (SELECT 1 FROM public.properties WHERE block_number = OLD.block_number) THEN
        DELETE FROM public.blocks WHERE number = OLD.block_number;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to execute after a property is deleted
DROP TRIGGER IF EXISTS trigger_delete_empty_block ON public.properties;
CREATE TRIGGER trigger_delete_empty_block
AFTER DELETE ON public.properties
FOR EACH ROW
EXECUTE FUNCTION public.check_and_delete_empty_block();

-- Also handle updates in case block_number changes
CREATE OR REPLACE FUNCTION public.check_and_delete_empty_block_on_update()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.block_number IS DISTINCT FROM NEW.block_number THEN
        IF NOT EXISTS (SELECT 1 FROM public.properties WHERE block_number = OLD.block_number) THEN
            DELETE FROM public.blocks WHERE number = OLD.block_number;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_delete_empty_block_on_update ON public.properties;
CREATE TRIGGER trigger_delete_empty_block_on_update
AFTER UPDATE ON public.properties
FOR EACH ROW
EXECUTE FUNCTION public.check_and_delete_empty_block_on_update();