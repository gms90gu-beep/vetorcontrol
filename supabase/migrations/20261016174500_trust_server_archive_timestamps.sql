create or replace function public.keep_signed_bulletin_immutable()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if old.status <> 'pending'
     or new.status <> 'ready'
     or old.uploaded_at is not null
     or old.document_sha256 is not null
     or (to_jsonb(new) - 'status' - 'uploaded_at' - 'document_sha256')
        is distinct from (to_jsonb(old) - 'status' - 'uploaded_at' - 'document_sha256') then
    raise exception 'Signed bulletins are immutable';
  end if;
  new.uploaded_at := statement_timestamp();
  return new;
end;
$function$;
