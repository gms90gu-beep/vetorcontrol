-- This follows the already-applied archive migrations. The Storage UI in this
-- Lovable Cloud project does not expose allowed_mime_types, so enforce the
-- declared MIME type and .pdf suffix at the Storage RLS boundary as well.
drop policy signed_bulletins_upload_pending_own on storage.objects;

create policy signed_bulletins_upload_pending_own
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'signed-bulletins'
    and storage.extension(name) = 'pdf'
    and lower(coalesce(metadata ->> 'mimetype', '')) = 'application/pdf'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.signed_bulletin_archive a
      where a.storage_path = name
        and a.agent_profile_id = (select auth.uid())
        and a.status = 'pending'
    )
  );
