-- Allow authenticated users to insert blocks (needed by sync_property_block trigger
-- which auto-creates a block row when a property is inserted with a block_number).
CREATE POLICY "Authenticated users can insert blocks"
ON public.blocks
FOR INSERT
TO authenticated
WITH CHECK (true);
