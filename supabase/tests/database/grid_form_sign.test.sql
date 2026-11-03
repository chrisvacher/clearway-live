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
create function tests.ctl(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$
 select public.room_control(tests.id(100),tests.id(n),action,jsonb_build_object('from',tests.live())||p) $$;
create function tests.grid(n integer,action text,p jsonb) returns jsonb language sql as $$
 select public.grid_control(tests.id(100),tests.id(n),action,jsonb_build_object('from',tests.live())||p) $$;
create function tests.sign(n integer,p jsonb default '{}') returns jsonb language sql as $$
 select public.sign_control(tests.id(100),tests.id(n),'close',jsonb_build_object('from',tests.live())||p) $$;
create function tests.send(n integer,session integer,value jsonb,action text default 'submit',revision integer default 0,queued timestamptz default null) returns jsonb language sql as $$
 select public.live_submit(tests.id(100),tests.id(n),tests.id(session),revision,action,'',now(),queued,0,value) $$;
create function tests.save(n integer,kind text,options jsonb,anonymous boolean default true,revision integer default null) returns jsonb language sql as $$
 select public.show_write(tests.id(100),'save',jsonb_build_object('id',tests.id(n),'revision',revision,'title','Step '||n,'part','Day 1','mode','live','interaction',kind,
  'prompt','Prompt '||n,'phone_depth','','notes','','lands_in','','segment','','state','ready','planned_minutes',5,'max_sends',3,'max_characters',28,'max_words',3,
  'settings',jsonb_build_object('anonymous',anonymous,'burst_minutes',4,'join_strip',false),'options',options)) $$;
create function tests.event(n integer) returns jsonb language sql security definer set search_path='' as $$
 select payload from realtime.messages where topic like 'live:'||tests.id(100)||':%' and event='room' and payload->'answer'->>'id'=tests.id(n)::text order by (payload->'state'->>'version')::bigint desc limit 1 $$;
create function tests.events_text() returns text language sql security definer set search_path='' as $$
 select coalesce(string_agg(payload::text,' '),'') from realtime.messages where topic like 'live:'||tests.id(100)||':%' $$;
create function tests.item(results jsonb,k text) returns jsonb language sql immutable as $$ select i from jsonb_array_elements(results->'items') i where i->>'key'=k $$;
grant execute on all functions in schema tests to authenticated,anon,service_role;

insert into churches(id,name,timezone) values(tests.id(200),'Riverside Church','America/Toronto');
insert into engagements(id,church_id,title) values(tests.id(100),tests.id(200),'Grid form sign room');
insert into auth.users(id,email,email_confirmed_at)
select tests.id(n),case when n=1 then 'fac1@clearway.co' else 'person'||n||'@example.org' end,now() from generate_series(1,6)n;
insert into auth.sessions(id,user_id) select tests.id(1000+n),tests.id(n) from generate_series(1,6)n;
insert into auth.identities(user_id,provider,provider_id,identity_data) select id,'google',id::text,jsonb_build_object('email',email,'email_verified',true) from auth.users where id=tests.id(1);
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method) values(gen_random_uuid(),tests.id(1001),now(),now(),'oauth');
insert into clearway_users(id,auth_user_id,name,email,is_admin,team_hub_team_member_id) values(tests.id(701),tests.id(1),'Chris Vacher','fac1@clearway.co',false,tests.id(801));
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values(tests.id(100),tests.id(701),'lead');
insert into attendees(id,engagement_id,auth_user_id,name,email,verified_at,room_role) values
 (tests.id(503),tests.id(100),tests.id(3),'Priya Shah','person3@example.org',now(),'participant'),
 (tests.id(505),tests.id(100),tests.id(5),'Ben Ortiz','person5@example.org',now(),'participant'),
 (tests.id(506),tests.id(100),tests.id(6),'Ruth Morrison','person6@example.org',now(),'participant');
insert into device_sessions(engagement_id,attendee_id,auth_session_id) values(tests.id(100),tests.id(503),tests.id(1003)),(tests.id(100),tests.id(505),tests.id(1005)),(tests.id(100),tests.id(506),tests.id(1006));
insert into private.tv_devices(id,proof,engagement_id,label,paired_at) values(tests.id(450),repeat('a',64),tests.id(100),'Front TV',now());
insert into private.live_tv_sessions(id,engagement_id,auth_user_id,auth_session_id,device_id) values(tests.id(400),tests.id(100),tests.id(4),tests.id(1004),tests.id(450));

-- ---------- The registry ----------
select ok((select array_agg(kind) from private.interaction_kinds) @> array['grid','form','sign'],'Grid, form and sign are registered');
select is((select row(one_per_person,counts,structured,shares_answers,spotlight,named)::text from private.interaction_kinds where kind='grid'),'(t,people,t,t,key,never)','Grid: one per person, counted by people, structured, Spotlight by item key');
select is((select row(one_per_person,counts,shares_answers,spotlight,named)::text from private.interaction_kinds where kind='form'),'(t,people,f,none,never)','Form: one per person, people, answers never shared, no Spotlight');
select is((select row(one_per_person,counts,shares_answers,spotlight,named)::text from private.interaction_kinds where kind='sign'),'(t,people,t,id,always)','Sign: one per person, people, Spotlight and Hide by answer id, named by design');
select ok(not has_table_privilege('authenticated','private.grid_merges','select'),'Browsers cannot read grid merges directly');
select ok((select relforcerowsecurity from pg_class where oid='private.grid_merges'::regclass),'Grid merges force row-level security');

set local role authenticated;
select tests.login(1);
-- ---------- Options ----------
select is(tests.save(310,'grid',jsonb_build_object('x_label','Effort','x_low','Low','x_high','High','y_label','Impact','y_low','Low','y_high','High','legend','Ideas',
  'items',jsonb_build_array(jsonb_build_object('key','a1','text','Online newcomer path'),jsonb_build_object('key','b2','text','  Prayer   room '),jsonb_build_object('key','c3','text','Leader residency'))))->>'status','ok','A grid saves its axes, end labels and items');
select is(tests.save(311,'grid',jsonb_build_object('items',(select jsonb_agg(jsonb_build_object('key','k'||n,'text','Item '||n)) from generate_series(1,11)n)))->>'status','invalid_request','A grid holds ten items at most');
select is(tests.save(311,'grid',jsonb_build_object('items',(select jsonb_agg(jsonb_build_object('key','k'||n,'text','Item '||n)) from generate_series(1,10)n)))->>'status','ok','Ten items save');
select is(tests.save(312,'grid','{"items":[{"key":"a","text":"Same"},{"key":"b","text":"same"}]}')->>'status','invalid_request','Two items cannot share a name');
select is(tests.save(312,'grid','{"items":[{"key":"A B","text":"Bad key"}]}')->>'status','invalid_request','Item keys are checked');
select is(tests.save(312,'grid','{"colour":"red"}')->>'status','invalid_request','An unknown grid setting is refused');
select is(tests.save(312,'grid','{"preset":"pre_mortem","x_label":"Likelihood","x_low":"Unlikely","x_high":"Likely","y_label":"Impact","legend":"Reasons it failed","items":[{"key":"r1","text":"Leaders already at capacity"}]}')->>'status','ok','The pre-mortem preset saves');
select is(tests.save(313,'grid','{}')->>'status','ok','A grid with no items yet saves as a draft would');
select is(tests.save(320,'form','{"questions":[{"key":"q1","text":"What would make this retreat a win for you?"},{"key":"q2","text":"Anything we should know before tomorrow?"}]}')->>'status','ok','A form saves its questions');
select is(tests.save(321,'form',jsonb_build_object('questions',(select jsonb_agg(jsonb_build_object('key','q'||n,'text','Question '||n)) from generate_series(1,9)n)))->>'status','invalid_request','A form holds eight questions at most');
select is(tests.save(321,'form','{"questions":[]}',false)->>'status','invalid_request','A private form is never named on the screen');
select is(tests.save(330,'sign','{"text":"We commit to these goals.\n\n## Our first goal\nLaunch the residency."}',false)->>'status','ok','Sign together saves its text, named');
select is(tests.save(331,'sign','{"text":"Text"}',true)->>'status','invalid_request','Sign together cannot be anonymous: it is named by design');
select is(tests.save(331,'sign','{"title":"Nope"}',false)->>'status','invalid_request','An unknown sign setting is refused');
reset role;
select is((select options from sessions where id=tests.id(310))->'items'->1,'{"key":"b2","text":"Prayer room"}'::jsonb,'Item text is trimmed');
select is((select options->>'preset' from sessions where id=tests.id(312)),'pre_mortem','The preset is kept');
set local role authenticated;

-- ---------- INT-08 2x2 grid ----------
select tests.login(1);
select is(tests.ctl(900,'go_live',jsonb_build_object('session',tests.id(310)))->>'status','ok','Go live on the grid');
select is(tests.results()->'items'->0,'{"key":"a1","num":1,"text":"Online newcomer path","count":0}'::jsonb,'Empty structure: every item listed with no placements');
select is(tests.ctl(901,'spotlight','{"item":"c3"}')->>'status','ok','An item can be spotlit before anyone places it');
select is(tests.ctl(902,'clear_spotlight')->>'status','ok','and cleared');
select tests.login(3);
select is(tests.send(950,310,'{"places":{"a1":[0.2,0.8]}}')->>'status','accepted','A placement is accepted');
select is(tests.send(951,310,'{"places":{"zz":[0.2,0.8]}}')->>'status','invalid_answer','An item not on the grid is refused');
select is(tests.send(951,310,'{"places":{"a1":[1.2,0.8]}}')->>'status','invalid_answer','A placement off the grid is refused');
select is(tests.send(951,310,'{"places":{"a1":"0.2,0.8"}}')->>'status','invalid_answer','A placement must be two numbers');
select is(tests.send(951,310,'{"places":{}}')->>'status','invalid_answer','An empty set is refused');
select is(tests.send(951,310,'{"places":{"a1":[0.2,0.8]},"name":"x"}')->>'status','invalid_answer','Nothing but placements rides along');
select is(tests.send(950,310,'{"places":{"a1":[0.2,0.8],"b2":[0.6,0.4]}}','change',1)->>'status','accepted','The whole set is sent again on the next placement, as a change');
select is(tests.event(950)->'answer'->'value','{"places":{"a1":[0.2,0.8],"b2":[0.6,0.4]}}'::jsonb,'The event carries the whole set');
select is(tests.event(950)->'answer'->'answers','[{"key":"a1","text":"Online newcomer path"},{"key":"b2","text":"Prayer room"}]'::jsonb,'and one entry per placed item, in item order');
select tests.login(5);
select is(tests.send(952,310,'{"places":{"a1":[0.4,0.6]}}')->>'status','accepted','Another person places');
select tests.login(4);
select is((public.live_snapshot(tests.id(100))->'state'->'results'->>'people')::integer,2,'Counted by people');
select is((public.live_snapshot(tests.id(100))->'state'->'results'->>'total')::integer,3,'and three placements in all');
select is((tests.item(public.live_snapshot(tests.id(100))->'state'->'results','a1')-'places'),'{"key":"a1","num":1,"text":"Online newcomer path","count":2,"x":0.3,"y":0.7}'::jsonb,'One dot per item at the mean, x and y averaged separately on the server');
select is(jsonb_array_length(tests.item(public.live_snapshot(tests.id(100))->'state'->'results','a1')->'places'),2,'Two placements: the faint dots show');
select ok(not (tests.item(public.live_snapshot(tests.id(100))->'state'->'results','b2') ? 'places'),'One placement: no faint dot yet');
select tests.login(3);
select is(tests.send(953,310,'{"places":{"a1":[0.8,0.8]}}')->>'status','accepted','A new answer from the same person replaces the earlier set');
select tests.login(4);
select is(tests.item(public.live_snapshot(tests.id(100))->'state'->'results','a1')->>'x','0.6','and the mean moves');
select is(tests.item(public.live_snapshot(tests.id(100))->'state'->'results','b2')->>'count','0','The replaced set no longer counts');
-- Hide an item by key: its dot and legend row leave the TV.
select tests.login(1);
select is(tests.ctl(903,'hide','{"item":"a1"}')->>'status','ok','Hide an item');
select is(tests.item(tests.results(),'a1'),null,'A hidden item leaves the results');
select is(tests.ctl(904,'unhide','{"item":"a1"}')->>'status','ok','Unhide it');
-- Merging duplicates on the control surface.
select tests.login(5);
select is(tests.send(952,310,'{"places":{"a1":[0.4,0.6],"c3":[0.2,0.2]}}','change',1)->>'status','accepted','Ben places a third item');
select tests.login(6);
select is(tests.send(954,310,'{"places":{"c3":[0.6,0.4]}}')->>'status','accepted','Ruth places it too');
select tests.login(3);
select is(tests.grid(960,'merge','{"item":"c3","into":"a1"}')->>'status','denied','A phone cannot merge items');
select tests.login(4);
select is(tests.grid(960,'merge','{"item":"c3","into":"a1"}')->>'status','denied','Nor can the TV');
select tests.login(1);
select is(tests.grid(961,'merge','{"item":"c3","into":"zz"}')->>'status','missing','Merging into an unknown item is refused');
select is(public.grid_control(tests.id(100),tests.id(962),'merge',jsonb_build_object('from',tests.id(330),'item','c3','into','a1'))->>'status','moved','A press against a room that moved is refused');
select is(tests.grid(963,'merge','{"item":"c3","into":"a1"}')->>'status','ok','Merge a duplicate into the survivor');
select is(tests.grid(963,'merge','{"item":"c3","into":"a1"}')->>'status','duplicate','A resent press is a duplicate');
select is(tests.item(tests.results(),'c3')->>'into','a1','The duplicate names its survivor, so its dot glides into it');
select is(tests.item(tests.results(),'c3')->>'count','0','and holds no placements of its own');
select is((tests.item(tests.results(),'a1')-'places'),'{"key":"a1","num":1,"text":"Online newcomer path","count":3,"x":0.5667,"y":0.5333}'::jsonb,'The survivor grows: one placement per person, a person who placed both at the mean of the two');
select is(tests.grid(964,'merge','{"item":"b2","into":"c3"}')->>'status','invalid_state','A merged item cannot take others');
select is((select jsonb_agg(i->>'into') from jsonb_array_elements((public.control_status(tests.id(100)))->'items') i),'[null, null, "a1"]'::jsonb,'The control surface lists the merge');
select is(tests.grid(965,'unmerge','{"item":"c3"}')->>'status','ok','Undo the merge');
select is(tests.item(tests.results(),'c3')->>'count','2','and the item comes back with its own placements');
select is(tests.grid(966,'unmerge','{"item":"c3"}')->>'status','unchanged','Undoing twice changes nothing');
reset role;
select is((select count(*)::integer from private.room_controls where id in (tests.id(963),tests.id(965))),2,'Merges are logged as presses');
set local role authenticated;

-- ---------- INT-09 Private form ----------
select tests.login(1);
select is(tests.ctl(905,'go_live',jsonb_build_object('session',tests.id(320)))->>'status','ok','Go live on the private form');
select tests.login(3);
select is(tests.send(970,320,'{"answers":{"q1":"A plan we all believe in, secretword","q2":""}}')->>'status','accepted','A private answer is accepted');
select is(tests.send(971,320,jsonb_build_object('answers',jsonb_build_object('q1',repeat('x',1001))))->>'status','limit','An answer over 1000 characters is refused');
select is(tests.send(971,320,'{"answers":{"q9":"x"}}')->>'status','invalid_answer','A question not on the form is refused');
select is(tests.send(971,320,'{"answers":{"q1":"  "}}')->>'status','invalid_answer','An empty form is refused');
select is((public.phone_room(tests.id(100))->'answers'->-1->'value'->'answers'->>'q1'),'A plan we all believe in, secretword','The person sees their own answers');
select is(tests.send(970,320,'{"answers":{"q1":"A plan we all believe in, secretword","q2":"Honest talk about the building"}}','change',1)->>'status','accepted','and can change them');
select tests.login(5);
select is(tests.send(972,320,'{"answers":{"q2":"Systems, secondword"}}')->>'status','accepted','Another person answers');
select ok(tests.event(970) is not null and tests.event(970)->'answer'->>'text' is null and tests.event(970)->'answer'->'value'='null'::jsonb,'The event carries no text and no value');
select ok(tests.events_text() not like '%secretword%' and tests.events_text() not like '%secondword%','No answer ever travels on the room channel');
select tests.login(4);
select is(jsonb_array_length(public.live_snapshot(tests.id(100))->'answers'),0,'The TV snapshot carries none of the answers');
select is(public.live_snapshot(tests.id(100))->'state'->'results','{"total":2,"people":2,"words":[]}'::jsonb,'only the count');
select ok(public.live_snapshot(tests.id(100))::text not like '%secretword%','nowhere in the TV snapshot');
select is(public.control_status(tests.id(100))->>'status','denied','The TV cannot read the control surface');
select is((select count(*)::integer from submissions where session_id=tests.id(320)),0,'The TV cannot read the answers from the table');
select tests.login(5);
select ok(public.live_snapshot(tests.id(100))::text not like '%secretword%','Another phone never sees them in its snapshot');
select ok(public.phone_room(tests.id(100))::text not like '%secretword%','or in its own room');
select is((select count(*)::integer from submissions where session_id=tests.id(320)),1,'Another phone reads only its own answer from the table');
select is(public.control_status(tests.id(100))->>'status','denied','Phones cannot read the control surface');
select is(tests.ctl(906,'spotlight','{"item":"x"}')->>'status','denied','Phones cannot press controls');
select tests.login(1);
select is(tests.ctl(907,'spotlight',jsonb_build_object('item',tests.id(970)))->>'status','invalid_state','A private form has no Spotlight');
select is(jsonb_array_length(public.live_snapshot(tests.id(100))->'answers'),0,'Even the facilitator snapshot carries none: they read answers privately');
select is((public.control_status(tests.id(100))->'items'->0->>'text'),'Priya Shah','The facilitator reads each person''s answers on the control surface');
select is((public.control_status(tests.id(100))->'items'->0->'answers'),'[{"text":"A plan we all believe in, secretword","question":"What would make this retreat a win for you?"},{"text":"Honest talk about the building","question":"Anything we should know before tomorrow?"}]'::jsonb,'with each question');

-- ---------- INT-10 Sign together ----------
select is(tests.ctl(908,'go_live',jsonb_build_object('session',tests.id(330)))->>'status','ok','Go live on sign together');
select is(tests.results()->'signers','[]'::jsonb,'Empty structure: no names yet');
select tests.login(3);
select is(tests.send(980,330,'{"strokes":["M10 100L40 80L80 120","M120 60"]}')->>'status','accepted','A finger signature is accepted as stroke paths');
select is(tests.event(980)->'answer'->'value','{"name":"Priya Shah","strokes":["M10 100L40 80L80 120","M120 60"]}'::jsonb,'with the signed-in person''s name, read on the server');
select is(tests.send(981,330,'{"strokes":["M10 100L40 80"],"name":"Ben Ortiz"}')->>'status','invalid_answer','A phone can never claim another name');
select is(tests.send(981,330,'{"strokes":[]}')->>'status','invalid_answer','Sign stays held until there is ink');
select is(tests.send(981,330,'{"strokes":["M10 100 L40 80 <script>"]}')->>'status','invalid_answer','A stroke must be a plain path');
select is(tests.send(981,330,'{"strokes":["M10 100L700 80"]}')->>'status','invalid_answer','A stroke stays inside the field');
select is(tests.send(981,330,jsonb_build_object('strokes',jsonb_build_array('M1 1'||repeat('L100 100',1000))))->>'status','limit','A signature has a bounded size');
select tests.login(5);
select is(tests.send(982,330,'{"strokes":["M300 100L320 90"]}')->>'status','accepted','Ben signs');
select tests.login(4);
select is((select jsonb_agg(s->>'name') from jsonb_array_elements(public.live_snapshot(tests.id(100))->'state'->'results'->'signers') s),'["Priya Shah", "Ben Ortiz"]'::jsonb,'Names in the order people signed');
select ok(not (public.live_snapshot(tests.id(100))->'state'->'results'->'signers'->0 ? 'strokes'),'Results carry names, not strokes');
select is((public.live_snapshot(tests.id(100))->'answers'->0->'value'->'strokes'),'["M10 100L40 80L80 120", "M120 60"]'::jsonb,'The TV reads each signature once, with its answer');
select is((public.live_snapshot(tests.id(100))->'state'->'results'->>'people')::integer,2,'Counted by people');
select tests.login(1);
select is(tests.ctl(909,'hide',jsonb_build_object('item',tests.id(982)))->>'status','ok','The remote hides a name');
select is(jsonb_array_length(tests.results()->'signers'),1,'It leaves the TV');
select is((select (i->>'hidden')::boolean from jsonb_array_elements((public.control_status(tests.id(100)))->'items') i where i->>'key'=tests.id(982)::text),true,'and stays in the record, marked hidden');
select is(public.sign_control(tests.id(100),tests.id(910),'unhide',jsonb_build_object('from',tests.live(),'item',tests.id(982)))->>'status','ok','Unhide it from the names list');
select is(tests.event(982)->'answer'->'value'->'strokes','["M300 100L320 90"]'::jsonb,'It comes back with its signature in the same version');
select is(tests.event(982)->'state'->'hidden_ids','[]'::jsonb,'and leaves the hidden list');
select is(jsonb_array_length(tests.results()->'signers'),2,'Both names are on the TV again');
select is(public.sign_control(tests.id(100),tests.id(914),'unhide',jsonb_build_object('from',tests.live(),'item',tests.id(982)))->>'status','unchanged','Unhiding a shown name changes nothing');
select is(public.sign_control(tests.id(100),tests.id(915),'unhide',jsonb_build_object('from',tests.live(),'item',tests.id(970)))->>'status','missing','Only a signature on this step can be unhidden');
select tests.login(3);
select is(tests.sign(990)->>'status','denied','A phone cannot close signing');
select tests.login(1);
select is(public.sign_control(tests.id(100),tests.id(991),'close',jsonb_build_object('from',tests.id(310)))->>'status','moved','Close against a room that moved is refused');
select is(tests.sign(992)->>'status','ok','Close signing');
select is(tests.sign(992)->>'status','duplicate','A resent press is a duplicate');
select is(public.live_snapshot(tests.id(100))->'session'->>'state','closed','The step shows Closed');
select tests.login(6);
select is(tests.send(983,330,'{"strokes":["M30 30L60 60"]}')->>'status','closed','Nothing more arrives');
select is(tests.send(984,330,'{"strokes":["M30 30L60 60"]}','submit',0,now()-interval '1 minute')->>'status','accepted','A signature saved on a phone before the close still lands');
select tests.login(1);
select is(tests.ctl(911,'reopen')->>'status','ok','Reopen signing');
select is(public.live_snapshot(tests.id(100))->'session'->>'state','live','and the step is live again');
select is(tests.ctl(912,'go_live',jsonb_build_object('session',tests.id(310)))->>'status','ok','Back to the grid');
select is(tests.sign(993)->>'status','invalid_state','Close signing works only on sign together');
select is(tests.grid(994,'merge','{"item":"c3","into":"a1"}')->>'status','ok','Merge again on the grid');
select is(tests.ctl(913,'go_live',jsonb_build_object('session',tests.id(320)))->>'status','ok','Over to the form');
select is(tests.grid(995,'merge','{"item":"c3","into":"a1"}')->>'status','invalid_state','Merge works only on a grid');
reset role;

-- Every new function is private or an invoker wrapper, and browsers reach only the wrappers' targets.
select ok(not (select prosecdef from pg_proc where oid='public.grid_control(uuid,uuid,text,jsonb)'::regprocedure),'The public grid control is an invoker');
select ok(not (select prosecdef from pg_proc where oid='public.sign_control(uuid,uuid,text,jsonb)'::regprocedure),'The public sign control is an invoker');
select ok(not has_function_privilege('authenticated','private.results_grid(uuid,uuid,text[])','execute'),'Results functions are not callable by browsers');
select ok(not has_function_privilege('authenticated','private.items_form(uuid,text[])','execute'),'The form answers read is not callable by browsers');
select ok(not has_function_privilege('authenticated','private.sign_value(public.sessions,jsonb)','execute'),'Parsing is not callable by browsers');
select ok(not has_function_privilege('anon','public.grid_control(uuid,uuid,text,jsonb)','execute'),'Anonymous callers cannot press grid controls');
select * from finish();
rollback;
