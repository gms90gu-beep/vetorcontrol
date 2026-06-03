-- Drop all existing policies on blocks
DROP POLICY IF EXISTS "Authenticated users can insert blocks" ON public.blocks;
DROP POLICY IF EXISTS "Managers can delete blocks" ON public.blocks;
DROP POLICY IF EXISTS "Managers can insert blocks" ON public.blocks;
DROP POLICY IF EXISTS "Managers can update blocks" ON public.blocks;
DROP POLICY IF EXISTS "Territorial data viewable by authenticated" ON public.blocks;
DROP POLICY IF EXISTS "Territorial data viewable by authenticated_blocks" ON public.blocks;
DROP POLICY IF EXISTS "blocks_insert" ON public.blocks;
DROP POLICY IF EXISTS "blocks_select" ON public.blocks;
DROP POLICY IF EXISTS "blocks_update" ON public.blocks;
DROP POLICY IF EXISTS "blocks_delete_admin" ON public.blocks;

-- Ensure RLS is enabled
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

-- INSERT: any authenticated user
CREATE POLICY "blocks_insert"
ON public.blocks
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- SELECT: any authenticated user
CREATE POLICY "blocks_select"
ON public.blocks
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- UPDATE: any authenticated user
CREATE POLICY "blocks_update"
ON public.blocks
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- DELETE: admin_master only
CREATE POLICY "blocks_delete_admin"
ON public.blocks
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin_master'::app_role));
