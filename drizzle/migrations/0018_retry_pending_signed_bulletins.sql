drop policy signed_bulletins_read_scoped on storage.objects;

create policy signed_bulletins_read_scoped
  on storage.objects for select to authenticated
  using (
    bucket_id = 'signed-bulletins'
    and exists (
      select 1 from public.signed_bulletin_archive a
      where a.storage_path = name
        and (
          (a.status = 'ready' and public.can_supervise_user(a.agent_profile_id))
          or (a.status = 'pending' and a.agent_profile_id = (select auth.uid()))
        )
    )
  );