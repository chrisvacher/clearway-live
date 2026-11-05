begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('87000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(1000+n))::text,true); end $$;
create function tests.live() returns uuid language sql security definer set search_path='' as $$ select live_session_id from public.room_states where engagement_id=tests.id(100) $$;
create function tests.ctl(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$
 select public.room_control(tests.id(100),tests.id(n),action,jsonb_build_object('from',tests.live())||p) $$;
create function tests.save(n integer,kind text,options jsonb default '{}',part text default 'Day 1',extra jsonb default '{}') returns jsonb language sql as $$
 select public.show_write(tests.id(100),'save',jsonb_build_object('id',tests.id(n),'revision',null,'title','Step '||n,'part',part,'mode','live','interaction',kind,
  'prompt','Prompt '||n,'phone_depth','','notes','','lands_in','','segment','','state','ready','planned_minutes',5,'max_sends',3,'max_characters',28,'max_words',3,
  'settings',jsonb_build_object('anonymous',true,'burst_minutes',4,'join_strip',false),'options',options)||extra) $$;
create function tests.rows(t text) returns bigint language plpgsql as $$ declare n bigint; begin execute format('select count(*) from %s',t) into n; return n; end $$;
grant execute on all functions in schema tests to authenticated,anon,service_role;

insert into churches(id,name,timezone) values(tests.id(200),'Riverside Church','America/Toronto'),(tests.id(201),'Elsewhere Church','America/Toronto');
insert into engagements(id,church_id,title) values(tests.id(100),tests.id(200),'Wayfinding records room'),(tests.id(101),tests.id(201),'Another room');
insert into auth.users(id,email,email_confirmed_at)
select tests.id(n),case n when 1 then 'fac1@clearway.co' when 2 then 'admin2@clearway.co' when 7 then 'fac7@clearway.co' else 'person'||n||'@example.org' end,now() from generate_series(1,8)n;
insert into auth.sessions(id,user_id) select tests.id(1000+n),tests.id(n) from generate_series(1,8)n;
insert into auth.identities(user_id,provider,provider_id,identity_data) select id,'google',id::text,jsonb_build_object('email',email,'email_verified',true) from auth.users where id in(tests.id(1),tests.id(2),tests.id(7));
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method) values(gen_random_uuid(),tests.id(1001),now(),now(),'oauth'),(gen_random_uuid(),tests.id(1002),now(),now(),'oauth'),(gen_random_uuid(),tests.id(1007),now(),now(),'oauth');
insert into clearway_users(id,auth_user_id,name,email,is_admin,team_hub_team_member_id) values
 (tests.id(701),tests.id(1),'Chris Vacher','fac1@clearway.co',false,tests.id(801)),
 (tests.id(702),tests.id(2),'Admin Person','admin2@clearway.co',true,tests.id(802)),
 (tests.id(707),tests.id(7),'Other Facilitator','fac7@clearway.co',false,tests.id(807));
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values(tests.id(100),tests.id(701),'lead'),(tests.id(101),tests.id(707),'lead');
insert into attendees(id,engagement_id,auth_user_id,name,email,verified_at,room_role) values
 (tests.id(503),tests.id(100),tests.id(3),'Priya Shah','person3@example.org',now(),'participant'),
 (tests.id(505),tests.id(100),tests.id(5),'Ben Ortiz','person5@example.org',now(),'participant'),
 (tests.id(506),tests.id(100),null,'Ruth Morrison','person6@example.org',null,'participant');
insert into device_sessions(engagement_id,attendee_id,auth_session_id) values(tests.id(100),tests.id(503),tests.id(1003)),(tests.id(100),tests.id(505),tests.id(1005));
insert into private.tv_devices(id,proof,engagement_id,label,paired_at) values(tests.id(450),repeat('a',64),tests.id(100),'Front TV',now());
insert into private.live_tv_sessions(id,engagement_id,auth_user_id,auth_session_id,device_id) values(tests.id(400),tests.id(100),tests.id(4),tests.id(1004),tests.id(450));

-- Records for the draft Map, written by trusted server code.
update churches set mission='Help every neighbour take a next step with Jesus.',purpose='',"values"='["Hospitality","Courage"]'::jsonb,strategy='',leadership_rhythms='["Monthly elders meeting"]'::jsonb where id=tests.id(200);
update engagements set base_year=2026 where id=tests.id(100);
insert into private.vision_outcomes(id,engagement_id,title,status,confirmed_at,position) values
 (tests.id(3001),tests.id(100),'Leaders raised from within','confirmed',now(),0),
 (tests.id(3002),tests.id(100),'Families find a home here','provisional',null,1);
insert into private.outcome_indicators(id,engagement_id,outcome_id,text) values(tests.id(3101),tests.id(100),tests.id(3001),'12 apprentice leaders serve alongside a ministry lead');
insert into private.risks(id,engagement_id,text,likelihood,impact) values(tests.id(3201),tests.id(100),'We tried all five at once',0.82,0.86);
insert into private.risk_mitigations(engagement_id,risk_id,text,recorded_by) values(tests.id(100),tests.id(3201),'Launch outcomes a season apart','facilitator');
insert into private.goals(id,engagement_id,outcome_id,title,result,result_clear,owner_attendee_id,end_date) values
 (tests.id(3301),tests.id(100),tests.id(3001),'Launch the apprentice pathway','8 apprentices placed in ministries',true,tests.id(503),'2027-04-30'),
 (tests.id(3302),tests.id(100),tests.id(3001),'Design the leader residency','',false,null,null);
insert into private.goal_risks(goal_id,risk_id,engagement_id) values(tests.id(3301),tests.id(3201),tests.id(100));
insert into private.key_metrics(engagement_id,text,rank) values(tests.id(100),'People in groups',1);
insert into private.celebrations(engagement_id,text) values(tests.id(100),'A baptism every month');
insert into private.lens_summaries(id,engagement_id,lens,state) values(tests.id(3601),tests.id(100),1,'on_screen'),(tests.id(3602),tests.id(100),2,'on_screen');
insert into private.lens_summary_versions(id,engagement_id,summary_id,version,author,shown_at) values
 (tests.id(3701),tests.id(100),tests.id(3601),1,'ai',now()),(tests.id(3702),tests.id(100),tests.id(3602),1,'ai',now());
insert into private.lens_summary_sentences(id,engagement_id,version_id,position,text) values
 (tests.id(3801),tests.id(100),tests.id(3701),0,'Every Sunday the room holds people who found us through a friend.'),
 (tests.id(3802),tests.id(100),tests.id(3702),0,'Our neighbours call the building theirs.');
update private.lens_summaries set state='signed_off',signed_off_version_id=tests.id(3701),current_version_id=tests.id(3701) where id=tests.id(3601);

-- Stand-in for the lens_summary kind while step 2b is not on this database.
do $$ begin
 if not exists(select 1 from private.interaction_kinds where kind='lens_summary') then
  insert into private.interaction_kinds(kind,label,input,one_per_person,counts,structured,shares_answers,spotlight,named,position) values('lens_summary','Lens summary',true,true,'people',true,false,'none','never',28);
  execute $f$ create function private.options_lens_summary(p jsonb,p_engagement uuid) returns jsonb language sql stable security definer set search_path='' as $g$
   select case when jsonb_typeof(p)='object' and not exists(select 1 from jsonb_object_keys(p) k where k not in ('lens','ai')) then p end $g$ $f$;
 end if;
end $$;

-- ---------- Who may read the draft Map ----------
select is((select count(*) from pg_class where oid='private.map_drafts'::regclass and relrowsecurity and relforcerowsecurity),1::bigint,'The draft Map is under forced row-level security');
select is((select count(*) from information_schema.role_table_grants where grantee in('anon','public') and table_schema='private' and table_name='map_drafts'),0::bigint,'Anonymous callers hold no privilege on the draft Map table');
select is((select count(*) from information_schema.role_routine_grants where grantee in('anon','public') and specific_schema in('public','private') and routine_name in('map_draft_read','map_assemble')),0::bigint,'Anonymous callers hold no execute on the Map functions');
select is((select count(*) from information_schema.role_table_grants where grantee='authenticated' and table_schema='private' and table_name='map_drafts' and privilege_type<>'SELECT'),0::bigint,'Browsers cannot write the draft Map table');

set local role authenticated;
select tests.login(3);
select is(public.map_draft_read(tests.id(100))->>'status','denied','A participant cannot read the Map');
select is((select count(*) from private.map_drafts),0::bigint,'A participant reads no Map row');
select tests.login(4);
select is(public.map_draft_read(tests.id(100))->>'status','denied','The TV cannot read the Map');
select is((select count(*) from private.map_drafts),0::bigint,'The TV reads no Map row');
select tests.login(7);
select is(public.map_draft_read(tests.id(100))->>'status','denied','Another engagement''s facilitator cannot read the Map');
select tests.login(8);
select is(public.map_draft_read(tests.id(100))->>'status','denied','A signed-in stranger cannot read the Map');
reset role;
set local role anon;
select throws_ok($$ select public.map_draft_read(tests.id(100)) $$,'42501',null,'Anonymous callers are refused');
reset role;

-- ---------- The facilitator reads it ----------
create temp table before_state as select (select version from public.room_states where engagement_id=tests.id(100)) as room_version,(select count(*) from realtime.messages) as msgs;
grant select on before_state to authenticated;
set local role authenticated;
select tests.login(1);
create temp table m1 as select public.map_draft_read(tests.id(100)) as r;
grant select on m1 to authenticated;
select is((select r->>'status' from m1),'ok','The facilitator reads the Map');
select is((select (r->>'version')::integer from m1),1,'The first read stores the Map at version 1');
select is((select r#>>'{pages,years,future}' from m1),'2036','The 10-year Future year is the base year plus 10');
select is((select r#>>'{pages,years,vision}' from m1),'2029','The 3-year Vision year is the base year plus 3');
select is((select r#>>'{pages,years,outlook}' from m1),'2027','The 1-year Outlook year is the base year plus 1');
select is((select r#>>'{pages,page1,mission,text}' from m1),'Help every neighbour take a next step with Jesus.','The mission comes from the church record');
select is((select r#>>'{pages,page1,purpose,empty}' from m1),'true','A missing purpose shows as empty');
select ok((select r#>>'{pages,page1,purpose,why}' from m1) is not null,'And says why');
select is((select r#>>'{pages,page1,future,lenses,0,state}' from m1),'signed_off','A signed-off lens shows its summary');
select is((select r#>>'{pages,page1,future,lenses,0,lines,0}' from m1),'Every Sunday the room holds people who found us through a friend.','With the signed-off sentences');
select is((select r#>>'{pages,page1,future,lenses,1,state}' from m1),'not_signed_off','A lens that is not signed off shows that state');
select is((select r#>>'{pages,page1,future,lenses,1,why}' from m1),'Not signed off yet','With the empty-state reason');
select ok(position('Our neighbours call the building theirs' in (select r::text from m1))=0,'Its unsigned draft is not on the Map');
select is((select jsonb_array_length(r#>'{pages,page1,future,lenses}') from m1),5,'All five lenses are listed');
select is((select r#>>'{pages,page1,vision,outcomes,0,title}' from m1),'Leaders raised from within','The 3-year Vision lists the Vision Outcomes');
select is((select r#>>'{pages,page1,vision,outcomes,0,indicators,0}' from m1),'12 apprentice leaders serve alongside a ministry lead','With their indicators');
select is((select jsonb_array_length(r#>'{pages,page2,outlook,goals}') from m1),1,'The 1-year Outlook lists only goals that meet CORE');
select is((select (r#>>'{pages,page2,outlook,unmet}')::integer from m1),1,'And counts the goal that does not');
select ok(position('Design the leader residency' in (select (r#>'{pages,page2,outlook}')::text from m1))=0,'The unmet goal is not listed');
select is((select r#>>'{pages,page2,priorities,empty}' from m1),'true','This Year''s Priorities is always empty');
select is((select r#>>'{pages,page2,outlook,metrics,items,0,text}' from m1),'People in groups','Key metrics come from the metrics list');
select is((select r#>>'{pages,page2,outlook,celebrations,items,0,text}' from m1),'A baptism every month','Celebrations come from the celebrations list');
select ok(position('We tried all five at once' in (select (r#>'{pages,page2,issues}')::text from m1))>0,'Risks appear under issues');
select ok(position('speaker' in (select r::text from m1))=0,'No speaker is on the Map');
select ok(position(tests.id(503)::text in (select r::text from m1))=0 and position(tests.id(3)::text in (select r::text from m1))=0,'The Map carries no id of any person');
select is(public.map_draft_read(tests.id(100))->'version',(select r->'version' from m1),'Reading again with nothing changed keeps the version');
select tests.login(2);
select is(public.map_draft_read(tests.id(100))->>'status','ok','An admin reads the Map');
select is(public.map_draft_read(tests.id(999))->>'status','denied','A room that does not exist reads as denied');
select tests.login(1);
select is((select count(*) from private.map_drafts),1::bigint,'The facilitator reads the stored Map row');
reset role;
update private.key_metrics set text='People in groups and teams' where engagement_id=tests.id(100);
set local role authenticated; select tests.login(1);
select is((public.map_draft_read(tests.id(100))->>'version')::integer,2,'A changed record moves the version on');
reset role;
select is((select version from public.room_states where engagement_id=tests.id(100)),(select room_version from before_state),'Reading the Map does not move the room version');
select is((select count(*) from realtime.messages),(select msgs from before_state),'Nothing was broadcast to the TV or phones');
select is((select count(*) from public.room_states r where r.engagement_id=tests.id(100) and (to_jsonb(r)::text like '%Not signed off%' or to_jsonb(r)::text like '%People in groups%')),0::bigint,'The room state carries no Map text');

-- ---------- The shipped templates ----------
select is((select count(*) from private.templates where id in('c1ea0000-0000-4000-8000-000000000002','c1ea0000-0000-4000-8000-000000000003')),2::bigint,'Both Wayfinding templates ship');
select is((select count(*) from private.templates t, jsonb_array_elements(t.sessions) s where t.id in('c1ea0000-0000-4000-8000-000000000002','c1ea0000-0000-4000-8000-000000000003') and not exists(select 1 from private.interaction_kinds k where k.kind=s->>'interaction')),0::bigint,'Every kind in them is registered');
select is((select count(*) from private.templates t where t.id in('c1ea0000-0000-4000-8000-000000000002','c1ea0000-0000-4000-8000-000000000003') and (t::text ~ '[—–]' or t::text ilike '%publish to core%')),0::bigint,'No dashes and no Publish to CORE session');
select is((select jsonb_array_length(sessions) from private.templates where id='c1ea0000-0000-4000-8000-000000000002'),40,'The Wayfinding template has 40 sessions');
select is((select jsonb_array_length(sessions) from private.templates where id='c1ea0000-0000-4000-8000-000000000003'),41,'The day-and-a-half template has 41 sessions');
select is((select s->>'planned_minutes' from private.templates t, jsonb_array_elements(t.sessions) s where t.id='c1ea0000-0000-4000-8000-000000000002' and s->>'interaction'='lens_summary' limit 1),'25','The lens summary sign-off takes 25 minutes');
select is((select count(*) from private.templates t, jsonb_array_elements(t.sessions) s where t.id='c1ea0000-0000-4000-8000-000000000003' and (s->>'team_led')::boolean and s->>'part'='Follow-up'),6::bigint,'The follow-up block is team-led');

-- ---------- Starting from them ----------
set local role authenticated; select tests.login(1);
select is(public.template_write('apply',jsonb_build_object('template','c1ea0000-0000-4000-8000-000000000002','engagement',tests.id(100),'start','2026-11-02T14:00:00Z'))->>'count','40','The Wayfinding template starts 40 sessions');
reset role;
select is((select count(*) from public.sessions where engagement_id=tests.id(100) and not deleted),40::bigint,'And they are in the room');
select is((select count(*) from public.sessions where engagement_id=tests.id(100) and not deleted and title like 'Five Lenses: %'),5::bigint,'Five lens steps');
select is((select planned_start from public.sessions where engagement_id=tests.id(100) and not deleted and part='Day 1' order by position limit 1),'2026-11-16T14:00:00Z'::timestamptz,'Day 1 starts at 9:00 church time, 14 days after the pre-call');
select is((select planned_start from public.sessions where engagement_id=tests.id(100) and not deleted and part='Day 2' order by position limit 1),'2026-11-17T13:30:00Z'::timestamptz,'Day 2 starts at 8:30 church time the next morning');
select is((select count(*) from public.sessions where engagement_id=tests.id(100) and not deleted and team_led),3::bigint,'The team-led block carries over');
select is((select count(*) from public.sessions s where engagement_id=tests.id(100) and not deleted and interaction='lens' and s.seeded_from is not null),5::bigint,'Each lens step is seeded from the pre-call seeding step');
select is((select count(*) from public.sessions where engagement_id=tests.id(100) and not deleted and interaction='goals' and options->>'risk_links'='required'),1::bigint,'The two-day goals step requires risk links');
select is((select closes_at from public.sessions where engagement_id=tests.id(100) and not deleted and interaction='lens' and (options->>'seed')::boolean),'2026-11-16T14:00:00Z'::timestamptz,'Seeding closes when Day 1 begins');
select is((select count(*) from public.sessions where engagement_id=tests.id(100) and not deleted and (title||prompt) like '%{lens name}%'),0::bigint,'No token is left unfilled');
select ok((select position > (select position from public.sessions where engagement_id=tests.id(100) and title='Five Lenses: Learning') from public.sessions where engagement_id=tests.id(100) and interaction='lens_summary' and not deleted limit 1),'The lens summary comes after the Learning lens');
select ok((select position < (select position from public.sessions where engagement_id=tests.id(100) and interaction='candidates' and not deleted limit 1) from public.sessions where engagement_id=tests.id(100) and interaction='lens_summary' and not deleted limit 1),'And before the provisional Vision Outcomes');

-- Custom lens names fill in.
update engagements set lens_names=array['Gathered','Neighbourhood','Leaders','Operations','Learning'] where id=tests.id(101);
set local role authenticated; select tests.login(7);
select is(public.template_write('apply',jsonb_build_object('template','c1ea0000-0000-4000-8000-000000000003','engagement',tests.id(101),'start','2026-11-02T14:00:00Z'))->>'count','41','The day-and-a-half template starts 41 sessions');
reset role;
select is((select count(*) from public.sessions where engagement_id=tests.id(101) and not deleted and title='Five Lenses: Gathered'),1::bigint,'The church''s own lens name is used');
select is((select count(*) from public.sessions where engagement_id=tests.id(101) and not deleted and interaction='goals' and options->>'risk_links'='later'),2::bigint,'The day-and-a-half goals steps link risks later');
select is((select planned_start from public.sessions where engagement_id=tests.id(101) and not deleted and part='Follow-up' order by position limit 1),'2026-11-24T15:00:00Z'::timestamptz,'The follow-up starts at 10:00 church time');
select is((select count(*) from public.sessions where engagement_id=tests.id(101) and not deleted and part='Follow-up' and team_led),6::bigint,'The whole follow-up is team-led');

-- Saving as a template carries no ids.
set local role authenticated; select tests.login(1);
select is(public.template_write('save',jsonb_build_object('engagement',tests.id(100),'name','Mine'))->>'status','ok','A facilitator saves the room as a template');
reset role;
select ok(not ((select sessions::text from private.templates where name='Mine') ~ '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'),'The saved template carries no ids');
select is((select count(*) from private.templates t, jsonb_array_elements(t.sessions) s where t.name='Mine' and s->>'seeded_from' is not null),6::bigint,'Seeding links are kept by place');
select * from finish();
rollback;
