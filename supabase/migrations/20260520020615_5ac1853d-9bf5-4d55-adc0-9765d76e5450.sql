-- Function to update total_properties in blocks
CREATE OR REPLACE FUNCTION public.update_block_property_count()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        UPDATE public.blocks 
        SET total_properties = (SELECT count(*) FROM public.properties WHERE block_number = NEW.block_number)
        WHERE number = NEW.block_number;
    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE public.blocks 
        SET total_properties = (SELECT count(*) FROM public.properties WHERE block_number = OLD.block_number)
        WHERE number = OLD.block_number;
    ELSIF (TG_OP = 'UPDATE') THEN
        IF OLD.block_number IS DISTINCT FROM NEW.block_number THEN
            UPDATE public.blocks 
            SET total_properties = (SELECT count(*) FROM public.properties WHERE block_number = OLD.block_number)
            WHERE number = OLD.block_number;
            
            UPDATE public.blocks 
            SET total_properties = (SELECT count(*) FROM public.properties WHERE block_number = NEW.block_number)
            WHERE number = NEW.block_number;
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create triggers
DROP TRIGGER IF EXISTS trigger_update_block_count ON public.properties;
CREATE TRIGGER trigger_update_block_count
AFTER INSERT OR DELETE OR UPDATE OF block_number ON public.properties
FOR EACH ROW
EXECUTE FUNCTION public.update_block_property_count();