-- 1. Add unique constraint to blocks.number if not exists
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'blocks_number_key') THEN
        ALTER TABLE public.blocks ADD CONSTRAINT blocks_number_key UNIQUE (number);
    END IF;
END $$;

-- 2. Get the first subarea_id to use as default
DO $$
DECLARE
    v_subarea_id UUID;
BEGIN
    SELECT id INTO v_subarea_id FROM public.subareas LIMIT 1;
    
    -- If no subarea exists, we might need to create one or fail gracefully
    IF v_subarea_id IS NULL THEN
        -- This is a fallback in case there are no subareas
        INSERT INTO public.subareas (name, locality_id) 
        VALUES ('Subárea Geral', (SELECT id FROM public.localities LIMIT 1))
        RETURNING id INTO v_subarea_id;
    END IF;

    -- 3. Ensure blocks exist for all block_numbers in properties
    INSERT INTO public.blocks (number, total_properties, status, subarea_id)
    SELECT DISTINCT block_number, 0, 'not_started'::public.block_status, v_subarea_id
    FROM public.properties
    WHERE block_number IS NOT NULL
    ON CONFLICT (number) DO NOTHING;

    -- 4. Link properties to blocks
    UPDATE public.properties p
    SET block_id = b.id
    FROM public.blocks b
    WHERE p.block_number = b.number
    AND p.block_id IS NULL;

    -- 5. Update total_properties counts
    UPDATE public.blocks b
    SET total_properties = (
      SELECT COUNT(*)
      FROM public.properties p
      WHERE p.block_id = b.id
    );
END $$;

-- 6. Create function to sync blocks on property changes
CREATE OR REPLACE FUNCTION public.sync_property_block()
RETURNS TRIGGER AS $$
DECLARE
    v_block_id UUID;
    v_subarea_id UUID;
BEGIN
    -- Handle NEW record (INSERT or UPDATE)
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        IF NEW.block_number IS NOT NULL THEN
            -- Get default subarea
            SELECT id INTO v_subarea_id FROM public.subareas LIMIT 1;
            
            -- Ensure block exists
            INSERT INTO public.blocks (number, total_properties, status, subarea_id)
            VALUES (NEW.block_number, 0, 'not_started'::public.block_status, v_subarea_id)
            ON CONFLICT (number) DO UPDATE SET number = EXCLUDED.number -- No-op to get the ID
            RETURNING id INTO v_block_id;
            
            NEW.block_id := v_block_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Trigger for property insert/update to maintain block_id
DROP TRIGGER IF EXISTS tr_sync_property_block ON public.properties;
CREATE TRIGGER tr_sync_property_block
BEFORE INSERT OR UPDATE OF block_number ON public.properties
FOR EACH ROW
EXECUTE FUNCTION public.sync_property_block();

-- 8. Function to update block counts on any property change
CREATE OR REPLACE FUNCTION public.update_block_property_count()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        IF NEW.block_id IS NOT NULL THEN
            UPDATE public.blocks 
            SET total_properties = (SELECT COUNT(*) FROM public.properties WHERE block_id = NEW.block_id)
            WHERE id = NEW.block_id;
        END IF;
    END IF;
    
    IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
        IF OLD.block_id IS NOT NULL THEN
            UPDATE public.blocks 
            SET total_properties = (SELECT COUNT(*) FROM public.properties WHERE block_id = OLD.block_id)
            WHERE id = OLD.block_id;
        END IF;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 9. Trigger for property changes to maintain counts
DROP TRIGGER IF EXISTS tr_update_block_property_count ON public.properties;
CREATE TRIGGER tr_update_block_property_count
AFTER INSERT OR UPDATE OR DELETE ON public.properties
FOR EACH ROW
EXECUTE FUNCTION public.update_block_property_count();
