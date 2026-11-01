begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('84000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
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

select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='private.room_controls'::regclass),'Control log forces RLS');
select ok(not has_table_privilege('authenticated','private.room_controls','select'),'Clients cannot read the control log directly');
select ok(not has_function_privilege('anon','public.room_control(uuid,uuid,text,jsonb)','execute'),'No anonymous controls');
select ok(not (select prosecdef from pg_proc where oid='public.room_control(uuid,uuid,text,jsonb)'::regprocedure),'Public control wrapper is invoker');
select ok(not has_function_privilege('authenticated','private.fac_notice(uuid,jsonb)','execute'),'Clients cannot publish facilitator notices');

set local role authenticated;
-- Only an assigned facilitator controls the room.
select tests.login(3);
select is(tests.ctl(1,'next')->>'status','denied','Participant cannot control the room');
select is(public.control_status(tests.id(100))->>'status','denied','Participant cannot read facilitator status');
select tests.login(4);
select is(tests.ctl(2,'next')->>'status','denied','TV cannot control the room');
select is(public.control_status(tests.id(100))->>'status','denied','TV cannot read facilitator status');
select tests.login(6);
select is(tests.ctl(3,'next')->>'status','denied','Unassigned facilitator cannot control the room');
select tests.login(1);
select is(public.room_control(tests.id(100),tests.id(4),'next','{}')->>'status','invalid_request','A press must say what it acted on');

-- Next from the start, one version per press, and duplicate presses do nothing.
select is(tests.ctl(10,'next')->>'status','ok','Next goes live on the first step');
select is(tests.live(),tests.id(310),'Room shows the first step');
select is(tests.state(310),'live','First step is live');
select is(public.room_control(tests.id(100),tests.id(10),'next',jsonb_build_object('from',null))->>'status','duplicate','A repeated press is ignored');
select is(tests.live(),tests.id(310),'Duplicate press did not move the room');
select is(public.room_control(tests.id(100),tests.id(11),'next',jsonb_build_object('from',null))->>'status','moved','A press against a moved room is refused');
select is(public.room_control(tests.id(100),tests.id(12),'next',jsonb_build_object('from',null))->>'title','Welcome','The refusal names where the room is');
select is(public.room_control(tests.id(100),tests.id(13),'next',jsonb_build_object('from',null))->>'by','Chris','The refusal names who moved it');
select lives_ok($$ select set_config('tests.v',tests.version()::text,true) $$,'Record version');
select is(tests.ctl(14,'next')->>'status','ok','Next to the Five Lenses segment');
select is(tests.version(),current_setting('tests.v')::bigint+1,'One press raises the version once');
select is(tests.state(310),'closed','A step with no segment closes when the room moves on');
select is(tests.live(),tests.id(311),'Congregation is live');

-- Bursts and phones down lock only the step on the TV.
select is(tests.ctl(15,'start_burst','{"minutes":4}')->>'status','ok','Start a 4-minute burst');
select ok((select burst_ends_at between now()+interval '3 minutes 50 seconds' and now()+interval '4 minutes 10 seconds' from room_states where engagement_id=tests.id(100)),'Burst ends on the server clock');
select is(tests.ctl(16,'start_burst','{"minutes":3}')->>'status','invalid_state','Only one burst at a time');
select is(tests.ctl(17,'extend_burst')->>'status','ok','Extend a burst');
select ok((select burst_ends_at>now()+interval '4 minutes 50 seconds' from room_states where engagement_id=tests.id(100)),'Extend adds a minute');
select tests.login(3);
select is(tests.send(901,311,'Hope, Care')->>'status','accepted','Phone answers the live step');
select tests.login(1);
select is(tests.ctl(18,'next')->>'status','ok','Next within the segment');
select is(tests.state(311),'open','The earlier step in the segment stays open');
select is(tests.state(312),'live','Community is live');
select ok((select burst_ends_at is null and not phones_down from room_states where engagement_id=tests.id(100)),'Moving on ends the burst');
select is(tests.ctl(19,'phones_down')->>'status','ok','Phones down');
select is(tests.state(312),'phones_down','Step shows phones down');
select tests.login(3);
select is(tests.send(902,312,'Families')->>'status','closed','Phones down locks the live step');
select is(tests.send(903,311,'Courage')->>'status','accepted','Phones can still answer an earlier step in the segment');
select tests.login(1);
select is(tests.ctl(20,'open_phones')->>'status','ok','Open phones');
select tests.login(3);
select is(tests.send(904,312,'Young families')->>'status','accepted','Live step takes answers again');

-- Hide and spotlight a wall answer by its id.
select tests.login(1);
select is(tests.ctl(21,'spotlight',jsonb_build_object('item',tests.id(904)))->>'status','ok','Spotlight a wall answer');
select is((select spotlight_key from room_states where engagement_id=tests.id(100)),tests.id(904)::text,'Spotlight is the answer id');
select is(tests.ctl(22,'hide',jsonb_build_object('item',tests.id(904)))->>'status','ok','Hide a wall answer');
select ok((select spotlight_key is null and tests.id(904)=any(hidden_ids) from room_states where engagement_id=tests.id(100)),'Hiding clears its spotlight and records it');
select is(jsonb_array_length(public.live_snapshot(tests.id(100))->'answers'),0,'Hidden answer leaves the shared snapshot');
select is((public.live_snapshot(tests.id(100))->'state'->'results'->>'total')::integer,0,'Hidden answer leaves the TV tally');
select is((public.control_status(tests.id(100))->'items'->0->>'hidden')::boolean,true,'Facilitator still sees it, marked hidden');
select is(tests.ctl(23,'spotlight',jsonb_build_object('item',tests.id(904)))->>'status','hidden','A hidden answer cannot be spotlit');
select is(tests.ctl(24,'unhide',jsonb_build_object('item',tests.id(904)))->>'status','ok','Unhide');
select is(jsonb_array_length(public.live_snapshot(tests.id(100))->'answers'),1,'Answer is back in the snapshot');

-- Back into the segment: Congregation goes live again with its words.
select is(tests.ctl(25,'back')->>'status','ok','Back');
select is(tests.live(),tests.id(311),'Congregation is on the TV again');
select is(tests.state(311),'live','It takes answers again');
select is(tests.state(312),'open','Community stays open');
select is(tests.ctl(26,'hide','{"item":"hope"}')->>'status','ok','Hide a word');
select ok(not (public.live_snapshot(tests.id(100))->'state'->'results'->'words') @> '[{"key":"hope"}]','Hidden word leaves the TV results');
select ok(not (public.live_snapshot(tests.id(100))->'answers')::text like '%"key": "hope"%','Hidden word leaves shared answers');
select is(tests.ctl(27,'spotlight','{"item":"hope"}')->>'status','hidden','A hidden word cannot be spotlit');
select is(tests.ctl(28,'spotlight','{"item":"care"}')->>'status','ok','Spotlight a word');
select is(tests.ctl(29,'spotlight','{"item":"missing"}')->>'status','missing','Only words on the TV can be spotlit');
select is(tests.ctl(30,'clear_spotlight')->>'status','ok','Clear the spotlight');

-- Leaving the segment closes it; queued answers keep the grace window.
select is(tests.ctl(31,'go_live',jsonb_build_object('session',tests.id(313)))->>'status','not_ready','Drafts cannot go live');
select is(tests.ctl(32,'go_live',jsonb_build_object('session',tests.id(314)))->>'status','ok','Go live outside the segment');
select is(tests.state(311),'closed','Congregation closed with its segment');
select is(tests.state(312),'closed','Community closed with its segment');
select tests.login(3);
select is(tests.send(905,312,'Late')->>'status','closed','A closed segment takes no new answers');
select is(tests.send(906,312,'Queued',now()-interval '1 second')->>'status','accepted','An answer queued before the close keeps its grace window');
select tests.login(1);
select is(tests.ctl(33,'go_live',jsonb_build_object('session',tests.id(311)))->>'status','ok','Show a closed step');
select is(tests.state(311),'closed','A closed step is shown read-only');
select ok(not ((select hidden_keys from room_states where engagement_id=tests.id(100)) @> array['care']) and (select hidden_keys from room_states where engagement_id=tests.id(100)) @> array['hope'],'Its hidden words come back with it');
select is(tests.ctl(34,'start_burst','{"minutes":3}')->>'status','invalid_state','A read-only step takes no burst');
select is(tests.ctl(35,'reopen')->>'status','ok','Reopen');
select is(tests.state(311),'live','Reopened step takes answers');

-- Nothing live is a break: the segment stays open.
select is(tests.ctl(36,'nothing_live')->>'status','ok','Nothing live');
select ok((select live_session_id is null and tv_content='holding' from room_states where engagement_id=tests.id(100)),'TV goes to holding');
select is(tests.state(311),'open','A break keeps the segment open');
select is(tests.ctl(37,'back')->>'status','ok','Back after a break returns to the step');
select is(tests.live(),tests.id(311),'Back shows the step left for the break');

-- Close the day.
select is(tests.ctl(38,'close_part','{"part":"Day 1"}')->>'status','ok','Close Day 1');
select is(tests.state(311),'closed','Closing the day closes its steps');
select ok((select live_session_id is null and tv_content='holding' from room_states where engagement_id=tests.id(100)),'Closing the live day goes to holding');
select is(tests.ctl(39,'close_part','{"part":"Day 1"}')->>'status','unchanged','Closing twice changes nothing');

-- Room-wide controls.
select is(tests.ctl(40,'refresh_phones')->>'status','ok','Refresh phones');
select is((select phone_refresh_version from room_states where engagement_id=tests.id(100)),1::bigint,'Phones get a refresh version');
select is(tests.ctl(41,'tv_on_phones','{"on":true}')->>'status','ok','Show the TV view on phones');
select is((select show_tv_on_phones from room_states where engagement_id=tests.id(100)),true,'Phones show the TV view');
select is(tests.ctl(42,'room_size','{"size":"medium"}')->>'status','ok','Change room size');
select is(public.live_snapshot(tests.id(100))->'display'->>'room_size','medium','TV reads the new room size');

-- A burst ends on the server, whoever notices first.
select is(tests.ctl(43,'go_live',jsonb_build_object('session',tests.id(315)))->>'status','ok','Go live on Day 2');
select is(tests.ctl(44,'start_burst','{"minutes":3}')->>'status','ok','Start a burst');
select is(public.live_tick(tests.id(100))->>'status','early','A tick before the end changes nothing');
reset role;
update room_states set burst_ends_at=now()-interval '1 second' where engagement_id=tests.id(100);
set local role authenticated;
select tests.login(4);
select is(public.live_tick(tests.id(100))->>'status','ended','The TV ends the burst');
select is(tests.state(315),'phones_down','Phones go down at the end of a burst');
select is(public.live_tick(tests.id(100))->>'status','none','A second tick changes nothing');
select tests.login(6);
select is(public.live_tick(tests.id(100))->>'status','denied','Outsiders cannot tick a room');

-- Facilitator status and private notices.
select tests.login(2);
select is(public.control_status(tests.id(100))->>'status','ok','Co-facilitator reads status');
select is(public.control_status(tests.id(100))->'screens'->0->>'label','Front TV','Status lists paired TVs');
select ok(public.control_status(tests.id(100))->>'fac_topic' like 'fac:%','Status names the private notice topic');
select ok(private.can_receive_fac(public.control_status(tests.id(100))->>'fac_topic'),'Facilitator receives private notices');
select is(public.control_status(tests.id(100))->'controls'->0->>'action','burst_ended','Status lists recent presses');
select is(public.control_status(tests.id(100))->'counts'->>'signed_in','1','Status counts signed-in people');
select lives_ok($$ select set_config('tests.fac',public.control_status(tests.id(100))->>'fac_topic',true) $$,'Record topic');
select tests.login(4);
select ok(not private.can_receive_fac(current_setting('tests.fac')),'TV cannot receive facilitator notices');
select ok(public.live_snapshot(tests.id(100))::text not like '%Chris%' and public.live_snapshot(tests.id(100))::text not like '%PRESENTER-SECRET%','Shared state carries no actor or notes');
select tests.login(3);
select ok(not private.can_receive_fac(current_setting('tests.fac')),'Participant cannot receive facilitator notices');
reset role;
select is((select count(*)::integer from private.room_controls where engagement_id=tests.id(100)),(select count(*)::integer from private.room_controls),'Every press is logged against its room');
select * from finish();
rollback;
