-- Milestone 3, step 6b: the drag-to-build run of show (SET-07) and templates (SET-08).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('6b000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(1000+n))::text,true); end $$;
-- A session as the builder sends it.
create function tests.input(n integer,title text,minutes integer default 10,extra jsonb default '{}') returns jsonb language sql as $$ select jsonb_build_object(
 'id',tests.id(n),'revision',null,'title',title,'part','Day 1','planned_start',null,'planned_minutes',minutes,'mode','live','opens_at',null,'closes_at',null,
 'interaction','word_cloud','prompt','One word','phone_depth','','settings','{"anonymous":true,"burst_minutes":4,"join_strip":false}'::jsonb,
 'notes','NOTE-'||title,'lands_in','','state','draft','max_sends',3,'max_characters',28,'max_words',3,'options','{}'::jsonb)||extra $$;
create function tests.at(n integer) returns timestamptz language sql as $$ select planned_start from public.sessions where id=tests.id(n) $$;
create function tests.rev(n integer) returns integer language sql as $$ select revision from public.sessions where id=tests.id(n) $$;
create function tests.order_of(eng integer,p text) returns text language sql as $$ select string_agg(title,',' order by position,id) from public.sessions where engagement_id=tests.id(eng) and part=p and not deleted $$;
create function tests.window_of(n integer) returns timestamptz[] language sql as $$ select array[opens_at,closes_at] from public.sessions where id=tests.id(n) $$;
grant execute on all functions in schema tests to authenticated,anon,service_role;

insert into churches(id,name,timezone) values(tests.id(200),'Riverside Church','America/Toronto'),(tests.id(201),'Hope Church','America/Toronto');
insert into engagements(id,church_id,title,type) values(tests.id(100),tests.id(200),'Team workshop','team_workshop'),(tests.id(101),tests.id(200),'Board session','team_workshop'),(tests.id(102),tests.id(201),'Other church','team_workshop');
insert into auth.users(id,email,email_confirmed_at) select tests.id(n),case when n<5 then 'fac'||n||'@clearway.co' else 'person'||n||'@example.org' end,now() from generate_series(1,5)n;
insert into auth.sessions(id,user_id) select tests.id(1000+n),tests.id(n) from generate_series(1,5)n;
insert into auth.identities(user_id,provider,provider_id,identity_data) select id,'google',id::text,jsonb_build_object('email',email,'email_verified',true) from auth.users where id in(tests.id(1),tests.id(2),tests.id(3),tests.id(4));
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method) select gen_random_uuid(),tests.id(1000+n),now(),now(),'oauth' from generate_series(1,4)n;
-- 1 leads 100 and 101; 2 leads 102; 3 is an admin; 4 facilitates nothing; 5 is a participant.
insert into clearway_users(id,auth_user_id,name,email,is_admin,team_hub_team_member_id) select tests.id(700+n),tests.id(n),'Facilitator '||n,'fac'||n||'@clearway.co',n=3,tests.id(800+n) from generate_series(1,4)n;
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values(tests.id(100),tests.id(701),'lead'),(tests.id(101),tests.id(701),'lead'),(tests.id(102),tests.id(702),'lead');
insert into attendees(id,engagement_id,auth_user_id,name,email,verified_at,room_role) values(tests.id(505),tests.id(100),tests.id(5),'Participant','person5@example.org',now(),'participant');
insert into device_sessions(engagement_id,attendee_id,auth_session_id) values(tests.id(100),tests.id(505),tests.id(1005));

-- ---------- Privacy ----------
select ok(not has_function_privilege('anon','public.template_read()','execute'),'Anonymous cannot read templates');
select ok(not has_function_privilege('anon','public.template_write(text,jsonb)','execute'),'Anonymous cannot write templates');
select ok(not has_table_privilege('authenticated','private.templates','select'),'No direct template reads');
select ok(not has_table_privilege('authenticated','private.templates','insert'),'No direct template writes');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='private.templates'::regclass),'Templates have forced row-level security');
select ok(not (select prosecdef from pg_proc where oid='public.template_write(text,jsonb)'::regprocedure),'Public template wrapper is invoker');
select ok(not has_function_privilege('authenticated','private.show_retime(uuid,text,timestamptz)','execute'),'Retiming is not exposed');
select ok(not has_function_privilege('authenticated','private.show_insert(uuid[],uuid,integer)','execute'),'Ordering helpers are not exposed');

-- ---------- The team workshop template ships with the app ----------
select is((select count(*)::integer from private.templates where kind='shipped' and name='Team workshop' and not deleted),1,'The team workshop template ships');
select is((select jsonb_array_length(sessions) from private.templates where id='c1ea0000-0000-4000-8000-000000000001'),11,'Eleven sessions');
select is((select sum((e->>'planned_minutes')::integer)::integer from private.templates t,jsonb_array_elements(t.sessions) e where t.id='c1ea0000-0000-4000-8000-000000000001'),90,'Ninety minutes');
select ok((select bool_and(private.kind(e->>'interaction') is not null) from private.templates t,jsonb_array_elements(t.sessions) e where t.id='c1ea0000-0000-4000-8000-000000000001'),'Every session uses a registered interaction');
select is((select array_agg(distinct e->>'interaction' order by e->>'interaction') from private.templates t,jsonb_array_elements(t.sessions) e where t.id='c1ea0000-0000-4000-8000-000000000001'),
 array['content','grid','points','qa','scale','sign','wall','word_cloud'],'Word cloud, open text, scale, 100 points, 2x2, Q&A, sign together and content screens');
select ok((select bool_and(private.session_options(e->>'interaction',e->'options',tests.id(100)) is not null) from private.templates t,jsonb_array_elements(t.sessions) e where t.id='c1ea0000-0000-4000-8000-000000000001'),'Every session passes its kind''s options check');
select is((select e->'options'->>'screen' from private.templates t,jsonb_array_elements(t.sessions) with ordinality x(e,n) where t.id='c1ea0000-0000-4000-8000-000000000001' order by n limit 1),'screen_check','A screen check at the top');
select ok((select bool_and(length(e->>'notes')>0) from private.templates t,jsonb_array_elements(t.sessions) e where t.id='c1ea0000-0000-4000-8000-000000000001'),'Every session has presenter notes');
select ok(not exists(select 1 from private.templates where sessions::text ~ '[–—]'),'No em or en dashes in the template');

set local role authenticated;
select tests.login(5);
select is(public.template_read()->>'status','denied','A participant cannot read templates');
select is(public.template_write('apply',jsonb_build_object('template','c1ea0000-0000-4000-8000-000000000001','engagement',tests.id(100)))->>'status','denied','A participant cannot start from a template');
select tests.login(1);
select is(public.template_read()->>'status','ok','A facilitator reads the library');
select ok(public.template_read()->'templates' @> '[{"name":"Team workshop","kind":"shipped","count":11,"minutes":90,"can_remove":false}]','The library lists the team workshop');
select is((select string_agg(e->>'title',',' order by e->>'title') from jsonb_array_elements(public.template_read()->'engagements') e),'Board session,Team workshop','Only engagements this facilitator runs');
select is(public.template_write('apply',jsonb_build_object('template','c1ea0000-0000-4000-8000-000000000001','engagement',tests.id(102)))->>'status','denied','Not into an engagement someone else runs');

-- ---------- SET-07: drop, place and times from the durations ----------
select is(public.show_write(tests.id(100),'save',tests.input(1,'A',10,'{"planned_start":"2026-11-19T19:00:00-05:00"}'))->>'status','ok','First session dropped');
select is(public.show_write(tests.id(100),'save',tests.input(2,'B',15))->>'status','ok','Second dropped at the end');
select is(public.show_write(tests.id(100),'save',tests.input(3,'C',5))->>'status','ok','Third dropped at the end');
select is(tests.order_of(100,'Day 1'),'A,B,C','In drop order');
select is(tests.at(2),'2026-11-20T00:10:00Z'::timestamptz,'B starts when A ends');
select is(tests.at(3),'2026-11-20T00:25:00Z'::timestamptz,'C starts when B ends');
select is(tests.rev(2),0,'A worked-out start is not an edit');
select is(public.show_write(tests.id(100),'save',tests.input(4,'D',20,'{"index":1}'))->>'status','ok','Dropped into the gap');
select is(tests.order_of(100,'Day 1'),'A,D,B,C','The drop lands where the gap opened');
select is((select array_agg(position order by position) from public.sessions where engagement_id=tests.id(100) and part='Day 1' and not deleted),array[0,1,2,3],'Positions follow the run');
select is(tests.at(4),'2026-11-20T00:10:00Z'::timestamptz,'The dropped session starts after A');
select is(tests.at(2),'2026-11-20T00:30:00Z'::timestamptz,'Times recalculate after a drop');
select is(public.show_write(tests.id(100),'save',tests.input(5,'E',5,'{"index":-1}'))->>'status','invalid_request','A negative index is refused');
select is(public.show_write(tests.id(100),'place',jsonb_build_object('id',tests.id(3),'revision',tests.rev(3),'part','Day 1','index',0))->>'status','ok','C moved to the top');
select is(tests.order_of(100,'Day 1'),'C,A,D,B','Moved');
select is(tests.at(3),'2026-11-20T00:00:00Z'::timestamptz,'The part keeps its start when its first session moves');
select is(tests.at(1),'2026-11-20T00:05:00Z'::timestamptz,'and the rest follow the lengths');
select is(public.show_write(tests.id(100),'place',jsonb_build_object('id',tests.id(3),'revision',0,'part','Day 1','index',2))->>'status','conflict','A stale move is refused');
select is(public.show_write(tests.id(100),'place',jsonb_build_object('id',tests.id(4),'revision',tests.rev(4),'part','Day 2','index',0))->>'status','ok','D moved to Day 2');
select is(tests.order_of(100,'Day 1'),'C,A,B','Day 1 closes the gap');
select is(tests.at(2),'2026-11-20T00:15:00Z'::timestamptz,'Day 1 recalculates without D');
select is(tests.order_of(100,'Day 2'),'D','Day 2 has D');
select is(public.show_write(tests.id(100),'place',jsonb_build_object('id',tests.id(4),'revision',tests.rev(4),'part','Other','index',0))->>'status','invalid_request','Only the four parts');
-- Editing the part's start moves the whole part.
select is(public.show_write(tests.id(100),'save',(select to_jsonb(s)||jsonb_build_object('notes','NOTE-C','planned_start','2026-11-20T01:00:00Z') from public.sessions s where id=tests.id(3)))->>'status','ok','Part start edited');
select is(tests.at(1),'2026-11-20T01:05:00Z'::timestamptz,'The part follows its new start');
-- A length change moves everything after it.
select is(public.show_write(tests.id(100),'save',(select to_jsonb(s)||jsonb_build_object('notes','NOTE-A','planned_minutes',30) from public.sessions s where id=tests.id(1)))->>'status','ok','A lengthened');
select is(tests.at(2),'2026-11-20T01:35:00Z'::timestamptz,'B moves with the new length');
-- Self-paced sessions keep their own times and take no room time.
select is(public.show_write(tests.id(100),'save',tests.input(6,'Self',60,'{"mode":"self_paced","opens_at":"2026-11-18T12:00:00Z","closes_at":"2026-11-19T12:00:00Z","index":1}'))->>'status','ok','A self-paced session in the run');
select is(tests.at(1),'2026-11-20T01:05:00Z'::timestamptz,'Self-paced takes no room time');
select is(tests.at(6),null,'Self-paced has no planned start of its own');
select is(tests.window_of(6),array['2026-11-18T12:00:00Z'::timestamptz,'2026-11-19T12:00:00Z'::timestamptz],'Retiming never moves a self-paced window');
select is(public.show_write(tests.id(100),'place',jsonb_build_object('id',tests.id(6),'revision',tests.rev(6),'part','Day 1','index',0))->>'status','ok','A self-paced session moved to the top');
select is(tests.at(3),'2026-11-20T01:00:00Z'::timestamptz,'The part still starts at its first live session');
select is(tests.window_of(6),array['2026-11-18T12:00:00Z'::timestamptz,'2026-11-19T12:00:00Z'::timestamptz],'Moving it never moves its window');
select is(public.show_write(tests.id(100),'remove',jsonb_build_object('id',tests.id(1),'revision',tests.rev(1)))->>'status','ok','A removed');
select is(tests.at(2),'2026-11-20T01:05:00Z'::timestamptz,'Removing recalculates the times');
select is(tests.window_of(6),array['2026-11-18T12:00:00Z'::timestamptz,'2026-11-19T12:00:00Z'::timestamptz],'Removing a session never moves a self-paced window');
select is(public.show_write(tests.id(100),'save',(select to_jsonb(s)||jsonb_build_object('notes','NOTE-C','planned_start',null) from public.sessions s where id=tests.id(3)))->>'status','ok','Part start cleared');
select is(tests.at(2),null,'The part goes back to untimed');
select is((select count(*)::integer from public.sessions where engagement_id=tests.id(100) and part='Day 2' and planned_start is not null),1,'Other parts keep their times');

-- ---------- SET-08: Save as template ----------
reset role;
update public.sessions set state='live' where id=tests.id(2);
insert into public.submissions(id,engagement_id,session_id,attendee_id,text,answers,phone_sent_at) values(tests.id(30),tests.id(100),tests.id(2),tests.id(505),'ANSWER-SECRET','[]'::jsonb,now());
set local role authenticated; select tests.login(1);
select is(public.template_write('save',jsonb_build_object('engagement',tests.id(100),'name',' ','shared',true))->>'status','invalid_request','A template needs a name');
select is(public.template_write('save',jsonb_build_object('engagement',tests.id(102),'name','Theirs'))->>'status','denied','Not from an engagement someone else runs');
select is(public.template_write('save',jsonb_build_object('engagement',tests.id(101),'name','Empty'))->>'status','empty','An empty run of show has nothing to save');
select is(public.template_write('save',jsonb_build_object('engagement',tests.id(100),'name','  Board   night ','shared',false))->>'status','ok','Saved as a template');
reset role;
select is((select name from private.templates where kind='saved'),'Board night','Name tidied');
select is((select jsonb_array_length(sessions) from private.templates where kind='saved'),4,'Every session copied');
select ok((select sessions::text like '%NOTE-C%' and sessions::text like '%NOTE-D%' from private.templates where kind='saved'),'Presenter notes copied');
select ok((select bool_and(e->>'state' in ('draft','ready')) from private.templates t,jsonb_array_elements(t.sessions) e where kind='saved'),'A live session is saved as ready, never live');
select ok((select not (sessions::text ~ 'ANSWER-SECRET|attendee|6b000000-0000-4000-8000-000000000100') from private.templates where kind='saved'),'No answers, attendees or engagement ids in the template');
-- The template's start is its first live session (D, the only timed one now); the
-- self-paced window, which opens before it, keeps its place as negative minutes.
select is((select (e->>'offset')::integer from private.templates t,jsonb_array_elements(t.sessions) e where kind='saved' and e->>'title'='D'),0,'Times kept as minutes from the first live start');
select is((select e->>'mode' from private.templates t,jsonb_array_elements(t.sessions) e where kind='saved' and e->>'title'='Self'),'self_paced','The mode is kept');
select is((select array[(e->>'opens')::integer,(e->>'closes')::integer] from private.templates t,jsonb_array_elements(t.sessions) e where kind='saved' and e->>'title'='Self'),
 array[(extract(epoch from '2026-11-18T12:00:00Z'::timestamptz-tests.at(4))/60)::integer,(extract(epoch from '2026-11-19T12:00:00Z'::timestamptz-tests.at(4))/60)::integer],'Self-paced windows kept relative to that start');
select is((select e->>'offset' from private.templates t,jsonb_array_elements(t.sessions) e where kind='saved' and e->>'title'='C'),null,'An untimed session stays untimed');
set local role authenticated;
select tests.login(2);
select ok(not (public.template_read()->'templates')::text like '%Board night%','An unshared template stays with its owner');
select tests.login(3);
select ok((public.template_read()->'templates')::text like '%Board night%','An admin sees every template');
select tests.login(1);
select is(public.template_write('save',jsonb_build_object('engagement',tests.id(100),'name','Shared night','shared',true))->>'status','ok','A shared template');
select tests.login(2);
select ok((public.template_read()->'templates')::text like '%Shared night%','A shared template reaches the Clearway team');
select is(public.template_write('remove',jsonb_build_object('template',(select (e->>'id') from jsonb_array_elements(public.template_read()->'templates') e where e->>'name'='Shared night')))->>'status','denied','Only its owner or an admin removes it');
select is(public.template_write('remove',jsonb_build_object('template','c1ea0000-0000-4000-8000-000000000001'))->>'status','denied','The shipped template stays');

-- ---------- SET-08: Start an engagement from a template ----------
select tests.login(1);
reset role;
create temporary table before_version as select version from public.room_states where engagement_id=tests.id(101);
grant select on before_version to authenticated;
set local role authenticated; select tests.login(1);
select is(public.template_write('apply',jsonb_build_object('template','c1ea0000-0000-4000-8000-000000000001','engagement',tests.id(101),'start','2026-11-19T19:00:00-05:00'))->>'count','11','Started from the team workshop');
reset role;
select is(tests.order_of(101,'Day 1'),'Screen check,Welcome,Opening prayer,Check-in,One word for this season,What''s working,Where to focus,Effort and impact,Your questions,Our commitment,Sending prayer','Every session, in order');
select is((select planned_start from public.sessions where engagement_id=tests.id(101) and title='Screen check'),'2026-11-20T00:00:00Z'::timestamptz,'Starts when chosen');
select is((select planned_start from public.sessions where engagement_id=tests.id(101) and title='Sending prayer'),'2026-11-20T01:25:00Z'::timestamptz,'Timings copied');
select is((select options->>'cut' from public.sessions where engagement_id=tests.id(101) and title='Where to focus'),'3','Interaction settings copied');
select is((select jsonb_array_length(options->'items') from public.sessions where engagement_id=tests.id(101) and title='Effort and impact'),5,'Grid items copied');
select is((select (settings->>'anonymous')::boolean from public.sessions where engagement_id=tests.id(101) and interaction='sign'),false,'Sign together stays named');
select is((select prompt from public.sessions where engagement_id=tests.id(101) and title='Check-in'),'How full is your tank this week?','Prompts copied');
select is((select n.notes from public.sessions s join private.session_notes n on n.session_id=s.id where s.engagement_id=tests.id(101) and s.title='Our commitment'),
 'Shape the commitment with the team before you open signing. Read it aloud once, then invite everyone to sign.','Presenter notes copied');
select is((select count(*)::integer from public.sessions where engagement_id=tests.id(101) and state='ready'),11,'Ready to run');
select ok((select version from public.room_states where engagement_id=tests.id(101))>(select version from before_version),'One room version for the new sessions');
-- Everything copied is editable like any session.
set local role authenticated; select tests.login(1);
select is(public.show_write(tests.id(101),'save',(select to_jsonb(s)||jsonb_build_object('notes','Edited','prompt','Edited prompt') from public.sessions s where engagement_id=tests.id(101) and title='Check-in'))->>'status','ok','A copied session is editable');
select is(public.template_write('apply',jsonb_build_object('template','c1ea0000-0000-4000-8000-000000000001','engagement',tests.id(101),'start','2026-12-01T10:00:00Z'))->>'count','11','Started again into a run that has sessions');
reset role;
select is((select count(*)::integer from public.sessions where engagement_id=tests.id(101) and part='Day 1' and not deleted),22,'Added after the sessions already there');
select is((select max(planned_start) from public.sessions where engagement_id=tests.id(101)),'2026-11-20T02:55:00Z'::timestamptz,'The part keeps its own start');
select is((select prompt from private.templates t,jsonb_array_elements(t.sessions) e(x) cross join lateral (select x->>'prompt' as prompt) p where t.id='c1ea0000-0000-4000-8000-000000000001' and x->>'title'='Check-in'),'How full is your tank this week?','Editing a copy never changes the template');
-- A saved template brings self-paced windows and images along.
insert into public.sessions(id,engagement_id,title,part,interaction,options,state) values(tests.id(20),tests.id(102),'Survey page','Day 1','content','{"screen":"image"}','ready');
insert into private.session_media(id,engagement_id,session_id,mime,width,height,data) values(tests.id(21),tests.id(102),tests.id(20),'image/png',1,1,'\x89504e47'::bytea);
update public.sessions set options='{"screen":"image","media":"6b000000-0000-4000-8000-000000000021"}' where id=tests.id(20);
set local role authenticated; select tests.login(2);
select is(public.template_write('save',jsonb_build_object('engagement',tests.id(102),'name','With an image'))->>'status','ok','A run of show with an image saved');
select tests.login(1);
select is(public.template_write('apply',jsonb_build_object('template',(select e->>'id' from jsonb_array_elements(public.template_read()->'templates') e where e->>'name'='With an image'),'engagement',tests.id(100)))->>'status','ok','Started from it');
reset role;
select isnt((select options->>'media' from public.sessions where engagement_id=tests.id(100) and title='Survey page'),'6b000000-0000-4000-8000-000000000021','The image is the new session''s own copy');
select is((select m.engagement_id from public.sessions s join private.session_media m on m.id=(s.options->>'media')::uuid where s.engagement_id=tests.id(100) and s.title='Survey page'),tests.id(100),'and belongs to the engagement');
set local role authenticated; select tests.login(1);
select is(public.template_write('apply',jsonb_build_object('template',(select e->>'id' from jsonb_array_elements(public.template_read()->'templates') e where e->>'name'='Board night'),'engagement',tests.id(101),'start','2026-11-21T09:00:00Z'))->>'status','ok','A template with a self-paced session');
reset role;
select is((select planned_start from public.sessions where engagement_id=tests.id(101) and title='D'),'2026-11-21T09:00:00Z'::timestamptz,'The first live session starts when chosen');
select is((select mode from public.sessions where engagement_id=tests.id(101) and title='Self'),'self_paced','Still self-paced');
select is((select array[opens_at,closes_at] from public.sessions where engagement_id=tests.id(101) and title='Self'),
 array['2026-11-21T09:00:00Z'::timestamptz+make_interval(mins=>(select (e->>'opens')::integer from private.templates t,jsonb_array_elements(t.sessions) e where t.name='Board night' and e->>'title'='Self')),
  '2026-11-21T09:00:00Z'::timestamptz+make_interval(mins=>(select (e->>'closes')::integer from private.templates t,jsonb_array_elements(t.sessions) e where t.name='Board night' and e->>'title'='Self'))],'Its window shifts with the start, the same way live times do');
select ok((select opens_at<'2026-11-21T09:00:00Z' from public.sessions where engagement_id=tests.id(101) and title='Self'),'A window that opened before the first session still does');
update public.engagements set status='closed' where id=tests.id(101);
set local role authenticated; select tests.login(1);
select is(public.template_write('apply',jsonb_build_object('template','c1ea0000-0000-4000-8000-000000000001','engagement',tests.id(101)))->>'status','closed','Not into a closed engagement');
select is(public.template_write('remove',jsonb_build_object('template',(select e->>'id' from jsonb_array_elements(public.template_read()->'templates') e where e->>'name'='Board night')))->>'status','ok','The owner removes a template');
select ok(not (public.template_read()->'templates')::text like '%Board night%','Removed from the library');
reset role;
select ok((select deleted from private.templates where name='Board night'),'Kept as a soft delete');
select * from finish();
rollback;
