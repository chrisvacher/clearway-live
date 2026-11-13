-- Design pass 8, step 6 (batch B): the church-logos bucket is public to read, limited to small
-- PNG, JPEG and WebP files, and closed to writes from every browser role.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
reset role;
select private.church_logos_setup();
select is((select public from storage.buckets where id='church-logos'),true,'The church logo bucket is public to read');
select is((select file_size_limit from storage.buckets where id='church-logos'),1048576::bigint,'with a 1 MB limit');
select is((select allowed_mime_types from storage.buckets where id='church-logos'),array['image/png','image/jpeg','image/webp'],'and PNG, JPEG and WebP only');
select is((select count(*)::integer from pg_policies where schemaname='storage' and tablename='objects' and (qual ilike '%church-logos%' or with_check ilike '%church-logos%')),0,'No policy opens the bucket to a browser');
set local role anon;
select throws_ok($$insert into storage.objects(bucket_id,name) values('church-logos','x/a.png')$$,'42501',null,'Anonymous callers cannot add a logo');
set local role authenticated;
select throws_ok($$insert into storage.objects(bucket_id,name) values('church-logos','x/a.png')$$,'42501',null,'A signed-in caller cannot add a logo');
reset role;
insert into storage.objects(bucket_id,name) values('church-logos','x/b.png');
set local role authenticated;
delete from storage.objects where bucket_id='church-logos';
update storage.objects set name='x/c.png' where bucket_id='church-logos';
reset role;
select is((select array_agg(name) from storage.objects where bucket_id='church-logos'),array['x/b.png'],'A signed-in caller cannot delete or rename a logo');
select * from finish();
rollback;
