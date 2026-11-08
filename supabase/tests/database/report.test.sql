-- Milestone 7, step 1: the Wayfinding report. The six report records and who may reach any of it (the lead, a co-facilitator, another engagement's
-- facilitator, a participant, the scribe, a team facilitator, the TV and an unsigned browser), the AI job checks, the drafting round (due, claim,
-- apply, fail) with every check the code makes on a reply, the editor (edit, add, remove, the room's words, sources, review), the signal rule,
-- sign-off and the clean read of the signed report, the visibility plan contract, and the practice room's reset and Clear test answers.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('ae070000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(1000+n))::text,true); end $$;
create function tests.rstate() returns jsonb language sql as $$ select public.report_state(tests.id(100)) $$;
create function tests.sec(k text) returns uuid language sql security definer set search_path='' as $$ select s.id from private.report_sections s where s.engagement_id='ae070000-0000-4000-8000-000000000100' and s.key=k and not s.deleted $$;
create function tests.status(k text) returns text language sql security definer set search_path='' as $$ select s.status from private.report_sections s where s.engagement_id='ae070000-0000-4000-8000-000000000100' and s.key=k and not s.deleted $$;
create function tests.q(sql text) returns text language plpgsql security definer set search_path='' as $$ declare v text; begin execute sql into v; return v; end $$;
-- The worker, in one call: claim a section, write one sentence from the ref it prefers (a quote when there is one), apply it. Returns how many it did.
create function tests.work(n integer default 30, prefer text default 'Quote%') returns integer language plpgsql security definer set search_path='' as $$
declare i integer; v jsonb; r jsonb; lease uuid; done integer:=0; pick jsonb;
begin
 for i in 1..n loop
  lease:=gen_random_uuid();
  v:=private.report_claim('ae070000-0000-4000-8000-000000000100',lease,'recorded-fixture','{"draft_report":"report@1"}');
  exit when v->>'status'<>'claimed';
  select x.value into pick from jsonb_array_elements(v->'inputs'->'refs') with ordinality x(value,ordinality) where x.value->>'group' like prefer limit 1;
  if pick is null then select x.value into pick from jsonb_array_elements(v->'inputs'->'refs') x limit 1; end if;
  r:=private.report_apply((v->>'run')::uuid,lease,jsonb_build_object('sentences',jsonb_build_array(jsonb_build_object('text',
     case when pick->>'group' like 'Quote%' then '"'||(pick->>'text')||'"' else pick->>'text' end,'refs',jsonb_build_array(pick->>'ref')))),'{"ms":1200,"input_tokens":10,"output_tokens":5}');
  done:=done+1;
 end loop;
 return done;
end $$;
-- One reply for the claim in hand, as the worker would send it.
create function tests.claim(k text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare lease uuid:=gen_random_uuid(); v jsonb;
begin
 v:=private.report_claim('ae070000-0000-4000-8000-000000000100',lease,'recorded-fixture','{"draft_report":"report@1"}');
 return v||jsonb_build_object('lease',lease);
end $$;
create function tests.apply(v jsonb, sentences jsonb) returns jsonb language sql security definer set search_path='' as $$
 select private.report_apply((v->>'run')::uuid,(v->>'lease')::uuid,jsonb_build_object('sentences',sentences),'{"ms":900}')
$$;
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

-- ---------- The records ----------
select is((select count(*) from pg_class where oid in('private.report_drafts'::regclass,'private.report_sections'::regclass,'private.report_sentences'::regclass,'private.report_sources'::regclass,'private.report_rounds'::regclass,'private.report_sign_offs'::regclass) and relrowsecurity and relforcerowsecurity),6::bigint,'All six report records force row-level security');
select is((select count(*) from information_schema.role_table_grants where grantee in('authenticated','anon','public') and table_schema='private' and table_name in('report_drafts','report_sections','report_sentences','report_sources','report_rounds','report_sign_offs')),0::bigint,'and no browser or anonymous role has a grant on any of them');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'report\_%' and p.prosecdef),0::bigint,'Every public report function is a security invoker wrapper');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in('report_state','report_start','report_refresh','report_edit','report_add','report_remove','report_room_words','report_undo_room_words','report_source_set','report_mark_reviewed','report_sign_off','report_candidates_for','report_due','report_claim','report_apply','report_fail','report_signed_for_view','visibility_plan_for_report','report_section_inputs') and p.prosecdef and p.proconfig::text like '%search_path=%'),19::bigint,'and the 19 private functions are security definer with a fixed search path');

-- ---------- The AI job checks ----------
select throws_ok($$insert into private.ai_runs(engagement_id,session_id,job,model,prompt_version,inputs) values(tests.id(100),null,'combine_words','m','v','{}')$$,'23514',null,'A live job still needs a session');
select lives_ok($$insert into private.ai_runs(engagement_id,session_id,job,model,prompt_version,inputs,status,finished_at) values(tests.id(100),null,'draft_report','m','v','{}','failed',now())$$,'The report job is engagement-level and has none');
select lives_ok($$insert into private.ai_runs(engagement_id,session_id,job,model,prompt_version,inputs,status,finished_at) values(tests.id(100),null,'draft_visibility_plan','m','v','{}','failed',now())$$,'so is the visibility plan job step 3 adds');
select lives_ok($$insert into private.ai_runs(engagement_id,session_id,job,model,prompt_version,inputs,status,finished_at) values(tests.id(100),null,'draft_what_we_heard','m','v','{}','failed',now())$$,'and the What We Heard job still has none');
select lives_ok($$insert into private.ai_runs(engagement_id,session_id,job,model,prompt_version,inputs,status,finished_at) values(tests.id(100),null,'overnight_draft','m','v','{}','failed',now())$$,'nor does the overnight draft');
select lives_ok($$insert into private.ai_runs(engagement_id,session_id,job,model,prompt_version,inputs,status,finished_at) values(tests.id(100),tests.id(310),'fold_four_lists','m','v','{}','failed',now())$$,'step 2''s fold job is still allowed');
delete from private.ai_runs where engagement_id=tests.id(100);

-- ---------- Who may use it ----------
set local role authenticated;
select tests.login(1);
select is(tests.rstate()->>'status','ok','The lead reads the state');
select is(tests.rstate()->>'draft','false','and there is no draft yet');
select tests.login(2);
select is(tests.rstate()->>'status','ok','A co-facilitator reads it');
do $$ declare n integer; r jsonb; ids integer[]:=array[7,4,3,10,5,9]; i integer; begin
 for i in 1..6 loop
  perform tests.login(ids[i]);
  n:=0;
  r:=public.report_state(tests.id(100)); if r->>'status'='denied' then n:=n+1; end if;
  r:=public.report_candidates(tests.id(100),tests.id(1)); if r->>'status'='denied' then n:=n+1; end if;
  r:=public.report_start(tests.id(100),tests.id(80+i),'all',null,false); if r->>'status'='denied' then n:=n+1; end if;
  r:=public.report_refresh(tests.id(100),'future',false); if r->>'status'='denied' then n:=n+1; end if;
  r:=public.report_edit(tests.id(100),tests.id(1),'x'); if r->>'status'='denied' then n:=n+1; end if;
  r:=public.report_add(tests.id(100),tests.id(1),'x'); if r->>'status'='denied' then n:=n+1; end if;
  r:=public.report_remove(tests.id(100),tests.id(1)); if r->>'status'='denied' then n:=n+1; end if;
  r:=public.report_room_words(tests.id(100),tests.id(1)); if r->>'status'='denied' then n:=n+1; end if;
  r:=public.report_undo_room_words(tests.id(100),tests.id(1)); if r->>'status'='denied' then n:=n+1; end if;
  r:=public.report_source_set(tests.id(100),tests.id(1),'theme',tests.id(621),'x',true); if r->>'status'='denied' then n:=n+1; end if;
  r:=public.report_mark_reviewed(tests.id(100),tests.id(1),true); if r->>'status'='denied' then n:=n+1; end if;
  r:=public.report_sign_off(tests.id(100),tests.id(1)); if r->>'status'='denied' then n:=n+1; end if;
  perform set_config('tests.denied_'||i,n::text,true);
 end loop;
end $$;
select is(current_setting('tests.denied_1'),'12','A facilitator of another engagement is denied all twelve functions');
select is(current_setting('tests.denied_2'),'12','A participant is denied all twelve');
select is(current_setting('tests.denied_3'),'12','The scribe is denied all twelve');
select is(current_setting('tests.denied_4'),'12','A team facilitator holding the remote is denied all twelve');
select is(current_setting('tests.denied_5'),'12','A TV is denied all twelve');
select is(current_setting('tests.denied_6'),'12','Someone with no place is denied all twelve');
select throws_ok($$select count(*) from private.report_drafts$$,'42501',null,'No signed-in role reads the draft record directly');
select throws_ok($$select count(*) from private.report_sentences$$,'42501',null,'or the sentences');
select throws_ok($$select count(*) from private.report_sources$$,'42501',null,'or the sources');
select throws_ok($$select count(*) from private.report_sign_offs$$,'42501',null,'or the sign-offs');
select throws_ok($$select public.report_claim(tests.id(100),tests.id(1),'m','{}')$$,'42501',null,'The worker''s claim is not for a signed-in facilitator');
select throws_ok($$select public.report_apply(tests.id(1),tests.id(1),'{}','{}')$$,'42501',null,'nor its apply');
select throws_ok($$select public.report_fail(tests.id(1),tests.id(1),'x','{}')$$,'42501',null,'nor its fail');
select throws_ok($$select public.report_due(tests.id(100))$$,'42501',null,'nor its due check');
select throws_ok($$select private.report_signed_for_view(tests.id(100))$$,'42501',null,'The signed copy is for the service role only, not a facilitator');
select throws_ok($$select * from private.visibility_plan_for_report(tests.id(100))$$,'42501',null,'and so is the visibility plan contract');
select throws_ok($$select private.report_section_inputs(tests.id(100),tests.id(1))$$,'42501',null,'and what the model reads');
reset role;
set local role anon;
select throws_ok($$select public.report_state(tests.id(100))$$,'42501',null,'An unsigned browser cannot read the state');
select throws_ok($$select public.report_start(tests.id(100),tests.id(1),'all',null,false)$$,'42501',null,'or start a draft');
select throws_ok($$select public.report_edit(tests.id(100),tests.id(1),'x')$$,'42501',null,'or edit a sentence');
select throws_ok($$select public.report_sign_off(tests.id(100),tests.id(1))$$,'42501',null,'or sign off');
select throws_ok($$select public.report_source_set(tests.id(100),tests.id(1),'theme',tests.id(621),'x',true)$$,'42501',null,'or add a source');
reset role;
set local role service_role;
select is(private.report_signed_for_view(tests.id(100)),null::jsonb,'The service role reads no signed copy before anything is signed');
select is((select count(*) from private.visibility_plan_for_report(tests.id(100))),0::bigint,'and the visibility plan contract returns no rows while there is no plan');
reset role;
select is((select pg_get_function_result(p.oid) from pg_proc p where p.proname='visibility_plan_for_report' and p.pronamespace='private'::regnamespace),
 'TABLE(row_id uuid, "position" integer, who text, when_text text, by_whom text, what_they_hear text, risk text, reviewed boolean, sources jsonb)','The visibility plan contract has exactly the columns step 3 fills');

-- ---------- AI off: the tables still build from the records ----------
set local role authenticated;
select tests.login(1);
select is(public.report_start(tests.id(100),tests.id(500),'all',null,false)->>'status','ai_off','With AI off for the engagement, Draft the report says so');
select is(public.report_start(tests.id(100),null,'all',null,false)->>'status','invalid_request','A press with no id is refused');
select is(public.report_start(tests.id(100),tests.id(500),'section','nope',false)->>'status','invalid_request','and so is a section that is not one of the fourteen');
reset role;
select is((select count(*)::integer from private.report_sections where engagement_id=tests.id(100) and not deleted),14,'Fourteen sections exist');
select is((select string_agg(key,',' order by position) from private.report_sections where engagement_id=tests.id(100) and not deleted),'overview,church_today,process,heard,interviews,tensions,future,vision,risks,outlook,intent,decisions,visibility,closing','in the report''s order');
select is((select string_agg(distinct status,',') from private.report_sections where engagement_id=tests.id(100) and kind='record'),'drafted','The seven record sections stand on the records alone');
select is((select string_agg(distinct status,',') from private.report_sections where engagement_id=tests.id(100) and kind='prose'),'empty','and the seven prose sections wait');
select is((select count(*)::integer from private.report_rounds where engagement_id=tests.id(100)),0,'No drafting round is made when AI is off');
update engagements set settings=settings||'{"ai_enabled":true}' where id=tests.id(100);

-- ---------- Draft the report ----------
set local role authenticated;
select tests.login(1);
select is(public.report_start(tests.id(100),tests.id(501),'all',null,false)->>'status','ok','The lead drafts the report');
select is(public.report_start(tests.id(100),tests.id(501),'all',null,false)->>'status','duplicate','the same press again is a duplicate');
select is(public.report_start(tests.id(100),tests.id(502),'all',null,false)->>'status','busy','and another press while it runs says busy');
reset role;
select is((select queue from private.report_rounds where engagement_id=tests.id(100)),array['church_today','process','heard','interviews','tensions','future','vision','risks','outlook','intent','decisions','visibility','overview','closing'],'The queue runs the prose sections, then the record leads, and Overview and Closing last');
select is((select count(*)::integer from private.report_sections where engagement_id=tests.id(100) and status='drafting'),14,'Every section reads Drafting');
select is((select jsonb_array_length(blocks->'rows') from private.report_sections where engagement_id=tests.id(100) and key='decisions'),1,'The decisions table holds the scribe''s decision');
select is((select count(*)::integer from private.report_sentences x join private.report_sections s on s.id=x.section_id where s.engagement_id=tests.id(100) and s.key='decisions' and x.origin='record' and not x.deleted),1,'as a record sentence');
select is((select count(*)::integer from private.report_sources r join private.report_sentences x on x.id=r.sentence_id join private.report_sections s on s.id=x.section_id where s.key='decisions' and s.engagement_id=tests.id(100) and r.kind='scribe_card' and r.ref_id=tests.id(642)),1,'that rests on the scribe card');
set local role service_role;
select is(private.report_due(tests.id(100)),true,'The worker is due');
reset role;

-- The claim reads refs only.
drop table if exists claimed;
create temp table claimed as select tests.claim() as v;
grant all on claimed to public;
select is((select v->>'section' from claimed),'church_today','The first claim is the first section in the queue');
select is((select v->>'status' from claimed),'claimed','and it is claimed');
select is((select count(*)::integer from private.ai_runs where engagement_id=tests.id(100) and job='draft_report' and session_id is null and status='running'),1,'One run is logged with no session');
select is((select (v->'inputs'->'refs'->0->>'ref') from claimed),'f1','The first ref is the survey finding');
select ok((select (v->'inputs')::text !~* '(Jordan|Michael|Parker|Reed|Sarah|Priya|Shah|Krista|Scribe|Ortiz|Ben)' from claimed),'No attendee name is in what the model reads');
select is(tests.apply((select v from claimed),'[{"text":"31% of respondents named a clear way into groups.","refs":["f1"]}]')->>'status','ok','A sentence that cites a ref and uses its number is kept');
select is(tests.status('church_today'),'drafted','The section reads Drafted');
select is((select count(*)::integer from private.report_sources r join private.report_sentences x on x.id=r.sentence_id join private.report_sections s on s.id=x.section_id where s.key='church_today' and s.engagement_id=tests.id(100) and r.kind='finding'),1,'and its sentence rests on the finding');

-- Every check the code makes on a reply.
drop table claimed;
drop table if exists claimed;
create temp table claimed as select tests.claim() as v;
grant all on claimed to public;
select is((select v->>'section' from claimed),'process','The next claim is the next section');
select is(tests.apply((select v from claimed),jsonb_build_array(
  jsonb_build_object('text','42% of the team came.','refs',jsonb_build_array('h1')),
  jsonb_build_object('text','The team met.','refs',jsonb_build_array()),
  jsonb_build_object('text','The team met.','refs',jsonb_build_array('zz9')),
  jsonb_build_object('text','Priya led the opening.','refs',jsonb_build_array('h1')),
  jsonb_build_object('text','The communication plan was shared.','refs',jsonb_build_array('h1')),
  jsonb_build_object('text','They said "we are lost" together.','refs',jsonb_build_array('h1'))))->>'dropped','6','A number no ref carries, no ref, an unknown ref, an attendee''s name, "communication plan" and a quote not in a ref are all refused');
select is(tests.status('process'),'needs_attention','A section that loses a sentence is marked Needs attention');
select is((select count(*)::integer from private.report_sentences x join private.report_sections s on s.id=x.section_id where s.key='process' and s.engagement_id=tests.id(100) and not x.deleted),0,'and keeps none of them');
select is((select output->>'kept' from private.ai_runs where engagement_id=tests.id(100) and job='draft_report' order by created_at desc limit 1),'0','The run records what was kept');
select is((select jsonb_array_length(output->'refused') from private.ai_runs where engagement_id=tests.id(100) and job='draft_report' order by created_at desc limit 1),6,'and each reason');
drop table claimed;
drop table if exists claimed;
create temp table claimed as select tests.claim() as v;
grant all on claimed to public;
select is((select v->>'section' from claimed),'heard','Then What We Heard');
select ok((select exists(select 1 from jsonb_array_elements(v->'inputs'->'refs') r where r->>'group' like 'Aligned signal%') from claimed),'It reads the aligned signal that was saved as a citation');
select ok((select not exists(select 1 from jsonb_array_elements(v->'inputs'->'refs') r where r->>'text' like '%nobody saved%' or r->>'text' like '%heads a different way%') from claimed),'but not the aligned one nobody saved, or the divergent one');
select is(tests.apply((select v from claimed),jsonb_build_array(
  jsonb_build_object('text','"Volunteers are stretched thin, the same few people every week."','refs',jsonb_build_array('q1')),
  jsonb_build_object('text','The room''s words on finding a group match what the interviews said.','refs',jsonb_build_array('g1')),
  jsonb_build_object('text','Respondents named a way into groups, and 31% said so.','refs',jsonb_build_array('f1','t1'))))->>'kept','3','Quotes, a signal and a number each stand when their refs carry them');
select is((select quote from private.report_sentences x join private.report_sections s on s.id=x.section_id where s.key='heard' and s.engagement_id=tests.id(100) and not x.deleted order by x.position limit 1),true,'A sentence that is only a quotation is marked as one');
select is((select count(*)::integer from private.report_sources r join private.report_sentences x on x.id=r.sentence_id join private.report_sections s on s.id=x.section_id where s.key='heard' and s.engagement_id=tests.id(100) and r.kind='signal' and r.ref_id=tests.id(651)),1,'The aligned signal is a source of the sentence that cites it');
select is((select room_words from private.report_sources r join private.report_sentences x on x.id=r.sentence_id join private.report_sections s on s.id=x.section_id where s.key='heard' and s.engagement_id=tests.id(100) and r.kind='theme' and x.position=1 limit 1),true,'The quotation''s source is the room''s words');
select is((select thin_label from private.report_sentences x join private.report_sections s on s.id=x.section_id where s.key='heard' and s.engagement_id=tests.id(100) and not x.deleted and x.position=3),null,'A figure that is not thin carries no thin label');

-- The rest of the queue runs through the same checks.
select is(tests.work(30),4,'The worker drafts the rest of the queue: the sections with nothing to read are marked Thin data without asking the model');
select is((select status from private.report_rounds where engagement_id=tests.id(100)),'ready','and the round is ready');
select is((select count(*)::integer from private.report_sections where engagement_id=tests.id(100) and status='drafting'),0,'No section is left Drafting');
select ok(tests.status('overview') in('drafted','thin'),'Overview is drafted last, from the other sections'' sentences');
select is(tests.status('process'),'needs_attention','Process keeps its Needs attention after the round');
select is(tests.status('future'),'thin','A record section with nothing recorded is Thin data');
select is((select count(*)::integer from private.ai_runs where engagement_id=tests.id(100) and job='draft_report' and status='ok' and session_id is null),(select count(*)::integer from private.ai_runs where engagement_id=tests.id(100) and job='draft_report' and status='ok'),'Every report run has no session');

-- ---------- A failure is retried once, then the section needs attention ----------
set local role authenticated;
select tests.login(1);
select is(public.report_start(tests.id(100),tests.id(510),'section','tensions',false)->>'status','ok','Redrafting one section queues just that section');
reset role;
select is((select queue from private.report_rounds where engagement_id=tests.id(100)),array['tensions'],'a queue of one');
drop table if exists claimed;
create temp table claimed as select tests.claim() as v;
grant all on claimed to public;
select is((select private.report_fail((v->>'run')::uuid,(v->>'lease')::uuid,'timeout','{"ms":5}')->>'gave_up' from claimed),'false','The first failure is retried');
select is((select status from private.report_rounds where engagement_id=tests.id(100)),'pending','The round waits to try again');
select is((select (private.report_claim(tests.id(100),gen_random_uuid(),'m','{"draft_report":"report@1"}'))->>'status'),'cooling','and the pause is the database''s: an early claim is told to wait');
update private.report_rounds set last_failed_at=now()-interval '1 minute' where engagement_id=tests.id(100);
drop table claimed;
drop table if exists claimed;
create temp table claimed as select tests.claim() as v;
grant all on claimed to public;
select is((select private.report_fail((v->>'run')::uuid,(v->>'lease')::uuid,'timeout','{"ms":5}')->>'gave_up' from claimed),'true','The second failure gives up');
select is(tests.status('tensions'),'needs_attention','and the section is marked Needs attention');
select is((select status from private.report_rounds where engagement_id=tests.id(100)),'ready','while the round carries on');
select is((select count(*)::integer from private.ai_runs where engagement_id=tests.id(100) and job='draft_report' and status='failed'),2,'Both failures are in the run log');
select is(private.report_fail(tests.id(1),tests.id(1),'x','{}')->>'status','missing','A fail for a run that is not there is missing');
drop table claimed;

-- ---------- The editor ----------
create function tests.sent(k text, n integer) returns uuid language sql security definer set search_path='' as $$
 select x.id from private.report_sentences x join private.report_sections s on s.id=x.section_id where s.engagement_id='ae070000-0000-4000-8000-000000000100' and s.key=k and not x.deleted order by x.position,x.id offset n-1 limit 1 $$;
create function tests.last_sent(k text) returns uuid language sql security definer set search_path='' as $$
 select x.id from private.report_sentences x join private.report_sections s on s.id=x.section_id where s.engagement_id='ae070000-0000-4000-8000-000000000100' and s.key=k and not x.deleted order by x.position desc,x.id desc limit 1 $$;
create function tests.val(sql text) returns text language plpgsql security definer set search_path='' as $$ declare v text; begin execute sql into v; return v; end $$;
create function tests.keys() returns text[] language sql security definer set search_path='' as $$
 select array_agg(s.key order by s.position) from private.report_sections s where s.engagement_id='ae070000-0000-4000-8000-000000000100' and not s.deleted $$;
create function tests.own(k text) returns uuid language sql security definer set search_path='' as $$
 select x.id from private.report_sentences x join private.report_sections s on s.id=x.section_id where s.engagement_id='ae070000-0000-4000-8000-000000000100' and s.key=k and not x.deleted and x.origin='facilitator' order by x.position desc,x.id desc limit 1 $$;
grant execute on function tests.sent(text,integer),tests.last_sent(text),tests.val(text),tests.keys(),tests.own(text) to authenticated,anon,service_role;
select is(tests.status('heard'),'drafted','What We Heard is drafted');
set local role authenticated;
select tests.login(1);
select is(public.report_edit(tests.id(100),tests.sent('heard',2),'The room''s words on finding a group match the interviews.')->>'status','ok','The lead edits a sentence');
select is(public.report_edit(tests.id(100),tests.sent('heard',2),'The room''s words on finding a group match the interviews.')->>'status','unchanged','the same text again changes nothing');
select is(public.report_edit(tests.id(100),tests.sent('heard',2),'')->>'status','invalid_request','an empty sentence is refused');
select is(tests.status('heard'),'edited','The section reads Edited');
select is(tests.val($$select touched::text from private.report_sentences where id='$$||tests.sent('heard',2)||$$'$$),'true','and the sentence is marked touched');
select is(tests.val($$select origin from private.report_sentences where id='$$||tests.sent('heard',2)||$$'$$),'ai','Edited AI wording stays AI wording with its sources');
select is(tests.val($$select count(*)::text from private.report_sources where not deleted and sentence_id='$$||tests.sent('heard',2)||$$'$$),'1','and still rests on them');
select is(public.report_edit(tests.id(100),tests.sent('heard',1),'A "quote" of ours; with — a dash.')->>'status','ok','Another edit, with a semicolon and a dash');
select is(tests.val($$select text from private.report_sentences where id='$$||tests.sent('heard',1)||$$'$$),'A "quote" of ours, with, a dash.','is rewritten without them');
select is(public.report_room_words(tests.id(100),tests.sent('heard',3))->>'status','no_room_words','A sentence with no source of the room''s exact words cannot use them');
select is(public.report_room_words(tests.id(100),tests.sent('heard',1))->>'status','ok','Use the room''s words puts the exact words in');
select is(tests.val($$select text||'|'||origin from private.report_sentences where id='$$||tests.sent('heard',1)||$$'$$),'Volunteers are stretched thin, the same few people every week.|room','from the first source that holds them');
select is(tests.val($$select (ai_text is not null)::text from private.report_sentences where id='$$||tests.sent('heard',1)||$$'$$),'true','and keeps the AI wording for undo');
select is(public.report_room_words(tests.id(100),tests.sent('heard',1))->>'status','unchanged','Using them twice changes nothing');
select is(public.report_undo_room_words(tests.id(100),tests.sent('heard',1))->>'status','ok','Undo brings the draft wording back');
select is(tests.val($$select origin from private.report_sentences where id='$$||tests.sent('heard',1)||$$'$$),'ai','as AI wording');
select is(public.report_add(tests.id(100),tests.sec('heard'),'Our own read: this is bigger than the survey shows.')->>'status','ok','Add your own read adds a sentence of the facilitator''s own');
select is(tests.val($$select origin||'|'||(select count(*) from private.report_sources where sentence_id=x.id and not deleted) from private.report_sentences x where x.id='$$||tests.last_sent('heard')||$$'$$),'facilitator|0','with no source');
select is((select (e->>'needs_source')::boolean from jsonb_array_elements((public.report_state(tests.id(100))->'sections')) s, jsonb_array_elements(s->'sentences') e where s->>'key'='heard' order by (e->>'position')::int desc limit 1),false,'which does not need one');
select is(public.report_add(tests.id(100),tests.sec('heard'),'A second read of our own.')->>'status','ok','A second one');
create temp table rm as select tests.last_sent('heard') as id;
grant all on rm to public;
select is(public.report_remove(tests.id(100),(select id from rm))->>'status','ok','A sentence can be removed');
select is(public.report_remove(tests.id(100),(select id from rm))->>'status','not_found','and only once');

-- Redrafting keeps what was touched and asks first.
select is(public.report_start(tests.id(100),tests.id(512),'section','heard',false)->>'status','confirm','Redrafting a section with changed sentences asks first');
select is(public.report_start(tests.id(100),tests.id(512),'section','heard',false)->'kept','2'::jsonb,'and says how many it would keep');
select is(public.report_start(tests.id(100),tests.id(512),'section','heard',true)->>'status','ok','Confirmed, it queues the section');
reset role;
select is(tests.work(5,'Aligned%'),1,'The worker redrafts just that section');
select is(tests.val($$select count(*)::text from private.report_sentences x where x.section_id='$$||tests.sec('heard')||$$' and not x.deleted and (x.touched or x.origin='facilitator')$$),'2','The sentences the facilitator touched or wrote are still there');
select is(tests.val($$select count(*)::text from private.report_sentences x where x.section_id='$$||tests.sec('heard')||$$' and not x.deleted and x.origin='ai' and not x.touched$$),'1','and only the untouched AI sentences were replaced');
select is(tests.val($$select count(*)::text from private.report_sources r join private.report_sentences x on x.id=r.sentence_id where x.section_id='$$||tests.sec('heard')||$$' and not x.deleted and not r.deleted and x.origin='ai' and not x.touched and r.kind='signal' and r.ref_id='$$||tests.id(651)||$$'$$),'1','The new sentence cites the aligned signal');

-- ---------- Sources and the signal rule ----------
set local role authenticated;
select tests.login(1);
select is((public.report_candidates(tests.id(100),tests.sec('heard'))->'candidates') @> '[{"kind":"signal"}]'::jsonb,true,'The aligned signal saved as a citation is a candidate source for What We Heard');
select is((select count(*)::integer from jsonb_array_elements(public.report_candidates(tests.id(100),tests.sec('heard'))->'candidates') c where c->>'kind'='signal' and (c->>'ref_id')::uuid in(tests.id(652),tests.id(653))),0,'but a divergent signal and an aligned one nobody saved are not');
create temp table own as select tests.own('heard') as id;
grant all on own to public;
select is(public.report_source_set(tests.id(100),(select id from own),'signal',tests.id(653),'The room splits',true)->>'status','not_a_source','A divergent signal cannot be added as a source');
select is(public.report_source_set(tests.id(100),(select id from own),'signal',tests.id(652),'x',true)->>'status','not_a_source','nor can an aligned one nobody saved');
select is(public.report_source_set(tests.id(100),(select id from own),'signal',tests.id(651),'What the room said about finding a group matches what the interviews said.',true)->>'status','ok','The saved aligned signal can be');
select is(public.report_source_set(tests.id(100),(select id from own),'signal',tests.id(651),'What the room said about finding a group matches what the interviews said.',true)->>'status','unchanged','once');
select is(public.report_source_set(tests.id(100),(select id from own),'signal',tests.id(651),'',false)->>'status','ok','A source can be taken off');
select is(public.report_source_set(tests.id(100),(select id from own),'signal',tests.id(651),'',false)->>'status','not_found','once');
select is(public.report_source_set(tests.id(100),(select id from own),'theme',tests.id(621),'not a record the section reads',true)->>'status','ok','A record the section reads can be added, whatever excerpt is sent: the database uses its own') ;
select is(public.report_source_set(tests.id(100),(select id from own),'theme',tests.id(699),'x',true)->>'status','not_a_source','but a record the section does not read cannot');
reset role;
select throws_ok($$insert into private.report_sources(engagement_id,sentence_id,kind,ref_id,excerpt) values(tests.id(100),tests.own('heard'),'signal',tests.id(653),'x')$$,'23514',null,'Whoever writes the row, a divergent signal is refused by the database');
select throws_ok($$insert into private.report_sources(engagement_id,sentence_id,kind,ref_id,excerpt) values(tests.id(100),tests.own('heard'),'signal',tests.id(652),'x')$$,'23514',null,'and so is an aligned signal that was not saved as a citation');
select throws_ok($$insert into private.report_sources(engagement_id,sentence_id,kind,ref_id,excerpt) values(tests.id(100),tests.own('heard'),'theme',null,'x')$$,'23514',null,'and a source with no record behind it, unless it is a record line');

-- ---------- Review and sign-off ----------
set local role authenticated;
select tests.login(1);
select is(public.report_sign_off(tests.id(100),tests.id(600))->>'status','not_reviewed','Sign-off waits until every section is reviewed');
select is(public.report_mark_reviewed(tests.id(100),tests.sec('church_today'),true)->>'status','ok','The lead marks a section reviewed');
select is(public.report_mark_reviewed(tests.id(100),tests.sec('church_today'),true)->>'status','unchanged','once');
select is(public.report_mark_reviewed(tests.id(100),tests.sec('church_today'),false)->>'status','ok','and can take it back');
select is(tests.status('church_today'),'edited','which leaves the section Edited, to be reviewed again');
select is(public.report_mark_reviewed(tests.id(100),tests.sec('church_today'),true)->>'status','ok','Reviewed again');
select is(public.report_edit(tests.id(100),tests.sent('church_today',1),'31% of respondents named a clear way into groups, first.')->>'status','ok','Editing a reviewed section');
select is(tests.status('church_today'),'edited','takes its review away');
select is(public.report_mark_reviewed(tests.id(100),tests.sec('church_today'),true)->>'status','ok','Reviewed once more');
select is(public.report_mark_reviewed(tests.id(100),tests.sec('process'),true)->>'status','not_ready','A section that needs attention and holds nothing cannot be reviewed');
select is(public.report_add(tests.id(100),tests.sec('process'),'The retreat ran over two days, and the team prayed before they planned.')->>'status','ok','until the facilitator writes something in it');
select is(public.report_mark_reviewed(tests.id(100),tests.sec('process'),true)->>'status','ok','Then it can be reviewed');
do $$ declare k text; begin
 foreach k in array tests.keys() loop
  perform public.report_mark_reviewed('ae070000-0000-4000-8000-000000000100',tests.sec(k),true);
 end loop; end $$;
select is((select count(*)::integer from jsonb_array_elements(public.report_state(tests.id(100))->'sections') s where s->>'status'='reviewed'),14,'Every section can be reviewed, including the thin ones');
select tests.login(2);
select is(public.report_sign_off(tests.id(100),tests.id(601))->>'status','lead_only','A co-facilitator cannot sign off');
select tests.login(1);
select is(public.report_sign_off(tests.id(100),null)->>'status','invalid_request','A sign-off with no id is refused');

-- Sign-off is refused while a sentence that is not the facilitator's own has no source.
select is(public.report_source_set(tests.id(100),tests.sent('church_today',1),'finding',tests.id(601),'',false)->>'status','ok','An AI sentence loses its only source');
select is(public.report_mark_reviewed(tests.id(100),tests.sec('church_today'),true)->>'status','ok','and its section is reviewed again');
select is(public.report_sign_off(tests.id(100),tests.id(602))->>'status','unsourced','Sign-off is refused with an unsourced AI sentence');
select is(public.report_sign_off(tests.id(100),tests.id(602))->>'count','1','and says how many');
select is((select (e->>'needs_source')::boolean from jsonb_array_elements((public.report_state(tests.id(100))->'sections')) s, jsonb_array_elements(s->'sentences') e where e->>'id'=tests.sent('church_today',1)::text),true,'The page is told which sentence it is');
select is(public.report_source_set(tests.id(100),tests.sent('church_today',1),'finding',tests.id(601),'A clear way into groups: 31%',true)->>'status','ok','Adding a source back');
select is(public.report_mark_reviewed(tests.id(100),tests.sec('church_today'),true)->>'status','ok','and reviewing the section again');
reset role;
-- A signal that is no longer saved as a citation stops counting as a source.
select is(tests.val($$select count(*)::text from private.report_sentences x where x.engagement_id='$$||tests.id(100)||$$' and not x.deleted and x.origin<>'facilitator' and not private.rp_sentence_sourced(x.id)$$),'0','Every sentence that is not the facilitator''s own has a source');
update private.signals set saved_as_citation_at=null where id=tests.id(651);
update private.signals set saved_as_citation_at='2026-11-03 16:00:00+00' where id=tests.id(651);
set local role authenticated;
select tests.login(1);
select is(public.report_sign_off(tests.id(100),tests.id(603))->>'status','ok','With every section reviewed and every sentence sourced, the lead signs off');
select is(public.report_sign_off(tests.id(100),tests.id(603))->>'status','duplicate','the same press again is a duplicate');
select is(public.report_sign_off(tests.id(100),tests.id(604))->>'status','unchanged','and another press with nothing changed makes no new version');
select is((public.report_state(tests.id(100))->'signed'->>'n'),'1','The state says version 1 is signed');
select is((public.report_state(tests.id(100))->'signed'->>'stale'),'false','and that it has not changed since');
reset role;
select is((select jsonb_array_length(snapshot->'sections') from private.report_sign_offs where engagement_id=tests.id(100) and n=1),14,'The sign-off keeps all fourteen sections as text');
select ok((select snapshot::text like '%The retreat ran over two days%' from private.report_sign_offs where engagement_id=tests.id(100) and n=1),'with their words');
select ok((select snapshot->'sections'->3->'sentences'->0 ? 'sources' from private.report_sign_offs where engagement_id=tests.id(100) and n=1),'and the sources behind each sentence');
set local role service_role;
select is((private.report_signed_for_view(tests.id(100))->>'n'),'1','The service role reads the newest signed version');
select is((select count(*)::integer from jsonb_array_elements(private.report_signed_for_view(tests.id(100))->'sections') s, jsonb_array_elements(s->'sentences') e where e ? 'sources'),0,'with the sources stripped out');
select is((select count(*)::integer from jsonb_array_elements(private.report_signed_for_view(tests.id(100))->'sections') s, jsonb_array_elements(s->'sentences') e where e::text ~* '(Jordan|Michael|Parker|Reed)'),0,'and no speaker anywhere');
reset role;
set local role authenticated;
select tests.login(1);
select is(public.report_edit(tests.id(100),tests.sent('heard',1),'Changed after it was signed.')->>'status','ok','Editing after sign-off is allowed');
select is((public.report_state(tests.id(100))->'signed'->>'stale'),'true','and the state says the report has changed since it was signed');
select is(public.report_sign_off(tests.id(100),tests.id(605))->>'status','not_reviewed','A changed section has to be reviewed again before the next sign-off');
select is(public.report_mark_reviewed(tests.id(100),tests.sec('heard'),true)->>'status','ok','Reviewed again');
select is(public.report_sign_off(tests.id(100),tests.id(605))->>'status','ok','The next sign-off is version 2');
select is((public.report_state(tests.id(100))->'signed'->>'n'),'2','and the state says so');
reset role;
select is((select count(*)::integer from private.report_sign_offs where engagement_id=tests.id(100) and not deleted),2,'Version 1 is kept as it was signed');
select ok((select snapshot::text like '%The retreat ran over two days%' from private.report_sign_offs where engagement_id=tests.id(100) and n=1) and not (select snapshot::text like '%Changed after it was signed.%' from private.report_sign_offs where engagement_id=tests.id(100) and n=1),'and does not change when the report does');

-- ---------- A closed engagement ----------
update engagements set status='closed' where id=tests.id(100);
set local role authenticated;
select tests.login(1);
select is(public.report_edit(tests.id(100),tests.sent('heard',1),'Too late.')->>'status','closed','A closed engagement''s report cannot change');
select is(public.report_state(tests.id(100))->>'status','ok','but can still be read');
reset role;
update engagements set status='retreat' where id=tests.id(100);

-- ---------- The practice room and Clear test answers ----------
insert into engagements(id,church_id,title,type) values('90000000-0000-4000-8000-000000000010',tests.id(200),'Permanent practice','practice');
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values('90000000-0000-4000-8000-000000000010',tests.id(701),'lead');
set local role authenticated;
select tests.login(1);
select is(public.report_start('90000000-0000-4000-8000-000000000010',tests.id(700),'all',null,false)->>'status','ai_off','A draft started in the practice room before any rehearsal');
select is(public.rehearsal_control('90000000-0000-4000-8000-000000000010',tests.id(851),'start')->>'status','ok','The rehearsal starts');
reset role;
update engagements set settings=settings||'{"ai_enabled":true}' where id='90000000-0000-4000-8000-000000000010';
insert into private.report_sign_offs(engagement_id,n,snapshot) values('90000000-0000-4000-8000-000000000010',1,'{"sections":[]}');
select is((select test from private.report_sign_offs where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted),true,'A sign-off made in a rehearsal is a test');
select is((select test from private.report_drafts where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted),false,'and the draft made before it is not');
set local role authenticated;
select tests.login(1);
select is(public.rehearsal_control('90000000-0000-4000-8000-000000000010',tests.id(852),'end')->>'status','ok','The rehearsal ends');
select is(public.rehearsal_control('90000000-0000-4000-8000-000000000010',tests.id(853),'clear')->>'status','ok','Clear test answers runs');
reset role;
select is((select count(*)::integer from private.report_sign_offs where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted),0,'It puts away the test sign-off');
select is((select count(*)::integer from private.report_drafts where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted),1,'and keeps the draft made before the rehearsal');
select is((select count(*)::integer from private.report_drafts where engagement_id=tests.id(100) and not deleted),1,'and touches no other engagement');
insert into attendees(id,engagement_id,name,email,room_role) values(tests.id(530),'90000000-0000-4000-8000-000000000010','Practice person','practice530@example.org','participant');
insert into sessions(id,engagement_id,title,part,position,state,interaction,prompt) values(tests.id(330),'90000000-0000-4000-8000-000000000010','Practice step','Day 1',1,'closed','word_cloud','x');
insert into submissions(id,engagement_id,session_id,attendee_id,text,answers,phone_sent_at) values(tests.id(531),'90000000-0000-4000-8000-000000000010',tests.id(330),tests.id(530),'A practice answer','[]'::jsonb,now());
set local role authenticated;
select tests.login(1);
select is(public.reset_practice_room(),true,'The practice room resets');
reset role;
select is((select count(*)::integer from private.report_drafts where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted),0,'No report is left in the practice room');
select is((select count(*)::integer from private.report_sections where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted),0,'no section');
select is((select count(*)::integer from private.report_sentences where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted),0,'no sentence');
select is((select count(*)::integer from private.report_sources where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted),0,'no source');
select is((select count(*)::integer from private.report_drafts where engagement_id=tests.id(100) and not deleted),1,'The first engagement keeps its report');
select is((select count(*)::integer from private.report_sign_offs where engagement_id=tests.id(100) and not deleted),2,'and both its sign-offs');
select is((select count(*)::integer from public.submissions where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted),0,'and the base reset still runs: the practice room''s answer is put away');

select * from finish();
rollback;
