begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('87500000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(1000+n))::text,true); end $$;
create function tests.live() returns uuid language sql security definer set search_path='' as $$ select live_session_id from public.room_states where engagement_id=tests.id(100) $$;
create function tests.results() returns jsonb language sql security definer set search_path='' as $$ select results from public.room_states where engagement_id=tests.id(100) $$;
create function tests.version() returns bigint language sql security definer set search_path='' as $$ select version from public.room_states where engagement_id=tests.id(100) $$;
create function tests.word(t text) returns jsonb language sql security definer set search_path='' as $$
 select w from jsonb_array_elements((select results->'words' from public.room_states where engagement_id=tests.id(100))) w where w->>'text'=t $$;
create function tests.ctl(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$
 select public.room_control(tests.id(100),tests.id(n),action,jsonb_build_object('from',tests.live())||p) $$;
create function tests.ai(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$ select public.ai_control(tests.id(100),tests.id(n),action,p) $$;
create function tests.send(n integer,session integer,text text) returns jsonb language sql as $$
 select public.live_submit(tests.id(100),tests.id(n),tests.id(session),0,'submit',text,now(),null,0) $$;
create table tests.claims(name text primary key,j jsonb);
create function tests.claim(p_name text,session integer,lease integer) returns jsonb language plpgsql as $$
declare j jsonb;
begin
 j:=public.ai_claim(tests.id(session),tests.id(lease),'claude-test-model','{"combine_words":"combine-words@1","group_wall":"group-wall@1","summarize_wall":"summarize-wall@1","fold_questions":"fold-questions@1"}');
 insert into tests.claims(name,j) values(p_name,j) on conflict(name) do update set j=excluded.j;
 return j;
end $$;
create function tests.c(name text) returns jsonb language sql as $$ select j from tests.claims where claims.name=c.name $$;
-- The ref the run gave an item, by its text.
create function tests.ref(name text,list text,t text) returns text language sql as $$
 select x->>'ref' from jsonb_array_elements(tests.c(name)->'inputs'->list) x where x->>'text'=t or x->>'label'=t limit 1 $$;
create function tests.apply(name text,lease integer,output jsonb) returns jsonb language sql as $$
 select public.ai_apply((tests.c(name)->>'run')::uuid,tests.id(lease),output,'{"input_tokens":1200,"output_tokens":80,"cost_usd":0.0016,"ms":900}') $$;
create function tests.group_id(t text) returns uuid language sql security definer set search_path='' as $$ select id from private.ai_groups where label=t or ai_label=t order by created_at limit 1 $$;
create function tests.merge_id(member integer) returns uuid language sql security definer set search_path='' as $$ select id from private.qa_merges where member_id=tests.id(member) order by created_at desc limit 1 $$;
create function tests.runs() returns integer language sql security definer set search_path='' as $$ select count(*)::integer from private.ai_runs where engagement_id=tests.id(100) $$;
create function tests.output(name text) returns jsonb language sql security definer set search_path='' as $$
 select output from private.ai_runs where id=(select (j->>'run')::uuid from tests.claims where claims.name=output.name) $$;
grant all on tests.claims to authenticated,anon,service_role;
grant execute on all functions in schema tests to authenticated,anon,service_role;

insert into churches(id,name,timezone) values(tests.id(200),'Riverside Church','America/Toronto');
insert into engagements(id,church_id,title,settings) values(tests.id(100),tests.id(200),'AI room','{"ai_enabled":true}');
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
insert into sessions(id,engagement_id,title,part,position,interaction,prompt,state,max_sends,max_characters,max_words) values
 (tests.id(310),tests.id(100),'Celebration: one word','Day 1',0,'word_cloud','One word for this year','ready',20,28,3),
 (tests.id(320),tests.id(100),'Celebration wall','Day 1',1,'wall','What is worth celebrating?','ready',20,280,50),
 (tests.id(330),tests.id(100),'Questions','Day 1',2,'qa','What do you want to ask?','ready',20,200,50),
 (tests.id(340),tests.id(100),'Choice','Day 1',3,'word_cloud','Off by the run of show','ready',20,28,3);

-- ---------- Tables and privileges ----------
select ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where oid in('private.ai_sessions'::regclass,'private.ai_runs'::regclass,'private.ai_word_merges'::regclass,
 'private.ai_groups'::regclass,'private.ai_group_members'::regclass,'private.ai_summaries'::regclass)),'Every AI table forces row-level security');
select ok(not has_table_privilege('authenticated','private.ai_runs','select') and not has_table_privilege('authenticated','private.ai_groups','select')
 and not has_table_privilege('anon','private.ai_word_merges','select') and not has_table_privilege('authenticated','private.ai_summaries','select'),'Browsers cannot read AI runs, groups, merges or summaries');
select ok(not has_function_privilege('authenticated','public.ai_claim(uuid,uuid,text,jsonb)','execute') and not has_function_privilege('authenticated','public.ai_apply(uuid,uuid,jsonb,jsonb)','execute')
 and not has_function_privilege('anon','public.ai_fail(uuid,uuid,text,jsonb)','execute'),'Only the server''s worker can claim, apply or fail AI work');
select ok(has_function_privilege('service_role','public.ai_claim(uuid,uuid,text,jsonb)','execute') and has_function_privilege('service_role','public.ai_apply(uuid,uuid,jsonb,jsonb)','execute'),'The service role runs the worker');
select is((select prosecdef from pg_proc where oid='public.ai_control(uuid,uuid,text,jsonb)'::regprocedure),false,'Public AI wrappers run as the caller');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like 'ai\_%' and p.prosecdef
 and not coalesce(p.proconfig,array[]::text[]) @> array['search_path=""']),0,'Every private AI function pins its search path');

-- ---------- Switches and options ----------
select is(private.options_word_cloud('{}',tests.id(100)),'{}'::jsonb,'A word cloud keeps empty options');
select is(private.options_word_cloud('{"ai":false}',tests.id(100)),'{"ai":false}'::jsonb,'A word cloud takes ai');
select is(private.options_word_cloud('{"ai":"no"}',tests.id(100)),null,'ai is a yes or no setting');
select is(private.options_wall('{"ai":true,"summary":false}',tests.id(100)),'{"ai":true,"summary":false}'::jsonb,'A wall takes AI grouping and the summary');
select is(private.options_wall('{"colour":1}',tests.id(100)),null,'An unknown wall setting is refused');
select is(private.options_qa('{}',tests.id(100)),'{"any_time":false}'::jsonb,'Q&A options are unchanged without ai');
select is(private.options_qa('{"ai":false,"any_time":true}',tests.id(100)),'{"ai":false,"any_time":true}'::jsonb,'Q&A takes ai');
update sessions set options='{"ai":false}' where id=tests.id(340);
select ok(private.ai_on(tests.id(310)) and private.ai_on(tests.id(320)) and private.ai_on(tests.id(330)),'AI is on by default for the three AI kinds when the engagement has it on');
select ok(not private.ai_on(tests.id(340)),'The run of show can turn it off for a session');
update engagements set settings='{"ai_enabled":false}' where id=tests.id(100);
select ok(not private.ai_on(tests.id(310)),'The engagement switch turns it off everywhere');
select is(private.room_ai(tests.id(100)),false,'AI off: the room sign-in shows no AI line');
update engagements set settings='{"ai_enabled":true}' where id=tests.id(100);
-- The AI disclosure on the room sign-in follows the same switch (approved November 3).
select is(private.room_ai(tests.id(100)),true,'AI on: the room sign-in shows the AI line');
select is(private.room_ai(gen_random_uuid()),false,'No engagement, no line');
select ok(not has_function_privilege('anon','public.room_ai(uuid)','execute') and not has_function_privilege('authenticated','public.room_ai(uuid)','execute')
  and has_function_privilege('service_role','public.room_ai(uuid)','execute'),'Only the server reads the room''s AI line setting');
set local role service_role;
select is(public.room_ai(tests.id(100)),true,'The server reads it through the wrapper');
reset role;
select ok(private.ai_quoted('"Unless the Lord builds the house"') and private.ai_quoted('''faith''') and not private.ai_quoted('kids'' ministry'),'Quotes are found; an apostrophe is not a quote');
select is(private.ai_numbers('3 baptisms and 12 new families'),array['12','3'],'Numbers in a text');
select is(private.ai_label('  Baptisms   and   new faith '),'Baptisms and new faith','A label is one tidy line');
select is(private.ai_label('A label far too long to sit on the wall as a short label'),null,'Long labels are refused');
select is(private.ai_label('shit happens'),null,'Labels go through the word filter');

-- ---------- Word cloud: AI combines near-duplicates with undo ----------
set local role authenticated;
select tests.login(1);
select is(tests.ctl(1,'go_live',jsonb_build_object('session',tests.id(310)))->>'status','ok','The word cloud goes live');
select tests.login(3);
select is(tests.send(11,310,'youth, hope, joy, grace, family')->>'status','accepted','Answers land at once, before any AI');
reset role;
select is((tests.word('youth')->>'count')::integer,1,'The answer is on screen straight away');
select is(tests.claim('early',310,901)->>'status','idle','Under about 30 different answers, nothing to combine');
set local role authenticated;
select tests.login(3);
select tests.send(12,310,'young people, kids, momentum, welcome, prayer');
select tests.send(13,310,'baptisms, 3 baptisms, alpha, worship, outreach');
select tests.login(5);
select tests.send(14,310,'youth, generosity, unity, mission, healing');
select tests.send(15,310,'young people, students, seniors, serving, music');
select tests.send(16,310,'"faith", trust, peace, growth, change');
select tests.login(6);
select tests.send(17,310,'love, hospitality, renewal, courage, freedom');
select tests.send(18,310,'friendship, discipleship, harvest, light, joy');
reset role;
select ok((select count(*) from jsonb_array_elements(tests.results()->'words'))>=30,'Thirty or more different answers');
create temporary table v0 as select tests.version() as v;
set local role service_role;
select is(tests.claim('cloud',310,902)->>'status','claimed','The worker claims the combine');
reset role;
select is(tests.c('cloud')->>'job','combine_words','The job is combining words');
select ok((tests.c('cloud')->'inputs')::text not like '%Priya%' and (tests.c('cloud')->'inputs')::text not like '%'||tests.id(503)::text||'%' and (tests.c('cloud')->'inputs')::text not like '%example.org%',
 'Inputs never carry names, emails or attendee ids');
select is(tests.claim('busy',310,903)->>'status','busy','A second trigger while it runs is busy, so nothing runs twice');
select is(tests.version(),(select v from v0),'Claiming changes nothing on screen');
select is(tests.apply('cloud',902,jsonb_build_object('groups',jsonb_build_array(
  jsonb_build_object('survivor',tests.ref('cloud','words','youth'),'members',jsonb_build_array(tests.ref('cloud','words','young people'))),
  jsonb_build_object('survivor',tests.ref('cloud','words','baptisms'),'members',jsonb_build_array(tests.ref('cloud','words','3 baptisms'))),
  jsonb_build_object('survivor',tests.ref('cloud','words','trust'),'members',jsonb_build_array(tests.ref('cloud','words','"faith"'))),
  jsonb_build_object('survivor',tests.ref('cloud','words','love'),'members',jsonb_build_array(tests.ref('cloud','words','hope'),tests.ref('cloud','words','grace'),tests.ref('cloud','words','peace'),tests.ref('cloud','words','unity'))),
  jsonb_build_object('survivor','w999','members',jsonb_build_array(tests.ref('cloud','words','kids'))),
  jsonb_build_object('survivor',tests.ref('cloud','words','kids'),'members',jsonb_build_array(tests.ref('cloud','words','students')))
 )))->>'status','ok','The worker applies the run');
select is(tests.version(),(select v from v0)+1,'One version raise brings the combines to every screen');
select is((tests.word('youth')->>'count')::integer,4,'youth now counts young people with it');
select is(tests.word('youth')->'merged','["young people"]'::jsonb,'and names what it absorbed');
select is(tests.word('youth')->>'ai','true','A combined word is marked as AI');
select is(tests.word('young people'),null,'The absorbed word leaves the screen');
select is(tests.word('hope')->'ai',null,'A word AI did not combine carries no AI mark');
select is((select jsonb_agg(x->>'reason' order by x->>'reason') from jsonb_array_elements(tests.output('cloud')->'refused') x),'["number","quote","too_many","unknown"]'::jsonb,
 'Refused in code: a dropped number, a quote, five into one, an unknown ref');
select is((tests.word('kids')->>'count')::integer,2,'A valid group after refused ones still applies');
select is((tests.results()->>'total')::integer,40,'Combining never changes the answer count');
select is(tests.apply('cloud',902,'{"groups":[]}')->>'status','stale','The same run applied twice changes nothing');
select is((tests.word('youth')->>'count')::integer,4,'so nothing is merged twice');
select is((select concat_ws(',',status,model,prompt_version,input_tokens,output_tokens,cost_usd,ms) from private.ai_runs where id=(tests.c('cloud')->>'run')::uuid),
 'ok,claude-test-model,combine-words@1,1200,80,0.001600,900','Every run stores the model, the prompt version, the inputs, tokens, cost and time');
select ok((select inputs ? 'words' and output ? 'result' from private.ai_runs where id=(tests.c('cloud')->>'run')::uuid),'and its inputs and output');
select is(tests.claim('again',310,904)->>'status','idle','Nothing new, nothing to do');

-- 60 percent standing: never more than 40 percent of the different words go in one step.
set local role authenticated;
select tests.login(7);
select tests.send(19,310,'sunrise');
reset role;
select is(tests.claim('sixty',310,905)->>'status','claimed','A new word makes combining due again');
select is(tests.apply('sixty',905,(select jsonb_build_object('groups',jsonb_agg(jsonb_build_object('survivor',x->0->>'ref','members',jsonb_build_array(x->1->>'ref',x->2->>'ref',x->3->>'ref')))) from (
  select jsonb_agg(w order by o) as x from (select w,o,(o-1)/4 as b from jsonb_array_elements(tests.c('sixty')->'inputs'->'words') with ordinality t(w,o)
   where not (w->>'text' in ('"faith"','youth','kids','baptisms'))) z group by b having count(*)=4) y))->>'status','ok','A greedy run is applied');
select ok((select count(*) from jsonb_array_elements(tests.results()->'words'))>=0.6*(select count(*) from jsonb_array_elements(tests.c('sixty')->'inputs'->'words')),
 'At least 60 percent of the words are left standing');
select ok((select count(*) from jsonb_array_elements(tests.output('sixty')->'refused') x where x->>'reason'='standing')>0,'and the rest is refused as standing');

-- Undo the combine; the word is never combined again.
set local role authenticated;
select tests.login(1);
select is(public.ai_status(tests.id(100))->'combines'->0->>'survivor_text' is not null,true,'The control surface lists every combine');
create temporary table m1 as select (x->>'id')::uuid as id from jsonb_array_elements(public.ai_status(tests.id(100))->'combines') x where x->>'member'='young people';
select is(tests.ai(41,'undo_combine',jsonb_build_object('merge',(select id from m1)))->>'status','ok','Undo the combine');
select is(tests.ai(41,'undo_combine',jsonb_build_object('merge',(select id from m1)))->>'status','duplicate','A repeated press is a duplicate');
select is(tests.ai(42,'undo_combine',jsonb_build_object('merge',(select id from m1)))->>'status','unchanged','Undoing twice changes nothing');
reset role;
select is((tests.word('young people')->>'count')::integer,2,'Both words are back on the TV');
select is((tests.word('youth')->>'count')::integer,2,'youth shrinks back');
select ok(tests.word('youth')->'ai' is null,'and no longer carries the AI mark');
set local role authenticated;
select tests.login(6);
select tests.send(20,310,'courage again');
reset role;
select is(tests.claim('apart',310,906)->>'status','claimed','More words, another run');
select ok(tests.ref('apart','words','young people') is null,'A word whose combine was undone is not offered to AI again');
select is(tests.apply('apart',906,'{"groups":[]}')->>'status','ok','An empty answer is fine');

-- AI off for the session: the cloud stands as matching left it; back on, the combines return.
set local role authenticated;
select tests.login(1);
select is(tests.ai(43,'ai_off',jsonb_build_object('session',tests.id(310)))->>'status','ok','Turn AI off for the session');
reset role;
select ok(not exists(select 1 from jsonb_array_elements(tests.results()->'words') w where w ? 'ai'),'AI off: nothing on the TV is marked as AI');
select is((tests.word('baptisms')->>'count')::integer,1,'and words stand apart');
select is(tests.claim('off',310,907)->>'status','off','No AI work while it is off');
set local role authenticated;
select tests.login(1);
select is(tests.ai(44,'ai_on',jsonb_build_object('session',tests.id(310)))->>'status','ok','Turn AI back on');
select is(tests.ai(45,'ai_on',jsonb_build_object('session',tests.id(310)))->>'status','unchanged','Turning it on twice changes nothing');
reset role;
select is((tests.word('baptisms')->>'count')::integer,1,'baptisms stays as it is: 3 baptisms was refused, never merged');
select is((tests.word('kids')->>'count')::integer,2,'Combines come back with AI on');
update engagements set settings='{"ai_enabled":false}' where id=tests.id(100);
set local role authenticated;
select tests.login(1);
select is(tests.ai(46,'ai_on',jsonb_build_object('session',tests.id(310)))->>'status','engagement_off','The session cannot turn AI on when the engagement has it off');
reset role;
update engagements set settings='{"ai_enabled":true}' where id=tests.id(100);

-- A lease that expires: its late apply is stale.
set local role authenticated; select tests.login(7); select tests.send(21,310,'dawn'); reset role;
select is(tests.claim('slow',310,908)->>'status','claimed','A slow run');
update private.ai_sessions set lease_until=now()-interval '1 second' where session_id=tests.id(310);
set local role authenticated; select tests.login(7); select tests.send(22,310,'dusk'); reset role;
select is(tests.claim('next',310,909)->>'status','claimed','After the lease expires another worker takes over');
select is((select status from private.ai_runs where id=(tests.c('slow')->>'run')::uuid),'stale','The expired run is marked stale');
select is(tests.apply('slow',908,'{"groups":[]}')->>'status','stale','and its late apply changes nothing');
-- A failure: recorded, then a short cool-down.
select is(public.ai_fail((tests.c('next')->>'run')::uuid,tests.id(909),'timeout','{"ms":20000}')->>'status','ok','A timed-out call is recorded');
select is((select status||','||error from private.ai_runs where id=(tests.c('next')->>'run')::uuid),'failed,timeout','as failed');
select is(tests.claim('cool',310,910)->>'status','cooling','The worker waits before trying again');
set local role authenticated; select tests.login(1);
select ok((public.ai_status(tests.id(100))->'state'->>'failing')::boolean,'The control surface sees AI failing');
reset role;
update private.ai_sessions set last_failed_at=now()-interval '20 seconds' where session_id=tests.id(310);
select is(tests.claim('retry',310,911)->>'status','claimed','and tries again after the cool-down');
select is(tests.apply('retry',911,'{"groups":[]}')->>'status','ok','A good run clears it');

-- ---------- Wall: AI grouping with rename, undo, pin and off; Show summary ----------
set local role authenticated;
select tests.login(1);
select is(tests.ctl(2001,'go_live',jsonb_build_object('session',tests.id(320)))->>'status','ok','The wall goes live');
select tests.login(3);
select tests.send(31,320,'Three baptisms at Easter');
select tests.send(32,320,'Teenagers asking to be baptized');
select tests.send(33,320,'Our Alpha course was full');
select tests.login(5);
select tests.send(34,320,'Alpha guests stayed for church');
select tests.send(35,320,'New families at the kids program');
select tests.send(36,320,'Young families staying after the service');
select tests.send(37,320,'Baptism class doubled');
reset role;
select is((tests.results()->>'ai')::boolean,true,'The wall knows AI is on');
select is(tests.results()->'groups','[]'::jsonb,'No groups before AI has run: answers show in arrival order');
select is(tests.claim('wall',320,920)->>'job','group_wall','The worker claims the grouping');
select ok((tests.c('wall')->'inputs')::text not like '%Priya%' and (tests.c('wall')->'inputs')::text not like '%'||tests.id(503)::text||'%','Grouping inputs carry no names or attendee ids');
select is(tests.apply('wall',920,jsonb_build_object('groups',jsonb_build_array(
  jsonb_build_object('group','n1','label','Baptisms','answers',jsonb_build_array(tests.ref('wall','answers','Three baptisms at Easter'),tests.ref('wall','answers','Teenagers asking to be baptized'))),
  jsonb_build_object('group','n2','label','Alpha','answers',jsonb_build_array(tests.ref('wall','answers','Our Alpha course was full'),tests.ref('wall','answers','Alpha guests stayed for church'))),
  jsonb_build_object('group','n3','label','Young families','answers',jsonb_build_array(tests.ref('wall','answers','New families at the kids program'))),
  jsonb_build_object('group','n4','label','shit','answers',jsonb_build_array(tests.ref('wall','answers','Young families staying after the service'),tests.ref('wall','answers','Baptism class doubled'))),
  jsonb_build_object('group','n5','label','Again','answers',jsonb_build_array(tests.ref('wall','answers','Three baptisms at Easter'),tests.ref('wall','answers','Our Alpha course was full')))
 )))->>'status','ok','The grouping is applied');
select is((select jsonb_agg(g->>'label' order by g->>'label') from jsonb_array_elements(tests.results()->'groups') g),'["Alpha","Baptisms"]'::jsonb,'Two groups form, each from two answers');
select is((select jsonb_agg(x->>'reason' order by x->>'reason') from jsonb_array_elements(tests.output('wall')->'refused') x),'["label","too_few","too_few"]'::jsonb,
 'A one-answer group, a filtered label and answers already used are refused');
select is((select (g->>'count')::integer from jsonb_array_elements(tests.results()->'groups') g where g->>'label'='Baptisms'),2,'Each group counts its answers');
select is((tests.results()->>'total')::integer,7,'Grouping never changes the answer count');
-- More answers join a group, four at most per step; a pinned group is left alone.
set local role authenticated; select tests.login(6);
select tests.send(38,320,'Baptism Sunday was packed'); select tests.send(39,320,'Two adults baptized'); select tests.send(40,320,'A baptism in the river');
select tests.send(41,320,'Baptisms every month'); select tests.send(42,320,'Baptism stories shared');
select tests.login(1);
select is(tests.ai(51,'pin_group',jsonb_build_object('group',tests.group_id('Alpha')))->>'status','ok','Pin the Alpha group');
reset role;
select is(tests.claim('wall2',320,921)->>'job','group_wall','New answers make grouping due');
select is(tests.apply('wall2',921,jsonb_build_object('groups',jsonb_build_array(
  jsonb_build_object('group',tests.ref('wall2','groups','Baptisms'),'label','Baptisms and new faith','answers',(select jsonb_agg(x->>'ref') from jsonb_array_elements(tests.c('wall2')->'inputs'->'answers') x where x->>'text' ilike '%bapti%')),
  jsonb_build_object('group',tests.ref('wall2','groups','Alpha'),'label','Alpha course','answers',jsonb_build_array(tests.ref('wall2','answers','Young families staying after the service')))
 )))->>'status','ok','Applied');
select is((select (g->>'count')::integer from jsonb_array_elements(tests.results()->'groups') g where g->>'id'=(select id::text from private.ai_groups where label='Baptisms and new faith')),6,
 'A group gains at most four answers in one step');
select ok(exists(select 1 from jsonb_array_elements(tests.output('wall2')->'refused') x where x->>'reason'='too_many'),'The fifth waits for a later step');
select is((select label from private.ai_groups where id=tests.group_id('Alpha')),'Alpha','A pinned group keeps its label');
select ok(exists(select 1 from jsonb_array_elements(tests.output('wall2')->'refused') x where x->>'reason'='pinned'),'and AI cannot add to it');
-- Rename, and AI never renames it back.
create temporary table g2 as select id from private.ai_groups where label='Baptisms and new faith';
grant select on g2 to authenticated;
set local role authenticated; select tests.login(1);
select is(tests.ai(52,'rename_group',jsonb_build_object('group',(select id from g2),'label','Baptisms'))->>'status','ok','Rename a group');
select is(tests.ai(53,'rename_group',jsonb_build_object('group',(select id from g2),'label','damn shit'))->>'status','filtered','A rename goes through the word filter');
reset role;
select is((select g->>'label' from jsonb_array_elements(tests.results()->'groups') g where g->>'id'=(select id::text from g2)),'Baptisms','The TV shows the new name');
set local role authenticated; select tests.login(7); select tests.send(43,320,'Baptism of a grandmother'); reset role;
select is(tests.claim('wall3',320,922)->>'job','group_wall','Another step');
select is(tests.apply('wall3',922,jsonb_build_object('groups',jsonb_build_array(jsonb_build_object('group',tests.ref('wall3','groups','Baptisms'),'label','Water and faith',
 'answers',jsonb_build_array(tests.ref('wall3','answers','Baptism of a grandmother'))))))->>'status','ok','AI adds to a renamed group');
select is((select label from private.ai_groups where id=(select id from g2)),'Baptisms','but never renames it');
-- Undo a group: its answers go back to arrival order and AI never regroups them.
set local role authenticated; select tests.login(1);
select is(tests.ai(54,'undo_group',jsonb_build_object('group',(select id from g2)))->>'status','ok','Undo a group');
reset role;
select is((select count(*)::integer from jsonb_array_elements(tests.results()->'groups') g where g->>'id'=(select id::text from g2)),0,'It leaves the TV');
select ok(not exists(select 1 from private.ai_wall_open(tests.id(320)) o where o.id in(tests.id(31),tests.id(32),tests.id(37))),'Its answers stay apart from AI grouping');
set local role authenticated; select tests.login(1);
select is(tests.ai(55,'redo_group',jsonb_build_object('group',(select id from g2)))->>'status','ok','Redo brings it back');
reset role;
select is((select (g->>'count')::integer from jsonb_array_elements(tests.results()->'groups') g where g->>'id'=(select id::text from g2)),7,'with its answers');
-- Undo last AI change: the latest run, at once.
set local role authenticated; select tests.login(1);
select is(tests.ai(56,'undo_last',jsonb_build_object('session',tests.id(320)))->>'status','ok','Undo last AI change');
reset role;
select is((select (g->>'count')::integer from jsonb_array_elements(tests.results()->'groups') g where g->>'id'=(select id::text from g2)),6,'takes back what the latest run added');
-- The summary appears only after Show summary.
select isnt(tests.claim('nosum',320,923)->>'job','summarize_wall','No summary is written before Show summary');
select ok(not (tests.results() ? 'summary'),'and none reaches the TV');
set local role authenticated; select tests.login(1);
select is(tests.ai(57,'show_summary',jsonb_build_object('session',tests.id(320)))->>'status','ok','Show summary');
reset role;
select ok(not (tests.results() ? 'summary'),'Nothing shows until a summary is written');
update private.ai_sessions set lease_until=null,lease_id=null where session_id=tests.id(320);
select is(tests.claim('sum',320,924)->>'job','summarize_wall','The summary is due');
select ok(jsonb_array_length(tests.c('sum')->'inputs'->'answers')=13 and tests.c('sum')->'inputs'->>'question'='What is worth celebrating?','It reads the question and the wall''s answers');
select is(tests.apply('sum',924,'{"summary":"Baptisms lead: people are taking a public step of faith, and Alpha is filling up."}')->>'status','ok','Applied');
select is(tests.results()->'summary'->>'text','Baptisms lead: people are taking a public step of faith, and Alpha is filling up.','The summary reaches the TV');
select is(tests.claim('sum2',320,925)->>'status','idle','It refreshes only after 8 new answers or 75 seconds');
alter table private.ai_summaries disable trigger touch_record;
update private.ai_summaries set created_at=clock_timestamp()-interval '80 seconds' where session_id=tests.id(320);
alter table private.ai_summaries enable trigger touch_record;
set local role authenticated; select tests.login(7); select tests.send(44,320,'Prayer team growing'); reset role;
select is(tests.claim('sum3',320,926)->>'job','summarize_wall','After 75 seconds and a new answer it refreshes');
select is(tests.apply('sum3',926,'{"summary":"shit"}')->>'status','ok','Applied');
select ok(exists(select 1 from jsonb_array_elements(tests.output('sum3')->'refused') x where x->>'reason'='filtered'),'A summary goes through the word filter');
set local role authenticated; select tests.login(1);
select is(tests.ai(58,'hide_summary',jsonb_build_object('session',tests.id(320)))->>'status','ok','Hide summary');
reset role;
select ok(not (tests.results() ? 'summary'),'The summary leaves the TV');
update sessions set options='{"summary":false}' where id=tests.id(320);
set local role authenticated; select tests.login(1);
select is(tests.ai(59,'show_summary',jsonb_build_object('session',tests.id(320)))->>'status','invalid_state','No summary when the run of show turned it off');
reset role;
update sessions set options='{}' where id=tests.id(320);
-- AI off: the wall shows arrival order.
set local role authenticated; select tests.login(1);
select is(tests.ai(60,'ai_off',jsonb_build_object('session',tests.id(320)))->>'status','ok','Turn AI off for the wall');
reset role;
select is((tests.results()->>'ai')::boolean,false,'The TV falls back to arrival order');
select ok(not (tests.results() ? 'groups'),'with no groups');
set local role authenticated; select tests.login(1);
select tests.ai(61,'ai_on',jsonb_build_object('session',tests.id(320)));
reset role;
select ok(jsonb_array_length(tests.results()->'groups')>0,'Back on, the groups return from what is there');

-- ---------- Q&A: folding by AI into step 4's merges ----------
set local role authenticated;
select tests.login(1);
select is(tests.ctl(2002,'go_live',jsonb_build_object('session',tests.id(330)))->>'status','ok','Q&A goes live');
select tests.login(3); select tests.send(71,330,'When does the new building open?');
select tests.login(5); select tests.send(72,330,'What date will the renovation be finished?');
select tests.login(6); select tests.send(73,330,'Will there be 2 services in the fall?');
select tests.login(7); select tests.send(74,330,'Will we keep two services?');
select tests.login(3); select tests.send(75,330,'How is the budget looking?');
reset role;
select is(tests.claim('qa',330,930)->>'job','fold_questions','The worker claims the folding');
select is(tests.apply('qa',930,jsonb_build_object('groups',jsonb_build_array(
  jsonb_build_object('survivor',tests.ref('qa','questions','When does the new building open?'),'members',jsonb_build_array(tests.ref('qa','questions','What date will the renovation be finished?'))),
  jsonb_build_object('survivor',tests.ref('qa','questions','Will we keep two services?'),'members',jsonb_build_array(tests.ref('qa','questions','Will there be 2 services in the fall?')))
 )))->>'status','ok','Applied');
select is((select concat_ws(',',e->>'askers',e->>'ai') from jsonb_array_elements(tests.results()->'questions') e where e->>'id'=tests.id(71)::text),'2,true','A folded question shows asked by 2, marked as AI');
select ok(exists(select 1 from jsonb_array_elements(tests.output('qa')->'refused') x where x->>'reason'='number'),'A fold that would drop a number is refused');
select is((select made_by||','||(detail->>'prompt_version') from private.qa_merges where member_id=tests.id(72)),'ai,fold-questions@1','AI folds are step 4''s merges with the AI marker');
set local role authenticated; select tests.login(1);
select ok(exists(select 1 from jsonb_array_elements(public.qa_status(tests.id(100))->'questions') q cross join lateral jsonb_array_elements(q->'members') m where m->>'by'='ai'),'The Q&A panel shows the fold as AI''s');
select is(public.qa_control(tests.id(100),tests.id(80),'undo_fold',jsonb_build_object('merge',tests.merge_id(72)))->>'status','ok','Undo fold works the same for AI');
reset role;
select is((select (e->>'askers')::integer from jsonb_array_elements(tests.results()->'questions') e where e->>'id'=tests.id(72)::text),1,'The question is back as its own');
set local role authenticated; select tests.login(5); select tests.send(76,330,'Any news on the building opening date?'); reset role;
select is(tests.claim('qa2',330,931)->>'job','fold_questions','Another step');
select is(tests.apply('qa2',931,jsonb_build_object('groups',jsonb_build_array(
  jsonb_build_object('survivor',tests.ref('qa2','questions','When does the new building open?'),'members',jsonb_build_array(tests.ref('qa2','questions','What date will the renovation be finished?'))),
  jsonb_build_object('survivor',tests.ref('qa2','questions','When does the new building open?'),'members',jsonb_build_array(tests.ref('qa2','questions','Any news on the building opening date?')))
 )))->>'status','ok','Applied');
select is((select (e->>'askers')::integer from jsonb_array_elements(tests.results()->'questions') e where e->>'id'=tests.id(71)::text),2,'A new near-duplicate still folds');
select ok(exists(select 1 from jsonb_array_elements(tests.output('qa2')->'refused') x where x->>'reason'='kept_apart'),'A question whose fold was undone is never refolded');
-- Edited questions are not refolded.
set local role authenticated; select tests.login(1);
select public.qa_control(tests.id(100),tests.id(81),'edit',jsonb_build_object('question',tests.id(75),'text','How is the budget this year?'));
select tests.login(7); select tests.send(77,330,'Are we on budget?');
reset role;
select is(tests.claim('qa3',330,932)->>'job','fold_questions','Another step');
select ok(tests.ref('qa3','questions','How is the budget this year?') is null,'An edited question is not offered to AI');
select is(tests.apply('qa3',932,'{"groups":[]}')->>'status','ok','Applied');
-- AI off: AI folds stand apart, word folds stay.
set local role authenticated; select tests.login(1);
select tests.ai(82,'ai_off',jsonb_build_object('session',tests.id(330)));
reset role;
select is((select (e->>'askers')::integer from jsonb_array_elements(tests.results()->'questions') e where e->>'id'=tests.id(71)::text),1,'AI off: the AI fold stands apart');
select ok(not exists(select 1 from jsonb_array_elements(tests.results()->'questions') e where e ? 'ai'),'and nothing is marked as AI');
set local role authenticated; select tests.login(1);
select tests.ai(83,'ai_on',jsonb_build_object('session',tests.id(330)));
reset role;
select is((select (e->>'askers')::integer from jsonb_array_elements(tests.results()->'questions') e where e->>'id'=tests.id(71)::text),2,'Back on, the fold returns');

-- ---------- The control surface: status, cost, roles ----------
set local role authenticated; select tests.login(1);
select ok((public.ai_status(tests.id(100))->'cost'->>'usd')::numeric>0,'Cost per engagement is logged');
select is((public.ai_status(tests.id(100))->'cost'->>'runs')::integer,tests.runs(),'every run counted');
select is(public.ai_status(tests.id(100),tests.id(320))->'session'->>'interaction','wall','The panel can read a named session');
select ok((public.ai_status(tests.id(100),tests.id(320))->>'grouped')::integer>0,'with how many answers AI grouped');
select is(tests.ai(84,'undo_last',jsonb_build_object('session',tests.id(310)))->>'status','ok','Undo last works for the word cloud');
select tests.login(3);
select is(public.ai_status(tests.id(100))->>'status','denied','A participant cannot read the AI panel');
select is(tests.ai(85,'ai_off',jsonb_build_object('session',tests.id(330)))->>'status','denied','or press its controls');
select throws_ok($$ select public.ai_claim(tests.id(330),tests.id(999),'x','{}') $$,'42501',null,'or run the worker');
reset role;
select ok((select count(*) from private.room_controls where engagement_id=tests.id(100) and action='undo_ai_combine')=1,'Each AI press is logged once in plain words');
select is(jsonb_array_length(private.ai_due(tests.id(100))),1,'The live session is due for AI work');

-- ---------- Clear test answers retires everything AI made from them (step 6a's rehearsal) ----------
insert into sessions(id,engagement_id,title,part,position,interaction,prompt,state,max_sends,max_characters,max_words) values
 (tests.id(350),tests.id(100),'Rehearse: one word','Day 1',10,'word_cloud','One word','ready',20,28,3),
 (tests.id(360),tests.id(100),'Rehearse: wall','Day 1',11,'wall','What is worth celebrating?','ready',20,280,50),
 (tests.id(370),tests.id(100),'Rehearse: questions','Day 1',12,'qa','What do you want to ask?','ready',20,200,50);
create function tests.live_count(p_table text) returns integer language plpgsql security definer set search_path='' as $$
declare n integer; begin execute format('select count(*)::integer from private.%I where session_id in(%L,%L,%L) and not deleted',p_table,tests.id(350),tests.id(360),tests.id(370)) into n; return n; end $$;
create function tests.rs(n integer) returns jsonb language sql security definer set search_path='' as $$
 select private.live_results_for(tests.id(100),tests.id(n),array[]::text[]) $$;
grant execute on all functions in schema tests to authenticated,anon,service_role;
set local role authenticated; select tests.login(1);
select is(tests.ctl(3001,'nothing_live')->>'status','ok','Nothing live before rehearsing');
select is(public.rehearsal_control(tests.id(100),tests.id(3002),'start')->>'status','ok','A rehearsal starts');
select is(tests.ctl(3003,'go_live',jsonb_build_object('session',tests.id(350)))->>'status','ok','The rehearsal word cloud goes live');
select tests.login(3);
select tests.send(101,350,'youth, young people, hope, joy, grace');
select tests.send(102,350,'family, momentum, welcome, prayer, music');
select tests.send(103,350,'unity, mission, healing, light, peace');
select tests.login(5);
select tests.send(104,350,'kids, students, seniors, serving, outreach');
select tests.send(105,350,'alpha, worship, freedom, courage, renewal');
select tests.send(106,350,'harvest, friendship, love, care, trust');
reset role;
select ok((select bool_and(test) from submissions where session_id=tests.id(350)),'Rehearsal answers are test answers');
select is(tests.claim('rcloud',350,940)->>'job','combine_words','AI works on test answers like any others');
select is(tests.apply('rcloud',940,jsonb_build_object('groups',jsonb_build_array(
 jsonb_build_object('survivor',tests.ref('rcloud','words','youth'),'members',jsonb_build_array(tests.ref('rcloud','words','young people'))),
 jsonb_build_object('survivor',tests.ref('rcloud','words','kids'),'members',jsonb_build_array(tests.ref('rcloud','words','students'))))))->>'status','ok','and combines them');
set local role authenticated; select tests.login(1);
select is(tests.ai(3004,'undo_combine',jsonb_build_object('merge',(select (x->>'id')::uuid from jsonb_array_elements(public.ai_status(tests.id(100),tests.id(350))->'combines') x where x->>'member'='student')))->>'status','ok','An undone combine during the rehearsal');
select is(tests.ctl(3005,'go_live',jsonb_build_object('session',tests.id(360)))->>'status','ok','The rehearsal wall goes live');
select tests.login(6);
select tests.send(111,360,'Three baptisms at Easter'); select tests.send(112,360,'Baptism class doubled'); select tests.send(113,360,'Alpha was full');
reset role;
select is(tests.claim('rwall',360,941)->>'job','group_wall','AI groups the test answers');
select is(tests.apply('rwall',941,jsonb_build_object('groups',jsonb_build_array(jsonb_build_object('group','n1','label','Baptisms','answers',
 jsonb_build_array(tests.ref('rwall','answers','Three baptisms at Easter'),tests.ref('rwall','answers','Baptism class doubled'))))))->>'status','ok','A group from test answers');
set local role authenticated; select tests.login(1);
select is(tests.ai(3006,'show_summary',jsonb_build_object('session',tests.id(360)))->>'status','ok','Show summary during the rehearsal');
reset role;
select is(tests.claim('rsum',360,942)->>'job','summarize_wall','A summary of test answers');
select is(tests.apply('rsum',942,'{"summary":"Baptisms lead the rehearsal."}')->>'status','ok','is written');
set local role authenticated; select tests.login(1);
select is(tests.ctl(3007,'go_live',jsonb_build_object('session',tests.id(370)))->>'status','ok','The rehearsal Q&A goes live');
select tests.login(7);
select tests.send(121,370,'When does the new building open?'); select tests.send(122,370,'What date will the renovation be done?');
reset role;
select is(tests.claim('rqa',370,943)->>'job','fold_questions','AI folds test questions');
select is(tests.apply('rqa',943,jsonb_build_object('groups',jsonb_build_array(jsonb_build_object('survivor',tests.ref('rqa','questions','When does the new building open?'),
 'members',jsonb_build_array(tests.ref('rqa','questions','What date will the renovation be done?')))))) ->>'status','ok','and folds them');
select ok(tests.live_count('ai_word_merges')=2 and tests.live_count('ai_groups')=1 and tests.live_count('ai_summaries')=1 and tests.live_count('ai_runs')=4,'The rehearsal left AI records behind');
set local role authenticated; select tests.login(1);
select is(public.rehearsal_control(tests.id(100),tests.id(3008),'clear')->>'status','live','Clear is refused while a session is live (6a)');
select is(tests.ctl(3009,'nothing_live')->>'status','ok','Nothing live');
select is(public.rehearsal_control(tests.id(100),tests.id(3010),'clear')->>'status','ok','Clear test answers');
reset role;
select is((select count(*)::integer from private.ai_word_merges where session_id=tests.id(350) and not deleted),0,'Every combine that touched a test word is gone, undone ones too');
select is(tests.live_count('ai_group_members')+tests.live_count('ai_groups'),0,'Groups built from test answers are gone');
select is(tests.live_count('ai_summaries'),0,'The summary of test answers is gone');
select is(tests.live_count('ai_runs'),0,'The rehearsal''s AI runs are retired');
select is((select count(*)::integer from private.qa_merges where session_id=tests.id(370) and not deleted),0,'AI folds of test questions are gone (6a clears merges)');
select ok((select bool_and(not summary_shown and lease_id is null and combine_seen=0 and group_seen_at is null and fold_seen_at is null and last_ok_at is null)
 from private.ai_sessions where session_id in(tests.id(350),tests.id(360),tests.id(370))),'The sessions'' AI state starts clean: no lease, no watermarks, Show summary off');
select is(tests.rs(350)->'words','[]'::jsonb,'The word cloud shows nothing of the rehearsal');
select is((tests.rs(360)->'groups')||jsonb_build_array(tests.rs(360) ? 'summary'),'[false]'::jsonb,'The wall shows no group and no summary');
select is(tests.rs(370)->'questions','[]'::jsonb,'Q&A shows nothing of the rehearsal');
select ok((public.ai_status(tests.id(100))->'cost'->>'runs')::integer=tests.runs(),'The cost log still counts what the rehearsal spent');
-- A real answer afterwards behaves normally.
set local role authenticated; select tests.login(1);
select is(tests.ctl(3011,'go_live',jsonb_build_object('session',tests.id(360)))->>'status','ok','The real session goes live');
select tests.login(6);
select tests.send(131,360,'Three baptisms at Easter'); select tests.send(132,360,'Baptism class doubled');
reset role;
select ok(not (select bool_or(test) from submissions where id in(tests.id(131),tests.id(132))),'Real answers are not test answers');
select is((tests.results()->>'total')::integer,2,'Only the real answers count');
select is(tests.results()->'groups','[]'::jsonb,'No rehearsal group carries over');
select ok(not (tests.results() ? 'summary'),'No summary until Show summary is tapped again');
select is(tests.claim('real',360,944)->>'job','group_wall','AI groups the real answers afresh');
select is(jsonb_array_length(tests.c('real')->'inputs'->'answers'),2,'with both real answers offered, nothing kept apart by the rehearsal');
select is(tests.apply('real',944,jsonb_build_object('groups',jsonb_build_array(jsonb_build_object('group','n1','label','Baptisms','answers',
 jsonb_build_array(tests.ref('real','answers','Three baptisms at Easter'),tests.ref('real','answers','Baptism class doubled'))))))->>'status','ok','Applied');
select is((tests.results()->'groups'->0->>'count')::integer,2,'A real group forms as normal');

select * from finish();
rollback;
