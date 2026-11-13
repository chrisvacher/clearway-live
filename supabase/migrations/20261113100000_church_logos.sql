-- Design pass 8, step 6 (batch B): church logos.
-- A public Storage bucket `church-logos` holds the logo a facilitator uploads on Details. Logos are
-- shown on the TV and join pages, which read the church's `logo_url` as a plain address, so the
-- bucket is public to read. Nobody writes to it from a browser: there are no storage policies
-- here, so the anon and authenticated roles cannot insert, update or delete objects. The upload
-- route writes with the service role after checking the facilitator. PNG, JPEG and WebP only
-- (no SVG, which can carry script), 1 MB at most.
-- The Storage tables belong to Supabase's storage service, which may not exist yet when a fresh
-- database replays migrations. The function is safe to run again.
begin;

create function private.church_logos_setup() returns text
language plpgsql security definer set search_path='' as $$
begin
 if to_regclass('storage.buckets') is null then return 'storage not started'; end if;
 execute $sql$insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('church-logos','church-logos',true,1048576,array['image/png','image/jpeg','image/webp'])
  on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types$sql$;
 return 'ready';
end $$;
revoke all on function private.church_logos_setup() from public,anon,authenticated;
grant execute on function private.church_logos_setup() to service_role;
do $$ begin perform private.church_logos_setup();
exception when others then raise notice 'Storage setup skipped: %',sqlerrm; end $$;

commit;
