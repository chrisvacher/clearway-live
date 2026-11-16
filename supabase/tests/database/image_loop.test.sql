-- Batch 1 (November 15): the image loop (LP-1) and a loop as the Home screen.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('8d000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
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
insert into private.engagement_images(id,engagement_id,path,mime,bytes,name,uploaded_at) values
 (tests.id(50),tests.id(10),'a/50.png','image/png',10,'Welcome.png',now()),(tests.id(51),tests.id(10),'a/51.png','image/png',10,'Wifi.png',now()),
 (tests.id(52),tests.id(10),'a/52.png','image/png',10,'Pending.png',null),(tests.id(53),tests.id(11),'b/53.png','image/png',10,'Other.png',now());

-- Loop options
select is(private.session_options('content',jsonb_build_object('screen','loop','images',jsonb_build_array(tests.id(51),tests.id(50))),tests.id(10)),
 jsonb_build_object('screen','loop','images',jsonb_build_array(tests.id(51),tests.id(50)),'seconds',8,'transition','fade'),'A loop keeps its images in order, 8 seconds and a cross-fade by default');
select is(private.session_options('content','{"screen":"loop"}',tests.id(10))->'images','[]'::jsonb,'A loop with no images yet saves as a draft');
select is(private.session_options('content',jsonb_build_object('screen','loop','images',jsonb_build_array(tests.id(50)),'seconds',3,'transition','cut'),tests.id(10))->>'transition','cut','Seconds from 3 and a cut are kept');
select is(private.session_options('content','{"screen":"loop","seconds":2}',tests.id(10)),null,'Under 3 seconds is refused');
select is(private.session_options('content','{"screen":"loop","seconds":61}',tests.id(10)),null,'over 60 seconds is refused');
select is(private.session_options('content','{"screen":"loop","seconds":5.5}',tests.id(10)),null,'and so is part of a second');
select is(private.session_options('content','{"screen":"loop","transition":"wipe"}',tests.id(10)),null,'Only cross-fade, slide or cut');
select is(private.session_options('content',jsonb_build_object('screen','loop','images',jsonb_build_array(tests.id(52))),tests.id(10)),null,'An image still uploading is refused');
select is(private.session_options('content',jsonb_build_object('screen','loop','images',jsonb_build_array(tests.id(53))),tests.id(10)),null,'as is another engagement''s image');
select is(private.session_options('content',jsonb_build_object('screen','loop','images',(select jsonb_agg(tests.id(50)) from generate_series(1,31))),tests.id(10)),null,'and more than 30 images');
select is(private.session_options('content','{"screen":"loop","line":"x"}',tests.id(10)),null,'A loop takes no other screen''s fields');
select is(private.session_options('content','{"screen":"headline"}',tests.id(10)),'{"screen":"headline"}'::jsonb,'Other screens are unchanged');

insert into sessions(id,engagement_id,title,part,position,interaction,prompt,state,options) values
 (tests.id(60),tests.id(10),'Walk-in loop','Day 1',1,'content','','ready',jsonb_build_object('screen','loop','images',jsonb_build_array(tests.id(50),tests.id(51)),'seconds',8,'transition','fade')),
 (tests.id(61),tests.id(10),'Headline','Day 1',2,'content','Hello','ready','{"screen":"headline"}'),
 (tests.id(62),tests.id(11),'Their loop','Day 1',1,'content','','ready',jsonb_build_object('screen','loop','images',jsonb_build_array(tests.id(53)))),
 (tests.id(63),tests.id(10),'Break loop','Day 1',3,'content','','ready',jsonb_build_object('screen','loop','images',jsonb_build_array(tests.id(51)),'seconds',12,'transition','slide'));

-- Choosing Home
set local role authenticated; select tests.login(2);
select is(home_list(tests.id(10))->'home','null'::jsonb,'No Home loop to begin with');
select is(jsonb_array_length(home_list(tests.id(10))->'loops'),2,'The engagement''s two loops are offered');
select is(home_choose(tests.id(10),tests.id(61))->>'status','missing','A step that isn''t a loop can''t be Home');
select is(home_choose(tests.id(10),tests.id(62))->>'status','missing','nor another engagement''s loop');
select is(home_choose(tests.id(10),tests.id(60))->>'status','ok','The facilitator sets the Walk-in loop as Home');
select is(home_list(tests.id(10))->>'home',tests.id(60)::text,'and it is Home');
select tests.login(3);
select is(home_list(tests.id(10))->>'status','denied','Another facilitator can''t see it');
select is(home_choose(tests.id(10),null)->>'status','denied','or change it');
reset role;

-- The room state
select is(private.live_public_state(tests.id(10))#>'{state,home}',
 jsonb_build_object('session',tests.id(60),'images',jsonb_build_array(tests.id(50),tests.id(51)),'seconds',8,'transition','fade'),'The room state carries the Home loop');
select ok(private.live_public_state(tests.id(10))#>'{state,preload}' @> jsonb_build_array(tests.id(50),tests.id(51)),'and the TV preloads its images while nothing is live');
select ok((private.live_public_state(tests.id(10))#>>'{state,screen_started_at}') is not null,'and when the screen changed');
update room_states set screen_started_at='2026-01-01' where engagement_id=tests.id(10);
update room_states set tv_content='join' where engagement_id=tests.id(10);
select ok((select screen_started_at>'2026-01-02' from room_states where engagement_id=tests.id(10)),'A new TV screen restarts the clock');
update room_states set screen_started_at='2026-01-01' where engagement_id=tests.id(10);
update room_states set phones_down=true where engagement_id=tests.id(10);
select is((select screen_started_at from room_states where engagement_id=tests.id(10)),'2026-01-01'::timestamptz,'Other changes leave it');
update room_states set live_session_id=tests.id(63),tv_content='session',phones_down=false where engagement_id=tests.id(10);
select ok((select screen_started_at>'2026-01-02' from room_states where engagement_id=tests.id(10)),'A new live step restarts it');

-- Phones that haven't joined
set local role service_role;
select is(home_join(tests.id(10))->'home','null'::jsonb,'Not while a step is live');
reset role;
update room_states set live_session_id=null,tv_content='holding' where engagement_id=tests.id(10);
set local role service_role;
select is(home_join(tests.id(10))#>'{home,images}',jsonb_build_array(tests.id(50),tests.id(51)),'With Home on the TV, phones joining see the Home loop');
select is(home_image_path(tests.id(10),tests.id(50)),'a/50.png','and its images');
select is(home_image_path(tests.id(10),tests.id(52)),null,'but no other image');
reset role;
set local role authenticated; select tests.login(2);
select throws_ok($$select public.home_join('8d000000-0000-4000-8000-000000000010')$$,'42501',null,'A browser can''t call it');
reset role;

-- Editing the Home loop resends the room while Home is up
create temporary table before_count as select count(*) n from realtime.messages where topic like 'live:'||tests.id(10)::text||':%';
update sessions set options=jsonb_set(options,'{seconds}','5') where id=tests.id(60);
select ok((select count(*) from realtime.messages where topic like 'live:'||tests.id(10)::text||':%')>(select n from before_count),'Editing the Home loop resends the room');
select is((private.live_public_state(tests.id(10))#>>'{state,home,seconds}')::integer,5,'with the new timing');
update sessions set deleted=true where id=tests.id(60);
select is(private.live_public_state(tests.id(10))#>'{state,home}','null'::jsonb,'Removing the Home loop leaves the usual holding screen');

-- Every new function is private or an invoker wrapper
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('home_list','home_choose','home_join','home_image_path') and p.prosecdef),0,
 'The public Home functions are invoker wrappers');

select * from finish();
rollback;
