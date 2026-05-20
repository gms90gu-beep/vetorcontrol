-- Adjust functions to be SECURITY INVOKER
CREATE OR REPLACE FUNCTION public.check_and_delete_empty_block()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.properties WHERE block_number = OLD.block_number) THEN
        DELETE FROM public.blocks WHERE number = OLD.block_number;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

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
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;