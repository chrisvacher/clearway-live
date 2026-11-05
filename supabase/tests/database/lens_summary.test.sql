begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('87610000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(1000+n))::text,true); end $$;
create function tests.live() returns uuid language sql security definer set search_path='' as $$ select live_session_id from public.room_states where engagement_id=tests.id(100) $$;
create function tests.results() returns jsonb language sql security definer set search_path='' as $$ select results from public.room_states where engagement_id=tests.id(100) $$;
create function tests.ctl(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$
 select public.room_control(tests.id(100),tests.id(n),action,jsonb_build_object('from',tests.live())||p) $$;
create function tests.ls(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$ select public.lens_summary_control(tests.id(100),tests.id(n),action,p) $$;
create function tests.send(n integer,session integer,text_ text,value jsonb default null,action text default 'submit',revision integer default 0) returns jsonb language sql as $$
 select public.live_submit(tests.id(100),tests.id(n),tests.id(session),revision,action,text_,now(),null,0,value) $$;
-- A phone answers the version on the screen now.
create function tests.vid(lens integer default 1) returns uuid language sql security definer set search_path='' as $$
 select current_version_id from private.lens_summaries where engagement_id=tests.id(100) and lens=$1::smallint and not deleted $$;
create function tests.answer(n integer,response text,text_ text default 'Approve',v uuid default null) returns jsonb language sql as $$
 select tests.send(n,450,text_,jsonb_build_object('version',coalesce(v,tests.vid()),'response',response)) $$;
create function tests.sm(lens integer default 1) returns private.lens_summaries language sql security definer set search_path='' as $$
 select * from private.lens_summaries where engagement_id=tests.id(100) and lens=$1::smallint and not deleted $$;
create function tests.lines(v uuid) returns text[] language sql security definer set search_path='' as $$
 select array_agg(text order by position) from private.lens_summary_sentences where version_id=v and not deleted $$;
create function tests.versions(lens integer default 1) returns integer language sql security definer set search_path='' as $$
 select count(*)::integer from private.lens_summary_versions v join private.lens_summaries s on s.id=v.summary_id where s.engagement_id=tests.id(100) and s.lens=$1::smallint and not v.deleted $$;
-- Make the last suggestion old enough for AI to fold (the quiet seconds).
create function tests.quiet() returns void language plpgsql security definer set search_path='' as $$
begin
 alter table public.submissions disable trigger touch_record;
 update public.submissions set updated_at=updated_at-interval '10 seconds' where engagement_id=tests.id(100);
 alter table public.submissions enable trigger touch_record;
end $$;
-- Everything in this file runs in one transaction, so stamp times by hand where the order or the age matters.
create function tests.stamp(n integer,shift interval) returns void language plpgsql security definer set search_path='' as $$
begin
 alter table public.submissions disable trigger touch_record;
 update public.submissions set updated_at=clock_timestamp()+shift where id=tests.id(n);
 alter table public.submissions enable trigger touch_record;
end $$;
create function tests.fresh() returns void language plpgsql security definer set search_path='' as $$
begin
 alter table public.submissions disable trigger touch_record;
 update public.submissions set updated_at=clock_timestamp() where engagement_id=tests.id(100);
 alter table public.submissions enable trigger touch_record;
end $$;
-- Rebuild the room's results, as any later answer would.
create function tests.results_now() returns void language sql security definer set search_path='' as $$
 update public.room_states set results=private.live_results(engagement_id) where engagement_id=tests.id(100) $$;
create table tests.claims(name text primary key,j jsonb);
create function tests.claim(p_name text,session integer,lease integer) returns jsonb language plpgsql as $$
declare j jsonb;
begin
 j:=public.ai_claim(tests.id(session),tests.id(lease),'claude-test-model','{"combine_words":"combine-words@1","group_wall":"group-wall@1","summarize_wall":"summarize-wall@1","fold_questions":"fold-questions@1","group_lens":"group-lens@1","merge_reasons":"merge-reasons@1","draft_lens_summary":"draft-lens-summary@1","fold_lens_summary":"fold-lens-summary@1"}');
 insert into tests.claims(name,j) values(p_name,j) on conflict(name) do update set j=excluded.j;
 return j;
end $$;
create function tests.c(name text) returns jsonb language sql as $$ select j from tests.claims where claims.name=c.name $$;
create function tests.ref(name text,list text,t text) returns text language sql as $$
 select x->>'ref' from jsonb_array_elements(tests.c(name)->'inputs'->list) x where x->>'text'=t limit 1 $$;
create function tests.apply(name text,lease integer,output jsonb) returns jsonb language sql as $$
 select public.ai_apply((tests.c(name)->>'run')::uuid,tests.id(lease),output,'{"input_tokens":1200,"output_tokens":80,"cost_usd":0.0016,"ms":900}') $$;
grant all on tests.claims to authenticated,anon,service_role;
grant execute on all functions in schema tests to authenticated,anon,service_role;

insert into churches(id,name,timezone) values(tests.id(200),'Riverside Church','America/Toronto');
insert into engagements(id,church_id,title,base_year,settings) values(tests.id(100),tests.id(200),'Summary room',2026,'{"ai_enabled":true}');
update engagements set lens_names=array['Our people','Our neighbours','Our leaders','Our rhythms','Our learning'] where id=tests.id(100);
insert into auth.users(id,email,email_confirmed_at)
select tests.id(n),case when n=1 then 'fac1@clearway.co' else 'person'||n||'@example.org' end,now() from generate_series(1,7)n;
insert into auth.sessions(id,user_id) select tests.id(1000+n),tests.id(n) from generate_series(1,7)n;
insert into auth.identities(user_id,provider,provider_id,identity_data) select id,'google',id::text,jsonb_build_object('email',email,'email_verified',true) from auth.users where id=tests.id(1);
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method) values(gen_random_uuid(),tests.id(1001),now(),now(),'oauth');
insert into clearway_users(id,auth_user_id,name,email,is_admin,team_hub_team_member_id) values(tests.id(701),tests.id(1),'Chris Vacher','fac1@clearway.co',false,tests.id(801));
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values(tests.id(100),tests.id(701),'lead');
insert into attendees(id,engagement_id,auth_user_id,name,email,verified_at,room_role) values
 (tests.id(503),tests.id(100),tests.id(3),'Priya Shah','person3@example.org',now(),'participant'),
 (tests.id(505),tests.id(100),tests.id(5),'Ben Ortiz','person5@example.org',now(),'participant'),
 (tests.id(506),tests.id(100),tests.id(6),'Ruth Ade','person6@example.org',now(),'participant'),
 (tests.id(507),tests.id(100),tests.id(7),'Sam Lee','person7@example.org',now(),'participant');
insert into device_sessions(engagement_id,attendee_id,auth_session_id) values(tests.id(100),tests.id(503),tests.id(1003)),(tests.id(100),tests.id(505),tests.id(1005)),
 (tests.id(100),tests.id(506),tests.id(1006)),(tests.id(100),tests.id(507),tests.id(1007));
insert into sessions(id,engagement_id,title,part,position,interaction,prompt,state,max_sends,max_characters,max_words,mode,options) values
 (tests.id(410),tests.id(100),'Lens 1','Day 1',1,'lens','In {base year + 10}, our people ...','closed',8,200,50,'live','{"lens":1}'),
 (tests.id(411),tests.id(100),'Lens 2','Day 1',2,'lens','In {base year + 10}, our neighbours ...','closed',8,200,50,'live','{"lens":2}'),
 (tests.id(450),tests.id(100),'Sign off the 10-year Future','Day 1',9,'lens_summary','The 10-year Future, one lens at a time','ready',1,140,50,'live','{"lens":1}');
-- The Five Lenses exercise has run: lens 1 and lens 2 are open with their sentences; lens 3 has one and is not open.
insert into private.lens_openings(engagement_id,lens,session_id) values(tests.id(100),1,tests.id(410)),(tests.id(100),2,tests.id(411));
insert into private.lens_sentences(id,engagement_id,lens,source,text,session_id) values
 (tests.id(601),tests.id(100),1,'live','Zebrafish we eat together every week',tests.id(410)),
 (tests.id(602),tests.id(100),1,'live','Zebrafish we send people into the neighbourhood',tests.id(410)),
 (tests.id(603),tests.id(100),1,'live','Zebrafish people of every age lead',tests.id(410)),
 (tests.id(604),tests.id(100),1,'live','Zebrafish we pray before we plan',tests.id(410)),
 (tests.id(611),tests.id(100),2,'live','Quokka our street knows us by name',tests.id(411)),
 (tests.id(612),tests.id(100),2,'live','Quokka we run the community supper',tests.id(411)),
 (tests.id(621),tests.id(100),3,'live','Narwhal one lonely leader sentence',null);

-- ---------- The kind ----------
select is((select input and one_per_person and not shares_answers and spotlight='none' and counts='people' and named='never' from private.interaction_kinds where kind='lens_summary'),true,'The lens summary kind is registered: one answer per person, answers never shared, nothing to spotlight');
select ok(private.kind_function('parse','lens_summary','public.sessions,text,jsonb') is not null and private.kind_function('results','lens_summary','uuid,uuid,text[]') is not null
 and private.kind_function('options','lens_summary','jsonb,uuid') is not null and private.kind_function('items','lens_summary','uuid,text[]') is not null,'It has its own parse, results, options and items functions');
select ok((select bool_and(not has_function_privilege('anon',p.oid,'execute') and not has_function_privilege('authenticated',p.oid,'execute')) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.proname in('ls_lens','ls_ensure','ls_diff','ls_changes','ls_new_version','ls_copy','ls_inputs','options_lens_summary','parse_lens_summary','ls_mirror','ls_on_air',
  'results_lens_summary','items_lens_summary','ls_label','ls_line_problem','ai_claim','ai_apply','ai_fail','ai_claim_base2','ai_apply_base2','ai_fail_base2')),'No browser role can call the internal functions or the AI worker''s');
select ok(has_function_privilege('service_role','private.ai_claim(uuid,uuid,text,jsonb)','execute') and has_function_privilege('service_role','private.ai_apply(uuid,uuid,jsonb,jsonb)','execute')
 and has_function_privilege('service_role','private.ai_fail(uuid,uuid,text,jsonb)','execute'),'The server still runs claim, apply and fail');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and (p.proname like 'ls\_%' or p.proname like '%lens_summary%') and p.prosecdef
 and not coalesce(p.proconfig,array[]::text[]) @> array['search_path=""']),0,'Every private lens summary function pins its search path');
select ok(not has_function_privilege('anon','public.lens_summary_state(uuid)','execute') and not has_function_privilege('anon','public.lens_summary_control(uuid,uuid,text,jsonb)','execute')
 and not has_function_privilege('anon','public.lens_summary_sources(uuid,uuid)','execute'),'A signed-out browser calls none of the three entry points');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='private.lens_summary_locks'::regclass),'The lock table has forced row-level security');
select ok(not has_table_privilege('authenticated','private.lens_summary_locks','select'),'and no browser role reads it');
select ok((select conname from pg_constraint where conname='ai_runs_job_check') is not null
 and pg_get_constraintdef((select oid from pg_constraint where conname='ai_runs_job_check')) ~ 'combine_words' and pg_get_constraintdef((select oid from pg_constraint where conname='ai_runs_job_check')) ~ 'overnight_draft'
 and pg_get_constraintdef((select oid from pg_constraint where conname='ai_runs_job_check')) ~ 'merge_reasons' and pg_get_constraintdef((select oid from pg_constraint where conname='ai_runs_job_check')) ~ 'group_lens'
 and pg_get_constraintdef((select oid from pg_constraint where conname='ai_runs_job_check')) ~ 'draft_lens_summary' and pg_get_constraintdef((select oid from pg_constraint where conname='ai_runs_job_check')) ~ 'fold_lens_summary'
 and pg_get_constraintdef((select oid from pg_constraint where conname='ai_runs_job_check')) ~ 'propose_candidates','After every migration the job list keeps every earlier job, the two lens summary jobs and propose_candidates');
select ok((select count(*) from pg_constraint where conname='ai_runs_session_check')=1,'and the overnight session check stays');

-- ---------- Options ----------
select is(private.options_lens_summary('{}'::jsonb,tests.id(100)),'{}'::jsonb,'A lens summary step needs no settings');
select is(private.options_lens_summary('{"lens":3}'::jsonb,tests.id(100)),'{"lens":3}'::jsonb,'It may name the lens it starts on');
select is(private.options_lens_summary('{"lens":6}'::jsonb,tests.id(100)),null,'There are five lenses');
select is(private.options_lens_summary('{"lens":1,"extra":true}'::jsonb,tests.id(100)),null,'Unknown settings are refused');
select is(private.options_lens_summary('{"ai":false}'::jsonb,tests.id(100)),'{"ai":false}'::jsonb,'and AI may be turned off');

-- ---------- Before it is on the TV ----------
select is(private.ai_on(tests.id(450)),true,'AI is on for a lens summary step');
select is(tests.claim('early',450,901)->>'status','off','but not before the step is live');
select is(private.results_lens_summary(tests.id(100),tests.id(450),array[]::text[])->'summary','null'::jsonb,'There is no summary to show');
set local role authenticated;
select tests.login(1);
select is(public.lens_summary_state(tests.id(100))->>'session',null,'The facilitator''s view has no step yet');
select is(tests.ls(1,'undo')->>'status','invalid_state','and no press works');
select is(tests.ctl(1,'go_live',jsonb_build_object('session',tests.id(450)))->>'status','ok','The step goes live');
reset role;
select is(tests.results()->>'lens','1','The room starts on lens 1');
select is(tests.results()->>'lens_name','Our people','named by the engagement');
select is(tests.results()->'summary','null'::jsonb,'with no summary yet');
select is(tests.results()->>'ai_state','idle','and AI idle');

-- ---------- AI drafts lens 1 ----------
select is(tests.claim('draft',450,911)->>'job','draft_lens_summary','AI claims the draft of the current lens');
select is(tests.c('draft')->'inputs'->>'lens','1','for lens 1');
select is(tests.c('draft')->'inputs'->>'lens_name','Our people','named from the engagement');
select is(tests.c('draft')->'inputs'->>'year','2036','for the 10-year Future');
select is(jsonb_array_length(tests.c('draft')->'inputs'->'sentences'),4,'from its four sentences');
select ok(position('Narwhal' in tests.c('draft')::text)=0 and position('Quokka' in tests.c('draft')::text)=0,'and none from another lens');
select ok(position('Priya' in tests.c('draft')::text)=0 and position('person3' in tests.c('draft')::text)=0,'with no name or email');
select is(tests.c('draft')->>'prompt_version','draft-lens-summary@1','The run records the prompt version');
select is(tests.results()->>'ai_state','drafting','The room is told AI is drafting');
select is(tests.claim('busy',450,912)->>'status','busy','A second claim waits');
select is(tests.apply('draft',911,jsonb_build_object('note','Drafted from the room''s four sentences','sentences',jsonb_build_array(
 jsonb_build_object('text','We eat together every week and we pray before we plan.','sources',jsonb_build_array(tests.ref('draft','sentences','Zebrafish we eat together every week'),tests.ref('draft','sentences','Zebrafish we pray before we plan'))),
 jsonb_build_object('text','People of every age lead.','sources',jsonb_build_array(tests.ref('draft','sentences','Zebrafish people of every age lead'))),
 jsonb_build_object('text','We will send people into the neighbourhood.','sources',jsonb_build_array(tests.ref('draft','sentences','Zebrafish we send people into the neighbourhood'))),
 jsonb_build_object('text','Our neighbours say "this church sees us".','sources',jsonb_build_array(tests.ref('draft','sentences','Zebrafish we send people into the neighbourhood'))),
 jsonb_build_object('text','We send people into the neighbourhood.','sources','[]'::jsonb),
 jsonb_build_object('text','We run 40 suppers a year.','sources',jsonb_build_array(tests.ref('draft','sentences','Zebrafish we send people into the neighbourhood'))))))->>'applied','1',
 'The draft is applied as one version');
select is((select jsonb_agg(r->>'reason' order by r->>'reason') from jsonb_array_elements(((select output from private.ai_runs where id=(tests.c('draft')->>'run')::uuid))->'refused') r),
 '["future","no_source","number","quote"]'::jsonb,'Code drops the future tense, the quote, the line with no source and the invented number');
select is(tests.versions(),1,'Version 1 exists');
select is(((select author from private.lens_summary_versions where id=tests.vid())),'ai','written by AI');
select ok((select shown_at is not null from private.lens_summary_versions where id=tests.vid()),'and shown, since the room is on lens 1');
select is(tests.lines(tests.vid()),array['We eat together every week and we pray before we plan.','People of every age lead.'],'with the two clean lines');
select is((select count(*)::integer from private.lens_summary_sources s join private.lens_summary_sentences ss on ss.id=s.summary_sentence_id where ss.version_id=tests.vid() and not s.deleted),3,'Each line is linked to its source sentences');
select is(tests.results()->'summary'->>'version','1','The room shows version 1');
select is(tests.results()->'summary'->>'author','ai','marked as AI');
select is(jsonb_array_length(tests.results()->'summary'->'sentences'),2,'with both lines');
select is((tests.results()->'summary'->>'fit')::integer,2,'which fit one TV screen');
select is(tests.results()->>'ai_state','idle','and AI is idle again');
select is(tests.results()->'summary'->>'note','Drafted from the room''s four sentences','The note travels with it');
select ok(position('Zebrafish' in tests.results()::text)=0,'No source sentence is in the room''s results');
select ok(position('sources' in tests.results()::text)=0,'and no source link');
select ok(position('Priya' in tests.results()::text)=0 and position(tests.id(503)::text in tests.results()::text)=0,'No name or attendee id either');

-- ---------- Next lens is drafted ahead and stays hidden ----------
select is(tests.claim('ahead',450,913)->>'job','draft_lens_summary','AI drafts the next opened lens ahead');
select is(tests.c('ahead')->'inputs'->>'lens','2','lens 2');
select is(tests.apply('ahead',913,jsonb_build_object('sentences',jsonb_build_array(
 jsonb_build_object('text','Our street knows us by name.','sources',jsonb_build_array(tests.ref('ahead','sentences','Quokka our street knows us by name'))))))->>'applied','1','and applies it');
select is((select shown_at from private.lens_summary_versions where id=tests.vid(2)),null,'Lens 2''s version is not shown');
select ok(position('street knows' in tests.results()::text)=0,'and nothing about it is in the room''s results');
select is(tests.claim('idle',450,914)->>'status','idle','Lens 3 is not open, so nothing is left to draft');

-- ---------- Role checks: nothing reaches a phone before it is shown ----------
set local role authenticated;
select tests.login(3);
select is((select count(*) from private.lens_summaries),0::bigint,'A participant reads no summary row directly');
select is((select count(*)::integer from private.lens_summary_versions),1,'sees only the version that has been shown');
select is((select count(*)::integer from private.lens_summary_sentences),2,'and only its lines');
select ok(not exists(select 1 from private.lens_summary_sentences where text like '%street knows%'),'never lens 2''s line');
select is((select count(*) from private.lens_summary_sources),0::bigint,'Sources are not readable by table');
select is(public.lens_summary_sources(tests.id(100),tests.id(450))->>'status','ok','but the phone asks for them through its own function');
select is(jsonb_array_length(public.lens_summary_sources(tests.id(100),tests.id(450))->'sentences'->0->'sources'),2,'two sources under the first line');
select ok(position('street knows' in public.lens_summary_sources(tests.id(100),tests.id(450))::text)=0,'and none from the unshown version');
select ok(position('Priya' in public.lens_summary_sources(tests.id(100),tests.id(450))::text)=0,'with no name');
select is(public.lens_summary_state(tests.id(100))->>'status','denied','A participant cannot read the facilitator''s view');
select is(tests.ls(3,'undo')->>'status','denied','or press its controls');
select is(public.lens_summary_sources(tests.id(100),tests.id(411))->>'status','missing','Sources for another step are refused');
reset role;
set local role authenticated;
select tests.login(1);
select is(public.lens_summary_sources(tests.id(100),tests.id(450))->>'status','denied','The facilitator''s account is not a phone: no sources by that function');
select is(public.lens_summary_state(tests.id(100))->>'status','ok','The facilitator reads the state');
select is(public.lens_summary_state(tests.id(100))->'summary'->'sentences'->0->'sources'->0->>'text' like 'Zebrafish%',true,'with each line''s sources');
select is(jsonb_array_length(public.lens_summary_state(tests.id(100))->'summary'->'versions'),1,'and its versions');
select is(public.lens_summary_state(tests.id(100))->'lenses'->1->>'drafted','true','and which other lens is drafted ahead');
select is(public.lens_summary_state(tests.id(100))->'ai'->>'state','idle','and what AI is doing');
reset role;

-- ---------- Phones: Approve or Suggest a change ----------
set local role authenticated;
select tests.login(3);
select is(tests.answer(1,'approve')->>'status','accepted','A person approves');
select tests.login(7);
select is(tests.answer(2,'approve')->>'status','accepted','another approves');
select tests.login(5);
select is(tests.answer(3,'suggest','Add that we tell our stories out loud')->>'status','accepted','A person suggests a change');
select is(tests.answer(4,'suggest','x',tests.id(999))->>'status','stale','A phone a version behind is told so');
select is(tests.answer(5,'suggest',repeat('a',141))->>'status','limit','A suggestion is at most 140 characters');
select is(tests.answer(6,'suggest','shit happens')->>'status','filtered','and goes through the word filter');
select is(tests.answer(7,'suggest','   ')->>'status','invalid_answer','and cannot be empty');
select is(tests.send(8,450,'x',jsonb_build_object('version',tests.vid(),'response','approve','extra',1))->>'status','invalid_answer','Extra fields are refused');
select is(tests.send(9,450,'x',jsonb_build_object('version',tests.vid(),'response','maybe'))->>'status','invalid_answer','as is any other response');
select tests.login(6);
select is(tests.answer(10,'suggest','Say something about the young families')->>'status','accepted','A fourth person suggests');
reset role;
select is(tests.results()->'tally','{"approve":2,"suggest":2}'::jsonb,'The tally counts two and two');
select is((tests.results()->>'people')::integer,4,'from four people');
select is(jsonb_array_length(tests.results()->'suggestions'),2,'with two suggestion cards');
select ok(not exists(select 1 from jsonb_array_elements(tests.results()->'suggestions') s where (select count(*) from jsonb_object_keys(s))<>2),'each is just a tag and words');
select ok(position('Priya' in tests.results()::text)=0 and position('Ben' in tests.results()::text)=0 and position('Ruth' in tests.results()::text)=0 and position('Sam' in tests.results()::text)=0,'No name on the TV payload');
select ok(position(tests.id(505)::text in tests.results()::text)=0 and position(tests.id(3)::text in tests.results()::text)=0,'and no attendee id');
select ok(position('tell our stories' in tests.results()::text)>0,'A suggestion''s words appear');
select ok(position('tell our stories' in coalesce((select jsonb_agg(m.payload)::text from realtime.messages m where m.topic like 'live:'||tests.id(100)||':%' and m.payload ? 'answer' and m.payload->'answer'->>'text' is not null),''))=0,'but never as a broadcast answer');
select is((select count(*)::integer from private.lens_summary_responses where version_id=tests.vid() and not deleted),4,'The records hold four responses to version 1');
select is((select count(*)::integer from private.lens_summary_responses where version_id=tests.vid() and response='suggest' and suggestion like 'Add that%'),1,'with the suggestion');
set local role authenticated;
select tests.login(3);
select is((select count(*)::integer from private.lens_summary_responses),1,'A person reads only their own response from the table');
select tests.login(7);
select is(tests.answer(11,'suggest','Name what we will stop doing')->>'status','accepted','A person changes from approve to suggest');
reset role;
select is(tests.results()->'tally','{"approve":1,"suggest":3}'::jsonb,'The tally follows the change');
select is((select count(*)::integer from private.lens_summary_responses where version_id=tests.vid() and attendee_id=tests.id(507) and not deleted),1,'and the person''s response stands once');
select tests.stamp(11,interval '5 seconds');
select tests.results_now();
select is(jsonb_array_length(tests.results()->'suggestions'),3,'Three cards, newest first');
select is(tests.results()->'suggestions'->0->>'text','Name what we will stop doing','newest first');

-- ---------- AI folds the suggestions ----------
select tests.fresh();
select is(tests.claim('wait',450,921)->>'status','wait','AI waits while suggestions are still arriving');
select ok((tests.c('wait')->>'ms')::integer between 100 and 3000,'for up to three seconds');
select tests.quiet();
select is(tests.claim('fold',450,922)->>'job','fold_lens_summary','Once they are quiet AI folds them in');
select is(tests.results()->>'ai_state','folding','and the room is told');
select is(jsonb_array_length(tests.c('fold')->'inputs'->'suggestions'),3,'It reads the three suggestions');
select is(jsonb_array_length(tests.c('fold')->'inputs'->'summary'),2,'and the two lines on the screen');
select ok(position('Priya' in tests.c('fold')::text)=0 and position('person' in tests.c('fold')::text)=0,'with no names');
select is(tests.c('fold')->>'prompt_version','fold-lens-summary@1','Prompt version recorded');
select is(tests.apply('fold',922,jsonb_build_object('note','Added the stories line and the stopping line','sentences',jsonb_build_array(
 jsonb_build_object('keep',tests.ref('fold','summary','We eat together every week and we pray before we plan.')),
 jsonb_build_object('edit',tests.ref('fold','summary','People of every age lead.'),'text','People of every age lead, and we tell our stories out loud.','suggestions',jsonb_build_array(tests.ref('fold','suggestions','Add that we tell our stories out loud'))),
 jsonb_build_object('text','We name what we stop doing.','suggestions',jsonb_build_array(tests.ref('fold','suggestions','Name what we will stop doing'))))))->>'changed','true','The fold is applied');
select is(tests.versions(),2,'as version 2');
select is(((select author||':'||tracked::text from private.lens_summary_versions where id=tests.vid())),'ai:true','by AI, as tracked changes');
select is(tests.lines(tests.vid()),array['We eat together every week and we pray before we plan.','People of every age lead, and we tell our stories out loud.','We name what we stop doing.'],'with the first line kept word for word');
select is(jsonb_array_length(tests.results()->'summary'->'changes'),2,'The room gets two changes');
select is(tests.results()->'summary'->'changes'->0->>'kind','edit','an edit');
select is(tests.results()->'summary'->'changes'->0->'parts','[{"k":"keep","t":"People of every age"},{"k":"del","t":"lead."},{"k":"ins","t":"lead, and we tell our stories out loud."}]'::jsonb,'with the words that went and the words that came in');
select is(tests.results()->'summary'->'changes'->1->>'kind','add','and an added line');
select is(tests.results()->'summary'->>'version','2','The room shows version 2');
select is(tests.results()->'tally','{"approve":0,"suggest":0}'::jsonb,'The tally starts again at zero');
select is(jsonb_array_length(tests.results()->'suggestions'),0,'with no cards');
select is((select count(*)::integer from private.lens_summary_responses where version_id=(select id from private.lens_summary_versions where summary_id=(tests.sm()).id and version=1) and not deleted),4,'Version 1 keeps its responses');
select is(tests.claim('quiet-again',450,923)->>'status','idle','Nothing is left to fold');

-- A fold may not slip in a change nobody asked for.
set local role authenticated;
select tests.login(3);
select is(tests.answer(12,'suggest','Make the first line shorter')->>'status','accepted','Another round of suggestions');
reset role;
select tests.quiet();
select is(tests.claim('fold2',450,924)->>'job','fold_lens_summary','AI folds again');
select is(tests.apply('fold2',924,jsonb_build_object('sentences',jsonb_build_array(
 jsonb_build_object('edit',tests.ref('fold2','summary','We eat together every week and we pray before we plan.'),'text','We eat and pray together.'),
 jsonb_build_object('keep',tests.ref('fold2','summary','People of every age lead, and we tell our stories out loud.')))))->>'changed','false','A change with no suggestion behind it is refused');
select ok((select (output->'refused')::text like '%no_suggestion%' from private.ai_runs where id=(tests.c('fold2')->>'run')::uuid),'for that reason');
select is(tests.lines(tests.vid()),array['We eat together every week and we pray before we plan.','People of every age lead, and we tell our stories out loud.','We name what we stop doing.'],'The lines are as they were, including the one the reply left out');
select is(tests.claim('fold2-again',450,925)->>'status','idle','The same suggestions are not tried twice');
set local role authenticated;
select tests.login(1);
select is(tests.ls(20,'fold_now')->>'status','ok','Fold in now asks for another go');
reset role;
select is(tests.claim('fold3',450,926)->>'job','fold_lens_summary','and AI takes it at once');
select is(tests.apply('fold3',926,jsonb_build_object('sentences',jsonb_build_array(
 jsonb_build_object('edit',tests.ref('fold3','summary','We eat together every week and we pray before we plan.'),'text','We eat together every week.','suggestions',jsonb_build_array(tests.ref('fold3','suggestions','Make the first line shorter'))),
 jsonb_build_object('keep',tests.ref('fold3','summary','People of every age lead, and we tell our stories out loud.')),
 jsonb_build_object('keep',tests.ref('fold3','summary','We name what we stop doing.'))),
 'remove','[]'::jsonb))->>'changed','true','A change with a suggestion behind it goes in');
select is(tests.versions(),3,'as version 3');
select is(tests.results()->'summary'->'changes'->0->'parts'->0,'{"k":"keep","t":"We eat together every"}'::jsonb,'The tracked change keeps the shared words');
select is(tests.results()->'summary'->'changes'->0->'parts'->1,'{"k":"del","t":"week and we pray before we plan."}'::jsonb,'and strikes what went');

-- ---------- The facilitator edits while it is live ----------
set local role authenticated;
select tests.login(1);
select is(tests.ls(30,'edit_start')->>'status','ok','The facilitator starts editing');
select is(tests.ls(31,'edit',jsonb_build_object('op','text','sentence',(select id from private.lens_summary_sentences where version_id=tests.vid() and position=2),'text','We name what we stop doing together.'))->>'status','ok','and changes a line');
reset role;
select is(tests.versions(),4,'That makes version 4, the facilitator''s own');
select is((select author from private.lens_summary_versions where id=tests.vid()),'facilitator','written by the facilitator');
select is((select tracked from private.lens_summary_versions where id=tests.vid()),false,'with no tracked change on the TV');
select is(tests.results()->'summary'->'sentences'->2->>'text','We name what we stop doing together.','The line is replaced in place');
select is(tests.results()->'tally','{"approve":0,"suggest":0}'::jsonb,'The tally starts again for the new version');
select is(tests.results()->>'ai_state','editing','AI is told to wait');
select is(tests.results()->>'typing',(select id::text from private.lens_summary_sentences where version_id=tests.vid() and position=2),'and the TV knows which line is being typed');
set local role authenticated;
select tests.login(1);
select is(tests.ls(32,'edit',jsonb_build_object('op','text','sentence',(select id from private.lens_summary_sentences where version_id=tests.vid() and position=2),'text','We name what we stop doing together, in Jesus'' name.'))->>'status','ok','A second batch');
reset role;
select is(tests.versions(),4,'changes that version in place');
select is(tests.results()->'summary'->'sentences'->2->>'text','We name what we stop doing together, in Jesus'' name.','and the TV shows it at once');
set local role authenticated;
select tests.login(1);
select is(tests.ls(33,'edit',jsonb_build_object('op','text','sentence',(select id from private.lens_summary_sentences where version_id=tests.vid() and position=0),'text','shit'))->>'status','filtered','The word filter holds for the facilitator too');
select is(tests.ls(34,'edit',jsonb_build_object('op','text','sentence',(select id from private.lens_summary_sentences where version_id=tests.vid() and position=0),'text',repeat('a',401)))->>'status','invalid_request','and so does the length');
select is(tests.ls(35,'edit',jsonb_build_object('op','add','text','We serve the whole city.'))->>'status','ok','A line is added');
select is(tests.ls(36,'edit',jsonb_build_object('op','remove','sentence',(select id from private.lens_summary_sentences where version_id=tests.vid() and position=3)))->>'status','ok','and removed again');
reset role;
select is(jsonb_array_length(tests.results()->'summary'->'sentences'),3,'The room holds three lines');
select is((select count(*)::integer from private.room_controls where engagement_id=tests.id(100) and action in('ls_edit','ls_edit_start')),0,'Edits are not logged one by one');
select is(tests.claim('locked',450,927)->>'status','idle','AI does nothing while the facilitator edits');
set local role authenticated;
select tests.login(1);
select is(tests.ls(37,'edit_done')->>'status','ok','The facilitator finishes');
reset role;
select is(tests.results()->>'ai_state','held','AI is held after a hand edit: the facilitator wrote the words');
select is((tests.sm()).draft_held,true,'A hand edit holds the draft: AI will not write over it');

-- ---------- Undo ----------
set local role authenticated;
select tests.login(1);
select is(tests.ls(40,'undo')->>'status','ok','The facilitator undoes their own version');
reset role;
select is(tests.results()->'summary'->>'version','3','Version 3 is back');
select is((select undone_at is not null from private.lens_summary_versions where summary_id=(tests.sm()).id and version=4),true,'Version 4 is kept, marked undone');
select is((tests.sm()).fold_held,true,'and AI folds nothing until the facilitator says');
select is(tests.versions(),4,'Every version is kept');
set local role authenticated;
select tests.login(1);
select is(tests.ls(41,'undo')->>'status','ok','Undo version 3 (an AI fold)');
reset role;
select is(tests.results()->'summary'->>'version','2','Version 2 is back');
select is((select undone_at is not null from private.ai_runs where id=(tests.c('fold3')->>'run')::uuid),true,'and the AI run is marked undone');
set local role authenticated;
select tests.login(1);
select is(tests.ls(42,'release')->>'status','ok','Release lets AI fold again');
select is(tests.ls(42,'release')->>'status','duplicate','A repeated press does nothing');
reset role;

-- ---------- Decide ----------
set local role authenticated;
select tests.login(3);
select is(tests.answer(13,'approve')->>'status','accepted','The room approves version 2');
select tests.login(5);
select is(tests.answer(14,'approve')->>'status','accepted','a second person too');
select tests.login(1);
select is(tests.ls(50,'decide',jsonb_build_object('decision','Signed off','reasons','Eight of eight heads nodded'))->>'status','ok','The facilitator marks the decision');
reset role;
select is((select state from private.lens_summaries where id=(tests.sm()).id),'signed_off','The lens is signed off');
select is((select signed_off_version_id from private.lens_summaries where id=(tests.sm()).id),tests.vid(),'on the version that was on the screen');
select is((select subject||':'||subject_label from private.decisions where id=tests.id(50)),'lens_summary:Our people lens summary','The decision records its subject');
select is((select counts from private.decisions where id=tests.id(50)),'{"total":2,"people":2}'::jsonb,'with the numbers on screen, which did not decide it');
select is((tests.sm()).decision_id,tests.id(50),'and is attached to the summary');
select is(tests.results()->'summary'->>'signed','true','The room shows it signed');
select is(tests.results()->'summary'->>'decision','Signed off','with the decision');
select is(tests.results()->'lenses'->0->>'state','signed','and the lens strip shows lens 1 signed');
set local role authenticated;
select tests.login(7);
select is(tests.answer(15,'approve')->>'status','stale','A phone answering after sign-off is told it is not open');
select tests.login(1);
select is(tests.ls(51,'edit',jsonb_build_object('op','add','text','Late line'))->>'status','invalid_state','Edits are shut after sign-off');
select is(tests.ls(52,'undo')->>'status','invalid_state','and so is undo');
select is(tests.ls(53,'decide')->>'status','decided','Deciding twice is refused');
reset role;
select is(tests.claim('after-sign',450,931)->>'status','idle','AI does no work on a signed-off lens');
set local role authenticated;
select tests.login(1);
select is(tests.ls(54,'undecide')->>'status','ok','The facilitator takes it back to the screen');
reset role;
select is((select state from private.lens_summaries where id=(tests.sm()).id),'on_screen','The lens is back on screen');
select is((tests.sm()).decision_id,null::uuid,'with no decision attached');
select is((select count(*)::integer from private.decisions where id=tests.id(50) and not deleted),1,'The decision stays on record');

-- ---------- The next lens ----------
set local role authenticated;
select tests.login(1);
select is(tests.ls(60,'show',jsonb_build_object('to','next'))->>'status','ok','The facilitator moves to lens 2');
reset role;
select is(tests.results()->>'lens','2','The room is on lens 2');
select is(tests.results()->'summary'->'sentences'->0->>'text','Our street knows us by name.','and shows what was drafted ahead');
select ok((select shown_at is not null from private.lens_summary_versions where id=tests.vid(2)),'which is shown from now on');
select is(tests.results()->'tally','{"approve":0,"suggest":0}'::jsonb,'with its own tally');
select is(tests.results()->'lenses'->1->>'state','now','The strip shows lens 2 now');
set local role authenticated;
select tests.login(1);
select is(tests.ls(61,'show',jsonb_build_object('to',9))->>'status','invalid_request','There is no lens 9');
select is(tests.ls(62,'show',jsonb_build_object('to',2))->>'status','unchanged','Moving to the lens already on does nothing');
select is(tests.ls(63,'show',jsonb_build_object('to',3))->>'status','ok','Lens 3 has no sentences and no summary');
reset role;
select is(tests.results()->'summary','null'::jsonb,'so nothing is shown');
-- AI off: the room still works.
set local role authenticated;
select tests.login(1);
select is(tests.ls(64,'ai_off')->>'status','ok','AI is turned off');
reset role;
select is(tests.results()->>'ai_state','off','The room says so');
select is(tests.claim('off',450,941)->>'status','off','and AI does no work');
set local role authenticated;
select tests.login(1);
select is(tests.ls(65,'edit',jsonb_build_object('op','add','text','Our leaders are many and they serve.'))->>'status','ok','The facilitator writes the first line by hand');
reset role;
select is(tests.results()->'summary'->>'author','facilitator','as version 1 of lens 3');
select is(tests.results()->'summary'->>'version','1','and is its version 1');
set local role authenticated;
select tests.login(3);
select is(tests.answer(16,'approve','Approve',tests.vid(3))->>'status','accepted','Phones still answer');
reset role;
select is(tests.results()->'tally','{"approve":1,"suggest":0}'::jsonb,'and the tally counts');
select is((tests.sm(3)).draft_held,true,'and lens 3''s draft is held too');

-- ---------- Names never reach a screen ----------
select ok(position('Priya' in coalesce((select jsonb_agg(m.payload->'state'->'results')::text from realtime.messages m where m.topic like 'live:'||tests.id(100)||':%'),''))=0
 and position('Ben Ortiz' in coalesce((select jsonb_agg(m.payload->'state'->'results')::text from realtime.messages m where m.topic like 'live:'||tests.id(100)||':%'),''))=0
 and position('person5' in coalesce((select jsonb_agg(m.payload->'state'->'results')::text from realtime.messages m where m.topic like 'live:'||tests.id(100)||':%'),''))=0,'No broadcast carried a name in the results');
select ok(position('Zebrafish' in coalesce((select jsonb_agg(m.payload)::text from realtime.messages m where m.topic like 'live:'||tests.id(100)||':%'),''))=0,'or a source sentence');

-- ---------- Reset also clears the overnight review and the summary tables ----------
insert into engagements(id,church_id,title,type) values('90000000-0000-4000-8000-000000000010',tests.id(200),'Permanent practice','practice');
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values('90000000-0000-4000-8000-000000000010',tests.id(701),'lead');
insert into private.vision_outcomes(id,engagement_id,title,status,position) values(tests.id(900),'90000000-0000-4000-8000-000000000010','Practice outcome','provisional',0);
insert into private.overnight_rounds(id,engagement_id) values(tests.id(901),'90000000-0000-4000-8000-000000000010');
insert into private.draft_outcomes(id,engagement_id,round_id,outcome_id,name,original_name) values(tests.id(902),'90000000-0000-4000-8000-000000000010',tests.id(901),tests.id(900),'Practice outcome','Practice outcome');
insert into private.draft_bullets(id,engagement_id,draft_outcome_id,text,origin) values(tests.id(903),'90000000-0000-4000-8000-000000000010',tests.id(902),'A practice bullet','written');
insert into private.draft_notes(id,engagement_id,draft_outcome_id,kind,text,source_kind,source_id) values(tests.id(904),'90000000-0000-4000-8000-000000000010',tests.id(902),'voice','A strong line','bullet',tests.id(903));
insert into private.draft_sources(id,engagement_id,draft_outcome_id,bullet_id,kind,ref_id) values(tests.id(905),'90000000-0000-4000-8000-000000000010',tests.id(902),tests.id(903),'bullet',tests.id(903));
insert into private.draft_photo_texts(file_id,engagement_id,text,typed_by) values(tests.id(906),'90000000-0000-4000-8000-000000000010','Typed from an easel photo',tests.id(701));
insert into private.review_presence(engagement_id,user_id,place) values('90000000-0000-4000-8000-000000000010',tests.id(701),'overview');
insert into private.overnight_publications(id,engagement_id,round_id,n,snapshot,published_by) values(tests.id(907),'90000000-0000-4000-8000-000000000010',tests.id(901),1,'{}',tests.id(701));
insert into private.lens_summaries(id,engagement_id,lens) values(tests.id(908),'90000000-0000-4000-8000-000000000010',1);
insert into private.lens_summary_locks(summary_id,engagement_id,user_id) values(tests.id(908),'90000000-0000-4000-8000-000000000010',tests.id(701));
insert into private.lens_openings(engagement_id,lens) values('90000000-0000-4000-8000-000000000010',1) on conflict do nothing;
set local role authenticated;
select tests.login(1);
select is(public.reset_practice_room(),true,'The facilitator resets the practice room');
reset role;
select is((select count(*)::integer from private.overnight_rounds where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted),0,'The overnight round is cleared');
select is((select count(*)::integer from private.draft_outcomes where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted),0,'and its drafts');
select is((select count(*)::integer from private.draft_bullets where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted)+(select count(*)::integer from private.draft_notes where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted)
 +(select count(*)::integer from private.draft_sources where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted)+(select count(*)::integer from private.draft_photo_texts where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted),0,'their bullets, notes, sources and photo texts');
select is((select count(*)::integer from private.overnight_publications where engagement_id='90000000-0000-4000-8000-000000000010' and withdrawn_at is null),0,'Published snapshots are withdrawn');
select is((select count(*)::integer from private.review_presence where engagement_id='90000000-0000-4000-8000-000000000010'),0,'and review presence is cleared');
select is((select count(*)::integer from private.lens_summary_locks where engagement_id='90000000-0000-4000-8000-000000000010'),0,'The summary locks are cleared');
select is((select count(*)::integer from private.lens_summaries where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted),0,'and the summaries');
select is((select count(*)::integer from private.vision_outcomes where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted),0,'The earlier records are still cleared (outcomes)');
select is((select count(*)::integer from private.lens_openings where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted),0,'and lens openings');
select is((select count(*)::integer from private.lens_summaries where engagement_id=tests.id(100) and not deleted),3,'Another room''s summaries are left alone: one for each opened lens');

select * from finish();
rollback;
