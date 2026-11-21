begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('8f810000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
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
insert into engagements(id,church_id,title) values(tests.id(100),tests.id(200),'Before and after test room');
insert into auth.users(id,email,email_confirmed_at)
select tests.id(n),case when n=1 then 'fac1@clearway.co' else 'person'||n||'@example.org' end,now() from generate_series(1,9)n;
insert into auth.sessions(id,user_id) select tests.id(1000+n),tests.id(n) from generate_series(1,9)n;
insert into auth.identities(user_id,provider,provider_id,identity_data) select id,'google',id::text,jsonb_build_object('email',email,'email_verified',true) from auth.users where id=tests.id(1);
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method) values(gen_random_uuid(),tests.id(1001),now(),now(),'oauth');
insert into clearway_users(id,auth_user_id,name,email,is_admin,team_hub_team_member_id) values(tests.id(701),tests.id(1),'Fixture facilitator','fac1@clearway.co',false,tests.id(801));
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values(tests.id(100),tests.id(701),'lead');
insert into attendees(id,engagement_id,auth_user_id,name,email,verified_at,room_role)
select tests.id(500+n),tests.id(100),tests.id(n),'Person '||n,'person'||n||'@example.org',now(),'participant' from generate_series(3,9) n where n<>4;
insert into device_sessions(engagement_id,attendee_id,auth_session_id) select tests.id(100),tests.id(500+n),tests.id(1000+n) from generate_series(3,9) n where n<>4;
insert into private.tv_devices(id,proof,engagement_id,label,paired_at) values(tests.id(450),repeat('b',64),tests.id(100),'Front TV',now());
insert into private.live_tv_sessions(id,engagement_id,auth_user_id,auth_session_id,device_id) values(tests.id(400),tests.id(100),tests.id(4),tests.id(1004),tests.id(450));


-- Options validation and the registered privacy boundary.
select ok((select input and one_per_person and structured and not shares_answers and private_ok from private.interaction_kinds where kind='before_after'),'Raw pairs never share to the room');
select is(private.options_before_after('{}',tests.id(100))->>'mode','paired','Paired mode is default');
select is(private.options_before_after('{"max":6}',tests.id(100)),null::jsonb,'Reject paired range 6');
select is(private.options_before_after('{"mode":"steps"}',tests.id(100)),null::jsonb,'Source mode needs two steps');
set local role authenticated;
select tests.login(1);
select is(tests.save(310,'scale','{"max":10}')->>'status','ok','Save before scale');
select is(tests.save(311,'scale','{"max":10}')->>'status','ok','Save after scale');
select is(tests.save(312,'before_after','{"max":10,"mode":"paired"}')->>'status','ok','Save paired comparison');
select is(tests.save(313,'before_after',jsonb_build_object('mode','steps','before_session',tests.id(310),'after_session',tests.id(311)))->>'status','ok','Save aggregate reading earlier scales');
select is(tests.ctl(601,'go_live',jsonb_build_object('session',tests.id(312)))->>'status','ok','Go live with paired comparison');
select tests.login(3);
select is(tests.answer(610,312,'{"before":3}')->>'status','accepted','A partial pair is accepted');
select is(tests.results()#>>'{before_after,before,count}','1','Before counts one');
select is(tests.results()#>>'{before_after,after,count}','0','After remains empty');
select is(tests.answer(611,312,'{"before":3,"after":8}')->>'status','accepted','Latest complete pair replaces partial');
select tests.login(5);
select is(tests.answer(612,312,'{"before":5,"after":10}')->>'status','accepted','Second anonymous pair accepted');
select is((tests.results()#>>'{before_after,before,average}')::numeric,4::numeric,'Before average is independent aggregate');
select is((tests.results()#>>'{before_after,after,average}')::numeric,9::numeric,'After average is independent aggregate');
select is((tests.results()#>>'{before_after,change}')::numeric,5::numeric,'Change is aggregate average difference');
select ok(not (tests.results()->'before_after') ?| array['pairs','attendees','people','ids'],'No pair or participant identity in aggregate');
select ok(not exists(select 1 from jsonb_each(tests.results()->'before_after'->'before') e where e.key not in ('count','average','columns')),'Before exposes counts only');
select tests.login(1);
select is(tests.ctl(620,'go_live',jsonb_build_object('session',tests.id(310)))->>'status','ok','Go live with before source');
select tests.login(3);
select is(tests.answer(621,310,'{"value":2}')->>'status','accepted','Source before answer');
select tests.login(1);
select is(tests.ctl(622,'go_live',jsonb_build_object('session',tests.id(311)))->>'status','ok','Go live with after source');
select tests.login(3);
select is(tests.answer(623,311,'{"value":8}')->>'status','accepted','Source after answer');
select tests.login(1);
select is(tests.ctl(624,'go_live',jsonb_build_object('session',tests.id(313)))->>'status','ok','Go live with source comparison');
select is((tests.results()#>>'{before_after,change}')::numeric,6::numeric,'Source aggregate reads both scales');
select tests.login(5);
select is(tests.answer(625,311,'{"value":10}')->>'status','accepted','Late answer to source remains accepted');
select is((tests.results()#>>'{before_after,after,average}')::numeric,9::numeric,'Late source answer recounts live comparison');
select is((tests.results()#>>'{before_after,change}')::numeric,7::numeric,'Late source answer changes aggregate difference');
reset role;
select throws_ok(format('update public.sessions set position=-1 where id=%L',tests.id(313)),'23514','Choose scale steps earlier in the run of show.','Refuse moving comparison ahead of sources');
update public.sessions set options=options||'{"visibility":"private"}'::jsonb where id=tests.id(311);
select is((select array_agg(key order by key) from jsonb_object_keys(tests.results()) key),array['people','total','words'],'Private source strips every aggregate value');
select ok(private.session_is_private(tests.id(313)),'Source privacy is inherited');
select is((private.items_before_after(tests.id(313),array[]::text[])->0->'before_after'->'after'->>'average')::numeric,9::numeric,'Facilitators retain aggregate results');
select is((select array_agg(key order by key) from jsonb_object_keys(private.items_before_after(tests.id(313),array[]::text[])->0->'before_after') key),array['after','before','change','max'],'Facilitator result is aggregate only');
select * from finish();
rollback;
