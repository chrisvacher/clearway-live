-- Milestone 4, step 5: the Pre-mortem on the grid kind and the CORE goal builder (INT-15),
-- by role: the facilitator, a participant, the TV, a facilitator of another room and a stranger.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('89000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(1000+n))::text,true); end $$;
create function tests.live() returns uuid language sql security definer set search_path='' as $$ select live_session_id from public.room_states where engagement_id=tests.id(100) $$;
create function tests.results() returns jsonb language sql security definer set search_path='' as $$ select results from public.room_states where engagement_id=tests.id(100) $$;
create function tests.version() returns bigint language sql security definer set search_path='' as $$ select version from public.room_states where engagement_id=tests.id(100) $$;
create function tests.ctl(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$
 select public.room_control(tests.id(100),tests.id(n),action,jsonb_build_object('from',tests.live())||p) $$;
create function tests.rc(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$
 select public.reasons_control(tests.id(100),tests.id(n),action,jsonb_build_object('from',tests.live())||p) $$;
create function tests.gc(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$
 select public.goals_control(tests.id(100),tests.id(n),action,jsonb_build_object('from',tests.live())||p) $$;
create function tests.send(n integer,session integer,value jsonb,action text default 'submit',revision integer default 0) returns jsonb language sql as $$
 select public.live_submit(tests.id(100),tests.id(n),tests.id(session),revision,action,'',now(),null,0,value) $$;
create function tests.save(n integer,kind text,options jsonb,anonymous boolean default true) returns jsonb language sql as $$
 select public.show_write(tests.id(100),'save',jsonb_build_object('id',tests.id(n),'revision',null,'title','Step '||n,'part','Day 2','mode','live','interaction',kind,
  'prompt','Prompt '||n,'phone_depth','','notes','','lands_in','','segment','','state','ready','planned_minutes',5,'max_sends',3,'max_characters',28,'max_words',3,
  'settings',jsonb_build_object('anonymous',anonymous,'burst_minutes',4,'join_strip',false),'options',options)) $$;
create function tests.item(results jsonb,k text) returns jsonb language sql immutable as $$ select i from jsonb_array_elements(results->'items') i where i->>'key'=k $$;
create function tests.goal(results jsonb,t text) returns jsonb language sql immutable as $$ select g from jsonb_array_elements(results->'goals') g where g->>'title'=t $$;
create function tests.events_with(t text) returns text language sql security definer set search_path='' as $$
 select coalesce(string_agg((payload->'state'->'results')::text||(payload->'answer')::text,' '),'') from realtime.messages where topic like 'live:'||tests.id(100)||':%' and payload::text like '%'||t||'%' $$;
create function tests.events_text() returns text language sql security definer set search_path='' as $$
 select coalesce(string_agg(payload::text,' '),'') from realtime.messages where topic like 'live:'||tests.id(100)||':%' $$;
create function tests.claim(session integer,lease integer) returns jsonb language sql security definer set search_path='' as $$
 select public.ai_claim(tests.id(session),tests.id(lease),'claude-test-model','{"combine_words":"combine-words@2","group_wall":"group-wall@2","summarize_wall":"summarize-wall@2","fold_questions":"fold-questions@1","merge_reasons":"merge-reasons@1"}') $$;
create function tests.apply(lease integer,body jsonb) returns jsonb language sql security definer set search_path='' as $$
 select public.ai_apply(r.id,tests.id(lease),body,'{"ms":10}') from private.ai_runs r where r.status='running' and r.engagement_id=tests.id(100) $$;
create function tests.q(sql text) returns text language plpgsql security definer set search_path='' as $$ declare v text; begin execute sql into v; return v; end $$;
grant execute on all functions in schema tests to authenticated,anon,service_role;

insert into churches(id,name,timezone) values(tests.id(200),'Riverside Church','America/Toronto'),(tests.id(201),'Elsewhere Church','America/Toronto');
insert into engagements(id,church_id,title,settings) values(tests.id(100),tests.id(200),'Pre-mortem room','{"ai_enabled":true}'),(tests.id(101),tests.id(201),'Another room','{}');
insert into auth.users(id,email,email_confirmed_at)
select tests.id(n),case n when 1 then 'fac1@clearway.co' when 7 then 'fac7@clearway.co' else 'person'||n||'@example.org' end,now() from generate_series(1,8)n;
insert into auth.sessions(id,user_id) select tests.id(1000+n),tests.id(n) from generate_series(1,8)n;
insert into auth.identities(user_id,provider,provider_id,identity_data) select id,'google',id::text,jsonb_build_object('email',email,'email_verified',true) from auth.users where id in(tests.id(1),tests.id(7));
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method) values(gen_random_uuid(),tests.id(1001),now(),now(),'oauth'),(gen_random_uuid(),tests.id(1007),now(),now(),'oauth');
insert into clearway_users(id,auth_user_id,name,email,is_admin,team_hub_team_member_id) values
 (tests.id(701),tests.id(1),'Chris Vacher','fac1@clearway.co',false,tests.id(801)),(tests.id(707),tests.id(7),'Other Facilitator','fac7@clearway.co',false,tests.id(807));
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values(tests.id(100),tests.id(701),'lead'),(tests.id(101),tests.id(707),'lead');
insert into attendees(id,engagement_id,auth_user_id,name,email,verified_at,room_role) values
 (tests.id(503),tests.id(100),tests.id(3),'Priya Shah','person3@example.org',now(),'participant'),
 (tests.id(505),tests.id(100),tests.id(5),'Ben Ortiz','person5@example.org',now(),'participant'),
 (tests.id(506),tests.id(100),tests.id(6),'Ruth Morrison','person6@example.org',now(),'participant');
insert into device_sessions(engagement_id,attendee_id,auth_session_id) values(tests.id(100),tests.id(503),tests.id(1003)),(tests.id(100),tests.id(505),tests.id(1005)),(tests.id(100),tests.id(506),tests.id(1006));
insert into private.tv_devices(id,proof,engagement_id,label,paired_at) values(tests.id(450),repeat('a',64),tests.id(100),'Front TV',now());
insert into private.live_tv_sessions(id,engagement_id,auth_user_id,auth_session_id,device_id) values(tests.id(400),tests.id(100),tests.id(4),tests.id(1004),tests.id(450));
insert into private.vision_outcomes(id,engagement_id,title,status,confirmed_at,position) values
 (tests.id(3001),tests.id(100),'Leaders raised from within','confirmed',now(),0),(tests.id(3002),tests.id(100),'Families find a home here','confirmed',now(),1);
insert into private.outcome_indicators(id,engagement_id,outcome_id,text,position) values
 (tests.id(3101),tests.id(100),tests.id(3001),'12 apprentice leaders serve alongside a ministry lead',0),(tests.id(3102),tests.id(100),tests.id(3001),'Every ministry names its next leader',1),
 (tests.id(3103),tests.id(100),tests.id(3002),'New families are in a group within six weeks',0);

-- ---------- The registry and the tables ----------
select is((select row(one_per_person,counts,structured,shares_answers,spotlight,named)::text from private.interaction_kinds where kind='goals'),'(t,people,t,f,none,never)','CORE goals is registered: counted by people, no names, answers not shared');
select ok(private.kind_function('results','goals','uuid,uuid,text[]') is not null and private.kind_function('options','goals','jsonb,uuid') is not null and private.kind_function('parse','goals','public.sessions,text,jsonb') is not null,'The engine finds its functions by name');
select is((select count(*) from pg_class where oid=any(array['private.risks','private.risk_mitigations','private.goals','private.goal_risks','private.grid_merges','private.ai_runs','private.ai_sessions']::regclass[]) and relrowsecurity and relforcerowsecurity),7::bigint,'Every table the step writes is under forced row-level security');
select is((select count(*) from information_schema.role_table_grants where grantee in('authenticated','anon','public') and table_schema='private' and privilege_type in('INSERT','UPDATE','DELETE') and table_name in('risks','risk_mitigations','goals','goal_risks','grid_merges')),0::bigint,'Browsers cannot write them');
select is((select count(*) from information_schema.role_table_grants where grantee in('anon','public') and table_schema='private' and table_name in('risks','risk_mitigations','goals','goal_risks','grid_merges')),0::bigint,'Anonymous callers hold no privilege on them');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('reason_add','reasons_control','reasons_state','goals_form','goal_propose','goals_control','goals_state') and has_function_privilege('anon',p.oid,'execute')),0::bigint,'Anonymous callers cannot run the new functions');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('ai_claim','ai_apply') and has_function_privilege('authenticated',p.oid,'execute')),0::bigint,'The worker''s claim and apply stay out of browsers'' reach');

-- ---------- Saving the steps ----------
set local role authenticated;
select tests.login(1);
select is(tests.save(310,'grid','{"preset":"pre_mortem","items":[{"key":"v1","text":"We burned out our volunteers"},{"key":"v2","text":"Volunteers burned out and quit"}]}')->>'status','ok','The Pre-mortem saves on the grid kind');
select is(tests.save(320,'goals',jsonb_build_object('risk_links','required'))->>'status','ok','CORE goals saves, risk links required');
select is(tests.save(321,'goals','{"risk_links":"later"}')->>'status','ok','and later, for the day-and-a-half template');
select is(tests.save(322,'goals','{"risk_links":"sometimes"}')->>'status','invalid_request','Any other risk-link setting is refused');
select is(tests.save(322,'goals','{"colour":"red"}')->>'status','invalid_request','An unknown setting is refused');
select is(tests.save(322,'goals',jsonb_build_object('outcome',tests.id(9999)))->>'status','invalid_request','An outcome of no room here is refused');
select is(tests.save(322,'goals',jsonb_build_object('outcome',tests.id(3002)))->>'status','ok','A named outcome saves');

-- ---------- D2-07 The pre-mortem: reasons ----------
select is(tests.ctl(900,'go_live',jsonb_build_object('session',tests.id(310)))->>'status','ok','Go live on the Pre-mortem');
select tests.login(3);
select is(public.reason_add(tests.id(100),tests.id(950),tests.live(),'Nobody owned the follow-up')->>'status','accepted','A phone adds a reason');
select is(public.reason_add(tests.id(100),tests.id(950),tests.live(),'Nobody owned the follow-up')->>'status','duplicate','A resent press is a duplicate');
select is(public.reason_add(tests.id(100),tests.id(951),tests.live(),'nobody owned the FOLLOW-up')->>'status','exists','The same reason in other letters is refused');
select is(public.reason_add(tests.id(100),tests.id(952),tests.live(),'This is shit')->>'status','filtered','The word filter applies');
select is(public.reason_add(tests.id(100),tests.id(953),tests.live(),'   ')->>'status','invalid_answer','An empty reason is refused');
select is(public.reason_add(tests.id(100),tests.id(954),tests.live(),repeat('x',121))->>'status','invalid_answer','A long reason is refused');
select is(public.reason_add(tests.id(100),tests.id(955),tests.live(),'The building ran over budget')->>'status','accepted','a second');
select is(public.reason_add(tests.id(100),tests.id(956),tests.live(),'We lost 2 key staff')->>'status','accepted','a third');
select is(public.reason_add(tests.id(100),tests.id(957),tests.live(),'A fourth reason')->>'status','limit','Three reasons a person');
select tests.login(5);
select is(public.reason_add(tests.id(100),tests.id(950),tests.live(),'Another text')->>'status','conflict','An id another person used is a conflict');
select is(public.reason_add(tests.id(100),tests.id(958),tests.live(),'We lost 3 key staff')->>'status','accepted','Another person adds one');
select is(public.reason_add(tests.id(100),tests.id(959),tests.id(999),'Wrong step')->>'status','invalid_session','A step that is not the Pre-mortem is refused');
select is(tests.item(tests.results(),'r'||right(replace(tests.id(950)::text,'-',''),12))->>'text','Nobody owned the follow-up','The reason is on the room results at once');
select is(jsonb_array_length(tests.results()->'items'),6,'Two seeded reasons and four added');
select ok(position('Nobody owned the follow-up' in tests.events_with('Nobody owned the follow-up'))>0 and tests.events_with('Nobody owned the follow-up') !~ ('Priya|Shah|person3|'||tests.id(503)),'The results the event carries hold the reason and no name or person id');
select ok(position('Nobody owned the follow-up' in tests.events_text())>0,'The new reason was broadcast');
select tests.login(4);
select is(public.reason_add(tests.id(100),tests.id(960),tests.live(),'From the TV')->>'status','denied','The TV cannot add a reason');
select tests.login(8);
select is(public.reason_add(tests.id(100),tests.id(961),tests.live(),'From a stranger')->>'status','denied','Nor can a stranger');
select tests.login(1);
select is(public.reason_add(tests.id(100),tests.id(962),tests.live(),'From the facilitator')->>'status','denied','A facilitator adds from the control surface, not as a participant');
select is(tests.rc(970,'add_reason','{"text":"We stopped praying together"}')->>'status','ok','The facilitator adds a reason from the control surface');
select is(tests.rc(970,'add_reason','{"text":"We stopped praying together"}')->>'status','duplicate','A resent press is a duplicate');
select is(tests.rc(971,'add_reason','{"text":"we STOPPED praying together"}')->>'status','exists','The same reason again is refused');
select is(tests.rc(972,'add_reason','{"text":"A reason with   odd   spaces"}')->>'status','ok','The text is tidied');
select is(tests.rc(973,'add_reason','{"text":"One more"}')->>'status','ok','Up to ten reasons');
select is(tests.rc(974,'add_reason','{"text":"The tenth"}')->>'status','ok','the tenth');
select is(tests.rc(978,'add_reason','{"text":"Too many"}')->>'status','full','and no more');
select is(tests.rc(975,'bogus')->>'status','invalid_request','An unknown action is refused');
select is(public.reasons_control(tests.id(100),tests.id(976),'add_reason',jsonb_build_object('from',tests.id(998),'text','x'))->>'status','moved','A press against a room that moved is refused');

-- ---------- Placement mirrors into risks: likelihood and impact ----------
select tests.login(3);
select is(tests.send(980,310,'{"places":{"v1":[0.8,0.9]}}')->>'status','accepted','A person places a reason');
select tests.login(5);
select is(tests.send(981,310,'{"places":{"v1":[0.6,0.7]}}')->>'status','accepted','Another person places it');
select tests.login(1);
select is(public.reasons_state(tests.id(100))->>'status','ok','The facilitator reads the pre-mortem state');
select is((select likelihood from private.risks where item_key='v1' and not deleted),0.7,'Likelihood is the mean x of the placements');
select is((select impact from private.risks where item_key='v1' and not deleted),0.8,'Impact is the mean y');
select is((select count(*) from private.risks where session_id=tests.live() and not deleted),10::bigint,'Every reason has a risk row');
select is((select added_by from private.risks where item_key='r'||right(replace(tests.id(950)::text,'-',''),12) and not deleted),tests.id(503),'The risk row keeps who added it, for the limit only');
select tests.login(3);
select is(public.reasons_state(tests.id(100))->>'status','denied','A participant cannot read the facilitator''s state');
select tests.login(7);
select is(public.reasons_state(tests.id(100))->>'status','denied','Nor can another room''s facilitator');
select is(tests.rc(990,'add_reason','{"text":"x"}')->>'status','denied','or press its controls');
select tests.login(3);
select is(tests.rc(991,'mitigate','{"item":"v1","text":"Shorter terms"}')->>'status','denied','A participant cannot record a mitigation');
select tests.login(4);
select is(tests.rc(991,'mitigate','{"item":"v1","text":"Shorter terms"}')->>'status','denied','Nor can the TV');

-- ---------- D2-09 Mitigations ----------
select tests.login(1);
select is(tests.rc(1000,'mitigate','{"item":"v1","text":"Cap each volunteer at one season"}')->>'status','ok','The facilitator records a mitigation under a reason');
select is(tests.rc(1000,'mitigate','{"item":"v1","text":"Cap each volunteer at one season"}')->>'status','duplicate','A resent press is a duplicate');
select is(tests.rc(1001,'mitigate','{"item":"zz","text":"Nothing"}')->>'status','missing','A mitigation needs a reason');
select is(tests.rc(1002,'mitigate','{"item":"v1","text":"   "}')->>'status','invalid_request','and words');
select is(tests.rc(1003,'mitigate','{"item":"v1","text":"A second plan"}')->>'status','ok','A second');
select is(tests.rc(1004,'mitigate','{"item":"v1","text":"A third plan"}')->>'status','ok','a third');
select is(tests.rc(1005,'mitigate','{"item":"v1","text":"A fourth plan"}')->>'status','full','Three a reason');
select is(tests.item(tests.results(),'v1')->'mitigations','["Cap each volunteer at one season","A second plan","A third plan"]'::jsonb,'The mitigations ride on the reason, in order, for the legend');
select is((select recorded_by from private.risk_mitigations where text='A second plan'),'facilitator','Recorded by the facilitator (a scribe can be recorded later)');
select is(tests.rc(1006,'unmitigate',jsonb_build_object('mitigation',(select id from private.risk_mitigations where text='A third plan')))->>'status','ok','A mitigation can be taken back');
select is(jsonb_array_length(tests.item(tests.results(),'v1')->'mitigations'),2,'and leaves the reason');
select is(tests.rc(1007,'unmitigate',jsonb_build_object('mitigation',tests.id(9999)))->>'status','missing','An unknown mitigation is refused');
reset role;
select is((select count(*) from private.room_controls where action like 'reasons_%' and engagement_id=tests.id(100)),8::bigint,'Each press is logged once');
set local role authenticated;

-- ---------- D2-08 AI merges duplicate reasons ----------
-- The worker is the service role; the facilitator's presses need only their login.
reset role;
select tests.login(1);
select is(tests.claim(310,901)->>'job','merge_reasons','Ten reasons: merging is due');
select is(tests.claim(310,902)->>'status','busy','A second claim while the first is leased is busy');
select ok(not (tests.claim(310,903)::text ~ '[0-9a-f]{8}-[0-9a-f]{4}-4'),'The claim carries no id');
select ok((select not (inputs::text ~* 'attendee|added_by|Priya|Ben|Ruth|@') from private.ai_runs where status='running' and session_id=tests.id(310)),'The inputs carry no person, only reason text and counts');
select is((select jsonb_array_length(inputs->'reasons') from private.ai_runs where status='running' and session_id=tests.id(310)),10,'All ten reasons ride in the inputs under refs');
select is((select inputs->'reasons'->0->>'ref' from private.ai_runs where status='running' and session_id=tests.id(310)),'r1','under short refs');
-- r1 and r2 are the volunteer reasons, r5 and r6 the staff reasons with different numbers (r4: 2 staff, r5: 3 staff by the order of adding).
select is((select r->>'text' from private.ai_runs x,jsonb_array_elements(x.inputs->'reasons') r where x.status='running' and x.session_id=tests.id(310) and r->>'ref'='r1'),'We burned out our volunteers','r1 is the first reason');
select is((select r->>'ref' from private.ai_runs x,jsonb_array_elements(x.inputs->'reasons') r where x.status='running' and x.session_id=tests.id(310) and r->>'text'='We lost 2 key staff'),'r5','Refs follow the order on the grid');
select is((select r->>'ref' from private.ai_runs x,jsonb_array_elements(x.inputs->'reasons') r where x.status='running' and x.session_id=tests.id(310) and r->>'text'='We lost 3 key staff'),'r6','');
select tests.login(1);
-- The worker's reply: merge the volunteer reasons (ok), staff reasons with different numbers (refused), and a nonsense ref (refused).
select is(tests.apply(901,'{"groups":[{"survivor":"r1","members":["r2"]},{"survivor":"r5","members":["r6"]},{"survivor":"r9","members":["r99"]}]}')->>'status','ok','The worker applies the reply under the merge limits');
select is((select (output->'applied')::text from private.ai_runs where session_id=tests.id(310) and status='ok'),'[{"members": ["v2"], "survivor": "v1"}]','Only the volunteer reasons merged');
select is((select string_agg(x->>'reason',',' order by x->>'reason') from private.ai_runs r,jsonb_array_elements(r.output->'refused') x where r.session_id=tests.id(310) and r.status='ok'),'number,unknown','The numbers rule and an unknown ref are refused');
select is(tests.item(tests.results(),'v2')->>'into','v1','The merged reason points at its survivor at once');
select is(tests.item(tests.results(),'v2')->>'count','0','and its placements count toward the survivor');
select is((select made_by from private.grid_merges where item_key='v2' and not deleted),'ai','The merge is marked as the AI''s');
select is((select run_id is not null from private.grid_merges where item_key='v2' and not deleted),true,'with its run');
select is((select likelihood is not null from private.risks where item_key='v1' and not deleted),true,'The survivor keeps its likelihood');
select is((select merged_into from private.risks where item_key='v2' and not deleted),(select id from private.risks where item_key='v1' and not deleted),'The merged reason''s risk points at the survivor');
select is(tests.claim(310,904)->>'status','idle','Nothing changed in the number of reasons: idle');
select is(tests.rc(1010,'undo_ai')->>'status','ok','Undo AI merges takes them back');
select is(tests.item(tests.results(),'v2')->>'into',null,'The reason stands alone again');
select is(tests.rc(1011,'undo_ai')->>'status','unchanged','and nothing is left to undo');
select is((select merged_into from private.risks where item_key='v2' and not deleted),null,'The risk follows');
select is(tests.claim(310,905)->>'status','idle','The AI does not merge again what the facilitator took back, until the reasons change');
select is(tests.rc(1012,'add_reason','{"text":"We never said no to anything"}')->>'status','full','The grid is full: no room for another');
select is(tests.rc(1013,'undo_ai')->>'status','unchanged','Still nothing');
-- The facilitator merges by hand and undoes one merge.
select is(public.grid_control(tests.id(100),tests.id(1014),'merge',jsonb_build_object('from',tests.live(),'item','v2','into','v1'))->>'status','ok','The facilitator merges by hand');
select is(tests.item(tests.results(),'v2')->>'into','v1','as before');
select is(public.grid_control(tests.id(100),tests.id(1015),'unmerge',jsonb_build_object('from',tests.live(),'item','v2'))->>'status','ok','and undoes one');
-- AI off: nothing is claimed.
update private.ai_sessions set ai=false where session_id=tests.id(310);
select is(public.ai_claim(tests.id(310),tests.id(906),'claude-test-model','{"merge_reasons":"merge-reasons@1"}')->>'status','off','With AI switched off nothing is claimed');
update private.ai_sessions set ai=null where session_id=tests.id(310);
update public.engagements set settings='{}' where id=tests.id(100);
select is(public.ai_claim(tests.id(310),tests.id(907),'claude-test-model','{"merge_reasons":"merge-reasons@1"}')->>'status','off','and with AI off for the engagement');
update public.engagements set settings='{"ai_enabled":true}' where id=tests.id(100);
select is(public.ai_claim(tests.id(320),tests.id(908),'claude-test-model','{"merge_reasons":"merge-reasons@1"}')->>'status','off','A goals step is not the AI''s to merge');
-- The merge limits: more than four into one, and too many removed at once.
delete from private.grid_merges where session_id=tests.id(310);
update private.ai_sessions set reasons_seen=0 where session_id=tests.id(310);
select is(public.ai_claim(tests.id(310),tests.id(909),'claude-test-model','{"merge_reasons":"merge-reasons@1"}')->>'job','merge_reasons','Merging is due again when the reasons changed');
select is(public.ai_apply((select id from private.ai_runs where status='running' and session_id=tests.id(310)),tests.id(909),
 '{"groups":[{"survivor":"r1","members":["r2","r3","r4","r5"]}]}','{"ms":1}')->>'status','ok','The worker applies a group of five');
select is((select r->>'reason' from private.ai_runs x,jsonb_array_elements(x.output->'refused') r where x.session_id=tests.id(310) and x.status='ok' order by x.finished_at desc limit 1),'too_many','At most four into one');
update private.ai_sessions set reasons_seen=0 where session_id=tests.id(310);
select is(public.ai_claim(tests.id(310),tests.id(910),'claude-test-model','{"merge_reasons":"merge-reasons@1"}')->>'job','merge_reasons','Due again');
select is(public.ai_apply((select id from private.ai_runs where status='running' and session_id=tests.id(310)),tests.id(910),
 '{"groups":[{"survivor":"r1","members":["r2","r3"]},{"survivor":"r7","members":["r8","r9"]},{"survivor":"r4","members":["r10"]}]}','{"ms":1}')->>'status','ok','The worker applies three groups');
select is((select count(*) from private.grid_merges where session_id=tests.id(310) and not deleted and made_by='ai'),4::bigint,'Merging stops at 60 percent standing: ten reasons, six stay');
select is((select r->>'reason' from private.ai_runs x,jsonb_array_elements(x.output->'refused') r where x.session_id=tests.id(310) and x.status='ok' order by x.finished_at desc limit 1),'standing','The rest is refused');
select is((select count(*) from private.grid_merges where session_id=tests.id(310) and not deleted and made_by='ai' and into_key=item_key),0::bigint,'Never merged into itself');
update private.grid_merges set deleted=true where session_id=tests.id(310) and made_by='ai';
select is(public.ai_apply(gen_random_uuid(),tests.id(911),'{}','{}')->>'status','missing','An unknown run is refused');
select is((select count(*) from private.ai_runs where session_id=tests.id(310) and job='merge_reasons' and status='ok'),3::bigint,'Each run is logged with its job');
-- A stale lease cannot apply.
update private.ai_sessions set reasons_seen=0 where session_id=tests.id(310);
select is(public.ai_claim(tests.id(310),tests.id(912),'claude-test-model','{"merge_reasons":"merge-reasons@1"}')->>'job','merge_reasons','Due');
select is(public.ai_apply((select id from private.ai_runs where status='running' and session_id=tests.id(310)),tests.id(913),'{"groups":[]}','{}')->>'status','stale','Someone else''s lease is stale');
select is(public.ai_fail((select id from private.ai_runs where status='running' and session_id=tests.id(310)),tests.id(912),'timeout','{"ms":1}')->>'status','ok','A failed call is recorded');
select is((select status from private.ai_runs where session_id=tests.id(310) order by created_at desc limit 1),'failed','as failed');
-- Another kind goes through the unchanged function.
select is(public.ai_claim(tests.id(320),tests.id(914),'claude-test-model','{}')->>'status','off','Other kinds keep the old behaviour');

-- ---------- D2-10 The CORE goal builder ----------
set local role authenticated;
select tests.login(1);
select is(tests.ctl(901,'go_live',jsonb_build_object('session',tests.id(320)))->>'status','ok','Go live on the goal builder');
select is(tests.results()->'outcome'->>'title','Leaders raised from within','The first outcome is on show');
select is(tests.results()->'bullets','["12 apprentice leaders serve alongside a ministry lead","Every ministry names its next leader"]'::jsonb,'with its 3-year Vision bullets');
select is(tests.results()->'outcome'->>'number','1','Outcome 1');
select is(tests.results()->'outcome'->>'of','2','of 2');
select is(tests.results()->>'risk_links','required','Risk links required');
select tests.login(3);
select is(public.goals_form(tests.id(100),tests.live())->>'status','ok','A participant''s form loads');
select is(jsonb_array_length(public.goals_form(tests.id(100),tests.live())->'people'),3,'with the people who can own a goal');
select is(jsonb_array_length(public.goals_form(tests.id(100),tests.live())->'season_ends'),3,'and three season ends');
select ok(public.goals_form(tests.id(100),tests.live())->'season_ends'->0->>'label' ~ '^(Sept to Dec|Jan to Apr|May to Aug) 20[0-9]{2}$','named as seasons, never quarters');
select is(public.goals_form(tests.id(100),tests.id(999))->>'status','invalid_session','A step that is not the goal builder is refused');
select is(public.goals_form(tests.id(100),tests.live())->'risks'->0->>'n','1','Risks are numbered');
select is(public.goal_propose(tests.id(100),tests.id(1100),tests.live(),'{"title":"Launch the apprentice pathway"}')->>'status','accepted','A phone proposes a goal with only a title');
select is(public.goal_propose(tests.id(100),tests.id(1100),tests.live(),'{"title":"Launch the apprentice pathway"}')->>'status','duplicate','A resend is a duplicate');
select is(tests.goal(tests.results(),'Launch the apprentice pathway')->'letters','{"C":true,"O":false,"R":false,"E":false}'::jsonb,'Connected is met, the other three are missing');
select is((tests.goal(tests.results(),'Launch the apprentice pathway')->>'met')::boolean,false,'A goal stays flagged until all four are met');
select is((tests.goal(tests.results(),'Launch the apprentice pathway')->>'needs_risk')::boolean,true,'and, with risk links required, until it answers a risk');
select is(public.goal_propose(tests.id(100),tests.id(1101),tests.live(),'{"title":"Rude shit"}')->>'status','filtered','The word filter applies');
select is(public.goal_propose(tests.id(100),tests.id(1102),tests.live(),'{"result":"No title"}')->>'status','invalid_answer','A goal needs a title');
select is(public.goal_propose(tests.id(100),tests.id(1103),tests.live(),('{"title":"x","owner":{"attendee":"'||tests.id(505)||'","name":"Ben","email":"b@example.org"}}')::jsonb)->>'status','invalid_answer','One owner: an attendee or a name and email, never both');
select is(public.goal_propose(tests.id(100),tests.id(1103),tests.live(),'{"title":"x","owner":{"name":"Ben"}}')->>'status','invalid_answer','A name needs an email');
select is(public.goal_propose(tests.id(100),tests.id(1103),tests.live(),'{"title":"x","owner":{"name":"Ben","email":"not an email"}}')->>'status','invalid_answer','and a real one');
select is(public.goal_propose(tests.id(100),tests.id(1103),tests.live(),('{"title":"x","owner":{"attendee":"'||tests.id(999)||'"}}')::jsonb)->>'status','invalid_answer','An owner must be in this room');
select is(public.goal_propose(tests.id(100),tests.id(1103),tests.live(),'{"title":"x","end_date":"2026-13-45"}')->>'status','invalid_answer','A date must be a date');
select is(public.goal_propose(tests.id(100),tests.id(1103),tests.live(),('{"title":"x","risks":["'||tests.id(9999)||'"]}')::jsonb)->>'status','invalid_answer','A risk must be one of this room''s');
select is(public.goal_propose(tests.id(100),tests.id(1103),tests.live(),'{"title":"x","extra":1}')->>'status','accepted','Unknown fields are ignored');
select is(public.goal_propose(tests.id(100),tests.id(1104),tests.live(),jsonb_build_object('goal',tests.id(1100),'owner',jsonb_build_object('attendee',tests.id(503)),'end_date','2027-04-30','result','8 apprentices placed in ministries'))->>'status','accepted','A person completes a goal they proposed');
select is(tests.goal(tests.results(),'Launch the apprentice pathway')->'letters','{"C":true,"O":true,"R":false,"E":true}'::jsonb,'Owned and End date are met; Result waits for the facilitator to say it is clear');
select is(tests.goal(tests.results(),'Launch the apprentice pathway')->>'owner','Priya','The owner shows by first name only');
select is(tests.goal(tests.results(),'Launch the apprentice pathway')->>'season','JAN_APR','The end date carries its season');
select ok(position('person3@example.org' in tests.results()::text)=0 and position('Shah' in tests.results()::text)=0,'No email and no surname rides on the results');
select tests.login(5);
select is(public.goal_propose(tests.id(100),tests.id(1105),tests.live(),jsonb_build_object('goal',tests.id(1100),'title','Taken over'))->>'status','denied','Nobody changes a goal another person proposed');
select is(public.goal_propose(tests.id(100),tests.id(1106),tests.live(),jsonb_build_object('title','Pastor the residency','owner',jsonb_build_object('name','Dana Lee','email','  Dana@Example.org '),'end_date','2027-08-31'))->>'status','accepted','A person can name an owner who is not at the retreat');
select is(tests.goal(tests.results(),'Pastor the residency')->>'owner','Dana','by first name on the screen');
select is(tests.q('select owner_email from private.goals where id='''||tests.id(1106)||''''),'dana@example.org','The email is stored in lower case');
select is(tests.goal(tests.results(),'Pastor the residency')->'letters'->>'O','true','An owner by name and email is Owned');
select is(tests.goal(tests.results(),'Pastor the residency')->>'season','MAY_AUG','Season by the end date');
select tests.login(4);
select is(public.goal_propose(tests.id(100),tests.id(1107),tests.live(),'{"title":"From the TV"}')->>'status','denied','The TV cannot propose');
select is(public.goals_form(tests.id(100),tests.live())->>'status','denied','Nor read the form');
select tests.login(8);
select is(public.goal_propose(tests.id(100),tests.id(1108),tests.live(),'{"title":"From a stranger"}')->>'status','denied','Nor can a stranger');
select tests.login(3);
select is(public.goals_state(tests.id(100))->>'status','denied','A participant cannot read the facilitator''s state');
select is(public.goals_control(tests.id(100),tests.id(1109),'add',jsonb_build_object('from',tests.live(),'title','x'))->>'status','denied','or press its controls');
-- Six goals a person for an outcome.
select is(public.goal_propose(tests.id(100),tests.id(1110),tests.live(),'{"title":"Two"}')->>'status','accepted','Priya''s third goal');
select is(public.goal_propose(tests.id(100),tests.id(1111),tests.live(),'{"title":"Three"}')->>'status','accepted','fourth');
select is(public.goal_propose(tests.id(100),tests.id(1112),tests.live(),'{"title":"Four"}')->>'status','accepted','fifth');
select is(public.goal_propose(tests.id(100),tests.id(1113),tests.live(),'{"title":"Five"}')->>'status','accepted','sixth');
select is(public.goal_propose(tests.id(100),tests.id(1114),tests.live(),'{"title":"Six"}')->>'status','limit','Six goals a person for an outcome');

-- The facilitator.
select tests.login(7);
select is(public.goals_state(tests.id(100))->>'status','denied','Another room''s facilitator gets nothing');
select is(tests.gc(1120,'add','{"title":"x"}')->>'status','denied','and presses nothing');
select tests.login(1);
select is(public.goals_state(tests.id(100))->>'status','ok','The facilitator reads the state');
select ok(public.goals_state(tests.id(100))::text like '%dana@example.org%','including an owner''s email, to this view only');
select is(jsonb_array_length(public.goals_state(tests.id(100))->'outcomes'),2,'with the outcomes to move between');
select is(tests.gc(1121,'clear',('{"goal":"'||tests.id(1100)||'","clear":true}')::jsonb)->>'status','ok','Result is clear');
select is(tests.gc(1121,'clear',('{"goal":"'||tests.id(1100)||'","clear":true}')::jsonb)->>'status','duplicate','A resent press is a duplicate');
select is(tests.gc(1122,'clear',('{"goal":"'||tests.id(1100)||'","clear":true}')::jsonb)->>'status','unchanged','Saying it again changes nothing');
select is(tests.goal(tests.results(),'Launch the apprentice pathway')->'letters','{"C":true,"O":true,"R":true,"E":true}'::jsonb,'All four met');
select is((tests.goal(tests.results(),'Launch the apprentice pathway')->>'met')::boolean,true,'The goal is met on the four letters');
select is((tests.goal(tests.results(),'Launch the apprentice pathway')->>'needs_risk')::boolean,true,'but with risk links required it still answers no risk');
select is(tests.gc(1123,'edit',jsonb_build_object('goal',tests.id(1100),'risks',jsonb_build_array((select id from private.risks where item_key='v1' and not deleted))))->>'status','ok','The facilitator links the goal to a risk');
select is((tests.goal(tests.results(),'Launch the apprentice pathway')->>'needs_risk')::boolean,false,'Linked');
select is(tests.goal(tests.results(),'Launch the apprentice pathway')->'risks','[1]'::jsonb,'and the TV shows its risk by number');
select is(tests.gc(1124,'edit',jsonb_build_object('goal',tests.id(1100),'result','Ten apprentices placed in ministries'))->>'status','ok','Changing the result');
select is(tests.goal(tests.results(),'Launch the apprentice pathway')->'letters'->>'R','false','takes back "clear": the room reads it again');
select is(tests.gc(1125,'edit',jsonb_build_object('goal',tests.id(1100),'owner',null))->>'status','ok','An owner can be taken off');
select is(tests.goal(tests.results(),'Launch the apprentice pathway')->'letters'->>'O','false','and the goal is flagged for it');
select is(tests.gc(1126,'edit',jsonb_build_object('goal',tests.id(1100),'end_date',null))->>'status','ok','An end date can be taken off');
select is(tests.q('select season from private.goals where id='''||tests.id(1100)||''''),null,'and its season goes with it');
select is(tests.gc(1127,'add',jsonb_build_object('title','A goal from the facilitator','owner',jsonb_build_object('attendee',tests.id(506)),'end_date','2026-12-31'))->>'status','ok','The facilitator adds a goal');
select is(tests.q('select season from private.goals where title=''A goal from the facilitator'''),'SEP_DEC','Sept to Dec ends on December 31');
select is(tests.gc(1128,'edit',jsonb_build_object('goal',tests.id(9999),'title','x'))->>'status','missing','An unknown goal is refused');
select is(tests.gc(1129,'edit',jsonb_build_object('goal',tests.id(1100),'owner',jsonb_build_object('attendee',tests.id(506),'name','x','email','x@y.org')))->>'status','invalid_answer','One owner, never two');
select is(tests.gc(1130,'remove',jsonb_build_object('goal',(select id from private.goals where title='Two')))->>'status','ok','A goal can be removed');
select is(tests.goal(tests.results(),'Two'),null,'It leaves the screen');
-- Moving between outcomes.
select is(tests.gc(1131,'outcome','{"to":"next"}')->>'status','ok','Next outcome');
select is(tests.results()->'outcome'->>'title','Families find a home here','shows the second');
select is(tests.results()->'bullets','["New families are in a group within six weeks"]'::jsonb,'with its own bullets');
select is(jsonb_array_length(tests.results()->'goals'),0,'and its own goals, none yet');
select is(tests.gc(1132,'outcome','{"to":"next"}')->>'status','unchanged','No outcome after the last');
select is(tests.gc(1133,'outcome','{"to":"prev"}')->>'status','ok','Previous outcome');
select is(tests.results()->'outcome'->>'number','1','back to the first');
select is(tests.gc(1134,'outcome',jsonb_build_object('to',tests.id(3002)))->>'status','ok','or a named one');
select is(tests.gc(1135,'outcome','{"to":"sideways"}')->>'status','invalid_request','Anything else is refused');
select is(tests.gc(1136,'outcome',jsonb_build_object('to',tests.id(3001)))->>'status','ok','Back to the first');
-- Goals are connected to a live outcome only.
reset role;
update private.vision_outcomes set deleted=true where id=tests.id(3002);
select is(private.goal_core(tests.id(1100))->>'connected','true','A goal on a live outcome is Connected');
update private.vision_outcomes set deleted=false where id=tests.id(3002);
-- Day-and-a-half: risk links come after the follow-up session.
set local role authenticated;
select tests.login(1);
select is(tests.ctl(902,'go_live',jsonb_build_object('session',tests.id(321)))->>'status','ok','Go live on the day-and-a-half goal builder');
select is(tests.results()->>'risk_links','later','Risk links later');
select is((tests.goal(tests.results(),'A goal from the facilitator')->>'needs_risk')::boolean,false,'No goal is flagged for a risk yet');
select is(tests.results()->'goals'->0->'letters'->>'C','true','The four letters work the same');
-- Closed engagement.
reset role;
update public.engagements set status='closed' where id=tests.id(100);
set local role authenticated;
select tests.login(1);
select is(tests.gc(1140,'add','{"title":"Late"}')->>'status','closed','A closed engagement takes no goal');
select is(tests.rc(1141,'add_reason','{"text":"Late"}')->>'status','closed','or reason');
select * from finish();
rollback;
