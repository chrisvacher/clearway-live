-- Milestone 5, step 3b: promoting a scribe quote to the TV. Who may promote and take down; the TV's payload
-- carries the words and the step's name and nothing else; one quote at a time; it comes down with the live
-- step, with a spotlight and with Reset practice room; the room version moves once per change.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('87620000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(1000+n))::text,true); end $$;
create function tests.ctl(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$
 select public.room_control(tests.id(100),tests.id(n),action,jsonb_build_object('from',(select live_session_id from public.room_states where engagement_id=tests.id(100)))||p) $$;
create function tests.card(n integer,session_n integer,kind text,text text,speaker text default null) returns jsonb language sql as $$
 select public.scribe_capture(tests.id(100),tests.id(n),tests.id(session_n),kind,text,'{}',speaker,now()) $$;
create function tests.promote(n integer) returns jsonb language sql as $$ select public.quote_promote(tests.id(100),tests.id(n)) $$;
create function tests.down() returns jsonb language sql as $$ select public.quote_take_down(tests.id(100)) $$;
create function tests.tv() returns jsonb language sql as $$ select public.live_snapshot(tests.id(100)) $$;
create function tests.version() returns bigint language sql security definer set search_path='' as $$ select version from public.room_states where engagement_id=tests.id(100) $$;
create function tests.promoted() returns integer language sql security definer set search_path='' as $$ select count(*)::integer from private.scribe_cards where engagement_id=tests.id(100) and promoted_at is not null and not deleted $$;
grant execute on all functions in schema tests to authenticated,anon,service_role;

insert into churches(id,name,timezone) values(tests.id(200),'Riverside Church','America/Toronto'),(tests.id(201),'Lakeside Church','America/Toronto');
insert into engagements(id,church_id,title) values(tests.id(100),tests.id(200),'Wayfinding room'),(tests.id(101),tests.id(201),'Another room');
insert into engagements(id,church_id,title,type) values('90000000-0000-4000-8000-000000000010',tests.id(200),'Permanent practice','practice');
insert into auth.users(id,email,email_confirmed_at)
select tests.id(n),case when n in(1,2,7) then 'fac'||n||'@clearway.co' else 'person'||n||'@example.org' end,now() from generate_series(1,9)n;
insert into auth.sessions(id,user_id) select tests.id(1000+n),tests.id(n) from generate_series(1,9)n;
insert into auth.identities(user_id,provider,provider_id,identity_data) select id,'google',id::text,jsonb_build_object('email',email,'email_verified',true) from auth.users where id in(tests.id(1),tests.id(2),tests.id(7));
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method) select gen_random_uuid(),tests.id(1000+n),now(),now(),'oauth' from generate_series(1,2)n union all select gen_random_uuid(),tests.id(1007),now(),now(),'oauth';
insert into clearway_users(id,auth_user_id,name,email,is_admin,team_hub_team_member_id) values
 (tests.id(701),tests.id(1),'Chris Vacher','fac1@clearway.co',false,tests.id(801)),
 (tests.id(702),tests.id(2),'Jaisy Tam','fac2@clearway.co',false,tests.id(802)),
 (tests.id(707),tests.id(7),'Other Facilitator','fac7@clearway.co',false,tests.id(807));
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values(tests.id(100),tests.id(701),'lead'),(tests.id(100),tests.id(702),'co_facilitator'),(tests.id(101),tests.id(707),'lead'),
 ('90000000-0000-4000-8000-000000000010',tests.id(701),'lead');
insert into attendees(id,engagement_id,auth_user_id,name,email,verified_at,room_role) values
 (tests.id(503),tests.id(100),tests.id(3),'Krista Scribe','person3@example.org',now(),'scribe'),
 (tests.id(504),tests.id(100),tests.id(4),'Priya Shah','person4@example.org',now(),'participant'),
 (tests.id(506),tests.id(100),tests.id(6),'Pending Scribe','person6@example.org',null,'scribe'),
 (tests.id(508),tests.id(101),tests.id(8),'Other Scribe','person8@example.org',now(),'scribe');
insert into attendees(id,engagement_id,name,email) values(tests.id(510),'90000000-0000-4000-8000-000000000010','Practice Scribe','practice@example.org');
insert into device_sessions(engagement_id,attendee_id,auth_session_id) values
 (tests.id(100),tests.id(503),tests.id(1003)),(tests.id(100),tests.id(504),tests.id(1004)),(tests.id(101),tests.id(508),tests.id(1008));
insert into private.tv_devices(id,proof,engagement_id,label,paired_at) values(tests.id(450),repeat('a',64),tests.id(100),'Front TV',now());
insert into private.live_tv_sessions(id,engagement_id,auth_user_id,auth_session_id,device_id) values(tests.id(400),tests.id(100),tests.id(5),tests.id(1005),tests.id(450));
insert into sessions(id,engagement_id,title,part,position,state,interaction) values
 (tests.id(310),tests.id(100),'Five Lenses: Community','Day 1',1,'ready','wall'),
 (tests.id(311),tests.id(100),'Five Lenses: Leadership','Day 1',2,'ready','wall'),
 (tests.id(312),tests.id(100),'Commander''s intent','Day 2',1,'ready','wall'),
 (tests.id(320),tests.id(101),'Elsewhere','Day 1',1,'ready','wall'),
 (tests.id(330),'90000000-0000-4000-8000-000000000010','Practice step','Day 1',1,'ready','wall');
update sessions set team_led=true where id=tests.id(312);

set local role authenticated;

-- Nothing is live: there is no step to put a quote over.
select tests.login(3);
select is(tests.card(1,310,'quote','If we weren''t here, the city would notice.','Tasha Brown')->>'status','accepted','The scribe captures a quote with a speaker kept for the record');
select is(tests.card(2,310,'decision','A few deep partnerships, not many shallow ones.')->>'status','accepted','and a decision');
select is(tests.card(3,311,'quote','We say yes to the neighbourhood before we say yes to a program.')->>'status','accepted','and a quote filed under another step');
select is(tests.card(4,310,'quote','Our doors are open and our table is long.')->>'status','accepted','and a second quote on the first step');
select tests.login(1);
select is(tests.promote(1)->>'status','nothing_live','Promote waits for a step to be live');
select is(tests.ctl(901,'go_live',jsonb_build_object('session',tests.id(310)))->>'status','ok','Go live on Five Lenses: Community');

-- Who can promote and take down.
select tests.login(3);
select is(tests.promote(1)->>'status','denied','The scribe cannot promote');
select tests.login(4);
select is(tests.promote(1)->>'status','denied','A participant cannot');
select tests.login(5);
select is(tests.promote(1)->>'status','denied','A TV cannot');
select tests.login(6);
select is(tests.promote(1)->>'status','denied','A scribe who has not verified cannot');
select tests.login(7);
select is(tests.promote(1)->>'status','denied','A facilitator of another engagement cannot');
select tests.login(8);
select is(tests.promote(1)->>'status','denied','A scribe of another engagement cannot');
select tests.login(9);
select is(tests.promote(1)->>'status','denied','Someone with no place in the room cannot');
select is(tests.promoted(),0,'None of them promoted anything');
reset role;
set local role anon;
select throws_ok($$select public.quote_promote(tests.id(100),tests.id(1))$$,'42501',null,'An unsigned browser cannot call Promote');
select throws_ok($$select public.quote_take_down(tests.id(100))$$,'42501',null,'or Take down');
reset role;
set local role authenticated;
select throws_ok($$select promoted_text from private.scribe_cards$$,'42501',null,'No browser role reads the promotion directly');
select throws_ok($$update private.scribe_cards set promoted_at=now()$$,'42501',null,'or writes it without the checks');

-- What a facilitator may not promote.
select tests.login(1);
select is(tests.promote(2)->>'status','not_a_quote','Only a quote can go on the TV');
select is(tests.promote(999)->>'status','not_found','An unknown card is not found');
select is(public.quote_promote(tests.id(100),null)->>'status','invalid_request','A press with no card is refused');
select is(public.quote_promote(tests.id(101),tests.id(1))->>'status','denied','A facilitator cannot promote into an engagement that is not theirs');
select is(tests.promoted(),0,'Still nothing promoted');

-- The lead promotes: one version, the words and the step's name, no speaker, no id.
select tests.login(1);
select set_config('tests.v',tests.version()::text,true);
select is(tests.promote(1)->>'status','ok','The lead promotes a quote');
select is(tests.version(),current_setting('tests.v')::bigint+1,'The room version moves once');
select is(tests.promoted(),1,'One quote is promoted');
select tests.login(5);
select is(tests.tv()->'promoted_quote'->>'text','If we weren''t here, the city would notice.','The TV gets the quote''s words');
select is(tests.tv()->'promoted_quote'->>'session','Five Lenses: Community','and the live step''s name');
select is((select array_agg(k order by k) from jsonb_object_keys(tests.tv()->'promoted_quote') k),array['session','text'],'and nothing else');
select is(position('Tasha' in tests.tv()::text),0,'The speaker is nowhere in the TV''s payload');
select is(position(tests.id(1)::text in tests.tv()::text),0,'and neither is the card''s id');
select is(position(tests.id(503)::text in tests.tv()::text),0,'or the scribe''s');
select is(position('Krista' in (tests.tv()->'promoted_quote')::text),0,'or the scribe''s name (the room''s join list is the TV''s own, apart from the quote)');
select tests.login(4);
select is(tests.tv()->'promoted_quote'->>'text','If we weren''t here, the city would notice.','A phone gets the same words (and keeps the live step)');
select is(position('Tasha' in tests.tv()::text),0,'with no speaker');
select is(tests.tv()->'state'->>'live_session_id',tests.id(310)::text,'The live step is unchanged underneath');
select tests.login(1);
select is(public.scribe_state(tests.id(100))->>'promoted',tests.id(1)::text,'The lead''s feed learns which card is on the TV');
select tests.login(2);
select is(public.scribe_state(tests.id(100))->>'promoted',tests.id(1)::text,'and so does the co-facilitator''s');
select tests.login(3);
select is(public.scribe_state(tests.id(100)) ? 'promoted',false,'The scribe''s console does not carry it');
select is(position('promoted_text' in public.scribe_state(tests.id(100))::text),0,'nor the stored words');

-- A repeat does nothing.
select tests.login(1);
select set_config('tests.v',tests.version()::text,true);
select is(tests.promote(1)->>'status','unchanged','Promoting the same quote again changes nothing');
select is(tests.version(),current_setting('tests.v')::bigint,'and does not move the room version');

-- Words are kept as promoted: an edit on the console does not change the TV.
select tests.login(3);
select is(public.scribe_edit(tests.id(100),tests.id(1),'If we were not here, the city would notice.','{}',null,0)->>'status','ok','The scribe edits the quote afterwards');
select tests.login(5);
select is(tests.tv()->'promoted_quote'->>'text','If we weren''t here, the city would notice.','The TV keeps the words as they were promoted');

-- One at a time: a second quote replaces the first.
select tests.login(2);
select set_config('tests.v',tests.version()::text,true);
select is(tests.promote(4)->>'status','ok','The co-facilitator promotes another quote');
select is(tests.version(),current_setting('tests.v')::bigint+1,'in one room version');
select is(tests.promoted(),1,'Only one quote is promoted');
select tests.login(5);
select is(tests.tv()->'promoted_quote'->>'text','Our doors are open and our table is long.','The TV shows the second quote');
select tests.login(1);
select is(public.scribe_state(tests.id(100))->>'promoted',tests.id(4)::text,'and the feed marks the second card');

-- Who can take it down.
select tests.login(3);
select is(tests.down()->>'status','denied','The scribe cannot take it down');
select tests.login(4);
select is(tests.down()->>'status','denied','A participant cannot');
select tests.login(5);
select is(tests.down()->>'status','denied','A TV cannot');
select tests.login(7);
select is(tests.down()->>'status','denied','A facilitator of another engagement cannot');
select tests.login(9);
select is(tests.down()->>'status','denied','Someone with no place in the room cannot');
select is(tests.promoted(),1,'The quote is still up');
select tests.login(2);
select set_config('tests.v',tests.version()::text,true);
select is(tests.down()->>'status','ok','The co-facilitator takes it down');
select is(tests.version(),current_setting('tests.v')::bigint+1,'in one room version');
select is(tests.promoted(),0,'Nothing is promoted');
select tests.login(5);
select is(tests.tv()->'promoted_quote','null'::jsonb,'The TV''s payload says so');
select is(tests.tv()->'state'->>'live_session_id',tests.id(310)::text,'and the live step is exactly where it was');
select tests.login(1);
select is(tests.down()->>'status','unchanged','Taking down again changes nothing');
select is(public.scribe_state(tests.id(100))->'promoted','null'::jsonb,'The feed shows no card on the TV');

-- It comes down when the live step changes, and does not come back.
select is(tests.promote(1)->>'status','ok','Promote again');
select is(tests.ctl(902,'go_live',jsonb_build_object('session',tests.id(311)))->>'status','ok','Go live on the next step');
select tests.login(5);
select is(tests.tv()->'promoted_quote','null'::jsonb,'The quote came down with the step change');
select tests.login(1);
select is(tests.promoted(),0,'and is not waiting');
select is(tests.ctl(903,'go_live',jsonb_build_object('session',tests.id(310)))->>'status','ok','Going back to the first step');
select tests.login(5);
select is(tests.tv()->'promoted_quote','null'::jsonb,'does not bring it back');

-- A quote filed under another step goes up over the live step.
select tests.login(1);
select is(tests.promote(3)->>'status','ok','A quote filed under another step can be promoted over the live step');
select tests.login(5);
select is(tests.tv()->'promoted_quote'->>'session','Five Lenses: Community','and the live step''s name is shown');
select tests.login(1);
select is(tests.ctl(904,'nothing_live')->>'status','ok','Nothing live');
select tests.login(5);
select is(tests.tv()->'promoted_quote','null'::jsonb,'A quote does not stay up over the holding screen');
select tests.login(1);
select is(tests.promote(1)->>'status','nothing_live','and Promote waits for a step again');
select is(tests.ctl(905,'go_live',jsonb_build_object('session',tests.id(310)))->>'status','ok','Back on Five Lenses: Community');

-- A spotlight and a quote do not share the screen.
reset role;
update public.room_states set spotlight_key='some-word' where engagement_id=tests.id(100);
set local role authenticated;
select tests.login(1);
select is(tests.promote(1)->>'status','ok','Promoting over a spotlight');
select tests.login(5);
select is(tests.tv()->'state'->'spotlight_key','null'::jsonb,'clears the spotlight');
select is(tests.tv()->'promoted_quote'->>'text','If we were not here, the city would notice.','and the quote is up, with the words as edited before this promotion');
reset role;
update public.room_states set spotlight_key='another-word' where engagement_id=tests.id(100);
set local role authenticated;
select tests.login(5);
select is(tests.tv()->'promoted_quote','null'::jsonb,'A spotlight started afterwards takes the quote down');
select tests.login(1);
select is(tests.promoted(),0,'and nothing is left promoted');

-- The team-led block: no quote on the TV.
select is(tests.ctl(906,'clear_spotlight')->>'status','ok','Clear the spotlight');
select is(tests.ctl(907,'go_live',jsonb_build_object('session',tests.id(312)))->>'status','ok','Go live on the team-led step');
select is(tests.promote(1)->>'status','team_led','Promote is refused while the team has the room');
select is(tests.promoted(),0,'and nothing is promoted');
select is(tests.ctl(908,'go_live',jsonb_build_object('session',tests.id(310)))->>'status','ok','Back on the first step');

-- The TV leaving the step (the join screen) takes it down as well.
select is(tests.promote(1)->>'status','ok','Promote');
reset role;
update public.room_states set tv_content='join' where engagement_id=tests.id(100);
select is(tests.promoted(),0,'The quote comes down when the TV leaves the step');
update public.room_states set tv_content='session' where engagement_id=tests.id(100);
set local role authenticated;
select tests.login(5);
select is(tests.tv()->'promoted_quote','null'::jsonb,'and does not return with the step');

-- Reset practice room clears a promoted quote (the reset already deletes the cards).
reset role;
insert into private.scribe_cards(id,engagement_id,session_id,kind,text,attendee_id,captured_at)
values(tests.id(70),'90000000-0000-4000-8000-000000000010',tests.id(330),'quote','We keep coming back to the table.',tests.id(510),now());
set local role authenticated;
select tests.login(1);
select is(public.room_control('90000000-0000-4000-8000-000000000010',tests.id(71),'go_live',jsonb_build_object('session',tests.id(330),'from',null))->>'status','ok','Go live in the practice room');
select is(public.quote_promote('90000000-0000-4000-8000-000000000010',tests.id(70))->>'status','ok','Promote a practice quote');
select is(public.live_snapshot('90000000-0000-4000-8000-000000000010')->'promoted_quote'->>'text','We keep coming back to the table.','It is on the practice room''s TV state');
select is(public.reset_practice_room(),true,'Reset practice room');
select is(public.live_snapshot('90000000-0000-4000-8000-000000000010')->'promoted_quote','null'::jsonb,'The reset leaves no quote on the screen');
reset role;
select is((select count(*)::integer from private.scribe_cards where engagement_id='90000000-0000-4000-8000-000000000010' and promoted_at is not null and not deleted),0,'and none promoted');
select * from finish();
rollback;
