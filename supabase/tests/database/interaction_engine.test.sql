begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('87000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(1000+n))::text,true); end $$;
create function tests.live() returns uuid language sql security definer set search_path='' as $$ select live_session_id from public.room_states where engagement_id=tests.id(100) $$;
create function tests.results() returns jsonb language sql security definer set search_path='' as $$ select results from public.room_states where engagement_id=tests.id(100) $$;
create function tests.ctl(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$
 select public.room_control(tests.id(100),tests.id(n),action,jsonb_build_object('from',tests.live())||p) $$;
create function tests.pick(n integer,session integer,choice text,action text default 'submit',revision integer default 0) returns jsonb language sql as $$
 select public.live_submit(tests.id(100),tests.id(n),tests.id(session),revision,action,'',now(),null,0,jsonb_build_object('choice',choice)) $$;
create function tests.save(n integer,kind text,options jsonb,state text default 'ready',revision integer default null,prompt text default 'Prompt') returns jsonb language sql as $$
 select public.show_write(tests.id(100),'save',jsonb_build_object('id',tests.id(n),'revision',revision,'title','Step '||n,'part','Day 1','mode','live','interaction',kind,
  'prompt',prompt,'phone_depth','','notes','','lands_in','','segment','','state',state,'planned_minutes',5,'max_sends',3,'max_characters',28,'max_words',3,
  'settings',jsonb_build_object('anonymous',true,'burst_minutes',4,'join_strip',false),'options',options)) $$;
create function tests.broadcast(n integer) returns jsonb language sql security definer set search_path='' as $$
 select payload from realtime.messages where topic like 'live:'||tests.id(100)||':%' and event='room' and payload->'answer'->>'id'=tests.id(n)::text limit 1 $$;
grant execute on all functions in schema tests to authenticated,anon,service_role;

insert into churches(id,name,timezone) values(tests.id(200),'Riverside Church','America/Toronto');
insert into engagements(id,church_id,title,settings) values(tests.id(100),tests.id(200),'Library room','{"scripture_translation":"NIV"}');
insert into auth.users(id,email,email_confirmed_at)
select tests.id(n),case when n=1 then 'fac1@clearway.co' else 'person'||n||'@example.org' end,now() from generate_series(1,5)n;
insert into auth.sessions(id,user_id) select tests.id(1000+n),tests.id(n) from generate_series(1,5)n;
insert into auth.identities(user_id,provider,provider_id,identity_data) select id,'google',id::text,jsonb_build_object('email',email,'email_verified',true) from auth.users where id=tests.id(1);
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method) values(gen_random_uuid(),tests.id(1001),now(),now(),'oauth');
insert into clearway_users(id,auth_user_id,name,email,is_admin,team_hub_team_member_id) values(tests.id(701),tests.id(1),'Chris Vacher','fac1@clearway.co',false,tests.id(801));
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values(tests.id(100),tests.id(701),'lead');
insert into attendees(id,engagement_id,auth_user_id,name,email,verified_at,room_role) values
 (tests.id(503),tests.id(100),tests.id(3),'Priya Shah','person3@example.org',now(),'participant'),
 (tests.id(505),tests.id(100),tests.id(5),'Ben Ortiz','person5@example.org',now(),'participant');
insert into device_sessions(engagement_id,attendee_id,auth_session_id) values(tests.id(100),tests.id(503),tests.id(1003)),(tests.id(100),tests.id(505),tests.id(1005));
insert into private.tv_devices(id,proof,engagement_id,label,paired_at) values(tests.id(450),repeat('a',64),tests.id(100),'Front TV',now());
insert into private.live_tv_sessions(id,engagement_id,auth_user_id,auth_session_id,device_id) values(tests.id(400),tests.id(100),tests.id(4),tests.id(1004),tests.id(450));

-- The registry: the three kinds milestone 2 runs, private to the database.
select ok((select array_agg(kind) from private.interaction_kinds) @> array['word_cloud','wall','content'],'Word cloud, wall and content are registered');
select ok((select relforcerowsecurity from pg_class where oid='private.interaction_kinds'::regclass),'The registry forces row-level security');
select ok(not has_table_privilege('authenticated','private.interaction_kinds','select'),'Browsers cannot read the registry directly');
select ok(not has_table_privilege('authenticated','private.session_media','select'),'Browsers cannot read stored images directly');
select throws_ok($$insert into sessions(engagement_id,title,interaction) values('87000000-0000-4000-8000-000000000100','Unknown','not_a_kind')$$,'23503',null,'A session cannot use a kind that is not registered');

-- A later step adds a kind by registering it and supplying its own functions. Nothing shared
-- is redefined. This test kind is one answer per person, structured, with option keys.
insert into private.interaction_kinds(kind,label,input,one_per_person,counts,structured,shares_answers,spotlight,named,position) values
 ('test_pick','Test pick',true,true,'people',true,true,'key','never',90),
 ('test_secret','Test secret',true,true,'people',false,false,'none','never',91);
create function private.parse_test_pick(p_session public.sessions,p_text text,p_value jsonb) returns jsonb language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from jsonb_array_elements(p_session.options->'items') o where o->>'key'=p_value->>'choice')
  then jsonb_build_object('status','ok','text',p_value->>'choice','answers',jsonb_build_array(jsonb_build_object('key',p_value->>'choice','text',p_value->>'choice')),'value',jsonb_build_object('choice',p_value->>'choice'))
  else jsonb_build_object('status','invalid_answer') end $$;
create function private.results_test_pick(p_engagement uuid,p_session uuid,p_hidden text[]) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('total',count(*),'people',count(distinct attendee_id),'bars',coalesce(jsonb_object_agg(c,n),'{}'::jsonb))
 from (select attendee_id,value->>'choice' as c,count(*) over(partition by value->>'choice') as n from public.submissions
  where session_id=p_session and not deleted and not withdrawn and not hidden) x $$;
create function private.options_test_pick(p jsonb,p_engagement uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select case when jsonb_typeof(p->'items')='array' then jsonb_build_object('items',p->'items') end $$;
create function private.parse_test_secret(p_session public.sessions,p_text text,p_value jsonb) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('status','ok','text',p_text,'answers','[]'::jsonb) $$;
create function private.results_test_secret(p_engagement uuid,p_session uuid,p_hidden text[]) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('total',count(*),'people',count(distinct attendee_id)) from public.submissions where session_id=p_session and not deleted and not withdrawn $$;

set local role authenticated;
select tests.login(1);
select is(tests.save(310,'test_pick','{"items":[{"key":"a","text":"Alpha"},{"key":"b","text":"Beta"}]}')->>'status','ok','The run of show takes a registered kind with its options');
select is(tests.save(311,'test_pick','{"nope":true}')->>'status','invalid_request','Its own options check refuses bad options');
select is(tests.save(311,'test_secret','{"anything":1}')->>'status','invalid_request','A kind with no options function takes only empty options');
select is(tests.save(311,'test_secret','{}')->>'status','ok','A kind with no options function saves with none');
select is(tests.save(312,'content','{"screen":"scripture","reference":" Habakkuk 2:2 "}','ready',null,'Write down the **revelation** and make it plain')->>'status','ok','A Scripture screen saves its reference');
select is(tests.save(313,'content','{"screen":"sermon"}')->>'status','invalid_request','An unknown content screen is refused');
select is(tests.save(313,'content','{"screen":"holding","outline":"9:00 Welcome\n9:15 Celebration","color":"red"}')->>'status','invalid_request','An unknown content field is refused');
select is(tests.save(313,'content','{"screen":"holding","outline":"9:00 Welcome\n9:15 Celebration","line":""}')->>'status','ok','A holding screen saves its outline');
select is(tests.save(314,'content','{"screen":"image","media":"87000000-0000-4000-8000-000000000999"}')->>'status','invalid_request','An image screen cannot point at an image that does not exist');
select is(public.show_write(tests.id(100),'save',jsonb_build_object('id',tests.id(315),'title','Named','part','Day 1','mode','live','interaction','word_cloud','prompt','','phone_depth','','notes','','lands_in','','segment','','state','draft','planned_minutes',5,'max_sends',3,'max_characters',28,'max_words',3,
  'settings',jsonb_build_object('anonymous',false,'burst_minutes',4,'join_strip',false),'options','{}'::jsonb))->>'status','invalid_request','A kind that is never named refuses named answers');
reset role;
select is((select options from sessions where id=tests.id(312)),'{"screen":"scripture","reference":"Habakkuk 2:2"}'::jsonb,'Options are trimmed and empty fields dropped');
select is((select options->>'outline' from sessions where id=tests.id(313)),E'9:00 Welcome\n9:15 Celebration','The outline is kept as written');
set local role authenticated;
select tests.login(1);
select ok((public.show_read(tests.id(100))->'context'->'kinds') @> '[{"kind":"test_pick","counts":"people","structured":true}]','The run of show lists the kinds this server can run');
select is(public.show_read(tests.id(100))->'context'->>'scripture_translation','NIV','The run of show knows the engagement translation');

-- Going live on the content screen: the translation defaults from the engagement.
select is(tests.ctl(900,'go_live',jsonb_build_object('session',tests.id(312)))->>'status','ok','Go live on Scripture');
select tests.login(4);
select is(public.live_snapshot(tests.id(100))->'session'->'options'->>'translation','NIV','The TV gets the engagement translation');
select is(public.live_snapshot(tests.id(100))->'session'->'kind'->>'input','false','A content screen takes no input');
select tests.login(3);
select is(tests.pick(950,312,'a')->>'status','invalid_session','Phones cannot answer a content screen');

-- One answer per person, counted by people.
select tests.login(1);
select is(tests.ctl(901,'go_live',jsonb_build_object('session',tests.id(310)))->>'status','ok','Go live on the test kind');
select is((tests.results()->>'total')::integer,0,'Empty structure: nothing counted yet');
select tests.login(3);
select is(tests.pick(951,310,'a')->>'status','accepted','A structured answer is accepted with its value');
select is(tests.pick(952,310,'zzz')->>'status','invalid_answer','The kind refuses a value outside its options');
select is(tests.pick(953,310,'b')->>'status','accepted','A second answer from the same person is accepted');
select is(tests.pick(953,310,'b')->>'status','duplicate','A resend is a duplicate');
select is(tests.broadcast(953)->'answer'->'replaced','["87000000-0000-4000-8000-000000000951"]'::jsonb,'The event names the answer it replaced');
select is(tests.broadcast(953)->'answer'->'value','{"choice":"b"}'::jsonb,'The event carries the structured value');
select tests.login(5);
select is(tests.pick(954,310,'b')->>'status','accepted','Another person answers');
select tests.login(4);
select is(public.live_snapshot(tests.id(100))->'state'->'results','{"total":2,"people":2,"words":[],"bars":{"b":2}}'::jsonb,'Results come from the kind, one answer per person');
select is(jsonb_array_length(public.live_snapshot(tests.id(100))->'answers'),2,'The snapshot holds only standing answers');
select is(public.live_snapshot(tests.id(100))->'session'->'kind'->>'counts','people','The TV counts people for this kind');
select tests.login(3);
select is((public.phone_room(tests.id(100))->'answers'->0->>'replaced')::boolean,true,'The phone sees its own earlier answer as replaced');
select is(tests.pick(951,310,'a','change',1)->>'status','accepted','Changing the earlier answer brings it back');
select tests.login(4);
select is(public.live_snapshot(tests.id(100))->'state'->'results','{"total":2,"people":2,"words":[],"bars":{"a":1,"b":1}}'::jsonb,'and replaces the later one');
reset role;
select is((select count(*)::integer from submissions where session_id=tests.id(310) and attendee_id=tests.id(503) and not withdrawn),1,'Still one standing answer per person');
select is((select replaced_by from submissions where id=tests.id(953)),tests.id(951),'The replaced answer names what replaced it');
set local role authenticated;

-- Bursts, phones down and Spotlight work by kind: an option key with no votes yet counts.
select tests.login(1);
select is(tests.ctl(902,'start_burst','{"minutes":3}')->>'status','ok','A burst starts on any kind that takes input');
select is(tests.ctl(903,'end_burst')->>'status','ok','and ends');
select is(tests.ctl(904,'open_phones')->>'status','ok','Phones open again');
select is(tests.ctl(905,'spotlight','{"item":"a"}')->>'status','ok','Spotlight an option');
select is(tests.ctl(906,'clear_spotlight')->>'status','ok','Clear it');
select is(tests.ctl(907,'spotlight','{"item":"nope"}')->>'status','missing','An unknown option cannot be spotlit');

-- A kind that does not share answers: only the count reaches the TV.
select is(tests.ctl(908,'go_live',jsonb_build_object('session',tests.id(311)))->>'status','ok','Go live on a private kind');
select tests.login(3);
select is(public.live_submit(tests.id(100),tests.id(960),tests.id(311),0,'submit','My private answer',now(),null,0)->>'status','accepted','A private answer is accepted');
select ok(tests.broadcast(960) is not null and tests.broadcast(960)->'answer'->>'text' is null and tests.broadcast(960)::text not like '%My private answer%','Its text never travels in the event');
select tests.login(4);
select is(jsonb_array_length(public.live_snapshot(tests.id(100))->'answers'),0,'The TV snapshot carries none of its answers');
select is((public.live_snapshot(tests.id(100))->'state'->'results'->>'people')::integer,1,'only the count');
select tests.login(1);
select is(tests.ctl(909,'spotlight','{"item":"x"}')->>'status','invalid_state','A kind without Spotlight refuses it');
select tests.login(3);
select is((public.phone_room(tests.id(100))->'answers'->-1->>'text'),'My private answer','The person still sees their own private answer');

-- Images for the image or document page.
select tests.login(1);
select is(tests.save(314,'content','{"screen":"image"}','ready')->>'status','ok','Save the image screen first');
select is(public.media_write(tests.id(100),tests.id(314),'image/png',2,2,encode('\x89504e470d0a1a0a0000'::bytea,'base64'))->>'status','ok','The facilitator stores a PNG');
select is(public.media_write(tests.id(100),tests.id(314),'image/png',2,2,encode('GIF89a'::bytea,'base64'))->>'status','invalid_request','Bytes that are not the type they claim are refused');
select is(public.media_write(tests.id(100),tests.id(310),'image/png',2,2,encode('\x89504e470d0a1a0a00'::bytea,'base64'))->>'status','missing','Only a content session takes an image');
reset role;
create temporary table m as select id from private.session_media where session_id=tests.id(314);
grant select on m to authenticated;
set local role authenticated;
select is(tests.save(314,'content',jsonb_build_object('screen','image','media',(select id from m)),'ready',0)->>'status','ok','The image screen saves with its image');
select tests.login(3);
select is(public.media_write(tests.id(100),tests.id(314),'image/png',2,2,encode('\x89504e470d0a1a0a00'::bytea,'base64'))->>'status','denied','Phones cannot store images');
select is(public.media_read(tests.id(100),(select id from m))->>'status','missing','A phone cannot read the image of a step the room has not reached');
select tests.login(4);
select is(public.media_read(tests.id(100),(select id from m))->>'mime','image/png','The TV reads it');
select tests.login(1);
select is(tests.ctl(910,'go_live',jsonb_build_object('session',tests.id(314)))->>'status','ok','Go live on the image');
select tests.login(3);
select is(public.media_read(tests.id(100),(select id from m))->>'data',encode('\x89504e470d0a1a0a0000'::bytea,'base64'),'Once reached, a phone reads it');
reset role;
set local role anon;
select throws_ok($$select public.media_read('87000000-0000-4000-8000-000000000100'::uuid,'87000000-0000-4000-8000-000000000001'::uuid)$$,'42501',null,'Anonymous callers cannot read images');
reset role;

-- Every new function is private or an invoker wrapper.
select ok(not (select prosecdef from pg_proc where oid='public.media_read(uuid,uuid)'::regprocedure),'The public image reader is an invoker');
select ok(not (select prosecdef from pg_proc where oid='public.live_submit(uuid,uuid,uuid,integer,text,text,timestamptz,timestamptz,double precision,jsonb)'::regprocedure),'The public submit is an invoker');
select ok(not has_function_privilege('authenticated','private.results_word_cloud(uuid,uuid,text[])','execute'),'Results functions are not callable by browsers');
select ok(not has_function_privilege('authenticated','private.session_options(text,jsonb,uuid)','execute'),'Options checks are not callable by browsers');
select * from finish();
rollback;
