-- Batch 1 (November 15): engagement images, Image steps and one image per step.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('8c000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer,sid integer default null) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'session_id',tests.id(coalesce(sid,200+n)),'role','authenticated')::text,true);
end $$;
grant usage on schema tests to service_role,authenticated,anon;
grant execute on all functions in schema tests to service_role,authenticated,anon;
insert into churches(id,name,timezone) values(tests.id(20),'Room A church','America/Toronto'),(tests.id(21),'Room B church','America/Toronto');
insert into engagements(id,church_id,title,status) values(tests.id(10),tests.id(20),'Room A','pre_call'),(tests.id(11),tests.id(21),'Room B','retreat');
insert into auth.users(id,email,email_confirmed_at) values(tests.id(2),'fac@clearway.co',now()),(tests.id(3),'other@clearway.co',now());
insert into auth.identities(user_id,provider,provider_id,identity_data)
select id,'google',id::text,jsonb_build_object('email',email,'email_verified',true) from auth.users where id in(tests.id(2),tests.id(3));
insert into auth.sessions(id,user_id) values(tests.id(202),tests.id(2)),(tests.id(203),tests.id(3));
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method)
select gen_random_uuid(),id,now(),now(),'oauth' from auth.sessions where id in(tests.id(202),tests.id(203));
insert into clearway_users(id,auth_user_id,name,email,team_hub_team_member_id) values
 (tests.id(302),tests.id(2),'Facilitator','fac@clearway.co',tests.id(402)),(tests.id(303),tests.id(3),'Other','other@clearway.co',tests.id(403));
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values(tests.id(10),tests.id(302),'lead'),(tests.id(11),tests.id(303),'lead');
select private.engagement_images_setup();

-- The bucket
select is((select public from storage.buckets where id='engagement-images'),false,'The image bucket is private');
select is((select file_size_limit from storage.buckets where id='engagement-images'),20971520::bigint,'with a 20 MB limit');
select is((select allowed_mime_types from storage.buckets where id='engagement-images'),array['image/png','image/jpeg','image/webp'],'and PNG, JPG and WebP only');
select is((select count(*)::integer from pg_policies where schemaname='storage' and tablename='objects' and (qual ilike '%engagement-images%' or with_check ilike '%engagement-images%')),0,'No policy opens the bucket to a browser');
select ok(not has_table_privilege('authenticated','private.engagement_images','select'),'No browser role reads the image table');

-- Recording an image
set local role authenticated; select tests.login(2);
select is(image_begin(tests.id(10),tests.id(50),'Slide1.png','image/png',1000)->>'status','ok','A facilitator records an image for their engagement');
select is(image_begin(tests.id(10),tests.id(50),'Slide1.png','image/png',1000)->>'path',tests.id(10)::text||'/'||tests.id(50)::text||'.png','The same id again is the same image, in the engagement''s folder');
select is(image_begin(tests.id(11),tests.id(51),'x.png','image/png',1000)->>'status','denied','but not for someone else''s engagement');
select is(image_begin(tests.id(10),tests.id(52),'x.gif','image/gif',1000)->>'status','invalid_type','A GIF is refused');
select is(image_begin(tests.id(10),tests.id(53),'x.png','image/png',20971521)->>'status','too_large','An image over 20 MB is refused');
select is(image_finish(tests.id(10),tests.id(50),1920,1080)->>'status','not_uploaded','Finishing before the bytes are in Storage is refused');
reset role;
insert into storage.objects(bucket_id,name,metadata) values('engagement-images',tests.id(10)::text||'/'||tests.id(50)::text||'.png','{"size":1234}');
set local role authenticated; select tests.login(2);
select is(image_finish(tests.id(10),tests.id(50),1920,1080)#>>'{image,width}','1920','Once the object is there, the shape is recorded');
select is(jsonb_array_length(image_list(tests.id(10))->'images'),1,'The engagement lists its uploaded image');
select is(image_read(tests.id(10),tests.id(50))->>'status','ok','Its facilitator may read it');
select tests.login(3);
select is(image_read(tests.id(10),tests.id(50))->>'status','denied','Another engagement''s facilitator may not');
select is(image_list(tests.id(10))->>'status','denied','nor list its images');
reset role;

-- An image on a step
insert into sessions(id,engagement_id,title,part,position,interaction,prompt,state,options) values
 (tests.id(60),tests.id(10),'Headline','Day 1',1,'content','Hello','ready','{"screen":"headline"}'),
 (tests.id(61),tests.id(10),'Question','Day 1',2,'word_cloud','One word','ready','{}');
select is(private.session_options('content',jsonb_build_object('screen','image','image',jsonb_build_object('id',tests.id(50)),'untitled',true),tests.id(10)),
 jsonb_build_object('screen','image','image',jsonb_build_object('id',tests.id(50),'display','fill'),'untitled',true),'An Image step fills, and keeps its untitled mark');
select is(private.session_options('content',jsonb_build_object('screen','headline','image',jsonb_build_object('id',tests.id(50),'display','place')),tests.id(10))#>>'{image,display}','place','A headline can show its image In place');
select is(private.session_options('word_cloud',jsonb_build_object('image',jsonb_build_object('id',tests.id(50),'display','place')),tests.id(10))#>>'{image,display}','place','A question shows its image In place');
select is(private.session_options('word_cloud',jsonb_build_object('image',jsonb_build_object('id',tests.id(50),'display','fill')),tests.id(10)),null,'but never Fill: the live results need the screen');
select is(private.session_options('word_cloud',jsonb_build_object('image',jsonb_build_object('id',tests.id(50))),tests.id(10))#>>'{image,display}','place','A question''s image is In place by default');
select is(private.session_options('content',jsonb_build_object('screen','headline','image',jsonb_build_object('id',tests.id(51))),tests.id(10)),null,'An image that isn''t this engagement''s is refused');
select is(private.session_options('content',jsonb_build_object('screen','screen_check','image',jsonb_build_object('id',tests.id(50))),tests.id(10)),null,'A screen check has no image');
select is(private.session_options('word_cloud','{"untitled":"yes"}'::jsonb,tests.id(10)),null,'Untitled is true or false');

-- The TV loads the next steps' images first
update sessions set options=jsonb_build_object('screen','image','image',jsonb_build_object('id',tests.id(50),'display','fill')) where id=tests.id(61);
update sessions set interaction='content' where id=tests.id(61);
insert into room_states(engagement_id) values(tests.id(10)) on conflict do nothing;
select ok(private.image_preload(tests.id(10)) ? tests.id(50)::text,'With nothing live, the next steps'' images are in the preload list');
select ok(private.live_public_state(tests.id(10))#>'{state,preload}' ? tests.id(50)::text,'and in the room''s public state');

-- A deleted engagement takes its images with it
update engagements set deleted=true where id=tests.id(10);
select is((select deleted from private.engagement_images where id=tests.id(50)),true,'Deleting the engagement marks its images deleted');
select is(jsonb_array_length(private.image_purge_list(10)),1,'and lists them for the operations job to remove from Storage');
select is(private.image_purged(array[tests.id(50)]),1,'which then marks them removed');
select is(jsonb_array_length(private.image_purge_list(10)),0,'and they leave the list');
select * from finish();
rollback;
