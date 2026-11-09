begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('86a00000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(1000+n))::text,true); end $$;
create function tests.live() returns uuid language sql security definer set search_path='' as $$ select live_session_id from public.room_states where engagement_id=tests.id(100) $$;
create function tests.version() returns bigint language sql security definer set search_path='' as $$ select version from public.room_states where engagement_id=tests.id(100) $$;
create function tests.ctl(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$
 select public.room_control(tests.id(100),tests.id(n),action,jsonb_build_object('from',tests.live())||p) $$;
create function tests.rehearse(n integer,action text) returns jsonb language sql as $$ select public.rehearsal_control(tests.id(100),tests.id(n),action) $$;
create function tests.send(n integer,session integer,text_ text,value jsonb default null,action text default 'submit',revision integer default 0,queued timestamptz default null,sent timestamptz default now()) returns jsonb language sql as $$
 select public.live_submit(tests.id(100),tests.id(n),tests.id(session),revision,action,text_,sent,queued,0,value) $$;
create function tests.save(n integer,kind text,options jsonb,mode text default 'live',opens timestamptz default null,closes timestamptz default null,state text default 'ready',anonymous boolean default true,revision integer default null) returns jsonb language sql as $$
 select public.show_write(tests.id(100),'save',jsonb_build_object('id',tests.id(n),'revision',revision,'title','Step '||n,'part','Pre-call','mode',mode,'opens_at',opens,'closes_at',closes,'interaction',kind,
  'prompt','Prompt '||n||' for {base year + 3}','phone_depth','Depth '||n,'notes','Private note '||n,'lands_in','','segment','','state',state,'planned_minutes',5,'max_sends',3,'max_characters',140,'max_words',3,
  'settings',jsonb_build_object('anonymous',anonymous,'burst_minutes',4,'join_strip',false),'options',options)) $$;
create function tests.rev(n integer) returns integer language sql security definer set search_path='' as $$ select revision from public.sessions where id=tests.id(n) $$;
create function tests.self(n integer) returns jsonb language sql as $$ select s from jsonb_array_elements(public.phone_room(tests.id(100))->'self_paced') s where s->>'id'=tests.id(n)::text $$;
create function tests.sub(n integer) returns public.submissions language sql security definer set search_path='' as $$ select * from public.submissions where id=tests.id(n) $$;
create function tests.recap(n integer) returns jsonb language sql as $$ select s from jsonb_array_elements(public.results_recap(tests.id(100))->'sessions') s where s->'session'->>'id'=tests.id(n)::text $$;
create function tests.event(n integer) returns jsonb language sql security definer set search_path='' as $$
 select payload from realtime.messages where topic like 'live:'||tests.id(100)||':%' and event='room' and payload->'answer'->>'id'=tests.id(n)::text order by (payload->'state'->>'version')::bigint desc limit 1 $$;
create function tests.results_for(n integer) returns jsonb language sql security definer set search_path='' as $$ select private.live_results_for(tests.id(100),tests.id(n),array[]::text[]) $$;
grant execute on all functions in schema tests to authenticated,anon,service_role;

insert into churches(id,name,timezone) values(tests.id(200),'Riverside Church','America/Toronto');
insert into engagements(id,church_id,title,base_year) values(tests.id(100),tests.id(200),'Self-paced room',2026);
insert into auth.users(id,email,email_confirmed_at)
select tests.id(n),case when n=1 then 'fac1@clearway.co' when n=2 then 'fac2@clearway.co' else 'person'||n||'@example.org' end,now() from generate_series(1,7)n;
insert into auth.sessions(id,user_id) select tests.id(1000+n),tests.id(n) from generate_series(1,7)n;
insert into auth.identities(user_id,provider,provider_id,identity_data) select id,'google',id::text,jsonb_build_object('email',email,'email_verified',true) from auth.users where id in (tests.id(1),tests.id(2));
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method) values(gen_random_uuid(),tests.id(1001),now(),now(),'oauth'),(gen_random_uuid(),tests.id(1002),now(),now(),'oauth');
insert into clearway_users(id,auth_user_id,name,email,is_admin,team_hub_team_member_id) values
 (tests.id(701),tests.id(1),'Chris Vacher','fac1@clearway.co',false,tests.id(801)),(tests.id(702),tests.id(2),'Jaisy Tam','fac2@clearway.co',false,tests.id(802));
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values(tests.id(100),tests.id(701),'lead');
insert into attendees(id,engagement_id,auth_user_id,name,email,verified_at,room_role) values
 (tests.id(503),tests.id(100),tests.id(3),'Priya Shah','person3@example.org',now(),'participant'),
 (tests.id(505),tests.id(100),tests.id(5),'Ben Ortiz','person5@example.org',now(),'participant'),
 (tests.id(506),tests.id(100),tests.id(6),'Ruth Morrison','person6@example.org',now(),'participant');
insert into device_sessions(engagement_id,attendee_id,auth_session_id) values(tests.id(100),tests.id(503),tests.id(1003)),(tests.id(100),tests.id(505),tests.id(1005)),(tests.id(100),tests.id(506),tests.id(1006));
insert into private.tv_devices(id,proof,engagement_id,label,paired_at) values(tests.id(450),repeat('a',64),tests.id(100),'Front TV',now());
insert into private.live_tv_sessions(id,engagement_id,auth_user_id,auth_session_id,device_id) values(tests.id(400),tests.id(100),tests.id(4),tests.id(1004),tests.id(450));

-- ---------- Tables and privacy ----------
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='private.rehearsal_log'::regclass),'The rehearsal log forces row-level security');
select ok(not has_table_privilege('authenticated','private.rehearsal_log','select'),'Browsers cannot read the rehearsal log');
select has_column('private','qa_votes','test','Votes carry the test flag');
select has_column('private','ranking_suggestions','test','Suggested options carry the test flag');

set local role authenticated;
select tests.login(1);
-- ---------- Self-paced sessions ----------
select is(tests.save(310,'wall','{}','self_paced',now()-interval '1 hour',now()+interval '1 day')->>'status','ok','A self-paced session saves with open and close times');
select is(tests.save(311,'choice','{"items":[{"key":"a","text":"Prayer"},{"key":"b","text":"Hospitality"}]}','self_paced',now()+interval '2 days',now()+interval '3 days')->>'status','ok','One that opens later');
select is(tests.save(312,'word_cloud','{}','self_paced',now()-interval '3 days',now()-interval '1 day')->>'status','ok','One that has closed');
select is(tests.save(313,'wall','{}','self_paced',now()-interval '1 hour',now()+interval '1 day','draft')->>'status','ok','A draft self-paced session');
select is(tests.save(314,'wall','{}','self_paced',now()+interval '1 hour',now())->>'status','invalid_request','A self-paced session must open before it closes');
select is(tests.save(315,'wall','{}','self_paced',null,null)->>'status','invalid_request','and needs both times');
select is(tests.save(320,'word_cloud','{}')->>'status','ok','A live word cloud');
select is(tests.save(321,'choice','{"items":[{"key":"a","text":"Yes"},{"key":"b","text":"No"}]}')->>'status','ok','A live choice');
select is(tests.save(322,'sign','{"text":"We commit."}','live',null,null,'ready',false)->>'status','ok','Sign together');
select is(tests.save(323,'form','{"questions":[{"key":"q1","text":"What would make this a win?"}]}')->>'status','ok','A private form');
select is(tests.save(324,'qa','{}')->>'status','ok','A Q&A step');
select is(tests.save(325,'content','{"screen":"headline"}')->>'status','ok','A content screen');
reset role;
select is((select state from sessions where id=tests.id(310)),'ready','Its stored state stays Ready: the clock decides Open and Closed');
set local role authenticated;

-- The room skips self-paced sessions.
select is(tests.ctl(900,'go_live',jsonb_build_object('session',tests.id(310)))->>'status','missing','Go live refuses a self-paced session');
select is(tests.ctl(901,'next')->>'status','ok','Next moves through the run of show');
select is(tests.live(),tests.id(320),'skipping every self-paced session');
select is(tests.ctl(902,'nothing_live')->>'status','ok','Nothing live');

-- The phone's view.
select tests.login(3);
select is(tests.self(310)->>'state','open','The phone sees an open self-paced session as open');
select is(tests.self(310)->>'prompt','Prompt 310 for 2029','with its prompt, years filled');
select is(tests.self(310)->>'phone_depth','Depth 310','and its phone depth');
select is(tests.self(311)->>'state','ready','One that opens later is Ready');
select is(tests.self(311)->>'prompt','','and carries no prompt before it opens');
select is(tests.self(311)->'options','{}'::jsonb,'nor its options');
select ok(tests.self(311)->>'opens_at' is not null,'but says when it opens');
select is(tests.self(312)->>'state','closed','One past its close time is Closed');
select is(tests.self(313),null,'A draft never reaches phones');
select ok(not (public.phone_room(tests.id(100))::text like '%Private note%'),'Presenter notes never reach phones');
select is(public.phone_room(tests.id(100))->>'timezone','America/Toronto','The phone knows the church time zone for the times');
select ok(not exists(select 1 from jsonb_array_elements(public.phone_room(tests.id(100))->'sessions') s where s->>'id' in (tests.id(310)::text,tests.id(311)::text)),'Self-paced sessions stay out of the steps the room has reached');

-- Answering, changing and withdrawing while open.
select is(tests.send(950,310,'Families finding us online')->>'status','accepted','An open self-paced session takes an answer outside the live room');
select is(tests.send(950,310,'Young families finding us online',null,'change',1)->>'status','accepted','The person changes it while open');
select is((select a->>'text' from jsonb_array_elements(public.phone_room(tests.id(100))->'answers') a where a->>'id'=tests.id(950)::text),'Young families finding us online','and sees the saved answer');
select is(tests.send(951,310,'A second thought')->>'status','accepted','A second answer');
select is(tests.send(951,310,'',null,'withdraw',1)->>'status','accepted','and withdraws it while open');
select ok((select (a->>'withdrawn')::boolean from jsonb_array_elements(public.phone_room(tests.id(100))->'answers') a where a->>'id'=tests.id(951)::text),'The phone shows it withdrawn');
select is(tests.event(950)->'answer'->>'text',null,'The room event never carries a self-paced answer''s text: it is not on the TV');
select is(tests.send(952,311,'',jsonb_build_object('choices',jsonb_build_array('a')))->>'status','closed','A session not yet open refuses answers');
select is(tests.send(953,312,'hope')->>'status','closed','A closed one refuses them');
select is(tests.send(954,312,'hope',null,'submit',0,now()-interval '1 day 1 minute',now()-interval '1 day 1 minute')->>'status','closed','Queued before close but arriving long after is refused');
select is(tests.send(955,313,'draft')->>'status','closed','A draft never takes answers');
select tests.login(5);
select is(tests.send(956,310,'Volunteers showing up early')->>'status','accepted','Ben answers too');
-- Times are worked out when read: closing it now closes it at once.
select tests.login(1);
select is(tests.save(310,'wall','{}','self_paced',now()-interval '1 hour',now()-interval '30 seconds','ready',true,tests.rev(310))->>'status','ok','The facilitator moves the close time to just now');
select tests.login(3);
select is(tests.self(310)->>'state','closed','The session reads as closed straight away');
select is(tests.send(950,310,'Changed after close',null,'change',2)->>'status','closed','and refuses changes');
select is(tests.send(957,310,'Written on the bus',null,'submit',0,now()-interval '1 minute',now()-interval '1 minute')->>'status','accepted','An answer queued before close and arriving within 2 minutes is accepted');
select ok(tests.self(310)->>'closed_at' is not null,'The phone sees when it closed');
select tests.login(1);
select is(tests.save(310,'wall','{}','self_paced',now()-interval '1 hour',now()+interval '1 day','ready',true,tests.rev(310))->>'status','ok','Moving the close time later opens it again');
select tests.login(3);
select is(tests.self(310)->>'state','open','Open again');
select is((select count(*)::integer from jsonb_array_elements(public.phone_room(tests.id(100))->'answers') a where a->>'session_id'=tests.id(310)::text and not (a->>'withdrawn')::boolean),2,'with the person''s saved answers in place');

-- The control surface sees each self-paced session's state and count.
select tests.login(1);
select is((select s->>'state' from jsonb_array_elements(public.control_status(tests.id(100))->'self_paced') s where s->>'id'=tests.id(310)::text),'open','The control surface sees it open');
select is((select (s->>'answered')::integer from jsonb_array_elements(public.control_status(tests.id(100))->'self_paced') s where s->>'id'=tests.id(310)::text),2,'with the people who answered');
select is((select s->>'state' from jsonb_array_elements(public.control_status(tests.id(100))->'self_paced') s where s->>'id'=tests.id(313)::text),'draft','A draft stays a draft');
select tests.login(3);
select is(public.control_status(tests.id(100))->>'status','denied','Phones cannot read the control status');

-- ---------- Rehearsal and Clear test answers ----------
select tests.login(3);
select is(tests.rehearse(960,'start')->>'status','denied','A phone cannot start a rehearsal');
select tests.login(4);
select is(tests.rehearse(960,'start')->>'status','denied','Nor can the TV');
-- A real answer before the rehearsal, on the live choice.
select tests.login(1);
select is(tests.ctl(903,'go_live',jsonb_build_object('session',tests.id(321)))->>'status','ok','The choice is live');
select tests.login(3);
select is(tests.send(970,321,'',jsonb_build_object('choices',jsonb_build_array('a')))->>'status','accepted','Priya''s real answer');
select tests.login(1);
select is(tests.rehearse(961,'start')->>'status','ok','The facilitator starts a rehearsal');
select is(tests.rehearse(962,'start')->>'status','unchanged','Starting again changes nothing');
select is(tests.rehearse(961,'start')->>'status','duplicate','A repeated press does nothing');
select ok((public.control_status(tests.id(100))->'rehearsal'->>'since') is not null,'The control surface shows the rehearsal');
select tests.login(3);
select ok((public.phone_room(tests.id(100))->>'rehearsal')::boolean,'Phones know they are in a rehearsal');
select is(tests.send(971,321,'',jsonb_build_object('choices',jsonb_build_array('b')))->>'status','accepted','A test answer replaces Priya''s real one');
reset role;
select ok((tests.sub(971)).test,'Answers made during a rehearsal are test answers');
select ok(not (tests.sub(970)).test,'The real one stays real');
select is((tests.sub(970)).replaced_by,tests.id(971),'and is replaced');
set local role authenticated;
select tests.login(5);
select is(tests.send(972,321,'',jsonb_build_object('choices',jsonb_build_array('b')))->>'status','accepted','Ben rehearses');
select is(tests.send(973,310,'Self-paced in rehearsal')->>'status','accepted','A self-paced test answer');
-- Q&A: a test question and a test vote.
select tests.login(1);
select is(tests.ctl(904,'go_live',jsonb_build_object('session',tests.id(324)))->>'status','ok','The Q&A step is live');
select tests.login(3);
select is(tests.send(974,324,'When does the building work start?')->>'status','accepted','A test question');
select tests.login(5);
select is(public.qa_vote(tests.id(100),tests.id(975),tests.id(974),0,true,now())->>'status','accepted','and a test vote');
reset role;
select ok((select test from private.qa_votes where id=tests.id(975)),'Votes during a rehearsal are test votes');
set local role authenticated;
select tests.login(1);
select ok((public.control_status(tests.id(100))->'rehearsal'->>'test_answers')::integer>=4,'The control surface counts the test answers');
select is(tests.rehearse(963,'clear')->>'status','live','Clear test answers is refused while a session is live');
reset role;
select ok(not (tests.sub(971)).deleted,'and nothing was removed');
set local role authenticated;
select tests.login(1);
select is(tests.ctl(905,'nothing_live')->>'status','ok','Nothing live');
select is(tests.rehearse(964,'end')->>'status','ok','End the rehearsal');
select tests.login(6);
select is(tests.send(976,310,'After the rehearsal')->>'status','accepted','An answer after the rehearsal ends');
reset role;
select ok(not (tests.sub(976)).test,'is real');
set local role authenticated;
select tests.login(1);
select set_config('tests.before_clear',tests.version()::text,true);
select is(tests.rehearse(965,'clear')->>'status','ok','Clear test answers with nothing live');
select is(tests.rehearse(965,'clear')->>'status','duplicate','A repeated clear press does nothing');
select ok(tests.version()>current_setting('tests.before_clear')::bigint,'Clearing raises the room version once for every surface');
reset role;
select is((select count(*)::integer from submissions where engagement_id=tests.id(100) and test and not deleted),0,'Every test answer is removed');
select is((select count(*)::integer from submissions where engagement_id=tests.id(100) and not test and not deleted),6,'Every real answer stays');
select ok((select deleted from private.qa_votes where id=tests.id(975)),'Test votes are removed');
select ok((select deleted from private.qa_questions where submission_id=tests.id(974)),'with the test question''s record');
select ok(not (tests.sub(970)).withdrawn and (tests.sub(970)).replaced_by is null,'The real answer a test answer replaced stands again');
select is((select state from sessions where id=tests.id(324)),'ready','A step the rehearsal reached with only test answers is Ready again');
select is((select shown_at from sessions where id=tests.id(324)),null,'and not reached');
select is((select state from sessions where id=tests.id(321)),'closed','A step holding real answers keeps its state');
select is((select state from sessions where id=tests.id(320)),'closed','A step reached before the rehearsal is untouched');
select is((select row(action,answers,votes,sessions)::text from private.rehearsal_log where id=tests.id(965)),'(clear,4,1,1)','Clearing is logged with what it removed');
select is((select actor_id from private.rehearsal_log where id=tests.id(965)),tests.id(701),'and who cleared');
select is((select (results->>'people')::integer from room_states where engagement_id=tests.id(100)),0,'Nothing live: no results on screen');
set local role authenticated;
select tests.login(1);
select is(public.control_status(tests.id(100))->'rehearsal'->>'since',null,'Clearing ends the rehearsal');
select is((public.control_status(tests.id(100))->'rehearsal'->'last_clear'->>'answers')::integer,4,'The control surface shows the last clear');
select is(public.control_status(tests.id(100))->'rehearsal'->'last_clear'->>'by','Chris','and who did it');
select tests.login(3);
select ok(not (public.phone_room(tests.id(100))->>'rehearsal')::boolean,'Phones see the rehearsal is over');
select ok(not exists(select 1 from jsonb_array_elements(public.phone_room(tests.id(100))->'answers') a where a->>'id' in (tests.id(971)::text,tests.id(974)::text)),'A phone no longer holds its test answers');
select is(tests.send(971,321,'',jsonb_build_object('choices',jsonb_build_array('a')),'change',1)->>'status','conflict','A cleared test answer cannot be changed');
select tests.login(2);
select is(tests.rehearse(966,'clear')->>'status','denied','A facilitator not on the engagement cannot clear');
-- A closed engagement refuses.

-- ---------- Export ----------
select tests.login(1);
select is(tests.ctl(906,'go_live',jsonb_build_object('session',tests.id(322)))->>'status','ok','Sign together is live');
select tests.login(5);
select is(tests.send(980,322,'',jsonb_build_object('strokes',jsonb_build_array('M10 10L20 20')))->>'status','accepted','Ben signs');
select tests.login(1);
select is(tests.ctl(907,'go_live',jsonb_build_object('session',tests.id(323)))->>'status','ok','The private form is live');
select tests.login(6);
select is(tests.send(981,323,'',jsonb_build_object('answers',jsonb_build_object('q1','Honest talk about the building')))->>'status','accepted','Ruth answers privately');
select tests.login(1);
select is(public.session_export(tests.id(100),tests.id(310))->>'named','false','An anonymous session exports without names');
select is(public.session_export(tests.id(100),tests.id(310))->>'church','Riverside Church','The export names the church, for the file name');
select is((select count(*)::integer from jsonb_array_elements(public.session_export(tests.id(100),tests.id(310))->'rows') r where r->>'name' is not null),0,'no row carries a name');
select is(jsonb_array_length(public.session_export(tests.id(100),tests.id(310))->'rows'),4,'Every standing answer, withdrawn ones left out');
select is(public.session_export(tests.id(100),tests.id(310))->'rows'->0->>'text','Young families finding us online','oldest first, as changed');
select is(public.session_export(tests.id(100),tests.id(322))->'rows'->0->>'name','Ben Ortiz','Sign together exports names: it is named by design');
select is(public.session_export(tests.id(100),tests.id(322))->'rows'->0->'value','{"name":"Ben Ortiz"}'::jsonb,'and never the strokes');
select is(public.session_export(tests.id(100),tests.id(323))->'rows'->0->>'name','Ruth Morrison','The private form exports to the facilitator with names');
select is(public.session_export(tests.id(100),tests.id(323))->'rows'->0->'value'->'answers'->>'q1','Honest talk about the building','and the answers');
select is(public.session_export(tests.id(100),tests.id(325))->>'status','no_input','A content screen has no input to export');
select tests.login(3);
select is(public.session_export(tests.id(100),tests.id(323))->>'status','denied','A phone cannot export, private form or not');
select tests.login(4);
select is(public.session_export(tests.id(100),tests.id(310))->>'status','denied','Nor can the TV');
select tests.login(2);
select is(public.session_export(tests.id(100),tests.id(310))->>'status','denied','Nor a facilitator not on the engagement');

-- ---------- The results recap ----------
select tests.login(1);
select is(public.results_recap(tests.id(100))->>'status','ok','The facilitator reads the recap');
select is(tests.recap(321)->'results',tests.results_for(321),'Each session''s results come from the same server results function');
select is((tests.recap(321)->'results'->>'people')::integer,1,'Real answers only after the clear');
select ok(tests.recap(310) is not null,'An open self-paced session is in the recap');
select is(tests.recap(310)->'session'->>'state','open','with its state worked out from the times');
select is(jsonb_array_length(tests.recap(310)->'answers'),4,'and its shared answers, for the card');
select is(jsonb_array_length(tests.recap(323)->'answers'),0,'A private form''s answers never ride along');
select is((tests.recap(323)->'results'->>'people')::integer,1,'only its count');
select is(tests.recap(311),null,'A self-paced session not yet open is left out');
select is(tests.recap(313),null,'A draft is left out');
select is(tests.recap(325),null,'Content screens are left out');
select is(tests.recap(324),null,'A step the clear put back to Ready, with no answers, is left out');

-- csv_rows is the row count of the session's own CSV, for every card.
select is((select count(*)::integer from jsonb_array_elements(public.results_recap(tests.id(100))->'sessions') s
  where (s->>'csv_rows')::integer is distinct from jsonb_array_length(public.session_export(tests.id(100),(s->'session'->>'id')::uuid)->'rows')),0,'Every recap card counts the rows its CSV holds');
reset role;
-- A hidden answer, a test answer and a two-word word cloud answer are all rows; a withdrawn one is not.
update public.submissions set hidden=true where id=(select id from public.submissions where session_id=tests.id(310) and not withdrawn and not deleted order by id limit 1);
update public.submissions set test=true where id=(select id from public.submissions where session_id=tests.id(310) and not withdrawn and not deleted order by id offset 1 limit 1);
update public.submissions set answers='[{"text":"hope","key":"hope"},{"text":"joy","key":"joy"}]'::jsonb where id=(select id from public.submissions where session_id=tests.id(320) and not withdrawn and not deleted order by id limit 1);
select tests.login(1);
set local role authenticated;
select is((tests.recap(310)->>'csv_rows')::integer,jsonb_array_length(public.session_export(tests.id(100),tests.id(310))->'rows'),'Hidden and test answers are rows, withdrawn ones are not');
select is((tests.recap(310)->>'csv_rows')::integer,4,'the wall''s four standing answers');
select is((tests.recap(320)->>'csv_rows')::integer,jsonb_array_length(public.session_export(tests.id(100),tests.id(320))->'rows'),'A two-word word cloud answer is one row');
select cmp_ok((tests.recap(320)->'results'->>'total')::integer,'>=',(tests.recap(320)->>'csv_rows')::integer,'while the TV counts its words');
select ok(not has_function_privilege('authenticated','private.results_recap_pre_overnight_copy_ui(uuid)','execute'),'The wrapped recap function is not callable by authenticated');
select ok(not (public.results_recap(tests.id(100))::text like '%Private note%'),'The recap carries no presenter notes');
select ok(not (public.results_recap(tests.id(100))::text like '%person%@example.org%'),'nor anyone''s email');
select tests.login(3);
select is(public.results_recap(tests.id(100))->>'status','denied','Phones cannot read the recap');
select tests.login(4);
select is(public.results_recap(tests.id(100))->>'status','denied','Nor can the TV');

-- A closed engagement refuses a rehearsal press.
reset role;
update engagements set status='closed' where id=tests.id(100);
set local role authenticated;
select tests.login(1);
select is(tests.rehearse(967,'start')->>'status','closed','A closed engagement refuses a rehearsal');
select is(public.results_recap(tests.id(100))->>'status','ok','but its recap stays readable');
reset role;

-- Every new function is private or an invoker wrapper.
select ok(not (select bool_or(prosecdef) from pg_proc where oid in('public.rehearsal_control(uuid,uuid,text)'::regprocedure,'public.session_export(uuid,uuid)'::regprocedure,'public.results_recap(uuid)'::regprocedure)),'The public functions are invokers');
select ok((select bool_and(prosecdef and proconfig @> array['search_path=""']) from pg_proc where oid in('private.rehearsal_control(uuid,uuid,text)'::regprocedure,'private.session_export(uuid,uuid)'::regprocedure,'private.results_recap(uuid)'::regprocedure,'private.rehearsing(uuid)'::regprocedure)),'The private ones are definers with an empty search path');
select ok(not has_function_privilege('authenticated','private.rehearsing(uuid)','execute') and not has_function_privilege('authenticated','private.mark_test()','execute'),'The helpers are not callable by browsers');
set local role anon;
select throws_ok($$select public.results_recap('86a00000-0000-4000-8000-000000000100'::uuid)$$,'42501',null,'Anonymous callers cannot read the recap');
reset role;
select * from finish();
rollback;
