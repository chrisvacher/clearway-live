-- Milestone 6 practice-room fixes, batch B: the silent-theme count the panel shows (strong accepted themes the room has not spoken of and that
-- are not already up as a card), and the rehearsal count that Clear test answers reports part by part (answers, drafted themes, signals), with the
-- themes round going quiet once no drafted theme is left. The redraft's near-repeat check is tested beside the apply in discover_themes.test.sql.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('8d0b0000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(1000+n))::text,true); end $$;
create function tests.held(session_n integer) returns text language sql as $$ select public.signal_state(tests.id(100),tests.id(session_n))->>'held' $$;
create function tests.card(kind text,theme_n integer,session_n integer) returns void language sql security definer set search_path='' as $$
 insert into private.signals(engagement_id,session_id,kind,theme_id) values(tests.id(100),tests.id(session_n),kind,tests.id(theme_n)) $$;
create function tests.status(eng uuid) returns jsonb language sql as $$ select public.control_status(eng)->'rehearsal' $$;
grant execute on all functions in schema tests to authenticated,anon,service_role;

insert into churches(id,name,timezone) values(tests.id(200),'Riverside Church','America/Toronto');
insert into engagements(id,church_id,title,settings) values(tests.id(100),tests.id(200),'Wayfinding room','{"ai_enabled":true}');
insert into auth.users(id,email,email_confirmed_at) values(tests.id(1),'fac1@clearway.co',now());
insert into auth.sessions(id,user_id) values(tests.id(1001),tests.id(1));
insert into auth.identities(user_id,provider,provider_id,identity_data) values(tests.id(1),'google',tests.id(1)::text,jsonb_build_object('email','fac1@clearway.co','email_verified',true));
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method) values(gen_random_uuid(),tests.id(1001),now(),now(),'oauth');
insert into clearway_users(id,auth_user_id,name,email,is_admin,team_hub_team_member_id) values(tests.id(701),tests.id(1),'Chris Vacher','fac1@clearway.co',false,tests.id(801));
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values(tests.id(100),tests.id(701),'lead');
insert into sessions(id,engagement_id,title,part,position,state,interaction,prompt) values
 (tests.id(310),tests.id(100),'Five Lenses: Community','Day 1',1,'live','wall','What does our community say about us?'),
 (tests.id(311),tests.id(100),'Five Lenses: Leadership','Day 1',2,'ready','wall','What does our leadership say?');
update room_states set live_session_id=tests.id(310),tv_content='session' where engagement_id=tests.id(100);

-- ---------- The silent themes still waiting ----------
-- Three strong accepted themes (small groups 52 of 100, giving 45, building 41) and one thin (young families, 5 of 100).
insert into private.discover_themes(id,engagement_id,source,label,detail,rests_on,out_of,status) values
 (tests.id(601),tests.id(100),'survey','Small groups are easy to find','52%',52,100,'accepted'),
 (tests.id(602),tests.id(100),'survey','Giving is generous','45%',45,100,'accepted'),
 (tests.id(603),tests.id(100),'survey','The building is ageing','41%',41,100,'accepted'),
 (tests.id(604),tests.id(100),'survey','Young families','5%',5,100,'accepted'),
 (tests.id(605),tests.id(100),'conversations','A draft nobody accepted','',3,5,'draft');
set local role authenticated;
select tests.login(1);
select is(tests.held(310),'3','A fresh step holds back all three strong accepted themes');
reset role;
-- An aligned card for small groups and a divergent card for young families (a thin theme): the room has spoken of one strong theme, not two.
select tests.card('aligned',601,310);
select tests.card('divergent',604,310);
set local role authenticated;
select tests.login(1);
select is(tests.held(310),'2','After an aligned card (small groups) and a divergent card (young families) two strong themes still wait: giving and building');
select is(public.signal_state(tests.id(100),tests.id(310))->>'strong','3','The strong count is the strong accepted themes');
reset role;
-- A dismissed card is not waiting either: the theme has been spoken of, and a dismissed card stays dismissed.
select tests.card('silent',602,310);
set local role authenticated;
select tests.login(1);
select is(tests.held(310),'1','Giving goes up as a silent card, so one waits: building');
reset role;
select tests.card('silent',603,310);
update private.signals set dismissed_at=now() where session_id=tests.id(310) and kind='silent' and theme_id=tests.id(603);
set local role authenticated;
select tests.login(1);
select is(tests.held(310),'0','Building has a (dismissed) silent card, so nothing is left waiting: the count equals what can still come');
select is(tests.held(311),'3','Another step, with no cards, holds all three');
reset role;
update room_states set live_session_id=null where engagement_id=tests.id(100);
update sessions set state='ready' where id=tests.id(310);
update sessions set state='phones_down' where id=tests.id(311);
set local role authenticated;
select tests.login(1);
select is(tests.held(311),'0','Once phones are down the panel holds nothing back');
reset role;

-- ---------- The rehearsal count and what Clear test answers says it cleared ----------
insert into engagements(id,church_id,title,type) values('90000000-0000-4000-8000-000000000010',tests.id(200),'Permanent practice','practice');
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values('90000000-0000-4000-8000-000000000010',tests.id(701),'lead');
insert into sessions(id,engagement_id,title,part,position,state,interaction,prompt) values(tests.id(330),'90000000-0000-4000-8000-000000000010','Practice step','Day 1',1,'ready','wall','Say it');
insert into auth.users(id,email,email_confirmed_at) select tests.id(n),'person'||n||'@example.org',now() from generate_series(4,6) n;
insert into attendees(id,engagement_id,auth_user_id,name,email,verified_at,room_role) values
 (tests.id(504),'90000000-0000-4000-8000-000000000010',tests.id(4),'Priya Shah','person4@example.org',now(),'participant'),
 (tests.id(505),'90000000-0000-4000-8000-000000000010',tests.id(5),'Ben Ortiz','person5@example.org',now(),'participant'),
 (tests.id(506),'90000000-0000-4000-8000-000000000010',tests.id(6),'Ruth Gomez','person6@example.org',now(),'participant');
-- A real drafted theme from before the rehearsal, with the round that drafted it.
insert into private.ai_runs(id,engagement_id,job,model,prompt_version,inputs,status) values(tests.id(950),'90000000-0000-4000-8000-000000000010','draft_discover_themes','fake-model','themes-draft@2','{}','ok');
insert into private.discover_themes(id,engagement_id,source,label,status,ai_run) values(tests.id(910),'90000000-0000-4000-8000-000000000010','conversations','A real drafted theme','draft',tests.id(950));
insert into private.discover_theme_rounds(engagement_id,status,last_offered,last_refused) values('90000000-0000-4000-8000-000000000010','ready',5,0);
set local role authenticated;
select tests.login(1);
select is(public.rehearsal_control('90000000-0000-4000-8000-000000000010',tests.id(851),'start')->>'status','ok','The rehearsal starts');
reset role;
-- What a rehearsal makes: answers, drafted themes and signals, all test rows.
insert into submissions(id,engagement_id,session_id,attendee_id,text,answers,phone_sent_at) values
 (tests.id(921),'90000000-0000-4000-8000-000000000010',tests.id(330),tests.id(504),'one','[]',now()),
 (tests.id(922),'90000000-0000-4000-8000-000000000010',tests.id(330),tests.id(505),'two','[]',now()),
 (tests.id(923),'90000000-0000-4000-8000-000000000010',tests.id(330),tests.id(506),'three','[]',now());
insert into private.discover_themes(id,engagement_id,source,label,status,ai_run) select tests.id(930+n),'90000000-0000-4000-8000-000000000010','conversations','Test theme '||n,'draft',tests.id(950) from generate_series(1,4) n;
insert into private.signals(engagement_id,session_id,kind) values('90000000-0000-4000-8000-000000000010',tests.id(330),'thin'),('90000000-0000-4000-8000-000000000010',tests.id(330),'silent');
select is((select count(*)::integer from public.submissions where engagement_id='90000000-0000-4000-8000-000000000010' and test and not deleted),3,'Three answers are test rows');
select is((select count(*)::integer from private.discover_themes where engagement_id='90000000-0000-4000-8000-000000000010' and test and not deleted),4,'four drafted themes');
select is((select count(*)::integer from private.signals where engagement_id='90000000-0000-4000-8000-000000000010' and test and not deleted),2,'and two signals');
set local role authenticated;
select tests.login(1);
select is((tests.status('90000000-0000-4000-8000-000000000010')->>'test_answers')::integer,9,'The control surface counts 9 test items');
select is(tests.status('90000000-0000-4000-8000-000000000010')->'test_counts','{"answers":3,"themes":4,"signals":2,"other":0,"total":9}'::jsonb,'with the parts beside the total');
select is(public.rehearsal_control('90000000-0000-4000-8000-000000000010',tests.id(852),'end')->>'status','ok','The rehearsal ends');
create temp table cleared as select public.rehearsal_control('90000000-0000-4000-8000-000000000010',tests.id(853),'clear') as j;
select is((select j->>'status' from cleared),'ok','Clear test answers runs');
select is((select (j->>'answers')||' '||(j->>'themes')||' '||(j->>'signals')||' '||(j->>'other') from cleared),'3 4 2 0','and says what it cleared: 3 answers, 4 drafted themes, 2 signals');
select is((select (j->>'items')::integer from cleared),9,'The parts add up to the 9 test items the label showed');
select is((select (j->>'answers')::integer+(j->>'themes')::integer+(j->>'signals')::integer+(j->>'other')::integer from cleared),(select (j->>'items')::integer from cleared),'items is the sum of its parts');
select is((tests.status('90000000-0000-4000-8000-000000000010')->>'test_answers')::integer,0,'and nothing is left to count afterwards');
select is(tests.status('90000000-0000-4000-8000-000000000010')->'last_clear'->>'themes','4','The last clear remembers its drafted themes');
select is(tests.status('90000000-0000-4000-8000-000000000010')->'last_clear'->>'signals','2','and its signals');
select is(public.rehearsal_control('90000000-0000-4000-8000-000000000010',tests.id(853),'clear')->>'status','duplicate','The same press again is a duplicate');
select is((select (public.rehearsal_control('90000000-0000-4000-8000-000000000010',tests.id(853),'clear')->>'themes')),'4','and reports the same parts');
reset role;
select is((select status from private.discover_theme_rounds where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted),'ready','A real drafted theme still stands, so the round still says what was offered');
-- With no drafted theme left the round goes quiet instead of saying "AI offered 5 themes".
update private.discover_themes set deleted=true where id=tests.id(910);
set local role authenticated;
select tests.login(1);
select is(public.rehearsal_control('90000000-0000-4000-8000-000000000010',tests.id(854),'start')->>'status','ok','A second rehearsal');
reset role;
insert into private.discover_themes(id,engagement_id,source,label,status,ai_run) values(tests.id(940),'90000000-0000-4000-8000-000000000010','conversations','Another test theme','draft',tests.id(950));
set local role authenticated;
select tests.login(1);
select is((tests.status('90000000-0000-4000-8000-000000000010')->>'test_answers')::integer,1,'counts 1 test item');
select is(public.rehearsal_control('90000000-0000-4000-8000-000000000010',tests.id(855),'end')->>'status','ok','ends');
select is((public.rehearsal_control('90000000-0000-4000-8000-000000000010',tests.id(856),'clear')->>'themes'),'1','Clear test answers reports its one drafted theme');
reset role;
select is((select status from private.discover_theme_rounds where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted),'idle','and the round goes quiet because no drafted theme is left');
select is(public.rehearsal_control('90000000-0000-4000-8000-000000000010',tests.id(857),'start')->>'status','ok','A last rehearsal');
select is(public.rehearsal_control('90000000-0000-4000-8000-000000000010',tests.id(858),'end')->>'status','ok','is ended');
-- A refused clear (a session is live) reports nothing cleared and changes nothing.
update room_states set live_session_id=tests.id(330) where engagement_id='90000000-0000-4000-8000-000000000010';
set local role authenticated;
select tests.login(1);
select is(public.rehearsal_control('90000000-0000-4000-8000-000000000010',tests.id(859),'clear')->>'status','live','Clear is refused while a session is live');
select * from finish();
rollback;
