
-- 1. Properties: remove public SELECT policy
DROP POLICY IF EXISTS "Users can view all properties" ON public.properties;

-- 2. Weeks: restrict SELECT to authenticated
DROP POLICY IF EXISTS "Weeks are viewable by everyone" ON public.weeks;
CREATE POLICY "Weeks viewable by authenticated"
  ON public.weeks FOR SELECT TO authenticated USING (true);

-- 3. block-reports bucket: restrict to authenticated + ownership on writes
DROP POLICY IF EXISTS "Block reports are publicly accessible" ON storage.objects;
CREATE POLICY "Authenticated users can read block reports"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'block-reports');

DROP POLICY IF EXISTS "Authenticated users can upload block reports" ON storage.objects;
CREATE POLICY "Users can upload their own block reports"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'block-reports' AND (auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Authenticated users can update block reports" ON storage.objects;
CREATE POLICY "Users can update their own block reports"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'block-reports' AND (auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Authenticated users can delete block reports" ON storage.objects;
CREATE POLICY "Users can delete their own block reports"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'block-reports' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- 4. rg-ocr bucket: remove broad public SELECT (owner-scoped policy remains)
DROP POLICY IF EXISTS "RG OCR images are publicly accessible" ON storage.objects;

-- 5. Fix function search_path on functions missing it
ALTER FUNCTION public.handle_updated_at() SET search_path = public;
ALTER FUNCTION public.sync_property_block() SET search_path = public;

-- 6. Revoke EXECUTE on trigger-only SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user_agent() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_and_delete_empty_block() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_and_delete_empty_block_on_update() FROM anon, authenticated, PUBLIC;

-- Revoke from anon on RLS-helper definers (authenticated still needs them for RLS/RPC)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_supervise_user(uuid) FROM anon, PUBLIC;
