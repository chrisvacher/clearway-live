begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('8e000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(1000+n))::text,true); end $$;
create function tests.live() returns uuid language sql security definer set search_path='' as $$ select live_session_id from public.room_states where engagement_id=tests.id(100) $$;
create function tests.version() returns bigint language sql security definer set search_path='' as $$ select version from public.room_states where engagement_id=tests.id(100) $$;
create function tests.state(n integer) returns text language sql security definer set search_path='' as $$ select state from public.sessions where id=tests.id(n) $$;
create function tests.ctl(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$
 select public.room_control(tests.id(100),tests.id(n),action,case when action in ('refresh_phones','tv_on_phones','room_size','close_part') then p else jsonb_build_object('from',tests.live())||p end)
$$;
create function tests.send(n integer,session integer,answer text default 'Hope',queued timestamptz default null) returns jsonb language sql as $$
 select public.live_submit(tests.id(100),tests.id(n),tests.id(session),0,'submit',answer,coalesce(queued,now()),queued,0)
$$;
grant execute on all functions in schema tests to authenticated,anon,service_role;

insert into churches(id,name,timezone) values(tests.id(200),'Church A','America/Toronto'),(tests.id(201),'Church B','America/Toronto');
insert into engagements(id,church_id,title) values(tests.id(100),tests.id(200),'Live A'),(tests.id(101),tests.id(201),'Live B');
insert into auth.users(id,email,email_confirmed_at)
select tests.id(n),case when n in(1,2,6) then 'fac'||n||'@clearway.co' else 'person'||n||'@example.org' end,now() from generate_series(1,6)n;
insert into auth.sessions(id,user_id) select tests.id(1000+n),tests.id(n) from generate_series(1,6)n;
insert into auth.identities(user_id,provider,provider_id,identity_data)
select id,'google',id::text,jsonb_build_object('email',email,'email_verified',true) from auth.users where id in(tests.id(1),tests.id(2),tests.id(6));
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method)
select gen_random_uuid(),tests.id(1000+n),now(),now(),'oauth' from unnest(array[1,2,6])n;
insert into clearway_users(id,auth_user_id,name,email,is_admin,team_hub_team_member_id)
select tests.id(700+n),tests.id(n),case n when 1 then 'Chris Vacher' when 2 then 'Jaisy Tam' else 'Other Facilitator' end,'fac'||n||'@clearway.co',false,tests.id(800+n) from unnest(array[1,2,6])n;
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values(tests.id(100),tests.id(701),'lead'),(tests.id(100),tests.id(702),'co_facilitator'),(tests.id(101),tests.id(706),'lead');
insert into attendees(id,engagement_id,auth_user_id,name,email,verified_at,room_role) values(tests.id(503),tests.id(100),tests.id(3),'Priya Shah','person3@example.org',now(),'participant');
insert into device_sessions(engagement_id,attendee_id,auth_session_id) values(tests.id(100),tests.id(503),tests.id(1003));
insert into private.tv_devices(id,proof,engagement_id,label,paired_at) values(tests.id(450),repeat('a',64),tests.id(100),'Front TV',now());
insert into private.live_tv_sessions(id,engagement_id,auth_user_id,auth_session_id,device_id) values(tests.id(400),tests.id(100),tests.id(4),tests.id(1004),tests.id(450));
insert into sessions(id,engagement_id,part,position,segment,title,interaction,prompt,state,max_sends) values
 (tests.id(310),tests.id(100),'Day 1',0,'','Welcome','content','Welcome','ready',10),
 (tests.id(311),tests.id(100),'Day 1',1,'Five Lenses','Five Lenses: Congregation','word_cloud','Congregation','ready',10),
 (tests.id(312),tests.id(100),'Day 1',2,'Five Lenses','Five Lenses: Community','wall','Community','ready',10),
 (tests.id(313),tests.id(100),'Day 1',3,'','Break','content','Break','draft',10),
 (tests.id(314),tests.id(100),'Day 1',4,'','Celebration','word_cloud','Celebrate','ready',10),
 (tests.id(315),tests.id(100),'Day 2',0,'','Day two','wall','Again','ready',10),
 (tests.id(316),tests.id(101),'Day 1',0,'','Other room','wall','Private','ready',10);
insert into private.session_notes(session_id,engagement_id,notes) values(tests.id(311),tests.id(100),'PRESENTER-SECRET');

-- Batch 1 (November 15): hide a response (MD-1): who hid it and when, the facilitators only, and the counts and report.
set local role authenticated;
select tests.login(1);
select is(tests.ctl(1,'go_live',jsonb_build_object('session',tests.id(312)))->>'status','ok','The wall goes live');
select tests.login(3);
select is(tests.send(901,312,'Young families')->>'status','accepted','An answer');
select is(tests.send(902,312,'Pastor never listens')->>'status','accepted','and another from the same person');
select tests.login(1);
select is((public.control_status(tests.id(100))->'counts'->>'answered')::integer,1,'One person has answered');

-- Hiding records who and when
select is(tests.ctl(2,'hide',jsonb_build_object('item',tests.id(902)))->>'status','ok','Chris hides one answer');
reset role;
select ok((select hidden and hidden_by=tests.id(701) and hidden_at is not null from submissions where id=tests.id(902)),'The answer records who hid it and when');
set local role authenticated; select tests.login(1);
select is((select i->>'hidden_by' from jsonb_array_elements(public.control_status(tests.id(100))->'items') i where i->>'key'=tests.id(902)::text),'Chris','The Responses list says who hid it');
select ok((select (i->>'hidden_at') is not null from jsonb_array_elements(public.control_status(tests.id(100))->'items') i where i->>'key'=tests.id(902)::text),'and when');
select is((select count(*)::integer from jsonb_array_elements(public.control_status(tests.id(100))->'items') i where i ? 'hidden_by'),1,'Shown answers carry no hide details');
select is((public.live_snapshot(tests.id(100))->'state'->'results'->>'total')::integer,1,'The submissions badge leaves it out');
select is((public.control_status(tests.id(100))->'counts'->>'answered')::integer,1,'The person still counts: they have another answer shown');

-- A person whose only answer is hidden drops out of the people counts
select tests.login(2);
select is(tests.ctl(3,'hide',jsonb_build_object('item',tests.id(901)))->>'status','ok','The co-facilitator hides the other');
reset role;
select is((select hidden_by from submissions where id=tests.id(901)),tests.id(702),'recorded as the co-facilitator');
set local role authenticated; select tests.login(1);
select is((public.live_snapshot(tests.id(100))->'state'->'results'->>'people')::integer,0,'The people badge drops a person whose answers are all hidden');
select is((public.control_status(tests.id(100))->'counts'->>'answered')::integer,0,'and so does Answered this session');

-- The person who wrote it still sees it on their phone, and isn't told
select tests.login(3);
select ok(exists(select 1 from jsonb_array_elements(public.phone_room(tests.id(100))->'answers') a where a->>'id'=tests.id(901)::text),'The writer''s phone still holds the hidden answer');
select ok(not exists(select 1 from jsonb_array_elements(public.phone_room(tests.id(100))->'answers') a where a ? 'hidden' or a ? 'hidden_by'),'with nothing saying it was hidden');
select tests.login(1);

-- Showing it again clears who and when
select is(tests.ctl(4,'unhide',jsonb_build_object('item',tests.id(902)))->>'status','ok','Show again');
reset role;
select ok((select not hidden and hidden_by is null and hidden_at is null from submissions where id=tests.id(902)),'Who and when are cleared');
set local role authenticated; select tests.login(1);
select is((public.live_snapshot(tests.id(100))->'state'->'results'->>'total')::integer,1,'It counts again');

-- The report leaves a hidden answer out
reset role;
select ok(private.rp_source_live(tests.id(100),'submission',tests.id(902)),'A shown answer can stand behind a report sentence');
select ok(not private.rp_source_live(tests.id(100),'submission',tests.id(901)),'a hidden one cannot');

-- A word's hide records who and when beside the step
set local role authenticated; select tests.login(1);
select is(tests.ctl(5,'go_live',jsonb_build_object('session',tests.id(311)))->>'status','ok','The word cloud goes live');
select tests.login(3);
select is(tests.send(903,311,'Hope')->>'status','accepted','A word');
select tests.login(1);
select is(tests.ctl(6,'hide','{"item":"hope"}')->>'status','ok','Hide a word');
reset role;
select is((select hidden_meta->'hope'->>'by' from sessions where id=tests.id(311)),tests.id(701)::text,'The step records who hid the word');
set local role authenticated; select tests.login(1);
select is((select i->>'hidden_by' from jsonb_array_elements(public.control_status(tests.id(100))->'items') i where i->>'key'='hope'),'Chris','and the list says so');
select is(tests.ctl(7,'unhide','{"item":"hope"}')->>'status','ok','Show the word again');
reset role;
select is((select hidden_meta from sessions where id=tests.id(311)),'{}'::jsonb,'Its record goes');

-- Only the facilitators hide: the team remote's presses leave hide out
select ok((select pg_get_functiondef('private.room_control(uuid,uuid,text,jsonb)'::regprocedure) not like '%''clear_spotlight'',''hide'',''unhide'',''room_size''%'),'The team remote can''t hide or show again');

select * from finish();
rollback;
