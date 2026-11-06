begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('87620000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(1000+n))::text,true); end $$;
create function tests.live() returns uuid language sql security definer set search_path='' as $$ select live_session_id from public.room_states where engagement_id=tests.id(100) $$;
create function tests.results() returns jsonb language sql security definer set search_path='' as $$ select results from public.room_states where engagement_id=tests.id(100) $$;
create function tests.ctl(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$
 select public.room_control(tests.id(100),tests.id(n),action,jsonb_build_object('from',tests.live())||p) $$;
create function tests.rb(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$ select public.read_back_control(tests.id(100),tests.id(n),action,p) $$;
create function tests.send(n integer,session integer,text_ text,value jsonb default null,action text default 'submit',revision integer default 0) returns jsonb language sql as $$
 select public.live_submit(tests.id(100),tests.id(n),tests.id(session),revision,action,text_,now(),null,0,value) $$;
create function tests.item() returns uuid language sql security definer set search_path='' as $$ select current_item_id from private.read_back_boards where session_id=tests.id(460) and not deleted $$;
create function tests.vid() returns uuid language sql security definer set search_path='' as $$ select current_version_id from private.read_back_items where id=tests.item() $$;
create function tests.ans(n integer,response text,text_ text default null,v uuid default null) returns jsonb language sql as $$
 select tests.send(n,460,coalesce(text_,case when response='yes' then 'Yes, that''s us' end),jsonb_build_object('version',coalesce(v,tests.vid()),'response',response)) $$;
create function tests.lines(v uuid default null) returns text[] language sql security definer set search_path='' as $$
 select array_agg(text order by position) from private.read_back_lines where version_id=coalesce(v,tests.vid()) and not deleted $$;
create function tests.line(pos integer) returns uuid language sql security definer set search_path='' as $$
 select id from private.read_back_lines where version_id=tests.vid() and position=pos-1 and not deleted $$;
create function tests.versions() returns integer language sql security definer set search_path='' as $$
 select count(*)::integer from private.read_back_versions where item_id=tests.item() and not deleted $$;
create function tests.corr_state(n integer) returns text language sql security definer set search_path='' as $$ select state from private.read_back_corrections where id=tests.id(n) $$;
create table tests.claims(name text primary key,j jsonb);
create function tests.claim(p_name text,session integer,lease integer) returns jsonb language plpgsql as $$
declare j jsonb;
begin
 j:=public.ai_claim(tests.id(session),tests.id(lease),'claude-test-model','{"combine_words":"combine-words@1","group_wall":"group-wall@1","summarize_wall":"summarize-wall@1","fold_questions":"fold-questions@1","group_lens":"group-lens@1","merge_reasons":"merge-reasons@1","overnight_draft":"overnight-draft@1","draft_lens_summary":"draft-lens-summary@1","fold_lens_summary":"fold-lens-summary@1","propose_candidates":"propose-candidates@1","fold_read_back":"fold-read-back@1"}'::jsonb);
 insert into tests.claims(name,j) values(p_name,j) on conflict(name) do update set j=excluded.j;
 return j;
end $$;
create function tests.c(name text) returns jsonb language sql as $$ select j from tests.claims where claims.name=c.name $$;
create function tests.ref(name text,t text) returns text language sql as $$
 select x->>'ref' from jsonb_array_elements(tests.c(name)->'inputs'->'lines') x where x->>'text'=t limit 1 $$;
create function tests.apply(name text,lease integer,output jsonb) returns jsonb language sql as $$
 select public.ai_apply((tests.c(name)->>'run')::uuid,tests.id(lease),output,'{"input_tokens":900,"output_tokens":60,"cost_usd":0.0012,"ms":700}') $$;
grant all on tests.claims to authenticated,anon,service_role;
grant execute on all functions in schema tests to authenticated,anon,service_role;

insert into churches(id,name,timezone) values(tests.id(200),'Riverside Church','America/Toronto');
insert into engagements(id,church_id,title,base_year,settings) values(tests.id(100),tests.id(200),'Read-back room',2026,'{"ai_enabled":true}');
update engagements set lens_names=array['Our people','Our neighbours','Our leaders','Our rhythms','Our learning'] where id=tests.id(100);
insert into auth.users(id,email,email_confirmed_at)
select tests.id(n),case when n=1 then 'fac1@clearway.co' else 'person'||n||'@example.org' end,now() from generate_series(1,8)n;
insert into auth.sessions(id,user_id) select tests.id(1000+n),tests.id(n) from generate_series(1,8)n;
insert into auth.identities(user_id,provider,provider_id,identity_data) select id,'google',id::text,jsonb_build_object('email',email,'email_verified',true) from auth.users where id=tests.id(1);
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method) values(gen_random_uuid(),tests.id(1001),now(),now(),'oauth');
insert into clearway_users(id,auth_user_id,name,email,is_admin,team_hub_team_member_id) values(tests.id(701),tests.id(1),'Chris Vacher','fac1@clearway.co',false,tests.id(801));
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values(tests.id(100),tests.id(701),'lead');
insert into attendees(id,engagement_id,auth_user_id,name,email,verified_at,room_role) values
 (tests.id(503),tests.id(100),tests.id(3),'Priya Shah','person3@example.org',now(),'participant'),
 (tests.id(505),tests.id(100),tests.id(5),'Ben Ortiz','person5@example.org',now(),'participant'),
 (tests.id(506),tests.id(100),tests.id(6),'Ruth Ade','person6@example.org',now(),'participant'),
 (tests.id(507),tests.id(100),tests.id(7),'Sam Lee','person7@example.org',now(),'participant'),
 (tests.id(508),tests.id(100),tests.id(8),'Scribe Person','person8@example.org',now(),'scribe');
insert into device_sessions(engagement_id,attendee_id,auth_session_id) values(tests.id(100),tests.id(503),tests.id(1003)),(tests.id(100),tests.id(505),tests.id(1005)),
 (tests.id(100),tests.id(506),tests.id(1006)),(tests.id(100),tests.id(507),tests.id(1007)),(tests.id(100),tests.id(508),tests.id(1008));
insert into sessions(id,engagement_id,title,part,position,interaction,prompt,state,max_sends,max_characters,max_words,mode,options) values
 (tests.id(410),tests.id(100),'Lens 1','Day 1',1,'lens','In {base year + 10}, our people ...','closed',8,200,50,'live','{"lens":1}'),
 (tests.id(411),tests.id(100),'Lens 2','Day 1',2,'lens','In {base year + 10}, our neighbours ...','closed',8,200,50,'live','{"lens":2}'),
 (tests.id(460),tests.id(100),'Confirm the 10-year Future and outcomes','Day 2',3,'read_back','Did we hear you right?','ready',60,280,50,'live','{}'),
 (tests.id(461),tests.id(100),'Nothing published yet','Day 2',4,'read_back','Did we hear you right?','ready',60,280,50,'live','{}');
-- Two lenses were signed off on Day 1. The other three never were.
insert into private.lens_sentences(id,engagement_id,lens,source,text,session_id) values
 (tests.id(601),tests.id(100),1,'live','Zebrafish we eat together every week',tests.id(410)),
 (tests.id(602),tests.id(100),1,'live','Zebrafish we send people into the neighbourhood',tests.id(410)),
 (tests.id(603),tests.id(100),1,'live','Zebrafish people of every age lead',tests.id(410)),
 (tests.id(611),tests.id(100),2,'live','Quokka our street knows us by name',tests.id(411)),
 (tests.id(612),tests.id(100),2,'live','Quokka we run the community supper',tests.id(411));
insert into private.lens_summaries(id,engagement_id,lens) values(tests.id(810),tests.id(100),1),(tests.id(811),tests.id(100),2);
insert into private.lens_summary_versions(id,engagement_id,summary_id,version,author,shown_at) values
 (tests.id(820),tests.id(100),tests.id(810),1,'facilitator',now()),(tests.id(821),tests.id(100),tests.id(811),1,'facilitator',now());
insert into private.lens_summary_sentences(id,engagement_id,version_id,position,text) values
 (tests.id(830),tests.id(100),tests.id(820),0,'We eat together every week.'),
 (tests.id(831),tests.id(100),tests.id(820),1,'We send people into the neighbourhood.'),
 (tests.id(832),tests.id(100),tests.id(820),2,'People of every age lead.'),
 (tests.id(833),tests.id(100),tests.id(821),0,'Our street knows us by name.'),
 (tests.id(834),tests.id(100),tests.id(821),1,'We run the community supper.');
update private.lens_summaries set state='signed_off',current_version_id=case id when tests.id(810) then tests.id(820) else tests.id(821) end,signed_off_version_id=case id when tests.id(810) then tests.id(820) else tests.id(821) end where engagement_id=tests.id(100);
insert into private.lens_summary_sources(summary_sentence_id,lens_sentence_id,engagement_id) values
 (tests.id(830),tests.id(601),tests.id(100)),(tests.id(831),tests.id(602),tests.id(100)),(tests.id(832),tests.id(603),tests.id(100)),
 (tests.id(833),tests.id(611),tests.id(100)),(tests.id(834),tests.id(612),tests.id(100));
-- The overnight review published two outcomes.
insert into private.vision_outcomes(id,engagement_id,title,status,position) values
 (tests.id(900),tests.id(100),'Welcome every neighbour','provisional',0),(tests.id(901),tests.id(100),'Raise up leaders','provisional',1);
insert into private.outcome_indicators(id,engagement_id,outcome_id,text,position) values
 (tests.id(909),tests.id(100),tests.id(900),'Visit new families quickly',0),(tests.id(910),tests.id(100),tests.id(900),'Hosts at the Sunday door',1),(tests.id(911),tests.id(100),tests.id(901),'Leaders in training',0);
insert into private.overnight_rounds(id,engagement_id,status,published_at,published_by) values(tests.id(902),tests.id(100),'ready',now(),tests.id(701));
insert into private.draft_outcomes(id,engagement_id,round_id,outcome_id,position,name,original_name) values
 (tests.id(903),tests.id(100),tests.id(902),tests.id(900),0,'Welcome every neighbour','Welcome every neighbour'),
 (tests.id(904),tests.id(100),tests.id(902),tests.id(901),1,'Raise up leaders','Raise up leaders');
insert into private.draft_bullets(id,engagement_id,draft_outcome_id,position,text,origin) values
 (tests.id(905),tests.id(100),tests.id(903),0,'Every new family gets a visit within 14 days','ai'),
 (tests.id(906),tests.id(100),tests.id(903),1,'Three hosts run the Sunday welcome','ai'),
 (tests.id(907),tests.id(100),tests.id(904),0,'Twelve leaders are in training','ai'),
 (tests.id(908),tests.id(100),tests.id(904),1,'Every team has a coach','written');
insert into private.draft_sources(engagement_id,draft_outcome_id,bullet_id,kind,ref_id,excerpt) values
 (tests.id(100),tests.id(903),tests.id(905),'bullet',tests.id(909),'Visit new families quickly'),
 (tests.id(100),tests.id(903),tests.id(905),'card',tests.id(990),'Scribe card words that must never reach a phone'),
 (tests.id(100),tests.id(903),tests.id(906),'bullet',tests.id(910),'Hosts at the Sunday door'),
 (tests.id(100),tests.id(904),tests.id(907),'bullet',tests.id(911),'Leaders in training'),
 (tests.id(100),tests.id(904),tests.id(907),'photo',tests.id(991),'Easel photo words');
insert into private.overnight_publications(id,engagement_id,round_id,n,snapshot,published_by) values(tests.id(913),tests.id(100),tests.id(902),1,jsonb_build_object('year',2029,'horizon','3-year Vision','outcomes',jsonb_build_array(
 jsonb_build_object('outcome_id',tests.id(900),'name','Welcome every neighbour','bullets',jsonb_build_array(jsonb_build_object('text','Every new family gets a visit within 14 days','origin','ai','sources',1),jsonb_build_object('text','Three hosts run the Sunday welcome','origin','ai','sources',1))),
 jsonb_build_object('outcome_id',tests.id(901),'name','Raise up leaders','bullets',jsonb_build_array(jsonb_build_object('text','Twelve leaders are in training','origin','ai','sources',1),jsonb_build_object('text','Every team has a coach','origin','written','sources',0))))),tests.id(701));

-- ---------- The kind ----------
select is((select input and not one_per_person and not shares_answers and spotlight='none' and counts='people' and named='never' and structured from private.interaction_kinds where kind='read_back'),true,'The read-back kind is registered: several answers a person, answers not shared, nothing to spotlight');
select ok(private.kind_function('parse','read_back','public.sessions,text,jsonb') is not null and private.kind_function('results','read_back','uuid,uuid,text[]') is not null
 and private.kind_function('options','read_back','jsonb,uuid') is not null and private.kind_function('items','read_back','uuid,text[]') is not null,'It has its own parse, results, options and items functions');
select ok((select bool_and(not has_function_privilege('anon',p.oid,'execute') and not has_function_privilege('authenticated',p.oid,'execute')) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and (p.proname like 'rb\_%' or p.proname in ('options_read_back','parse_read_back','results_read_back','items_read_back','ai_claim','ai_apply','ai_fail','ai_claim_pre_read_back','ai_apply_pre_read_back','ai_fail_pre_read_back','reset_practice_room_pre_read_back','rehearsal_control_pre_read_back'))),'No browser role can call the internal functions or the AI worker''s');
select ok(has_function_privilege('service_role','private.ai_claim(uuid,uuid,text,jsonb)','execute') and has_function_privilege('service_role','private.ai_apply(uuid,uuid,jsonb,jsonb)','execute')
 and has_function_privilege('service_role','private.ai_fail(uuid,uuid,text,jsonb)','execute'),'The server still runs claim, apply and fail');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and (p.proname like 'rb\_%' or p.proname like '%read_back%') and p.prosecdef
 and not coalesce(p.proconfig,array[]::text[]) @> array['search_path=""']),0,'Every private read-back function that runs with the owner''s rights pins its search path');
select ok(not has_function_privilege('anon','public.read_back_state(uuid)','execute') and not has_function_privilege('anon','public.read_back_control(uuid,uuid,text,jsonb)','execute')
 and not has_function_privilege('anon','public.read_back_phone(uuid,uuid)','execute') and not has_function_privilege('anon','public.read_back_scribe(uuid)','execute')
 and not has_function_privilege('anon','public.read_back_correct(uuid,uuid,uuid,text,text,text)','execute'),'A signed-out browser calls none of the entry points');
select ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where oid in ('private.read_back_boards'::regclass,'private.read_back_items'::regclass,'private.read_back_versions'::regclass,'private.read_back_lines'::regclass,'private.read_back_corrections'::regclass)),'All five tables have forced row-level security');
select ok(not has_table_privilege('authenticated','private.read_back_items','select') and not has_table_privilege('authenticated','private.read_back_corrections','select')
 and not has_table_privilege('anon','private.read_back_lines','select') and not has_table_privilege('authenticated','private.read_back_versions','select') and not has_table_privilege('authenticated','private.read_back_boards','select'),'and no browser role reads them');
select ok(pg_get_constraintdef((select oid from pg_constraint where conname='ai_runs_job_check')) ~ 'fold_read_back' and pg_get_constraintdef((select oid from pg_constraint where conname='ai_runs_job_check')) ~ 'propose_candidates'
 and pg_get_constraintdef((select oid from pg_constraint where conname='ai_runs_job_check')) ~ 'fold_lens_summary' and pg_get_constraintdef((select oid from pg_constraint where conname='ai_runs_job_check')) ~ 'overnight_draft'
 and pg_get_constraintdef((select oid from pg_constraint where conname='ai_runs_job_check')) ~ 'combine_words','The job list gains fold_read_back and keeps every earlier job');
select ok(pg_get_constraintdef((select oid from pg_constraint where conname='decisions_subject_check')) ~ 'read_back' and pg_get_constraintdef((select oid from pg_constraint where conname='decisions_subject_check')) ~ 'cut_line','A decision may be about a read-back item, and every earlier subject stays');
select ok((select count(*) from pg_constraint where conname='ai_runs_session_check')=1,'and the overnight session check stays');

-- ---------- Options ----------
select is(private.options_read_back('{}'::jsonb,tests.id(100)),'{}'::jsonb,'A read-back step needs no settings');
select is(private.options_read_back('{"ai":false}'::jsonb,tests.id(100)),'{"ai":false}'::jsonb,'AI may be turned off');
select is(private.options_read_back('{"lens":2}'::jsonb,tests.id(100)),null,'Unknown settings are refused');

-- ---------- Going live reads the items ----------
select is(private.ai_on(tests.id(460)),true,'AI is on for a read-back step');
select is(private.results_read_back(tests.id(100),tests.id(460),array[]::text[])->'item','null'::jsonb,'Before it is live there is no item');
set local role authenticated;
select tests.login(1);
select is(public.read_back_state(tests.id(100))->>'session',null,'The facilitator''s view has no step yet');
select is(tests.rb(1,'show',jsonb_build_object('to','next'))->>'status','invalid_state','and no press works');
select is(tests.ctl(1,'go_live',jsonb_build_object('session',tests.id(460)))->>'status','ok','The step goes live');
reset role;
select is((select count(*)::integer from private.read_back_items where session_id=tests.id(460) and not deleted),4,'It reads four items: two signed-off lenses and two outcomes');
select is((select jsonb_agg(label) from jsonb_array_elements(tests.results()->'items') x(label) ) is not null,true,'The results list them');
select is((select jsonb_agg(x->>'label' order by ord) from jsonb_array_elements(tests.results()->'items') with ordinality t(x,ord)),'["Our people","Our neighbours","Welcome every neighbour","Raise up leaders"]'::jsonb,'in lens order, then the outcomes in the overnight order');
select is(tests.results()#>>'{item,heading}','Our people, 2036','The first item reads "lens name, base year + 10"');
select is(tests.results()#>>'{item,horizon}','10-year Future','under the 10-year Future');
select is(tests.results()#>'{item,lines}'->0->>'text','We eat together every week.','with the signed-off text');
select is(jsonb_array_length(tests.results()#>'{item,lines}'),3,'three lines');
select is(tests.results()->'tally','{"yes":0,"change":0}'::jsonb,'and the tally at zero');
select is(tests.results()->>'published','true','The overnight drafts are published');
select is(tests.results()->>'index','1','The room is on the first of four');
select is((select count(*)::integer from private.read_back_items where session_id=tests.id(460) and kind='lens' and not deleted),2,'Lenses never signed off have no item');

-- ---------- Answers ----------
select is(private.parse_read_back((select s from public.sessions s where s.id=tests.id(460)),null,'{"version":"00000000-0000-4000-8000-000000000001","response":"yes"}'::jsonb)->>'status','stale','An answer to a version that is not on the screen is stale');
select is(private.parse_read_back((select s from public.sessions s where s.id=tests.id(460)),null,'{"response":"yes"}'::jsonb)->>'status','invalid_answer','and one with no version is refused');
set local role authenticated;
select tests.login(3);
select is(tests.ans(901,'yes')->>'status','accepted','Priya says "Yes, that''s us"');
select tests.login(5);
select is(tests.ans(902,'change','Add that we pray first')->>'status','accepted','Ben says it needs a change, in 140 characters');
select tests.login(6);
select is(tests.ans(903,'missing','Nothing about the youth room')->>'status','accepted','Ruth says what is missing');
select is(tests.ans(904,'missing','Our new building plan')->>'status','accepted','and a second thing');
select tests.login(7);
select is(tests.ans(905,'change',repeat('x',141))->>'status','limit','A change over 140 characters is refused');
select is(tests.ans(906,'missing',repeat('x',281))->>'status','limit','and so is a missing answer over 280');
select is(tests.ans(907,'change','   ')->>'status','invalid_answer','An empty one is refused');
select is(tests.ans(908,'yes',null,tests.id(999))->>'status','stale','A version that is not on the screen is stale');
reset role;
select is(tests.results()->'tally','{"yes":1,"change":1}'::jsonb,'The tally counts one yes and one change');
select is((tests.results()->>'total')::integer,4,'four answers in all');
select is((tests.results()->>'people')::integer,3,'from three people');
select is(jsonb_array_length(tests.results()->'missing'),2,'and two anonymous missing answers');
select ok((tests.results()->'missing'->0->>'id') ~ '^[0-9a-f]{8}$' and tests.results()->'missing'->0 ? 'text' and not (tests.results()->'missing'->0 ? 'attendee'),'each only a short tag and the words');
select ok(position('Add that we pray first' in tests.results()::text)=0,'The "It needs a change" words never reach the screen');
select ok(position('Priya' in tests.results()::text)=0 and position('Ben' in tests.results()::text)=0 and position('Ruth' in tests.results()::text)=0 and position(tests.id(503)::text in tests.results()::text)=0,'and no name or person id is in the results');
set local role authenticated;
select tests.login(3);
select is(tests.ans(909,'change','It needs the youth room')->>'status','accepted','Priya changes her mind');
reset role;
select is(tests.results()->'tally','{"yes":0,"change":2}'::jsonb,'Her yes is replaced: one answer per person for a version');
select is((select count(*)::integer from public.submissions where session_id=tests.id(460) and attendee_id=tests.id(503) and not deleted and not withdrawn and value->>'response' in ('yes','change')),1,'only one stands');
set local role authenticated;
select tests.login(3);
select is(tests.ans(910,'missing','Prayer')->>'status','accepted','She may still add what is missing');
reset role;
select is(jsonb_array_length(tests.results()->'missing'),3,'more than one missing answer is kept');
set local role authenticated;
select tests.login(3);
select throws_ok($$select count(*) from private.read_back_items$$,'42501',null,'A participant reads no read-back table');
select throws_ok($$select count(*) from private.read_back_corrections$$,'42501',null,'(corrections either)');
select is(public.read_back_state(tests.id(100))->>'status','denied','A participant has no facilitator view');
select is(public.read_back_scribe(tests.id(100))->>'status','denied','nor the scribe''s');
select is(public.read_back_correct(tests.id(100),tests.id(920),tests.item(),null,'Hello','')->>'status','denied','and cannot write a correction');
select is(tests.rb(3,'decide')->>'status','denied','or mark a decision');
select is(public.read_back_phone(tests.id(100),tests.id(460))->>'status','ok','A participant reads the phone view');
select is(public.read_back_phone(tests.id(100),tests.id(460))#>'{item,lines}'->0#>'{sources,0,text}','"Zebrafish we eat together every week"'::jsonb,'with the source sentence under a line');
reset role;

-- ---------- The scribe''s correction ----------
set local role authenticated;
select tests.login(8);
select is(public.read_back_scribe(tests.id(100))->>'status','ok','The scribe reads the current item');
select is(public.read_back_scribe(tests.id(100))#>>'{item,heading}','Our people, 2036','which is the one on the screen');
select is(public.read_back_correct(tests.id(100),tests.id(920),tests.item(),tests.line(1)::text,'We eat together and pray first every week.','Ben and Priya both said prayer comes first')->>'status','accepted','The scribe writes a correction for the first line, with the reason');
select is(public.read_back_correct(tests.id(100),tests.id(920),tests.item(),tests.line(1)::text,'We eat together and pray first every week.','Ben and Priya both said prayer comes first')->>'status','duplicate','A retry with the same id is a duplicate');
select is(public.read_back_correct(tests.id(100),tests.id(921),tests.item(),null,'',null)->>'status','invalid_request','An empty wording is refused');
select is(public.read_back_correct(tests.id(100),tests.id(922),tests.id(998),null,'Something','')->>'status','stale','A correction for an item the room has left is stale');
select is(public.read_back_correct(tests.id(100),tests.id(923),tests.item(),'new','The youth room is open on Fridays.','Priya asked for it')->>'status','accepted','and one for a new line');
select is(public.read_back_correct(tests.id(100),tests.id(924),tests.item(),null,'People pray first.','Not sure which line')->>'status','accepted','and one that names no line');
reset role;
select is((select count(*)::integer from private.read_back_corrections where item_id=tests.item() and state='queued'),3,'Three corrections wait in the queue');
select ok(position('pray first' in tests.results()::text)=0 and position('Ben and Priya' in tests.results()::text)=0,'Neither the wording nor the reason is on the screen');
select ok(position('pray first' in coalesce((select jsonb_agg(m.payload)::text from realtime.messages m where m.topic like 'live:'||tests.id(100)||':%'),''))=0,'or in any broadcast to the room');
select ok(position('Scribe Person' in tests.results()::text)=0,'and the scribe is not named');

-- ---------- The facilitator''s queue ----------
set local role authenticated;
select tests.login(1);
select is(jsonb_array_length(public.read_back_state(tests.id(100))->'corrections'),3,'The facilitator sees the queue');
select is((select c->>'reason' from jsonb_array_elements(public.read_back_state(tests.id(100))->'corrections') c where c->>'id'=tests.id(920)::text),'Ben and Priya both said prayer comes first','with the scribe''s reason');
select is(jsonb_array_length(public.read_back_state(tests.id(100))->'changes'),2,'and the two "It needs a change" texts');
select is(public.read_back_state(tests.id(100))#>'{item,lines}'->0#>'{sources,0,text}','"Zebrafish we eat together every week"'::jsonb,'and the sources');
select is(tests.rb(10,'correct',jsonb_build_object('wording','We pray before we plan.','reason','Chris heard it in the room','line',tests.line(3)::text))->>'status','ok','The facilitator writes a correction straight into the queue');
select is(tests.rb(11,'accept',jsonb_build_object('correction',tests.id(920)))->>'status','ok','Accept folds the first correction in');
reset role;
select is(tests.versions(),2,'as a second version');
select is(tests.lines(),array['We eat together and pray first every week.','We send people into the neighbourhood.','People of every age lead.'],'with every other line word for word');
select is(tests.corr_state(920),'folded','The correction is folded');
select is((select tracked from private.read_back_versions where id=tests.vid()),true,'It is a tracked change');
select is((select author from private.read_back_versions where id=tests.vid()),'code','made in code');
select is(tests.results()#>'{item,changes,0,kind}','"edit"'::jsonb,'The screen is told which line changed');
select ok(tests.results()#>'{item,lines,0,marks}' is not null,'and the new words are marked');
select is(tests.results()->'tally','{"yes":0,"change":0}'::jsonb,'The tally restarts at zero for the new version');
select is(jsonb_array_length(tests.results()->'missing'),3,'while the missing answers stay with the item');
select is((select count(*)::integer from private.read_back_lines where version_id=tests.vid() and from_line_id is not null),3,'Each line keeps the line it came from');
set local role authenticated;
select tests.login(3);
select is(tests.ans(931,'yes')->>'status','accepted','A phone says yes to the new version');
select tests.login(5);
select is(tests.ans(932,'yes')->>'status','accepted','and another');
reset role;
select is(tests.results()->'tally','{"yes":2,"change":0}'::jsonb,'The tally counts the new version only');
set local role authenticated;
select tests.login(1);
select is(tests.rb(12,'accept',jsonb_build_object('correction',tests.id(923)))->>'status','ok','A new line folds in too');
reset role;
select is(tests.versions(),3,'as a third version');
select is(cardinality(tests.lines()),4,'with four lines');
select is((tests.lines())[4],'The youth room is open on Fridays.','the new one last');
select is(tests.results()#>'{item,changes}'->0->>'kind','add','and the screen is told a line was added');
set local role authenticated;
select tests.login(1);
select is(tests.rb(13,'accept',jsonb_build_object('correction',tests.id(924)))->>'status','ok','A correction naming no line goes to the AI');
reset role;
select is(tests.corr_state(924),'folding','and waits for it');
select is(tests.claim('fold1',460,901)->>'status','claimed','The worker claims the fold');
select is(tests.c('fold1')->>'job','fold_read_back','as a fold_read_back job');
select is(tests.c('fold1')#>>'{inputs,horizon}','10-year Future','with the horizon');
select ok(tests.c('fold1')::text !~ 'Scribe Person' and tests.c('fold1')#>>'{inputs,wording}'='People pray first.','and the wording, never a name');
-- The model changes a number it was not given.
select is(tests.apply('fold1',901,jsonb_build_object('line',tests.ref('fold1','We eat together and pray first every week.'),'text','We eat together and pray first on 9 days every week.'))->>'changed','false','A number that is in none of the sources is refused');
select is(tests.corr_state(924),'failed','and the correction is marked failed');
select is(tests.versions(),3,'with no new version');
set local role authenticated;
select tests.login(1);
select is(tests.rb(14,'accept',jsonb_build_object('correction',tests.id(924),'line',tests.line(2)::text,'wording','We send people into the neighbourhood and pray first.'))->>'status','ok','The facilitator edits it by hand and names the line');
reset role;
select is(tests.versions(),4,'which folds in code');
select is((tests.lines())[2],'We send people into the neighbourhood and pray first.','Edit');
set local role authenticated;
select tests.login(1);
select is(tests.rb(15,'undo')->>'status','ok','Undo last fold');
reset role;
select is((tests.lines())[2],'We send people into the neighbourhood.','takes it back');
select is(tests.corr_state(924),'queued','and the correction goes back to the queue');
select is((select count(*)::integer from private.read_back_versions where item_id=tests.item() and undone_at is not null),1,'The undone version is kept');
set local role authenticated;
select tests.login(1);
select is(tests.rb(16,'dismiss',jsonb_build_object('correction',tests.id(924)))->>'status','ok','A correction can be dismissed');
reset role;
select is(tests.corr_state(924),'dismissed','dismissed');

-- ---------- The AI folds a correction ----------
set local role authenticated;
select tests.login(8);
select is(public.read_back_correct(tests.id(100),tests.id(925),tests.item(),null,'Neighbours know us by name.','Heard from two people')->>'status','accepted','The scribe writes another correction with no line');
select tests.login(1);
select is(tests.rb(17,'accept',jsonb_build_object('correction',tests.id(925)))->>'status','ok','Accepted for the AI');
reset role;
select is(tests.claim('fold2',460,902)->>'status','claimed','The worker claims it');
select is(tests.apply('fold2',902,jsonb_build_object('line',tests.ref('fold2','We send people into the neighbourhood.'),'text','Our neighbours know us by name, and we send people into the neighbourhood.','note','x'))->>'changed','true','A clean line is folded in');
select is(tests.corr_state(925),'folded','folded');
select is((select author from private.read_back_versions where id=tests.vid()),'ai','as an AI version');
select is((tests.lines())[1],'We eat together and pray first every week.','Other lines are word for word');
select is((tests.lines())[2],'Our neighbours know us by name, and we send people into the neighbourhood.','and the one line is changed');
set local role authenticated;
select tests.login(8);
select is(public.read_back_correct(tests.id(100),tests.id(926),tests.item(),null,'People will lead.','future tense')->>'status','accepted','Another correction');
select tests.login(1);
select is(tests.rb(18,'accept',jsonb_build_object('correction',tests.id(926)))->>'status','ok','is accepted for the AI');
reset role;
select is(tests.claim('fold3',460,903)->>'status','claimed','and claimed');
select is(tests.apply('fold3',903,jsonb_build_object('line',tests.ref('fold3','People of every age lead.'),'text','People of every age will lead.'))->>'changed','false','A lens line in the future tense is refused');
select is(tests.corr_state(926),'failed','and marked failed');
set local role authenticated;
select tests.login(1);
select is(tests.rb(19,'dismiss',jsonb_build_object('correction',tests.id(926)))->>'status','ok','Dismissed');
select is(tests.rb(20,'ai_off')->>'status','ok','AI goes off');
reset role;
set local role authenticated;
select tests.login(8);
select is(public.read_back_correct(tests.id(100),tests.id(927),tests.item(),null,'Everyone leads.','Heard')->>'status','accepted','A correction with no line');
select tests.login(1);
select is(tests.rb(21,'accept',jsonb_build_object('correction',tests.id(927)))->>'status','ai_off','With the AI off, Accept asks for a line');
select is(tests.rb(22,'accept',jsonb_build_object('correction',tests.id(927),'line',tests.line(3)::text))->>'status','ok','and the facilitator names one');
reset role;
select is((tests.lines())[3],'Everyone leads.','which folds in code');

-- ---------- The tally never decides ----------
set local role authenticated;
select tests.login(3);
select is(tests.ans(940,'yes')->>'status','accepted','Priya says yes to the latest version');
select tests.login(5);
select is(tests.ans(941,'yes')->>'status','accepted','Ben too');
select tests.login(6);
select is(tests.ans(942,'yes')->>'status','accepted','and Ruth');
select tests.login(7);
select is(tests.ans(943,'yes')->>'status','accepted','and Sam');
reset role;
select is(tests.results()->'tally','{"yes":4,"change":0}'::jsonb,'Four of four say yes');
select is((select state from private.read_back_items where id=tests.item()),'open','but the item stays open');
select is((select state from private.lens_summaries where id=tests.id(810)),'signed_off','and the signed-off summary is as it was');
select is((select signed_off_version_id from private.lens_summaries where id=tests.id(810)),tests.id(820),'on its first version');
set local role authenticated;
select tests.login(1);
select is(tests.rb(23,'decide',jsonb_build_object('reasons','All four agreed'))->>'status','ok','The facilitator marks a decision');
reset role;
select is((select state from private.read_back_items where id=tests.item()),'settled','which settles the item');
select is((select subject from private.decisions where id=(select decision_id from private.read_back_items where id=tests.item())),'read_back','as a read-back decision');
select is((select decision from private.decisions where id=(select decision_id from private.read_back_items where id=tests.item())),'Confirmed with changes','that says it changed');
select is((select counts->>'people' from private.decisions where id=(select decision_id from private.read_back_items where id=tests.item())),'4','with the numbers kept as a record');
select is((select count(*)::integer from private.lens_summary_versions where summary_id=tests.id(810) and author='read_back' and not deleted),1,'A lens item settled with a change becomes a new lens summary version by the read-back');
select is((select note from private.lens_summary_versions where summary_id=tests.id(810) and author='read_back'),'Changed in the Day 2 confirm','noted');
select is((select signed_off_version_id from private.lens_summaries where id=tests.id(810))=(select id from private.lens_summary_versions where summary_id=tests.id(810) and author='read_back'),true,'and it is the signed-off one');
select is((select array_agg(text order by position) from private.lens_summary_sentences where version_id=(select signed_off_version_id from private.lens_summaries where id=tests.id(810)) and not deleted),tests.lines(),'with the confirmed words');
select is((select jsonb_array_length(private.map_assemble(tests.id(100))#>'{page1,future,lenses,0,lines}')),4,'The draft Map''s 10-year Future reads it');
select is(private.map_assemble(tests.id(100))#>>'{page1,future,lenses,0,lines,0}','We eat together and pray first every week.','the confirmed first line');
select is(tests.results()#>>'{item,settled}','true','The screen shows the item settled');
select is(tests.results()#>'{item,lines,0,marks}',null,'with the underlines gone');
set local role authenticated;
select tests.login(3);
select is(tests.ans(944,'change','Too late')->>'status','stale','A settled item takes no more answers');
select tests.login(1);
select is(tests.rb(24,'accept',jsonb_build_object('correction',tests.id(925)))->>'status','unchanged','nor corrections');
select is(tests.rb(25,'decide')->>'status','decided','Deciding again changes nothing');
select is(tests.rb(26,'undecide')->>'status','ok','The facilitator takes the decision back');
reset role;
select is((select state from private.read_back_items where id=tests.item()),'open','The item is open again');
select is((select signed_off_version_id from private.lens_summaries where id=tests.id(810)),tests.id(820),'and the lens summary is back on its first signed-off version');
set local role authenticated;
select tests.login(1);
select is(tests.rb(27,'decide')->>'status','ok','Marked again');
select is(tests.rb(28,'show',jsonb_build_object('to','next'))->>'status','ok','Next item');
reset role;
select is(tests.results()#>>'{item,heading}','Our neighbours, 2036','is the second lens');
select is((select version from private.lens_summary_versions where summary_id=tests.id(810) and author='read_back' and not deleted),3,'The first lens summary has its Day 2 version');
set local role authenticated;
select tests.login(1);
select is(tests.rb(29,'show',jsonb_build_object('to','next'))->>'status','ok','Next');
reset role;
select is(tests.results()#>>'{item,heading}','Welcome every neighbour','is the first outcome');
select is(tests.results()#>>'{item,horizon}','3-year Vision','under the 3-year Vision');
select is(jsonb_array_length(tests.results()#>'{item,lines}'),2,'with its two bullets');
set local role authenticated;
select tests.login(3);
select is(public.read_back_phone(tests.id(100),tests.id(460))#>'{item,lines}'->0->'sources',jsonb_build_array(jsonb_build_object('id',tests.id(909),'text','Visit new families quickly')),'A phone sees only the phone input behind an outcome line');
select ok(position('Scribe card words' in public.read_back_phone(tests.id(100),tests.id(460))::text)=0 and position('Easel photo' in public.read_back_phone(tests.id(100),tests.id(460))::text)=0,'never scribe card words or photos');
select is(jsonb_array_length(public.read_back_phone(tests.id(100),tests.id(460))->'settled'),1,'The settled lens can be looked back at');
select tests.login(1);
select is(tests.rb(30,'correct',jsonb_build_object('wording','Every new family gets a visit within 7 days.','reason','Chris said so','line',tests.line(1)::text))->>'status','ok','A correction to an outcome line');
select is(tests.rb(31,'accept',jsonb_build_object('correction',tests.id(30)))->>'status','ok','is accepted');
select is(tests.rb(32,'decide')->>'status','ok','and the outcome is decided');
reset role;
select is((select array_agg(l.text order by l.position) from private.read_back_lines l where l.version_id=(select settled_version_id from private.read_back_items where outcome_id=tests.id(900))),array['Every new family gets a visit within 7 days.','Three hosts run the Sunday welcome'],'The settled bullets are the changed ones');
select is((select jsonb_agg(o#>'{indicators,0}') from jsonb_array_elements(private.map_assemble(tests.id(100))#>'{page1,vision,outcomes}') o where o->>'title'='Welcome every neighbour'),'["Every new family gets a visit within 7 days."]'::jsonb,'The Map''s 3-year Vision for that outcome reads the settled version');
select is((select jsonb_agg(o#>'{indicators,0}') from jsonb_array_elements(private.map_assemble(tests.id(100))#>'{page1,vision,outcomes}') o where o->>'title'='Raise up leaders'),'["Twelve leaders are in training"]'::jsonb,'and an outcome not settled reads the overnight publication');
select is(jsonb_array_length(private.map_assemble(tests.id(100))#>'{page1,vision,outcomes}'),2,'with both outcomes on the Map');

-- ---------- Nothing published ----------
update public.room_states set live_session_id=null where engagement_id=tests.id(100);
update private.overnight_publications set withdrawn_at=now() where engagement_id=tests.id(100);
update public.sessions set state='closed' where id=tests.id(460);
update public.sessions set state='live' where id=tests.id(461);
update public.room_states set live_session_id=tests.id(461) where engagement_id=tests.id(100);
select is((select count(*)::integer from private.read_back_items where session_id=tests.id(461) and not deleted),2,'With nothing published, only the lens items load');
select is(tests.results()->>'published','false','and the results say the drafts are not published');
set local role authenticated;
select tests.login(1);
select is(public.read_back_state(tests.id(100))#>'{published,any}','false'::jsonb,'The control surface says so');
select is(jsonb_array_length(public.read_back_state(tests.id(100))->'not_signed'),3,'and which lenses are not signed off');
reset role;
update private.overnight_publications set withdrawn_at=null where engagement_id=tests.id(100);
set local role authenticated;
select tests.login(1);
select is(public.read_back_state(tests.id(100))#>'{published,newer}','true'::jsonb,'A publication made after the items were read is flagged');
select is(tests.rb(33,'reload')->>'status','ok','Reload items');
reset role;
select is((select count(*)::integer from private.read_back_items where session_id=tests.id(461) and not deleted),4,'reads the outcomes');

-- ---------- The template ----------
select is((select count(*)::integer from private.templates t, jsonb_array_elements(t.sessions) e where t.id in ('c1ea0000-0000-4000-8000-000000000002','c1ea0000-0000-4000-8000-000000000003') and e->>'interaction'='read_back' and e->>'planned_minutes'='30'),2,'Both Wayfinding templates carry a 30 minute read-back step');
select is((select count(*)::integer from private.templates t, jsonb_array_elements(t.sessions) e where t.id in ('c1ea0000-0000-4000-8000-000000000002','c1ea0000-0000-4000-8000-000000000003') and e->>'title'='Confirm the 10-year Future'),0,'in place of the placeholder');
select is((select count(*)::integer from private.templates t, jsonb_array_elements(t.sessions) e where t.id in ('c1ea0000-0000-4000-8000-000000000002','c1ea0000-0000-4000-8000-000000000003') and e->>'interaction'='read_back' and (e->>'notes') ~ '[—–]'),0,'with no dash in its note');

-- ---------- Reset and clear ----------
insert into engagements(id,church_id,title,type) values('90000000-0000-4000-8000-000000000010',tests.id(200),'Permanent practice','practice');
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values('90000000-0000-4000-8000-000000000010',tests.id(701),'lead');
insert into sessions(id,engagement_id,title,part,position,interaction,prompt,state,max_sends,max_characters,max_words,mode,options) values
 (tests.id(470),'90000000-0000-4000-8000-000000000010','Practice read-back','Day 2',1,'read_back','Did we hear you right?','ready',60,280,50,'live','{}');
insert into private.read_back_boards(session_id,engagement_id) values(tests.id(470),'90000000-0000-4000-8000-000000000010');
insert into private.read_back_items(id,engagement_id,session_id,kind,lens,heading,position) values(tests.id(471),'90000000-0000-4000-8000-000000000010',tests.id(470),'lens',1,'',1);
insert into private.read_back_versions(id,engagement_id,item_id,version,author) values(tests.id(472),'90000000-0000-4000-8000-000000000010',tests.id(471),1,'source');
insert into private.read_back_lines(id,engagement_id,version_id,position,text) values(tests.id(473),'90000000-0000-4000-8000-000000000010',tests.id(472),0,'A practice line');
update private.read_back_items set current_version_id=tests.id(472) where id=tests.id(471);
insert into private.read_back_corrections(id,engagement_id,session_id,item_id,version_id,wording,source) values(tests.id(474),'90000000-0000-4000-8000-000000000010',tests.id(470),tests.id(471),tests.id(472),'A practice correction','facilitator');
set local role authenticated;
select tests.login(1);
select is(public.reset_practice_room(),true,'The facilitator resets the practice room');
reset role;
select is((select count(*)::integer from private.read_back_items where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted)
 +(select count(*)::integer from private.read_back_corrections where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted)
 +(select count(*)::integer from private.read_back_versions where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted)
 +(select count(*)::integer from private.read_back_lines where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted)
 +(select count(*)::integer from private.read_back_boards where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted),0,'The reset clears the read-back items, versions, lines, corrections and board');
select is((select count(*)::integer from private.read_back_items where engagement_id=tests.id(100) and not deleted),8,'Another room''s items are left alone');

-- Clear test answers, for a rehearsal in the room under test.
update public.room_states set live_session_id=null where engagement_id=tests.id(100);
set local role authenticated;
select tests.login(1);
select is(public.rehearsal_control(tests.id(100),tests.id(950),'start')->>'status','ok','A rehearsal starts');
reset role;
update private.read_back_items set test=true where session_id=tests.id(461);
update private.read_back_corrections set test=true where session_id=tests.id(460);
select ok((public.control_status(tests.id(100)) is not null),'The control status still reads');
select cmp_ok((select (c->'rehearsal'->>'test_answers')::integer from (select (select private.control_status(tests.id(100))) c) q),'>=',1,'Test corrections count as test answers');
set local role authenticated;
select tests.login(1);
select is(public.rehearsal_control(tests.id(100),tests.id(951),'end')->>'status','ok','The rehearsal ends');
select is(public.rehearsal_control(tests.id(100),tests.id(952),'clear')->>'status','ok','Clear test answers runs');
reset role;
select is((select count(*)::integer from private.read_back_corrections where session_id=tests.id(460) and not deleted),0,'It clears the test corrections');
select is((select count(*)::integer from private.read_back_items where session_id=tests.id(461) and not deleted),0,'and the test items');
select is((select count(*)::integer from private.read_back_items where session_id=tests.id(460) and not deleted),4,'but not items that were not made in a rehearsal');

select * from finish();
rollback;
