-- Overnight fix: a scribe's Mitigation card lands on the pre-mortem risk it names (PRD scribe card:
-- "risk (for mitigations)"), within the pre-mortem's limit of three mitigations a reason.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('8a000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(1000+n))::text,true); end $$;
create function tests.live() returns uuid language sql security definer set search_path='' as $$ select live_session_id from public.room_states where engagement_id=tests.id(100) $$;
create function tests.results() returns jsonb language sql security definer set search_path='' as $$ select results from public.room_states where engagement_id=tests.id(100) $$;
create function tests.version() returns bigint language sql security definer set search_path='' as $$ select version from public.room_states where engagement_id=tests.id(100) $$;
create function tests.ctl(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$
 select public.room_control(tests.id(100),tests.id(n),action,jsonb_build_object('from',tests.live())||p) $$;
create function tests.rc(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$
 select public.reasons_control(tests.id(100),tests.id(n),action,jsonb_build_object('from',tests.live())||p) $$;
create function tests.save(n integer,kind text,options jsonb) returns jsonb language sql as $$
 select public.show_write(tests.id(100),'save',jsonb_build_object('id',tests.id(n),'revision',null,'title','Step '||n,'part','Day 2','mode','live','interaction',kind,
  'prompt','Prompt '||n,'phone_depth','','notes','','lands_in','','segment','','state','ready','planned_minutes',5,'max_sends',3,'max_characters',28,'max_words',3,
  'settings',jsonb_build_object('anonymous',true,'burst_minutes',4,'join_strip',false),'options',options)) $$;
create function tests.item(results jsonb,k text) returns jsonb language sql immutable as $$ select i from jsonb_array_elements(results->'items') i where i->>'key'=k $$;
create function tests.card(n integer,kind text,text text,detail jsonb default '{}') returns jsonb language sql as $$
 select public.scribe_capture(tests.id(100),tests.id(n),tests.live(),kind,text,detail,null,now()) $$;
create function tests.mits() returns bigint language sql security definer set search_path='' as $$ select count(*) from private.risk_mitigations where engagement_id=tests.id(100) and not deleted and recorded_by='scribe' $$;
create function tests.by(n integer) returns text language sql security definer set search_path='' as $$ select recorded_by from private.risk_mitigations where card_id=tests.id(n) and not deleted $$;
create function tests.shown(k text) returns jsonb language sql security definer set search_path='' as $$ select tests.item(tests.results(),k)->'mitigations' $$;
create function tests.linked(n integer) returns jsonb language sql as $$ select c->'linked' from jsonb_array_elements(public.scribe_state(tests.id(100))->'cards') c where c->>'id'=tests.id(n)::text $$;
grant execute on all functions in schema tests to authenticated,anon,service_role;

insert into churches(id,name,timezone) values(tests.id(200),'Riverside Church','America/Toronto');
insert into engagements(id,church_id,title) values(tests.id(100),tests.id(200),'Mitigation room');
insert into auth.users(id,email,email_confirmed_at)
select tests.id(n),case n when 1 then 'fac1@clearway.co' else 'person'||n||'@example.org' end,now() from generate_series(1,4)n;
insert into auth.sessions(id,user_id) select tests.id(1000+n),tests.id(n) from generate_series(1,4)n;
insert into auth.identities(user_id,provider,provider_id,identity_data) select id,'google',id::text,jsonb_build_object('email',email,'email_verified',true) from auth.users where id=tests.id(1);
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method) values(gen_random_uuid(),tests.id(1001),now(),now(),'oauth');
insert into clearway_users(id,auth_user_id,name,email,is_admin,team_hub_team_member_id) values(tests.id(701),tests.id(1),'Chris Vacher','fac1@clearway.co',false,tests.id(801));
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values(tests.id(100),tests.id(701),'lead');
insert into attendees(id,engagement_id,auth_user_id,name,email,verified_at,room_role) values(tests.id(503),tests.id(100),tests.id(3),'Krista Scribe','person3@example.org',now(),'scribe');
insert into device_sessions(engagement_id,attendee_id,auth_session_id) values(tests.id(100),tests.id(503),tests.id(1003));

select tests.login(1);
set local role authenticated;
select is(tests.save(310,'grid','{"preset":"pre_mortem","items":[{"key":"v1","text":"We burned out our volunteers"},{"key":"v2","text":"Nobody owned the follow-up"},{"key":"v3","text":"Nobody owned the follow-up."}]}')->>'status','ok','The Pre-mortem saves');
select is(tests.ctl(900,'go_live',jsonb_build_object('session',tests.id(310)))->>'status','ok','Go live on the Pre-mortem');
select is(tests.rc(901,'mitigate','{"item":"v1","text":"Cap each volunteer at one season"}')->>'status','ok','The facilitator records a mitigation first');
reset role;

select tests.login(3);
set local role authenticated;
select is(tests.card(1,'mitigation','Rest a season after serving two','{"risk":"  we burned OUT our volunteers. "}')->>'status','accepted','The scribe files a Mitigation card naming the risk in other letters');
select is(tests.mits(),1::bigint,'It wrote a mitigation under the risk');
select is(tests.by(1),'scribe','recorded by the scribe');
select is(tests.shown('v1'),'["Cap each volunteer at one season","Rest a season after serving two"]'::jsonb,'Both mitigations are on the room results, so on the TV and in the Map');
select is(tests.linked(1),'true'::jsonb,'The card says it is linked');
select is(tests.card(1,'mitigation','Rest a season after serving two','{"risk":"We burned out our volunteers"}')->>'status','duplicate','A replay is a duplicate and writes nothing more');
select is(tests.mits(),1::bigint,'still one row');
select is(tests.card(2,'mitigation','Name an owner at the meeting','{"risk":"The risk nobody wrote"}')->>'status','accepted','A card naming a risk nobody wrote is still a card');
select is(tests.linked(2),'false'::jsonb,'and says it is not linked');
select is(tests.card(3,'mitigation','Assign it today','{}')->>'status','accepted','A card naming no risk is still a card');
select is(tests.linked(3),'false'::jsonb,'and is not linked');
select is(tests.card(4,'mitigation','Pick one name','{"risk":"Nobody owned the follow-up"}')->>'status','accepted','A risk whose words match two reasons is not guessed');
select is(tests.linked(4),'false'::jsonb,'so the card is not linked');
select is(tests.card(5,'question','Who owns it','{}')->>'status','accepted','Other kinds write nothing');
select is(tests.mits(),1::bigint,'still one scribe mitigation');

-- The limit is three a reason, counting the facilitator's.
select is(tests.card(6,'mitigation','A third plan','{"risk":"We burned out our volunteers"}')->>'status','accepted','A third mitigation fits');
select is(tests.linked(6),'true'::jsonb,'and is linked');
select is(tests.card(7,'mitigation','A fourth plan','{"risk":"We burned out our volunteers"}')->>'status','accepted','A fourth is still captured as a card');
select is(tests.linked(7),'false'::jsonb,'but is not linked: three a reason');
select is(jsonb_array_length(tests.shown('v1')),3,'The reason still shows three');

-- Edits keep the row in step with the card.
select is(public.scribe_edit(tests.id(100),tests.id(1),'Rest a season after serving two years','{"risk":"We burned out our volunteers"}',null,0)->>'status','ok','The scribe edits the words');
select ok(tests.shown('v1') ? 'Rest a season after serving two years','The mitigation on the room shows the new words');
select is(tests.mits(),2::bigint,'still one row for that card');
select is(public.scribe_edit(tests.id(100),tests.id(1),'Rest a season after serving two years','{"risk":"Nobody owned the follow-up"}',null,1)->>'status','ok','The scribe points the card at an ambiguous risk');
select is(tests.linked(1),'false'::jsonb,'The link is taken away');
select is(jsonb_array_length(tests.shown('v1')),2,'and the reason is back to two');
select is(public.scribe_edit(tests.id(100),tests.id(7),'A fourth plan','{"risk":"We burned out our volunteers"}',null,0)->>'status','ok','Now the fourth card has room');
select is(tests.linked(7),'true'::jsonb,'and links on its edit');
reset role;

select is((select count(*) from private.risk_mitigations where engagement_id=tests.id(100) and not deleted and card_id is not null and recorded_by='scribe'),2::bigint,'Two scribe rows are live');
select is((select count(*) from information_schema.role_table_grants where grantee in('anon','public','authenticated') and table_schema='private' and table_name='risk_mitigations' and privilege_type in('INSERT','UPDATE','DELETE')),0::bigint,'Browsers still cannot write mitigations');

select * from finish();
rollback;
