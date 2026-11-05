-- Milestone 4, step 3: candidate priorities (INT-13),
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
 select public.ai_claim(tests.id(session),tests.id(lease),'claude-test-model','{"combine_words":"combine-words@2","group_wall":"group-wall@2","summarize_wall":"summarize-wall@2","fold_questions":"fold-questions@1","merge_reasons":"merge-reasons@1","propose_candidates":"propose-candidates@1"}') $$;
create function tests.apply(lease integer,body jsonb) returns jsonb language sql security definer set search_path='' as $$
 select public.ai_apply(r.id,tests.id(lease),body,'{"ms":10}') from private.ai_runs r where r.status='running' and r.engagement_id=tests.id(100) $$;
create function tests.q(sql text) returns text language plpgsql security definer set search_path='' as $$ declare v text; begin execute sql into v; return v; end $$;
grant execute on all functions in schema tests to authenticated,anon,service_role;

insert into churches(id,name,timezone) values(tests.id(200),'Riverside Church','America/Toronto'),(tests.id(201),'Elsewhere Church','America/Toronto');
insert into engagements(id,church_id,title,settings) values(tests.id(100),tests.id(200),'Candidates room','{"ai_enabled":true}'),(tests.id(101),tests.id(201),'Another room','{}');
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

create function tests.cc(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$
 select public.candidates_control(tests.id(100),tests.id(n),action,jsonb_build_object('from',tests.live())||p) $$;
create function tests.say(n integer,session integer,text_ text) returns jsonb language sql as $$
 select public.live_submit(tests.id(100),tests.id(n),tests.id(session),0,'submit',text_,now(),null,0,null) $$;
create function tests.suggest(n integer,p jsonb) returns jsonb language sql as $$ select public.candidate_suggest(tests.id(100),tests.id(n),tests.live(),p) $$;
create function tests.points(n integer,session integer,p jsonb) returns jsonb language sql as $$
 select public.live_submit(tests.id(100),tests.id(n),tests.id(session),0,'submit','',now(),null,0,jsonb_build_object('points',p)) $$;
create function tests.cand(n integer) returns private.candidates language sql security definer set search_path='' as $$ select * from private.candidates where id=tests.id(n) $$;
create function tests.state() returns jsonb language sql as $$ select public.candidates_state(tests.id(100)) $$;
create function tests.names() returns text language sql security definer set search_path='' as $$
 select coalesce(string_agg(name,'|' order by position,created_at),'') from private.candidates where engagement_id=tests.id(100) and status='standing' and not deleted $$;
create function tests.run_apply(lease integer,body jsonb) returns jsonb language sql security definer set search_path='' as $$
 select public.ai_apply(r.id,tests.id(lease),body,'{"ms":10}') from private.ai_runs r where r.status='running' and r.engagement_id=tests.id(100) and r.job='propose_candidates' $$;
grant execute on all functions in schema tests to authenticated,anon,service_role;
create function tests.save_lens(n integer,options jsonb) returns jsonb language sql as $$
 select public.show_write(tests.id(100),'save',jsonb_build_object('id',tests.id(n),'revision',null,'title','Step '||n,'part','Day 1','mode','live','interaction','lens',
  'prompt','In {base year + 10}, what is true?','phone_depth','','notes','','lands_in','','segment','','state','ready','planned_minutes',5,'max_sends',8,'max_characters',200,'max_words',50,
  'settings',jsonb_build_object('anonymous',true,'burst_minutes',4,'join_strip',false),'options',options)) $$;
create function tests.events_cand() returns text language sql security definer set search_path='' as $$
 select coalesce(string_agg(payload::text,' '),'') from realtime.messages where topic like 'live:'||tests.id(100)||':%' and payload->'state'->>'live_session_id'=tests.id(500)::text $$;
grant execute on function tests.save_lens(integer,jsonb),tests.events_cand() to authenticated,anon,service_role;
create function tests.cid(n text) returns uuid language sql security definer set search_path='' as $$ select id from private.candidates where name=n and status='standing' and not deleted and engagement_id=tests.id(100) limit 1 $$;
grant execute on function tests.cid(text) to authenticated,anon,service_role;

-- ---------- The registry and the tables ----------
select is((select row(input,one_per_person,counts,structured,shares_answers,spotlight,named)::text from private.interaction_kinds where kind='candidates'),'(t,t,people,t,t,none,never)','Candidates is registered: counted by people, no names');
select ok(private.kind_function('results','candidates','uuid,uuid,text[]') is not null and private.kind_function('options','candidates','jsonb,uuid') is not null
 and private.kind_function('parse','candidates','public.sessions,text,jsonb') is not null and private.kind_function('items','candidates','uuid,text[]') is not null,'The engine finds its functions by name');
select is((select count(*) from pg_class where oid=any(array['private.candidate_boards','private.candidates','private.candidate_sources','private.candidate_suggestions']::regclass[]) and relrowsecurity and relforcerowsecurity),4::bigint,'Every table the step writes is under forced row-level security');
select is((select count(*) from information_schema.role_table_grants where grantee in('authenticated','anon','public') and table_schema='private' and table_name in('candidate_boards','candidates','candidate_sources','candidate_suggestions')),0::bigint,'No browser role holds a privilege on them');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('candidate_suggest','candidates_control','candidates_state') and has_function_privilege('anon',p.oid,'execute')),0::bigint,'Anonymous callers cannot run the new functions');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('ai_claim','ai_apply') and has_function_privilege('authenticated',p.oid,'execute')),0::bigint,'The worker''s claim and apply stay out of browsers'' reach');
select ok((select bool_and(pg_get_constraintdef(oid) ~ j) from pg_constraint, unnest(array['propose_candidates','overnight_draft','group_lens','merge_reasons','summarize_wall','fold_questions','group_wall','combine_words']) j where conname='ai_runs_job_check'),'The job list holds the new job and every earlier one');

-- ---------- Saving the steps ----------
set local role authenticated;
select tests.login(1);
select is(tests.save_lens(410,'{"lens":1}')->>'status','ok','Lens 1 saves');
select is(tests.save_lens(411,'{"lens":2}')->>'status','ok','Lens 2 saves');
select is(tests.save(500,'candidates','{"ai":true,"cut":5}')->>'status','ok','Candidate priorities saves');
select is(tests.save(501,'candidates','{}')->>'status','ok','with no options');
select is(tests.save(502,'candidates','{"cut":7}')->>'status','invalid_request','A cut line outside 4 to 6 is refused');
select is(tests.save(502,'candidates','{"colour":"red"}')->>'status','invalid_request','An unknown setting is refused');
select is(tests.save(502,'candidates','{"ai":"yes"}')->>'status','invalid_request','AI is true or false');

-- ---------- The lens walls the candidates draw from ----------
select is(tests.ctl(902,'go_live',jsonb_build_object('session',tests.id(410)))->>'status','ok','Lens 1 goes live');
select tests.login(3);
select is(tests.say(701,410,'Zebrafish we welcome every stranger by name')->>'status','accepted','A person writes a lens 1 sentence');
select tests.login(5);
select is(tests.say(702,410,'Zebrafish we pray before every meal')->>'status','accepted','another');
select is(tests.say(703,410,'Zebrafish we eat together on Sundays')->>'status','accepted','and another');
select tests.login(1);
select is(tests.ctl(903,'go_live',jsonb_build_object('session',tests.id(411)))->>'status','ok','Lens 2 goes live');
select tests.login(3);
select is(tests.say(704,411,'Zebrafish our neighbours know us by name')->>'status','accepted','A lens 2 sentence');
select is(tests.say(705,411,'Zebrafish our hall is full on weekdays')->>'status','accepted','and another');
select tests.login(1);

-- ---------- Review: AI drafts, only the facilitator sees ----------
select is(tests.ctl(900,'go_live',jsonb_build_object('session',tests.id(500)))->>'status','ok','Go live on the candidates');
select is(tests.state()->>'phase','review','A new board is in review');
select is(tests.state()->'candidates','[]'::jsonb,'with no candidates');
select is(tests.results()->>'phase','review','The room results say only the phase');
select is(tests.results()->'candidates','[]'::jsonb,'and carry no candidate in review');
select tests.login(8);
select is(tests.state()->>'status','denied','A stranger cannot read the facilitator''s view');
select tests.login(3);
select is(tests.state()->>'status','denied','Nor can a participant');
select tests.login(1);
select is(tests.cc(905,'draft')->>'status','ok','The facilitator asks for a draft');
select is(tests.cc(905,'draft')->>'status','duplicate','A resent press is a duplicate');
select is(tests.cc(905,'send')->>'status','conflict','An id used for another action is a conflict');
select is(public.candidates_control(tests.id(100),tests.id(906),'draft',jsonb_build_object('from',tests.id(998)))->>'status','moved','A press against a room that moved is refused');
select is(tests.cc(907,'bogus')->>'status','invalid_request','An unknown action is refused');
reset role;
select is(tests.claim(500,802)->>'status','claimed','The worker claims the draft');
select is(tests.q($q$select job from private.ai_runs where status='running' and engagement_id=tests.id(100)$q$),'propose_candidates','under its own job');
select is(tests.q($q$select jsonb_array_length(inputs->'sentences')::text from private.ai_runs where status='running' and engagement_id=tests.id(100)$q$),'5','It reads the five sentences from both walls');
select ok(tests.q($q$select inputs::text from private.ai_runs where status='running' and engagement_id=tests.id(100)$q$) !~ ('Priya|Shah|person3|'||tests.id(503)),'and no name or person id');
select is(tests.claim(500,803)->>'status','busy','A second worker is turned away');
select is(tests.run_apply(802,jsonb_build_object('candidates',jsonb_build_array(
  jsonb_build_object('name','Welcome that knows your name','sources',jsonb_build_array('s1','s4')),
  jsonb_build_object('name','Prayer before everything','sources',jsonb_build_array('s2')),
  jsonb_build_object('name','welcome that KNOWS your name','sources',jsonb_build_array('s1')),
  jsonb_build_object('name','This name is far too long because it has more than ten words in it today','sources',jsonb_build_array('s1')),
  jsonb_build_object('name','Unsupported idea','sources',jsonb_build_array('s99')),
  jsonb_build_object('name','Said "in their words"','sources',jsonb_build_array('s3')),
  jsonb_build_object('name','Eating together','sources',jsonb_build_array('s3','s5')))))->>'status','ok','The model''s reply is applied');
select is(tests.names(),'Welcome that knows your name|Prayer before everything|Eating together','Only the candidates that pass the limits stand');
select is(tests.q($q$select jsonb_array_length(output->'refused')::text from private.ai_runs where job='propose_candidates' and status='ok'$q$),'4','The four that broke a limit were refused and logged');
select is(tests.q($q$select count(*)::text from private.candidate_sources cs join private.candidates c on c.id=cs.candidate_id where c.name='Welcome that knows your name'$q$),'2','Each candidate keeps its source sentences');
select is(tests.q($q$select origin from private.candidates where name='Eating together'$q$),'ai','They are marked as AI''s');
select is(tests.q($q$select ai_note from private.candidate_boards where session_id=tests.id(500)$q$),'short','and the board notes that AI proposed fewer than six');
set local role authenticated;
select tests.login(1);
select is(tests.results()->'candidates','[]'::jsonb,'The TV results still carry no candidate: review is the facilitator''s');
select is(jsonb_array_length(tests.state()->'candidates'),3,'The facilitator sees all three');
select ok(position('Zebrafish we welcome every stranger' in tests.state()::text)>0,'with the sentences behind them');
select is(jsonb_array_length(tests.state()->'wall'->'lenses'),5,'and the lens wall to write from by hand');
select tests.login(3);
select is(tests.suggest(710,'{"kind":"add","text":"Too early"}')->>'status','closed','A phone cannot suggest while the facilitator reviews');
select tests.login(4);
select is(tests.suggest(711,'{"kind":"add","text":"From the TV"}')->>'status','denied','Nor can the TV');

-- ---------- Review by hand ----------
select tests.login(1);
select is(tests.cc(920,'add','{"name":"Leaders raised here"}')->>'status','ok','The facilitator adds a candidate by hand');
select is(tests.cc(921,'add','{"name":"leaders RAISED here"}')->>'status','exists','The same name in other letters is refused');
select is(tests.cc(922,'add','{"name":"  "}')->>'status','invalid_request','An empty name is refused');
select is(tests.cc(923,'add',jsonb_build_object('name','Open doors all week','sources',jsonb_build_array(tests.id(9999))))->>'status','invalid_request','A source that is not a sentence is refused');
select is(tests.cc(924,'rename',jsonb_build_object('candidate',tests.id(920),'name','Leaders raised from within'))->>'status','ok','A candidate is renamed');
select is((tests.cand(920)).edited,true,'and marked as edited');
select is(tests.cc(925,'rename',jsonb_build_object('candidate',tests.id(920),'name','Leaders raised from within'))->>'status','unchanged','Renaming to the same words changes nothing');
select is(tests.cc(926,'rename',jsonb_build_object('candidate',tests.id(920),'name','Eating together'))->>'status','exists','A name another candidate holds is refused');
select is(tests.cc(927,'rename',jsonb_build_object('candidate',tests.id(9999),'name','Anything'))->>'status','missing','A candidate that is not there is missing');
select is(tests.cc(928,'send')->>'status','ok','Send to the TV');
select is(tests.cc(929,'send')->>'status','invalid_state','It cannot be sent twice');

-- ---------- The TV and phones see a number and a title ----------
select is(tests.results()->>'phase','sent','The room is in the sent phase');
select is(jsonb_array_length(tests.results()->'candidates'),4,'The TV results carry four candidates');
select is(tests.results()->'candidates'->0->>'name','Welcome that knows your name','in order, with their titles');
select ok(tests.results()::text !~ 'Zebrafish|sources|Priya|Shah|person3','and no sentence or name');
select ok(position('Welcome that knows your name' in tests.events_cand())>0 and tests.events_cand() !~ 'Zebrafish','The candidates were broadcast and no broadcast of the step carried a lens sentence');

-- ---------- A phone suggests ----------
select tests.login(3);
select is(tests.suggest(730,jsonb_build_object('kind','rename','candidate',tests.id(920),'text','Leaders sent out'))->>'status','accepted','A phone suggests a rename');
select is(tests.suggest(730,jsonb_build_object('kind','rename','candidate',tests.id(920),'text','Leaders sent out'))->>'status','duplicate','A resent suggestion is a duplicate');
select is(tests.suggest(731,jsonb_build_object('kind','rename','candidate',tests.id(920),'text','leaders SENT out'))->>'status','exists','The same suggestion again is refused');
select is(tests.suggest(732,jsonb_build_object('kind','rename','candidate',tests.id(920),'text','This is shit'))->>'status','filtered','The word filter applies');
select is(tests.suggest(733,jsonb_build_object('kind','rename','candidate',tests.id(920),'text','   '))->>'status','invalid_answer','An empty name is refused');
select is(tests.suggest(734,jsonb_build_object('kind','rename','candidate',tests.id(920),'text',repeat('x',121)))->>'status','invalid_answer','A long name is refused');
select is(tests.suggest(735,jsonb_build_object('kind','rename','candidate',tests.id(9999),'text','Anything'))->>'status','missing','A candidate that is not there is missing');
select is(tests.suggest(736,jsonb_build_object('kind','merge','candidate',tests.id(920),'into',tests.id(920)))->>'status','invalid_answer','A candidate cannot merge into itself');
select is(tests.suggest(737,jsonb_build_object('kind','merge','candidate',tests.id(920),'into',tests.cid('Eating together')))->>'status','accepted','A phone suggests a merge');
select is(tests.suggest(738,jsonb_build_object('kind','add','text','Open doors all week'))->>'status','accepted','and a new candidate');
select is(tests.suggest(739,jsonb_build_object('kind','add','text','eating together'))->>'status','exists','A new candidate that already stands is refused');
select is(tests.suggest(740,jsonb_build_object('kind','add','text','Third idea'))->>'status','accepted','a fourth suggestion');
select is(tests.suggest(741,jsonb_build_object('kind','add','text','Fourth idea'))->>'status','accepted','a fifth');
select is(tests.suggest(742,jsonb_build_object('kind','add','text','Fifth idea'))->>'status','accepted','a sixth');
select is(tests.suggest(743,jsonb_build_object('kind','add','text','Sixth idea'))->>'status','limit','Six suggestions a person');
select is(tests.suggest(744,'{"kind":"delete"}')->>'status','invalid_answer','An unknown kind is refused');
select is(tests.suggest(745,'{"kind":"add","text":"x","extra":1}')->>'status','invalid_answer','An unknown field is refused');
select tests.login(5);
select is(tests.suggest(730,jsonb_build_object('kind','add','text','Other'))->>'status','conflict','An id another person used is a conflict');
select is(tests.suggest(750,jsonb_build_object('kind','rename','candidate',tests.id(920),'text','Leaders sent out'))->>'status','accepted','A second person suggests the same rename');
select tests.login(4);
select is(tests.suggest(751,'{"kind":"add","text":"From the TV"}')->>'status','denied','The TV cannot suggest');
select tests.login(8);
select is(tests.suggest(752,'{"kind":"add","text":"From a stranger"}')->>'status','denied','Nor can a stranger');
select tests.login(1);
select is(tests.suggest(753,'{"kind":"add","text":"From the facilitator"}')->>'status','denied','The facilitator accepts suggestions rather than making them');
select is(jsonb_array_length(tests.results()->'candidates'),4,'Nothing a phone suggested reached the screen');
select ok(tests.results()::text !~ 'Leaders sent out|Open doors all week','not even its words');
select ok(tests.events_cand() !~ 'Open doors all week','nor any broadcast');
select is((select count(*)::integer from jsonb_array_elements(tests.state()->'suggestions') s where s->>'text'='Leaders sent out'),1,'The facilitator sees the same rename once');
select is((select (s->>'count')::integer from jsonb_array_elements(tests.state()->'suggestions') s where s->>'text'='Leaders sent out'),2,'with how many people suggested it');
select ok(position('Priya' in tests.state()::text)>0,'and their first names');
select ok(tests.results()::text !~ 'Priya|Ben','The TV results carry no name');

-- ---------- The facilitator accepts with one tap ----------
select is(tests.cc(960,'accept',jsonb_build_object('ids',(select s->'ids' from jsonb_array_elements(tests.state()->'suggestions') s where s->>'text'='Leaders sent out')))->>'status','ok','Accepting the rename takes both suggestions');
select is((tests.cand(920)).name,'Leaders sent out','The candidate has the new name');
select ok(tests.results()::text ~ 'Leaders sent out' and tests.results()::text !~ 'Leaders raised from within','and the TV shows it at once');
select is(tests.cc(961,'accept',jsonb_build_object('ids',jsonb_build_array(tests.id(9999))))->>'status','missing','A suggestion that is not there is missing');
select is(tests.cc(962,'accept',jsonb_build_object('ids',(select s->'ids' from jsonb_array_elements(tests.state()->'suggestions') s where s->>'text'='Open doors all week')))->>'status','ok','Accepting the new candidate adds it');
select is(tests.q($q$select origin from private.candidates where name='Open doors all week'$q$),'phone','as a phone''s');
select is(tests.cc(963,'accept',jsonb_build_object('ids',(select s->'ids' from jsonb_array_elements(tests.state()->'suggestions') s where s->>'kind'='merge')))->>'status','ok','Accepting the merge joins the two');
select is((tests.cand(920)).status,'merged','The first is merged');
select is(tests.q($q$select count(*)::text from private.candidate_sources where candidate_id=(select id from private.candidates where name='Eating together' and status='standing') and not deleted$q$),'2','and the one it joined keeps its own sources');
select is(jsonb_array_length(tests.results()->'merges'),1,'The TV is told which joined which, so the card can glide');
select is(tests.results()->'merges'->0->>'from',tests.id(920)::text,'the one that left');
select is(tests.cc(964,'dismiss',jsonb_build_object('ids',(select s->'ids' from jsonb_array_elements(tests.state()->'suggestions') s where s->>'text'='Third idea')))->>'status','ok','A suggestion is dismissed');
select is(tests.q($q$select count(*)::text from private.candidate_suggestions where text='Third idea' and status='dismissed'$q$),'1','and kept as dismissed');
select is(tests.cc(965,'remove',jsonb_build_object('candidate',tests.cid('Open doors all week')))->>'status','ok','A candidate is removed');
select is(tests.q($q$select count(*)::text from private.candidate_suggestions where status='pending' and candidate_id is not null$q$),'0','Suggestions about a candidate that is gone are dismissed');

-- ---------- The 100 points ----------
select is(tests.cc(970,'cut',jsonb_build_object('cut',7))->>'status','invalid_request','A cut line outside 4 to 6 is refused');
select is(tests.cc(971,'cut',jsonb_build_object('cut',4))->>'status','ok','The cut line moves');
select is(tests.cc(972,'cut',jsonb_build_object('cut',4))->>'status','unchanged','to the same place, nothing changes');
select tests.login(3);
select is(tests.points(980,500,jsonb_build_object(tests.cid('Eating together')::text,100))->>'status','invalid_answer','Points before they are opened are refused');
select tests.login(1);
select is(tests.cc(973,'open_points')->>'status','ok','Open the 100 points');
select is(tests.results()->>'phase','points','The room is in the points phase');
select is(jsonb_array_length(tests.results()->'bars'),3,'with a bar for each standing candidate');
select is(tests.results()->>'cut','0','and no cut line while there are only three');
select tests.login(3);
select is(tests.points(981,500,jsonb_build_object(tests.cid('Eating together')::text,50,tests.cid('Prayer before everything')::text,40))->>'status','invalid_answer','Points count once all 100 are placed');
select is(tests.points(982,500,jsonb_build_object(tests.id(9999)::text,100))->>'status','invalid_answer','Only the candidates');
select is(tests.points(983,500,jsonb_build_object(tests.cid('Eating together')::text,60,tests.cid('Prayer before everything')::text,40))->>'status','accepted','A person places 100 points');
select tests.login(5);
select is(tests.points(984,500,jsonb_build_object(tests.cid('Eating together')::text,30,tests.cid('Welcome that knows your name')::text,70))->>'status','accepted','another');
select tests.login(1);
select is(tests.results()->>'people','2','The count is of people');
select is(tests.results()->'bars'->0->>'text','Eating together','Eating together leads on 90 points');
select is((tests.results()->'bars'->0->>'points')::integer,90,'');
select ok(tests.results()::text !~ 'Priya|Ben|person3','and no name');
select is(tests.cc(974,'back')->>'status','has_points','The facilitator cannot go back once points are placed');
select is(tests.cc(975,'hold')->>'status','invalid_state','Nor hold back');
select is(tests.cc(976,'add','{"name":"Late idea"}')->>'status','invalid_state','The candidates are fixed while points are placed');
select tests.login(3);
select is(tests.suggest(985,'{"kind":"add","text":"Too late"}')->>'status','closed','Phones can no longer suggest');
select tests.login(1);

-- ---------- Mark the provisional Vision Outcomes ----------
select is(tests.cc(990,'mark',jsonb_build_object('ids',jsonb_build_array(tests.id(9999))))->>'status','missing','A candidate that is not there cannot be marked');
select is(tests.cc(991,'mark',jsonb_build_object('ids',jsonb_build_array()))->>'status','invalid_request','Marking none is refused');
select is(tests.cc(992,'mark',jsonb_build_object('reasons','The room kept coming back to these'))->>'status','ok','Marking with no choice takes the ones above the cut line');
select is(tests.q($q$select count(*)::text from private.vision_outcomes where engagement_id=tests.id(100) and status='provisional' and not deleted$q$),'3','Three provisional Vision Outcomes are written');
select is(tests.q($q$select title from private.vision_outcomes where engagement_id=tests.id(100) and status='provisional' and not deleted order by position limit 1$q$),'Eating together','in the order the points put them');
select is(tests.q($q$select subject||'|'||reasons from private.decisions where id=tests.id(992)$q$),'cut_line|The room kept coming back to these','with the decision and its reasons');
select is(tests.q($q$select (counts->>'people')||'|'||(counts->>'cut') from private.decisions where id=tests.id(992)$q$),'2|4','and the counts on screen when it was marked');
select is(tests.q($q$select count(*)::text from private.vision_outcomes where decision_id=tests.id(992)$q$),'3','Each outcome points at the decision');
select is(tests.results()->>'phase','marked','The room is in the marked phase');
select is(jsonb_array_length(tests.results()->'candidates'),3,'The TV shows only the marked ones');
select is(tests.results()->'candidates'->0->>'provisional','true','as provisional');
select is(tests.cc(993,'mark',jsonb_build_object('ids',jsonb_build_array(tests.cid('Eating together'),tests.cid('Prayer before everything'))))->>'status','ok','Marking again replaces the earlier marks');
select is(tests.q($q$select count(*)::text from private.vision_outcomes where engagement_id=tests.id(100) and status='provisional' and not deleted$q$),'2','leaving two');
select is(tests.q($q$select (select count(*) from private.vision_outcomes where engagement_id=tests.id(100) and deleted)::text$q$),'3','and the first three soft-deleted');
select is(tests.q($q$update private.vision_outcomes set status='confirmed',confirmed_at=now() where engagement_id=tests.id(100) and not deleted and title='Eating together' returning 'x'$q$),'x','An outcome is confirmed later');
select is(tests.cc(994,'mark',jsonb_build_object('ids',jsonb_build_array(tests.cid('Eating together'))))->>'status','locked','Once confirmed, marking again is refused');
select tests.login(3);
select is(tests.cc(995,'mark')->>'status','denied','A participant cannot mark');
select tests.login(4);
select is(tests.cc(996,'send')->>'status','denied','Nor the TV');
select tests.login(7);
select is(tests.cc(997,'send')->>'status','denied','Nor a facilitator of another room');

-- ---------- AI off, and the practice reset ----------
select tests.login(1);
reset role;
select is(tests.q($q$update public.engagements set settings='{"ai_enabled":false}' where id=tests.id(100) returning 'x'$q$),'x','AI is switched off for the engagement');
select is(tests.claim(500,810)->>'status','off','With AI off the worker has nothing to claim');
select is(tests.q($q$update public.engagements set settings='{"ai_enabled":true}' where id=tests.id(100) returning 'x'$q$),'x','and back on');
select is(private.ai_on(tests.id(500)),true,'AI switches back on');
select is(private.ai_on(tests.id(410)),true,'and still serves a lens wall');
select is(private.ai_on(tests.id(500)),true,'and the candidates');
select ok(position('candidate_boards' in pg_get_functiondef('private.reset_practice_room()'::regprocedure))>0 and position('lens_summaries' in pg_get_functiondef('private.reset_practice_room()'::regprocedure))>0,'The practice reset clears the candidates and keeps clearing what it did before');
select * from finish();
rollback;
