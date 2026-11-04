-- Suggested ranking options match singular and plural forms (fix, November 3).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('87430000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
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
insert into engagements(id,church_id,title) values(tests.id(100),tests.id(200),'Suggestions room');
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

-- Singular forms, word by word.
select is(private.singular_word('ministries'),'ministry','ies becomes y');
select is(private.singular_word('ministry'),'ministry','a singular stays as it is');
select is(private.singular_word('groups'),'group','a plain s is dropped');
select is(private.singular_word('churches'),'church','es after ch is dropped');
select is(private.singular_word('classes'),private.singular_word('class'),'es after ss meets its singular');
select is(private.singular_word('boxes'),'box','es after x is dropped');
select is(private.singular_word('movies'),private.singular_word('movie'),'ies meets a singular ending in ie');
select is(private.singular_word('campus'),'campus','us is not a plural');
select is(private.singular_word('analysis'),'analysis','nor is is');
select is(private.singular_word('bus'),'bus','short words stay as they are');
select is(private.bar_words('Prayer ministries'),private.bar_words('Prayer ministry'),'A phrase whose last word is pluralised matches its singular');
select is(private.bar_words('Small groups for the families'),private.bar_words('small group for family'),'Every word is matched in its singular form');
select is(private.bar_words('Prayer and discernment!'),array['discernment','prayer'],'Lower case, no punctuation and little words dropped, as before');

set local role authenticated;
select tests.login(1);
select is(tests.save(313,'ranking','{"items":[{"key":"a","text":"Youth ministry"},{"key":"b","text":"Worship"},{"key":"c","text":"Outreach"}],"suggest":true}')->>'status','ok','A ranking with Add an option');
select is(tests.ctl(901,'go_live',jsonb_build_object('session',tests.id(313)))->>'status','ok','It goes live');
select tests.login(3);
select is(public.ranking_suggest(tests.id(100),tests.id(950),tests.id(313),'Prayer ministry')->>'status','accepted','Prayer ministry');
select tests.login(5);
select is(public.ranking_suggest(tests.id(100),tests.id(951),tests.id(313),'Prayer ministries')->>'status','accepted','Prayer ministries');
select tests.login(6);
select is(public.ranking_suggest(tests.id(100),tests.id(952),tests.id(313),'prayer ministries.')->>'status','accepted','prayer ministries.');
select is(public.ranking_suggest(tests.id(100),tests.id(953),tests.id(313),'Small groups')->>'status','accepted','Small groups');
select tests.login(7);
select is(public.ranking_suggest(tests.id(100),tests.id(954),tests.id(313),'Small group')->>'status','accepted','Small group');
select is(public.ranking_suggest(tests.id(100),tests.id(955),tests.id(313),'Youth ministries')->>'status','accepted','Youth ministries, an option that already exists');
select tests.login(8);
select is(public.ranking_suggest(tests.id(100),tests.id(956),tests.id(313),'Local churches')->>'status','accepted','Local churches');
select is(public.ranking_suggest(tests.id(100),tests.id(957),tests.id(313),'Local church')->>'status','accepted','Local church');
select tests.login(9);
select is(public.ranking_suggest(tests.id(100),tests.id(958),tests.id(313),'Prayer walks')->>'status','accepted','Prayer walks, something else');
select tests.login(1);
select is(jsonb_array_length(public.ranking_suggestions_for(tests.id(100))->'groups'),5,'Singular and plural forms count as one suggestion');
select is(public.ranking_suggestions_for(tests.id(100))->'groups'->0->>'text','Prayer ministry','The group keeps the first-seen wording');
select is((public.ranking_suggestions_for(tests.id(100))->'groups'->0->>'count')::integer,3,'with all three suggestions in it');
select is(public.ranking_suggestions_for(tests.id(100))->'groups'->0->'texts','["Prayer ministry", "Prayer ministries", "prayer ministries."]'::jsonb,'Every wording is listed for the facilitator');
select is(public.ranking_suggestions_for(tests.id(100))->'groups'->1->>'text','Small groups','A plural seen first stays the wording');
select is((public.ranking_suggestions_for(tests.id(100))->'groups'->1->>'count')::integer,2,'and takes its singular');
select is(public.ranking_suggestions_for(tests.id(100))->'groups'->2->'existing'->>'key','a','A plural of an existing option says so');
select is((public.ranking_suggestions_for(tests.id(100))->'groups'->3->>'count')::integer,2,'Local churches and Local church are one');
select is((public.ranking_suggestions_for(tests.id(100))->'groups'->4->>'count')::integer,1,'Prayer walks stays its own');
select is(public.ranking_control(tests.id(100),tests.id(960),'add_option',jsonb_build_object('ids',jsonb_build_array(tests.id(950),tests.id(951),tests.id(952)),'text','Prayer ministry'))->>'status','ok','The facilitator adds it once, merging all three');
select is(jsonb_array_length(public.ranking_suggestions_for(tests.id(100))->'groups'),4,'and the group leaves the list');
reset role;
select is((select count(*)::integer from private.ranking_suggestions where status='added'),3,'All three are marked added');

select ok(not has_function_privilege('authenticated','private.singular_word(text)','execute'),'Browsers cannot call the matching helper');
select * from finish();
rollback;
