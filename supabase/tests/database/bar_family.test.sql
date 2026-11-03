begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('88000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(1000+n))::text,true); end $$;
create function tests.live() returns uuid language sql security definer set search_path='' as $$ select live_session_id from public.room_states where engagement_id=tests.id(100) $$;
create function tests.results() returns jsonb language sql security definer set search_path='' as $$ select results from public.room_states where engagement_id=tests.id(100) $$;
create function tests.version() returns bigint language sql security definer set search_path='' as $$ select version from public.room_states where engagement_id=tests.id(100) $$;
create function tests.options(n integer) returns jsonb language sql security definer set search_path='' as $$ select options from public.sessions where id=tests.id(n) $$;
create function tests.bar(k text) returns jsonb language sql security definer set search_path='' as $$
 select b from public.room_states r cross join lateral jsonb_array_elements(r.results->'bars') b where r.engagement_id=tests.id(100) and b->>'key'=k $$;
create function tests.ctl(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$
 select public.room_control(tests.id(100),tests.id(n),action,jsonb_build_object('from',tests.live())||p) $$;
create function tests.answer(n integer,session integer,value jsonb,action text default 'submit',revision integer default 0) returns jsonb language sql as $$
 select public.live_submit(tests.id(100),tests.id(n),tests.id(session),revision,action,'',now(),null,0,value) $$;
create function tests.save(n integer,kind text,options jsonb,revision integer default null) returns jsonb language sql as $$
 select public.show_write(tests.id(100),'save',jsonb_build_object('id',tests.id(n),'revision',revision,'title','Step '||n,'part','Day 1','mode','live','interaction',kind,
  'prompt','Prompt '||n,'phone_depth','','notes','','lands_in','','segment','','state','ready','planned_minutes',5,'max_sends',3,'max_characters',28,'max_words',3,
  'settings',jsonb_build_object('anonymous',true,'burst_minutes',4,'join_strip',false),'options',options)) $$;
create function tests.broadcasts() returns text language sql security definer set search_path='' as $$
 select coalesce(string_agg(payload::text,' '),'') from realtime.messages where topic like 'live:'||tests.id(100)||':%' $$;
create function tests.suggested(p uuid) returns boolean language sql security definer set search_path='' as $$ select exists(select 1 from private.ranking_suggestions where id=p) $$;
create function tests.items() returns jsonb language sql as $$ select public.control_status(tests.id(100))->'items' $$;
grant execute on all functions in schema tests to authenticated,anon,service_role;

insert into churches(id,name,timezone) values(tests.id(200),'Riverside Church','America/Toronto');
insert into engagements(id,church_id,title) values(tests.id(100),tests.id(200),'Bars room');
insert into auth.users(id,email,email_confirmed_at)
select tests.id(n),case when n=1 then 'fac1@clearway.co' else 'person'||n||'@example.org' end,now() from generate_series(1,9)n;
insert into auth.sessions(id,user_id) select tests.id(1000+n),tests.id(n) from generate_series(1,9)n;
insert into auth.identities(user_id,provider,provider_id,identity_data) select id,'google',id::text,jsonb_build_object('email',email,'email_verified',true) from auth.users where id=tests.id(1);
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method) values(gen_random_uuid(),tests.id(1001),now(),now(),'oauth');
insert into clearway_users(id,auth_user_id,name,email,is_admin,team_hub_team_member_id) values(tests.id(701),tests.id(1),'Chris Vacher','fac1@clearway.co',false,tests.id(801));
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values(tests.id(100),tests.id(701),'lead');
insert into attendees(id,engagement_id,auth_user_id,name,email,verified_at,room_role)
select tests.id(500+n),tests.id(100),tests.id(n),'Person '||n,'person'||n||'@example.org',now(),'participant' from generate_series(3,9) n where n<>4;
insert into device_sessions(engagement_id,attendee_id,auth_session_id) select tests.id(100),tests.id(500+n),tests.id(1000+n) from generate_series(3,9) n where n<>4;
insert into private.tv_devices(id,proof,engagement_id,label,paired_at) values(tests.id(450),repeat('b',64),tests.id(100),'Front TV',now());
insert into private.live_tv_sessions(id,engagement_id,auth_user_id,auth_session_id,device_id) values(tests.id(400),tests.id(100),tests.id(4),tests.id(1004),tests.id(450));

-- ---------- The registry ----------
select is((select array_agg(kind order by position) from private.interaction_kinds where kind in ('choice','scale','ranking','points','statements')),array['choice','scale','ranking','points','statements'],'The bar family is registered');
select ok((select bool_and(input and one_per_person and counts='people' and structured and shares_answers and spotlight='key' and named='never') from private.interaction_kinds where kind in ('choice','scale','ranking','points','statements')),
 'Each is one answer per person, counted by people, structured, spotlit by option key, anonymous');
select ok((select relforcerowsecurity from pg_class where oid='private.ranking_suggestions'::regclass),'Suggested options force row-level security');
select ok(not has_table_privilege('authenticated','private.ranking_suggestions','select'),'Browsers cannot read suggested options directly');
select ok(not has_function_privilege('authenticated','private.results_choice(uuid,uuid,text[])','execute'),'Browsers cannot call a results function');
select ok(not has_function_privilege('authenticated','private.parse_points(public.sessions,text,jsonb)','execute'),'Browsers cannot call a parse function');
select ok(not has_function_privilege('anon','public.ranking_control(uuid,uuid,text,jsonb)','execute'),'Signed-out callers cannot add options');
select ok(has_function_privilege('authenticated','public.ranking_suggest(uuid,uuid,uuid,text)','execute'),'Signed-in phones can suggest an option');
select is((select prosecdef from pg_proc where oid='public.ranking_control(uuid,uuid,text,jsonb)'::regprocedure),false,'The public wrapper is an invoker');

-- ---------- Options in the run of show ----------
set local role authenticated;
select tests.login(1);
select is(tests.save(310,'choice','{"items":[{"text":"  Reaching   new people "},{"text":"Next generation"},{"key":"sys","text":"Systems and data"}]}')->>'status','ok','Multiple choice saves its options');
select is(tests.save(311,'choice','{"items":[{"text":"Only one"}]}')->>'status','invalid_request','A choice needs two options');
select is(tests.save(311,'choice','{"items":[{"text":"Same"},{"text":"same"}]}')->>'status','invalid_request','Two options cannot say the same thing');
select is(tests.save(311,'choice','{"items":[{"text":"A"},{"text":"B"}],"colour":"red"}')->>'status','invalid_request','An unknown setting is refused');
select is(tests.save(311,'choice','{"items":[{"key":"Bad Key","text":"A"},{"text":"B"}]}')->>'status','invalid_request','A malformed option key is refused');
select is(tests.save(311,'choice','{}')->>'status','invalid_request','A choice cannot save without options');
select is(tests.save(311,'choice','{"items":[{"text":"Worship"},{"text":"Groups"},{"text":"Serving"},{"text":"Outreach"}],"multiple":true}')->>'status','ok','Pick any is a setting');
select is(tests.save(312,'scale','{"max":11}')->>'status','invalid_request','A scale runs to ten at most');
select is(tests.save(312,'scale','{"max":5,"low":"Not clear at all","high":"Crystal clear"}')->>'status','ok','A scale saves its range and end labels');
select is(tests.save(313,'ranking','{"items":[{"key":"a","text":"Alpha"},{"key":"b","text":"Beta"},{"key":"c","text":"Gamma"}],"suggest":true}')->>'status','ok','A ranking saves with Add an option');
select is(tests.save(314,'points','{"items":[{"key":"a","text":"Alpha"},{"key":"b","text":"Beta"},{"key":"c","text":"Gamma"}],"cut":3}')->>'status','invalid_request','The cut line must sit above the last option');
select is(tests.save(314,'points','{"items":[{"key":"a","text":"Alpha"},{"key":"b","text":"Beta"},{"key":"c","text":"Gamma"}],"cut":2}')->>'status','ok','100 points saves its cut line');
select is(tests.save(315,'statements','{"items":[{"key":"s1","text":"We know who we are trying to reach"},{"key":"s2","text":"Our leaders have room to lead"},{"key":"s3","text":"Decisions get made"}]}')->>'status','ok','Statements save');
select is(tests.save(316,'statements','{"items":[{"text":"1"},{"text":"2"},{"text":"3"},{"text":"4"},{"text":"5"},{"text":"6"},{"text":"7"},{"text":"8"},{"text":"9"}]}')->>'status','invalid_request','Up to eight statements');
select is(tests.save(316,'points','{"items":[{"text":"1"},{"text":"2"},{"text":"3"},{"text":"4"},{"text":"5"},{"text":"6"},{"text":"7"},{"text":"8"},{"text":"9"}]}')->>'status','invalid_request','Up to eight options for 100 points');
reset role;
select is(tests.options(310),'{"items":[{"key":"o1","text":"Reaching new people"},{"key":"o2","text":"Next generation"},{"key":"sys","text":"Systems and data"}],"multiple":false}'::jsonb,'Text is trimmed, keys are given and kept');
select is(tests.options(312)->'items'->0,'{"key":"1","text":"1 · Not clear at all"}'::jsonb,'The scale lists its numbers with labeled ends');
select is(tests.options(312)->'items'->-1,'{"key":"average","text":"The average"}'::jsonb,'and the average, so Spotlight can address it');
select is(tests.options(315)->>'low','Strongly disagree','Statements default their end labels');
select is(tests.options(315)->'flag_divided','true'::jsonb,'Flag divided statements is on by default');

-- ---------- INT-04 Multiple choice ----------
set local role authenticated;
select tests.login(1);
select is(tests.ctl(900,'go_live',jsonb_build_object('session',tests.id(310)))->>'status','ok','Go live on a pick one choice');
select is(tests.results()->'bars','[{"key":"o1","text":"Reaching new people","place":1,"count":0,"percent":0,"fraction":0,"leader":false},{"key":"o2","text":"Next generation","place":2,"count":0,"percent":0,"fraction":0,"leader":false},{"key":"sys","text":"Systems and data","place":3,"count":0,"percent":0,"fraction":0,"leader":false}]'::jsonb,
 'The empty structure: every option at zero, in the order written, nothing leading');
select is(tests.ctl(901,'spotlight','{"item":"o2"}')->>'status','ok','An option can be spotlit before anyone picks it');
select is(tests.ctl(902,'clear_spotlight')->>'status','ok','and cleared');
select tests.login(3);
select is(tests.answer(950,310,'{"choices":["o2"]}')->>'status','accepted','A pick is accepted');
select is(tests.answer(951,310,'{"choices":["o1","o2"]}')->>'status','invalid_answer','Pick one takes one');
select is(tests.answer(951,310,'{"choices":["nope"]}')->>'status','invalid_answer','An unknown option is refused');
select is(tests.answer(951,310,'{"choice":"o1"}')->>'status','invalid_answer','A value of the wrong shape is refused');
select tests.login(5);
select is(tests.answer(952,310,'{"choices":["o2"]}')->>'status','accepted','A second person picks the same');
select tests.login(6);
select is(tests.answer(953,310,'{"choices":["sys"]}')->>'status','accepted','A third picks another');
select is(tests.results()->>'people','3','Three answering');
select is(tests.bar('o2'),'{"key":"o2","text":"Next generation","place":1,"count":2,"percent":67,"fraction":1,"leader":true}'::jsonb,'The leader is on top in Sunrise, with n and percent');
select is(tests.bar('sys')->>'place','2','Rows follow the count');
select is(tests.bar('o1')->>'percent','0','An option nobody picked stays in the structure');
select tests.login(3);
select is(tests.answer(954,310,'{"choices":["sys"]}')->>'status','accepted','A person changes their pick');
select ok(tests.bar('o2')->>'count'='1' and tests.bar('sys')->>'count'='2' and tests.results()->>'people'='3','One bar shrinks, another grows, still three answering');
select tests.login(7);
select is(tests.answer(955,310,'{"choices":["o2"]}')->>'status','accepted','A tie');
select ok((tests.bar('o2')->>'leader')::boolean and (tests.bar('sys')->>'leader')::boolean,'Ties share the lead');
select tests.login(1);
select is(tests.ctl(903,'hide','{"item":"o1"}')->>'status','ok','Hide an option');
select is(jsonb_array_length(tests.results()->'bars'),2,'A hidden option leaves the TV');
select ok((select bool_or((i->>'hidden')::boolean) from jsonb_array_elements(tests.items()) i where i->>'key'='o1'),'and stays on the control surface to unhide');
select is((select i->>'text' from jsonb_array_elements(tests.items()) i where i->>'key'='o2'),'Next generation · 2 · 50%','Control surface items carry the same numbers');
select is(tests.ctl(904,'unhide','{"item":"o1"}')->>'status','ok','Unhide it');

-- Pick any: percentages are of people answering.
select is(tests.ctl(905,'go_live',jsonb_build_object('session',tests.id(311)))->>'status','ok','Go live on pick any');
select tests.login(3);
select is(tests.answer(960,311,'{"choices":["o1","o3"]}')->>'status','accepted','Pick any takes several');
select is(tests.answer(961,311,'{"choices":["o1","o1"]}')->>'status','invalid_answer','but each once');
select tests.login(5);
select is(tests.answer(962,311,'{"choices":["o1"]}')->>'status','accepted','Another picks one');
select ok(tests.results()->>'people'='2' and tests.bar('o1')->>'percent'='100' and tests.bar('o3')->>'percent'='50','Each percentage is of the two people answering');
select is(tests.results()->>'multiple','true','The TV knows it is pick any');

-- ---------- INT-05 Scale ----------
select tests.login(1);
select is(tests.ctl(906,'go_live',jsonb_build_object('session',tests.id(312)))->>'status','ok','Go live on a scale');
select ok(tests.results()->'scale'->'average'='null'::jsonb and jsonb_array_length(tests.results()->'scale'->'columns')=5,'Empty structure: five empty columns and no average yet');
select is(tests.ctl(907,'spotlight','{"item":"average"}')->>'status','ok','The average can be spotlit');
select tests.login(3); select is(tests.answer(970,312,'{"value":4}')->>'status','accepted','A 4');
select is(tests.answer(971,312,'{"value":6}')->>'status','invalid_answer','Beyond the range is refused');
select is(tests.answer(971,312,'{"value":2.5}')->>'status','invalid_answer','Only whole numbers');
select tests.login(5); select is(tests.answer(972,312,'{"value":5}')->>'status','accepted','A 5');
select tests.login(6); select is(tests.answer(973,312,'{"value":2}')->>'status','accepted','A 2');
select is(tests.results()->'scale'->>'average','3.7','The average, computed once');
select is(tests.results()->'scale'->'columns'->1,'{"key":"2","value":2,"count":1,"fraction":1}'::jsonb,'Each column has its count and height');
select ok(tests.results()->'scale'->>'low'='2' and tests.results()->'scale'->>'high'='5','The spread');
select tests.login(1);
select is((select i->>'text' from jsonb_array_elements(tests.items()) i where i->>'key'='average'),'The average · 3.7 average of 3','The control surface lists the average');

-- ---------- INT-06 Ranking, with Add an option ----------
select tests.login(1);
select is(tests.ctl(908,'go_live',jsonb_build_object('session',tests.id(313)))->>'status','ok','Go live on a ranking');
select is(tests.results()->'bars'->0->>'average',null,'Empty structure: no average yet');
select tests.login(3); select is(tests.answer(980,313,'{"order":["a","b","c"]}')->>'status','accepted','A full ranking');
select tests.login(5); select is(tests.answer(981,313,'{"order":["b"]}')->>'status','accepted','A partial ranking counts');
select is(tests.answer(982,313,'{"order":["b","b"]}')->>'status','invalid_answer','Each option once');
select is(tests.answer(982,313,'{"order":[]}')->>'status','invalid_answer','At least one option');
select is(tests.results()->'bars','[{"key":"b","text":"Beta","place":1,"ranked":2,"average":1.5,"fraction":0.8333,"leader":true},{"key":"a","text":"Alpha","place":2,"ranked":1,"average":1.8,"fraction":0.75,"leader":false},{"key":"c","text":"Gamma","place":3,"ranked":1,"average":2.8,"fraction":0.4167,"leader":false}]'::jsonb,
 'Unranked options take the middle of the remaining places; the order is by average place');
-- A phone suggests a missing option.
select tests.login(6);
select is(public.ranking_suggest(tests.id(100),tests.id(990),tests.id(313),'Prayer')->>'status','accepted','A phone suggests an option');
select is(public.ranking_suggest(tests.id(100),tests.id(990),tests.id(313),'Prayer')->>'status','duplicate','A resend is a duplicate');
select tests.login(7);
select is(public.ranking_suggest(tests.id(100),tests.id(991),tests.id(313),'Prayer and discernment!')->>'status','accepted','Another suggests a fuller wording');
select is(public.ranking_suggest(tests.id(100),tests.id(992),tests.id(313),'   ')->>'status','invalid_answer','An empty suggestion is refused');
select is(public.ranking_suggest(tests.id(100),tests.id(989),tests.id(313),'Absolute bullsh1t')->>'status','filtered','The word filter screens a suggestion');
select ok(not tests.suggested(tests.id(989)),'and nothing filtered is stored');
select is(public.ranking_suggest(tests.id(100),tests.id(993),tests.id(313),'Alpha')->>'status','accepted','A suggestion that matches an option still lands');
select is(public.ranking_suggest(tests.id(100),tests.id(994),tests.id(313),'Space')->>'status','accepted','Up to three each');
select is(public.ranking_suggest(tests.id(100),tests.id(995),tests.id(313),'More')->>'status','limit','and no more');
select is(public.ranking_suggestions_for(tests.id(100))->>'status','denied','Phones cannot read the suggestions');
select is(public.ranking_control(tests.id(100),tests.id(996),'add_option','{"ids":[],"text":"x"}')->>'status','denied','Phones cannot add options');
select tests.login(4);
select is(public.ranking_suggestions_for(tests.id(100))->>'status','denied','The TV cannot read the suggestions');
select ok(tests.broadcasts() not like '%Prayer%','Suggestions never reach the shared channel');
select tests.login(1);
select is(jsonb_array_length(public.ranking_suggestions_for(tests.id(100))->'groups'),3,'Suggestions that match by words show as one');
select is(public.ranking_suggestions_for(tests.id(100))->'groups'->0->>'text','Prayer and discernment!','The fullest wording leads the group');
select is(public.ranking_suggestions_for(tests.id(100))->'groups'->0->>'count','2','with both suggestions in it');
select is(public.ranking_suggestions_for(tests.id(100))->'groups'->1->'existing'->>'key','a','A suggestion that matches an option says so');
select is(public.ranking_control(tests.id(100),tests.id(997),'add_option',jsonb_build_object('ids',jsonb_build_array(tests.id(992)),'text','Prayer'))->>'status','missing','Only a waiting suggestion can be added');
create temporary table before_add as select tests.version() as v;
select is(public.ranking_control(tests.id(100),tests.id(1997),'add_option',jsonb_build_object('ids',jsonb_build_array(tests.id(990),tests.id(991)),'text','Prayer and discernment'))->>'status','ok','The facilitator adds it, merging the duplicates, with one tap');
select is(tests.version(),(select v+1 from before_add),'The room version rises once');
select is(public.ranking_control(tests.id(100),tests.id(1997),'add_option',jsonb_build_object('ids',jsonb_build_array(tests.id(990),tests.id(991)),'text','Prayer and discernment'))->>'status','duplicate','A repeated press is a duplicate');
select is(public.ranking_control(tests.id(100),tests.id(998),'add_option',jsonb_build_object('ids',jsonb_build_array(tests.id(993)),'text','alpha'))->>'status','exists','An option that already exists is not added twice');
select is(public.ranking_control(tests.id(100),tests.id(998),'dismiss',jsonb_build_object('ids',jsonb_build_array(tests.id(993))))->>'status','ok','Dismiss a suggestion');
select is(jsonb_array_length(public.ranking_suggestions_for(tests.id(100))->'groups'),1,'Only the undecided one is left');
reset role;
select is(jsonb_array_length(tests.options(313)->'items'),4,'The option joins the session');
select is(tests.options(313)->'items'->3->>'text','Prayer and discernment','as written by the facilitator');
select ok(tests.broadcasts() like '%Prayer and discernment%','It reaches every phone and the TV with the session');
select is((select count(*)::integer from private.ranking_suggestions where status='added' and option_key=(tests.options(313)->'items'->3->>'key')),2,'Both suggestions are marked added');
set local role authenticated;
select tests.login(1);
select ok(tests.bar('a')->>'average'='2.0' and tests.bar('b')->>'average'='1.5' and tests.bar('c')->>'average'='3.0' and tests.bar((tests.options(313)->'items'->3->>'key'))->>'average'='3.5',
 'Earlier rankings treat the added option as unranked');
select tests.login(8);
select is(tests.answer(983,313,jsonb_build_object('order',jsonb_build_array(tests.options(313)->'items'->3->>'key','a')))->>'status','accepted','Phones can rank the added option');

-- ---------- INT-07 100 points ----------
select tests.login(1);
select is(tests.ctl(909,'go_live',jsonb_build_object('session',tests.id(314)))->>'status','ok','Go live on 100 points');
select ok(tests.results()->>'cut'='2' and tests.results()->>'cut_label'='Top two' and tests.bar('a')->>'share'='0','Empty structure with the cut line in place');
select tests.login(3);
select is(tests.answer(1100,314,'{"points":{"a":50,"b":40}}')->>'status','invalid_answer','A person''s points count once all 100 are placed');
select is(tests.answer(1100,314,'{"points":{"a":60,"b":50}}')->>'status','invalid_answer','Never more than 100');
select is(tests.answer(1100,314,'{"points":{"a":50,"b":-10,"c":60}}')->>'status','invalid_answer','No negative points');
select is(tests.answer(1100,314,'{"points":{"z":100}}')->>'status','invalid_answer','Only the options');
select is(tests.answer(1100,314,'{"points":{"a":50,"b":30,"c":20}}')->>'status','accepted','A full budget');
select tests.login(5);
select is(tests.answer(1101,314,'{"points":{"c":100}}')->>'status','accepted','All on one');
select is(tests.results()->'bars'->0,'{"key":"c","text":"Gamma","place":1,"points":120,"share":60,"fraction":1,"leader":true}'::jsonb,'Each option''s share of the room''s points');
select ok(tests.bar('a')->>'share'='25' and tests.bar('b')->>'share'='15','Shares of everything placed');
select tests.login(3);
select is(tests.answer(1100,314,'{"points":{"a":100}}','change',1)->>'status','accepted','Points can move until the session closes');
select ok(tests.bar('a')->>'points'='100' and tests.bar('c')->>'points'='100' and (tests.bar('a')->>'leader')::boolean and (tests.bar('c')->>'leader')::boolean,'The move shows at once');

-- ---------- INT-17 Statements ----------
select tests.login(1);
select is(tests.ctl(910,'go_live',jsonb_build_object('session',tests.id(315)))->>'status','ok','Go live on statements');
select is(tests.results()->'bars'->0->>'key','s1','Empty structure: statements in the order written');
select is(tests.results()->>'low','Strongly disagree','The TV gets the end labels');
-- Four people split on s1: two strongly disagree, two strongly agree.
select tests.login(3); select is(tests.answer(1200,315,'{"ratings":{"s1":1}}')->>'status','accepted','Each tap sends');
select is(tests.answer(1201,315,'{"ratings":{"s1":1,"s2":5}}')->>'status','accepted','and the next tap sends the whole set');
select is(tests.answer(1202,315,'{"ratings":{"s1":6}}')->>'status','invalid_answer','Ratings run 1 to 5');
select is(tests.answer(1202,315,'{"ratings":{}}')->>'status','invalid_answer','At least one rating');
select tests.login(5); select is(tests.answer(1203,315,'{"ratings":{"s1":2,"s2":4}}')->>'status','accepted','Another person');
select tests.login(6); select is(tests.answer(1204,315,'{"ratings":{"s1":5,"s2":4,"s3":3}}')->>'status','accepted','Another');
select tests.login(7); select is(tests.answer(1205,315,'{"ratings":{"s1":4}}')->>'status','accepted','Another');
select is(tests.results()->>'people','4','Four answering, counted by people');
select is(tests.results()->'bars'->0,'{"key":"s2","text":"Our leaders have room to lead","place":1,"count":3,"average":4.3,"agree":100,"fraction":0.825,"leader":true}'::jsonb,'Ordered by average, with the share who agree');
select is(tests.bar('s1'),'{"key":"s1","text":"We know who we are trying to reach","place":2,"count":4,"average":3.0,"agree":50,"fraction":0.5,"leader":false}'::jsonb,'A split statement shows only its average and agree share');
select ok(tests.results()::text not like '%ivided%' and tests.broadcasts() not like '%Divided%' and tests.broadcasts() not like '%"divided"%','Divided never reaches the TV or the shared channel');
select tests.login(1);
select is((select i->>'divided' from jsonb_array_elements(tests.items()) i where i->>'key'='s1'),'true','Divided shows on the control surface');
select is((select i->>'text' from jsonb_array_elements(tests.items()) i where i->>'key'='s1'),'We know who we are trying to reach · 3.0 average · 50% agree · Divided: 2 disagree, 2 agree','with how the room split');
select is((select i->>'divided' from jsonb_array_elements(tests.items()) i where i->>'key'='s3'),'false','A statement with few answers is not flagged');
select tests.login(4);
select is(public.control_status(tests.id(100))->>'status','denied','The TV cannot read the control surface');
reset role;
update sessions set options=options||'{"flag_divided":false}' where id=tests.id(315);
set local role authenticated;
select tests.login(1);
select is((select i->>'divided' from jsonb_array_elements(tests.items()) i where i->>'key'='s1'),'false','Flag divided statements off: nothing is flagged');

select * from finish();
rollback;
