-- Milestone 7, step 3: the visibility plan. The four plan records and who may reach any of it (the lead, a co-facilitator, another engagement's facilitator,
-- a participant, the scribe, a team facilitator, the TV and an unsigned browser), the drafting round (due, claim, apply, fail) with every check the code makes
-- on a reply (a source, the six stages and the outward order, when only with a public date and on or before it, names, numbers, quotes, dashes), the
-- editor (set, edit, add, remove, move, review, redraft), the signal rule, the contract the report reads, and the practice room's reset and Clear test answers.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('ae070300-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(1000+n))::text,true); end $$;
create function tests.pstate() returns jsonb language sql as $$ select public.visibility_plan_state(tests.id(100)) $$;
create function tests.q(sql text) returns text language plpgsql security definer set search_path='' as $$ declare v text; begin execute sql into v; return v; end $$;
-- The worker, in two calls: claim the plan's round, and apply a reply to it.
create function tests.pclaim(eng uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare lease uuid:=gen_random_uuid(); v jsonb;
begin
 v:=private.visibility_plan_claim(coalesce(eng,tests.id(100)),lease,'recorded-fixture','{"draft_visibility_plan":"visibility-plan@1"}');
 return v||jsonb_build_object('lease',lease);
end $$;
create function tests.papply(v jsonb,rows jsonb) returns jsonb language sql security definer set search_path='' as $$
 select private.visibility_plan_apply((v->>'run')::uuid,(v->>'lease')::uuid,jsonb_build_object('rows',rows),'{"ms":900,"input_tokens":10,"output_tokens":5}')
$$;
-- The nth ref the model was given whose id starts with a letter.
create function tests.pref(v jsonb,pfx text,n integer default 1) returns text language sql as $$
 select x.value->>'ref' from jsonb_array_elements(v->'inputs'->'refs') x where x.value->>'ref' ~ ('^'||pfx||'[0-9]+$') order by (substr(x.value->>'ref',2))::integer offset n-1 limit 1
$$;
create function tests.prow(stage text,who text,hear text,refs jsonb,extra jsonb default '{}') returns jsonb language sql as $$
 select jsonb_build_object('stage',stage,'who',who,'hear',hear,'refs',refs)||extra
$$;
create function tests.stages() returns text language sql security definer set search_path='' as $$
 select string_agg(r.stage,',' order by r.position) from private.visibility_plan_rows r join private.visibility_plans p on p.id=r.plan_id where p.engagement_id=tests.id(100) and not p.deleted and not r.deleted
$$;
create function tests.rowid(w text) returns uuid language sql security definer set search_path='' as $$
 select r.id from private.visibility_plan_rows r where r.engagement_id=tests.id(100) and r.who=w and not r.deleted limit 1
$$;
create function tests.pstatus(eng uuid default null) returns text language sql security definer set search_path='' as $$ select p.status from private.visibility_plans p where p.engagement_id=coalesce(eng,tests.id(100)) and not p.deleted $$;
grant execute on all functions in schema tests to authenticated,anon,service_role;

insert into churches(id,name,timezone) values(tests.id(200),'Riverside Church','America/Toronto'),(tests.id(201),'Lakeside Church','America/Toronto');
insert into engagements(id,church_id,title,survey_respondents) values(tests.id(100),tests.id(200),'Wayfinding room',87),(tests.id(101),tests.id(201),'Another room',null);
insert into auth.users(id,email,email_confirmed_at)
select tests.id(n),case when n in(1,2,7) then 'fac'||n||'@clearway.co' else 'person'||n||'@example.org' end,now() from generate_series(1,10)n;
insert into auth.sessions(id,user_id) select tests.id(1000+n),tests.id(n) from generate_series(1,10)n;
insert into auth.identities(user_id,provider,provider_id,identity_data) select id,'google',id::text,jsonb_build_object('email',email,'email_verified',true) from auth.users where id in(tests.id(1),tests.id(2),tests.id(7));
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method) select gen_random_uuid(),tests.id(1000+n),now(),now(),'oauth' from unnest(array[1,2,7]) n;
insert into clearway_users(id,auth_user_id,name,email,is_admin,team_hub_team_member_id) values
 (tests.id(701),tests.id(1),'Chris Vacher','fac1@clearway.co',false,tests.id(801)),
 (tests.id(702),tests.id(2),'Jaisy Tam','fac2@clearway.co',false,tests.id(802)),
 (tests.id(707),tests.id(7),'Other Facilitator','fac7@clearway.co',false,tests.id(807));
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values(tests.id(100),tests.id(701),'lead'),(tests.id(100),tests.id(702),'co_facilitator'),(tests.id(101),tests.id(707),'lead');
insert into attendees(id,engagement_id,auth_user_id,name,email,verified_at,room_role) values
 (tests.id(503),tests.id(100),tests.id(3),'Krista Scribe','person3@example.org',now(),'scribe'),
 (tests.id(504),tests.id(100),tests.id(4),'Priya Shah','person4@example.org',now(),'participant'),
 (tests.id(510),tests.id(100),tests.id(10),'Ben Ortiz','person10@example.org',now(),'participant');
insert into device_sessions(engagement_id,attendee_id,auth_session_id) values
 (tests.id(100),tests.id(503),tests.id(1003)),(tests.id(100),tests.id(504),tests.id(1004)),(tests.id(100),tests.id(510),tests.id(1010));
update room_states set remote_holder_id=tests.id(510) where engagement_id=tests.id(100);
insert into private.tv_devices(id,proof,engagement_id,label,paired_at) values(tests.id(450),repeat('a',64),tests.id(100),'Front TV',now());
insert into private.live_tv_sessions(id,engagement_id,auth_user_id,auth_session_id,device_id) values(tests.id(400),tests.id(100),tests.id(5),tests.id(1005),tests.id(450));
insert into sessions(id,engagement_id,title,part,position,state,interaction,prompt) values
 (tests.id(310),tests.id(100),'Opening prayer and welcome','Day 1',1,'closed','content',''),
 (tests.id(311),tests.id(100),'Tensions and decisions','Day 2',1,'closed','content','');
-- What the report reads: a survey finding, two input conversations and the theme they share, scribe cards, and three signals.
insert into private.survey_findings(id,engagement_id,title,figure,rests_on) values(tests.id(601),tests.id(100),'A clear way into groups','31%',27);
insert into private.conversation_notes(id,engagement_id,kind,person,title,body,source_kind,word_count) values
 (tests.id(611),tests.id(100),'input','A board member','Board conversation','Volunteers are stretched thin, the same few people every week.','paste',10),
 (tests.id(612),tests.id(100),'input','A staff member','Staff conversation','Volunteers are tired. A handful of people do everything.','paste',9);
insert into private.discover_themes(id,engagement_id,source,label,detail,rests_on,out_of,status) values
 (tests.id(621),tests.id(100),'conversations','Volunteers are stretched thin','The same few people carry the volunteer load.',2,2,'accepted');
insert into private.discover_theme_sources(id,engagement_id,theme_id,finding_id,note_id,quote) values
 (tests.id(631),tests.id(100),tests.id(621),null,tests.id(611),'Volunteers are stretched thin, the same few people every week.'),
 (tests.id(632),tests.id(100),tests.id(621),null,tests.id(612),null);
insert into private.scribe_cards(id,engagement_id,session_id,kind,text,detail,speaker,attendee_id,captured_at) values
 (tests.id(641),tests.id(100),tests.id(311),'tension','Growing the staff team first or growing volunteer leadership first.','{}','Jordan Parker',tests.id(504),'2026-11-04 14:40:00+00'),
 (tests.id(642),tests.id(100),tests.id(311),'decision','We will launch the five outcomes a season apart.','{"why":"Trying all five at once is the risk the room feared most."}','Michael Reed',tests.id(504),'2026-11-04 15:02:00+00');
insert into private.signals(id,engagement_id,session_id,kind,theme_id,evidence,title,line,saved_as_citation_at) values
 (tests.id(651),tests.id(100),tests.id(310),'aligned',tests.id(621),'{"room":2}','The room names the same gap','What the room said about finding a group matches what the interviews said.','2026-11-03 16:00:00+00'),
 (tests.id(652),tests.id(100),tests.id(311),'aligned',tests.id(621),'{"room":2}','An aligned signal nobody saved','The room agrees on something nobody saved.',null),
 (tests.id(653),tests.id(100),tests.id(310),'divergent',tests.id(621),'{"room":2}','The room splits','Some of the room heads a different way.',null);


-- What the plan reads: outcome, scribe action and mitigation cards, risks (one merged away, one that names a person), a mitigation, an intent card with a
-- first step, a goal and a decision whose owners are attendees, and a ranked success measure.
insert into private.vision_outcomes(id,engagement_id,title,description,status,confirmed_at) values(tests.id(660),tests.id(100),'Leaders raised from within','Every ministry grows its next leader.','confirmed',now());
insert into private.scribe_cards(id,engagement_id,session_id,kind,text,detail,speaker,attendee_id,captured_at) values
 (tests.id(661),tests.id(100),tests.id(311),'action','Brief the elders before the plan is shared with the church.','{"date":"2027-01-10"}','Priya Shah',tests.id(504),'2026-11-04 16:14:00+00'),
 (tests.id(662),tests.id(100),tests.id(311),'action','Tell the congregation about the outcomes on a Sunday in January.','{}','Michael Reed',tests.id(504),'2026-11-04 16:10:00+00'),
 (tests.id(663),tests.id(100),tests.id(311),'mitigation','Name a back-up owner for every first step.','{"risk":"No one knew who owned what"}','Daniel Brooks',tests.id(504),'2026-11-04 15:50:00+00'),
 (tests.id(664),tests.id(100),tests.id(311),'action','Priya will phone every donor herself.','{}','Jordan Parker',tests.id(504),'2026-11-04 16:20:00+00');
insert into private.risks(id,engagement_id,text,likelihood,impact) values
 (tests.id(671),tests.id(100),'Staff burned out by spring',0.65,0.77),
 (tests.id(672),tests.id(100),'Priya carries it alone',0.5,0.5),
 (tests.id(673),tests.id(100),'We tried all five at once',0.8,0.85);
update private.risks set merged_into=tests.id(671) where id=tests.id(673);
insert into private.risk_mitigations(id,engagement_id,risk_id,text,recorded_by) values(tests.id(681),tests.id(100),tests.id(671),'One owner and a real end date per goal','facilitator');
insert into private.intent_cards(id,engagement_id,outcome_id,intent,must_do,what_we_stop) values(tests.id(691),tests.id(100),tests.id(660),'Every ministry is growing its own next leader.','Name an apprentice in every ministry.','Hiring from outside before we look within.');
insert into private.first_steps(id,engagement_id,card_id,text,owner_attendee_id,due_date,position) values(tests.id(692),tests.id(100),tests.id(691),'List every ministry lead and a possible apprentice',tests.id(504),'2026-11-27',0);
insert into private.goals(id,engagement_id,outcome_id,title,result,result_clear,owner_attendee_id,end_date,position) values(tests.id(693),tests.id(100),tests.id(660),'Launch the apprentice pathway','8 apprentices placed in ministries',true,tests.id(504),'2027-04-30',0);
insert into private.decisions(id,engagement_id,subject,subject_label,decision,reasons) values(tests.id(694),tests.id(100),'outcome','Leaders raised from within','Confirmed','The whole room said this is the one that makes the rest possible.');
insert into private.key_metrics(id,engagement_id,text,rank) values(tests.id(695),tests.id(100),'Leaders in training',1);

-- ---------- The records ----------
select is((select count(*) from pg_class where oid in('private.visibility_plans'::regclass,'private.visibility_plan_rows'::regclass,'private.visibility_plan_sources'::regclass,'private.visibility_plan_rounds'::regclass) and relrowsecurity and relforcerowsecurity),4::bigint,'All four plan records force row-level security');
select is((select count(*) from information_schema.role_table_grants where grantee in('authenticated','anon','public') and table_schema='private' and table_name in('visibility_plans','visibility_plan_rows','visibility_plan_sources','visibility_plan_rounds')),0::bigint,'and no browser or anonymous role has a grant on any of them');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'visibility\_plan\_%' and p.prosecdef),0::bigint,'Every public plan function is a security invoker wrapper');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like 'visibility\_plan\_%' and p.proname<>'visibility_plan_for_report' and not (p.prosecdef and p.proconfig @> array['search_path=""'])),0::bigint,'and every private one is security definer with an empty search path');
select is((select count(*) from pg_policies where schemaname='private' and tablename like 'visibility\_plan%'),0::bigint,'No policy opens a plan record to a browser role');
select is((select pg_get_function_result(p.oid) from pg_proc p where p.proname='visibility_plan_for_report' and p.pronamespace='private'::regnamespace),
 'TABLE(row_id uuid, "position" integer, who text, when_text text, by_whom text, what_they_hear text, risk text, reviewed boolean, sources jsonb)','The contract keeps exactly the signature the report was built against');
select ok(not (select prosrc like '%where false%' from pg_proc p where p.proname='visibility_plan_for_report' and p.pronamespace='private'::regnamespace),'and it is the real function, not step 1''s fixture');

-- ---------- Who may use it ----------
set local role authenticated;
select tests.login(1);
select is(tests.pstate()->>'status','ok','The lead reads the state');
select is(tests.pstate()->'plan','null'::jsonb,'and there is no plan yet');
select is(public.visibility_plan_start(tests.id(100),tests.id(900),false)->>'status','ai_off','Drafting with AI off says so');
select tests.login(2);
select is(tests.pstate()->>'status','ok','A co-facilitator reads it');
do $$ declare n integer; r jsonb; ids integer[]:=array[7,4,3,10,5,9]; i integer; begin
 for i in 1..6 loop
  perform tests.login(ids[i]);
  n:=0;
  r:=public.visibility_plan_state(tests.id(100)); if r->>'status'='denied' then n:=n+1; end if;
  r:=public.visibility_plan_set(tests.id(100),'Vision Sunday',null); if r->>'status'='denied' then n:=n+1; end if;
  r:=public.visibility_plan_start(tests.id(100),tests.id(80+i),false); if r->>'status'='denied' then n:=n+1; end if;
  r:=public.visibility_plan_row_edit(tests.id(100),tests.id(1),'{"who":"x"}'); if r->>'status'='denied' then n:=n+1; end if;
  r:=public.visibility_plan_row_add(tests.id(100),'{"stage":"board","who":"x"}'); if r->>'status'='denied' then n:=n+1; end if;
  r:=public.visibility_plan_row_remove(tests.id(100),tests.id(1)); if r->>'status'='denied' then n:=n+1; end if;
  r:=public.visibility_plan_row_move(tests.id(100),tests.id(1),'up'); if r->>'status'='denied' then n:=n+1; end if;
  r:=public.visibility_plan_row_reviewed(tests.id(100),tests.id(1),true); if r->>'status'='denied' then n:=n+1; end if;
  perform set_config('tests.denied_'||i,n::text,true);
 end loop;
end $$;
select is(current_setting('tests.denied_1'),'8','A facilitator of another engagement is denied all eight functions');
select is(current_setting('tests.denied_2'),'8','A participant is denied all eight');
select is(current_setting('tests.denied_3'),'8','The scribe is denied all eight');
select is(current_setting('tests.denied_4'),'8','A team facilitator holding the remote is denied all eight');
select is(current_setting('tests.denied_5'),'8','A TV is denied all eight');
select is(current_setting('tests.denied_6'),'8','Someone with no place is denied all eight');
select tests.login(1);
select throws_ok($$select public.visibility_plan_claim(tests.id(100),tests.id(1),'m','{}')$$,'42501',null,'The worker''s claim is not for a signed-in facilitator');
select throws_ok($$select public.visibility_plan_apply(tests.id(1),tests.id(1),'{}','{}')$$,'42501',null,'nor its apply');
select throws_ok($$select public.visibility_plan_fail(tests.id(1),tests.id(1),'x','{}')$$,'42501',null,'nor its fail');
select throws_ok($$select public.visibility_plan_due(tests.id(100))$$,'42501',null,'nor its due check');
select throws_ok($$select * from private.visibility_plan_for_report(tests.id(100))$$,'42501',null,'The contract is for the service role only');
select throws_ok($$select private.vp_inputs(tests.id(100))$$,'42501',null,'and so is what the model reads');
select throws_ok($$select count(*) from private.visibility_plans$$,'42501',null,'No signed-in role reads the plan record directly');
select throws_ok($$select count(*) from private.visibility_plan_rows$$,'42501',null,'or the rows');
select throws_ok($$select count(*) from private.visibility_plan_sources$$,'42501',null,'or the sources');
select throws_ok($$select count(*) from private.visibility_plan_rounds$$,'42501',null,'or the round');
reset role;
set local role anon;
select throws_ok($$select public.visibility_plan_state(tests.id(100))$$,'42501',null,'An unsigned browser cannot read the state');
select throws_ok($$select public.visibility_plan_start(tests.id(100),tests.id(1),false)$$,'42501',null,'or start a draft');
select throws_ok($$select public.visibility_plan_row_add(tests.id(100),'{"who":"x"}')$$,'42501',null,'or add a row');
select throws_ok($$select public.visibility_plan_row_edit(tests.id(100),tests.id(1),'{"who":"x"}')$$,'42501',null,'or edit one');
select throws_ok($$select public.visibility_plan_claim(tests.id(100),tests.id(1),'m','{}')$$,'42501',null,'or claim the round');
reset role;
set local role service_role;
select is((select count(*) from private.visibility_plan_for_report(tests.id(100))),0::bigint,'The service role reads no rows while there is no plan');
reset role;

-- ---------- The public moment ----------
set local role authenticated;
select tests.login(1);
select is(public.visibility_plan_set(tests.id(100),'  ',null)->>'status','invalid_request','A moment needs a name');
select is(public.visibility_plan_set(tests.id(100),'Vision Sunday','1999-01-01')->>'status','invalid_request','and a sensible date');
select is(public.visibility_plan_set(tests.id(100),'Commitment Sunday',null)->>'status','ok','The lead names the moment, with no date yet');
select is(public.visibility_plan_set(tests.id(100),'Commitment Sunday',null)->>'status','unchanged','the same again changes nothing');
select tests.login(2);
select is(public.visibility_plan_set(tests.id(100),'Vision Sunday','2027-01-31')->>'status','ok','A co-facilitator sets the date');
select is((tests.pstate()->'plan'->>'public_date'),'2027-01-31','and the state shows it');
select is(public.visibility_plan_set(tests.id(100),'Vision Sunday',null)->>'status','ok','The date can be taken away');
select is((tests.pstate()->'plan'->>'moment'),'Vision Sunday','The default moment is Vision Sunday');
reset role;

-- ---------- The drafting round ----------
update engagements set settings=settings||'{"ai_enabled":true}' where id=tests.id(100);
set local role authenticated;
select tests.login(1);
select is(public.visibility_plan_start(tests.id(100),tests.id(901),false)->>'status','ok','The lead starts a draft');
select is(public.visibility_plan_start(tests.id(100),tests.id(901),false)->>'status','duplicate','the same press again is a duplicate');
select is(public.visibility_plan_start(tests.id(100),tests.id(902),false)->>'status','busy','and another press while it runs is busy');
select is(tests.pstate()->>'status','ok','The state reads while drafting');
select is(tests.pstate()->'plan'->>'status','drafting','and the plan says Drafting');
reset role;
select is(private.visibility_plan_due(tests.id(100)),true,'The round is due');
create temp table c1 as select tests.pclaim() as v;
select is((select v->>'status' from c1),'claimed','The worker claims it');
select is(private.visibility_plan_due(tests.id(100)),false,'and it is no longer due while the lease holds');
select is(tests.pclaim()->>'status','busy','A second claim is busy');
select is((select string_agg(distinct left(x.value->>'ref',1),',' order by left(x.value->>'ref',1)) from c1,jsonb_array_elements(v->'inputs'->'refs') x),'a,d,g,i,k,m,r,s,y','The model reads action cards, decisions, goals, intent cards, mitigations, mitigation cards, risks, first steps and success measures');
select is((select count(*) from c1,jsonb_array_elements(v->'inputs'->'refs') x where x.value->>'text' like 'We tried all five%'),0::bigint,'A risk merged away is not read');
select is((select count(*) from c1,jsonb_array_elements(v->'inputs'->'refs') x where x.value->>'text' ilike '%priya%'),0::bigint,'and nothing that names an attendee is read');
select ok((select (v->'inputs')::text !~* 'priya|shah|krista|michael|daniel|jordan|speaker|@example' from c1),'No name, speaker, owner or email is anywhere in what the model is given');
select is((select count(*) from c1,jsonb_array_elements(v->'inputs'->'refs') x where x.value->>'text' like '%2026-11-27%' or x.value->>'text' like '%2027-01-10%'),0::bigint,'and no due date reaches it');
select is((select v->'inputs'->'public'->>'moment' from c1),'Vision Sunday','It is told the public moment');
select is((select v->'inputs'->'public'->'date' from c1),'null'::jsonb,'and that there is no date yet');
select is((select v->'inputs'->'kept_stages' from c1),'[]'::jsonb,'and that no stage is kept');
select is(tests.papply((select v from c1)||'{"lease":"00000000-0000-4000-8000-000000000001"}','[]'),'{"status":"stale"}'::jsonb,'A reply under the wrong lease is stale');

-- A reply with no public date: three rows are good (and out of order), the rest fail a check each.
create temp table a1 as select tests.papply((select v from c1),jsonb_build_array(
 tests.prow('congregation','The congregation','On Vision Sunday the church hears that every ministry is growing its own next leader.',jsonb_build_array(tests.pref((select v from c1),'i'))),
 tests.prow('lead_pastor','The lead pastor','Hears the whole plan first, and what is asked of the lead pastor'||chr(8212)||'before anyone else; and before the stage.',jsonb_build_array(tests.pref((select v from c1),'i'),tests.pref((select v from c1),'r')),'{"risk":"Staff burned out by spring"}'),
 tests.prow('participants','The retreat participants','Hold the plan until the elders have been briefed.',jsonb_build_array(tests.pref((select v from c1),'a'))),
 tests.prow('board','The elders','Hear the plan.',jsonb_build_array(tests.pref((select v from c1),'a')),'{"when":"Two weeks before"}'),
 tests.prow('board','The elders','Hear the plan.',jsonb_build_array(tests.pref((select v from c1),'a')),'{"when_date":"2027-01-10"}'),
 tests.prow('staff','The staff','Priya tells the staff first.',jsonb_build_array(tests.pref((select v from c1),'s'))),
 tests.prow('staff','The staff','42 people hear the plan.',jsonb_build_array(tests.pref((select v from c1),'s'))),
 tests.prow('staff','The staff','They hear "we are all lost" from the room.',jsonb_build_array(tests.pref((select v from c1),'s'))),
 tests.prow('elders','The elders','Hear the plan.',jsonb_build_array(tests.pref((select v from c1),'a'))),
 tests.prow('board','The elders','Hear the plan.','[]'),
 tests.prow('board','The elders','Hear the plan.','["zz9"]'),
 tests.prow('board','The elders','The communication plan starts here.',jsonb_build_array(tests.pref((select v from c1),'a'))),
 tests.prow('key_leaders','Key leaders','A three-year view is shared.',jsonb_build_array(tests.pref((select v from c1),'g'))),
 tests.prow('board','The elders','They hear "List every ministry lead and a possible apprentice" from the room.',jsonb_build_array(tests.pref((select v from c1),'s')))
)) as j;
select is((select j->>'status' from a1),'ok','The reply is applied');
select is((select (j->>'kept')::integer from a1),3,'Three rows pass every check');
select is((select (j->>'dropped')::integer from a1),11,'and eleven fail one each: a when with no public date (text, then date), a name, a number, a quote, a stage, no ref, an unknown ref, communication plan, a spelled-out number and a quotation from a first step, which is not the room''s words');
select is(tests.stages(),'lead_pastor,participants,congregation','The rows are in the outward order, whatever order the model wrote them in');
select is((select output->>'reordered' from private.ai_runs where id=(select (v->>'run')::uuid from c1)),'true','and the run log says it reordered them');
select is((select string_agg(x->>'reason',',' order by ord) from private.ai_runs r,jsonb_array_elements(r.output->'refused') with ordinality t(x,ord) where r.id=(select (v->>'run')::uuid from c1)),
 'when,when,name,number,quote,stage,unsourced,unsourced,term,number,quote','Each refusal is logged with its reason');
select is((select count(*)::integer from private.visibility_plan_rows r where r.engagement_id=tests.id(100) and not r.deleted and not exists(select 1 from private.visibility_plan_sources s where s.row_id=r.id and not s.deleted)),0,'Every row that was kept has a source');
select is((select count(*)::integer from private.visibility_plan_rows r where r.engagement_id=tests.id(100) and not r.deleted and r.origin='ai' and not r.touched and r.reviewed_at is null),3,'and is the AI''s, untouched');
select is((select string_agg(r.who,' | ' order by r.position) from private.visibility_plan_rows r where r.engagement_id=tests.id(100) and not r.deleted and r.stage='lead_pastor'),'The lead pastor','The lead pastor row is there');
select is((select what_they_hear from private.visibility_plan_rows where engagement_id=tests.id(100) and stage='lead_pastor' and not deleted),'Hears the whole plan first, and what is asked of the lead pastor, before anyone else, and before the stage.','Its dashes and semicolons were rewritten as commas');
select is((select count(*)::integer from private.visibility_plan_rows where engagement_id=tests.id(100) and not deleted and (when_text<>'' or when_date is not null)),0,'No row has a when without a public date');
select is((select status from private.visibility_plans where engagement_id=tests.id(100) and not deleted),'needs_attention','The plan is marked Needs attention');
select is((select dropped from private.visibility_plans where engagement_id=tests.id(100) and not deleted),11,'and says how many rows were left out');
select is((select status||':'||last_kept||':'||last_dropped from private.visibility_plan_rounds where engagement_id=tests.id(100) and not deleted),'ready:3:11','The round is ready');
select is(tests.pclaim()->>'status','idle','There is nothing left to claim');
select is(private.visibility_plan_due(tests.id(100)),false,'and nothing is due');

-- ---------- The editor ----------
set local role authenticated;
select tests.login(1);
select is((tests.pstate()->'rows'->0->'sources'->0->>'kind') is not null,true,'The state shows a row''s sources');
select is(jsonb_array_length(tests.pstate()->'rows'),3,'and three rows');
select ok((select bool_and((r->>'needs_source')::boolean=false) from jsonb_array_elements(tests.pstate()->'rows') r),'None needs a source');
select is(public.visibility_plan_row_edit(tests.id(100),tests.rowid('The retreat participants'),'{"what_they_hear":"Hold the plan until the board has met; then say nothing."}')->>'status','ok','The lead edits a cell in place');
reset role;
select is((select what_they_hear from private.visibility_plan_rows where id=tests.rowid('The retreat participants')),'Hold the plan until the board has met, then say nothing.','The edit is cleaned of semicolons');
set local role authenticated;
reset role;
select is((select touched and origin='ai' and reviewed_at is null from private.visibility_plan_rows where id=tests.rowid('The retreat participants')),true,'The row is touched, still the AI''s, and needs reviewing');
set local role authenticated;
reset role;
select is((select count(*)::integer from private.visibility_plan_sources where row_id=tests.rowid('The retreat participants') and not deleted)>0,true,'and keeps its sources');
set local role authenticated;
select is(public.visibility_plan_row_edit(tests.id(100),tests.rowid('The retreat participants'),'{"what_they_hear":"Hold the plan until the board has met, then say nothing."}')->>'status','unchanged','The same edit again changes nothing');
select is(public.visibility_plan_row_edit(tests.id(100),tests.rowid('The retreat participants'),'{"who":""}')->>'status','invalid_request','A row needs a who');
select is(public.visibility_plan_row_edit(tests.id(100),tests.rowid('The retreat participants'),'{"stage":"elders"}')->>'status','invalid_request','a real stage');
select is(public.visibility_plan_row_edit(tests.id(100),tests.rowid('The retreat participants'),'{"when_date":"nope"}')->>'status','invalid_request','a real date');
select is(public.visibility_plan_row_edit(tests.id(100),tests.rowid('The retreat participants'),'{"colour":"red"}')->>'status','invalid_request','and only the cells it has');
select is(public.visibility_plan_row_edit(tests.id(100),tests.rowid('The retreat participants'),'{"when_text":"After the elders","when_date":"2027-01-03"}')->>'status','ok','The facilitator may set a when and a date');
select is(public.visibility_plan_row_edit(tests.id(100),tests.rowid('The retreat participants'),'{"when_date":null}')->>'status','ok','and take the date away');
select is(public.visibility_plan_row_reviewed(tests.id(100),tests.rowid('The lead pastor'),true)->>'status','ok','The lead marks a row reviewed');
select is(public.visibility_plan_row_reviewed(tests.id(100),tests.rowid('The lead pastor'),true)->>'status','unchanged','and again changes nothing');
select is(tests.pstatus(),'edited','The plan is Edited, not yet reviewed');
select is(public.visibility_plan_row_add(tests.id(100),'{"stage":"board","who":"The elders","what_they_hear":"The plan, before the church hears it; and where the elders own a decision."}')->>'status','ok','The lead adds a row by hand');
select is(public.visibility_plan_row_add(tests.id(100),'{"stage":"board"}')->>'status','invalid_request','A row by hand needs a who');
select is(tests.stages(),'lead_pastor,participants,congregation,board','It goes last');
reset role;
select is((select origin||':'||touched||':'||(select count(*) from private.visibility_plan_sources s where s.row_id=r.id) from private.visibility_plan_rows r where r.id=tests.rowid('The elders')),'facilitator:true:0','as the facilitator''s own, with no source');
set local role authenticated;
select is(public.visibility_plan_row_move(tests.id(100),tests.rowid('The elders'),'up')->>'status','ok','The row can move up');
select is(tests.stages(),'lead_pastor,participants,board,congregation','and the rows keep the order the facilitator chose');
select is(public.visibility_plan_row_move(tests.id(100),tests.rowid('The lead pastor'),'up')->>'status','unchanged','The first row cannot move up');
select is(public.visibility_plan_row_move(tests.id(100),tests.rowid('The congregation'),'down')->>'status','unchanged','nor the last move down');
select is(public.visibility_plan_row_move(tests.id(100),tests.rowid('The lead pastor'),'sideways')->>'status','invalid_request','Only up and down');
reset role;
select is((select array_agg(position order by position) from private.visibility_plan_rows where engagement_id=tests.id(100) and not deleted),array[1,2,3,4],'Positions stay one to four');
set local role authenticated;
reset role;
select is((select touched from private.visibility_plan_rows where id=tests.rowid('The congregation')),false,'The congregation row is still untouched');
set local role authenticated;
reset role;

-- ---------- Redraft: touched and reviewed rows stay ----------
update engagements set status='retreat' where id=tests.id(100);
set local role authenticated;
select tests.login(1);
select is(public.visibility_plan_set(tests.id(100),'Vision Sunday','2027-01-31')->>'status','ok','The lead gives the public date');
select is(public.visibility_plan_start(tests.id(100),tests.id(903),false)->>'status','confirm','Redrafting asks first because rows are the facilitator''s');
select is((public.visibility_plan_start(tests.id(100),tests.id(903),false)->>'kept')::integer,3,'and says how many it keeps: the edited, the reviewed and the added row');
select is(public.visibility_plan_start(tests.id(100),tests.id(904),true)->>'status','ok','Confirmed, it starts');
reset role;
create temp table c2 as select tests.pclaim() as v;
select is((select v->'inputs'->'public'->>'date' from c2),'2027-01-31','The model is told the public date');
select is((select (select string_agg(x,',' order by x) from jsonb_array_elements_text(v->'inputs'->'kept_stages') x) from c2),'board,lead_pastor,participants','and which stages are kept');
create temp table old_rows as select id,who from private.visibility_plan_rows where engagement_id=tests.id(100) and not deleted;
create temp table a2 as select tests.papply((select v from c2),jsonb_build_array(
 tests.prow('lead_pastor','The lead pastor','Hears it again.',jsonb_build_array(tests.pref((select v from c2),'i'))),
 tests.prow('board','The elders','Hear it again.',jsonb_build_array(tests.pref((select v from c2),'a'))),
 tests.prow('staff','The staff','Hear what each person owns, and what the church is stopping.',jsonb_build_array(tests.pref((select v from c2),'s')),'{"when":"The week before","when_date":"2027-01-24","by":"The lead pastor"}'),
 tests.prow('staff','The staff, once more','Hear "Tell the congregation about the outcomes on a Sunday in January" from the room.',jsonb_build_array(tests.pref((select v from c2),'a')),'{"when_date":"2027-01-10"}'),
 tests.prow('key_leaders','Key leaders','Hear why the plan is what it is.',jsonb_build_array(tests.pref((select v from c2),'g')),'{"when_date":"2027-02-01"}'),
 tests.prow('key_leaders','Key leaders','Hear why the plan is what it is.',jsonb_build_array(tests.pref((select v from c2),'g')),'{"when_date":"next Sunday"}'),
 tests.prow('key_leaders','Key leaders','Hear why the plan is what it is.',jsonb_build_array(tests.pref((select v from c2),'g')),'{"when":"Priya will call","when_date":"2027-01-12"}'),
 tests.prow('congregation','The congregation','On Vision Sunday the church hears the Vision and the first thing everyone can do.',jsonb_build_array(tests.pref((select v from c2),'i')),'{"when":"Vision Sunday","when_date":"2027-01-31"}')
)) as j;
select is((select (j->>'kept')||':'||(j->>'dropped')||':'||(j->>'skipped') from a2),'3:3:2','Three rows are kept, three fail (after the public date, not a date, a name in the when) and two are for stages already held');
select is((select count(*)::integer from private.visibility_plan_rows r join old_rows o on o.id=r.id where not r.deleted),3,'The three rows the facilitator touched or reviewed are still there');
select is((select count(*)::integer from private.visibility_plan_rows r join old_rows o on o.id=r.id where r.deleted),1,'and the one untouched AI row was replaced');
select is((select count(*)::integer from private.visibility_plan_sources s join old_rows o on o.id=s.row_id where s.deleted),(select count(*)::integer from private.visibility_plan_sources s where s.row_id=(select id from old_rows where who='The congregation') ),'with its sources');
select is((select what_they_hear from private.visibility_plan_rows where id=tests.rowid('The retreat participants')),'Hold the plan until the board has met, then say nothing.','The edited cell is as the facilitator left it');
select is((select reviewed_at is not null from private.visibility_plan_rows where id=tests.rowid('The lead pastor')),true,'and the reviewed row is still reviewed');
select is((select count(*)::integer from private.visibility_plan_rows where engagement_id=tests.id(100) and not deleted),6,'Six rows stand');
select is((select array_agg(position order by position) from private.visibility_plan_rows where engagement_id=tests.id(100) and not deleted),array[1,2,3,4,5,6],'with positions one to six');
select is((select r.stage from private.visibility_plan_rows r where r.engagement_id=tests.id(100) and not r.deleted order by r.position desc limit 1),'congregation','and the congregation last, as the public moment');
select is((select count(*)::integer from private.visibility_plan_rows where engagement_id=tests.id(100) and not deleted and when_date>date '2027-01-31'),0,'No row is dated after the public date');
select is((select when_date::text from private.visibility_plan_rows where engagement_id=tests.id(100) and not deleted and who='The staff'),'2027-01-24','A row worked back from the date keeps its date');
select is((select count(*)::integer from private.visibility_plan_rows where engagement_id=tests.id(100) and not deleted and origin='ai' and what_they_hear like '%"Tell the congregation about the outcomes on a Sunday in January"%'),1,'A quotation that is word for word in a scribe card is kept');
select is(tests.pstatus(),'needs_attention','The plan is marked Needs attention again for the rows left out');

-- ---------- The contract the report reads ----------
set local role service_role;
select is((select count(*) from private.visibility_plan_for_report(tests.id(100))),6::bigint,'The contract returns the six rows');
select is((select array_agg(c.position order by c.position) from private.visibility_plan_for_report(tests.id(100)) c),array[1,2,3,4,5,6],'in position order');
select is((select c.when_text from private.visibility_plan_for_report(tests.id(100)) c where c.who='The staff'),'The week before, Jan 24, 2027','with the words and the date of a when together');
select is((select c.when_text from private.visibility_plan_for_report(tests.id(100)) c where c.who='The elders'),null,'and null where there is none');
select is((select c.by_whom from private.visibility_plan_for_report(tests.id(100)) c where c.who='The staff'),'The lead pastor','Who tells them comes through');
select is((select jsonb_array_length(c.sources) from private.visibility_plan_for_report(tests.id(100)) c where c.who='The elders'),0,'The facilitator''s own row has no sources');
select ok((select jsonb_array_length(c.sources)>=1 and c.sources->0 ?& array['kind','ref_id','excerpt','room'] from private.visibility_plan_for_report(tests.id(100)) c where c.who='The lead pastor'),'and an AI row has sources with a kind, an id, the words and a room flag');
select is((select c.reviewed from private.visibility_plan_for_report(tests.id(100)) c where c.who='The lead pastor'),true,'Reviewed comes through');
select is((select count(*) from private.visibility_plan_for_report(tests.id(101))),0::bigint,'and another engagement has no rows');
reset role;
-- The report's Make the Vision Visible section builds its table from the plan.
set local role authenticated;
select tests.login(1);
select is(public.report_start(tests.id(100),tests.id(950),'all',null,false)->>'status','ok','The report is drafted');
reset role;
select is((select count(*)::integer from private.report_sections s,jsonb_array_elements(s.blocks->'rows') r where s.engagement_id=tests.id(100) and s.key='visibility' and not s.deleted and r->'parts'->0->>'role'='plan'),6,'The report''s Make the Vision Visible section holds the plan''s six rows as a table');
select is((select s.blocks->'columns' from private.report_sections s where s.engagement_id=tests.id(100) and s.key='visibility' and not s.deleted),'["Who","When","Who tells them","What they hear","The risk it answers"]'::jsonb,'with the columns who, when, who tells them, what they hear and the risk');
select is((select s.blocks->'rows'->0->'cells'->0->>'t' from private.report_sections s where s.engagement_id=tests.id(100) and s.key='visibility' and not s.deleted),'The lead pastor','and the first row first');
select is((select count(*)::integer from private.report_sections s,jsonb_array_elements(s.blocks->'rows') r where s.engagement_id=tests.id(100) and s.key='visibility' and not s.deleted and r->>'group'='actions'),3,'beside the scribe''s action cards');
delete from private.ai_runs where engagement_id=tests.id(100) and job='draft_report';

-- ---------- A plan change after the report was built ----------
create temp table vs as select id from private.report_sections where engagement_id=tests.id(100) and key='visibility' and not deleted;
grant select on vs to authenticated;
-- The scripted report was never drafted by a model here, so the section is taken out of Drafting by hand.
update private.report_sections set status='drafted' where id=(select id from vs);
set local role authenticated;
select tests.login(1);
select is(public.report_mark_reviewed(tests.id(100),(select id from vs),true)->>'status','ok','The lead reviews Make the Vision Visible');
select is(public.report_state(tests.id(100))->>'plan_stale','false','Nothing is stale while the section matches the plan');
select is(public.visibility_plan_state(tests.id(100))->>'report_stale','false','and the plan page says so');
select is(public.visibility_plan_row_add(tests.id(100),'{"stage":"board","who":"The deacons","what_they_hear":"Hear the plan in person."}')->>'status','ok','A row is added by hand');
select is(public.visibility_plan_row_edit(tests.id(100),tests.rowid('The elders'),'{"risk":"Burn out comes first."}')->>'status','ok','and a cell is edited');
select is(public.report_state(tests.id(100))->>'plan_stale','true','The report says the plan changed');
select is(public.visibility_plan_state(tests.id(100))->>'report_stale','true','and so does the plan page');
select is(public.report_sign_off(tests.id(100),tests.id(951))->>'status','plan_changed','Sign-off refuses until the section is refreshed');
select tests.login(2);
select isnt(public.report_sign_off(tests.id(100),tests.id(952))->>'status','plan_changed','A co-facilitator gets step 1''s own answer');
select tests.login(1);
reset role;
select is((select s.status||':'||(s.reviewed_at is null)||':'||s.plan_stale from private.report_sections s where s.id=(select id from vs)),'edited:true:true','The section is Edited, not reviewed, and stale');
select is(private.report_snapshot(tests.id(100))::text like '%Burn out comes first%',false,'A snapshot taken now would freeze the old plan');
set local role authenticated;
select tests.login(1);
select is(public.report_refresh(tests.id(100),'visibility',true)->>'status','ok','Refreshing the section rebuilds it from the plan');
select is(public.report_state(tests.id(100))->>'plan_stale','false','and it is no longer stale');
select is(public.report_sign_off(tests.id(100),tests.id(953))->>'status','not_reviewed','Sign-off is back to step 1''s checks, which want the section reviewed again');
reset role;
select is(private.report_snapshot(tests.id(100))::text like '%Burn out comes first%' and private.report_snapshot(tests.id(100))::text like '%Hear the plan in person.%',true,'The snapshot holds the plan as it is now, edit and added row included');
select is((select count(*)::integer from private.report_sources r join private.report_sentences x on x.id=r.sentence_id join private.report_sections s on s.id=x.section_id
  where s.engagement_id=tests.id(100) and s.key='visibility' and not x.deleted and not r.deleted and x.text='Hear the plan in person.' and r.kind='record'),1,'A facilitator''s own row reaches the report with a record source');
set local role authenticated;
select tests.login(1);
select is(public.visibility_plan_row_remove(tests.id(100),tests.rowid('The deacons'))->>'status','ok','A removal');
select is(public.report_state(tests.id(100))->>'plan_stale','true','makes the section stale again');
reset role;
delete from private.ai_runs where engagement_id=tests.id(100) and job='draft_report';

-- ---------- Removing a row, the signal rule and the sources ----------
set local role authenticated;
select tests.login(1);
select is(public.visibility_plan_row_remove(tests.id(100),tests.rowid('The staff, once more'))->>'status','ok','The lead removes a row');
reset role;
select is((select count(*)::integer from private.visibility_plan_sources s where s.row_id in(select id from private.visibility_plan_rows where who='The staff, once more' and engagement_id=tests.id(100)) and not s.deleted),0,'and its sources go with it');
set local role authenticated;
select is(jsonb_array_length(tests.pstate()->'rows'),5,'Five rows are left');
reset role;
select is((select array_agg(position order by position) from private.visibility_plan_rows where engagement_id=tests.id(100) and not deleted),array[1,2,3,4,5],'and the positions close up to one to five');
set local role authenticated;
reset role;
select throws_ok($$insert into private.visibility_plan_sources(engagement_id,row_id,kind,ref_id,excerpt) values(tests.id(100),tests.rowid('The lead pastor'),'signal',tests.id(653),'Some of the room heads a different way.')$$,'23514',null,'A divergent signal cannot be a source');
select throws_ok($$insert into private.visibility_plan_sources(engagement_id,row_id,kind,ref_id,excerpt) values(tests.id(100),tests.rowid('The lead pastor'),'signal',tests.id(652),'The room agrees on something nobody saved.')$$,'23514',null,'nor an aligned signal nobody saved as a citation');
select throws_ok($$insert into private.visibility_plan_sources(engagement_id,row_id,kind,ref_id,excerpt) values(tests.id(100),tests.rowid('The lead pastor'),'signal',tests.id(799),'No such signal.')$$,'23514',null,'nor a signal that does not exist');
select lives_ok($$insert into private.visibility_plan_sources(engagement_id,row_id,kind,ref_id,excerpt) values(tests.id(100),tests.rowid('The lead pastor'),'signal',tests.id(651),'What the room said about finding a group matches what the interviews said.')$$,'An aligned signal saved as a citation can be');
select throws_ok($$insert into private.visibility_plan_sources(engagement_id,row_id,kind,ref_id,excerpt) values(tests.id(100),tests.rowid('The lead pastor'),'theme',null,'x')$$,'23514',null,'A source other than a record needs an id');
select throws_ok($$insert into private.visibility_plan_sources(engagement_id,row_id,kind,ref_id,excerpt) values(tests.id(100),tests.rowid('The lead pastor'),'scribe_card',tests.id(661),repeat('x',281))$$,'23514',null,'and a source keeps its excerpt to 280 characters');
select throws_ok($$insert into private.visibility_plan_sources(engagement_id,row_id,kind,ref_id,excerpt) values(tests.id(101),tests.rowid('The lead pastor'),'scribe_card',tests.id(661),'x')$$,'23503',null,'A source cannot point at another engagement''s row');
select throws_ok($$insert into private.visibility_plan_rows(engagement_id,plan_id,stage,who,origin) values(tests.id(100),(select id from private.visibility_plans where engagement_id=tests.id(100)),'elders','x','ai')$$,'23514',null,'A row has to use a stage the plan knows');
select throws_ok($$insert into private.visibility_plans(engagement_id) values(tests.id(100))$$,'23505',null,'There is one plan for each engagement');
update private.signals set saved_as_citation_at=null where id=tests.id(651);
select is(tests.pstate()->'rows'->0->>'needs_source','false','A row with other sources is not flagged when one signal is unsaved');
set local role authenticated;
select tests.login(1);
select is(public.visibility_plan_row_reviewed(tests.id(100),tests.rowid('The lead pastor'),false)->>'status','ok','A reviewed row can be marked not reviewed');
select is(public.visibility_plan_row_reviewed(tests.id(100),tests.id(1),true)->>'status','not_found','A row that is not there is not found');
select is(public.visibility_plan_row_edit(tests.id(100),tests.id(1),'{"who":"x"}')->>'status','not_found','and cannot be edited');
reset role;

-- ---------- Every row reviewed ----------
set local role authenticated;
select tests.login(1);
do $$ declare r uuid; begin
 for r in select (e->>'id')::uuid from jsonb_array_elements(public.visibility_plan_state(tests.id(100))->'rows') e loop perform public.visibility_plan_row_reviewed(tests.id(100),r,true); end loop;
end $$;
select is(tests.pstatus(),'reviewed','With every row reviewed the plan is Reviewed');
select is(public.visibility_plan_row_edit(tests.id(100),tests.rowid('The elders'),'{"risk":"The elders never owned the plan."}')->>'status','ok','An edit');
select is(tests.pstatus(),'edited','takes the plan back to Edited');
reset role;

-- ---------- The model fails ----------
set local role authenticated;
select tests.login(1);
select is(public.visibility_plan_start(tests.id(100),tests.id(905),true)->>'status','ok','The lead drafts again');
reset role;
create temp table c3 as select tests.pclaim() as v;
select is((select private.visibility_plan_fail((v->>'run')::uuid,(v->>'lease')::uuid,'timeout','{"ms":5000}')->>'gave_up' from c3),'false','The first failure is tried again');
select is((select status||':'||attempts from private.visibility_plan_rounds where engagement_id=tests.id(100) and not deleted),'pending:1','after a pause');
select is(tests.pclaim()->>'status','cooling','A claim during the pause is told to wait');
select is(private.visibility_plan_due(tests.id(100)),false,'and nothing is due yet');
update private.visibility_plan_rounds set last_failed_at=now()-interval '5 minutes' where engagement_id=tests.id(100);
select is(private.visibility_plan_due(tests.id(100)),true,'After the pause it is due');
create temp table c4 as select tests.pclaim() as v;
select is((select private.visibility_plan_fail((v->>'run')::uuid,(v->>'lease')::uuid,'unavailable','{"ms":5000}')->>'gave_up' from c4),'true','The second failure gives up');
select is(tests.pstatus(),'needs_attention','The plan is marked Needs attention');
select is((select error from private.visibility_plans where engagement_id=tests.id(100) and not deleted),'AI could not draft the plan','with a plain error');
select is((select status from private.visibility_plan_rounds where engagement_id=tests.id(100) and not deleted),'failed','and the round has failed');
select is((select count(*)::integer from private.visibility_plan_rows where engagement_id=tests.id(100) and not deleted),5,'Nothing the facilitator wrote is lost');
select is((select status from private.ai_runs where id=(select (v->>'run')::uuid from c4)),'failed','The run is logged as failed');
select is(private.visibility_plan_due(tests.id(100)),false,'A failed round is not due until the lead presses again');
set local role authenticated;
select tests.login(1);
select is(tests.pstate()->'plan'->>'error','AI could not draft the plan','The page is told');
select is(public.visibility_plan_row_add(tests.id(100),'{"stage":"staff","who":"The volunteers","what_they_hear":"What changes for them."}')->>'status','ok','The lead can add a row by hand');
select is(tests.pstatus(),'edited','which takes the failure away');
reset role;
select is((select error from private.visibility_plans where engagement_id=tests.id(100) and not deleted),null,'and its error');
set local role authenticated;
reset role;
-- With AI off the claim says so and puts the plan back to what its rows say.
update engagements set settings=settings||'{"ai_enabled":false}' where id=tests.id(100);
set local role authenticated;
select tests.login(1);
select is(public.visibility_plan_start(tests.id(100),tests.id(907),true)->>'status','ai_off','With AI off the press says so');
reset role;
update engagements set settings=settings||'{"ai_enabled":true}' where id=tests.id(100);

-- ---------- Nothing said about it ----------
insert into engagements(id,church_id,title) values(tests.id(102),tests.id(201),'Quiet room');
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values(tests.id(102),tests.id(707),'lead');
update engagements set settings=settings||'{"ai_enabled":true}' where id=tests.id(102);
set local role authenticated;
select tests.login(7);
select is(public.visibility_plan_start(tests.id(102),tests.id(910),false)->>'status','ok','A room that recorded nothing can still start a draft');
reset role;
select is(tests.pclaim(tests.id(102))->>'status','idle','but the worker has nothing to send the model');
select is(tests.pstatus(tests.id(102)),'thin','and the plan says nothing was said about it');
select is((select count(*)::integer from private.ai_runs where engagement_id=tests.id(102)),0,'No model call was made');
set local role authenticated;
select tests.login(7);
select is(public.visibility_plan_row_add(tests.id(102),'{"stage":"congregation","who":"The congregation"}')->>'status','ok','The facilitator adds the first row by hand');
select is((select public.visibility_plan_state(tests.id(102))->'plan'->>'status'),'edited','and the plan is Edited');
select is(public.visibility_plan_state(tests.id(100))->>'status','denied','and its other engagement is denied');
reset role;

-- ---------- A closed engagement ----------
update engagements set status='closed' where id=tests.id(100);
set local role authenticated;
select tests.login(1);
select is(public.visibility_plan_row_edit(tests.id(100),tests.rowid('The elders'),'{"risk":"Too late."}')->>'status','closed','A closed engagement''s plan cannot change');
select is(public.visibility_plan_state(tests.id(100))->>'status','ok','but can still be read');
select is(public.visibility_plan_state(tests.id(100))->>'closed','true','and says it is closed');
reset role;
update engagements set status='retreat' where id=tests.id(100);

-- ---------- The practice room and Clear test answers ----------
insert into engagements(id,church_id,title,type) values('90000000-0000-4000-8000-000000000010',tests.id(200),'Permanent practice','practice');
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values('90000000-0000-4000-8000-000000000010',tests.id(701),'lead');
set local role authenticated;
select tests.login(1);
select is(public.visibility_plan_row_add('90000000-0000-4000-8000-000000000010','{"stage":"board","who":"The practice elders"}')->>'status','ok','A row is added in the practice room before any rehearsal');
reset role;
update engagements set settings=settings||'{"ai_enabled":true}' where id='90000000-0000-4000-8000-000000000010';
set local role authenticated;
select tests.login(1);
select is(public.report_start('90000000-0000-4000-8000-000000000010',tests.id(960),'all',null,false)->>'status','ok','A report is drafted in the practice room before any rehearsal');
select is(public.rehearsal_control('90000000-0000-4000-8000-000000000010',tests.id(851),'start')->>'status','ok','The rehearsal starts');
select is(public.visibility_plan_row_add('90000000-0000-4000-8000-000000000010','{"stage":"staff","who":"Rehearsal staff"}')->>'status','ok','A row is added during it');
reset role;
update engagements set settings=settings||'{"ai_enabled":true}' where id='90000000-0000-4000-8000-000000000010';
set local role authenticated;
select tests.login(1);
select is(public.visibility_plan_start('90000000-0000-4000-8000-000000000010',tests.id(911),true)->>'status','ok','A draft is started during it');
select is(public.rehearsal_control('90000000-0000-4000-8000-000000000010',tests.id(852),'end')->>'status','ok','The rehearsal ends');
reset role;
select is((select test from private.visibility_plan_rounds where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted),true,'A round made in a rehearsal is a test');
select is((select test from private.visibility_plans where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted),false,'and the plan made before it is not');
set local role authenticated;
select tests.login(1);
select is(public.rehearsal_control('90000000-0000-4000-8000-000000000010',tests.id(853),'clear')->>'status','ok','Clear test answers runs');
reset role;
select is((select count(*)::integer from private.visibility_plan_rounds where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted),0,'It puts away the test round');
select is((select count(*)::integer from private.visibility_plan_rows where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted),1,'and keeps the plan''s row made before the rehearsal');
select is((select count(*)::integer from private.visibility_plan_rows where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted and who='Rehearsal staff'),0,'and the row made during the rehearsal');
select isnt((select status from private.visibility_plans where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted),'drafting','A plan the cleared round left in Drafting is healed');
select is((select count(*)::integer from private.report_drafts where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted),1,'while the report drafted before the rehearsal stays');
select is((select count(*)::integer from private.visibility_plans where engagement_id=tests.id(100) and not deleted),1,'and touches no other engagement');
set local role authenticated;
select tests.login(1);
select is(public.reset_practice_room(),true,'The practice room resets');
reset role;
select is((select count(*)::integer from private.visibility_plans where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted),0,'No plan is left in the practice room');
select is((select count(*)::integer from private.visibility_plan_rows where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted),0,'no row');
select is((select count(*)::integer from private.visibility_plan_sources where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted),0,'no source');
select is((select count(*)::integer from private.visibility_plan_rounds where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted),0,'no round');
select is((select count(*)::integer from private.visibility_plans where engagement_id=tests.id(100) and not deleted),1,'The first engagement keeps its plan');
select is((select count(*)::integer from private.visibility_plan_rows where engagement_id=tests.id(100) and not deleted),6,'and its rows');
select is((select count(*)::integer from private.report_drafts where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted),0,'The practice reset puts the report draft away as well');
select is((select count(*)::integer from private.report_sections where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted),0,'and its sections');

-- ---------- A lease that runs out ----------
set local role authenticated;
select tests.login(1);
select is(public.visibility_plan_start(tests.id(100),tests.id(920),true)->>'status','ok','The lead drafts again');
reset role;
create temp table c5 as select tests.pclaim() as v;
update private.visibility_plan_rounds set lease_until=now()-interval '1 minute' where engagement_id=tests.id(100) and not deleted;
select is(tests.papply((select v from c5),'[]'),'{"status":"stale"}'::jsonb,'A reply after its lease ran out is stale');
select is(private.visibility_plan_due(tests.id(100)),true,'and the round is due again');
select is(tests.pclaim()->>'status','cooling','An expired lease counts as a failed attempt, so the next claim waits');
select is((select attempts||':'||status from private.visibility_plan_rounds where engagement_id=tests.id(100) and not deleted),'1:pending','and the attempt was counted');
update private.visibility_plan_rounds set last_failed_at=now()-interval '5 minutes' where engagement_id=tests.id(100) and not deleted;
create temp table c6 as select tests.pclaim() as v;
select is((select v->>'status' from c6),'claimed','After the pause it is claimed once more');
update private.visibility_plan_rounds set lease_until=now()-interval '1 minute' where engagement_id=tests.id(100) and not deleted;
select is(tests.pclaim()->>'status','idle','A second expiry gives up');
select is(tests.pstatus(),'needs_attention','The plan says Needs attention');
select is((select status from private.visibility_plan_rounds where engagement_id=tests.id(100) and not deleted),'failed','and the round has failed');
select is((select count(*)::integer from private.ai_runs where id in((select v->>'run' from c5)::uuid,(select v->>'run' from c6)::uuid) and status='failed' and error='timeout'),2,'with both runs logged as timeouts');
select is(private.visibility_plan_due(tests.id(100)),false,'and nothing is due');

-- ---------- An edit while the model is working survives the reply ----------
set local role authenticated;
select tests.login(1);
select is(public.visibility_plan_start(tests.id(100),tests.id(921),true)->>'status','ok','The lead drafts again');
reset role;
create temp table c7 as select tests.pclaim() as v;
set local role authenticated;
select tests.login(1);
select is(public.visibility_plan_row_edit(tests.id(100),tests.rowid('The staff'),'{"risk":"Burn out is named first."}')->>'status','ok','A cell is edited while the model works');
reset role;
create temp table a7 as select tests.papply((select v from c7),jsonb_build_array(
 tests.prow('staff','The staff team','Hear what each person owns.',jsonb_build_array(tests.pref((select v from c7),'k'))),
 tests.prow('congregation','The congregation','On Vision Sunday the church hears that every ministry is growing its own next leader.',jsonb_build_array(tests.pref((select v from c7),'i')))
)) as j;
select is((select j->>'status' from a7),'ok','The reply is applied');
select ok((select (j->>'skipped')::integer>=1 from a7),'The stages the facilitator holds are not redrafted');
select is((select risk from private.visibility_plan_rows where id=tests.rowid('The staff')),'Burn out is named first.','and the edited row is still there as they left it');
select is((select count(*)::integer from private.visibility_plan_rows where engagement_id=tests.id(100) and not deleted and who='The staff team'),0,'and no new row is added for them');

-- ---------- A plan stuck in Drafting ----------
update private.visibility_plan_rounds set deleted=true where engagement_id=tests.id(100) and not deleted;
update private.visibility_plans set status='drafting' where engagement_id=tests.id(100) and not deleted;
set local role authenticated;
select tests.login(1);
select is(tests.pstate()->'plan'->>'status','edited','Reading a plan the round left in Drafting heals it');
reset role;

-- ---------- The checks on a when ----------
select is(private.vp_check('{"stage":"board","who":"The elders","hear":"The plan.","when":"The week before","when_date":"2027-01-24"}','[{"ref":"a1","text":"Brief the elders.","sources":[]}]','{}',date '2027-01-31',date '2026-11-05'),null,'A when on or before the public date is fine');
select is(private.vp_check('{"stage":"board","who":"The elders","hear":"The plan.","when":"The week after"}','[{"ref":"a1","text":"Brief the elders.","sources":[]}]','{}',date '2027-01-31',date '2026-11-05'),'when','Words that put a row after the public moment are refused');
select is(private.vp_check('{"stage":"board","who":"The elders","hear":"The plan.","when":"Following the vote"}','[{"ref":"a1","text":"Brief the elders.","sources":[]}]','{}',date '2027-01-31',date '2026-11-05'),'when','whichever word it uses');
select is(private.vp_check('{"stage":"board","who":"The elders","hear":"The plan.","when_date":"1999-01-01"}','[{"ref":"a1","text":"Brief the elders.","sources":[]}]','{}',date '2027-01-31',date '2026-11-05'),'when','A date before the table''s range is refused, not an error');
select is(private.vp_check('{"stage":"board","who":"The elders","hear":"The plan.","when_date":"2026-11-01"}','[{"ref":"a1","text":"Brief the elders.","sources":[]}]','{}',date '2027-01-31',date '2026-11-05'),'when','and so is a date before the retreat ended');
select is(private.vp_check('{"stage":"board","who":"The elders","hear":"The plan.","when_date":"2999-01-01"}','[{"ref":"a1","text":"Brief the elders.","sources":[]}]','{}',date '2027-01-31',date '2026-11-05'),'when','or after the public date');

-- ---------- A reply with bad dates drops those rows and keeps the rest ----------
update private.vision_outcomes set title='Priya Shah leads' where id=tests.id(660);
set local role authenticated;
select tests.login(1);
select is(public.visibility_plan_start(tests.id(100),tests.id(922),true)->>'status','ok','The lead drafts again');
reset role;
create temp table c8 as select tests.pclaim() as v;
update private.vision_outcomes set title='Leaders raised from within' where id=tests.id(660);
select is((select count(*) from c8,jsonb_array_elements(v->'inputs'->'refs') x where x.value->>'ref' like 'i%'),0::bigint,'An intent card whose outcome title names someone is not sent');
create temp table a8 as select tests.papply((select v from c8),jsonb_build_array(
 tests.prow('key_leaders','Key leaders','Hear the first goal.',jsonb_build_array(tests.pref((select v from c8),'g')),'{"when":"The week before","when_date":"2027-01-20"}'),
 tests.prow('key_leaders','Key leaders','Hear the first goal again.',jsonb_build_array(tests.pref((select v from c8),'g')),'{"when":"The week before","when_date":"2027-01-26"}'),
 tests.prow('key_leaders','Key leaders','Hear the first goal once more.',jsonb_build_array(tests.pref((select v from c8),'g')),'{"when_date":"1999-01-01"}'),
 tests.prow('key_leaders','Key leaders','Hear it then.',jsonb_build_array(tests.pref((select v from c8),'g')),'{"when":"The week after"}'),
 tests.prow('key_leaders','Key leaders','They hear "Name a back-up owner for every first step" from the room.',jsonb_build_array(tests.pref((select v from c8),'m')),'{"when_date":"2027-01-27"}')
)) as j;
select is((select j->>'status' from a8),'ok','The reply is applied, a bad date and all');
select is((select (j->>'kept')||':'||(j->>'dropped') from a8),'2:3','Two rows are kept and three dropped: a date that runs backwards, one before the range and one that says after');
select is((select string_agg(r.when_date::text,',' order by r.position) from private.visibility_plan_rows r where r.engagement_id=tests.id(100) and not r.deleted and r.stage='key_leaders'),'2027-01-26,2027-01-27','The rows that pass keep their dates, in order');
select is((select s.excerpt from private.visibility_plan_sources s join private.visibility_plan_rows r on r.id=s.row_id where r.engagement_id=tests.id(100) and not r.deleted and not s.deleted and r.what_they_hear like '%back-up owner%' and s.kind='scribe_card'),'Name a back-up owner for every first step','A row that quotes the room keeps just the quoted words as its source');

-- ---------- Moving or taking away the public date ----------
set local role authenticated;
select tests.login(1);
select is(public.visibility_plan_set(tests.id(100),'Vision Sunday','2027-01-26')->>'status','ok','The public date moves earlier');
reset role;
select is((select count(*)::integer from private.visibility_plan_rows where engagement_id=tests.id(100) and not deleted and origin='ai' and not touched and reviewed_at is null and when_date>date '2027-01-26'),0,'No untouched AI row is left dated after it');
select is((select when_date::text from private.visibility_plan_rows where id=tests.rowid('The staff')),'2027-01-24','and a row the facilitator touched is left as it was');
set local role authenticated;
select tests.login(1);
select is(public.visibility_plan_set(tests.id(100),'Vision Sunday',null)->>'status','ok','The date is taken away');
reset role;
select is((select count(*)::integer from private.visibility_plan_rows where engagement_id=tests.id(100) and not deleted and origin='ai' and not touched and reviewed_at is null and (when_text<>'' or when_date is not null)),0,'Untouched AI rows lose their whens');

-- ---------- The report's lease ----------
create temp table rc1 as select private.report_claim(tests.id(100),gen_random_uuid(),'m','{"draft_report":"report@1"}'::jsonb) as v;
select is((select v->>'status' from rc1),'claimed','The report''s worker claims a section');
update private.report_rounds set lease_until=now()-interval '1 minute' where engagement_id=tests.id(100) and not deleted;
select is(private.report_claim(tests.id(100),gen_random_uuid(),'m','{"draft_report":"report@1"}'::jsonb)->>'status','cooling','An expired lease counts as a failed attempt there too');
select is((select attempts from private.report_rounds where engagement_id=tests.id(100) and not deleted),1,'and the attempt was counted');

select * from finish();
rollback;
