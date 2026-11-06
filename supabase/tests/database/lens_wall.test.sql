begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('87600000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(1000+n))::text,true); end $$;
create function tests.live() returns uuid language sql security definer set search_path='' as $$ select live_session_id from public.room_states where engagement_id=tests.id(100) $$;
create function tests.results() returns jsonb language sql security definer set search_path='' as $$ select results from public.room_states where engagement_id=tests.id(100) $$;
create function tests.ctl(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$
 select public.room_control(tests.id(100),tests.id(n),action,jsonb_build_object('from',tests.live())||p) $$;
create function tests.rehearse(n integer,action text) returns jsonb language sql as $$ select public.rehearsal_control(tests.id(100),tests.id(n),action) $$;
create function tests.ai(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$ select public.ai_control(tests.id(100),tests.id(n),action,p) $$;
create function tests.send(n integer,session integer,text_ text,value jsonb default null,action text default 'submit',revision integer default 0) returns jsonb language sql as $$
 select public.live_submit(tests.id(100),tests.id(n),tests.id(session),revision,action,text_,now(),null,0,value) $$;
create function tests.save(n integer,options jsonb,mode text default 'live') returns jsonb language sql as $$
 select public.show_write(tests.id(100),'save',jsonb_build_object('id',tests.id(n),'revision',null,'title','Step '||n,'part','Pre-call','mode',mode,
  'opens_at',case when mode='self_paced' then now()-interval '1 hour' end,'closes_at',case when mode='self_paced' then now()+interval '2 days' end,'interaction','lens',
  'prompt','In {base year + 10}, what is true?','phone_depth','','notes','','lands_in','','segment','','state','ready','planned_minutes',5,'max_sends',10,'max_characters',200,'max_words',50,
  'settings',jsonb_build_object('anonymous',true,'burst_minutes',4,'join_strip',false),'options',options)) $$;
create function tests.opened(lens integer) returns boolean language sql security definer set search_path='' as $$ select private.lens_is_open(tests.id(100),lens::smallint) $$;
create function tests.sub_text(n integer) returns text language sql security definer set search_path='' as $$ select text from public.submissions where id=tests.id(n) $$;
create function tests.sentence(n integer) returns private.lens_sentences language sql security definer set search_path='' as $$ select * from private.lens_sentences where submission_id=tests.id(n) $$;
create table tests.claims(name text primary key,j jsonb);
create function tests.claim(p_name text,session integer,lease integer) returns jsonb language plpgsql as $$
declare j jsonb;
begin
 j:=public.ai_claim(tests.id(session),tests.id(lease),'claude-test-model','{"combine_words":"combine-words@1","group_wall":"group-wall@1","summarize_wall":"summarize-wall@1","fold_questions":"fold-questions@1","group_lens":"group-lens@1"}');
 insert into tests.claims(name,j) values(p_name,j) on conflict(name) do update set j=excluded.j;
 return j;
end $$;
create function tests.c(name text) returns jsonb language sql as $$ select j from tests.claims where claims.name=c.name $$;
create function tests.ref(name text,list text,t text) returns text language sql as $$
 select x->>'ref' from jsonb_array_elements(tests.c(name)->'inputs'->list) x where x->>'text'=t or x->>'label'=t limit 1 $$;
create function tests.apply(name text,lease integer,output jsonb) returns jsonb language sql as $$
 select public.ai_apply((tests.c(name)->>'run')::uuid,tests.id(lease),output,'{"input_tokens":1200,"output_tokens":80,"cost_usd":0.0016,"ms":900}') $$;
create function tests.group_id(t text) returns uuid language sql security definer set search_path='' as $$ select id from private.ai_groups where label=t or ai_label=t order by created_at limit 1 $$;
grant all on tests.claims to authenticated,anon,service_role;
grant execute on all functions in schema tests to authenticated,anon,service_role;

insert into churches(id,name,timezone) values(tests.id(200),'Riverside Church','America/Toronto');
insert into engagements(id,church_id,title,base_year,settings) values(tests.id(100),tests.id(200),'Lens room',2026,'{"ai_enabled":true}');
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
insert into sessions(id,engagement_id,title,part,position,interaction,prompt,state,max_sends,max_characters,max_words,mode,opens_at,closes_at,options) values
 (tests.id(400),tests.id(100),'Seed the five lenses','Pre-call',0,'lens','Write what is true in {base year + 10}','ready',30,200,50,'self_paced',now()-interval '1 hour',now()+interval '2 days','{"seed":true,"recording":"https://example.org/precall"}'),
 (tests.id(410),tests.id(100),'Lens 1','Day 1',1,'lens','In {base year + 10}, our people ...','ready',8,200,50,'live',null,null,'{"lens":1}'),
 (tests.id(411),tests.id(100),'Lens 2','Day 1',2,'lens','In {base year + 10}, our neighbours ...','ready',8,200,50,'live',null,null,'{"lens":2}');
update sessions set seeded_from=tests.id(400) where id in(tests.id(410),tests.id(411));

-- ---------- The kind ----------
select is((select input and not one_per_person and shares_answers and spotlight='id' from private.interaction_kinds where kind='lens'),true,'The lens kind is registered: a text input that shares answers, one sentence at a time');
select ok(private.kind_function('parse','lens','public.sessions,text,jsonb') is not null and private.kind_function('results','lens','uuid,uuid,text[]') is not null
 and private.kind_function('options','lens','jsonb,uuid') is not null and private.kind_function('items','lens','uuid,text[]') is not null,'It has its own parse, results, options and items functions');
select ok(not has_function_privilege('authenticated','private.lens_wall_read(uuid)','execute') and has_function_privilege('service_role','private.lens_wall_read(uuid)','execute'),'Only the server reads the cluster shape step 2b uses');
select ok((select bool_and(not has_function_privilege('anon',p.oid,'execute') and not has_function_privilege('authenticated',p.oid,'execute')) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.proname in('options_lens','parse_lens','results_lens','items_lens','lens_open_sentences','lens_text','lens_prompt_inputs','lens_capture','lens_on_air','lens_keep_seeding')),'No browser role can call the lens functions');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like '%lens%' and p.prosecdef
 and not coalesce(p.proconfig,array[]::text[]) @> array['search_path=""']),0,'Every private lens function pins its search path');

-- ---------- Options ----------
select is(private.options_lens('{"seed":true}'::jsonb,tests.id(100)),'{"seed":true}'::jsonb,'A seeding step needs no lens');
select is(private.options_lens('{"lens":3}'::jsonb,tests.id(100)),'{"lens":3}'::jsonb,'A lens step names its lens');
select is(private.options_lens('{"lens":2,"ai":false}'::jsonb,tests.id(100)),'{"lens":2,"ai":false}'::jsonb,'and may turn AI off');
select is(private.options_lens('{}'::jsonb,tests.id(100)),null,'A lens step without a lens is refused');
select is(private.options_lens('{"lens":6}'::jsonb,tests.id(100)),null,'There are five lenses');
select is(private.options_lens('{"lens":0}'::jsonb,tests.id(100)),null,'and the first is 1');
select is(private.options_lens('{"seed":true,"lens":1}'::jsonb,tests.id(100)),null,'A seeding step names no single lens');
select is(private.options_lens('{"seed":true,"recording":"http://example.org/x"}'::jsonb,tests.id(100)),null,'The recording link is https');
select is(private.options_lens('{"seed":true,"recording":"https://example.org/precall"}'::jsonb,tests.id(100)),'{"seed":true,"recording":"https://example.org/precall"}'::jsonb,'for the person who missed the call');
select is(private.options_lens('{"lens":1,"recording":"https://example.org/x"}'::jsonb,tests.id(100)),null,'and belongs to the seeding step');
select is(private.options_lens('{"lens":1,"extra":true}'::jsonb,tests.id(100)),null,'Unknown settings are refused');
set local role authenticated;
select tests.login(1);
select is(tests.save(420,'{"lens":4}')->>'status','ok','The run of show saves a lens step');
select is(tests.save(421,'{"seed":true}','self_paced')->>'status','ok','and a self-paced seeding step');
select is(tests.save(422,'{"lens":9}')->>'status','invalid_request','but not lens 9');
reset role;

-- ---------- Seeding: written once, hidden everywhere ----------
set local role authenticated;
select tests.login(3);
select is(tests.send(1,400,'Zebrafish people welcome every stranger by name',jsonb_build_object('lens',1))->>'status','accepted','A person seeds a sentence for lens 1');
select is(tests.send(2,400,'Zebrafish people pray before they plan',jsonb_build_object('lens',1))->>'status','accepted','another for lens 1');
select is(tests.send(3,400,'Zebrafish neighbours know us as the people who show up',jsonb_build_object('lens',2))->>'status','accepted','and one for lens 2');
select is(tests.send(4,400,'No lens named')->>'status','invalid_answer','A seeded sentence must name its lens');
select is(tests.send(5,400,'Wrong lens',jsonb_build_object('lens',6))->>'status','invalid_answer','and a real one');
select is(tests.send(6,400,'Hidden until Day 1',jsonb_build_object('lens',1))->>'status','invalid_answer','The placeholder is not a sentence');
select is(tests.send(7,400,'shit happens here',jsonb_build_object('lens',1))->>'status','filtered','The word filter holds');
select tests.login(5);
select is(tests.send(8,400,'Zebrafish people hand their leadership on',jsonb_build_object('lens',1))->>'status','accepted','A second person seeds lens 1');
select is(tests.send(9,400,'Zebrafish neighbours are our friends',jsonb_build_object('lens',2))->>'status','accepted','and lens 2');
reset role;
select is(tests.sub_text(1),'Hidden until Day 1','The stored submission holds a placeholder, never the words');
select is((select answers from public.submissions where id=tests.id(1)),'[{"text":"Hidden until Day 1","key":"hidden"}]'::jsonb,'and so do its answers');
select is((tests.sentence(1)).text,'Zebrafish people welcome every stranger by name','The words are written once, in the lens table');
select is(((tests.sentence(1)).source,(tests.sentence(1)).lens),('seeded'::text,1::smallint),'seeded, for lens 1');
select is((select value from public.submissions where id=tests.id(3)),'{"lens":2}'::jsonb,'The answer carries its lens');
select is((select count(*)::integer from private.lens_sentences where source='seeded' and not deleted),5,'Five seeded sentences, none for the refused ones');

set local role authenticated;
select tests.login(1);
select is((select count(*) from private.lens_sentences),0::bigint,'The facilitator reads no seeded sentence from the table');
select is((select count(*) from public.submissions),0::bigint,'or from the submissions');
select is(public.lens_seed_counts(tests.id(100))->'lenses'->0,jsonb_build_object('lens',1,'seeded',3,'people',2,'open',false),'The facilitator gets only how many were written for lens 1');
select is((public.lens_seed_counts(tests.id(100))->'lenses'->1->>'seeded')::integer,2,'and for lens 2');
select ok(position('Zebrafish' in public.control_status(tests.id(100))::text)=0,'The control surface carries no seeded word');
select ok(position('Zebrafish' in public.session_export(tests.id(100),tests.id(400))::text)=0,'The export carries no seeded word');
select ok(position('Zebrafish' in public.results_recap(tests.id(100))::text)=0,'The recap carries no seeded word');
select ok(position('Zebrafish' in public.live_snapshot(tests.id(100),null,null)::text)=0,'The room snapshot carries no seeded word');
select tests.login(3);
select ok(position('Zebrafish' in public.phone_room(tests.id(100))::text)=0,'The author''s own phone carries no seeded word');
select ok(position('Hidden until Day 1' in public.phone_room(tests.id(100))::text)>0,'It shows that the sentence is waiting');
select is((select count(*) from private.lens_sentences),0::bigint,'The author cannot read their sentence back from the table');
select ok((select bool_and(text='Hidden until Day 1') from public.submissions where session_id=tests.id(400)),'or from their own submissions');
select tests.login(6);
select ok(position('Zebrafish' in public.phone_room(tests.id(100))::text)=0,'Another person''s phone carries none');
reset role;
select ok(position('Zebrafish' in coalesce((select jsonb_agg(m.payload)::text from realtime.messages m where m.topic like 'live:'||tests.id(100)||':%'),''))=0,'No broadcast carried a seeded word');
select is(private.live_results_for(tests.id(100),tests.id(400),array[]::text[])->>'total','0','The seeding step has no wall');
select is(private.items_lens(tests.id(400),array[]::text[]),'[]'::jsonb,'and no control items');
select is((select count(*)::integer from private.lens_open_sentences(tests.id(410))),0,'Before it opens, lens 1 has no sentences');
select is(private.ai_on(tests.id(400)),false,'AI never reads the seeding step');
select is(tests.claim('seeding',400,901)->>'status','off','and a claim on it is refused');

-- Changing and withdrawing a seeded sentence.
set local role authenticated;
select tests.login(3);
select is(tests.send(1,400,'Zebrafish people welcome every stranger by first name',jsonb_build_object('lens',1),'change',1)->>'status','accepted','An author changes a seeded sentence');
select is(tests.send(2,400,'x',null,'withdraw',1)->>'status','accepted','and withdraws one');
reset role;
select is((tests.sentence(1)).text,'Zebrafish people welcome every stranger by first name','The change reaches the lens table');
select is(tests.sub_text(1),'Hidden until Day 1','and the submission still holds the placeholder');
select is((tests.sentence(2)).withdrawn,true,'A withdrawn sentence is withdrawn there too');
select is((select count(*)::integer from private.lens_sentences where lens=1 and source='seeded' and not withdrawn and not deleted),2,'and no longer counts');

-- ---------- Close Pre-call leaves the seeding step open ----------
set local role authenticated;
select tests.login(1);
select is(tests.ctl(1,'close_part',jsonb_build_object('part','Pre-call'))->>'status' in('ok','unchanged'),true,'Close Pre-call is accepted');
reset role;
select is((select private.session_state(s,now()) from public.sessions s where id=tests.id(400)),'open','and the seeding step is still open');
select ok((select closes_at>now()+interval '1 day' and closed_at is null from public.sessions where id=tests.id(400)),'with its close time untouched');
set local role authenticated;
select tests.login(6);
select is(tests.send(10,400,'Zebrafish people share the work',jsonb_build_object('lens',1))->>'status','accepted','Someone who missed the call can still seed');
reset role;

-- ---------- A rehearsal never opens a lens ----------
set local role authenticated;
select tests.login(1);
select is(tests.rehearse(1,'start')->>'status','ok','A rehearsal starts');
select tests.login(7);
select is(tests.send(11,400,'Zebrafish test sentence',jsonb_build_object('lens',2))->>'status','accepted','A test seed is written');
select tests.login(1);
select is(tests.ctl(2,'go_live',jsonb_build_object('session',tests.id(411)))->>'status','ok','Lens 2 goes live in the rehearsal');
reset role;
select is(tests.opened(2),false,'but does not open');
select is(jsonb_array_length(tests.results()->'seeded'),1,'Only the test seed shows');
select is(tests.results()->'seeded'->0->>'text','Zebrafish test sentence','and it is the test seed');
set local role authenticated;
select tests.login(1);
select is(tests.ctl(3,'nothing_live')->>'status','ok','Nothing is live again');
select is(tests.rehearse(2,'clear')->>'status','ok','Clear test answers');
reset role;
select is((tests.sentence(11)).deleted,true,'The test sentence is gone from the lens table');
select is((select count(*)::integer from private.lens_sentences where source='seeded' and not deleted and not withdrawn),5,'Real seeds stay: three for lens 1, two for lens 2');
set local role authenticated;
select tests.login(1);
select is(tests.rehearse(3,'end')->>'status','unchanged','Clearing ended the rehearsal');
reset role;

-- ---------- Lens 1 opens: seeds arrive first, live sentences land ----------
set local role authenticated;
select tests.login(1);
select is(tests.ctl(4,'go_live',jsonb_build_object('session',tests.id(410)))->>'status','ok','Lens 1 goes live');
reset role;
select is(tests.opened(1),true,'Lens 1 opened');
select is(tests.opened(2),false,'Lens 2 did not');
select is(jsonb_array_length(tests.results()->'seeded'),3,'Its three seeded sentences are in the results');
select is((select array_agg(x->>'text' order by x->>'text') from jsonb_array_elements(tests.results()->'seeded') x),
 array['Zebrafish people hand their leadership on','Zebrafish people share the work','Zebrafish people welcome every stranger by first name'],'with their words');
select ok(position('neighbours' in tests.results()::text)=0,'Nothing from lens 2');
select is((tests.results()->>'total')::integer,3,'The count includes them');
select is((tests.results()->>'lens')::integer,1,'and names the lens');
select is(tests.results()->>'lens_name','Our people','by the engagement''s name for it');
select is((select session_id from private.lens_openings where engagement_id=tests.id(100) and lens=1 and not deleted),tests.id(410),'The opening records the step that opened it');
set local role authenticated;
select tests.login(1);
select is((select count(*) from private.lens_sentences where source='seeded'),3::bigint,'The facilitator now reads lens 1''s seeds, and only those');
select is(public.lens_seed_counts(tests.id(100))->'lenses'->0->>'open','true','The count says it is open');
select tests.login(6);
select is(tests.send(20,410,'Zebrafish we eat together every week')->>'status','accepted','A live sentence lands');
select tests.login(5);
select is(tests.send(21,410,'Zebrafish we eat together on Sundays')->>'status','accepted','and another');
reset role;
select is((tests.sentence(20)).source,'live','It is written as a live sentence');
select is((tests.results()->>'total')::integer,5,'The wall holds five');
select is(jsonb_array_length(tests.results()->'seeded'),3,'Seeded sentences are unchanged');
set local role authenticated;
select tests.login(5);
select ok(position('every week' in public.live_snapshot(tests.id(100),null,null)::text)>0,'The snapshot carries the live sentence');
select tests.login(1);
select is((public.control_status(tests.id(100))->'items'->0->>'text') is not null,true,'The control surface lists the live sentences');
reset role;

-- ---------- AI: clusters, with rename, pin, undo and off ----------
select is(tests.claim('first',410,911)->>'job','group_lens','AI claims the lens job');
select is(tests.c('first')->'inputs'->>'lens','1','with the lens');
select is(tests.c('first')->'inputs'->>'lens_name','Our people','its name from the engagement');
select is(tests.c('first')->'inputs'->>'base_year','2026','the base year');
select is(tests.c('first')->'inputs'->>'question','In 2036, our people ...','and the question with its years filled');
select is(jsonb_array_length(tests.c('first')->'inputs'->'answers'),5,'It reads the five standing sentences, seeded and live');
select ok(position('neighbours' in (tests.c('first')->'inputs'->'answers')::text)=0,'and none from a lens that has not opened');
select is(tests.c('first')->>'prompt_version','group-lens@1','The run records the prompt version');
select is(tests.claim('busy',410,912)->>'status','busy','A second claim waits');
select is(tests.apply('first',911,jsonb_build_object('groups',jsonb_build_array(
 jsonb_build_object('group','n1','label','Eating together','answers',jsonb_build_array(tests.ref('first','answers','Zebrafish we eat together every week'),tests.ref('first','answers','Zebrafish we eat together on Sundays'))),
 jsonb_build_object('group','n2','label','People on the move','answers',jsonb_build_array(tests.ref('first','answers','Zebrafish people hand their leadership on'),tests.ref('first','answers','Zebrafish people share the work'),tests.ref('first','answers','Zebrafish people welcome every stranger by first name'))))))->>'applied','2','Two clusters are applied');
select is(jsonb_array_length(tests.results()->'groups'),2,'Both reach the results');
select is((tests.results()->'groups'->0->>'label'),'People on the move','largest first');
select is((tests.results()->'groups'->0->>'count')::integer,3,'with seeded and live sentences counted together');
select is(tests.results()->>'ai','true','and the wall is marked as AI');
select ok(exists(select 1 from jsonb_array_elements(private.lens_wall_read(tests.id(410))->'clusters') c where c->>'label'='People on the move' and jsonb_array_length(c->'ids')=3),'Step 2b reads the clusters');
select is(jsonb_array_length(private.lens_wall_read(tests.id(410))->'sentences'),5,'and the sentences, each with its cluster');
select is((select count(*)::integer from jsonb_array_elements(private.lens_wall_read(tests.id(410))->'sentences') x where x->>'cluster' is not null),5,'every one in a cluster');
set local role authenticated;
select tests.login(1);
select is(tests.ai(30,'rename_group',jsonb_build_object('group',tests.group_id('Eating together'),'label','Shared tables'))->>'status','ok','The facilitator renames a cluster');
select is(tests.ai(31,'pin_group',jsonb_build_object('group',tests.group_id('Shared tables')))->>'status','ok','pins it');
select is(tests.ai(32,'undo_group',jsonb_build_object('group',tests.group_id('People on the move')))->>'status','ok','and undoes the other');
reset role;
select is(jsonb_array_length(tests.results()->'groups'),1,'The undone cluster leaves the wall');
select is(tests.results()->'groups'->0->>'label','Shared tables','The renamed one stays');
set local role authenticated;
select tests.login(1);
select is(public.ai_status(tests.id(100),tests.id(410))->'session'->>'interaction','lens','The AI panel reports the lens step');
select is(jsonb_array_length(public.ai_status(tests.id(100),tests.id(410))->'groups'),2,'with both clusters, undone included');
select ok(position('Zebrafish we eat together' in public.ai_status(tests.id(100),tests.id(410))::text)>0,'and their sentences');
select is(tests.ai(33,'ai_off',jsonb_build_object('session',tests.id(410)))->>'status','ok','AI turns off');
reset role;
select is(tests.results()->>'ai','false','The wall is marked as plain');
select ok(tests.results()->'groups' is null,'with no clusters');
select is((tests.results()->>'total')::integer,5,'and all five sentences still count');
select is(tests.claim('off',410,913)->>'status','off','AI does no work while off');
set local role authenticated;
select tests.login(1);
select is(tests.ai(34,'ai_on',jsonb_build_object('session',tests.id(410)))->>'status','ok','AI turns back on');
reset role;
select is(jsonb_array_length(tests.results()->'groups'),1,'The standing cluster returns');

-- ---------- Lens 2 opens on its own turn ----------
set local role authenticated;
select tests.login(1);
select is(tests.ctl(5,'go_live',jsonb_build_object('session',tests.id(411)))->>'status','ok','Lens 2 goes live');
reset role;
select is(tests.opened(2),true,'Lens 2 opened');
select is(jsonb_array_length(tests.results()->'seeded'),2,'Its two seeded sentences arrive');
select ok(position('every week' in tests.results()::text)=0,'and lens 1''s live sentences stay on lens 1');
select is(tests.claim('second',411,921)->'inputs'->>'lens_name','Our neighbours','The second lens is named from the engagement');
select is(private.public_options((select x from public.sessions x where x.id=tests.id(411)),'{}'::jsonb)->'lens_names'->>1,'Our neighbours','Public options carry the engagement''s lens names');
select is(private.ai_on(tests.id(410)),true,'AI stays on for an unseeded lens session after every later migration');
select is(private.ai_on(tests.id(400)),false,'and stays off for the seeding step');

-- ---------- November 5: a seeded sentence may run to 400 characters; the live wall keeps its own limit ----------
set local role authenticated;
select tests.login(6);
select is(tests.send(90,400,repeat('x',400),jsonb_build_object('lens',3))->>'status','accepted','A seeded sentence of 400 characters lands although the step says 200');
select is(tests.send(91,400,repeat('x',401),jsonb_build_object('lens',3))->>'status','invalid_answer','but not 401');
select is(tests.send(92,411,repeat('x',201))->>'status','limit','A live lens sentence still stops at the step''s own limit');
reset role;
select is(length((tests.sentence(90)).text),400,'The 400 characters are stored whole');

select * from finish();
rollback;
