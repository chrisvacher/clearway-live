-- Milestone 5, step 2: the overnight drafts and their review. Who may read and change a draft; the round that opens
-- when Day 1 closes; what the model is given and what is kept from its reply (sources, numbers, quotes, voices
-- and tensions apart); section locks; versions; restoring the room's words; publishing; a draft that fails and is
-- written by hand. Nothing from a draft reaches the TV or a phone before it is published.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('88500000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(1000+n))::text,true); end $$;
create function tests.ctl(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$
 select public.room_control(tests.id(100),tests.id(n),action,jsonb_build_object('from',(select live_session_id from public.room_states where engagement_id=tests.id(100)))||p) $$;
create function tests.ov() returns jsonb language sql as $$ select public.overnight_state(tests.id(100)) $$;
create function tests.draft(n integer) returns jsonb language sql as $$ select o from jsonb_array_elements(tests.ov()->'outcomes') o where (o->>'outcome_id')=tests.id(n)::text $$;
create function tests.rev(n integer) returns integer language sql as $$ select (tests.draft(n)->>'revision')::integer $$;
create function tests.did(n integer) returns uuid language sql as $$ select (tests.draft(n)->>'id')::uuid $$;
create function tests.bullet(n integer,i integer) returns uuid language sql as $$ select (tests.draft(n)->'bullets'->i->>'id')::uuid $$;
create function tests.texts(n integer) returns text language sql as $$ select string_agg(b->>'text','|' order by (b->>'position')::int) from jsonb_array_elements(tests.draft(n)->'bullets') b where (b->>'removed')='false' $$;
create function tests.raw(sql text) returns text language plpgsql security definer set search_path='' as $$ declare r text; begin execute sql into r; return r; end $$;
grant execute on all functions in schema tests to authenticated,anon,service_role;

insert into churches(id,name,timezone) values(tests.id(200),'Riverside Church','America/Toronto'),(tests.id(201),'Lakeside Church','America/Toronto');
insert into engagements(id,church_id,title,base_year,settings) values(tests.id(100),tests.id(200),'Wayfinding room',2026,'{"ai_enabled":true}'),(tests.id(101),tests.id(201),'Another room',2026,'{"ai_enabled":true}');
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
 (tests.id(310),tests.id(100),'Provisional Vision Outcomes','Day 1',1,'ready','wall'),
 (tests.id(311),tests.id(100),'Pre-mortem','Day 1',2,'ready','wall'),
 (tests.id(312),tests.id(100),'Commander''s intent','Day 2',1,'ready','wall'),
 (tests.id(320),tests.id(101),'Elsewhere','Day 1',1,'ready','wall');
-- Three provisional Vision Outcomes with the room's bullets, the scribe's cards, and two easel photos.
insert into private.vision_outcomes(id,engagement_id,title,status,position) values
 (tests.id(3001),tests.id(100),'Leaders raised from within','provisional',0),
 (tests.id(3002),tests.id(100),'Families find a home here','provisional',1),
 (tests.id(3003),tests.id(100),'A church that shows up','provisional',2),
 (tests.id(3011),tests.id(101),'Elsewhere outcome','provisional',0);
insert into private.outcome_indicators(id,engagement_id,outcome_id,text,position) values
 (tests.id(3101),tests.id(100),tests.id(3001),'leaders grow here and lead here',0),
 (tests.id(3102),tests.id(100),tests.id(3001),'a few deep partnerships with the city',1),
 (tests.id(3103),tests.id(100),tests.id(3002),'kids and parents belong',0),
 (tests.id(3111),tests.id(101),tests.id(3011),'one bullet from the other room',0);
insert into private.scribe_cards(id,engagement_id,session_id,kind,text,detail,speaker,attendee_id,captured_at) values
 (tests.id(4001),tests.id(100),tests.id(310),'quote','If we weren''t here, the city would notice.','{}','Tasha Brown',tests.id(503),now()),
 (tests.id(4002),tests.id(100),tests.id(310),'decision','A few deep partnerships, not many shallow ones.','{"why":"Depth is what neighbours notice."}',null,tests.id(503),now()),
 (tests.id(4003),tests.id(100),tests.id(310),'tension','Growth: more services or more groups?','{"views":["More services.","More groups."]}','Daniel and Ruth',tests.id(503),now()),
 (tests.id(4004),tests.id(100),tests.id(310),'action','List our community partners.','{"owner":"Sam Lee","date":"Nov 20"}',null,tests.id(503),now()),
 (tests.id(4005),tests.id(100),tests.id(311),'question','Does the food bank belong to Community or Operations?','{}',null,tests.id(503),now()),
 (tests.id(4006),tests.id(100),tests.id(311),'quote','120 people came to the Alpha supper, and 30 stayed.','{}','Ben Ortiz',tests.id(503),now()),
 (tests.id(4007),tests.id(100),tests.id(312),'quote','A Day 2 card is not part of the Day 1 draft.','{}',null,tests.id(503),now());
insert into private.scribe_files(id,engagement_id,session_id,kind,name,content_type,bytes,storage_path,uploaded_at,attendee_id,captured_at) values
 (tests.id(4101),tests.id(100),tests.id(310),'photo','easel-1.jpg','image/jpeg',2000,tests.id(100)||'/'||tests.id(310)||'/'||tests.id(4101)||'.jpg',now(),tests.id(503),now()),
 (tests.id(4102),tests.id(100),tests.id(311),'photo','easel-2.heic','image/heic',2000,tests.id(100)||'/'||tests.id(311)||'/'||tests.id(4102)||'.heic',now(),tests.id(503),now());
create temp table tests_notices(n integer);

set local role authenticated;

-- Before Day 1 closes there is nothing to review, for the facilitators; nothing at all for anyone else.
select tests.login(1);
select is(tests.ov()->>'status','none','Nothing to review before Day 1 closes');
select is(public.overnight_summary(tests.id(100))->>'status','none','and the summary says so');
select is(tests.ctl(901,'go_live',jsonb_build_object('session',tests.id(310)))->>'status','ok','Go live on the first Day 1 step');
select is(tests.ctl(902,'go_live',jsonb_build_object('session',tests.id(311)))->>'status','ok','then the second');
reset role;
update public.sessions set state='closed',closed_at=now() where id=tests.id(310);
select is((select count(*)::integer from private.overnight_rounds),0,'A step ending on its own does not open the round');
set local role authenticated;
select tests.login(1);
select is(tests.ctl(903,'close_part',jsonb_build_object('part','Pre-call'))->>'status','unchanged','Closing a part with nothing open changes nothing');
reset role;
select is((select count(*)::integer from private.overnight_rounds),0,'(seen as the owner too)');
set local role authenticated;
select tests.login(1);
select is(tests.ctl(904,'close_part',jsonb_build_object('part','Day 1'))->>'status','ok','Closing Day 1');
reset role;
select is((select count(*)::integer from private.overnight_rounds where engagement_id=tests.id(100) and status='pending'),1,'opens one pending round for the engagement');
select is((select count(*)::integer from private.draft_outcomes where engagement_id=tests.id(100)),3,'with a draft for each provisional Vision Outcome');
select is((select count(*)::integer from private.draft_versions v join private.draft_outcomes d on d.id=v.draft_outcome_id where d.engagement_id=tests.id(100) and v.kind='start'),3,'and a first version for each');
select is((select count(*)::integer from private.overnight_rounds where engagement_id=tests.id(101)),0,'The other room has none');
set local role authenticated;
select tests.login(1);
select is(tests.ctl(905,'close_part',jsonb_build_object('part','Day 2'))->>'status','unchanged','Closing Day 2 later does not open a second one');
select is(tests.ov()->'round'->>'status','pending','The review reads: drafting');
select is((select count(*)::integer from jsonb_array_elements(tests.ov()->'outcomes')),3,'with three outcomes');
select is(tests.ov()->'check'->>'drafting','true','and the publish check says the draft is still running');
select is(tests.ov()->'check'->>'ready','false','so it cannot be published yet');

-- Who may read: the facilitators of this engagement and no one else.
select tests.login(2);
select is(tests.ov()->>'status','ok','The co-facilitator reads the review');
select is(tests.ov()->>'lead','false','who is not the lead');
select tests.login(3);
select is(tests.ov()->>'status','denied','The scribe does not');
select is(public.overnight_summary(tests.id(100))->>'status','denied','not even the summary');
select tests.login(4);
select is(tests.ov()->>'status','denied','A participant does not');
select tests.login(5);
select is(tests.ov()->>'status','denied','A TV does not');
select tests.login(6);
select is(tests.ov()->>'status','denied','A scribe who has not verified does not');
select tests.login(7);
select is(tests.ov()->>'status','denied','A facilitator of another engagement does not');
select tests.login(8);
select is(tests.ov()->>'status','denied','A scribe of another engagement does not');
select tests.login(9);
select is(tests.ov()->>'status','denied','Someone with no place in the room does not');
select is(public.overnight_published(tests.id(100))->>'status','denied','or the published snapshot');
reset role;
set local role anon;
select throws_ok($$select public.overnight_state(tests.id(100))$$,'42501',null,'An unsigned browser cannot call it');
select throws_ok($$select public.overnight_publish(tests.id(100),tests.id(990))$$,'42501',null,'or publish');
reset role;
set local role authenticated;
select tests.login(1);
select throws_ok($$select count(*) from private.draft_outcomes$$,'42501',null,'A facilitator reads the draft tables only through the functions');
select throws_ok($$select count(*) from private.draft_bullets$$,'42501',null,'bullets');
select throws_ok($$select count(*) from private.draft_versions$$,'42501',null,'versions');
select throws_ok($$select count(*) from private.overnight_publications$$,'42501',null,'and publications');
select throws_ok($$select public.overnight_claim(tests.id(100),tests.id(950),'m','{"overnight_draft":"overnight-draft@1"}')$$,'42501',null,'and cannot claim the model''s work');
select throws_ok($$select public.overnight_apply(tests.id(951),tests.id(950),'{}','{}')$$,'42501',null,'or apply a reply');
select tests.login(4);
select throws_ok($$select count(*) from private.draft_outcomes$$,'42501',null,'A participant reads no draft table');
select tests.login(5);
select throws_ok($$select count(*) from private.draft_notes$$,'42501',null,'A TV reads no draft table');
select is(public.overnight_edit(tests.id(100),tests.id(990),0,'{"bullets":[]}')->>'status','denied','and edits nothing');
reset role;

-- The model's inputs: text, counts and images under short refs; never a speaker, an owner, an attendee or an id the model needs.
set local role service_role;
select is(public.overnight_due(tests.id(100)),true,'The server sees the round is due');
select is(public.overnight_claim(tests.id(100),tests.id(950),'fake-model','{"overnight_draft":"overnight-draft@1"}')->>'status','claimed','The worker claims it');
reset role;
select is((select status from private.overnight_rounds where engagement_id=tests.id(100)),'drafting','The round is drafting');
select is((select job||'|'||prompt_version||'|'||status from private.ai_runs where engagement_id=tests.id(100) and job='overnight_draft'),'overnight_draft|overnight-draft@1|running','and the run is in the same log, with its prompt version');
select is((select session_id is null from private.ai_runs where job='overnight_draft' and engagement_id=tests.id(100)),true,'which belongs to the engagement, not a step');
select is((select jsonb_array_length(inputs->'outcomes') from private.ai_runs where job='overnight_draft' and engagement_id=tests.id(100)),3,'It was given three outcomes');
select is((select jsonb_array_length(inputs->'cards') from private.ai_runs where job='overnight_draft' and engagement_id=tests.id(100)),6,'six Day 1 cards (not the Day 2 card)');
select is((select jsonb_array_length(inputs->'photos') from private.ai_runs where job='overnight_draft' and engagement_id=tests.id(100)),2,'and two easel photos');
select is((select inputs->'photos'->0->>'caption' from private.ai_runs where job='overnight_draft' and engagement_id=tests.id(100)),'easel-1.jpg','with their captions');
select is((select (inputs->'photos'->1->>'readable')::boolean from private.ai_runs where job='overnight_draft' and engagement_id=tests.id(100)),false,'and says which the model cannot read');
select is((select position('Tasha' in inputs::text)+position('Daniel' in inputs::text)+position('Ben Ortiz' in inputs::text)+position('Sam Lee' in inputs::text)+position('Krista' in inputs::text)+position('attendee' in inputs::text)+position('speaker' in inputs::text)+position('owner' in inputs::text) from private.ai_runs where job='overnight_draft' and engagement_id=tests.id(100)),0,'No speaker, owner or attendee reaches the model');
set local role service_role;
select is(public.overnight_claim(tests.id(100),tests.id(952),'fake-model','{"overnight_draft":"overnight-draft@1"}')->>'status','busy','A second worker waits for the lease');
select is(public.overnight_claim(tests.id(100),tests.id(953),'fake-model','{"overnight_draft":"bad version!"}')->>'status','invalid_request','A malformed prompt version is refused');
reset role;

-- What is kept from the reply.
create temp table tests_out(o jsonb);
grant select on tests_out to service_role;
insert into tests_out values($j${"outcomes":[
 {"outcome":"o1","bullets":[
  {"text":"Leaders grow here and lead here","sources":[{"ref":"o1b1"}]},
  {"text":"We keep a few deep partnerships with the city, not many shallow ones.","sources":[{"ref":"o1b2"},{"ref":"c2","excerpt":"A few deep partnerships"}]},
  {"text":"Alpha suppers welcome 120 people and 30 stay.","sources":[{"ref":"c6"}]},
  {"text":"Alpha welcomes 500 people each season.","sources":[{"ref":"c6"}]},
  {"text":"We are known across the city.","sources":[]},
  {"text":"The city would \"notice\" us.","sources":[{"ref":"c1"}]},
  {"text":"A bullet that cites a ref nobody gave.","sources":[{"ref":"c99"}]}],
  "voices":[{"text":"If we weren't here, the city would notice.","source":"c1"},{"text":"We would be missed.","source":"c1"},{"text":"Growth: more services or more groups?","source":"c3"}],
  "tensions":[{"text":"Growth: more services or more groups?","source":"c3"},{"text":"Does the food bank belong to Community or Operations?","source":"c5"},{"text":"If we weren't here, the city would notice.","source":"c1"}]},
 {"outcome":"o2","bullets":[]},
 {"outcome":"o9","bullets":[{"text":"Not an outcome in this run","sources":[{"ref":"c1"}]}]}],
 "unreadable":[{"photo":"p1"}]}$j$);
set local role service_role;
select is(public.overnight_apply((select id from private.ai_runs where job='overnight_draft' and engagement_id=tests.id(100)),tests.id(999),(select o from tests_out),'{"input_tokens":1000,"output_tokens":300,"ms":5000}')->>'status','stale','A reply under the wrong lease is ignored');
select is(public.overnight_apply((select id from private.ai_runs where job='overnight_draft' and engagement_id=tests.id(100)),tests.id(950),(select o from tests_out),'{"input_tokens":1000,"output_tokens":300,"cost_usd":0.002,"ms":5000}')->>'status','ok','The reply is applied');
select is(public.overnight_apply((select id from private.ai_runs where job='overnight_draft' and engagement_id=tests.id(100)),tests.id(950),(select o from tests_out),'{}')->>'status','stale','and cannot be applied twice');
select is(public.overnight_due(tests.id(100)),false,'Nothing is due after it');
reset role;
select is((select status||'|'||(ready_at is not null) from private.overnight_rounds where engagement_id=tests.id(100)),'ready|true','The round is ready');
select ok((select ready_at-day_closed_at<interval '30 minutes' from private.overnight_rounds where engagement_id=tests.id(100)),'within 30 minutes of Day 1 closing');
select is((select status||'|'||input_tokens||'|'||output_tokens||'|'||(cost_usd is not null) from private.ai_runs where job='overnight_draft' and engagement_id=tests.id(100)),'ok|1000|300|true','The run log has its tokens and cost');
select is((select count(*)::integer from private.draft_bullets b join private.draft_outcomes d on d.id=b.draft_outcome_id where d.outcome_id=tests.id(3001)),3,'Three bullets are kept for the first outcome');
select is((select string_agg(b.text,'|' order by b.position) from private.draft_bullets b join private.draft_outcomes d on d.id=b.draft_outcome_id where d.outcome_id=tests.id(3001)),
 'Leaders grow here and lead here|We keep a few deep partnerships with the city, not many shallow ones.|Alpha suppers welcome 120 people and 30 stay.','in order');
select is((select string_agg(b.origin,',' order by b.position) from private.draft_bullets b join private.draft_outcomes d on d.id=b.draft_outcome_id where d.outcome_id=tests.id(3001)),'room,ai,ai','One is the room''s own words; two are tidied');
select is((select b.room_text from private.draft_bullets b join private.draft_outcomes d on d.id=b.draft_outcome_id where d.outcome_id=tests.id(3001) and b.position=1),'a few deep partnerships with the city','The room''s words are kept beside the tidied bullet');
select is((select count(*)::integer from private.draft_sources s join private.draft_bullets b on b.id=s.bullet_id where b.draft_outcome_id in (select id from private.draft_outcomes where outcome_id=tests.id(3001))),4,'Every kept bullet is linked to its sources (one, two and one, and the bullet''s own)');
select is((select count(*)::integer from private.draft_bullets b where not exists(select 1 from private.draft_sources s where s.bullet_id=b.id)),0,'No kept bullet lacks a source');
select is((select run.output->>'refused' from private.ai_runs run where job='overnight_draft' and engagement_id=tests.id(100) and false),null,'(placeholder)');
select is((select jsonb_array_length(output->'refused') from private.ai_runs where job='overnight_draft' and engagement_id=tests.id(100)),4,'Four bullets were refused: a number no card has, no source, a quote, and a ref nobody gave (an outcome that is not in the run is skipped)');
select is((select count(*)::integer from private.draft_notes n join private.draft_outcomes d on d.id=n.draft_outcome_id where d.outcome_id=tests.id(3001) and n.kind='voice'),1,'One voice not to lose: the word-for-word line, not the invented one, not a tension card');
select is((select count(*)::integer from private.draft_notes n join private.draft_outcomes d on d.id=n.draft_outcome_id where d.outcome_id=tests.id(3001) and n.kind='tension'),2,'Two tensions the room named: from the tension and question cards, not the quote');
select is((select count(*)::integer from private.draft_notes n where n.kind='voice' and n.text like 'Growth%'),0,'A voice never comes from a tension card');
select is((select count(*)::integer from private.draft_outcomes where round_id=(select id from private.overnight_rounds where engagement_id=tests.id(100)) and tidy='tidied'),3,'All three outcomes are tidied (a thin one stays thin)');
select is((select array_length(unreadable,1) from private.overnight_rounds where engagement_id=tests.id(100)),2,'Two easel photos are flagged: the format it cannot read, and the one the model named');
select is((select count(*)::integer from private.draft_versions v join private.draft_outcomes d on d.id=v.draft_outcome_id where v.kind='ai' and d.engagement_id=tests.id(100) and v.actor_id is null),3,'The tidy is a version of each, by no person');
select is(private.ov_count('1','bullet')||'|'||private.ov_count('1','scribe card')||'|'||private.ov_count('1','easel photo'),'1 bullet|1 scribe card|1 easel photo','The version note says one in the singular');
select is(private.ov_count('0','bullet')||'|'||private.ov_count('16','scribe card')||'|'||private.ov_count(null,'easel photo'),'0 bullets|16 scribe cards|0 easel photos','and zero or many in the plural');
select is((select count(*)::integer from private.draft_versions v where v.kind='ai' and v.engagement_id=tests.id(100) and v.what ~ '^Tidied from [0-9]+ bullets?, [0-9]+ scribe cards? and [0-9]+ easel photos?$' and v.what !~ '(^| )1 (bullets|scribe cards|easel photos)'),3,'Each tidy note reads right for its counts');
select is((select count(*)::integer from private.draft_sources where kind='photo' and ref_id is null),0,'(photos link by id)');

-- The review as the facilitators see it.
set local role authenticated;
select tests.login(1);
select is(tests.ov()->'round'->>'status','ready','Drafts are ready');
select is(tests.texts(3001),'Leaders grow here and lead here|We keep a few deep partnerships with the city, not many shallow ones.|Alpha suppers welcome 120 people and 30 stay.','The first outcome reads as tidied');
select is(tests.draft(3002)->>'thin','true','The second has no bullets: thin');
select is(tests.draft(3003)->>'thin','true','and so does the third');
select is(jsonb_array_length(tests.draft(3001)->'voices'),1,'Voices not to lose are their own list');
select is(jsonb_array_length(tests.draft(3001)->'tensions'),2,'apart from the tensions');
select is(tests.draft(3001)->'bullets'->1->>'restorable','true','The tidied bullet can restore the room''s words');
select is(tests.draft(3001)->'bullets'->0->>'restorable','false','The room''s own bullet has nothing to restore');
select is(tests.draft(3002)->'room_bullets'->0->>'text','kids and parents belong','The room''s bullets are listed for an outcome that has none');
select is((select count(*)::integer from jsonb_each(tests.ov()->'cards')),6,'Day 1 scribe cards are listed for the sources panel');
select is(position('Tasha' in tests.ov()::text)+position('Daniel' in tests.ov()::text)+position('Ben Ortiz' in tests.ov()::text),0,'Speakers are not in the review state');
select is(public.scribe_speakers(tests.id(100))->'speakers'->>tests.id(4001)::text,'Tasha Brown','Speaker names come from the scribe record, to facilitators only');
select is((select count(*)::integer from jsonb_array_elements_text(tests.ov()->'unplaced') where value=tests.id(4004)::text),1,'A card that rests nowhere is listed as unplaced');
select is(tests.ov()->'check'->>'ready','false','Not publishable: nothing is reviewed');
select is(tests.ov()->'check'->>'reviewed','0','none reviewed');

-- Section locks. The lead starts editing the first outcome; the co-facilitator can read it and cannot change it.
select is(public.overnight_presence(tests.id(100),tests.did(3001)::text,true)->>'status','ok','The lead starts editing the first outcome');
select tests.login(2);
select is(tests.draft(3001)->'lock'->>'by','Chris','The co-facilitator sees who holds it');
select is(public.overnight_edit(tests.id(100),tests.did(3001),tests.rev(3001),jsonb_build_object('bullets','[]'::jsonb))->>'status','locked','and cannot change it');
select is(public.overnight_restore_words(tests.id(100),tests.did(3001),tests.bullet(3001,1),tests.rev(3001))->>'status','locked','or restore words in it');
select is(public.overnight_accept(tests.id(100),tests.did(3001),tests.rev(3001))->>'status','locked','or accept it');
select is(public.overnight_presence(tests.id(100),tests.did(3001)::text,true)->>'status','locked','Asking to edit says who has it');
select is(public.overnight_presence(tests.id(100),tests.did(3002)::text,true)->>'status','ok','The other outcome is free to edit');
select is(tests.ov()->'check'->'editing'->0->>'by','Chris','The publish check lists who is still editing');
select is(jsonb_array_length(tests.ov()->'presence'),2,'Both facilitators show as present');
select is(public.overnight_presence(tests.id(100),'nowhere',false)->>'status','invalid_request','A made-up place is refused');
select is(public.overnight_presence(tests.id(100),tests.id(999)::text,false)->>'status','not_found','and so is a draft that does not exist');
reset role;
update private.review_presence set seen_at=clock_timestamp()-interval '90 seconds' where user_id=tests.id(701);
set local role authenticated;
select tests.login(2);
select is(tests.draft(3001)->'lock','null'::jsonb,'A lock that has not been seen for 40 seconds is free');
select is(public.overnight_presence(tests.id(100),'overview',false)->>'status','ok','The co-facilitator stops editing the second outcome');

-- Restore the room's words, in one action.
select tests.login(1);
select is(public.overnight_restore_words(tests.id(100),tests.did(3001),tests.bullet(3001,1),tests.rev(3001))->>'status','ok','The lead restores the room''s words in bullet 2');
select is(tests.draft(3001)->'bullets'->1->>'text','a few deep partnerships with the city','The bullet now reads exactly as the room typed it');
select is(tests.draft(3001)->'bullets'->1->>'origin','room','and counts as the room''s words');
select is(tests.draft(3001)->'bullets'->1->>'ai_text','We keep a few deep partnerships with the city, not many shallow ones.','The AI''s wording is kept');
select is(public.overnight_restore_words(tests.id(100),tests.did(3001),tests.bullet(3001,1),tests.rev(3001))->>'status','unchanged','Restoring again changes nothing');
select is(public.overnight_restore_words(tests.id(100),tests.did(3001),tests.bullet(3001,2),tests.rev(3001))->>'status','no_room_words','A bullet resting on cards has no single set of words to restore');
select is(public.overnight_restore_words(tests.id(100),tests.did(3001),tests.bullet(3001,1),0)->>'status','conflict','A stale revision is refused');
select is((select what from jsonb_array_elements(public.overnight_versions(tests.id(100),tests.did(3001))->'versions') v(v), lateral (select v->>'what' as what) w where (v->>'n')::int=3),'Restored the room''s words in bullet 2','The version list says what happened');
select is((select (v->>'by') from jsonb_array_elements(public.overnight_versions(tests.id(100),tests.did(3001))->'versions') v where (v->>'n')::int=3),'Chris','and who did it');

-- Edit: a new bullet has no source until it is given one, and cannot be accepted.
select is(public.overnight_edit(tests.id(100),tests.did(3001),tests.rev(3001),jsonb_build_object('bullets',jsonb_build_array(
 jsonb_build_object('id',tests.bullet(3001,0),'text','Leaders grow here and lead here'),
 jsonb_build_object('id',tests.bullet(3001,1),'text','a few deep partnerships with the city'),
 jsonb_build_object('id',tests.bullet(3001,2),'text','Alpha suppers welcome 120 people and 30 stay.'),
 jsonb_build_object('text','Alpha welcomes 500 people each season.'))))->>'status','ok','The lead adds a bullet by hand');
select is(tests.draft(3001)->'bullets'->3->>'flag','none','It shows as having no source');
select is(public.overnight_accept(tests.id(100),tests.did(3001),tests.rev(3001))->>'status','flagged','and the outcome cannot be accepted with it');
select is(public.overnight_source(tests.id(100),tests.did(3001),tests.bullet(3001,3),'card',tests.id(4006),true,tests.rev(3001))->>'status','ok','The lead gives it the scribe card as its source');
select is(tests.draft(3001)->'bullets'->3->>'flag','number','Now it rests on a card, but the card has no 500');
select is(public.overnight_edit(tests.id(100),tests.did(3001),tests.rev(3001),jsonb_build_object('bullets',jsonb_build_array(
 jsonb_build_object('id',tests.bullet(3001,0),'text','Leaders grow here and lead here'),
 jsonb_build_object('id',tests.bullet(3001,1),'text','a few deep partnerships with the city'),
 jsonb_build_object('id',tests.bullet(3001,2),'text','Alpha suppers welcome 120 people and 30 stay.'),
 jsonb_build_object('id',tests.bullet(3001,3),'text','Alpha welcomes 120 people each season.'))))->>'status','ok','Rewritten with the number the card has');
select is(tests.draft(3001)->'bullets'->3->>'flag',null,'the flag clears');
select is(public.overnight_source(tests.id(100),tests.did(3001),tests.bullet(3001,3),'bullet',tests.id(3103),true,tests.rev(3001))->>'status','not_found','A room bullet of another outcome is not a source');
select is(public.overnight_source(tests.id(100),tests.did(3001),tests.bullet(3001,3),'photo',tests.id(4102),true,tests.rev(3001))->>'status','ok','An easel photo is');
select is(public.overnight_source(tests.id(100),tests.did(3001),tests.bullet(3001,3),'photo',tests.id(4102),false,tests.rev(3001))->>'status','ok','and a source can be taken off');
select is(public.overnight_remove(tests.id(100),tests.did(3001),tests.bullet(3001,3),true,tests.rev(3001))->>'status','ok','A bullet can be removed');
select is(tests.texts(3001),'Leaders grow here and lead here|a few deep partnerships with the city|Alpha suppers welcome 120 people and 30 stay.','and then it is not in the draft');
select is(public.overnight_remove(tests.id(100),tests.did(3001),tests.bullet(3001,3),false,tests.rev(3001))->>'status','ok','and can be put back');
select is(public.overnight_edit(tests.id(100),tests.did(3001),tests.rev(3001),jsonb_build_object('bullets',jsonb_build_array(jsonb_build_object('text',repeat('x',281)))))->>'status','invalid_request','A bullet over 280 characters is refused');
select is(public.overnight_edit(tests.id(100),tests.did(3001),tests.rev(3001),jsonb_build_object('bullets','nope'))->>'status','invalid_request','and so is a list that is not a list');
select is(public.overnight_edit(tests.id(100),tests.did(3001),tests.rev(3001),jsonb_build_object('bullets',jsonb_build_array(jsonb_build_object('id',tests.id(999),'text','x'))))->>'status','not_found','A bullet that is not in this draft is not found');

-- Accept, and an edit takes the acceptance back.
select is(public.overnight_accept(tests.id(100),tests.did(3001),tests.rev(3001))->>'status','ok','The lead accepts the first outcome');
select is(tests.draft(3001)->'reviewed'->>'by','Chris','Reviewed by Chris');
select is(public.overnight_restore_words(tests.id(100),tests.did(3001),tests.bullet(3001,2),tests.rev(3001))->>'status','no_room_words','(nothing to restore on the card bullet)');
select is(public.overnight_remove(tests.id(100),tests.did(3001),tests.bullet(3001,3),true,tests.rev(3001))->>'status','ok','A change after acceptance');
select is(tests.draft(3001)->'reviewed','null'::jsonb,'takes the acceptance back');
select is(public.overnight_accept(tests.id(100),tests.did(3001),tests.rev(3001))->>'status','ok','so it is accepted again');

-- A thin outcome: acknowledge the flag, then accept.
select tests.login(2);
select is(public.overnight_accept(tests.id(100),tests.did(3002),tests.rev(3002))->>'status','thin','A thin outcome cannot be accepted until its flag is acknowledged');
select is(public.overnight_ack_thin(tests.id(100),tests.did(3001),true)->>'status','not_thin','Only a thin outcome has a flag');
select is(public.overnight_ack_thin(tests.id(100),tests.did(3002),true)->>'status','ok','The co-facilitator acknowledges it');
select is(tests.draft(3002)->'thin_ack'->>'by','Jaisy','and the review says who');
select is(public.overnight_add_room_bullet(tests.id(100),tests.did(3002),tests.id(3103),tests.rev(3002))->>'status','ok','The room''s bullet can be added in its exact words');
select is(tests.draft(3002)->'bullets'->0->>'origin','room','as the room''s words');
select is(tests.draft(3002)->'bullets'->0->>'flag',null,'with its own source');
select is(public.overnight_add_room_bullet(tests.id(100),tests.did(3002),tests.id(3103),tests.rev(3002))->>'status','unchanged','Adding it twice does nothing');
select is(public.overnight_add_room_bullet(tests.id(100),tests.did(3002),tests.id(3101),tests.rev(3002))->>'status','not_found','A bullet of another outcome is not found');
select is(public.overnight_accept(tests.id(100),tests.did(3002),tests.rev(3002))->>'status','ok','Accepted');

-- Photos the draft could not read.
select is(public.overnight_photo_text(tests.id(100),tests.id(4102),'Families belong, not demographics')->>'status','ok','A facilitator types what the unreadable photo says');
select is(public.overnight_photo_text(tests.id(100),tests.id(4102),'')->>'status','invalid_request','Empty text is refused');
select is(public.overnight_photo_text(tests.id(100),tests.id(4001),'x')->>'status','not_found','A card is not a photo');
select is(array_length(array(select jsonb_array_elements_text(tests.ov()->'round'->'unreadable')),1),1,'Typing what it says takes the photo off the round''s list');
select tests.login(3);
select is(public.overnight_photo_text(tests.id(100),tests.id(4102),'The scribe cannot')->>'status','denied','The scribe cannot type into the review');

-- The third outcome: removed from the review when the Vision Outcome is removed.
reset role;
update private.vision_outcomes set deleted=true where id=tests.id(3003);
select is((select deleted from private.draft_outcomes where outcome_id=tests.id(3003)),true,'A Vision Outcome removed leaves the review');
set local role authenticated;
select tests.login(1);
select is((select count(*)::integer from jsonb_array_elements(tests.ov()->'outcomes')),2,'which now has two');

-- Version history keeps every version, and a version can be gone back to.
select ok(jsonb_array_length(public.overnight_versions(tests.id(100),tests.did(3001))->'versions')>=10,'Every version of the first outcome is kept');
select is((public.overnight_versions(tests.id(100),tests.did(3001))->'versions'->0->>'current'),'true','and the newest is the current one');
select is((select v->>'ai' from jsonb_array_elements(public.overnight_versions(tests.id(100),tests.did(3001))->'versions') v where (v->>'kind')='ai'),'true','The AI''s tidy is marked as the AI''s');
select is(public.overnight_restore_version(tests.id(100),tests.did(3001),2,tests.rev(3001))->>'status','ok','The lead goes back to the AI''s version');
select is(tests.texts(3001),'Leaders grow here and lead here|We keep a few deep partnerships with the city, not many shallow ones.|Alpha suppers welcome 120 people and 30 stay.','which reads as the AI tidied it');
select is(tests.draft(3001)->'reviewed','null'::jsonb,'and is not reviewed any more');
select is(public.overnight_restore_version(tests.id(100),tests.did(3001),999,tests.rev(3001))->>'status','not_found','A version that does not exist is not found');
reset role;
set local role authenticated;
select tests.login(1);
select throws_ok($$update private.draft_versions set what='x'$$,'42501',null,'No one can edit a version');
reset role;
select throws_ok($$update private.draft_versions set what='x'$$,'P0001','Draft versions are kept','Not even the database owner changes one');
select throws_ok($$delete from private.draft_versions$$,'P0001','Draft versions are kept','or deletes one');
set local role authenticated;
select tests.login(1);

-- Publish: the lead, when everything is reviewed and no one is editing.
select is(public.overnight_accept(tests.id(100),tests.did(3001),tests.rev(3001))->>'status','ok','The first outcome is accepted again');
select is(tests.ov()->'check'->>'ready','true','The check passes: reviewed, no one editing, the thin flag acknowledged');
select tests.login(2);
select is(public.overnight_publish(tests.id(100),tests.id(990))->>'status','denied','The co-facilitator cannot publish');
select is(public.overnight_published(tests.id(100))->>'status','none','Nothing is published');
select tests.login(1);
select is(public.overnight_presence(tests.id(100),tests.did(3002)::text,true)->>'status','ok','Someone is editing the second outcome');
select is(public.overnight_publish(tests.id(100),tests.id(990))->>'status','not_ready','Publishing waits for them');
select is(public.overnight_presence(tests.id(100),'publish',false)->>'status','ok','Once they stop');
select is(public.overnight_publish(tests.id(100),null)->>'status','invalid_request','A publish with no id is refused');
select is(public.overnight_publish(tests.id(100),tests.id(990))->>'status','ok','The lead publishes');
select is(public.overnight_publish(tests.id(100),tests.id(990))->>'status','duplicate','A replay is a duplicate');
select is(public.overnight_publish(tests.id(100),tests.id(991))->>'status','published','and another publish says it is published');
select is(tests.ov()->'round'->>'published_by','Chris','The review says who published');
select is(public.overnight_edit(tests.id(100),tests.did(3001),tests.rev(3001),jsonb_build_object('bullets','[]'::jsonb))->>'status','published','A published draft cannot be edited');
select is(public.overnight_accept(tests.id(100),tests.did(3001),tests.rev(3001))->>'status','published','or accepted again');
select is(public.overnight_published(tests.id(100))->>'status','ok','The published snapshot is there for the read-back');
select is(jsonb_array_length(public.overnight_published(tests.id(100))->'snapshot'->'outcomes'),2,'with the two outcomes');
select is(public.overnight_published(tests.id(100))->'snapshot'->'outcomes'->0->>'name','Leaders raised from within','in order');
select is(jsonb_array_length(public.overnight_published(tests.id(100))->'snapshot'->'outcomes'->0->'voices'),1,'with the voices apart');
select is(jsonb_array_length(public.overnight_published(tests.id(100))->'snapshot'->'outcomes'->0->'tensions'),2,'and the tensions apart');
select is(position('Tasha' in public.overnight_published(tests.id(100))::text)+position('Sam Lee' in public.overnight_published(tests.id(100))::text),0,'No speaker or owner is in what is published');
select is(public.overnight_unpublish(tests.id(100))->>'status','ok','The lead can unpublish');
select is(public.overnight_published(tests.id(100))->>'status','none','which withdraws it');
select tests.login(2);
select is(public.overnight_unpublish(tests.id(100))->>'status','denied','Only the lead does');

-- Nothing from a draft reaches the TV or a phone: not the snapshot, not a broadcast.
select tests.login(4);
select is(position('partnerships' in public.live_snapshot(tests.id(100))::text),0,'A phone''s room state carries no draft words');
select tests.login(5);
select is(position('partnerships' in public.live_snapshot(tests.id(100))::text),0,'neither does the TV''s');
reset role;
select is((select count(*)::integer from realtime.messages where payload::text like '%partnerships%' or payload::text like '%Leaders grow here%' or payload::text like '%notice%'),0,'No broadcast carries a draft''s words');
select ok((select count(*) from realtime.messages where event='fac' and payload->>'kind'='overnight')>=5,'The facilitators'' private channel gets content-free hints');
select is((select count(*)::integer from realtime.messages where payload->>'kind'='overnight' and (payload ? 'text' or payload ? 'name')),0,'which carry no words');
select is((select count(*)::integer from realtime.messages where payload->>'kind'='overnight' and event<>'fac'),0,'and go to the facilitators only');

-- A draft that fails: three tries, then the facilitators write it by hand.
update private.overnight_rounds set deleted=true where engagement_id=tests.id(100);
insert into sessions(id,engagement_id,title,part,position,state,interaction,closed_at) values(tests.id(321),tests.id(101),'Closed day one step','Day 1',2,'closed','wall',now());
set local role authenticated;
select tests.login(7);
select is(public.overnight_start(tests.id(101))->>'status','ok','A facilitator can start the draft by hand');
reset role;
select is((select status from private.overnight_rounds where engagement_id=tests.id(101)),'pending','It is pending');
set local role service_role;
select is(public.overnight_claim(tests.id(101),tests.id(960),'m','{"overnight_draft":"overnight-draft@1"}')->>'status','claimed','claimed');
select is(public.overnight_fail((select id from private.ai_runs where engagement_id=tests.id(101) and job='overnight_draft'),tests.id(961),'timeout','{}')->>'status','stale','A failure under the wrong lease is ignored');
select is(public.overnight_fail((select id from private.ai_runs where engagement_id=tests.id(101) and job='overnight_draft'),tests.id(960),'timeout','{"ms":1000}')->>'status','ok','A timeout is recorded');
select is(public.overnight_due(tests.id(101)),false,'and the retry waits a while');
select is(public.overnight_claim(tests.id(101),tests.id(962),'m','{"overnight_draft":"overnight-draft@1"}')->>'status','cooling','');
reset role;
select is((select status||'|'||attempts from private.overnight_rounds where engagement_id=tests.id(101)),'pending|1','One try used');
update private.overnight_rounds set last_failed_at=now()-interval '5 minutes' where engagement_id=tests.id(101);
set local role service_role;
select is(public.overnight_claim(tests.id(101),tests.id(963),'m','{"overnight_draft":"overnight-draft@1"}')->>'status','claimed','Claimed again after the pause');
select is(public.overnight_fail((select id from private.ai_runs where engagement_id=tests.id(101) and status='running'),tests.id(963),'unavailable','{}')->>'status','ok','fails');
reset role;
update private.overnight_rounds set last_failed_at=now()-interval '5 minutes' where engagement_id=tests.id(101);
set local role service_role;
select is(public.overnight_claim(tests.id(101),tests.id(964),'m','{"overnight_draft":"overnight-draft@1"}')->>'status','claimed','and a third time');
select is(public.overnight_fail((select id from private.ai_runs where engagement_id=tests.id(101) and status='running'),tests.id(964),'unavailable','{}')->>'gave_up','true','It gives up after three tries');
reset role;
select is((select status from private.overnight_rounds where engagement_id=tests.id(101)),'failed','The round is failed');
select is((select tidy from private.draft_outcomes where engagement_id=tests.id(101)),'by_hand','and the outcomes are the facilitators'' to write');
select is((select count(*)::integer from private.ai_runs where engagement_id=tests.id(101) and status='failed'),3,'Every try is in the run log');
set local role service_role;
select is(public.overnight_claim(tests.id(101),tests.id(965),'m','{"overnight_draft":"overnight-draft@1"}')->>'status','idle','Nothing more is claimed');
reset role;
set local role authenticated;
select tests.login(7);
select is(public.overnight_state(tests.id(101))->'round'->>'status','failed','The review says it failed');
select is(public.overnight_state(tests.id(101))->'round'->>'error','unavailable','and why, in a word');
select is((select (o->>'tidy') from jsonb_array_elements(public.overnight_state(tests.id(101))->'outcomes') o),'by_hand','The outcome is for the facilitators to write');
select is(public.overnight_add_room_bullet(tests.id(101),(select (o->>'id')::uuid from jsonb_array_elements(public.overnight_state(tests.id(101))->'outcomes') o),tests.id(3111),0)->>'status','ok','They write it from the room''s bullets');
select is(public.overnight_by_hand(tests.id(101))->>'status','unchanged','Writing by hand again changes nothing');
select tests.login(1);
select is(public.overnight_by_hand(tests.id(101))->>'status','denied','A facilitator of another engagement cannot');
select tests.login(7);
select is(public.overnight_start(tests.id(101))->>'status','ok','And the draft can be tried again');
reset role;
select is((select status||'|'||attempts from private.overnight_rounds where engagement_id=tests.id(101)),'pending|0','which starts a fresh round of tries');
set local role authenticated;
select tests.login(7);
select is(public.overnight_by_hand(tests.id(101))->>'status','ok','A slow draft can be written by hand without waiting');
reset role;
select is((select status from private.overnight_rounds where engagement_id=tests.id(101)),'failed','which lets the draft go');

select * from finish();
rollback;
