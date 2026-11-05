-- Milestone 4, step 8: the two gaps the acceptance kit closes.
--   1. Clear test answers clears the candidate suggestions a rehearsal made, and leaves real ones alone.
--   2. The practice reset puts away scribe cards and scribe files, and names the stored bytes to remove.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('8b000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'session_id',tests.id(200+n),'role','authenticated')::text,true);
end $$;
grant usage on schema tests to service_role,authenticated,anon;
grant execute on all functions in schema tests to service_role,authenticated,anon;

insert into churches(id,name,timezone) values(tests.id(20),'Riverside Church','America/Toronto'),(tests.id(21),'Elsewhere Church','America/Toronto');
insert into engagements(id,church_id,title,type) values('90000000-0000-4000-8000-000000000010',tests.id(20),'Permanent practice','practice');
insert into engagements(id,church_id,title,status) values(tests.id(11),tests.id(21),'Another room','retreat');
insert into auth.users(id,email,email_confirmed_at) values(tests.id(1),'ann@example.org',now()),(tests.id(2),'fac@clearway.co',now()),(tests.id(3),'other@clearway.co',now());
insert into auth.identities(user_id,provider,provider_id,identity_data)
select id,'google',id::text,jsonb_build_object('email',email,'email_verified',true) from auth.users where id in(tests.id(2),tests.id(3));
insert into auth.sessions(id,user_id) values(tests.id(201),tests.id(1)),(tests.id(202),tests.id(2)),(tests.id(203),tests.id(3));
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method)
select gen_random_uuid(),id,now(),now(),case when user_id=tests.id(1) then 'otp' else 'oauth' end from auth.sessions where id in(tests.id(201),tests.id(202),tests.id(203));
insert into clearway_users(id,auth_user_id,name,email,team_hub_team_member_id)
select tests.id(300+n),tests.id(n),'Facilitator '||n,case n when 2 then 'fac@clearway.co' else 'other@clearway.co' end,tests.id(400+n) from generate_series(2,3)n;
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values('90000000-0000-4000-8000-000000000010',tests.id(302),'lead'),(tests.id(11),tests.id(303),'lead');
insert into attendees(id,engagement_id,name,email) values(tests.id(30),'90000000-0000-4000-8000-000000000010','Ann Lee','ann@example.org'),(tests.id(31),tests.id(11),'Other person','other@example.org');
insert into sessions(id,engagement_id,title,part,position,interaction,prompt,state,options,max_sends,max_characters,max_words)
values(tests.id(40),'90000000-0000-4000-8000-000000000010','Candidate priorities','Day 1',1,'candidates','Which priorities do we carry forward?','ready','{}',1,200,50),
 (tests.id(41),tests.id(11),'Another room step','Day 1',1,'candidates','Which priorities do we carry forward?','ready','{}',1,200,50);

-- A real suggestion, made before any rehearsal.
insert into private.candidate_suggestions(id,engagement_id,session_id,attendee_id,kind,text)
values(tests.id(50),'90000000-0000-4000-8000-000000000010',tests.id(40),tests.id(30),'add','Serve our city');
select is((select test from private.candidate_suggestions where id=tests.id(50)),false,'A suggestion made outside a rehearsal is not a test');

set local role authenticated;
select tests.login(2);
select is(public.rehearsal_control('90000000-0000-4000-8000-000000000010',tests.id(60),'start')->>'status','ok','The rehearsal starts');
reset role;
insert into private.candidate_suggestions(id,engagement_id,session_id,attendee_id,kind,text)
values(tests.id(51),'90000000-0000-4000-8000-000000000010',tests.id(40),tests.id(30),'add','Rehearsal idea');
select is((select test from private.candidate_suggestions where id=tests.id(51)),true,'A suggestion made in a rehearsal is marked as a test');
insert into private.candidate_suggestions(id,engagement_id,session_id,attendee_id,kind,text)
values(tests.id(52),tests.id(11),tests.id(41),tests.id(31),'add','Another room idea');
select is((select test from private.candidate_suggestions where id=tests.id(52)),false,'and another room is not rehearsing');
set local role authenticated;
select tests.login(2);
select is(public.rehearsal_control('90000000-0000-4000-8000-000000000010',tests.id(61),'end')->>'status','ok','The rehearsal ends');
select is(public.rehearsal_control('90000000-0000-4000-8000-000000000010',tests.id(62),'clear')->>'status','ok','Clear test answers runs');
reset role;
select is((select deleted from private.candidate_suggestions where id=tests.id(51)),true,'Clear test answers clears the rehearsal''s candidate suggestion');
select is((select deleted from private.candidate_suggestions where id=tests.id(50)),false,'and leaves the real one');
select is((select deleted from private.candidate_suggestions where id=tests.id(52)),false,'and another room''s');

-- Scribe cards and files, then the practice reset.
insert into private.scribe_cards(id,engagement_id,session_id,kind,text,attendee_id,captured_at)
values(tests.id(70),'90000000-0000-4000-8000-000000000010',tests.id(40),'quote','We keep coming back to the table.',tests.id(30),now());
insert into private.scribe_files(id,engagement_id,session_id,kind,name,content_type,bytes,storage_path,attendee_id,captured_at)
values(tests.id(71),'90000000-0000-4000-8000-000000000010',tests.id(40),'photo','easel.jpg','image/jpeg',1000,'90000000-0000-4000-8000-000000000010/'||tests.id(40)||'/'||tests.id(71)||'.jpg',tests.id(30),now());
insert into private.scribe_cards(id,engagement_id,session_id,kind,text,attendee_id,captured_at)
values(tests.id(72),tests.id(11),tests.id(41),'quote','Another room keeps its card.',tests.id(31),now());
set local role authenticated;
select tests.login(3);
select is(public.practice_scribe_paths(),array[]::text[],'A facilitator assigned elsewhere is told no paths');
select tests.login(2);
select is(array_length(public.practice_scribe_paths(),1),1,'The practice room''s facilitator is told the stored file to remove');
select is(public.reset_practice_room(),true,'The practice room resets');
reset role;
select is((select deleted from private.scribe_cards where id=tests.id(70)),true,'The reset puts away the scribe cards');
select is((select deleted from private.scribe_files where id=tests.id(71)),true,'and the scribe files');
select is((select deleted from private.candidate_suggestions where id=tests.id(50)),true,'and the candidate suggestions');
select is((select deleted from private.scribe_cards where id=tests.id(72)),false,'Another room''s scribe card stays');
set local role authenticated;
select tests.login(2);
select is(public.practice_scribe_paths(),array[]::text[],'Nothing is left to remove after the reset');
select ok(not has_function_privilege('anon','public.practice_scribe_paths()','execute'),'Anonymous callers cannot read the paths');
select * from finish();
rollback;
