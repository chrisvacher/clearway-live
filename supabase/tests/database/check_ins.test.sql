-- Milestone 7, step 2: the check-ins. Who may reach them (the lead, a co-facilitator, another engagement's facilitator, a participant, the scribe,
-- a team facilitator, the TV and an unsigned browser), how rounds are made and sent, what a person's link shows and changes, and what the
-- practice reset clears.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('8d070000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(1000+n))::text,true); end $$;
create function tests.state() returns jsonb language sql as $$ select public.check_in_state(tests.id(100)) $$;
create function tests.q(sql text) returns text language plpgsql security definer set search_path='' as $$ declare v text; begin execute sql into v; return v; end $$;
create function tests.hash(c text) returns text language sql immutable as $$ select repeat(c,64) $$;
grant execute on all functions in schema tests to authenticated,anon,service_role;

insert into churches(id,name,timezone) values(tests.id(200),'Riverside Church','America/Toronto'),(tests.id(201),'Lakeside Church','America/Toronto');
insert into engagements(id,church_id,title) values(tests.id(100),tests.id(200),'Wayfinding room'),(tests.id(101),tests.id(201),'Another room');
insert into engagements(id,church_id,title,type) values(tests.id(102),tests.id(200),'A team workshop','team_workshop'),(tests.id(103),tests.id(200),'Second wayfinding','wayfinding');
insert into engagements(id,church_id,title,type) values('90000000-0000-4000-8000-000000000010',tests.id(200),'Permanent practice','practice');
insert into auth.users(id,email,email_confirmed_at)
select tests.id(n),case when n in(1,2,7) then 'fac'||n||'@clearway.co' else 'person'||n||'@example.org' end,now() from generate_series(1,10)n;
insert into auth.sessions(id,user_id) select tests.id(1000+n),tests.id(n) from generate_series(1,10)n;
insert into auth.identities(user_id,provider,provider_id,identity_data) select id,'google',id::text,jsonb_build_object('email',email,'email_verified',true) from auth.users where id in(tests.id(1),tests.id(2),tests.id(7));
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method) select gen_random_uuid(),tests.id(1000+n),now(),now(),'oauth' from unnest(array[1,2,7]) n;
insert into clearway_users(id,auth_user_id,name,email,is_admin,team_hub_team_member_id) values
 (tests.id(701),tests.id(1),'Chris Vacher','fac1@clearway.co',false,tests.id(801)),
 (tests.id(702),tests.id(2),'Jaisy Tam','fac2@clearway.co',false,tests.id(802)),
 (tests.id(707),tests.id(7),'Other Facilitator','fac7@clearway.co',false,tests.id(807));
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values(tests.id(100),tests.id(701),'lead'),(tests.id(100),tests.id(702),'co_facilitator'),(tests.id(101),tests.id(707),'lead'),
 (tests.id(102),tests.id(701),'lead'),(tests.id(103),tests.id(701),'lead'),('90000000-0000-4000-8000-000000000010',tests.id(701),'lead');
insert into attendees(id,engagement_id,auth_user_id,name,email,verified_at,room_role) values
 (tests.id(503),tests.id(100),tests.id(3),'Krista Scribe','person3@example.org',now(),'scribe'),
 (tests.id(504),tests.id(100),tests.id(4),'Priya Shah','priya@riverside.org',now(),'participant'),
 (tests.id(510),tests.id(100),tests.id(10),'Ben Ortiz','ben@riverside.org',now(),'participant');
insert into device_sessions(engagement_id,attendee_id,auth_session_id) values
 (tests.id(100),tests.id(503),tests.id(1003)),(tests.id(100),tests.id(504),tests.id(1004)),(tests.id(100),tests.id(510),tests.id(1010));
update room_states set remote_holder_id=tests.id(510) where engagement_id=tests.id(100);
insert into private.tv_devices(id,proof,engagement_id,label,paired_at) values(tests.id(450),repeat('a',64),tests.id(100),'Front TV',now());
insert into private.live_tv_sessions(id,engagement_id,auth_user_id,auth_session_id,device_id) values(tests.id(400),tests.id(100),tests.id(5),tests.id(1005),tests.id(450));

-- The plan: one outcome, one card. Priya owns a step and a goal, Marcus (no attendee row) a step, Ben a goal and no step, and one goal and one step have no owner.
insert into private.vision_outcomes(id,engagement_id,title,status,confirmed_at,position) values(tests.id(600),tests.id(100),'Leaders raised from within','confirmed',now(),0);
insert into private.intent_cards(id,engagement_id,outcome_id,intent) values(tests.id(610),tests.id(100),tests.id(600),'Every ministry grows its own leader');
insert into private.first_steps(id,engagement_id,card_id,text,owner_attendee_id,owner_name,owner_email,due_date,position) values
 (tests.id(620),tests.id(100),tests.id(610),'List every ministry lead',tests.id(504),null,null,'2027-02-01',0),
 (tests.id(621),tests.id(100),tests.id(610),'Invite two members to tell their story',null,'Marcus Webb','marcus@riverside.example','2027-02-15',1),
 (tests.id(622),tests.id(100),tests.id(610),'A step nobody owns yet',null,null,null,null,2);
insert into private.goals(id,engagement_id,outcome_id,title,owner_attendee_id,owner_name,owner_email,end_date,season,position) values
 (tests.id(630),tests.id(100),tests.id(600),'Launch the apprentice pathway',tests.id(504),null,null,'2027-04-30','JAN_APR',0),
 (tests.id(631),tests.id(100),tests.id(600),'Develop a leader in every 1:1',tests.id(510),null,null,'2027-08-31','MAY_AUG',1),
 (tests.id(632),tests.id(100),tests.id(600),'A goal nobody owns yet',null,null,null,null,null,2);

-- ---------- The records: forced row-level security, no browser grant, functions of the right kind ----------
select is((select count(*) from pg_class where oid=any(array['private.check_in_rounds','private.check_in_recipients','private.check_in_answers']::regclass[]) and relrowsecurity and relforcerowsecurity),3::bigint,'All three tables force row-level security');
select is((select count(*) from information_schema.role_table_grants where grantee in('authenticated','anon','public') and table_schema='private' and table_name in('check_in_rounds','check_in_recipients','check_in_answers')),0::bigint,'Browsers and anonymous callers hold no privilege on them');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'check\_in\_%' and p.prosecdef),0::bigint,'Every public check-in function is a security invoker wrapper');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like 'check\_in\_%' and not p.prosecdef),0::bigint,'Every private check-in function is security definer');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'check\_in\_%'),13::bigint,'There are thirteen public check-in functions');

-- ---------- Rounds are made when the retreat closes ----------
select is((select count(*) from private.check_in_rounds where engagement_id=tests.id(100)),0::bigint,'No rounds before the retreat closes');
select is(private.retreat_closed_on(tests.id(100)),null,'The contract says the retreat has not closed');
update engagements set retreat_end_date='2027-01-01' where id=tests.id(100);
select is((select count(*) from private.check_in_rounds where engagement_id=tests.id(100)),0::bigint,'Setting the end date alone makes none');
update engagements set status='follow_up' where id=tests.id(100);
select is((select count(*) from private.check_in_rounds where engagement_id=tests.id(100)),0::bigint,'Moving to follow-up alone makes none either');
select is(private.retreat_closed_on(tests.id(100)),null,'and the contract still says the retreat has not closed');
select ok(private.retreat_close(tests.id(100),'2027-01-01 15:00+00'),'Closing the retreat');
select is(private.retreat_closed_on(tests.id(100)),date '2027-01-01','gives the retreat''s last day');
select is((select array_agg(day order by day) from private.check_in_rounds where engagement_id=tests.id(100)),array[30,60,90]::smallint[],'and makes the 30, 60 and 90-day rounds');
select is((select array_agg(due_on order by day) from private.check_in_rounds where engagement_id=tests.id(100)),array[date '2027-01-31',date '2027-03-02',date '2027-04-01'],'due 30, 60 and 90 days after the last day');
select is((select count(distinct status) from private.check_in_rounds where engagement_id=tests.id(100)),1::bigint,'all scheduled');
update engagements set retreat_end_date='2027-01-02' where id=tests.id(100);
select is((select count(*) from private.check_in_rounds where engagement_id=tests.id(100)),3::bigint,'A later change does not make them again');
update engagements set status='follow_up',retreat_end_date='2027-01-05' where id=tests.id(102);
select ok(private.retreat_close(tests.id(102),now()),'Closing a team workshop');
select is((select count(*) from private.check_in_rounds where engagement_id=tests.id(102)),0::bigint,'gets no check-ins');
update engagements set status='follow_up' where id=tests.id(101);
select is((select count(*) from private.check_in_rounds where engagement_id=tests.id(101)),0::bigint,'Follow-up with Day 2 still open makes none');

-- ---------- Who may read ----------
set local role authenticated;
select tests.login(1);
select is(tests.state()->>'status','ok','The lead reads the check-ins');
select is(jsonb_array_length(tests.state()->'rounds'),3,'three rounds');
select is(tests.state()->>'owners','3','and how many people it would go to');
select tests.login(2);
select is(tests.state()->>'status','ok','A co-facilitator reads them');
select tests.login(7);
select is(tests.state()->>'status','denied','A facilitator of another engagement does not');
select tests.login(4);
select is(tests.state()->>'status','denied','A participant does not');
select tests.login(3);
select is(tests.state()->>'status','denied','The scribe does not');
select tests.login(10);
select is(tests.state()->>'status','denied','A team facilitator holding the remote does not');
select tests.login(5);
select is(tests.state()->>'status','denied','A TV does not');
select tests.login(9);
select is(tests.state()->>'status','denied','Someone with no place in the room does not');
select throws_ok($$select count(*) from private.check_in_rounds$$,'42501',null,'No signed-in role reads the rounds directly');
select throws_ok($$select count(*) from private.check_in_recipients$$,'42501',null,'nor the recipients');
select throws_ok($$select count(*) from private.check_in_answers$$,'42501',null,'nor the answers');
select throws_ok($$insert into private.check_in_rounds(engagement_id,day,due_on) values(tests.id(100),30,now())$$,'42501',null,'or write a round');

-- ---------- Who may act ----------
reset role;
-- The round's id is read as the owner, since a browser role cannot read the table.
create function tests.round30() returns uuid language sql security definer set search_path='' as $$ select id from private.check_in_rounds where engagement_id='8d070000-0000-4000-8000-000000000100'::uuid and day=30 $$;
grant execute on function tests.round30() to authenticated,anon,service_role;
create function tests.acts(n integer) returns text language plpgsql as $$
declare out text:='';
begin
 perform tests.login(n);
 out:=out||(public.check_in_create(tests.id(103),'2027-02-01')->>'status')||',';
 out:=out||(public.check_in_switch(tests.id(100),false)->>'status')||',';
 out:=out||(public.check_in_send_guard(tests.id(100),tests.round30())->>'status')||',';
 out:=out||(public.check_in_follow_up(tests.id(100),tests.id(1),true)->>'status')||',';
 out:=out||(public.check_in_open_as(tests.id(100),tests.id(1),tests.hash('f'))->>'status');
 return out;
end $$;
grant execute on function tests.acts(integer) to authenticated;
set local role authenticated;
select is(tests.acts(7),'denied,denied,denied,denied,denied','A facilitator of another engagement cannot create, switch, send, follow up or open as');
select is(tests.acts(4),'denied,denied,denied,denied,denied','A participant cannot');
select is(tests.acts(3),'denied,denied,denied,denied,denied','The scribe cannot');
select is(tests.acts(10),'denied,denied,denied,denied,denied','A team facilitator cannot');
select is(tests.acts(5),'denied,denied,denied,denied,denied','A TV cannot');
select is(tests.acts(9),'denied,denied,denied,denied,denied','Someone with no place cannot');
reset role;
select is((select count(*) from private.check_in_rounds where engagement_id=tests.id(100) and status='scheduled'),3::bigint,'None of that changed a round');
set local role anon;
select throws_ok($$select public.check_in_state(tests.id(100))$$,'42501',null,'An unsigned browser cannot read');
select throws_ok($$select public.check_in_create(tests.id(100),null)$$,'42501',null,'or create');
select throws_ok($$select public.check_in_switch(tests.id(100),false)$$,'42501',null,'or switch');
select throws_ok($$select public.check_in_send_guard(tests.id(100),tests.id(1))$$,'42501',null,'or ask to send');
select throws_ok($$select public.check_in_follow_up(tests.id(100),tests.id(1),true)$$,'42501',null,'or follow up');
select throws_ok($$select public.check_in_open_as(tests.id(100),tests.id(1),tests.hash('f'))$$,'42501',null,'or open as');
reset role;

-- The server's functions: no browser role, signed in or not, may call them.
set local role authenticated;
select tests.login(1);
select throws_ok($$select public.check_in_claim_due(current_date)$$,'42501',null,'A facilitator cannot claim due rounds, the server does');
select throws_ok($$select public.check_in_round_begin(tests.round30(),'schedule',current_date,true)$$,'42501',null,'or begin a send');
select throws_ok($$select public.check_in_round_save(tests.round30(),'[]')$$,'42501',null,'or save recipients');
select throws_ok($$select public.check_in_recipient_result(tests.id(1),'sent')$$,'42501',null,'or record a result');
select throws_ok($$select public.check_in_round_finish(tests.round30())$$,'42501',null,'or finish a round');
select throws_ok($$select public.check_in_phone_read(tests.hash('a'))$$,'42501',null,'or read a person''s page');
select throws_ok($$select public.check_in_phone_save(tests.hash('a'),'help',null,null,'x')$$,'42501',null,'or save an answer');
select throws_ok($$select private.retreat_closed_on(tests.id(100))$$,'42501',null,'The contract functions are the server''s too');
select throws_ok($$select * from private.check_in_latest_for_view(tests.id(100))$$,'42501',null,'including the goal status for the read-only copy');
reset role;
set local role anon;
select throws_ok($$select public.check_in_claim_due(current_date)$$,'42501',null,'An unsigned browser cannot claim');
select throws_ok($$select public.check_in_phone_read(tests.hash('a'))$$,'42501',null,'or read a page');
select throws_ok($$select public.check_in_phone_save(tests.hash('a'),'help',null,null,'x')$$,'42501',null,'or save');
select throws_ok($$select * from private.check_in_latest_for_view(tests.id(100))$$,'42501',null,'or read goal status');
reset role;

-- ---------- Facilitator actions ----------
set local role authenticated;
select tests.login(1);
select is(public.check_in_create(tests.id(100),null)->>'status','exists','The lead cannot make the rounds twice');
select is(public.check_in_create(tests.id(102),'2027-02-01')->>'status','not_available','or for a team workshop');
select is(public.check_in_create(tests.id(103),null)->>'status','needs_date','With no retreat end date, creating asks for one');
select is(public.check_in_create(tests.id(103),'1999-01-01')->>'status','invalid_request','and refuses an old date');
select is(public.check_in_create(tests.id(103),'2027-02-01')->>'status','ok','The lead gives the base date');
select tests.login(2);
select is(public.check_in_switch(tests.id(100),false)->>'status','ok','A co-facilitator switches the rounds off');
reset role;
select is((select count(*) from private.check_in_rounds where engagement_id=tests.id(100) and status='off'),3::bigint,'all three');
select is((select array_agg(due_on order by day) from private.check_in_rounds where engagement_id=tests.id(103)),array[date '2027-03-03',date '2027-04-02',date '2027-05-02'],'and the date they gave made the dates');
set local role authenticated;
select tests.login(1);
select is(public.check_in_send_guard(tests.id(100),tests.round30())->>'status','off','Send now on a switched off round says so');
select is(public.check_in_switch(tests.id(100),true)->>'status','ok','Switched back on');
select is(public.check_in_send_guard(tests.id(100),tests.round30())->>'status','ok','Send now then passes for the lead');
select is(public.check_in_send_guard(tests.id(100),tests.round30())->>'by',tests.id(701)::text,'and says who pressed it');
select is(public.check_in_send_guard(tests.id(100),tests.id(5))->>'status','not_found','An unknown round is not found');
select is(public.check_in_send_guard(tests.id(101),tests.round30())->>'status','denied','and a round cannot be reached through another engagement');
reset role;

-- ---------- The server's send ----------
set local role service_role;
select is(jsonb_array_length(public.check_in_claim_due('2027-01-30')->'rounds'),0,'Nothing is due the day before the first due date');
select is(jsonb_array_length(public.check_in_claim_due('2027-01-31')->'rounds'),1,'The 30-day round is due on its date');
select is(public.check_in_claim_due('2027-01-31')->'rounds'->0->>'day','30','and it is the 30-day round');
select is(public.check_in_round_begin(tests.round30(),'schedule','2027-01-30',false)->>'status','not_due','Begin before the date is not due');
select is(public.check_in_round_begin(tests.round30(),'someone','2027-01-31',false)->>'status','invalid_request','and a sender that is neither the schedule nor a person is refused');
select is(public.check_in_round_begin(tests.round30(),'schedule','2027-01-31',false)->>'status','ok','Begin on the date takes the round');
select is(public.check_in_round_begin(tests.round30(),'schedule','2027-01-31',false)->>'status','busy','A second run is busy');
select is(jsonb_array_length(public.check_in_claim_due('2027-01-31')->'rounds'),0,'and the round is not due again while it is held');
reset role;
select is((select status from private.check_in_rounds where id=tests.round30()),'sending','The round is sending');
select is((select sent_by from private.check_in_rounds where id=tests.round30()),'schedule','by the schedule');

create function tests.people() returns jsonb language sql as $$
 select jsonb_build_array(
  jsonb_build_object('id',tests.id(900),'email','priya@riverside.org','name','Priya Shah','attendee',tests.id(504),'token_hash',tests.hash('1'),'steps',jsonb_build_array(tests.id(620)),'goals',jsonb_build_array(tests.id(630))),
  jsonb_build_object('id',tests.id(901),'email','marcus@riverside.example','name','Marcus Webb','attendee',null,'token_hash',tests.hash('2'),'steps',jsonb_build_array(tests.id(621)),'goals','[]'::jsonb),
  jsonb_build_object('id',tests.id(902),'email','ben@riverside.org','name','Ben Ortiz','attendee',tests.id(510),'token_hash',tests.hash('3'),'steps','[]'::jsonb,'goals',jsonb_build_array(tests.id(631)))) $$;
grant execute on function tests.people() to service_role;
set local role service_role;
select is((select count(*) from jsonb_array_elements(tests.people())),3::bigint,'Three people go to');
reset role;
-- The people the records give, which the server groups: Priya, Marcus and Ben, and the unowned step and goal are nobody's.
select is((select count(distinct email) from private.check_in_owned(tests.id(100))),3::bigint,'Three distinct owner emails in the records');
select is((select count(*) from private.check_in_owned(tests.id(100))),4::bigint,'four owned items, the step and goal nobody owns are left out');
select is((select email from private.check_in_owned(tests.id(100)) where id=tests.id(621)),'marcus@riverside.example','A name-and-email owner gives that email');
select is((select email from private.check_in_owned(tests.id(100)) where id=tests.id(620)),'priya@riverside.org','An attendee owner gives the attendee''s own email');
set local role service_role;
-- A person cannot be given a step they do not own.
select throws_ok($$select public.check_in_round_save(tests.round30(),jsonb_build_array(jsonb_build_object('id',tests.id(903),'email','ben@riverside.org','name','Ben','attendee',null,'token_hash',tests.hash('4'),'steps',jsonb_build_array(tests.id(620)),'goals','[]'::jsonb)))$$,'22023',null,'The server cannot add a step to someone who does not own it');
select throws_ok($$select public.check_in_round_save(tests.round30(),jsonb_build_array(jsonb_build_object('id',tests.id(903),'email','ben@riverside.org','name','Ben','attendee',null,'token_hash',tests.hash('4'),'steps','[]'::jsonb,'goals','[]'::jsonb)))$$,'22023',null,'or send an email with nothing in it');
select is(public.check_in_round_save(tests.round30(),tests.people())->>'status','ok','The people are saved');
select is(public.check_in_round_save(tests.round30(),tests.people())->>'status','exists','and cannot be saved twice');
reset role;
select is((select count(*) from private.check_in_recipients where round_id=tests.round30()),3::bigint,'Three recipients');
select is((select items->'goals'->0->>'text' from private.check_in_recipients where id=tests.id(900)),'Launch the apprentice pathway','Priya''s goal is in her list');
select is((select jsonb_array_length(items->'steps')+jsonb_array_length(items->'goals') from private.check_in_recipients where id=tests.id(902)),1,'Ben, a goal owner with no first step, has just the goal');
select is((select attendee_id from private.check_in_recipients where id=tests.id(901)),null,'Marcus has no attendee');
set local role service_role;
select is(public.check_in_round_finish(tests.round30())->>'status','unfinished','A round is not sent until each person has a result');
select is(public.check_in_recipient_result(tests.id(900),'sent')->>'status','ok','A result is recorded');
select is(public.check_in_recipient_result(tests.id(900),'sent')->>'status','unchanged','and the same result twice changes nothing');
select is(public.check_in_recipient_result(tests.id(901),'practice_address')->>'status','ok','Marcus''s .example address is a practice address');
select is(public.check_in_recipient_result(tests.id(902),'failed')->>'status','ok','Ben''s email failed');
select is(public.check_in_recipient_result(tests.id(902),'bounced')->>'status','invalid_request','Another result is refused');
select is(public.check_in_round_finish(tests.round30())->>'status','ok','The round finishes');
select is(public.check_in_round_finish(tests.round30())->>'status','unchanged','and finishing twice does nothing');
select is(public.check_in_round_begin(tests.round30(),'schedule','2027-01-31',false)->>'status','sent','A sent round is not begun again by the schedule');
reset role;
select is((select status from private.check_in_rounds where id=tests.round30()),'sent','The round is sent');
select ok((select sent_at is not null from private.check_in_rounds where id=tests.round30()),'with the time');
set local role service_role;
select is(public.check_in_round_begin(tests.round30(),tests.id(701)::text,'2027-01-31',true)->>'status','ok','Send now on a round with a failure takes it again');
reset role;
select is((select count(*) from private.check_in_recipients where round_id=tests.round30() and send_result is null),1::bigint,'only the failed recipient is open to send again');
select is((select send_result from private.check_in_recipients where id=tests.id(901)),'practice_address','and the practice address stays as it was');
set local role service_role;
select is(public.check_in_recipient_result(tests.id(902),'sent')->>'status','ok','It goes this time');
select is(public.check_in_round_finish(tests.round30())->>'status','ok','and the round is sent again');
reset role;

-- ---------- A person's page ----------
set local role service_role;
select is(public.check_in_phone_read(tests.hash('9'))->>'status','unknown','A token nobody has is unknown');
select is(public.check_in_phone_read('nope')->>'status','unknown','and so is one with the wrong shape');
select is(public.check_in_phone_read(tests.hash('1'))->>'status','ok','Priya''s token opens her page');
select is(public.check_in_phone_read(tests.hash('1'))->>'first','Priya','with her first name');
select is(public.check_in_phone_read(tests.hash('1'))->>'day','30','for the 30-day round');
select is(jsonb_array_length(public.check_in_phone_read(tests.hash('1'))->'steps'),1,'one first step');
select is(public.check_in_phone_read(tests.hash('1'))->'steps'->0->>'text','List every ministry lead','her own');
select is(public.check_in_phone_read(tests.hash('1'))->'goals'->0->>'title','Launch the apprentice pathway','and her own goal');
select ok(position('Marcus' in public.check_in_phone_read(tests.hash('1'))::text)=0 and position('Invite two' in public.check_in_phone_read(tests.hash('1'))::text)=0 and position('Develop a leader' in public.check_in_phone_read(tests.hash('1'))::text)=0,'and nothing of anyone else''s');
select ok(position('marcus@' in public.check_in_phone_read(tests.hash('1'))::text)=0 and position('ben@' in public.check_in_phone_read(tests.hash('1'))::text)=0,'no one else''s email');
select is(jsonb_array_length(public.check_in_phone_read(tests.hash('3'))->'steps'),0,'Ben has no first step on his page');
select is(jsonb_array_length(public.check_in_phone_read(tests.hash('3'))->'goals'),1,'only his goal');
select is(public.check_in_phone_read(tests.hash('1'))->>'editable','true','The newest round is open to change');
select is(public.check_in_phone_read(tests.hash('1'))->>'next_on','2027-03-02','and says when the next one comes');
reset role;
select ok((select opened_at is null from private.check_in_recipients where id=tests.id(900)),'Reading the page does not record an open, since an email scanner fetches it');
set local role service_role;
select is(public.check_in_phone_save(tests.hash('1'),'open',null,null,null)->>'status','ok','The page records its own open once it has loaded');
reset role;
select ok((select opened_at is not null from private.check_in_recipients where id=tests.id(900)),'and then it is recorded');
update private.check_in_recipients set opened_at='2027-01-01 10:00:00+00' where id=tests.id(900);
set local role service_role;
select is(public.check_in_phone_save(tests.hash('1'),'open',null,null,null)->>'status','ok','Opening again');
reset role;
select is((select opened_at from private.check_in_recipients where id=tests.id(900)),'2027-01-01 10:00:00+00'::timestamptz,'keeps the first time');
set local role service_role;
select is(public.check_in_phone_save(tests.hash('1'),'step',tests.id(620),'stuck','I need to know who signs off')->>'status','ok','A step is saved');
select is(public.check_in_phone_save(tests.hash('1'),'step',tests.id(620),'stuck','I need to know who signs off')->>'status','ok','the same save twice is the same');
select is(public.check_in_phone_save(tests.hash('1'),'goal',tests.id(630),'at_risk','A second pair of hands')->>'status','ok','A goal is saved');
select is(public.check_in_phone_save(tests.hash('1'),'help',null,null,'A meeting with the elders')->>'status','ok','and so is what would help overall');
select is(public.check_in_phone_save(tests.hash('1'),'step',tests.id(621),'done',null)->>'status','invalid_request','A step that is not hers is refused');
select is(public.check_in_phone_save(tests.hash('1'),'goal',tests.id(631),'done',null)->>'status','invalid_request','and so is a goal');
select is(public.check_in_phone_save(tests.hash('1'),'step',tests.id(620),'finished',null)->>'status','invalid_request','A made-up answer is refused');
select is(public.check_in_phone_save(tests.hash('1'),'goal',tests.id(630),'stuck',null)->>'status','invalid_request','and a step answer on a goal');
select is(public.check_in_phone_save(tests.hash('1'),'step',tests.id(620),'done',repeat('x',501))->>'status','invalid_request','A note over 500 characters is refused');
select is(public.check_in_phone_save(tests.hash('9'),'help',null,null,'x')->>'status','unknown','An unknown token saves nothing');
select is(public.check_in_phone_read(tests.hash('1'))->'steps'->0->>'answer','stuck','The answer survives a read');
select is(public.check_in_phone_read(tests.hash('1'))->'steps'->0->>'note','I need to know who signs off','with its note');
select is(public.check_in_phone_read(tests.hash('1'))->>'help','A meeting with the elders','and the overall help');
select is(public.check_in_phone_read(tests.hash('3'))->'goals'->0->>'answer',null,'Ben''s page shows no answer');
reset role;
select is((select count(*) from private.check_in_answers where recipient_id=tests.id(900)),2::bigint,'Two answers are stored, not three');
select ok((select answered_at is null from private.check_in_recipients where id=tests.id(900)),'Taps and notes alone do not mark her answered');
select is((select count(*) from private.check_in_recipients where answered_at is not null and round_id=tests.round30()),0::bigint,'so nobody is answered yet');
set local role service_role;
select is(public.check_in_phone_save(tests.hash('2'),'finish',null,null,null)->>'status','invalid_request','Sending with no answers saved is refused');
select is(public.check_in_phone_save(tests.hash('1'),'finish',null,null,null)->>'status','ok','Pressing Send my check-in finishes it');
reset role;
select ok((select answered_at is not null from private.check_in_recipients where id=tests.id(900)),'and she is marked answered');
select is((select count(*) from private.check_in_recipients where id<>tests.id(900) and answered_at is not null and round_id=tests.round30()),0::bigint,'but nobody else is');

-- A facilitator follows up.
set local role authenticated;
select tests.login(1);
select is((select count(*) from jsonb_array_elements(tests.state()->'rounds'->0->'recipients') r where r->'steps'->0->>'answer'='stuck'),1::bigint,'The lead sees the stuck step');
select is(tests.state()->'rounds'->0->'recipients'->0->>'name','Ben Ortiz','with each person by name');
select is(position('@' in tests.state()::text),0,'and no owner''s email reaches the browser');
reset role;
create function tests.answer_of(step uuid) returns uuid language sql security definer set search_path='' as $$ select id from private.check_in_answers where first_step_id=step or goal_id=step limit 1 $$;
grant execute on function tests.answer_of(uuid) to authenticated;
set local role authenticated;
select tests.login(7);
select is(public.check_in_follow_up(tests.id(100),tests.answer_of(tests.id(620)),true)->>'status','denied','Another engagement''s facilitator cannot mark it');
select tests.login(2);
select is(public.check_in_follow_up(tests.id(100),tests.answer_of(tests.id(620)),true)->>'status','ok','A co-facilitator marks it followed up');
select is(public.check_in_follow_up(tests.id(100),tests.answer_of(tests.id(630)),true)->>'status','ok','and the goal at risk');
select is(public.check_in_follow_up(tests.id(100),tests.id(5),true)->>'status','not_found','An unknown answer is not found');
select ok(tests.state()->'rounds'->0->'recipients' @> '[{"name":"Priya Shah"}]'::jsonb,'Priya is in the results');
select is((select r->'steps'->0->>'followed_up_at' is not null from jsonb_array_elements(tests.state()->'rounds'->0->'recipients') r where r->>'name'='Priya Shah'),true,'with the follow-up time');
select is(public.check_in_follow_up(tests.id(100),tests.answer_of(tests.id(620)),false)->>'status','ok','Marking can be undone');
reset role;

-- Done is not a follow-up.
set local role service_role;
select is(public.check_in_phone_save(tests.hash('2'),'step',tests.id(621),'done',null)->>'status','ok','Marcus marks his step done');
reset role;
set local role authenticated;
select tests.login(1);
select is(public.check_in_follow_up(tests.id(100),tests.answer_of(tests.id(621)),true)->>'status','not_a_follow_up','A done step has nothing to follow up');
reset role;

-- A changed answer drops the follow-up mark, because it is a new answer.
set local role authenticated;
select tests.login(1);
select is(public.check_in_follow_up(tests.id(100),tests.answer_of(tests.id(620)),true)->>'status','ok','Marked again');
reset role;
set local role service_role;
select is(public.check_in_phone_save(tests.hash('1'),'step',tests.id(620),'stuck','I need to know who signs off')->>'status','ok','Saving the same answer again');
reset role;
select ok((select followed_up_at is not null from private.check_in_answers where id=tests.answer_of(tests.id(620))),'keeps the mark');
set local role service_role;
select is(public.check_in_phone_save(tests.hash('1'),'step',tests.id(620),'under_way','Got the answer')->>'status','ok','A new answer');
reset role;
select ok((select followed_up_at is null from private.check_in_answers where id=tests.answer_of(tests.id(620))),'clears it');

-- ---------- Open as this person ----------
set local role authenticated;
select tests.login(1);
select is(public.check_in_open_as(tests.id(100),tests.id(901),tests.hash('f'))->>'status','ok','The lead opens a practice address as that person');
select is(public.check_in_open_as(tests.id(100),tests.id(900),tests.hash('e'))->>'status','not_a_practice_address','but not a real address');
select is(public.check_in_open_as(tests.id(100),tests.id(901),'short')->>'status','invalid_request','A bad hash is refused');
select is(public.check_in_open_as(tests.id(100),tests.id(5),tests.hash('e'))->>'status','not_found','and an unknown person');
reset role;
set local role service_role;
select is(public.check_in_phone_read(tests.hash('f'))->>'name','Marcus Webb','The fresh token opens Marcus''s page');
select is(public.check_in_phone_read(tests.hash('2'))->>'status','unknown','and the old one no longer does');
select is(public.check_in_phone_read(tests.hash('1'))->>'status','ok','Priya''s real link is untouched');
reset role;

-- ---------- A link is editable until the next round goes out ----------
update private.check_in_rounds set due_on='2027-01-31' where id=tests.round30();
select is(private.check_in_editable(tests.round30()),true,'The 30-day link is editable while it is the newest');
update private.check_in_rounds set status='sent',sent_at=now() where engagement_id=tests.id(100) and day=60;
select is(private.check_in_editable(tests.round30()),false,'Once the 60-day round is sent it is not');
set local role service_role;
select is(public.check_in_phone_read(tests.hash('1'))->>'editable','false','The page says it is read-only');
select is(public.check_in_phone_read(tests.hash('1'))->>'newest_day','60','and points to the 60-day round');
select is(public.check_in_phone_save(tests.hash('1'),'step',tests.id(620),'done',null)->>'status','read_only','A save is refused');
select is(public.check_in_phone_read(tests.hash('1'))->'steps'->0->>'answer','under_way','and the answer stays as it was');
select is(public.check_in_phone_save(tests.hash('1'),'help',null,null,'later')->>'status','read_only','so is the overall help');
reset role;

-- ---------- Goal status for the read-only copy ----------
set local role service_role;
select is((select count(*) from private.check_in_latest_for_view(tests.id(100))),1::bigint,'One goal has an owner-reported status');
select is((select status from private.check_in_latest_for_view(tests.id(100)) where goal_id=tests.id(630)),'at_risk','its newest status');
select ok((select answered_on is not null from private.check_in_latest_for_view(tests.id(100))),'and the date');
select is((select count(*) from private.check_in_latest_for_view(tests.id(101))),0::bigint,'Another engagement has none');
reset role;

-- ---------- Skipped rounds, closed engagements, practice rooms ----------
update private.check_in_rounds set status='scheduled',sent_at=null where engagement_id=tests.id(103);
set local role service_role;
select is(public.check_in_claim_due('2027-06-01')->'rounds'->0->>'day','90','When all three are due at once only the latest goes out');
reset role;
select is((select array_agg(status order by day) from private.check_in_rounds where engagement_id=tests.id(103)),array['off','off','scheduled'],'and the earlier ones are put away');
update engagements set status='closed' where id=tests.id(103);
set local role service_role;
select is((select count(*) from jsonb_array_elements(public.check_in_claim_due('2027-06-01')->'rounds') r where r->>'engagement'=tests.id(103)::text),0::bigint,'A closed engagement has nothing due');
select is(public.check_in_round_begin((select id from private.check_in_rounds where engagement_id=tests.id(103) and day=90),'schedule','2027-06-01',true)->>'status','closed','and cannot begin');
update engagements set status='closed' where id=tests.id(100);
select is(public.check_in_phone_read(tests.hash('1'))->>'status','ended','A closed engagement ends every link kindly');
select is(public.check_in_phone_read(tests.hash('1'))->>'church','Riverside Church','naming the church only');
select is(public.check_in_phone_save(tests.hash('1'),'help',null,null,'x')->>'status','ended','and takes no more answers');
reset role;
update engagements set status='follow_up' where id=tests.id(100);

-- The practice room: rounds, recipients and answers are cleared by the reset and by Clear test answers.
insert into private.check_in_rounds(id,engagement_id,day,due_on) values(tests.id(950),'90000000-0000-4000-8000-000000000010',30,'2027-01-31'),(tests.id(951),'90000000-0000-4000-8000-000000000010',60,'2027-03-02');
insert into private.check_in_recipients(id,round_id,engagement_id,email,name,token_hash,items) values(tests.id(952),tests.id(950),'90000000-0000-4000-8000-000000000010','practice@example.org','Practice Person',tests.hash('7'),'{"steps":[],"goals":[]}');
select is((select count(*) from private.check_in_rounds where engagement_id='90000000-0000-4000-8000-000000000010'),2::bigint,'The practice room has two rounds');
select lives_ok($$select private.check_in_clear('90000000-0000-4000-8000-000000000010')$$,'Clearing runs');
select is((select count(*) from private.check_in_rounds where engagement_id='90000000-0000-4000-8000-000000000010')+(select count(*) from private.check_in_recipients where engagement_id='90000000-0000-4000-8000-000000000010'),0::bigint,'and leaves nothing in the practice room');
select is((select count(*) from private.check_in_rounds where engagement_id=tests.id(100)),3::bigint,'while another engagement''s rounds stay');
insert into private.check_in_rounds(id,engagement_id,day,due_on) values(tests.id(953),'90000000-0000-4000-8000-000000000010',30,'2027-01-31');
insert into private.report_drafts(id,engagement_id,test) values(tests.id(976),'90000000-0000-4000-8000-000000000010',false);
select ok(private.reset_practice_room(),'Reset practice room runs');
select is((select count(*) from private.check_in_rounds where engagement_id='90000000-0000-4000-8000-000000000010'),0::bigint,'and clears the practice room''s rounds');
select is((select deleted from private.report_drafts where id=tests.id(976)),true,'and the report''s records under it, since our wrapper sits over the report''s');
select is((select count(*) from private.check_in_recipients where engagement_id=tests.id(100)),3::bigint,'and not the other engagement''s recipients');

-- ---------- A round is skipped once a later one has gone out ----------
insert into engagements(id,church_id,title,type) values(tests.id(104),tests.id(200),'Fourth wayfinding','wayfinding');
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values(tests.id(104),tests.id(701),'lead');
update engagements set status='follow_up' where id=tests.id(104);
select is(private.check_in_make_rounds(tests.id(104),'2027-01-01'),3,'A third engagement has its three rounds');
create function tests.r(day integer) returns uuid language sql security definer set search_path='' as $$ select id from private.check_in_rounds where engagement_id='8d070000-0000-4000-8000-000000000104'::uuid and day=$1 $$;
create function tests.rs(day integer) returns text language sql security definer set search_path='' as $$ select status from private.check_in_rounds where engagement_id='8d070000-0000-4000-8000-000000000104'::uuid and day=$1 $$;
create function tests.s4() returns jsonb language sql as $$ select public.check_in_state(tests.id(104)) $$;
grant execute on function tests.r(integer),tests.rs(integer),tests.s4() to authenticated,anon,service_role;

-- Path one: the base date is in the past, so 90 goes out and 30 and 60 are put away. Switching on must not bring them back.
update private.check_in_rounds set status='sent',sent_at=now() where id=tests.r(90);
update private.check_in_rounds set status='off' where id=tests.r(30) or id=tests.r(60);
set local role authenticated;
select tests.login(1);
select is(tests.s4()->>'can_switch_on','false','Nothing would be scheduled by switching on, so the page does not offer it');
select is((select r->>'superseded' from jsonb_array_elements(tests.s4()->'rounds') r where r->>'day'='30'),'true','The 30-day round is shown as skipped');
select is(public.check_in_switch(tests.id(104),true)->>'status','ok','Switching on');
reset role;
select is((select array_agg(tests.rs(d) order by d) from unnest(array[30,60,90]) d),array['off','off','sent'],'leaves the earlier rounds off');
set local role service_role;
select is((select count(*) from jsonb_array_elements(public.check_in_claim_due('2027-06-01')->'rounds') r where r->>'engagement'=tests.id(104)::text),0::bigint,'and the next run sends nothing for it');
reset role;

-- Path two: Send now on the 60-day round while the 30-day round is still scheduled.
update private.check_in_rounds set status='scheduled',sent_at=null where id=tests.r(30) or id=tests.r(90);
update private.check_in_rounds set status='sent',sent_at=now(),sent_by='schedule' where id=tests.r(60);
set local role authenticated;
select tests.login(1);
select is((select r->>'superseded' from jsonb_array_elements(tests.s4()->'rounds') r where r->>'day'='30'),'true','The 30-day round is skipped');
select is((select r->>'superseded' from jsonb_array_elements(tests.s4()->'rounds') r where r->>'day'='90'),'false','and the 90-day round is not');
select is(public.check_in_send_guard(tests.id(104),tests.r(30))->>'status','superseded','Send now on the skipped round is refused');
select is(public.check_in_send_guard(tests.id(104),tests.r(90))->>'status','ok','but not on the later one');
reset role;
set local role service_role;
select is(public.check_in_round_begin(tests.r(30),tests.id(701)::text,'2027-06-01',true)->>'status','superseded','The server will not begin it, even with Send now');
select is(public.check_in_round_begin(tests.r(30),'schedule','2027-06-01',false)->>'status','superseded','nor on the schedule');
select is((select array_agg(r->>'day' order by r->>'day') from jsonb_array_elements(public.check_in_claim_due('2027-06-01')->'rounds') r where r->>'engagement'=tests.id(104)::text),array['90'],'The run takes only the 90-day round');
reset role;
select is(tests.rs(30),'off','and puts the 30-day round away');
set local role authenticated;
select tests.login(1);
select is(public.check_in_switch(tests.id(104),true)->>'status','ok','Switching on afterwards');
reset role;
select is(tests.rs(30),'off','leaves it off');

-- Switching on does bring back a round that was only switched off, and says so.
update private.check_in_rounds set status='off',sent_at=null,claimed_at=null where engagement_id=tests.id(104);
set local role authenticated;
select tests.login(1);
select is(tests.s4()->>'can_switch_on','true','With nothing sent, switching on would schedule the rounds');
select is(public.check_in_switch(tests.id(104),true)->>'status','ok','and it does');
reset role;
select is((select array_agg(tests.rs(d) order by d) from unnest(array[30,60,90]) d),array['scheduled','scheduled','scheduled'],'all three');

-- ---------- What the email says is fixed at the first begin ----------
set local role service_role;
select is(public.check_in_round_begin(tests.r(30),'schedule','2027-01-31',false)->>'next_on','2027-03-02','The first begin works out the next check-in''s date');
reset role;
select is((select snapshot from private.check_in_rounds where id=tests.r(30)),jsonb_build_object('church','Riverside Church','next_on','2027-03-02'),'and keeps it with the church''s name');
update private.check_in_rounds set due_on='2027-03-09' where id=tests.r(60);
update public.churches set name='Riverside Community Church' where id=tests.id(200);
update private.check_in_rounds set claimed_at=now()-interval '20 minutes' where id=tests.r(30);
set local role service_role;
select is(public.check_in_round_begin(tests.r(30),'schedule','2027-01-31',false)->>'status','ok','A stale send is resumed');
select is(public.check_in_round_begin(tests.r(30),'schedule','2027-01-31',false)->>'status','busy','and then held again');
reset role;
update private.check_in_rounds set claimed_at=now()-interval '20 minutes' where id=tests.r(30);
set local role service_role;
select is((public.check_in_round_begin(tests.r(30),'schedule','2027-01-31',false)->>'next_on'),'2027-03-02','The resumed send says the same next date after the next round moved');
reset role;
update private.check_in_rounds set claimed_at=now()-interval '20 minutes' where id=tests.r(30);
set local role service_role;
select is((public.check_in_round_begin(tests.r(30),'schedule','2027-01-31',false)->>'church'),'Riverside Church','and the same church name after it was renamed');
reset role;
update public.churches set name='Riverside Church' where id=tests.id(200);

-- ---------- The practice room never emails ----------
insert into private.check_in_rounds(id,engagement_id,day,due_on) values(tests.id(960),'90000000-0000-4000-8000-000000000010',30,'2027-01-31');
set local role service_role;
select is(public.check_in_round_begin(tests.id(960),'schedule','2027-06-01',true)->>'practice_room','true','Beginning a practice room round says it is the practice room, so the server sends nothing');
select is(public.check_in_round_begin(tests.r(60),tests.id(701)::text,'2027-01-31',true)->>'practice_room','false','and another engagement''s round does not');
reset role;
delete from private.check_in_rounds where id=tests.id(960);

-- Clear test answers, run as the lead on the practice room, clears the check-in rows.
insert into private.check_in_rounds(id,engagement_id,day,due_on) values(tests.id(970),'90000000-0000-4000-8000-000000000010',30,'2027-01-31');
insert into private.check_in_recipients(id,round_id,engagement_id,email,name,token_hash,items) values(tests.id(971),tests.id(970),'90000000-0000-4000-8000-000000000010','practice@example.org','Practice Person',tests.hash('6'),'{"steps":[],"goals":[]}');
insert into private.report_drafts(id,engagement_id,test) values(tests.id(975),'90000000-0000-4000-8000-000000000010',true);
select is((select count(*) from private.check_in_rounds where engagement_id='90000000-0000-4000-8000-000000000010'),1::bigint,'The practice room has a round before Clear test answers');
set local role authenticated;
select tests.login(1);
select is(public.rehearsal_control('90000000-0000-4000-8000-000000000010',tests.id(973),'clear')->>'status','ok','The lead clears test answers in the practice room');
reset role;
select is((select count(*) from private.check_in_rounds where engagement_id='90000000-0000-4000-8000-000000000010')+(select count(*) from private.check_in_recipients where engagement_id='90000000-0000-4000-8000-000000000010')+(select count(*) from private.check_in_answers where engagement_id='90000000-0000-4000-8000-000000000010'),0::bigint,'and its rounds, recipients and answers are gone');
select is((select deleted from private.report_drafts where id=tests.id(975)),true,'and the report''s clearing, which sits under ours, still runs');
select is((select count(*) from private.check_in_rounds where engagement_id=tests.id(100)),3::bigint,'while the other engagements keep theirs');
set local role authenticated;
select tests.login(1);
select is(public.rehearsal_control(tests.id(100),tests.id(974),'clear')->>'status','ok','Clear test answers on a real engagement');
reset role;
select is((select count(*) from private.check_in_rounds where engagement_id=tests.id(100)),3::bigint,'does not touch its check-ins');
select * from finish();
rollback;
