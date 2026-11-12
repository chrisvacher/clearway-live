-- Milestone 3, step 6b: the drag-to-build run of show (SET-07) and templates (SET-08).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('6c000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
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
create function tests.sections(eng integer) returns text language sql as $$ select string_agg(title||'='||section,',' order by position,id) from public.sessions where engagement_id=tests.id(eng) and part='Day 1' and not deleted $$;
create function tests.read_section(eng integer,n integer) returns text language sql as $$ select e->>'section' from jsonb_array_elements(public.show_read(tests.id(eng),null,null)->'sessions') e where e->>'id'=tests.id(n)::text $$;
grant execute on all functions in schema tests to authenticated,anon,service_role;
insert into room_states(engagement_id) select tests.id(n) from generate_series(100,102)n on conflict do nothing;

select ok(not has_function_privilege('authenticated','private.show_write_pre_section(uuid,text,jsonb)','execute'),'The wrapped save is not called from a browser');
select ok(not has_function_privilege('authenticated','private.template_write_pre_section(text,jsonb)','execute'),'The wrapped template write is not called from a browser');
select ok(not has_function_privilege('anon','private.show_write(uuid,text,jsonb)','execute'),'Anonymous cannot write the run of show');
set local role authenticated;
select tests.login(1);
-- ---------- A session's section ----------
select is(public.show_write(tests.id(100),'save',tests.input(1,'A',10,'{"section":"  Arrival  "}'))->>'status','ok','A new session is saved with its section');
select is(public.show_write(tests.id(100),'save',tests.input(2,'B',5,'{"section":"Arrival"}'))->>'status','ok','A second in the same section');
select is(public.show_write(tests.id(100),'save',tests.input(3,'C',5))->>'status','ok','A session saved with no section');
select is(tests.sections(100),'A=Arrival,B=Arrival,C=','Sections are kept, trimmed');
select is(tests.read_section(100,1),'Arrival','The run of show reads each session''s section');
select is(tests.read_section(100,3),'','A session with none reads as empty');
select is((public.show_write(tests.id(100),'save',tests.input(4,'D',5,'{"section":"Feedback"}'))->>'revision')::integer,tests.rev(4),'The save returns the revision the section left it on');
select is(public.show_write(tests.id(100),'save',tests.input(1,'A',10)||jsonb_build_object('revision',tests.rev(1)))->>'status','ok','Saving without a section');
select is(tests.sections(100),'A=Arrival,B=Arrival,C=,D=Feedback','leaves the section as it was');
select is(public.show_write(tests.id(100),'save',tests.input(1,'A',10,'{"section":7}')||jsonb_build_object('revision',tests.rev(1)))->>'status','invalid_request','A section must be text');
select is(public.show_write(tests.id(100),'save',tests.input(1,'A',10)||jsonb_build_object('revision',tests.rev(1),'section',repeat('x',101)))->>'status','invalid_request','A section name is at most 100 characters');
select is(public.show_write(tests.id(100),'place',jsonb_build_object('id',tests.id(3),'revision',tests.rev(3),'part','Day 1','index',0,'section','Arrival'))->>'status','ok','A moved session takes the section it lands in');
select is(tests.sections(100),'C=Arrival,A=Arrival,B=Arrival,D=Feedback','and its new place');
-- ---------- Naming a set of sessions ----------
select is(public.show_write(tests.id(100),'section',jsonb_build_object('ids',jsonb_build_array(tests.id(1),tests.id(2),tests.id(3)),'section','Welcome'))->>'status','ok','A section is renamed');
select is(tests.sections(100),'C=Welcome,A=Welcome,B=Welcome,D=Feedback','for every session in it');
select is(public.show_write(tests.id(100),'section',jsonb_build_object('ids',jsonb_build_array(tests.id(4)),'section',''))->>'status','ok','A section''s name is taken away');
select is(tests.sections(100),'C=Welcome,A=Welcome,B=Welcome,D=','and its sessions stay');
select is(public.show_write(tests.id(100),'section',jsonb_build_object('ids',jsonb_build_array(tests.id(4),tests.id(4)),'section','X'))->>'status','conflict','The same session twice is refused');
select is(public.show_write(tests.id(100),'section',jsonb_build_object('ids',jsonb_build_array(tests.id(4),tests.id(99)),'section','X'))->>'status','conflict','A session that is not in the run is refused');
select is(public.show_write(tests.id(100),'section',jsonb_build_object('ids','[]'::jsonb,'section','X'))->>'status','invalid_request','Naming nothing is refused');
select is(public.show_write(tests.id(100),'section',jsonb_build_object('ids',jsonb_build_array(tests.id(4))))->>'status','invalid_request','A name is needed, even an empty one');
select is(public.show_write(tests.id(100),'section',jsonb_build_object('ids',jsonb_build_array('nope'),'section','X'))->>'status','invalid_request','An id must be an id');
select is(public.show_write(tests.id(102),'section',jsonb_build_object('ids',jsonb_build_array(tests.id(4)),'section','X'))->>'status','denied','Not in an engagement someone else runs');
select tests.login(5);
select is(public.show_write(tests.id(100),'section',jsonb_build_object('ids',jsonb_build_array(tests.id(4)),'section','X'))->>'status','denied','A participant cannot name a section');
select tests.login(1);
select is(public.show_write(tests.id(100),'section',jsonb_build_object('ids',jsonb_build_array(tests.id(4)),'section','Feedback'))->>'status','ok','The section is named again');
-- ---------- A saved block ----------
select is(public.template_write('save',jsonb_build_object('engagement',tests.id(100),'name','Opening','sessions',jsonb_build_array(tests.id(3),tests.id(1),tests.id(2))))->>'count','3','A block is saved from three of the four sessions');
select ok(public.template_read()->'templates' @> '[{"name":"Opening","block":true,"count":3,"minutes":20}]','The library lists it as a block');
select ok(public.template_read()->'templates' @> '[{"name":"Team workshop","block":false}]','A whole template is not a block');
select is(public.template_write('save',jsonb_build_object('engagement',tests.id(100),'name','Bad','sessions',jsonb_build_array(tests.id(1),tests.id(99))))->>'status','invalid_request','A block cannot name a session outside the run');
select is(public.template_write('save',jsonb_build_object('engagement',tests.id(100),'name','Bad','sessions','[]'::jsonb))->>'status','invalid_request','A block needs a session');
select is(public.template_write('save',jsonb_build_object('engagement',tests.id(102),'name','Bad','sessions',jsonb_build_array(tests.id(1))))->>'status','denied','Not from an engagement someone else runs');
select is((select count(*)::integer from jsonb_array_elements(public.template_read()->'templates') e where e->>'name'='Bad'),0,'A refused block is not kept');
select is(public.template_write('apply',jsonb_build_object('engagement',tests.id(101),'template',(select e->>'id' from jsonb_array_elements(public.template_read()->'templates') e where e->>'name'='Opening')))->>'count','3','The block is added to another run');
select is(tests.sections(101),'C=Welcome,A=Welcome,B=Welcome','with its sessions in order and their section');
select is(public.template_write('apply',jsonb_build_object('engagement',tests.id(101),'template',(select e->>'id' from jsonb_array_elements(public.template_read()->'templates') e where e->>'name'='Opening')))->>'count','3','Added a second time');
select is(tests.sections(101),'C=Welcome,A=Welcome,B=Welcome,C=Welcome,A=Welcome,B=Welcome','it lands after what is there, and nothing already there is renamed');
-- ---------- A whole template keeps its sections ----------
select is(public.template_write('save',jsonb_build_object('engagement',tests.id(100),'name','Whole run'))->>'count','4','A whole run saves as a template');
select ok(public.template_read()->'templates' @> '[{"name":"Whole run","block":false,"count":4}]','and is not a block');
select is(public.show_write(tests.id(101),'section',jsonb_build_object('ids',(select jsonb_agg(id) from public.sessions where engagement_id=tests.id(101)),'section','Earlier'))->>'status','ok','The other run is renamed first');
select is(public.template_write('apply',jsonb_build_object('engagement',tests.id(101),'template',(select e->>'id' from jsonb_array_elements(public.template_read()->'templates') e where e->>'name'='Whole run')))->>'count','4','The template is applied');
select is((select string_agg(title||'='||section,',' order by position,id) from public.sessions where engagement_id=tests.id(101) and section<>'Earlier'),'C=Welcome,A=Welcome,B=Welcome,D=Feedback','Its sessions arrive with their sections');
select is(public.template_write('apply',jsonb_build_object('engagement',tests.id(101),'template','c1ea0000-0000-4000-8000-000000000001'))->>'status','ok','A shipped template with no sections still applies');
select is(public.template_write('remove',jsonb_build_object('template',(select e->>'id' from jsonb_array_elements(public.template_read()->'templates') e where e->>'name'='Opening')))->>'status','ok','A block is removed like any saved template');
select * from finish();
rollback;
