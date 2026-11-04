begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('87000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(1000+n))::text,true); end $$;
create function tests.live() returns uuid language sql security definer set search_path='' as $$ select live_session_id from public.room_states where engagement_id=tests.id(100) $$;
create function tests.ctl(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$
 select public.room_control(tests.id(100),tests.id(n),action,jsonb_build_object('from',tests.live())||p) $$;
create function tests.save(n integer,kind text,options jsonb default '{}',part text default 'Day 1',extra jsonb default '{}') returns jsonb language sql as $$
 select public.show_write(tests.id(100),'save',jsonb_build_object('id',tests.id(n),'revision',null,'title','Step '||n,'part',part,'mode','live','interaction',kind,
  'prompt','Prompt '||n,'phone_depth','','notes','','lands_in','','segment','','state','ready','planned_minutes',5,'max_sends',3,'max_characters',28,'max_words',3,
  'settings',jsonb_build_object('anonymous',true,'burst_minutes',4,'join_strip',false),'options',options)||extra) $$;
create function tests.mark(n integer,p jsonb) returns jsonb language sql as $$ select public.decision_mark(tests.id(100),tests.id(n),p) $$;
create function tests.rows(t text) returns bigint language plpgsql as $$ declare n bigint; begin execute format('select count(*) from %s',t) into n; return n; end $$;
grant execute on all functions in schema tests to authenticated,anon,service_role;

insert into churches(id,name,timezone) values(tests.id(200),'Riverside Church','America/Toronto'),(tests.id(201),'Elsewhere Church','America/Toronto');
insert into engagements(id,church_id,title) values(tests.id(100),tests.id(200),'Wayfinding records room'),(tests.id(101),tests.id(201),'Another room');
insert into auth.users(id,email,email_confirmed_at)
select tests.id(n),case n when 1 then 'fac1@clearway.co' when 2 then 'admin2@clearway.co' when 7 then 'fac7@clearway.co' else 'person'||n||'@example.org' end,now() from generate_series(1,8)n;
insert into auth.sessions(id,user_id) select tests.id(1000+n),tests.id(n) from generate_series(1,8)n;
insert into auth.identities(user_id,provider,provider_id,identity_data) select id,'google',id::text,jsonb_build_object('email',email,'email_verified',true) from auth.users where id in(tests.id(1),tests.id(2),tests.id(7));
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method) values(gen_random_uuid(),tests.id(1001),now(),now(),'oauth'),(gen_random_uuid(),tests.id(1002),now(),now(),'oauth'),(gen_random_uuid(),tests.id(1007),now(),now(),'oauth');
insert into clearway_users(id,auth_user_id,name,email,is_admin,team_hub_team_member_id) values
 (tests.id(701),tests.id(1),'Chris Vacher','fac1@clearway.co',false,tests.id(801)),
 (tests.id(702),tests.id(2),'Admin Person','admin2@clearway.co',true,tests.id(802)),
 (tests.id(707),tests.id(7),'Other Facilitator','fac7@clearway.co',false,tests.id(807));
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values(tests.id(100),tests.id(701),'lead'),(tests.id(101),tests.id(707),'lead');
insert into attendees(id,engagement_id,auth_user_id,name,email,verified_at,room_role) values
 (tests.id(503),tests.id(100),tests.id(3),'Priya Shah','person3@example.org',now(),'participant'),
 (tests.id(505),tests.id(100),tests.id(5),'Ben Ortiz','person5@example.org',now(),'participant'),
 (tests.id(506),tests.id(100),null,'Ruth Morrison','person6@example.org',null,'participant');
insert into device_sessions(engagement_id,attendee_id,auth_session_id) values(tests.id(100),tests.id(503),tests.id(1003)),(tests.id(100),tests.id(505),tests.id(1005));
insert into private.tv_devices(id,proof,engagement_id,label,paired_at) values(tests.id(450),repeat('a',64),tests.id(100),'Front TV',now());
insert into private.live_tv_sessions(id,engagement_id,auth_user_id,auth_session_id,device_id) values(tests.id(400),tests.id(100),tests.id(4),tests.id(1004),tests.id(450));

-- Records written by trusted server code, before any browser role looks.
insert into private.lens_sentences(id,engagement_id,lens,source,text,attendee_id) values
 (tests.id(2001),tests.id(100),1,'seeded','Seeded congregation one',tests.id(503)),
 (tests.id(2002),tests.id(100),1,'seeded','Seeded congregation two',tests.id(505)),
 (tests.id(2003),tests.id(100),1,'seeded','Seeded congregation three',tests.id(503)),
 (tests.id(2004),tests.id(100),2,'seeded','Seeded community one',tests.id(503)),
 (tests.id(2005),tests.id(100),2,'seeded','Seeded community two',tests.id(505)),
 (tests.id(2006),tests.id(100),1,'live','Live congregation one',tests.id(503)),
 (tests.id(2007),tests.id(101),1,'seeded','Seeded elsewhere',null);
insert into private.vision_outcomes(id,engagement_id,title,status,confirmed_at,position) values
 (tests.id(3001),tests.id(100),'Leaders raised from within','confirmed',now(),0),
 (tests.id(3002),tests.id(100),'Families find a home here','provisional',null,1);
insert into private.outcome_indicators(id,engagement_id,outcome_id,text) values(tests.id(3101),tests.id(100),tests.id(3001),'12 apprentice leaders serve alongside a ministry lead');
insert into private.risks(id,engagement_id,text,likelihood,impact) values(tests.id(3201),tests.id(100),'We tried all five at once',0.82,0.86);
insert into private.risk_mitigations(engagement_id,risk_id,text,recorded_by) values(tests.id(100),tests.id(3201),'Launch outcomes a season apart','facilitator');
insert into private.goals(id,engagement_id,outcome_id,title,result,result_clear,owner_attendee_id,end_date) values
 (tests.id(3301),tests.id(100),tests.id(3001),'Launch the apprentice pathway','8 apprentices placed in ministries',true,tests.id(503),'2027-04-30'),
 (tests.id(3302),tests.id(100),tests.id(3001),'Design the leader residency','',false,null,null);
insert into private.goal_risks(goal_id,risk_id,engagement_id) values(tests.id(3301),tests.id(3201),tests.id(100));
insert into private.intent_cards(id,engagement_id,outcome_id,intent) values(tests.id(3401),tests.id(100),tests.id(3001),'Every ministry is growing its own next leader.');
insert into private.first_steps(id,engagement_id,card_id,text,owner_attendee_id,due_date) values
 (tests.id(3501),tests.id(100),tests.id(3401),'List every ministry lead',tests.id(503),'2026-11-27'),
 (tests.id(3502),tests.id(100),tests.id(3401),'Ask three people to share a baptism story',null,null);
insert into private.key_metrics(engagement_id,text,rank) values(tests.id(100),'People in groups',1);
insert into private.celebrations(engagement_id,text) values(tests.id(100),'A baptism every month');
insert into private.map_drafts(engagement_id,pages) values(tests.id(100),'{"page1":{}}');
insert into private.lens_summaries(id,engagement_id,lens,state) values(tests.id(3601),tests.id(100),1,'on_screen');
insert into private.lens_summary_versions(id,engagement_id,summary_id,version,author,shown_at) values
 (tests.id(3701),tests.id(100),tests.id(3601),1,'ai',now()),(tests.id(3702),tests.id(100),tests.id(3601),2,'ai',null);
insert into private.lens_summary_sentences(id,engagement_id,version_id,position,text) values(tests.id(3801),tests.id(100),tests.id(3701),0,'Every Sunday the room holds people who found us through a friend.');
insert into private.lens_summary_sources(summary_sentence_id,lens_sentence_id,engagement_id) values(tests.id(3801),tests.id(2006),tests.id(100));
insert into private.lens_summary_responses(id,engagement_id,version_id,attendee_id,response,suggestion) values
 (tests.id(3901),tests.id(100),tests.id(3701),tests.id(503),'approve',''),
 (tests.id(3902),tests.id(100),tests.id(3701),tests.id(505),'suggest','Mention the food bank');

-- ---------- Every table is under forced row-level security and browsers cannot write ----------
select is((select count(*) from pg_class where oid=any(array['private.lens_openings','private.lens_sentences','private.vision_outcomes','private.outcome_indicators','private.risks','private.risk_mitigations','private.goals','private.goal_risks','private.intent_cards','private.intent_card_people','private.first_steps','private.key_metrics','private.celebrations','private.decisions','private.map_drafts','private.lens_summaries','private.lens_summary_versions','private.lens_summary_sentences','private.lens_summary_sources','private.lens_summary_responses']::regclass[]) and relrowsecurity and relforcerowsecurity),20::bigint,'All 20 Wayfinding tables force row-level security');
select is((select count(*) from information_schema.role_table_grants where grantee in('authenticated','anon','public') and table_schema='private' and privilege_type in('INSERT','UPDATE','DELETE') and table_name in('lens_openings','lens_sentences','vision_outcomes','outcome_indicators','risks','risk_mitigations','goals','goal_risks','intent_cards','intent_card_people','first_steps','key_metrics','celebrations','decisions','map_drafts','lens_summaries','lens_summary_versions','lens_summary_sentences','lens_summary_sources','lens_summary_responses')),0::bigint,'Browsers hold no write privilege on any Wayfinding table');
select is((select count(*) from information_schema.role_table_grants where grantee in('anon','public') and table_schema='private' and table_name in('lens_sentences','vision_outcomes','decisions','lens_summaries')),0::bigint,'Anonymous callers hold no privilege on the Wayfinding tables');

-- ---------- Seeded sentences: hidden from every role until their lens opens ----------
set local role authenticated;
select tests.login(1);
select is((select count(*) from private.lens_sentences where source='seeded'),0::bigint,'The facilitator reads no seeded sentence before a lens opens');
select is((select count(*) from private.lens_sentences),1::bigint,'The facilitator reads the live sentences of the room, and only those');
select is((select count(*) from private.lens_sentences where text like 'Seeded%'),0::bigint,'No seeded text comes back, even when searched for');
select tests.login(2);
select is((select count(*) from private.lens_sentences where source='seeded'),0::bigint,'An admin reads no seeded sentence before a lens opens');
select tests.login(3);
select is((select count(*) from private.lens_sentences),0::bigint,'The person who wrote a seeded sentence cannot read it back from the table');
select tests.login(4);
select is((select count(*) from private.lens_sentences),0::bigint,'The TV reads no lens sentence from the table');
select tests.login(7);
select is((select count(*) from private.lens_sentences),0::bigint,'A facilitator of another engagement reads none');
select tests.login(8);
select is((select count(*) from private.lens_sentences),0::bigint,'A signed-in stranger reads none');
reset role;
set local role anon;
select throws_ok($$ select count(*) from private.lens_sentences $$,'42501',null,'Anonymous callers are refused');
reset role;
set local role authenticated;
select tests.login(1);
select throws_ok($$ update private.lens_sentences set text='x' $$,'42501',null,'Browsers cannot edit sentences');
select throws_ok($$ insert into private.lens_sentences(engagement_id,lens,source,text) values(tests.id(100),1,'live','Injected') $$,'42501',null,'Browsers cannot add sentences');

-- The facilitator gets only counts.
select is(public.lens_seed_counts(tests.id(100))->'lenses'->0,jsonb_build_object('lens',1,'seeded',3,'people',2,'open',false),'The facilitator sees how many were written for lens 1, and how many people wrote them');
select is((public.lens_seed_counts(tests.id(100))->'lenses'->1->>'seeded')::integer,2,'And for lens 2');
select is((public.lens_seed_counts(tests.id(100))->'lenses'->4->>'seeded')::integer,0,'And none for a lens nobody has seeded');
select ok(position('Seeded' in public.lens_seed_counts(tests.id(100))::text)=0,'The counts carry no sentence text');
select ok(not (public.lens_seed_counts(tests.id(100))::text ~ '[0-9a-f]{8}-[0-9a-f]{4}-4'),'The counts carry no sentence or person id');
select tests.login(3);
select is(public.lens_seed_counts(tests.id(100))->>'status','denied','A participant gets no count');
select is(public.lens_open(tests.id(100),1)->>'status','denied','A participant cannot open a lens');
select tests.login(7);
select is(public.lens_seed_counts(tests.id(100))->>'status','denied','Another engagement''s facilitator gets no count');
select is(public.lens_open(tests.id(100),1)->>'status','denied','Nor can they open a lens');
select tests.login(1);
select is(public.lens_open(tests.id(100),6)->>'status','invalid_request','There are five lenses');
select is(public.lens_open(tests.id(100),1,tests.id(999))->>'status','missing','A lens opens from a step of the room');
select is(public.lens_open(tests.id(100),1)->'opened','true'::jsonb,'The facilitator opens lens 1');
select is(public.lens_open(tests.id(100),1)->'opened','false'::jsonb,'Opening it again changes nothing');
select is((select count(*) from private.lens_sentences where source='seeded' and lens=1),3::bigint,'Lens 1 seeded sentences are readable once it opens');
select is((select count(*) from private.lens_sentences where source='seeded' and lens=2),0::bigint,'Lens 2 seeded sentences stay hidden');
select is((public.lens_seed_counts(tests.id(100))->'lenses'->0->>'open')::boolean,true,'The count shows lens 1 open');
select tests.login(2);
select is((select count(*) from private.lens_sentences where source='seeded'),3::bigint,'An admin reads lens 1 now, and lens 2 not yet');
select tests.login(3);
select is((select count(*) from private.lens_sentences),0::bigint,'A participant still reads no sentence from the table');
select tests.login(7);
select is((select count(*) from private.lens_sentences),0::bigint,'Opening a lens in one room opens nothing in another');
select tests.login(1);
select tests.login(3);
select is(private.lens_open(tests.id(100),2)->>'status','denied','The private function checks the caller too');
select tests.login(1);
select is((select count(*) from private.lens_openings),1::bigint,'And nothing else opened');
reset role;
-- A sentence never changes lens or source, so a seed cannot be relabeled live.
select throws_ok($$ update private.lens_sentences set source='live' where id=tests.id(2004) $$,'23514',null,'A seeded sentence cannot be relabeled live');
select throws_ok($$ update private.lens_sentences set lens=1 where id=tests.id(2004) $$,'23514',null,'Nor moved to an open lens');
select throws_ok($$ update private.lens_sentences set engagement_id=tests.id(101) where id=tests.id(2004) $$,'23514',null,'Nor moved to another room');
select throws_ok($$ insert into private.lens_sentences(engagement_id,lens,source,text) values(tests.id(100),0,'live','x') $$,'23514',null,'Lens numbers run from 1 to 5');

-- ---------- Who reads the other records ----------
set local role authenticated;
select tests.login(1);
select is((select count(*) from private.vision_outcomes),2::bigint,'The facilitator reads the Vision Outcomes');
select is((select count(*) from private.goals),2::bigint,'And the goals');
select is((select count(*) from private.risks),1::bigint,'And the risks');
select is((select count(*) from private.risk_mitigations),1::bigint,'And the mitigations');
select is((select count(*) from private.intent_cards),1::bigint,'And the intent cards');
select is((select count(*) from private.first_steps),2::bigint,'And the first steps');
select is((select count(*) from private.map_drafts),1::bigint,'And the Map draft');
select is((select count(*) from private.key_metrics)+(select count(*) from private.celebrations),2::bigint,'And the key metrics and celebrations');
select is((select count(*) from private.lens_summary_responses),2::bigint,'And every response to a lens summary, one per person');
select is((select count(*) from private.lens_summary_versions),2::bigint,'And every version of a lens summary');
select is((select count(*) from private.lens_summary_sources),1::bigint,'And the source sentences each summary sentence links to');
select tests.login(3);
select is((select count(*) from private.vision_outcomes),2::bigint,'A participant reads the Vision Outcomes');
select is((select count(*) from private.outcome_indicators),1::bigint,'And their indicators');
select is((select count(*) from private.goals)+(select count(*) from private.risks)+(select count(*) from private.risk_mitigations)+(select count(*) from private.intent_cards)+(select count(*) from private.first_steps)
 +(select count(*) from private.key_metrics)+(select count(*) from private.celebrations)+(select count(*) from private.map_drafts)+(select count(*) from private.decisions)+(select count(*) from private.lens_summaries)
 +(select count(*) from private.lens_summary_sources),0::bigint,'But no goal, risk, card, step, metric, Map draft, decision, summary record or source');
select is((select count(*) from private.lens_summary_versions),1::bigint,'A participant reads only the version that went to the TV');
select is((select count(*) from private.lens_summary_sentences),1::bigint,'And its sentences');
select is((select count(*) from private.lens_summary_responses),1::bigint,'And only their own response');
select is((select response from private.lens_summary_responses),'approve','Which is their own');
select tests.login(5);
select is((select suggestion from private.lens_summary_responses),'Mention the food bank','Another participant reads only theirs');
select tests.login(4);
select is((select count(*) from private.vision_outcomes)+(select count(*) from private.lens_summary_versions)+(select count(*) from private.lens_summary_responses),0::bigint,'The TV reads these records only through the room, not the tables');
select is((select count(*) from private.lens_openings),1::bigint,'The room can see which lens is open');
select tests.login(7);
select is((select count(*) from private.vision_outcomes)+(select count(*) from private.goals)+(select count(*) from private.lens_summaries)+(select count(*) from private.lens_openings),0::bigint,'Another engagement''s facilitator reads none of it');
select tests.login(8);
select is((select count(*) from private.vision_outcomes)+(select count(*) from private.lens_openings),0::bigint,'A stranger reads none of it');
reset role;
set local role anon;
select throws_ok($$ select count(*) from private.vision_outcomes $$,'42501',null,'Anonymous callers are refused');
reset role;

-- ---------- Owners are one person ----------
select throws_ok($$ insert into private.goals(engagement_id,outcome_id,title,owner_attendee_id,owner_name,owner_email) values(tests.id(100),tests.id(3001),'Two owners',tests.id(503),'Leah Kim','leah@riverside.example') $$,'23514',null,'A goal has one owner, not an attendee and a name');
select throws_ok($$ insert into private.goals(engagement_id,outcome_id,title,owner_name) values(tests.id(100),tests.id(3001),'Name without email','Leah Kim') $$,'23514',null,'An owner added by name needs an email');
select lives_ok($$ insert into private.goals(id,engagement_id,outcome_id,title,owner_name,owner_email,end_date) values(tests.id(3303),tests.id(100),tests.id(3001),'Outside owner','Leah Kim','  Leah@Riverside.Example ','2026-12-15') $$,'A goal can be owned by one person added by name and email');
select is((select owner_email from private.goals where id=tests.id(3303)),'leah@riverside.example','The added email is stored the way the roster stores one');
select is((select season from private.goals where id=tests.id(3303)),'SEP_DEC','A goal carries the season its end date falls in');
select is((select season from private.goals where id=tests.id(3301)),'JAN_APR','Seasons, never quarters');
select throws_ok($$ insert into private.first_steps(engagement_id,card_id,text,owner_attendee_id,owner_name,owner_email) values(tests.id(100),tests.id(3401),'Two owners',tests.id(503),'Leah Kim','leah@riverside.example') $$,'23514',null,'A first step has one owner too');
select is(private.season_of('2026-09-01'),'SEP_DEC','September 1 starts SEP_DEC');
select is(private.season_of('2027-01-01'),'JAN_APR','January 1 starts JAN_APR');
select is(private.season_of('2027-05-01'),'MAY_AUG','May 1 starts MAY_AUG');
select is(private.season_end('2026-11-03'),'2026-12-31'::date,'The season end for a November date is December 31');
select is(private.season_end('2027-02-10'),'2027-04-30'::date,'For February it is April 30');
select is(private.season_end('2027-08-31'),'2027-08-31'::date,'For August 31 it is August 31');

-- ---------- The checks that follow a rule, in code ----------
select is(private.goal_core(tests.id(3301)),jsonb_build_object('connected',true,'owned',true,'result',true,'end_date',true,'met',true,'missing','[]'::jsonb),'A goal with all four CORE letters is met');
select is(private.goal_core(tests.id(3302)),jsonb_build_object('connected',true,'owned',false,'result',false,'end_date',false,'met',false,'missing','["owned","result","end_date"]'::jsonb),'A goal missing letters says which');
update private.goals set result_clear=false where id=tests.id(3301);
select is(private.goal_core(tests.id(3301))->'missing','["result"]'::jsonb,'A result is met only when the facilitator confirms it is clear');
update private.goals set result_clear=true where id=tests.id(3301);
select is(private.goal_core(tests.id(3303))->'missing','["result"]'::jsonb,'An owner added by name is an owner');
select is(private.first_step_flags(tests.id(3501)),jsonb_build_object('owner',true,'date',true,'flagged',false,'missing','[]'::jsonb),'A first step with an owner and a date is not flagged');
select is(private.first_step_flags(tests.id(3502)),jsonb_build_object('owner',false,'date',false,'flagged',true,'missing','["owner","date"]'::jsonb),'A first step with neither is flagged');
select is(private.outcome_is_empty(tests.id(3002)),true,'An outcome with no indicator is empty');
select is(private.outcome_is_empty(tests.id(3001)),false,'And not with one');
select is(private.outcome_range(tests.id(100)),'{"confirmed":1,"note":"fewer"}'::jsonb,'One confirmed outcome is fewer than four');
insert into private.vision_outcomes(engagement_id,title,status,confirmed_at,position) select tests.id(100),'Outcome '||n,'confirmed',now(),n+10 from generate_series(1,3)n;
select is(private.outcome_range(tests.id(100))->'note','null'::jsonb,'Four is in range');
insert into private.vision_outcomes(engagement_id,title,status,confirmed_at,position) select tests.id(100),'Extra '||n,'confirmed',now(),n+20 from generate_series(1,3)n;
select is(private.outcome_range(tests.id(100)),'{"confirmed":7,"note":"more"}'::jsonb,'Seven is more than six, and the app warns without blocking');

-- ---------- Mark a decision ----------
set local role authenticated;
select tests.login(1);
select is(tests.save(310,'wall')->>'status','ok','A step to mark a decision on');
select is(tests.ctl(900,'go_live',jsonb_build_object('session',tests.id(310)))->>'status','ok','Go live on it');
select is(tests.mark(910,'{"decision":"  We keep the name   Leaders raised from within ","reasons":"The whole room said this is the one that makes the rest possible."}')->>'status','ok','The facilitator marks a decision');
select is((select decision from private.decisions where id=tests.id(910)),'We keep the name Leaders raised from within','The decision is stored with plain spacing');
select is((select reasons from private.decisions where id=tests.id(910)),'The whole room said this is the one that makes the rest possible.','And its reasons');
select is((select session_id from private.decisions where id=tests.id(910)),tests.id(310),'It records the step that was on the TV');
select is((select subject||':'||subject_id::text from private.decisions where id=tests.id(910)),'step:'||tests.id(310)::text,'The subject is the step by default');
select is((select counts from private.decisions where id=tests.id(910)),'{"total":0,"people":0}'::jsonb,'It keeps the numbers on screen as a record, never as the decision');
select is((select marked_by from private.decisions where id=tests.id(910)),tests.id(701),'And who marked it');
select is(tests.mark(910,'{"decision":"We keep the name Leaders raised from within"}')->>'status','duplicate','A repeated press does nothing');
select is((select count(*) from private.decisions),1::bigint,'And records nothing twice');
select is(tests.mark(911,'{"decision":"  "}')->>'status','invalid_request','A decision needs words');
select is(tests.mark(911,'{"decision":"x","subject":"nonsense"}')->>'status','invalid_request','A subject is one of the known kinds');
select is(tests.mark(911,('{"decision":"x","reasons":"'||repeat('a',1001)||'"}')::jsonb)->>'status','invalid_request','Reasons stop at 1000 characters');
select is(tests.mark(911,'{"decision":"x","subject_id":"not-a-uuid"}')->>'status','invalid_request','A subject id is an id');
select is(tests.mark(911,jsonb_build_object('decision','x','subject','outcome','subject_id',tests.id(9999)))->>'status','missing','A subject must exist in this room');
select is(tests.mark(911,jsonb_build_object('decision','x','session',tests.id(9999)))->>'status','missing','So must the step');
select is(tests.mark(912,jsonb_build_object('decision','Confirmed','reasons','','subject','outcome','subject_id',tests.id(3002),'label','Families find a home here'))->>'status','ok','A decision about an outcome');
select is((select decision_id from private.vision_outcomes where id=tests.id(3002)),tests.id(912),'It links to that outcome');
select is(tests.mark(913,jsonb_build_object('decision','Signed off','subject','lens_summary','subject_id',tests.id(3601)))->>'status','ok','A decision about a lens summary');
select is((select decision_id from private.lens_summaries where id=tests.id(3601)),tests.id(913),'It links to that summary');
reset role;
select is((select count(*) from private.room_controls where action='mark_decision'),3::bigint,'Each press is logged once');
set local role authenticated;
select tests.login(1);
select is(jsonb_array_length(public.decisions_for(tests.id(100))->'decisions'),3,'The facilitator reads the decisions marked');
select is(public.decisions_for(tests.id(100))->'decisions'->0->>'by','Chris','Newest first, with the first name of who marked it');
select is(public.decisions_for(tests.id(100))->'session'->>'title','Step 310','And the step that is on the TV');
select tests.login(3);
select is(tests.mark(920,'{"decision":"I decide"}')->>'status','denied','A participant cannot mark a decision');
select is(public.decisions_for(tests.id(100))->>'status','denied','Or read the decisions');
select tests.login(7);
select is(tests.mark(921,'{"decision":"Not mine"}')->>'status','denied','Nor can another engagement''s facilitator');
select tests.login(4);
select is(tests.mark(922,'{"decision":"The TV"}')->>'status','denied','Nor the TV');
select tests.login(1);
select is(tests.mark(912,'{"decision":"Different words"}')->>'status','duplicate','The same press id from the same room stays a duplicate');
select is(tests.mark(911,'{"decision":"Fresh"}')->>'status','ok','A fresh press id records');
reset role;
select is((select count(*) from private.decisions),4::bigint,'Four decisions in all');

-- ---------- Seeded from ----------
set local role authenticated;
select tests.login(1);
select is(tests.save(320,'wall','{}','Pre-call')->>'status','ok','A pre-call wall');
select is(tests.save(321,'wall','{}','Day 1',jsonb_build_object('seeded_from',tests.id(320)))->>'status','ok','A Day 1 wall saved seeded from it');
select is((select seeded_from from public.sessions where id=tests.id(321)),tests.id(320),'The run of show keeps where it was seeded from');
select is(public.show_read(tests.id(100))->'sessions'->(select (ord-1)::integer from (select s->>'id' as id,row_number() over() ord from jsonb_array_elements(public.show_read(tests.id(100))->'sessions') s) x where id=tests.id(321)::text)->>'seeded_from',tests.id(320)::text,'The run of show reads it back');
select is(tests.save(322,'word_cloud','{}','Day 1',jsonb_build_object('seeded_from',tests.id(320)))->>'status','invalid_request','A step seeds only from a step of its own kind');
select is((select count(*) from public.sessions where id=tests.id(322)),0::bigint,'A bad choice undoes the whole save');
select is(public.show_seed_from(tests.id(100),tests.id(320),tests.id(320))->>'status','invalid_request','A step cannot be seeded from itself');
select is(public.show_seed_from(tests.id(100),tests.id(320),tests.id(321))->>'status','invalid_request','Two steps cannot seed each other');
select is(public.show_seed_from(tests.id(100),tests.id(321),tests.id(9999))->>'status','missing','The source must exist');
select is(public.show_seed_from(tests.id(100),tests.id(321),tests.id(320),999)->>'status','conflict','A stale revision is a conflict');
select is(public.show_seed_from(tests.id(100),tests.id(321),null)->>'seeded_from',null,'Seeded from can be cleared');
select is(public.show_seed_from(tests.id(100),tests.id(321),tests.id(320))->>'status','ok','And set again');
select is(public.show_seed_from(tests.id(101),tests.id(321),tests.id(320))->>'status','denied','Another engagement''s facilitator cannot change it');
select tests.login(3);
select is(public.show_seed_from(tests.id(100),tests.id(321),null)->>'status','denied','A participant cannot change it');
select tests.login(1);
select is(public.show_write(tests.id(100),'remove',jsonb_build_object('id',tests.id(320),'revision',(select revision from public.sessions where id=tests.id(320))))->>'status','ok','Removing the source step');
select is((select seeded_from from public.sessions where id=tests.id(321)),null,'frees the step seeded from it');
reset role;

-- ---------- Lens names, and Scripture at body size ----------
update engagements set lens_names=array['Customer','Community','Leadership','Operations','Learning'] where id=tests.id(100);
set local role authenticated;
select tests.login(1);
select is(public.show_read(tests.id(100))->'context'->'lens_names'->>0,'Customer','The run of show reads the engagement''s lens names');
select is(tests.save(330,'content','{"screen":"scripture","reference":"1 Corinthians 3:5-8","translation":"New Living Translation","size":"body"}')->>'status','ok','Scripture saves at body size');
select is((select options->>'size' from public.sessions where id=tests.id(330)),'body','The size is kept');
select is(tests.save(331,'content','{"screen":"scripture","size":"headline"}')->>'status','ok','Headline size is the default');
select is((select options ? 'size' from public.sessions where id=tests.id(331)),false,'And is not stored');
select is(tests.save(332,'content','{"screen":"prayer","size":"body"}')->>'status','invalid_request','Only Scripture has a size');
select is(tests.save(333,'content','{"screen":"scripture","size":"huge"}')->>'status','invalid_request','And only two');
reset role;
select is((select private.tv_room_info(tests.id(100))->'display'->'lens_names'->>0),'Customer','The TV and phones read the lens names');

-- ---------- Every new function is private or an invoker wrapper ----------
select ok(not (select prosecdef from pg_proc where oid='public.decision_mark(uuid,uuid,jsonb)'::regprocedure),'The public decision press is an invoker');
select ok(not (select prosecdef from pg_proc where oid='public.show_write(uuid,text,jsonb)'::regprocedure),'The public run of show save is still an invoker');
select ok(not has_function_privilege('authenticated','private.goal_core(uuid)','execute'),'The CORE check is not callable by browsers');
select ok(not has_function_privilege('authenticated','private.first_step_flags(uuid)','execute'),'Nor the first step check');
select ok(not has_function_privilege('anon','public.decision_mark(uuid,uuid,jsonb)','execute'),'Anonymous callers cannot mark a decision');
select ok(not has_function_privilege('anon','public.lens_seed_counts(uuid)','execute'),'Or read a seed count');
select ok(has_function_privilege('authenticated','private.show_read(uuid,uuid,text)','execute'),'The run of show read stays callable');
select * from finish();
rollback;
