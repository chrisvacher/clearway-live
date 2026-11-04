-- Milestone 5, step 1: the scribe console. Who may capture, read and re-file; the speaker kept for
-- the record; no duplicates on replay; the team-led flag; photos and files in the private bucket.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('87500000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(1000+n))::text,true); end $$;
create function tests.ctl(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$
 select public.room_control(tests.id(100),tests.id(n),action,jsonb_build_object('from',(select live_session_id from public.room_states where engagement_id=tests.id(100)))||p) $$;
create function tests.card(n integer,session_n integer,kind text,text text,detail jsonb default '{}',speaker text default null) returns jsonb language sql as $$
 select public.scribe_capture(tests.id(100),tests.id(n),tests.id(session_n),kind,text,detail,speaker,now()) $$;
create function tests.state() returns jsonb language sql as $$ select public.scribe_state(tests.id(100)) $$;
create function tests.cards() returns integer language sql security definer set search_path='' as $$ select count(*)::integer from private.scribe_cards where engagement_id=tests.id(100) $$;
create function tests.files() returns integer language sql security definer set search_path='' as $$ select count(*)::integer from private.scribe_files where engagement_id=tests.id(100) $$;
grant execute on all functions in schema tests to authenticated,anon,service_role;

insert into churches(id,name,timezone) values(tests.id(200),'Riverside Church','America/Toronto'),(tests.id(201),'Lakeside Church','America/Toronto');
insert into engagements(id,church_id,title) values(tests.id(100),tests.id(200),'Wayfinding room'),(tests.id(101),tests.id(201),'Another room');
insert into auth.users(id,email,email_confirmed_at)
select tests.id(n),case when n in(1,2,7) then 'fac'||n||'@clearway.co' else 'person'||n||'@example.org' end,now() from generate_series(1,9)n;
insert into auth.sessions(id,user_id) select tests.id(1000+n),tests.id(n) from generate_series(1,9)n;
insert into auth.identities(user_id,provider,provider_id,identity_data) select id,'google',id::text,jsonb_build_object('email',email,'email_verified',true) from auth.users where id in(tests.id(1),tests.id(2),tests.id(7));
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method) select gen_random_uuid(),tests.id(1000+n),now(),now(),'oauth' from generate_series(1,2)n union all select gen_random_uuid(),tests.id(1007),now(),now(),'oauth';
insert into clearway_users(id,auth_user_id,name,email,is_admin,team_hub_team_member_id) values
 (tests.id(701),tests.id(1),'Chris Vacher','fac1@clearway.co',false,tests.id(801)),
 (tests.id(702),tests.id(2),'Jaisy Tam','fac2@clearway.co',false,tests.id(802)),
 (tests.id(707),tests.id(7),'Other Facilitator','fac7@clearway.co',false,tests.id(807));
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values(tests.id(100),tests.id(701),'lead'),(tests.id(100),tests.id(702),'co_facilitator'),(tests.id(101),tests.id(707),'lead');
insert into attendees(id,engagement_id,auth_user_id,name,email,verified_at,room_role) values
 (tests.id(503),tests.id(100),tests.id(3),'Krista Scribe','person3@example.org',now(),'scribe'),
 (tests.id(504),tests.id(100),tests.id(4),'Priya Shah','person4@example.org',now(),'participant'),
 (tests.id(506),tests.id(100),tests.id(6),'Pending Scribe','person6@example.org',null,'scribe'),
 (tests.id(508),tests.id(101),tests.id(8),'Other Scribe','person8@example.org',now(),'scribe');
insert into device_sessions(engagement_id,attendee_id,auth_session_id) values
 (tests.id(100),tests.id(503),tests.id(1003)),(tests.id(100),tests.id(504),tests.id(1004)),(tests.id(101),tests.id(508),tests.id(1008));
insert into private.tv_devices(id,proof,engagement_id,label,paired_at) values(tests.id(450),repeat('a',64),tests.id(100),'Front TV',now());
insert into private.live_tv_sessions(id,engagement_id,auth_user_id,auth_session_id,device_id) values(tests.id(400),tests.id(100),tests.id(5),tests.id(1005),tests.id(450));
insert into sessions(id,engagement_id,title,part,position,state,interaction) values
 (tests.id(310),tests.id(100),'Five Lenses: Community','Day 1',1,'ready','wall'),
 (tests.id(311),tests.id(100),'Five Lenses: Leadership','Day 1',2,'ready','wall'),
 (tests.id(312),tests.id(100),'Commander''s intent','Day 2',1,'ready','wall'),
 (tests.id(320),tests.id(101),'Elsewhere','Day 1',1,'ready','wall');
select private.scribe_storage_setup();
create temp table tests_notices(n integer);

set local role authenticated;

-- The run of show carries the team-led flag; only a facilitator of this engagement sets it.
select tests.login(1);
select is(public.session_team_led(tests.id(100),tests.id(312),true)->>'status','ok','The lead marks the commander''s intent step team-led');
select is(((public.show_read(tests.id(100))->'sessions')->0)->>'team_led','false','The run of show reads the flag (off by default)');
select is((select count(*)::integer from jsonb_array_elements(public.show_read(tests.id(100))->'sessions') s where s->>'id'=tests.id(312)::text and s->>'team_led'='true'),1,'The run of show reads the flag (on)');
select tests.login(2);
select is(public.session_team_led(tests.id(100),tests.id(312),true)->>'status','ok','The co-facilitator can set it too');
select is(public.session_team_led(tests.id(100),tests.id(312),null)->>'status','invalid_request','A missing value is refused');
select tests.login(3);
select is(public.session_team_led(tests.id(100),tests.id(311),true)->>'status','denied','The scribe cannot mark a step team-led');
select tests.login(4);
select is(public.session_team_led(tests.id(100),tests.id(311),true)->>'status','denied','A participant cannot');
select tests.login(7);
select is(public.session_team_led(tests.id(100),tests.id(311),true)->>'status','denied','A facilitator of another engagement cannot');
select tests.login(1);
select is(public.session_team_led(tests.id(100),tests.id(320),true)->>'status','not_found','A step of another engagement is not found');

-- Who sees the console's state.
select tests.login(3);
select is(tests.state()->>'status','ok','The scribe reads the console state');
select is(tests.state()->>'role','scribe','as the scribe');
select tests.login(1);
select is(tests.state()->>'role','facilitator','The lead reads it for the feed');
select tests.login(2);
select is(tests.state()->>'status','ok','The co-facilitator reads it for the feed');
select tests.login(4);
select is(tests.state()->>'status','denied','A participant does not');
select tests.login(5);
select is(tests.state()->>'status','denied','A TV does not');
select tests.login(6);
select is(tests.state()->>'status','denied','A scribe who has not verified does not');
select tests.login(7);
select is(tests.state()->>'status','denied','A facilitator of another engagement does not');
select tests.login(8);
select is(tests.state()->>'status','denied','A scribe of another engagement does not');
select tests.login(9);
select is(tests.state()->>'status','denied','Someone with no place in the room does not');
reset role;
set local role anon;
select throws_ok($$select public.scribe_state(tests.id(100))$$,'42501',null,'An unsigned browser cannot call it');
select throws_ok($$select public.scribe_capture(tests.id(100),tests.id(900),tests.id(310),'quote','x','{}',null,now())$$,'42501',null,'or capture');
reset role;
set local role authenticated;

-- Nothing live: the state says so; the console follows the room.
select tests.login(3);
select is(tests.state()->'live','null'::jsonb,'Nothing is live yet');
select tests.login(1);
select is(tests.ctl(901,'go_live',jsonb_build_object('session',tests.id(310)))->>'status','ok','Go live on Five Lenses: Community');
select tests.login(3);
select is(tests.state()->'live'->>'id',tests.id(310)::text,'The scribe sees the live step');
select is(tests.state()->'live'->>'team_led','false','which is not team-led');
select is((select count(*)::integer from jsonb_array_elements(tests.state()->'sessions')),3,'and this engagement''s steps to re-file to');

-- Capture: every kind, with its details.
select is(tests.card(1,310,'quote','If we weren''t here, the city would notice.','{}','Tasha Brown')->>'status','accepted','A quote is captured with a speaker kept for the record');
select is(tests.card(2,310,'decision','A few deep partnerships, not many shallow ones.','{"why":"Depth is what neighbours notice."}')->>'status','accepted','A decision with why');
select is(tests.card(3,310,'tension','Growth: more services or more groups?','{"views":["More services.","More groups."]}','Daniel and Ruth')->>'status','accepted','A tension with both views');
select is(tests.card(4,310,'action','List our community partners.','{"owner":"Sam","date":"Nov 20"}')->>'status','accepted','An action with an owner and date');
select is(tests.card(5,310,'question','Does the food bank belong to Community or Operations?')->>'status','accepted','A question');
select is(tests.card(6,310,'mitigation','Name one person to check the budget monthly.','{"risk":"Money runs short"}')->>'status','accepted','A mitigation linked to a risk');
select is(tests.cards(),6,'Six cards are stored');

-- A replay is a duplicate: no second card, however many times it is sent.
select is(tests.card(1,310,'quote','If we weren''t here, the city would notice.','{}','Tasha Brown')->>'status','duplicate','Replaying the first card is a duplicate');
select is(tests.card(1,310,'quote','Changed text on a replay')->>'status','duplicate','A replay with other text still changes nothing');
select is(tests.card(6,310,'mitigation','Name one person to check the budget monthly.','{"risk":"Money runs short"}')->>'status','duplicate','Replaying the last card is a duplicate');
select is(tests.cards(),6,'Still six cards after the replay');
select is((select string_agg(c->>'kind',',' order by c->>'seq') from jsonb_array_elements(tests.state()->'cards') c),'quote,decision,tension,action,question,mitigation','Cards are kept in the order they were sent');
select is(tests.state()->'cards'->0->>'kind','mitigation','and listed newest first');

-- Checks.
select is(tests.card(20,310,'photo','x')->>'status','invalid_request','Photo is not a card kind');
select is(tests.card(21,310,'quote','')->>'status','invalid_request','Empty text is refused');
select is(tests.card(22,310,'quote',repeat('a',2001))->>'status','invalid_request','Text over 2,000 characters is refused');
select is(tests.card(23,310,'quote','x','{"views":["a","b"]}')->>'status','invalid_request','Views belong to a tension only');
select is(tests.card(24,310,'action','x','{"owner":"Sam","extra":"no"}')->>'status','invalid_request','Unknown detail keys are refused');
select is(tests.card(25,310,'tension','x','{"views":["only one"]}')->>'status','invalid_request','A tension takes both views');
select is(tests.card(26,320,'quote','Elsewhere')->>'status','invalid_session','A step of another engagement is refused');
select is(tests.card(27,999,'quote','Nowhere')->>'status','invalid_session','An unknown step is refused');
select is(public.scribe_capture(tests.id(100),null,tests.id(310),'quote','x','{}',null,now())->>'status','invalid_request','A card with no id is refused');
select is(tests.cards(),6,'None of those was stored');

-- Team-led: the console is off for that step, for new cards and for replays.
select is(tests.card(30,312,'quote','Said during the team-led block')->>'status','team_led','A card for a team-led step is refused');
select is(public.scribe_file_begin(tests.id(100),tests.id(931),tests.id(312),'photo','easel.jpg','image/jpeg',1000,now())->>'status','team_led','and so is a photo');
select tests.login(1);
select is(public.session_team_led(tests.id(100),tests.id(312),false)->>'status','ok','Turning the flag off');
select tests.login(3);
select is(tests.card(30,312,'quote','Said once the block ended')->>'status','accepted','brings the console back for that step');

-- Others cannot capture, even with a valid id.
select tests.login(1);
select is(tests.card(40,310,'quote','From the lead')->>'status','denied','A facilitator does not capture');
select tests.login(4);
select is(tests.card(41,310,'quote','From a participant')->>'status','denied','A participant cannot capture');
select tests.login(5);
select is(tests.card(42,310,'quote','From the TV')->>'status','denied','A TV cannot capture');
select tests.login(6);
select is(tests.card(43,310,'quote','From a scribe who has not verified')->>'status','denied','An unverified scribe cannot capture');
select tests.login(8);
select is(tests.card(44,310,'quote','From a scribe of another engagement')->>'status','denied','A scribe of another engagement cannot capture here');
select is(public.scribe_capture(tests.id(101),tests.id(1),tests.id(320),'quote','Taking another room''s id','{}',null,now())->>'status','conflict','and cannot reuse a card id from this room');
select is(tests.cards(),7,'Only the scribe''s seven cards exist');

-- The speaker is kept for the record and never read by the console, the feed or any browser.
select tests.login(3);
select is(tests.state()->'cards'->6->>'kind','quote','The first card is the oldest');
select is(tests.state()->'cards'->6->>'has_speaker','true','The console learns only that a speaker was kept');
select is((select count(*)::integer from jsonb_array_elements(tests.state()->'cards') c where c ? 'speaker'),0,'No card in the state carries a speaker');
select is(position('Tasha' in tests.state()::text),0,'No name appears anywhere in the scribe''s state');
select tests.login(1);
select is(position('Tasha' in tests.state()::text),0,'or in the feed''s state');
select is(public.scribe_speakers(tests.id(100))->'speakers'->>tests.id(1)::text,'Tasha Brown','Facilitators read the speaker for review');
select tests.login(2);
select is(public.scribe_speakers(tests.id(100))->>'status','ok','including the co-facilitator');
select tests.login(3);
select is(public.scribe_speakers(tests.id(100))->>'status','denied','The scribe does not read speakers back');
select tests.login(4);
select is(public.scribe_speakers(tests.id(100))->>'status','denied','A participant does not');
select tests.login(5);
select is(public.scribe_speakers(tests.id(100))->>'status','denied','A TV does not');
select tests.login(7);
select is(public.scribe_speakers(tests.id(100))->>'status','denied','A facilitator of another engagement does not');
select throws_ok($$select speaker from private.scribe_cards$$,'42501',null,'No browser role reads the table directly');
select throws_ok($$select count(*) from private.scribe_files$$,'42501',null,'or the files table');
select throws_ok($$insert into private.scribe_cards(id,engagement_id,session_id,kind,text,attendee_id,captured_at) values(gen_random_uuid(),tests.id(100),tests.id(310),'quote','x',tests.id(503),now())$$,'42501',null,'or writes a card without the checks');

-- Edit and re-file.
select tests.login(3);
select is(public.scribe_edit(tests.id(100),tests.id(5),'Does the food bank belong to Community or to Operations?','{}',null,0)->>'status','ok','The scribe edits a card');
select is(public.scribe_edit(tests.id(100),tests.id(5),'Stale edit','{}',null,0)->>'status','conflict','An edit made on an old copy is refused');
select is(public.scribe_edit(tests.id(100),tests.id(5),'x','{"owner":"no"}',null,1)->>'status','invalid_request','Details must fit the kind');
select is(public.scribe_edit(tests.id(100),tests.id(999),'x','{}',null,0)->>'status','not_found','An unknown card is not found');
select is(public.scribe_refile(tests.id(100),tests.id(5),tests.id(311))->>'status','ok','The scribe re-files a card to another step');
select is(public.scribe_refile(tests.id(100),tests.id(5),tests.id(311))->>'status','unchanged','Re-filing to the same step changes nothing');
select is(public.scribe_refile(tests.id(100),tests.id(5),tests.id(320))->>'status','invalid_session','A step of another engagement is refused');
select is((select c->>'session_id' from jsonb_array_elements(tests.state()->'cards') c where c->>'id'=tests.id(5)::text),tests.id(311)::text,'The card is under the new step');
select is((select c->>'refiled' from jsonb_array_elements(tests.state()->'cards') c where c->>'id'=tests.id(5)::text),'true','and marked re-filed');
select tests.login(1);
select tests.login(2);
select is(public.scribe_edit(tests.id(100),tests.id(5),'x','{}',null,2)->>'status','denied','A facilitator does not edit scribe cards');
select is(public.scribe_refile(tests.id(100),tests.id(5),tests.id(310))->>'status','denied','or re-file them');
select tests.login(4);
select is(public.scribe_refile(tests.id(100),tests.id(5),tests.id(310))->>'status','denied','A participant cannot re-file');

-- Photos and files: the row decides who may write the object.
reset role;
select private.scribe_storage_setup();
set local role authenticated;
select tests.login(3);
select is(public.scribe_file_begin(tests.id(100),tests.id(901),tests.id(310),'photo','easel page 1.jpg','image/jpeg',250000,now())->>'status','accepted','The scribe starts an easel photo');
select is(public.scribe_file_begin(tests.id(100),tests.id(901),tests.id(310),'photo','easel page 1.jpg','image/jpeg',250000,now())->>'uploaded','false','A replay says it is not uploaded yet');
select is(public.scribe_file_begin(tests.id(100),tests.id(901),tests.id(310),'photo','easel page 1.jpg','image/jpeg',250000,now())->>'status','duplicate','and is a duplicate');
select is(public.scribe_file_begin(tests.id(100),tests.id(902),tests.id(310),'file','North end partners map.pdf','application/pdf',2400000,now())->>'status','accepted','A document is accepted');
select is(public.scribe_file_begin(tests.id(100),tests.id(903),tests.id(310),'photo','notes.pdf','application/pdf',1000,now())->>'status','invalid_request','A photo must be an image');
select is(public.scribe_file_begin(tests.id(100),tests.id(904),tests.id(310),'file','run.exe','application/x-msdownload',1000,now())->>'status','invalid_request','Unknown file types are refused');
select is(public.scribe_file_begin(tests.id(100),tests.id(905),tests.id(310),'file','huge.pdf','application/pdf',15728641,now())->>'status','invalid_request','Files over 15 MB are refused');
select is(public.scribe_file_begin(tests.id(100),tests.id(906),tests.id(320),'file','a.pdf','application/pdf',1000,now())->>'status','invalid_session','A step of another engagement is refused');
select is(tests.files(),2,'Two files are stored');
select tests.login(4);
select is(public.scribe_file_begin(tests.id(100),tests.id(907),tests.id(310),'photo','a.jpg','image/jpeg',1000,now())->>'status','denied','A participant cannot start an upload');
select tests.login(1);
select is(public.scribe_file_begin(tests.id(100),tests.id(907),tests.id(310),'photo','a.jpg','image/jpeg',1000,now())->>'status','denied','A facilitator does not either');

-- The bucket policies: write only the scribe's own pending path; read for scribe and facilitators.
select tests.login(3);
select is(public.scribe_file_done(tests.id(100),tests.id(901))->>'status','missing','Done before the bytes arrive is refused');
select lives_ok(format($$insert into storage.objects(bucket_id,name) values('scribe',%L)$$,tests.id(100)||'/'||tests.id(310)||'/'||tests.id(901)||'.jpg'),'The scribe writes the object the row names');
select throws_ok(format($$insert into storage.objects(bucket_id,name) values('scribe',%L)$$,tests.id(100)||'/'||tests.id(310)||'/'||tests.id(555)||'.jpg'),'42501',null,'but not a path no row names');
select throws_ok(format($$insert into storage.objects(bucket_id,name) values('other',%L)$$,tests.id(100)||'/'||tests.id(310)||'/'||tests.id(902)||'.pdf'),'42501',null,'or another bucket');
select is(public.scribe_file_done(tests.id(100),tests.id(901))->>'status','ok','Done marks it uploaded');
select is(public.scribe_file_done(tests.id(100),tests.id(901))->>'status','duplicate','and a second Done does nothing');
select is(public.scribe_file_begin(tests.id(100),tests.id(901),tests.id(310),'photo','easel page 1.jpg','image/jpeg',250000,now())->>'uploaded','true','A replay now says it is uploaded');
select throws_ok(format($$insert into storage.objects(bucket_id,name) values('scribe',%L)$$,tests.id(100)||'/'||tests.id(310)||'/'||tests.id(901)||'.jpg'),'42501',null,'An uploaded path cannot be written again');
select is((select count(*)::integer from storage.objects where bucket_id='scribe'),1,'The scribe reads the object');
select is(public.scribe_file_read(tests.id(100),tests.id(901))->>'status','ok','and its path');
select is(public.scribe_file_read(tests.id(100),tests.id(902))->>'status','not_found','A file not uploaded yet has no path to read');
select tests.login(1);
select is((select count(*)::integer from storage.objects where bucket_id='scribe'),1,'The lead reads the object');
select is(public.scribe_file_read(tests.id(100),tests.id(901))->>'status','ok','and its path');
select throws_ok(format($$insert into storage.objects(bucket_id,name) values('scribe',%L)$$,tests.id(100)||'/'||tests.id(310)||'/'||tests.id(902)||'.pdf'),'42501',null,'A facilitator does not write the bucket');
select tests.login(4);
select is((select count(*)::integer from storage.objects where bucket_id='scribe'),0,'A participant reads nothing');
select is(public.scribe_file_read(tests.id(100),tests.id(901))->>'status','denied','and no path');
select throws_ok(format($$insert into storage.objects(bucket_id,name) values('scribe',%L)$$,tests.id(100)||'/'||tests.id(310)||'/'||tests.id(902)||'.pdf'),'42501',null,'and writes nothing');
select tests.login(5);
select is((select count(*)::integer from storage.objects where bucket_id='scribe'),0,'A TV reads nothing');
select tests.login(7);
select is((select count(*)::integer from storage.objects where bucket_id='scribe'),0,'A facilitator of another engagement reads nothing');
select tests.login(8);
select is((select count(*)::integer from storage.objects where bucket_id='scribe'),0,'A scribe of another engagement reads nothing');
select is(public.scribe_file_done(tests.id(100),tests.id(902))->>'status','denied','and cannot finish this room''s upload');
select tests.login(3);
select is(public.scribe_refile(tests.id(100),tests.id(901),tests.id(311))->>'status','ok','A photo is re-filed like a card');
select is((select f->>'session_id' from jsonb_array_elements(tests.state()->'files') f where f->>'id'=tests.id(901)::text),tests.id(311)::text,'and sits under the new step');
select is((select (f->>'uploaded') from jsonb_array_elements(tests.state()->'files') f where f->>'id'=tests.id(901)::text),'true','as an uploaded file');
select is(position('easel' in tests.state()::text)>0,true,'The state names the file for the console');
reset role;

-- What the capture told the facilitators' private channel: a hint with no content.
select ok((select count(*) from realtime.messages where event='fac' and payload->>'kind'='scribe')>=7,'Captures send the control surface a private hint');
select is((select count(*)::integer from realtime.messages where event='fac' and payload::text like '%city would notice%'),0,'and the hint carries no words');
select is((select count(*)::integer from realtime.messages where payload::text like '%Tasha%'),0,'or any speaker');
-- Nothing from the scribe reaches the room's shared channel.
select is((select count(*)::integer from realtime.messages where payload::text like '%city would notice%' or payload::text like '%easel page%'),0,'No channel carries a card''s words or a file''s name');
-- The service role keeps working (server jobs in later steps).
set local role service_role;
select is((select count(*)::integer from private.scribe_cards),7,'The server role can read the cards for the overnight draft');
reset role;
select * from finish();
rollback;
