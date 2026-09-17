DROP POLICY IF EXISTS "Authenticated users can read block reports" ON storage.objects;
CREATE POLICY "Users and supervisors can read block reports"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'block-reports'
    AND (
      (auth.uid())::text = (storage.foldername(name))[1]
      OR public.is_territory_manager(auth.uid())
      OR public.can_supervise_user(NULLIF((storage.foldername(name))[1], '')::uuid)
    )
  );