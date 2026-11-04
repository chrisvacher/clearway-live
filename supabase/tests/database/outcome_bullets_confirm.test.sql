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
create function tests.ctl(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$
 select public.room_control(tests.id(100),tests.id(n),action,jsonb_build_object('from',tests.live())||p) $$;
create function tests.save(n integer,kind text,options jsonb default '{}',state text default 'ready') returns jsonb language sql as $$
 select public.show_write(tests.id(100),'save',jsonb_build_object('id',tests.id(n),'revision',null,'title','Step '||n,'part','Day 1','mode','live','interaction',kind,
  'prompt','In {{year}}, what is true?','phone_depth','','notes','','lands_in','','segment','','state',state,'planned_minutes',5,'max_sends',5,'max_characters',200,'max_words',50,
  'settings',jsonb_build_object('anonymous',true,'burst_minutes',4,'join_strip',false),'options',options)) $$;
create function tests.type(bullet integer,session integer,outcome integer,text text,seq integer,revision integer default null) returns jsonb language sql as $$
 select public.bullet_type(tests.id(100),tests.id(bullet),tests.id(session),tests.id(outcome),text,seq,revision) $$;
create function tests.send(n integer,session integer,revision integer,action text,text text,value jsonb) returns jsonb language sql as $$
 select public.live_submit(tests.id(100),tests.id(n),tests.id(session),revision,action,text,now(),null,0,value) $$;
create function tests.bctl(n integer,action text,p jsonb) returns jsonb language sql as $$ select public.bullet_control(tests.id(100),tests.id(n),action,p) $$;
create function tests.cctl(n integer,action text,p jsonb) returns jsonb language sql as $$ select public.confirm_control(tests.id(100),tests.id(n),action,p) $$;
create function tests.current() returns jsonb language sql security definer set search_path='' as $$ select results->'current' from public.room_states where engagement_id=tests.id(100) $$;
create function tests.rail(o integer) returns jsonb language sql security definer set search_path='' as $$
 select e from jsonb_array_elements((select results->'outcomes' from public.room_states where engagement_id=tests.id(100))) e where e->>'id'=tests.id(o)::text $$;
create function tests.crow(o integer) returns jsonb language sql security definer set search_path='' as $$
 select e from jsonb_array_elements((select results->'outcomes' from public.room_states where engagement_id=tests.id(100))) e where e->>'id'=tests.id(o)::text $$;
create function tests.reopen_window() returns void language sql security definer set search_path='' as $$ update private.bullet_flush set flushed_at='epoch' $$;
create function tests.hold_window() returns void language sql security definer set search_path='' as $$ update private.bullet_flush set flushed_at=clock_timestamp()+interval '1 hour' $$;
create function tests.hold_lock(b integer) returns void language sql security definer set search_path='' as $$ update private.bullet_locks set locked_until=clock_timestamp()+interval '1 hour' where bullet_id=tests.id(b) $$;
create function tests.release_locks() returns void language sql security definer set search_path='' as $$ update private.bullet_locks set locked_until=now()-interval '1 second' $$;
grant execute on all functions in schema tests to authenticated,anon,service_role;

insert into churches(id,name,timezone) values(tests.id(200),'Riverside Church','America/Toronto');
insert into engagements(id,church_id,title,settings) values(tests.id(100),tests.id(200),'Outcomes room','{"scripture_translation":"NIV"}');
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
insert into private.tv_devices(id,proof,engagement_id,label,paired_at) values(tests.id(450),repeat('a',64),tests.id(100),'Front TV',now());
insert into private.live_tv_sessions(id,engagement_id,auth_user_id,auth_session_id,device_id) values(tests.id(400),tests.id(100),tests.id(4),tests.id(1004),tests.id(450));
insert into private.vision_outcomes(id,engagement_id,title,status,confirmed_at,position) values
 (tests.id(3001),tests.id(100),'Leaders raised from within','provisional',null,0),
 (tests.id(3002),tests.id(100),'Families find a home here','provisional',null,1),
 (tests.id(3003),tests.id(100),'A church that shows up','provisional',null,2);
insert into private.outcome_indicators(id,engagement_id,outcome_id,text,position) values(tests.id(3101),tests.id(100),tests.id(3001),'12 apprentice leaders serve',0);

-- The kinds and their tables.
select is((select row(input,one_per_person,counts,structured,shares_answers,spotlight,named)::text from private.interaction_kinds where kind='bullets'),'(t,f,answers,t,t,id,never)','Outcome bullets is registered: several per person, counted as answers, Spotlight by id');
select is((select row(input,one_per_person,counts,structured,shares_answers,spotlight,named)::text from private.interaction_kinds where kind='confirm'),'(t,t,people,t,f,none,never)','Outcome confirm is registered: one answer per person, never shared');
select ok((select array_agg(kind) from private.interaction_kinds) @> array['word_cloud','wall','qa','bullets','confirm'],'The earlier kinds stay registered');
select is((select count(*) from pg_class where oid=any(array['private.bullet_drafts','private.bullet_locks','private.bullet_flush','private.outcome_focus']::regclass[]) and relrowsecurity and relforcerowsecurity),4::bigint,'All four new tables force row-level security');
select is((select count(*) from information_schema.role_table_grants where grantee in('authenticated','anon','public') and table_schema='private' and table_name in('bullet_drafts','bullet_locks','bullet_flush','outcome_focus')),0::bigint,'Browsers hold no privilege on them');

set local role authenticated;
select tests.login(1);
select is(tests.save(310,'bullets','{}')->>'status','ok','An Outcome bullets step saves');
select is(tests.save(311,'confirm','{}')->>'status','ok','An Outcome confirm step saves');
select is(tests.save(312,'bullets','{"x":1}')->>'status','invalid_request','These steps have no settings');
select is(tests.ctl(900,'go_live',jsonb_build_object('session',tests.id(310)))->>'status','ok','Go live on Outcome bullets');
select is(tests.current()->>'id',tests.id(3001)::text,'The TV starts on the first Vision Outcome');
select is((tests.results()->>'year')::integer,(select base_year+3 from engagements where id=tests.id(100)),'The question is years from the base year');
select is(tests.rail(3002)->'empty','true'::jsonb,'An outcome with no bullets is empty, from code');
select is(tests.rail(3001)->'empty','false'::jsonb,'One with a bullet is not');

-- Typing: draft, batching and the room told once per window.
select tests.login(1);
select is(tests.bctl(901,'show',jsonb_build_object('outcome',tests.id(3002)))->>'status','ok','The facilitator puts the second outcome on the screen');
select is(tests.current()->>'id',tests.id(3002)::text,'The TV changed with it');
select tests.login(3);
select is(tests.type(500,310,3002,'We',1)->>'status','ok','A phone types the first letters');
select is(tests.current()->'bullets'->0->>'text','We','They are on the TV at once, as typed');
select is(tests.current()->'bullets'->0->'typing','true'::jsonb,'and marked as typing');
reset role;
select tests.hold_window();
set local role authenticated;
select tests.login(3);
select is(tests.type(500,310,3002,'We are',2)->'pending','true'::jsonb,'Keystrokes inside the window wait to be told');
select is(tests.current()->'bullets'->0->>'text','We','The room is not told on every keystroke');
reset role;
select tests.reopen_window();
set local role authenticated;
select tests.login(3);
select is(public.bullet_nudge(tests.id(100),tests.id(310))->'pending','false'::jsonb,'A nudge tells the room once the window passes');
select is(tests.current()->'bullets'->0->>'text','We are','Now it shows "We are"');
select is(tests.current()->'empty','true'::jsonb,'The outcome stays empty until a bullet is sent');
select tests.login(3);
select is(tests.type(500,310,3002,'We are',2)->>'status','stale','An old or repeated update is ignored');
select is(tests.type(500,310,3002,'We are '||repeat('x',300),3)->>'status','limit','Over the limit is refused as it is typed');
select is(tests.type(500,310,3002,'We are shit',3)->>'status','filtered','The word filter screens typed text');
select tests.login(5);
select is(tests.type(500,310,3002,'Hijack',4)->>'status','conflict','Another person cannot type into someone else''s bullet');
select tests.login(8);
select is(tests.type(501,310,3002,'Stranger',1)->>'status','denied','A signed-in stranger cannot type');
select is(public.bullet_control(tests.id(100),tests.id(990),'show','{}')->>'status','denied','Nor press the facilitator''s controls');
select tests.login(3);
select is(tests.bctl(991,'show',jsonb_build_object('outcome',tests.id(3001)))->>'status','denied','A participant cannot choose the outcome');
select is(tests.type(502,310,3999,'Nowhere',1)->>'status','missing','Typing needs a real outcome');

-- Sending: the typed text becomes the answer and the outcome''s indicator.
select is(tests.send(500,310,0,'submit','We are growing',jsonb_build_object('outcome',tests.id(3002)))->>'status','accepted','The bullet is sent under the id it was typed with');
select tests.login(1);
select is(tests.current()->'bullets'->0->>'text','We are growing','The sent wording replaces the typed wording');
select is(tests.current()->'bullets'->0->'typing','false'::jsonb,'and is no longer typing');
select is(tests.current()->'empty','false'::jsonb,'The outcome is no longer empty');
reset role;
select is((select count(*) from private.outcome_indicators where submission_id=tests.id(500) and not deleted),1::bigint,'It is the outcome''s indicator');
select is((select count(*) from private.bullet_drafts where id=tests.id(500)),0::bigint,'The draft is gone');
select is(private.outcome_is_empty(tests.id(3002)),false,'Step 1''s empty check agrees');
set local role authenticated;
select tests.login(3);
select is(tests.type(500,310,3002,'Late keystrokes',9)->>'status','stale','Keystrokes arriving after Add change nothing');

-- Field lock: the author holds a bullet for three seconds; the facilitator waits, then fixes it.
reset role;
select tests.hold_lock(500);
set local role authenticated;
select tests.login(1);
select is(tests.bctl(902,'edit',jsonb_build_object('bullet',tests.id(500),'text','We are growing in 2029'))->>'status','locked','The facilitator waits while the author holds the bullet');
reset role;
select tests.release_locks();
set local role authenticated;
select tests.login(1);
select is(tests.bctl(903,'edit',jsonb_build_object('bullet',tests.id(500),'text','We are growing in 2029'))->>'status','ok','Then the facilitator fixes the wording');
select is(tests.bctl(903,'edit',jsonb_build_object('bullet',tests.id(500),'text','We are growing in 2029'))->>'status','duplicate','The same press never applies twice');
select is(tests.current()->'bullets'->0->>'text','We are growing in 2029','The TV shows the fix');
select tests.login(3);
select is(tests.type(503,310,3002,'Mine now',1)->>'status','ok','Another bullet of the same author types normally');
select is(tests.send(500,310,1,'withdraw','',null)->>'status','accepted','A withdrawn bullet leaves');
reset role;
select is(private.outcome_is_empty(tests.id(3002)),true,'and the outcome is empty again');
select is((select count(*) from private.bullet_flush),1::bigint,'One flush marker per step');
set local role authenticated;

-- Outcome confirm.
select tests.login(1);
select is(tests.ctl(910,'go_live',jsonb_build_object('session',tests.id(311)))->>'status','ok','Go live on Outcome confirm');
select is(jsonb_array_length(tests.results()->'outcomes'),3,'Three provisional outcomes on screen');
select tests.login(3);
select is(tests.send(600,311,0,'submit','',jsonb_build_object('outcomes',jsonb_build_object(tests.id(3001)::text,jsonb_build_object('c','confirm'),tests.id(3002)::text,jsonb_build_object('c','challenge','reason','Too broad'),tests.id(3003)::text,jsonb_build_object('c','rename','name','A church for the city'))))->>'status','accepted','A phone confirms, challenges and renames in one answer');
select is(tests.send(601,311,0,'submit','',jsonb_build_object('outcomes',jsonb_build_object(tests.id(3003)::text,jsonb_build_object('c','rename'))))->>'status','invalid_answer','A rename needs a name');
select is(tests.send(602,311,0,'submit','',jsonb_build_object('outcomes',jsonb_build_object(tests.id(3003)::text,jsonb_build_object('c','vote'))))->>'status','invalid_answer','Only confirm, rename or challenge');
select is(tests.send(603,311,0,'submit','',jsonb_build_object('outcomes',jsonb_build_object(tests.id(3003)::text,jsonb_build_object('c','confirm','extra',1))))->>'status','invalid_answer','Nothing else rides along');
select tests.login(5);
select is(tests.send(610,311,0,'submit','',jsonb_build_object('outcomes',jsonb_build_object(tests.id(3001)::text,jsonb_build_object('c','confirm'),tests.id(3002)::text,jsonb_build_object('c','challenge')))) ->>'status','accepted','Ben answers too');
select tests.login(1);
select is(tests.crow(3001)->>'c','2','Two confirm the first outcome');
select is(tests.crow(3002)->>'x','2','Two challenge the second');
select is(tests.crow(3002)->'challenged','true'::jsonb,'A challenged outcome is marked for the TV');
select is(tests.crow(3001)->'decision','null'::jsonb,'Counts never decide: still provisional');
select ok(tests.results()::text not like '%Too broad%' and tests.results()::text not like '%A church for the city%','No reason or suggested name reaches the TV');
select is((tests.results()->>'people')::integer,2,'Counted by people');
select tests.login(3);
select is(tests.send(620,311,0,'submit','',jsonb_build_object('outcomes',jsonb_build_object(tests.id(3002)::text,jsonb_build_object('c','confirm'))))->>'status','accepted','Priya changes her mind with a new answer');
select tests.login(1);
select is(tests.crow(3002)->>'x','1','Her earlier answer is replaced, not added');
select is(public.confirm_for(tests.id(100))->'outcomes'->0->>'id',tests.id(3002)::text,'The challenged outcome lifts to the top of the facilitator''s list');
select is(public.confirm_for(tests.id(100))->'outcomes'->0->'reasons','[]'::jsonb,'Her reason went with her replaced answer');
select tests.login(5);
select is(public.confirm_for(tests.id(100))->>'status','denied','A participant cannot read the room''s reasons');
select is(tests.cctl(920,'decide',jsonb_build_object('outcome',tests.id(3001),'kind','confirm'))->>'status','denied','Nor decide');
select tests.login(8);
select is(public.confirm_for(tests.id(100))->>'status','denied','Nor a stranger');
select tests.login(1);
select is(tests.cctl(921,'decide',jsonb_build_object('outcome',tests.id(3001),'kind','vote'))->>'status','invalid_request','Only confirm, rename or remove');
select is(tests.cctl(921,'decide',jsonb_build_object('outcome',tests.id(3001),'kind','rename'))->>'status','invalid_request','A rename needs a name');
select is(tests.cctl(921,'decide',jsonb_build_object('outcome',tests.id(3999),'kind','confirm'))->>'status','missing','The outcome must exist');
select is(tests.cctl(922,'decide',jsonb_build_object('outcome',tests.id(3001),'kind','confirm','reasons','The room agreed it fits','description','Leaders come from within.','stop','Hiring leaders from outside first'))->>'status','ok','The facilitator records the room''s decision');
select is(tests.cctl(922,'decide',jsonb_build_object('outcome',tests.id(3001),'kind','confirm'))->>'status','duplicate','A retried press never writes twice');
select is(tests.cctl(923,'decide',jsonb_build_object('outcome',tests.id(3001),'kind','remove'))->>'status','decided','An outcome is decided once');
reset role;
select is((select row(subject,subject_id,decision,reasons)::text from private.decisions where id=tests.id(922)),'(outcome,'||tests.id(3001)||',Confirmed,"The room agreed it fits")','It is a Mark a decision record about the outcome, with its reasons');
select is((select row(status,description,what_we_stop)::text from private.vision_outcomes where id=tests.id(3001)),'(confirmed,"Leaders come from within.","Hiring leaders from outside first")','The outcome is confirmed with its one line and what the church will stop');
select is((select decision_id from private.vision_outcomes where id=tests.id(3001)),tests.id(922),'and points at the decision');
set local role authenticated;
select tests.login(1);
select is(tests.crow(3001)->>'decision','confirmed','The TV row says Confirmed');
select is(tests.cctl(924,'decide',jsonb_build_object('outcome',tests.id(3003),'kind','rename','name','A church for the city','reasons','Clearer'))->>'status','ok','Renaming confirms under the new name');
select is(tests.crow(3003)->>'decision','renamed','The TV row says Renamed');
select is(tests.crow(3003)->>'was','A church that shows up','and keeps the old name to strike through');
select is(public.confirm_for(tests.id(100))->'range'->>'note','fewer','Two confirmed is below four: a note, not a block');
select is(tests.cctl(925,'details',jsonb_build_object('outcome',tests.id(3002),'description','Families belong.'))->>'status','ok','A description saves any time');
select is(tests.cctl(926,'details',jsonb_build_object('outcome',tests.id(3002)))->>'status','invalid_request','Details need something to save');
select is(tests.cctl(927,'decide',jsonb_build_object('outcome',tests.id(3002),'kind','remove','reasons','Folded into the first'))->>'status','ok','An outcome can be removed by the room''s decision');
select is(jsonb_array_length(tests.results()->'outcomes'),2,'and leaves the screen');
select is(public.confirm_for(tests.id(100))->'range'->>'confirmed','2','The range counts the confirmed ones');
select * from finish();
rollback;
