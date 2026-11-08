-- Milestone 7, step 4: Day 2 close, share links and the read-only copy. Who may reach each function (the lead, a co-facilitator, another engagement's
-- facilitator, a participant, the scribe, a team facilitator, the TV and an unsigned browser), how Day 2 closes and makes the check-in rounds, what a
-- link opens and what it never shows, turning a link off, and what the practice reset clears.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('8e040000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(1000+n))::text,true); end $$;
create function tests.hash(c text) returns text language sql immutable as $$ select repeat(c,64) $$;
create function tests.state() returns jsonb language sql as $$ select public.share_state(tests.id(100)) $$;
create function tests.view(c text) returns jsonb language sql security definer set search_path='' as $$ select private.read_only_view(repeat(c,64)) $$;
grant execute on all functions in schema tests to authenticated,anon,service_role;

insert into churches(id,name,timezone) values(tests.id(200),'Riverside Church','America/Toronto'),(tests.id(201),'Lakeside Church','America/Toronto');
insert into engagements(id,church_id,title,base_year) values(tests.id(100),tests.id(200),'Wayfinding room',2026),(tests.id(101),tests.id(201),'Another room',2026);
insert into engagements(id,church_id,title,type) values(tests.id(102),tests.id(200),'A team workshop','team_workshop'),(tests.id(103),tests.id(200),'Second wayfinding','wayfinding'),(tests.id(104),tests.id(200),'Half day','day_and_a_half');
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
 (tests.id(102),tests.id(701),'lead'),(tests.id(103),tests.id(701),'lead'),(tests.id(104),tests.id(701),'lead'),('90000000-0000-4000-8000-000000000010',tests.id(701),'lead');
insert into attendees(id,engagement_id,auth_user_id,name,email,verified_at,room_role) values
 (tests.id(503),tests.id(100),tests.id(3),'Krista Scribe','person3@example.org',now(),'scribe'),
 (tests.id(504),tests.id(100),tests.id(4),'Priya Shah','priya@riverside.org',now(),'participant'),
 (tests.id(510),tests.id(100),tests.id(10),'Ben Ortiz','ben@riverside.org',now(),'participant');
insert into device_sessions(engagement_id,attendee_id,auth_session_id) values(tests.id(100),tests.id(503),tests.id(1003)),(tests.id(100),tests.id(504),tests.id(1004)),(tests.id(100),tests.id(510),tests.id(1010));
update room_states set remote_holder_id=tests.id(510) where engagement_id=tests.id(100);
insert into private.tv_devices(id,proof,engagement_id,label,paired_at) values(tests.id(450),repeat('a',64),tests.id(100),'Front TV',now());
insert into private.live_tv_sessions(id,engagement_id,auth_user_id,auth_session_id,device_id) values(tests.id(400),tests.id(100),tests.id(5),tests.id(1005),tests.id(450));

-- The plan: two outcomes, a card for the first, goals and first steps with owners (an attendee, and a name and email with no attendee row), a risk,
-- and a scribe tension the page must never show.
insert into private.vision_outcomes(id,engagement_id,title,description,status,confirmed_at,position) values
 (tests.id(600),tests.id(100),'Leaders raised from within','Every ministry grows its own leader','confirmed',now(),0),
 (tests.id(601),tests.id(100),'A welcome that sticks','First time families return','confirmed',now(),1);
insert into private.outcome_indicators(engagement_id,outcome_id,text,position) values(tests.id(100),tests.id(600),'Twelve apprentices serving',0);
insert into private.intent_cards(id,engagement_id,outcome_id,intent,must_do,what_we_stop) values(tests.id(610),tests.id(100),tests.id(600),'Every ministry grows its own leader','Name an apprentice in each ministry','Recruiting at the last minute');
insert into private.first_steps(id,engagement_id,card_id,text,owner_attendee_id,owner_name,owner_email,due_date,position) values
 (tests.id(620),tests.id(100),tests.id(610),'List every ministry lead',tests.id(504),null,null,'2027-02-01',0),
 (tests.id(621),tests.id(100),tests.id(610),'Invite two members to tell their story',null,'Marcus Webb','marcus.secret@riverside.example','2027-02-15',1);
insert into private.goals(id,engagement_id,outcome_id,title,result,result_clear,owner_attendee_id,end_date,season,position) values
 (tests.id(630),tests.id(100),tests.id(600),'Launch the apprentice pathway','Twelve apprentices in place',true,tests.id(504),'2027-04-30','JAN_APR',0),
 (tests.id(631),tests.id(100),tests.id(601),'Greet every guest by name','Every guest greeted',true,tests.id(510),'2027-08-31','MAY_AUG',1);
insert into sessions(id,engagement_id,title,part,position,state,interaction) values(tests.id(300),tests.id(100),'Day 1 step','Day 1',0,'closed','wall');
insert into sessions(id,engagement_id,title,part,position,state,interaction,closed_at) values(tests.id(301),tests.id(100),'Day 2 step one','Day 2',0,'live','wall',null);
insert into sessions(id,engagement_id,title,part,position,state,interaction) values(tests.id(302),tests.id(100),'Day 2 step two','Day 2',1,'draft','wall');
insert into private.scribe_cards(id,engagement_id,session_id,kind,text,speaker,attendee_id,captured_at) values
 (tests.id(640),tests.id(100),tests.id(300),'tension','SCRIBE-ONLY tension that nobody outside should read','Ben Ortiz',tests.id(503),now());

-- ---------- Records and functions: forced row-level security, no browser grant, the right kinds ----------
select is((select count(*) from pg_class where oid='private.read_only_links'::regclass and relrowsecurity and relforcerowsecurity),1::bigint,'The links table forces row-level security');
select is((select count(*) from information_schema.role_table_grants where grantee in('authenticated','anon','public') and table_schema='private' and table_name='read_only_links'),0::bigint,'Browsers and anonymous callers hold no privilege on it');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('retreat_mark_closed','retreat_reopen','share_state','share_link_create','share_link_revoke','read_only_view') and not p.prosecdef),6::bigint,'The six public functions are security invoker wrappers');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in('retreat_close','retreat_day2_closed','retreat_mark_closed','retreat_reopen','share_state','share_link_create','share_link_revoke','ro_report','read_only_view','ro_clear') and not p.prosecdef),0::bigint,'Every private one is security definer');
select is((select count(*) from pg_trigger where tgname='check_in_after_status'),0::bigint,'Step 2''s status trigger is gone');
select is((select data_type from information_schema.columns where table_schema='public' and table_name='engagements' and column_name='day2_closed_at'),'timestamp with time zone','Engagements record when Day 2 closed');

-- ---------- Day 2 closes with Close the day ----------
select is(private.retreat_closed_on(tests.id(100)),null,'Before Day 2 closes the contract gives no date');
insert into private.room_controls(id,engagement_id,action,room_version) values(tests.id(900),tests.id(100),'close_part',1);
select is((select day2_closed_at from engagements where id=tests.id(100)),null,'A close_part with a Day 2 step still live does not close the retreat');
update sessions set state='closed',closed_at=now() where id=tests.id(301);
insert into private.room_controls(id,engagement_id,action,room_version) values(tests.id(901),tests.id(100),'refresh_phones',2);
select is((select day2_closed_at from engagements where id=tests.id(100)),null,'Another control does not');
update engagements set retreat_end_date=null where id=tests.id(100);
insert into private.room_controls(id,engagement_id,action,room_version) values(tests.id(902),tests.id(100),'close_part',3);
select isnt((select day2_closed_at from engagements where id=tests.id(100)),null,'Closing Day 2 with its steps closed records when');
select is(private.retreat_closed_on(tests.id(100)),((select day2_closed_at from engagements where id=tests.id(100)) at time zone 'America/Toronto')::date,'The contract gives the church day it closed');
select is((select array_agg(day order by day) from private.check_in_rounds where engagement_id=tests.id(100)),array[30,60,90]::smallint[],'and the check-in rounds are made');
select is((select array_agg(due_on order by day) from private.check_in_rounds where engagement_id=tests.id(100)),array[private.retreat_closed_on(tests.id(100))+30,private.retreat_closed_on(tests.id(100))+60,private.retreat_closed_on(tests.id(100))+90],'30, 60 and 90 days after that day');
select ok(not private.retreat_close(tests.id(100),now()),'Closing again changes nothing');
select is((select count(*) from private.check_in_rounds where engagement_id=tests.id(100)),3::bigint,'and makes no more rounds');
update engagements set day2_closed_at='2026-11-05 03:30+00' where id=tests.id(100);
select is(private.retreat_closed_on(tests.id(100)),date '2026-11-04','Half past ten at night in Toronto is still that day');
update engagements set retreat_end_date='2026-11-06' where id=tests.id(100);
select is(private.retreat_closed_on(tests.id(100)),date '2026-11-06','The retreat end date wins when it is set');
update engagements set retreat_end_date=null,day2_closed_at=now() where id=tests.id(100);

-- The half day of a day-and-a-half engagement is its Day 2.
insert into sessions(id,engagement_id,title,part,position,state,interaction,closed_at) values(tests.id(310),tests.id(104),'The half day','Day 2',0,'closed','wall',now());
insert into private.room_controls(id,engagement_id,action,room_version) values(tests.id(903),tests.id(104),'close_part',1);
select isnt((select day2_closed_at from engagements where id=tests.id(104)),null,'Closing the half day closes the retreat');
select is((select count(*) from private.check_in_rounds where engagement_id=tests.id(104)),3::bigint,'and makes its rounds');
-- A close of Day 1 alone, or a status change, closes nothing.
insert into sessions(id,engagement_id,title,part,position,state,interaction,closed_at) values(tests.id(311),tests.id(103),'Day 1 only','Day 1',0,'closed','wall',now());
insert into private.room_controls(id,engagement_id,action,room_version) values(tests.id(904),tests.id(103),'close_part',1);
update engagements set status='follow_up',retreat_end_date='2027-01-01' where id=tests.id(103);
select is((select day2_closed_at from engagements where id=tests.id(103)),null,'Day 1 closing, or follow-up, does not close the retreat');
select is((select count(*) from private.check_in_rounds where engagement_id=tests.id(103)),0::bigint,'and makes no rounds');
update engagements set status='retreat' where id=tests.id(103);

-- ---------- Who may read the Share page ----------
set local role authenticated;
select tests.login(1);
select is(tests.state()->>'status','ok','The lead reads the Share page');
select is((tests.state()->>'closed')::boolean,true,'which says Day 2 has closed');
select tests.login(2);
select is(tests.state()->>'status','ok','A co-facilitator reads it');
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
select throws_ok($$select count(*) from private.read_only_links$$,'42501',null,'No signed-in role reads the links directly');
select throws_ok($$insert into private.read_only_links(engagement_id,name,token_hash) values(tests.id(100),'x',repeat('a',64))$$,'42501',null,'or writes one');
reset role;
set local role anon;
select throws_ok($$select public.share_state(tests.id(100))$$,'42501',null,'An unsigned browser cannot read the Share page');
select throws_ok($$select public.share_link_create(tests.id(100),'x',repeat('a',64))$$,'42501',null,'or make a link');
select throws_ok($$select public.share_link_revoke(tests.id(100),tests.id(1))$$,'42501',null,'or turn one off');
select throws_ok($$select public.retreat_mark_closed(tests.id(100))$$,'42501',null,'or mark the retreat closed');
select throws_ok($$select public.retreat_reopen(tests.id(100))$$,'42501',null,'or undo it');
select throws_ok($$select public.read_only_view(repeat('a',64))$$,'42501',null,'or open the public view');
select throws_ok($$select private.read_only_view(repeat('a',64))$$,'42501',null,'even through the private function');
reset role;

-- ---------- Who may act ----------
create function tests.acts(n integer) returns text language plpgsql as $$
declare out text:='';
begin
 perform tests.login(n);
 out:=out||(public.retreat_mark_closed(tests.id(103))->>'status')||',';
 out:=out||(public.retreat_reopen(tests.id(100))->>'status')||',';
 out:=out||(public.share_link_create(tests.id(100),'Elders',tests.hash('e'))->>'status')||',';
 out:=out||(public.share_link_revoke(tests.id(100),tests.id(1))->>'status');
 return out;
end $$;
grant execute on function tests.acts(integer) to authenticated;
set local role authenticated;
select is(tests.acts(7),'denied,denied,denied,denied','Another engagement''s facilitator cannot mark, undo, make or turn off');
select is(tests.acts(4),'denied,denied,denied,denied','A participant cannot');
select is(tests.acts(3),'denied,denied,denied,denied','The scribe cannot');
select is(tests.acts(10),'denied,denied,denied,denied','A team facilitator cannot');
select is(tests.acts(5),'denied,denied,denied,denied','A TV cannot');
select is(tests.acts(9),'denied,denied,denied,denied','Someone with no place cannot');
reset role;
select is((select count(*) from private.read_only_links),0::bigint,'None of that made a link');
select is((select day2_closed_at from engagements where id=tests.id(103)),null,'or closed a retreat');

-- ---------- Links ----------
set local role authenticated;
select tests.login(1);
select is(public.share_link_create(tests.id(103),'Elders',tests.hash('a'))->>'status','not_closed','A link waits for Day 2 to close');
select is(public.share_link_create(tests.id(102),'Elders',tests.hash('a'))->>'status','not_available','A team workshop has none');
select is(public.share_link_create(tests.id(100),'   ',tests.hash('a'))->>'status','invalid_request','A link needs a name');
select is(public.share_link_create(tests.id(100),repeat('n',81),tests.hash('a'))->>'status','invalid_request','of at most 80 characters');
select is(public.share_link_create(tests.id(100),'Elders','not-a-hash')->>'status','invalid_request','and a proper hash');
select is(public.share_link_create(tests.id(100),'  Elders  ',tests.hash('a'))->>'status','ok','The lead makes a link');
select tests.login(2);
select is(public.share_link_create(tests.id(100),'Board',tests.hash('b'))->>'status','ok','A co-facilitator makes one');
select is(jsonb_array_length(tests.state()->'links'),2,'The page lists both');
select is((select l->>'name' from jsonb_array_elements(tests.state()->'links') l where l->>'made_by'='Chris Vacher'),'Elders','with the name trimmed and who made it');
select is(tests.state()::text like '%'||repeat('a',64)||'%',false,'and never a token hash');
select is((select count(*) from jsonb_array_elements(tests.state()->'links') l where l->>'state'='active'),2::bigint,'Both are active');
reset role;
select is((select token_hash from private.read_only_links where name='Elders'),tests.hash('a'),'The database holds the hash it was given');

-- ---------- The public view ----------
select is(tests.view('z'),jsonb_build_object('status','unavailable'),'An unknown token gets the plain answer');
select is((select open_count from private.read_only_links where name='Elders'),0,'which counts nothing');
select is(public.read_only_view('short') is null,false,'A badly shaped hash is answered too');
select is(tests.view('a')->>'status','ok','A link opens the plan');
select is((select open_count from private.read_only_links where name='Elders'),1,'and the open is counted');
select isnt((select last_opened_at from private.read_only_links where name='Elders'),null,'with when');
select is(tests.view('a')->>'church','Riverside Church','It names the church');
select is(tests.view('a')->>'title','Wayfinding room','and the engagement');
select is(tests.view('a')->'report','null'::jsonb,'There is no report before sign-off');
select is(jsonb_array_length(tests.view('a')->'outcomes'),2,'Both Vision Outcomes are there');
select is(tests.view('a')#>>'{outcomes,0,indicators,0}','Twelve apprentices serving','with their indicators');
select is(tests.view('a')#>>'{outcomes,0,goals,0,owner}','Priya Shah','and each goal with its owner');
select is(tests.view('a')#>>'{outcomes,0,goals,0,end_date}','2027-04-30','and end date');
select is(tests.view('a')#>'{outcomes,0,goals,0,status}',null,'but no status before the first check-in');
select is(tests.view('a')#>>'{intents,0,steps,1,owner}','Marcus Webb','The commander''s intent card has its first steps and owners');
select is(tests.view('a')#>>'{intents,0,steps,0,due}','2027-02-01','and dates');

-- What the payload never holds.
select is(tests.view('a')::text like '%SCRIBE-ONLY%',false,'No scribe card text, not even in the Map''s Key Issues');
select is(tests.view('a')::text like '%@%',false,'no email address');
select is(tests.view('a')::text like '%secret%',false,'including a first step owner''s typed email');
select is(tests.view('a')::text like '%'||tests.id(504)::text||'%' or tests.view('a')::text like '%'||tests.id(610)::text||'%' or tests.view('a')::text like '%'||tests.id(630)::text||'%',false,'and no attendee or record id');
select is(tests.view('a')::text ~* '(sources|signal|submission|draft|note)','f','no sources, signals, submissions, drafts or notes');
select is(tests.view('a')#>>'{map,page2,issues,empty}','true','The Map''s Key Issues are empty without a pre-mortem risk');
insert into private.risks(id,engagement_id,text,likelihood,impact) values(tests.id(650),tests.id(100),'Leaders burn out before the pathway starts',0.6,0.7);
select is(tests.view('a')#>>'{map,page2,issues,items,0,text}','Leaders burn out before the pathway starts','but they keep a pre-mortem risk');

-- Goal status as the owner gave it: a label's code and a date, never the note.
insert into private.check_in_rounds(id,engagement_id,day,due_on,status) values(tests.id(950),tests.id(100),30,'2026-12-01','sent') on conflict(engagement_id,day) do update set status='sent';
insert into private.check_in_recipients(id,round_id,engagement_id,email,name,token_hash,items,send_result) select tests.id(951),r.id,tests.id(100),'priya@riverside.org','Priya Shah',tests.hash('7'),'{"steps":[],"goals":[]}','sent' from private.check_in_rounds r where r.engagement_id=tests.id(100) and r.day=30;
insert into private.check_in_answers(recipient_id,engagement_id,goal_id,answer,note) values(tests.id(951),tests.id(100),tests.id(630),'at_risk','NOTE-ONLY we lost our coordinator');
select is(tests.view('a')#>>'{outcomes,0,goals,0,status}','at_risk','Each goal shows the status its owner gave');
select is(tests.view('a')#>>'{outcomes,0,goals,0,status_on}',(now()::date)::text,'and the day they gave it');
select is(tests.view('a')::text like '%NOTE-ONLY%',false,'never the note');
select is(tests.view('a')#>'{outcomes,1,goals,0,status}',null,'A goal nobody has answered shows nothing');

-- The report: only the signed-off version, replaced by a newer sign-off, with sources stripped.
insert into private.report_sign_offs(engagement_id,n,snapshot) values(tests.id(100),1,jsonb_build_object('sections',jsonb_build_array(
 jsonb_build_object('key','overview','position',1,'heading','Overview','kind','prose','blocks',null,'sentences',jsonb_build_array(
  jsonb_build_object('id',tests.id(960),'position',0,'text','Version one of the overview.','origin','ai','quote',false,'thin_label',null,'sources',jsonb_build_array(jsonb_build_object('kind','scribe_card','ref_id',tests.id(640),'excerpt','SOURCE-ONLY words'))),
  jsonb_build_object('id',tests.id(961),'position',1,'text','"We are one team."','origin','room','quote',true,'thin_label','Thin data','sources','[]'::jsonb))),
 jsonb_build_object('key','outlook','position',10,'heading','The 1-year Outlook','kind','record','blocks',jsonb_build_object('columns',jsonb_build_array('Goal','Owner'),'rows',jsonb_build_array(
   jsonb_build_object('title','','cells',jsonb_build_array('Launch the pathway','Priya Shah'),'parts',jsonb_build_array(jsonb_build_object('role','goal','sentence_id',tests.id(962))),'reviewed',true),
   jsonb_build_object('title','Plain row','cells','[]'::jsonb,'parts',jsonb_build_array(jsonb_build_object('role','intent','sentence_id',tests.id(963),'owner','Ben Ortiz','due','2027-02-01'))))),
  'sentences',jsonb_build_array(jsonb_build_object('id',tests.id(962),'position',0,'text','A table sentence.','origin','record','quote',false,'thin_label',null,'sources','[]'::jsonb),
   jsonb_build_object('id',tests.id(963),'position',1,'text','Walk every ministry through the pathway.','origin','record','quote',false,'thin_label',null,'sources','[]'::jsonb),
   jsonb_build_object('id',tests.id(964),'position',2,'text','A lead above the table.','origin','ai','quote',false,'thin_label',null,'sources','[]'::jsonb)))
)));
select is(tests.view('a')#>>'{report,n}','1','Once signed off the report is on the link');
select is(tests.view('a')#>>'{report,sections,0,sentences,0,text}','Version one of the overview.','as reading text');
select is(tests.view('a')#>>'{report,sections,0,sentences,1,quote}','true','with its quotes marked');
select is(tests.view('a')#>>'{report,sections,0,sentences,1,thin}','Thin data','and its thin label');
select is(jsonb_array_length(tests.view('a')#>'{report,sections,1,sentences}'),1,'Sentences that belong to a table are not read twice');
select is(tests.view('a')#>>'{report,sections,1,table,rows,0,cells,1}','Priya Shah','A table keeps its cells');
select is(tests.view('a')#>>'{report,sections,1,table,rows,1,parts,0,text}','Walk every ministry through the pathway.','and its plain rows their words');
select is(tests.view('a')::text like '%SOURCE-ONLY%' or tests.view('a')::text like '%sources%' or tests.view('a')::text like '%origin%' or tests.view('a')::text like '%sentence_id%','f','with no sources, origins or sentence ids');
insert into private.report_sign_offs(engagement_id,n,snapshot) values(tests.id(100),2,jsonb_build_object('sections',jsonb_build_array(
 jsonb_build_object('key','overview','position',1,'heading','Overview','kind','prose','blocks',null,'sentences',jsonb_build_array(jsonb_build_object('id',tests.id(960),'position',0,'text','Version two of the overview.','origin','ai','quote',false,'thin_label',null,'sources','[]'::jsonb))))));
select is(tests.view('a')#>>'{report,sections,0,sentences,0,text}','Version two of the overview.','A new sign-off replaces what the link shows');
update private.report_sign_offs set deleted=true where engagement_id=tests.id(100) and n=2;
select is(tests.view('a')#>>'{report,n}','1','and withdrawing it brings the earlier version back');

-- ---------- Turning a link off, and when a link does not open ----------
set local role authenticated;
select tests.login(1);
select is((select l->>'id' from jsonb_array_elements(tests.state()->'links') l where l->>'name'='Board')::text is not null,true,'The Board link is listed');
reset role;
create function tests.link(n text) returns uuid language sql security definer set search_path='' as $$ select id from private.read_only_links where name=n $$;
grant execute on function tests.link(text) to authenticated;
set local role authenticated;
select tests.login(7);
select is(public.share_link_revoke(tests.id(100),tests.link('Board'))->>'status','denied','Another engagement''s facilitator cannot turn it off');
select tests.login(1);
select is(public.share_link_revoke(tests.id(101),tests.link('Board'))->>'status','denied','and the lead cannot reach it through another engagement');
select is(public.share_link_revoke(tests.id(100),tests.id(1))->>'status','not_found','An unknown link is not found');
select is(public.share_link_revoke(tests.id(100),tests.link('Board'))->>'status','ok','The lead turns it off');
select is(public.share_link_revoke(tests.id(100),tests.link('Board'))->>'status','already','Twice is the same');
select is((select l->>'state' from jsonb_array_elements(tests.state()->'links') l where l->>'name'='Board'),'revoked','The page says it is turned off');
select is((select l->>'revoked_by' from jsonb_array_elements(tests.state()->'links') l where l->>'name'='Board'),'Chris Vacher','and by whom');
reset role;
select is(tests.view('b'),jsonb_build_object('status','unavailable'),'A link turned off gives the plain answer at once');
select is(tests.view('b'),tests.view('z'),'the same one as an unknown link');
select is((select open_count from private.read_only_links where name='Board'),0,'and counts no open');
select is(tests.view('a')->>'status','ok','The other link still opens');
-- Undo and mark.
set local role authenticated;
select tests.login(1);
select is(public.retreat_reopen(tests.id(100))->>'status','checkins_started','Undo is refused once a check-in has gone out');
reset role;
delete from private.check_in_answers where engagement_id=tests.id(100);
delete from private.check_in_recipients where engagement_id=tests.id(100);
update private.check_in_rounds set status='scheduled' where engagement_id=tests.id(100);
set local role authenticated;
select tests.login(2);
select is(public.retreat_reopen(tests.id(100))->>'status','ok','A co-facilitator undoes a mistaken mark');
select is(tests.state()->>'closed','false','The page says Day 2 has not closed');
select is(public.retreat_reopen(tests.id(100))->>'status','not_closed','Undo twice is refused');
select is(public.share_link_create(tests.id(100),'Late',tests.hash('c'))->>'status','not_closed','and a new link waits again');
reset role;
select is((select count(*) from private.read_only_links),2::bigint,'The links stay');
select is((select count(*) from private.check_in_rounds where engagement_id=tests.id(100)),0::bigint,'The rounds made by the close went with it');
select is(tests.view('a'),jsonb_build_object('status','unavailable'),'Before Day 2 closes an active link gives the plain answer');
set local role authenticated;
select tests.login(2);
select is(public.retreat_mark_closed(tests.id(100))->>'status','ok','A co-facilitator marks the retreat closed');
select is(public.retreat_mark_closed(tests.id(100))->>'status','already','Twice is the same');
select is(public.retreat_mark_closed(tests.id(102))->>'status','denied','Another engagement is denied');
select tests.login(1);
select is(public.retreat_mark_closed(tests.id(102))->>'status','not_available','A team workshop cannot');
reset role;
select is((select array_agg(day order by day) from private.check_in_rounds where engagement_id=tests.id(100)),array[30,60,90]::smallint[],'Marking makes the rounds');
select is(tests.view('a')->>'status','ok','and the link opens again');
update engagements set day2_closed_at=now()-interval '2 hours' where id=tests.id(100);
set local role authenticated;
select tests.login(1);
select is(public.retreat_reopen(tests.id(100))->>'status','too_late','Undo is for the first hour only');
reset role;
update engagements set status='closed' where id=tests.id(100);
select is(tests.view('a'),jsonb_build_object('status','unavailable'),'A closed engagement gives the plain answer');
set local role authenticated;
select tests.login(1);
select is(public.share_link_create(tests.id(100),'After close',tests.hash('d'))->>'status','closed','and takes no new link');
reset role;
update engagements set status='retreat' where id=tests.id(100);

-- ---------- The practice room ----------
update engagements set day2_closed_at=now() where id='90000000-0000-4000-8000-000000000010';
insert into private.read_only_links(engagement_id,name,token_hash) values('90000000-0000-4000-8000-000000000010','Practice elders',tests.hash('9')),(tests.id(100),'Kept',tests.hash('8'));
select ok(private.reset_practice_room(),'Reset practice room runs');
select is((select count(*) from private.read_only_links where engagement_id='90000000-0000-4000-8000-000000000010'),0::bigint,'and clears the practice room''s links');
select is((select day2_closed_at from engagements where id='90000000-0000-4000-8000-000000000010'),null,'and opens its Day 2 again');
select is((select count(*) from private.read_only_links where engagement_id=tests.id(100)),3::bigint,'while another engagement''s links stay');
update engagements set day2_closed_at=now() where id='90000000-0000-4000-8000-000000000010';
insert into private.read_only_links(engagement_id,name,token_hash) values('90000000-0000-4000-8000-000000000010','Again',tests.hash('6'));
select lives_ok($$select private.ro_clear('90000000-0000-4000-8000-000000000010')$$,'Clearing runs');
select is((select count(*) from private.read_only_links where engagement_id='90000000-0000-4000-8000-000000000010')+(select count(*) from engagements where id='90000000-0000-4000-8000-000000000010' and day2_closed_at is not null),0::bigint,'and leaves nothing of the practice room''s');
select is(position('rehearsal_control_pre_read_only' in pg_get_functiondef('private.rehearsal_control(uuid,uuid,text)'::regprocedure))>0 and to_regprocedure('private.reset_practice_room_pre_read_only()') is not null,true,'Both shared wrappers sit over the definition that was newest');
select * from finish();
rollback;
