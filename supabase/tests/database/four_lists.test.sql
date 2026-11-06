-- Milestone 6, step 1: the Four Helpful Lists (INT-11, SET-05), by role: the facilitator, a participant, the TV,
-- anonymous callers, a facilitator of another room and a stranger.
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
create function tests.ctl(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$
 select public.room_control(tests.id(100),tests.id(n),action,jsonb_build_object('from',tests.live())||p) $$;
create function tests.savefl(n integer,options jsonb,mode text default 'live') returns jsonb language sql as $$
 select public.show_write(tests.id(100),'save',jsonb_build_object('id',tests.id(n),'revision',null,'title','Four lists '||n,'part','Day 1','mode',mode,'interaction','four_lists',
  'prompt','What is right, wrong, missing and confused?','phone_depth','','notes','','lands_in','','segment','','state','ready','planned_minutes',45,'max_sends',12,'max_characters',200,'max_words',50,
  'settings',jsonb_build_object('anonymous',true,'burst_minutes',4,'join_strip',false),'options',options)) $$;
create function tests.card(n integer,answer integer,session integer,col text,text_ text) returns jsonb language sql as $$
 select public.live_submit(tests.id(100),tests.id(answer),tests.id(session),0,'submit',text_,now(),null,0,jsonb_build_object('column',col)) $$;
create function tests.sendraw(n integer,answer integer,session integer,text_ text,value jsonb) returns jsonb language sql as $$
 select public.live_submit(tests.id(100),tests.id(answer),tests.id(session),0,'submit',text_,now(),null,0,value) $$;
create function tests.agree(card integer,on_ boolean default true) returns jsonb language sql as $$ select public.four_lists_agree(tests.id(100),tests.id(card),on_) $$;
create function tests.q(sql text) returns text language plpgsql security definer set search_path='' as $$ declare v text; begin execute sql into v; return v; end $$;
create function tests.unit(id_ integer) returns jsonb language sql security definer set search_path='' as $$
 select c from public.room_states r, jsonb_array_elements(r.results->'cards') c where r.engagement_id=tests.id(100) and c->>'id'=tests.id(id_)::text $$;
create function tests.events_text() returns text language sql security definer set search_path='' as $$
 select coalesce(string_agg(payload::text,' '),'') from realtime.messages where topic like 'live:'||tests.id(100)||':%' $$;
create function tests.claim(lease integer) returns jsonb language sql security definer set search_path='' as $$
 select public.ai_claim(tests.id(600),tests.id(lease),'claude-test-model','{"group_four_lists":"group-four-lists@1","group_wall":"group-wall@2","combine_words":"combine-words@2"}') $$;
create function tests.apply(lease integer,body jsonb) returns jsonb language sql security definer set search_path='' as $$
 select public.ai_apply(r.id,tests.id(lease),body,'{"ms":10}') from private.ai_runs r where r.status='running' and r.session_id=tests.id(600) $$;
create function tests.gid(l text) returns uuid language sql security definer set search_path='' as $$ select id from private.ai_groups where label=l and not deleted limit 1 $$;
grant execute on all functions in schema tests to authenticated,anon,service_role;

insert into churches(id,name,timezone) values(tests.id(200),'Riverside Church','America/Toronto'),(tests.id(201),'Elsewhere Church','America/Toronto');
insert into engagements(id,church_id,title,settings) values(tests.id(100),tests.id(200),'Lists room','{"ai_enabled":true}'),(tests.id(101),tests.id(201),'Another room','{}');
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

-- ---------- The registry, the tables, the privileges ----------
select is((select row(input,one_per_person,counts,structured,shares_answers,spotlight,named)::text from private.interaction_kinds where kind='four_lists'),'(t,f,answers,f,t,id,never)','Four Helpful Lists is registered: several cards a person, counted as answers, hide by card, never named');
select ok(private.kind_function('results','four_lists','uuid,uuid,text[]') is not null and private.kind_function('options','four_lists','jsonb,uuid') is not null
 and private.kind_function('parse','four_lists','public.sessions,text,jsonb') is not null and private.kind_function('items','four_lists','uuid,text[]') is not null,'The engine finds its functions by name');
select is((select count(*) from pg_class where oid=any(array['private.four_list_agreements','private.four_list_review']::regclass[]) and relrowsecurity and relforcerowsecurity),2::bigint,'Both tables are under forced row-level security');
select is((select count(*) from information_schema.role_table_grants where grantee in('authenticated','anon','public') and table_schema='private' and table_name in('four_list_agreements','four_list_review')),0::bigint,'No browser role holds a privilege on them');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'four_lists%' and has_function_privilege('anon',p.oid,'execute')),0::bigint,'Anonymous callers cannot run the new functions');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('ai_claim','ai_apply','ai_fail') and has_function_privilege('authenticated',p.oid,'execute')),0::bigint,'The worker''s claim, apply and fail stay out of browsers'' reach');
select ok((select bool_and(pg_get_constraintdef(oid) ~ j) from pg_constraint, unnest(array['group_four_lists','propose_candidates','fold_lens_summary','draft_lens_summary','overnight_draft','group_lens','merge_reasons','summarize_wall','fold_questions','group_wall','combine_words']) j where conname='ai_runs_job_check'),'The job list holds the new job and every earlier one');
select ok(private.kind_function('results','candidates','uuid,uuid,text[]') is not null and position('candidates' in pg_get_functiondef('private.ai_on(uuid)'::regprocedure))>0 and position('lens_summary' in pg_get_functiondef('private.ai_on(uuid)'::regprocedure))>0
 and position('pre_mortem' in pg_get_functiondef('private.ai_on(uuid)'::regprocedure))>0 and position('four_lists' in pg_get_functiondef('private.ai_on(uuid)'::regprocedure))>0,'ai_on keeps every earlier branch and adds the lists');
select ok(position('four_list_agreements' in pg_get_functiondef('private.reset_practice_room()'::regprocedure))>0 and position('candidate_boards' in pg_get_functiondef('private.reset_practice_room()'::regprocedure))>0
 and position('scribe_cards' in pg_get_functiondef('private.reset_practice_room()'::regprocedure))>0 and position('lens_summaries' in pg_get_functiondef('private.reset_practice_room()'::regprocedure))>0,'The practice reset clears the new tables and everything it cleared before');
select ok(position('four_list_agreements' in pg_get_functiondef('private.rehearsal_control(uuid,uuid,text)'::regprocedure))>0 and position('candidate_suggestions' in pg_get_functiondef('private.rehearsal_control(uuid,uuid,text)'::regprocedure))>0
 and position('scribe_files' in pg_get_functiondef('private.rehearsal_control(uuid,uuid,text)'::regprocedure))>0,'Clear test answers clears the agreements and everything it cleared before');

-- ---------- Saving the step ----------
set local role authenticated;
select tests.login(1);
select is(tests.savefl(600,'{"ai":true}')->>'status','ok','The step saves with AI on');
select is(tests.savefl(601,'{}')->>'status','ok','with no options');
select is(tests.savefl(602,'{"colour":"red"}')->>'status','invalid_request','An unknown setting is refused');
select is(tests.savefl(602,'{"ai":"yes"}')->>'status','invalid_request','AI is true or false');
select is(tests.ctl(900,'go_live',jsonb_build_object('session',tests.id(600)))->>'status','ok','Go live on the lists');

-- ---------- Cards from phones ----------
select tests.login(3);
select is(tests.card(701,701,600,'right','Preaching is strong')->>'status','accepted','A person adds a card to What''s right?');
select is(tests.card(702,702,600,'missing','A path into groups')->>'status','accepted','and one to What''s missing?');
select is(tests.card(703,703,600,'confused','Who approves the budget?')->>'status','accepted','and one to What''s confused?');
select is(tests.sendraw(704,704,600,'No list named',null)->>'status','invalid_answer','A card with no list is refused');
select is(tests.sendraw(704,704,600,'Bad list','{"column":"other"}')->>'status','invalid_answer','a list that is not one of the four is refused');
select is(tests.sendraw(704,704,600,'Extra','{"column":"right","by":"me"}')->>'status','invalid_answer','and a value with extras is refused');
select is(tests.card(704,704,600,'right',repeat('x',201))->>'status','limit','A card over 200 characters is refused');
select is(tests.card(704,704,600,'right',repeat('x',200))->>'status','accepted','200 characters is fine');
select is(tests.card(705,705,600,'wrong','This is shit')->>'status','filtered','The word filter holds');
select tests.login(5);
select is(tests.card(710,710,600,'right','Great preaching')->>'status','accepted','Another person writes a card');
select is(tests.card(711,711,600,'missing','A clear way to join a group')->>'status','accepted','and another');
select is(tests.card(712,712,600,'wrong','Staff stretched thin')->>'status','accepted','and a What''s wrong? card');
select tests.login(6);
select is(tests.card(720,720,600,'right','We pray together')->>'status','accepted','A third person');
select is(tests.card(721,721,600,'right','Praying together')->>'status','accepted','writes several');
select is(tests.card(722,722,600,'right','Volunteers show up')->>'status','accepted','cards');
select is(tests.card(723,723,600,'right','Our volunteers are faithful')->>'status','accepted','to');
select is(tests.card(724,724,600,'right','Greeters are kind')->>'status','accepted','one list');

-- ---------- What the TV gets: cards and counts, no names ----------
select tests.login(1);
select is(tests.results()->>'total','12','The TV''s total counts the standing cards');
select is(tests.results()->>'people','3','and the people who wrote them');
select is(tests.results()#>>'{columns,right,cards}','8','Each list has its count');
select is(tests.results()#>>'{columns,confused,cards}','1','one for What''s confused?');
select is((tests.unit(701))->>'text','Preaching is strong','A card carries its words');
select is((tests.unit(701))->>'agree','0','and no agreement yet');
select is(tests.q($q$select (r.results::text ~ 'Priya|Shah|Ben|Ortiz|Ruth|Morrison|person3|attendee')::text from public.room_states r where r.engagement_id=tests.id(100)$q$),'false','The TV''s results carry no name and no person');
select is(tests.q($q$select (tests.events_text() ~ 'Shah|Ortiz|Morrison|person[0-9]@')::text$q$),'false','Nor do the broadcast events (the room''s presence shows first names, as before, and never beside a card)');

-- ---------- Agreeing: one per person per card, not your own, undoable ----------
select tests.login(5);
select is(tests.agree(701)->>'status','accepted','A person agrees with someone else''s card');
select is(tests.agree(701)->>'count','1','and the count is one');
select is(tests.agree(701)->>'count','1','Agreeing twice is still one agreement');
select is(tests.agree(710)->>'status','own','You cannot agree with your own card');
select is(tests.agree(701,false)->>'count','0','Undoing takes the agreement back');
select is(tests.agree(701,true)->>'count','1','and agreeing again puts it back');
select tests.login(6);
select is(tests.agree(701)->>'count','2','A second person makes two');
select is(tests.agree(710)->>'count','1','and agrees with another card');
select is(tests.agree(702)->>'count','1','and another');
select is(tests.agree(999)->>'status','missing','A card that does not exist is missing');
select tests.login(1);
select is(tests.q($q$select count(*)::text from private.four_list_agreements where submission_id=tests.id(701) and not deleted$q$),'2','Each person holds one row per card');
select is((tests.unit(701))->>'agree','2','The TV''s card counts the agreement');
select is(tests.agree(701)->>'status','denied','A facilitator cannot agree');
select tests.login(4);
select is(tests.agree(701)->>'status','denied','Nor can a TV');
select tests.login(8);
select is(tests.agree(701)->>'status','denied','Nor a stranger');
reset role;
set local role anon;
select throws_ok($$select public.four_lists_agree('89000000-0000-4000-8000-000000000100','89000000-0000-4000-8000-000000000701',true)$$,'42501',null,'Anonymous callers cannot call it');
reset role;
set local role authenticated;
select tests.login(3);
select throws_ok($$select count(*) from private.four_list_agreements$$,'42501',null,'A participant cannot read the agreements table');
select throws_ok($$select count(*) from private.four_list_review$$,'42501',null,'nor the review table');

-- ---------- A phone''s read ----------
select is(public.four_lists_read(tests.id(100),tests.id(600))->>'status','ok','A participant reads the cards');
select is(jsonb_array_length(public.four_lists_read(tests.id(100),tests.id(600))->'cards'),12,'all twelve');
select is((select (c->>'mine') from jsonb_array_elements(public.four_lists_read(tests.id(100),tests.id(600))->'cards') c where c->>'id'=tests.id(701)::text),'false','Priya did not agree with her own card');
select is((select (c->>'own') from jsonb_array_elements(public.four_lists_read(tests.id(100),tests.id(600))->'cards') c where c->>'id'=tests.id(701)::text),'true','and it is marked hers');
select tests.login(6);
select is((select (c->>'mine') from jsonb_array_elements(public.four_lists_read(tests.id(100),tests.id(600))->'cards') c where c->>'id'=tests.id(701)::text),'true','Ruth sees her own agreement');
select ok(public.four_lists_read(tests.id(100),tests.id(600))::text !~ 'Priya|Ben|Ruth|attendee|person[0-9]','The read carries no name or person');
select tests.login(1);
select is(public.four_lists_read(tests.id(100),tests.id(600))->>'status','denied','A facilitator uses the review, not the phone''s read');
select tests.login(4);
select is(public.four_lists_read(tests.id(100),tests.id(600))->>'status','denied','A TV cannot read it');
select tests.login(8);
select is(public.four_lists_read(tests.id(100),tests.id(600))->>'status','denied','A stranger cannot');

-- ---------- Hide, phones down ----------
select tests.login(1);
select is(tests.ctl(910,'hide',jsonb_build_object('item',tests.id(724)))->>'status','ok','The facilitator hides a card from the TV');
select is(tests.results()->>'total','11','and the count drops');
select is(tests.results()#>>'{columns,right,cards}','7','in its list');
select tests.login(6);
select tests.login(5);
select is(tests.agree(724)->>'status','missing','A hidden card cannot be agreed with');
select tests.login(1);
select is(tests.ctl(911,'unhide',jsonb_build_object('item',tests.id(724)))->>'status','ok','Unhide brings it back');
select is(tests.ctl(912,'phones_down')->>'status','ok','Phones down');
select tests.login(5);
select is(tests.agree(702)->>'status','closed','Agreeing is closed while phones are down');
select tests.login(1);
select is(tests.ctl(913,'open_phones')->>'status','ok','Open phones');

-- ---------- AI grouping ----------
reset role;
select is(tests.claim(802)->>'status','claimed','The worker claims the grouping');
select is(tests.q($q$select job from private.ai_runs where status='running' and session_id=tests.id(600)$q$),'group_four_lists','under its own job');
select ok(tests.q($q$select inputs::text from private.ai_runs where status='running' and session_id=tests.id(600)$q$) !~ ('Priya|Shah|Ortiz|Morrison|person|'||tests.id(503)||'|'||tests.id(505)),'with no name and no person id');
select is(tests.q($q$select (jsonb_array_length(inputs->'answers'))::text from private.ai_runs where status='running' and session_id=tests.id(600)$q$),'12','It sees the twelve cards');
select is(tests.claim(803)->>'status','busy','A second worker is turned away');
select is(tests.apply(802,jsonb_build_object('groups',jsonb_build_array(
  jsonb_build_object('group','n1','label','Cross','answers',jsonb_build_array('a1','a3')),
  jsonb_build_object('group','n2','label','Preaching','answers',jsonb_build_array('a1','a5')),
  jsonb_build_object('group','n3','label','A way into groups','answers',jsonb_build_array('a2','a6')),
  jsonb_build_object('group','n4','label','People who serve','answers',jsonb_build_array('a8','a9','a10','a11','a12')))))->>'status','ok','The grouping applies');
select ok((select (output->'refused')::text ~ 'column' from private.ai_runs where session_id=tests.id(600) and job='group_four_lists' order by created_at limit 1),'A group across two lists is refused for its other list');
select is((select count(*)::text from private.ai_groups where session_id=tests.id(600) and undone_at is null),'3','Three groups stand: the cross-list one was never made');
select is((select count(*)::text from private.ai_group_members m join private.ai_groups g on g.id=m.group_id where g.label='People who serve'),'4','Only four go in one step');
select ok((select (output->'refused')::text ~ 'too_many' from private.ai_runs where session_id=tests.id(600) and job='group_four_lists' order by created_at limit 1),'and the fifth is refused as too many');
select is((tests.unit(701))->>'held','2','A group is one card holding two');
select is((tests.unit(701))->>'ai','true','marked as AI''s');
select is(tests.q($q$select count(*)::text from public.room_states r, jsonb_array_elements(r.results->'cards') c where r.engagement_id=tests.id(100) and c->>'id'=tests.id(710)::text$q$),'0','The absorbed card is no longer a card of its own');
select is((tests.unit(701))->>'agree','2','The group counts the people who agreed with any member');
select is(tests.unit(701)->'ids' ? tests.id(710)::text,true,'and lists the card that glides into it');
select is(tests.unit(701)->>'text','Preaching','The group shows its label');
select is(tests.results()->>'ai','true','The results say AI grouped');
select is(tests.claim(805)->>'status','idle','Seen cards make nothing due again');
-- Undo, pin, off, status, by role.
set local role authenticated;
select tests.login(1);
select is(public.ai_status(tests.id(100),tests.id(600))->'session'->>'interaction','four_lists','The AI panel reads a lists session');
select is(jsonb_array_length(public.ai_status(tests.id(100),tests.id(600))->'groups'),3,'with its groups');
select ok(public.ai_status(tests.id(100),tests.id(600))->'groups'->0->>'column' in('right','missing'),'each with its list');
select is(public.ai_control(tests.id(100),tests.id(920),'pin_group',jsonb_build_object('group',tests.gid('Preaching')))->>'status','ok','Pin a group');
select is(public.ai_control(tests.id(100),tests.id(922),'undo_group',jsonb_build_object('group',tests.gid('A way into groups')))->>'status','ok','Undo a group');
select is((tests.unit(702))->>'held','1','Its cards stand on their own again');
select is(public.ai_control(tests.id(100),tests.id(923),'ai_off',jsonb_build_object('session',tests.id(600)))->>'status','ok','AI off');
select is(tests.results()->>'ai','false','The TV drops the groups');
select is((tests.unit(701))->>'held','1','and the cards stand on their own');
select is(public.ai_control(tests.id(100),tests.id(923),'ai_off',jsonb_build_object('session',tests.id(600)))->>'status','duplicate','A resent press is a duplicate');
select is(public.ai_control(tests.id(100),tests.id(924),'ai_on',jsonb_build_object('session',tests.id(600)))->>'status','ok','AI on');
select is((tests.unit(701))->>'held','2','and the groups come back');
select is(public.ai_control(tests.id(100),tests.id(921),'undo_last',jsonb_build_object('session',tests.id(600)))->>'status','ok','Undo last AI change');
select is(tests.results()->>'ai','false','takes the run''s groups away');
select tests.login(7);
select is(public.ai_control(tests.id(100),tests.id(925),'ai_off',jsonb_build_object('session',tests.id(600)))->>'status','denied','Another room''s facilitator cannot switch it');
select tests.login(3);
select is(public.ai_control(tests.id(100),tests.id(926),'ai_off',jsonb_build_object('session',tests.id(600)))->>'status','denied','Nor a participant');
reset role;

-- ---------- The review (SET-05) ----------
set local role authenticated;
select tests.login(1);
select is(public.four_lists_review_read(tests.id(100),tests.id(600))->>'status','ok','The facilitator reads the review');
select is(jsonb_array_length(public.four_lists_review_read(tests.id(100),tests.id(600))->'cards'),12,'every card');
select is(public.four_lists_review_read(tests.id(100),tests.id(600))->>'took_part','3','with the people who took part');
select tests.login(3);
select is(public.four_lists_review_read(tests.id(100),tests.id(600))->>'status','denied','A participant cannot');
select is(public.four_lists_review(tests.id(100),tests.id(600),'keep',jsonb_build_object('card',tests.id(701),'kept',false))->>'status','denied','nor press');
select tests.login(4);
select is(public.four_lists_review_read(tests.id(100),tests.id(600))->>'status','denied','The TV cannot');
select tests.login(7);
select is(public.four_lists_review_read(tests.id(100),tests.id(600))->>'status','denied','Another room''s facilitator cannot');
select is(public.four_lists_marks(tests.id(100))->>'status','denied','or read the marks');
select tests.login(8);
select is(public.four_lists_review_read(tests.id(100),tests.id(600))->>'status','denied','A stranger cannot');
reset role;
set local role anon;
select throws_ok($$select public.four_lists_review_read('89000000-0000-4000-8000-000000000100','89000000-0000-4000-8000-000000000600')$$,'42501',null,'Anonymous callers cannot');
reset role;
set local role authenticated;
select tests.login(1);
select is(public.four_lists_review(tests.id(100),tests.id(600),'edit',jsonb_build_object('card',tests.id(702),'text','  A clear path into groups '))->>'status','ok','Edit a card''s words');
select is((select c->>'text' from jsonb_array_elements(public.four_lists_review_read(tests.id(100),tests.id(600))->'cards') c where c->>'id'=tests.id(702)::text),'A clear path into groups','The review shows the new words');
select is((select c->>'original' from jsonb_array_elements(public.four_lists_review_read(tests.id(100),tests.id(600))->'cards') c where c->>'id'=tests.id(702)::text),'A path into groups','and keeps the original');
select is(public.four_lists_review(tests.id(100),tests.id(600),'edit',jsonb_build_object('card',tests.id(702),'text','This is shit'))->>'status','filtered','Edited words go through the word filter');
select is(public.four_lists_review(tests.id(100),tests.id(600),'edit',jsonb_build_object('card',tests.id(702),'text',repeat('y',201)))->>'status','invalid_request','and the 200 limit');
select is(tests.q($q$select text from public.submissions where id=tests.id(702)$q$),'A path into groups','The card on the TV is not changed by the review');
select is(public.four_lists_review(tests.id(100),tests.id(600),'merge',jsonb_build_object('cards',jsonb_build_array(tests.id(702),tests.id(711))))->>'status','ok','Merge two cards of one list');
select is((select c->>'agree' from jsonb_array_elements(public.four_lists_review_read(tests.id(100),tests.id(600))->'cards') c where c->>'id'=tests.id(702)::text),'1','The merged card counts the people who agreed with either');
select is((select c->>'members' from jsonb_array_elements(public.four_lists_review_read(tests.id(100),tests.id(600))->'cards') c where c->>'id'=tests.id(702)::text),'1','and holds one other');
select is(public.four_lists_review(tests.id(100),tests.id(600),'merge',jsonb_build_object('cards',jsonb_build_array(tests.id(702),tests.id(703))))->>'status','invalid_state','Cards of two lists do not merge');
select is(public.four_lists_review(tests.id(100),tests.id(600),'mark',jsonb_build_object('card',tests.id(711),'heard',true,'tensions',false))->>'status','invalid_state','A merged-away card carries no mark');
select is(public.four_lists_review(tests.id(100),tests.id(600),'mark',jsonb_build_object('card',tests.id(702),'heard',true,'tensions',false))->>'status','ok','Mark a card for What We Heard');
select is(public.four_lists_review(tests.id(100),tests.id(600),'mark',jsonb_build_object('card',tests.id(702),'heard',true,'tensions',true))->>'status','invalid_state','Strategic Tensions only from What''s wrong? and What''s confused?');
select is(public.four_lists_review(tests.id(100),tests.id(600),'mark',jsonb_build_object('card',tests.id(703),'heard',false,'tensions',true))->>'status','ok','A confused card feeds Strategic Tensions');
select is(public.four_lists_review(tests.id(100),tests.id(600),'mark',jsonb_build_object('card',tests.id(712),'heard',true,'tensions',true))->>'status','ok','a wrong card feeds both');
select is(public.four_lists_review(tests.id(100),tests.id(600),'mark',jsonb_build_object('card',tests.id(712),'heard',true,'tensions',true))->>'status','ok','A repeat changes nothing');
select is(jsonb_array_length(public.four_lists_marks(tests.id(100))->'cards'),3,'Step 4 reads three marked cards');
select is((select c->>'text' from jsonb_array_elements(public.four_lists_marks(tests.id(100))->'cards') c where c->>'card'=tests.id(702)::text),'A clear path into groups','with the edited words');
select is((select c->>'agree' from jsonb_array_elements(public.four_lists_marks(tests.id(100))->'cards') c where c->>'card'=tests.id(702)::text),'1','and the agreement');
select is((select c->>'took_part' from jsonb_array_elements(public.four_lists_marks(tests.id(100))->'cards') c where c->>'card'=tests.id(702)::text),'3','and who took part');
select is(public.four_lists_review(tests.id(100),tests.id(600),'keep',jsonb_build_object('card',tests.id(712),'kept',false))->>'status','ok','Set a card aside');
select is(jsonb_array_length(public.four_lists_marks(tests.id(100))->'cards'),2,'Its marks go with it');
select is(public.four_lists_review(tests.id(100),tests.id(600),'mark',jsonb_build_object('card',tests.id(712),'heard',true,'tensions',false))->>'status','invalid_state','A card set aside cannot be marked');
select is(public.four_lists_review(tests.id(100),tests.id(600),'keep',jsonb_build_object('card',tests.id(712),'kept',true))->>'status','ok','Keep it again');
select is(public.four_lists_review(tests.id(100),tests.id(600),'unmerge',jsonb_build_object('card',tests.id(711)))->>'status','ok','Unmerge');
select is((select c->>'members' from jsonb_array_elements(public.four_lists_review_read(tests.id(100),tests.id(600))->'cards') c where c->>'id'=tests.id(702)::text),'0','and the survivor holds none');
select is(public.four_lists_review(tests.id(100),tests.id(600),'merge',jsonb_build_object('cards',jsonb_build_array(tests.id(702))))->>'status','invalid_request','A merge needs two cards');
select is(public.four_lists_review(tests.id(100),tests.id(600),'bogus','{}')->>'status','invalid_request','An unknown action is refused');
reset role;
select is((select (public.four_lists_marks(tests.id(100)))->>'status'),'ok','The service role reads the marks');

-- ---------- Test answers and the practice reset ----------
set local role authenticated;
select tests.login(1);
select is(tests.ctl(940,'nothing_live')->>'status','ok','Nothing live');
select is(public.rehearsal_control(tests.id(100),tests.id(931),'start')->>'status','ok','Start a rehearsal');
select tests.login(3);
select is(tests.card(750,750,600,'right','A rehearsal card')->>'status','accepted','A rehearsal card, on a step taking late answers');
select tests.login(5);
select is(tests.agree(750)->>'status','accepted','and a rehearsal agreement');
select tests.login(1);
select is(public.rehearsal_control(tests.id(100),tests.id(932),'clear')->>'status','ok','Clear test answers');
select cmp_ok((public.rehearsal_control(tests.id(100),tests.id(932),'clear')->>'votes')::integer,'>=',1,'It counts the agreement with the votes');
reset role;
select is(tests.q($q$select count(*)::text from private.four_list_agreements where submission_id=tests.id(750) and not deleted$q$),'0','The test agreement is gone');
select is(tests.q($q$select count(*)::text from private.four_list_agreements where submission_id=tests.id(701) and not deleted$q$),'2','Real agreements stand');

insert into engagements(id,church_id,title,type) values('90000000-0000-4000-8000-000000000010',tests.id(200),'Permanent practice','practice');
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values('90000000-0000-4000-8000-000000000010',tests.id(701),'lead');
insert into attendees(id,engagement_id,auth_user_id,name,email,verified_at,room_role) values(tests.id(590),'90000000-0000-4000-8000-000000000010',tests.id(2),'Practice Guest','person2@example.org',now(),'participant');
insert into public.sessions(id,engagement_id,title,part,position,interaction,prompt,state,max_sends,max_characters,options)
 values(tests.id(591),'90000000-0000-4000-8000-000000000010','Practice lists','Day 1',0,'four_lists','Lists','ready',12,200,'{}');
insert into public.submissions(id,engagement_id,session_id,attendee_id,text,answers,value,phone_sent_at,server_received_at,revision)
 values(tests.id(592),'90000000-0000-4000-8000-000000000010',tests.id(591),tests.id(590),'Practice card','[]','{"column":"right"}',now(),now(),0),
 (tests.id(593),'90000000-0000-4000-8000-000000000010',tests.id(591),tests.id(590),'Practice card two','[]','{"column":"right"}',now(),now(),0);
insert into private.four_list_agreements(engagement_id,session_id,submission_id,attendee_id) values('90000000-0000-4000-8000-000000000010',tests.id(591),tests.id(592),tests.id(590));
insert into private.four_list_review(submission_id,engagement_id,session_id,feeds_heard) values(tests.id(593),'90000000-0000-4000-8000-000000000010',tests.id(591),true);
set local role authenticated;
select tests.login(1);
select is(public.reset_practice_room(),true,'The facilitator resets the practice room');
reset role;
select is(tests.q($q$select count(*)::text from private.four_list_agreements where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted$q$),'0','The practice agreements are cleared');
select is(tests.q($q$select count(*)::text from private.four_list_review where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted$q$),'0','and the practice review marks');
-- ---------- The shipped template ----------
select is((select count(*) from private.templates where id='c1ea0000-0000-4000-8000-000000000004' and kind='shipped'),1::bigint,'The Board discovery session template ships');
select is((select string_agg(s->>'interaction',',' order by (s->>'position')::int) from private.templates t, jsonb_array_elements(t.sessions) s where t.id='c1ea0000-0000-4000-8000-000000000004'),'content,four_lists,content','It is a welcome, the lists and a close');
select is((select count(*) from private.templates t, jsonb_array_elements(t.sessions) s where t.id='c1ea0000-0000-4000-8000-000000000004' and not exists(select 1 from private.interaction_kinds k where k.kind=s->>'interaction')),0::bigint,'Every kind in it is registered');
select is((select count(*) from private.templates t where t.id='c1ea0000-0000-4000-8000-000000000004' and t::text ~ E'[\u2014\u2013]'),0::bigint,'No dashes in it');
set local role authenticated;
select tests.login(1);
select is(public.template_write('apply',jsonb_build_object('template','c1ea0000-0000-4000-8000-000000000004','engagement',tests.id(100),'start','2026-11-02T14:00:00Z'))->>'count','3','Starting an engagement from it adds three sessions');
reset role;
select * from finish();
rollback;
