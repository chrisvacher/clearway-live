-- Milestone 5 practice-room fixes: a candidates step that goes live again after Reset practice room starts at the review phase, and
-- the Wayfinding templates' read-back step carries the prompt and per-person limit the palette's default matches.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('87630000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(1000+n))::text,true); end $$;
create function tests.board_phase(s integer) returns text language sql security definer set search_path='' as $$ select phase from private.candidate_boards where session_id=tests.id(s) and not deleted $$;
grant execute on all functions in schema tests to authenticated,anon,service_role;

insert into churches(id,name,timezone) values(tests.id(200),'Riverside Church','America/Toronto');
insert into engagements(id,church_id,title,type,settings) values('90000000-0000-4000-8000-000000000010',tests.id(200),'Permanent practice','practice','{"ai_enabled":true}');
insert into auth.users(id,email,email_confirmed_at) values(tests.id(1),'fac1@clearway.co',now());
insert into auth.sessions(id,user_id) values(tests.id(1001),tests.id(1));
insert into auth.identities(user_id,provider,provider_id,identity_data) values(tests.id(1),'google',tests.id(1)::text,jsonb_build_object('email','fac1@clearway.co','email_verified',true));
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method) values(gen_random_uuid(),tests.id(1001),now(),now(),'oauth');
insert into clearway_users(id,auth_user_id,name,email,is_admin,team_hub_team_member_id) values(tests.id(701),tests.id(1),'Chris Vacher','fac1@clearway.co',false,tests.id(801));
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values('90000000-0000-4000-8000-000000000010',tests.id(701),'lead');

-- ---------- The candidates board after a reset ----------
insert into sessions(id,engagement_id,title,part,position,interaction,prompt,state,max_sends,max_characters,max_words,mode,options) values
 (tests.id(460),'90000000-0000-4000-8000-000000000010','Provisional Vision Outcomes','Day 1',1,'candidates','','ready',3,28,3,'live','{"ai":true,"cut":5}');
insert into private.candidate_boards(session_id,engagement_id,phase,cut,marked_at) values(tests.id(460),'90000000-0000-4000-8000-000000000010','marked',5,now());
select is(tests.board_phase(460),'marked','The board was marked in an earlier run');
set local role authenticated;
select tests.login(1);
select is(public.reset_practice_room(),true,'The facilitator resets the practice room');
reset role;
select is(tests.board_phase(460),null,'The reset puts the board away');
update public.room_states set live_session_id=tests.id(460) where engagement_id='90000000-0000-4000-8000-000000000010';
set local role authenticated;
select tests.login(1);
select is(public.candidates_state('90000000-0000-4000-8000-000000000010')->>'phase','review','The step goes live again at the review phase, not the marked one');
select is(public.candidates_control('90000000-0000-4000-8000-000000000010',tests.id(901),'add',jsonb_build_object('from',tests.id(460),'name','Welcome every neighbour'))->>'status','ok','and the facilitator can write a candidate, so the board moves on');
reset role;
select is(tests.board_phase(460),'review','The board is the same one, made new');
select is((select cut from private.candidate_boards where session_id=tests.id(460)),null,'with no cut line chosen');

-- ---------- The template's read-back step ----------
select is((select count(*)::integer from private.templates t, jsonb_array_elements(t.sessions) e where t.id in ('c1ea0000-0000-4000-8000-000000000002','c1ea0000-0000-4000-8000-000000000003')
  and e->>'interaction'='read_back' and e->>'prompt'='Did we hear you right?' and e->>'max_sends'='60' and e->>'max_characters'='280' and e->>'max_words'='50'),2,
 'Both Wayfinding templates carry the read-back step with its prompt and 60 sends, 280 characters, 50 words');

select * from finish();
rollback;
