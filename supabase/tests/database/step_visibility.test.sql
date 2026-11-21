begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('8f500000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(1000+n))::text,true); end $$;
create function tests.live() returns uuid language sql security definer set search_path='' as $$ select live_session_id from public.room_states where engagement_id=tests.id(100) $$;
create function tests.results() returns jsonb language sql security definer set search_path='' as $$ select results from public.room_states where engagement_id=tests.id(100) $$;
create function tests.ctl(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$
 select public.room_control(tests.id(100),tests.id(n),action,jsonb_build_object('from',tests.live())||p) $$;
create function tests.go(n integer,session integer) returns text language sql as $$ select tests.ctl(n,'go_live',jsonb_build_object('session',tests.id(session)))->>'status' $$;
create function tests.say(n integer,session integer,answer text) returns text language sql as $$
 select public.live_submit(tests.id(100),tests.id(n),tests.id(session),0,'submit',answer,now(),null,0)->>'status' $$;
create function tests.answer(n integer,session integer,value jsonb) returns text language sql as $$
 select public.live_submit(tests.id(100),tests.id(n),tests.id(session),0,'submit','',now(),null,0,value)->>'status' $$;
create function tests.save(n integer,kind text,options jsonb,engagement integer default 100,title text default null) returns jsonb language sql as $$
 select public.show_write(tests.id(engagement),'save',jsonb_build_object('id',tests.id(n),'revision',null,'title',coalesce(title,'Step '||n),'part','Day 1','mode','live','interaction',kind,
  'prompt','Prompt '||n,'phone_depth','','notes','','lands_in','','segment','','state','ready','planned_minutes',5,'max_sends',3,'max_characters',200,'max_words',50,
  'settings',jsonb_build_object('anonymous',true,'burst_minutes',4,'join_strip',false),'options',options)) $$;
create function tests.rev(n integer) returns integer language sql security definer set search_path='' as $$ select revision from public.sessions where id=tests.id(n) $$;
create function tests.template() returns uuid language sql security definer set search_path='' as $$ select id from private.templates where name='Private steps' $$;
create function tests.options(n integer) returns jsonb language sql security definer set search_path='' as $$ select options from public.sessions where id=tests.id(n) $$;
-- What the room could see: every RPC an attendee, a TV or a signed-out visitor can call, with every argument filled two ways (empty,
-- then ordinary values: this engagement, the live step, its first answer), and the rows each can select. Each call runs and is then
-- rolled back, so one call never changes what the next sees. Returns everything those calls returned, as one text.
create function tests.sweep(p_question uuid) returns text language plpgsql as $$
declare f record; a text; args text[]; sql text; res text; seen text:=''; pass integer; i integer; names text[]; types text[];
begin
 for f in select p.oid,p.proname,coalesce(p.proargnames,array[]::text[]) n,
   array(select format_type(t,null) from unnest(p.proargtypes::oid[]) t) ty
  from pg_proc p join pg_namespace s on s.oid=p.pronamespace
  where s.nspname='public' and p.prokind='f' and p.prorettype<>'trigger'::regtype and (has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('anon',p.oid,'execute')) order by p.proname loop
  names:=f.n; types:=f.ty;
  for pass in 1..2 loop
   args:=array[]::text[];
   for i in 1..coalesce(array_length(types,1),0) loop
    a:=case when pass=1 and not (types[i]='uuid' and (names[i] like '%engagement%' or names[i] like '%session%')) then 'null'
     when types[i]='uuid' then case when names[i] like '%engagement%' then quote_literal(tests.id(100)) when names[i] like '%session%' or names[i]='p_from' then quote_literal(tests.live())
       when names[i] in ('p_question','p_card','p_item','p_id','p_answer') then quote_literal(coalesce(p_question,tests.id(999))) else quote_literal(tests.id(999)) end
     when types[i]='text' then quote_literal('x') when types[i] in ('integer','bigint','smallint','double precision','numeric') then '0'
     when types[i]='boolean' then 'false' when types[i]='jsonb' then '''{}''' when types[i] like 'timestamp%' then 'now()' when types[i]='date' then 'current_date'
     when types[i] like '%[]' then '''{}''' else 'null' end;
    args:=args||(a||'::'||types[i]);
   end loop;
   sql:=format('select (public.%I(%s))::text',f.proname,array_to_string(args,','));
   begin
    execute sql into res;
    raise exception using errcode='P0099',message=coalesce(res,'');
   exception when sqlstate 'P0099' then seen:=seen||' '||f.proname||'='||sqlerrm;
    when others then seen:=seen||' '||f.proname||'!'||sqlstate;
   end;
  end loop;
 end loop;
 begin
  execute 'select coalesce(string_agg(x::text,'' ''),'''') from public.room_states x' into res; seen:=seen||' room_states='||res;
 exception when others then seen:=seen||' room_states!'||sqlstate; end;
 begin
  execute 'select coalesce(string_agg(x::text,'' ''),'''') from public.submissions x' into res; seen:=seen||' submissions='||res;
 exception when others then seen:=seen||' submissions!'||sqlstate; end;
 begin
  execute 'select coalesce(string_agg(x::text,'' ''),'''') from public.sessions x' into res; seen:=seen||' sessions='||res;
 exception when others then seen:=seen||' sessions!'||sqlstate; end;
 return seen;
end $$;
-- What a phone or the TV could receive on each realtime topic: the messages realtime would hand this caller, topic by topic.
create function tests.topics() returns text[] language sql security definer set search_path='' as $$ select coalesce(array_agg(distinct topic),array[]::text[]) from realtime.messages $$;
create function tests.received() returns text language plpgsql as $$
declare t text; res text; seen text:='';
begin
 foreach t in array tests.topics() loop
  perform set_config('realtime.topic',t,true);
  begin
   execute 'select coalesce(string_agg(payload::text,'' ''),'''') from realtime.messages where topic=current_setting(''realtime.topic'',true)' into res;
   seen:=seen||' '||t||'='||res;
  exception when others then seen:=seen||' '||t||'!'||sqlstate; end;
 end loop;
 perform set_config('realtime.topic','',true);
 return seen;
end $$;
create function tests.all_messages() returns text language sql security definer set search_path='' as $$ select coalesce(string_agg(payload::text,' '),'') from realtime.messages where topic like 'live:%' $$;
grant execute on all functions in schema tests to authenticated,anon,service_role;

insert into churches(id,name,timezone) values(tests.id(200),'Church A','America/Toronto');
insert into engagements(id,church_id,title) values(tests.id(100),tests.id(200),'Private room'),(tests.id(102),tests.id(200),'From the template');
insert into auth.users(id,email,email_confirmed_at)
select tests.id(n),case when n=1 then 'fac1@clearway.co' else 'person'||n||'@example.org' end,now() from generate_series(1,6)n;
insert into auth.sessions(id,user_id) select tests.id(1000+n),tests.id(n) from generate_series(1,6)n;
insert into auth.identities(user_id,provider,provider_id,identity_data) select id,'google',id::text,jsonb_build_object('email',email,'email_verified',true) from auth.users where id=tests.id(1);
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method) values(gen_random_uuid(),tests.id(1001),now(),now(),'oauth');
insert into clearway_users(id,auth_user_id,name,email,is_admin,team_hub_team_member_id) values(tests.id(701),tests.id(1),'Chris Vacher','fac1@clearway.co',false,tests.id(801));
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values(tests.id(100),tests.id(701),'lead'),(tests.id(102),tests.id(701),'lead');
insert into attendees(id,engagement_id,auth_user_id,name,email,verified_at,room_role) values
 (tests.id(503),tests.id(100),tests.id(3),'Priya Shah','person3@example.org',now(),'participant'),
 (tests.id(505),tests.id(100),tests.id(5),'Sam Lee','person5@example.org',now(),'participant');
insert into device_sessions(engagement_id,attendee_id,auth_session_id) values(tests.id(100),tests.id(503),tests.id(1003)),(tests.id(100),tests.id(505),tests.id(1005));
insert into private.tv_devices(id,proof,engagement_id,label,paired_at) values(tests.id(450),repeat('c',64),tests.id(100),'Front TV',now());
insert into private.live_tv_sessions(id,engagement_id,auth_user_id,auth_session_id,device_id) values(tests.id(400),tests.id(100),tests.id(4),tests.id(1004),tests.id(450));

-- ---------- The setting ----------
select is(private.session_options('scale','{"max":10,"visibility":"private"}',tests.id(100))->>'visibility','private','A scale can be Facilitators only');
select is(private.session_options('wall','{"visibility":"public"}',tests.id(100)),'{"visibility":"public"}'::jsonb,'Everyone is stored as given');
select is(private.session_options('wall','{}',tests.id(100)),'{}'::jsonb,'No setting is Everyone, the default');
select is(private.session_options('wall','{"visibility":"secret"}',tests.id(100)),null,'Any other value is refused');
select is(private.session_options('wall','{"visibility":true}',tests.id(100)),null,'A value that is not text is refused');
select is(private.session_options('wall','{"visibility":"private","timer":{"kind":"up"},"untitled":true}',tests.id(100)),'{"timer":{"kind":"up","tv":true,"phones":false,"start":"live"},"untitled":true,"visibility":"private"}'::jsonb,'It sits beside the other step options');
select ok(not (private.session_options('content','{"screen":"headline","visibility":"private"}',tests.id(100)) ? 'visibility'),'A content screen has no setting');
select is(private.session_options('form','{"questions":[{"key":"q1","text":"Why?"}]}',tests.id(100))->>'visibility','private','The form is always private');
select is(private.session_options('form','{"questions":[{"key":"q1","text":"Why?"}],"visibility":"public"}',tests.id(100))->>'visibility','private','and cannot be made public');
select is(private.session_options('lens','{"lens":1,"visibility":"private"}',tests.id(100)),null,'A Wayfinding board (the lens wall) cannot be private');
select ok((select bool_and(private_ok) from private.interaction_kinds where kind in ('word_cloud','wall','qa','choice','scale','ranking','points','statements','grid','sign','form')),'The general kinds can be private');

set local role authenticated; select tests.login(1);
select is(tests.save(310,'wall','{"visibility":"private"}',100,'Testimonials')->>'status','ok','A private wall');
select is(tests.save(311,'scale','{"max":10,"low":"Not likely","high":"Very likely","visibility":"private"}',100,'NPS')->>'status','ok','A private 1 to 10 scale');
select is(tests.save(312,'word_cloud','{"visibility":"private"}')->>'status','ok','A private word cloud');
select is(tests.save(313,'choice','{"items":[{"key":"a","text":"Yes"},{"key":"b","text":"No"}],"visibility":"private"}')->>'status','ok','A private choice');
select is(tests.save(314,'qa','{"visibility":"private"}')->>'status','ok','A private Q&A');
select is(tests.save(315,'wall','{}',100,'Open wall')->>'status','ok','A public wall');
select is(tests.save(316,'wall','{"visibility":"nope"}')->>'status','invalid_request','A save with a bad value is refused');
select is(tests.save(317,'lens','{"lens":1,"visibility":"private"}')->>'status','invalid_request','A private lens wall is refused');

-- Seeding: a public step cannot be seeded from a private one
select is(public.show_seed_from(tests.id(100),tests.id(315),tests.id(310),null)->>'status','private_source','A public wall cannot be seeded from the private wall');
select is(tests.save(318,'wall','{"visibility":"private"}')->>'status','ok','Another private wall');
select is(public.show_seed_from(tests.id(100),tests.id(318),tests.id(310),null)->>'status','ok','A private step can be seeded from a private one');
select is(public.show_write(tests.id(100),'save',jsonb_build_object('id',tests.id(315),'revision',tests.rev(315),'title','Open wall','part','Day 1','mode','live','interaction','wall',
  'prompt','Prompt','phone_depth','','notes','','lands_in','','segment','','state','ready','planned_minutes',5,'max_sends',3,'max_characters',200,'max_words',50,
  'settings',jsonb_build_object('anonymous',true,'burst_minutes',4,'join_strip',false),'options','{}'::jsonb,'seeded_from',tests.id(310)))->>'status','invalid_request','A save that seeds a public step from a private one fails whole');

-- Duplicating, templates and starting from a template carry it
select is(public.show_write(tests.id(100),'save',jsonb_build_object('id',tests.id(319),'revision',null,'title','Testimonials (copy)','part','Day 1','mode','live','interaction','wall',
  'prompt','Prompt','phone_depth','','notes','','lands_in','','segment','','state','draft','planned_minutes',5,'max_sends',3,'max_characters',200,'max_words',50,
  'settings',jsonb_build_object('anonymous',true,'burst_minutes',4,'join_strip',false),'options',tests.options(310)))->>'status','ok','A duplicate saves');
select is(tests.options(319)->>'visibility','private','A duplicated step stays private');
select is(public.template_write('save',jsonb_build_object('engagement',tests.id(100),'name','Private steps','shared',false))->>'status','ok','Saved as a template');
reset role;
select ok((select bool_or(e->>'title'='NPS' and e->'options'->>'visibility'='private') from private.templates t,jsonb_array_elements(t.sessions) e where t.name='Private steps'),'The template keeps the setting');
set local role authenticated; select tests.login(1);
select is(public.template_write('apply',jsonb_build_object('template',tests.template(),'engagement',tests.id(102)))->>'status','ok','Start a run of show from it');
reset role;
select is((select options->>'visibility' from public.sessions where engagement_id=tests.id(102) and title='NPS' and not deleted),'private','A step seeded from the template is private');
select is((select options->>'visibility' from public.sessions where engagement_id=tests.id(102) and title='Open wall' and not deleted),null,'and a public one stays public');

-- ---------- The room, step by step ----------
set local role authenticated; select tests.login(1);
select is(tests.go(900,315),'ok','The public wall goes live');
select tests.login(3); select is(tests.say(901,315,'OPENWALL-visible'),'accepted','An open answer');
select tests.login(5);
select ok(public.live_snapshot(tests.id(100),null,null)::text like '%OPENWALL-visible%','On a public step the room sees the answers (the sweep can see a value when one is there)');
select ok(tests.sweep(null) like '%OPENWALL-visible%','and so does the sweep');

select tests.login(1); select is(tests.go(902,310),'ok','The private wall goes live');
select tests.login(3);
select is(tests.say(903,310,'SECRETWALL-testimonial'),'accepted','A phone still submits on a private step');
select ok(public.phone_room(tests.id(100))::text like '%SECRETWALL-testimonial%','and sees its own answer');
select tests.login(5); select is(tests.say(904,310,'MINE-second'),'accepted','A second phone submits');
select is(tests.results(),'{"total":2,"people":2,"words":[]}'::jsonb,'The room state stores counts only');
select is(public.live_snapshot(tests.id(100),null,null)->'session'->'options'->>'visibility','private','Phones and the TV learn the step is private');
select is(public.live_snapshot(tests.id(100),null,null)->'answers','[]'::jsonb,'and receive no answers');
create temporary table seen(who text,what text);
grant all on seen to authenticated,anon;
insert into seen select 'attendee wall',tests.sweep(null);
select tests.login(4); insert into seen select 'tv wall',tests.sweep(null);
set local role anon; select set_config('request.jwt.claims','{"role":"anon"}',true); insert into seen select 'anon wall',tests.sweep(null);
set local role authenticated; select tests.login(1);
select ok(public.control_status(tests.id(100))::text like '%SECRETWALL-testimonial%','The facilitators still read every answer on the control surface');
select ok(public.session_export(tests.id(100),tests.id(310))::text like '%SECRETWALL-testimonial%','and in the CSV export');
select ok(public.session_preview(tests.id(100),tests.id(310))::text not like '%SECRETWALL%','The facilitator''s TV preview draws the private screen, with no answers');

select is(tests.go(905,311),'ok','The private NPS scale goes live');
select tests.login(3); select is(tests.answer(906,311,'{"value":9}'),'accepted','A 9');
select tests.login(5); select is(tests.answer(907,311,'{"value":3}'),'accepted','A 3');
select is(tests.results(),'{"total":2,"people":2,"words":[]}'::jsonb,'A private scale stores counts only: no columns, no average');
select is(public.live_snapshot(tests.id(100),null,null)->'state'->'results','{"total":2,"people":2,"words":[]}'::jsonb,'and the snapshot carries counts only');
insert into seen select 'attendee scale',tests.sweep(null);
select tests.login(1);
select ok((public.control_status(tests.id(100))->'items')::text like '%"count": 1%','The facilitators still see how many chose each value');

select is(tests.go(908,312),'ok','The private word cloud goes live');
select tests.login(3); select is(tests.say(909,312,'SECRETCLOUD'),'accepted','A word');
select is(tests.results()->'words','[]'::jsonb,'No words in the room state');
select tests.login(5); insert into seen select 'attendee cloud',tests.sweep(null);

select tests.login(1); select is(tests.go(910,313),'ok','The private choice goes live');
select tests.login(3); select is(tests.answer(911,313,'{"choices":["a"]}'),'accepted','A choice');
select is(tests.results(),'{"total":1,"people":1,"words":[]}'::jsonb,'A private choice stores counts only');
select tests.login(5); insert into seen select 'attendee choice',tests.sweep(null);

select tests.login(1); select is(tests.go(912,314),'ok','The private Q&A goes live');
select tests.login(3); select is(tests.say(913,314,'SECRETQUESTION'),'accepted','A question');
select is(tests.results(),'{"total":1,"people":1,"words":[]}'::jsonb,'A private Q&A stores counts only: no question list');
select tests.login(1);
select is(public.qa_control(tests.id(100),tests.id(914),'spotlight',jsonb_build_object('question',tests.id(913)))->>'status','ok','The facilitator spotlights the private question');
select is(public.live_snapshot(tests.id(100),null,null)->'qa'->'spotlight','null'::jsonb,'A private question never comes up in the spotlight');
select tests.login(5);
select is(public.qa_vote(tests.id(100),tests.id(915),tests.id(913),0,true,now(),null,0)->>'status','closed','Phones cannot upvote a private question');
insert into seen select 'attendee qa',tests.sweep(tests.id(913));
select tests.login(4); insert into seen select 'tv qa',tests.sweep(tests.id(913));
set local role anon; select set_config('request.jwt.claims','{"role":"anon"}',true); insert into seen select 'anon qa',tests.sweep(tests.id(913));

-- Realtime: what each topic would hand an attendee and the TV, and every room broadcast as sent
set local role authenticated;
select tests.login(5); insert into seen select 'attendee realtime',tests.received();
select tests.login(4); insert into seen select 'tv realtime',tests.received();
reset role;
select ok(tests.all_messages() like '%OPENWALL-visible%','The public step''s answers were broadcast (the check can see a value when one is there)');
select is(tests.all_messages() ~ 'SECRET',false,'No room broadcast carries a private step''s answer');
select is((select string_agg(who,', ') from seen where what ~ 'SECRET'),null,'No RPC, table or realtime topic gives an attendee, the TV or a signed-out visitor a private answer');
select is((select count(*)::integer from seen where what like '%live_snapshot={%"role": "participant"%'),5,'The sweep read the live snapshot as an attendee on every private step');
select is((select count(*)::integer from seen where what like '%live_snapshot={%"role": "tv"%'),2,'and as the TV');
select ok((select bool_and(what !~ '"status"' and what like '%live_snapshot!42501%') from seen where who like 'anon%'),'A signed-out visitor can call none of them');

-- The visibility-only action leaves the rest of a running step untouched.
set local role authenticated; select tests.login(1);
select is(tests.go(916,310),'ok','Back to the private wall');
select is(public.show_write(tests.id(100),'save',jsonb_build_object('id',tests.id(310),'revision',tests.rev(310),'title','Testimonials','part','Day 1','mode','live','interaction','wall',
  'prompt','Prompt','phone_depth','','notes','','lands_in','','segment','','state','ready','planned_minutes',5,'max_sends',3,'max_characters',200,'max_words',50,
  'settings',jsonb_build_object('anonymous',true,'burst_minutes',4,'join_strip',false),'options','{"visibility":"public"}'::jsonb))->>'status','invalid_state','A live step cannot be switched from the run of show');
select is(public.show_write(tests.id(100),'visibility',jsonb_build_object('session',tests.id(310),'visibility','public','title','Changed'))->>'status','invalid_request','A visibility action refuses any other field');
select is(public.show_write(tests.id(100),'visibility',jsonb_build_object('session',tests.id(310),'visibility','public'))->>'status','ok','A facilitator can make the live step public');
set local role authenticated; select tests.login(5);
select ok(public.live_snapshot(tests.id(100),null,null)::text like '%SECRETWALL-testimonial%','Made public underneath, its answers show at once');
select is(public.show_write(tests.id(100),'visibility',jsonb_build_object('session',tests.id(310),'visibility','private'))->>'status','denied','An attendee cannot change visibility');
select tests.login(1);
select is(public.show_write(tests.id(100),'visibility',jsonb_build_object('session',tests.id(310),'visibility','private'))->>'status','ok','A facilitator can make the live step private');
reset role;
select is(tests.results(),'{"total":2,"people":2,"words":[]}'::jsonb,'Made private again, the room state is counts only at once');
set local role authenticated; select tests.login(5);
select ok(public.live_snapshot(tests.id(100),null,null)::text not like '%SECRETWALL%','with no answers in the snapshot');
reset role;

select * from finish();
rollback;
