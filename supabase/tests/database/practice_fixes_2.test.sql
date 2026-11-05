begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('89000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(1000+n))::text,true); end $$;
create function tests.live() returns uuid language sql security definer set search_path='' as $$ select live_session_id from public.room_states where engagement_id=tests.id(100) $$;
create function tests.state(n integer) returns text language sql security definer set search_path='' as $$ select state from public.sessions where id=tests.id(n) $$;
create function tests.signed(n integer) returns bigint language sql security definer set search_path='' as $$ select count(*) from public.submissions where session_id=tests.id(n) and not deleted and not withdrawn $$;
create function tests.ctl(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$
 select public.room_control(tests.id(100),tests.id(7000+n),action,jsonb_build_object('from',tests.live())||p) $$;
create function tests.close_signing(n integer) returns jsonb language sql as $$
 select public.sign_control(tests.id(100),tests.id(7000+n),'close',jsonb_build_object('from',tests.live())) $$;
create function tests.hand(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$
 select public.handover_control(tests.id(100),tests.id(7000+n),action,jsonb_build_object('from',tests.live())||p) $$;
create function tests.send(n integer,session integer,value jsonb) returns jsonb language sql as $$
 select public.live_submit(tests.id(100),tests.id(n),tests.id(session),0,'submit','',now(),null,0,value) $$;
create function tests.save(n integer,kind text,options jsonb,part text default 'Day 2') returns jsonb language sql as $$
 select public.show_write(tests.id(100),'save',jsonb_build_object('id',tests.id(n),'revision',null,'title','Step '||n,'part',part,'mode','live','interaction',kind,
  'prompt','Prompt '||n,'phone_depth','','notes','','lands_in','','segment','','state','ready','planned_minutes',5,'max_sends',3,'max_characters',28,'max_words',3,
  'settings',jsonb_build_object('anonymous',kind<>'sign','burst_minutes',4,'join_strip',false),'options',options)) $$;
grant execute on all functions in schema tests to authenticated,anon,service_role;
create view tests.team_blocks as select * from private.team_blocks;
grant select on tests.team_blocks to authenticated,anon,service_role;
create view tests.followup_grants as select * from private.followup_grants;
grant select on tests.followup_grants to authenticated,anon,service_role;

insert into churches(id,name,timezone) values(tests.id(200),'Riverside Church','America/Toronto');
insert into engagements(id,church_id,title) values(tests.id(100),tests.id(200),'Practice fixes room');
insert into auth.users(id,email,email_confirmed_at)
select tests.id(n),case n when 1 then 'fac1@clearway.co' else 'person'||n||'@example.org' end,now() from generate_series(1,8)n;
insert into auth.sessions(id,user_id) select tests.id(1000+n),tests.id(n) from generate_series(1,8)n;
insert into auth.identities(user_id,provider,provider_id,identity_data) select id,'google',id::text,jsonb_build_object('email',email,'email_verified',true) from auth.users where id=tests.id(1);
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method) values(gen_random_uuid(),tests.id(1001),now(),now(),'oauth');
insert into clearway_users(id,auth_user_id,name,email,is_admin,team_hub_team_member_id) values(tests.id(701),tests.id(1),'Chris Vacher','fac1@clearway.co',false,tests.id(801));
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values(tests.id(100),tests.id(701),'lead');
insert into attendees(id,engagement_id,auth_user_id,name,email,verified_at,room_role) values
 (tests.id(503),tests.id(100),tests.id(3),'Priya Shah','person3@example.org',now(),'participant'),
 (tests.id(505),tests.id(100),tests.id(5),'Ben Ortiz','person5@example.org',now(),'participant');
insert into device_sessions(engagement_id,attendee_id,auth_session_id) values(tests.id(100),tests.id(503),tests.id(1003)),(tests.id(100),tests.id(505),tests.id(1005));
insert into private.tv_devices(id,proof,engagement_id,label,paired_at) values(tests.id(450),repeat('a',64),tests.id(100),'Front TV',now());
insert into private.live_tv_sessions(id,engagement_id,auth_user_id,auth_session_id,device_id) values(tests.id(400),tests.id(100),tests.id(4),tests.id(1004),tests.id(450));

-- Day 2: a wall, Affirm together (sign), a closing wall. Day 1 has one wall, for Close day.
select tests.login(1); set local role authenticated;
select is(tests.save(601,'wall','{}')->>'status','ok','The facilitator saves a wall');
select is(tests.save(602,'sign','{"text":"We commit to these goals."}')->>'status','ok','The facilitator saves Affirm together');
select is(tests.save(603,'wall','{}')->>'status','ok','The facilitator saves the closing wall');
select is(tests.save(604,'wall','{}','Day 1')->>'status','ok','And a Day 1 wall');
reset role;
update public.sessions set position=case id when tests.id(604) then 0 when tests.id(601) then 1 when tests.id(602) then 2 else 3 end where engagement_id=tests.id(100);

-- ---------- Affirm together: leaving closes signing; showing it again opens it ----------
select tests.login(1); set local role authenticated;
select is(tests.ctl(1,'go_live',jsonb_build_object('session',tests.id(602)))->>'status','ok','Go live on Affirm together');
select is(tests.state(602),'live','Signing is open');
select tests.login(3);
select is(tests.send(901,602,'{"strokes":["M10 100L40 80"]}')->>'status','accepted','Priya signs');
select tests.login(1);
select is(tests.ctl(2,'next')->>'status','ok','Next, to the closing wall');
select is(tests.state(602),'closed','Leaving the step closes signing');
select is(tests.ctl(3,'go_live',jsonb_build_object('session',tests.id(602)))->>'status','ok','Go live on Affirm together again');
select is(tests.state(602),'live','Going live again opens signing again');
select is((select closed_at from public.sessions where id=tests.id(602)),null,'It no longer reads as closed');
select is(tests.signed(602),1::bigint,'Priya''s signature is kept');
select tests.login(5);
select is(tests.send(902,602,'{"strokes":["M30 30L60 60"]}')->>'status','accepted','Ben signs after it opened again');
select tests.login(1);
select is(tests.signed(602),2::bigint,'Both signatures are there');
select is(tests.ctl(4,'back')->>'status','ok','Back, to the opening wall');
select is(tests.state(602),'closed','Leaving closes it again');
select is(tests.ctl(5,'next')->>'status','ok','Next, back to Affirm together');
select is(tests.state(602),'live','Next onto it opens it again too');

-- Close signing is the facilitator's own choice: it stays closed when shown again.
select is(tests.close_signing(6)->>'status','ok','The facilitator closes signing');
select is(tests.state(602),'closed','Signing is closed');
select is(tests.ctl(7,'next')->>'status','ok','Next');
select is(tests.ctl(8,'go_live',jsonb_build_object('session',tests.id(602)))->>'status','ok','Go live on Affirm together again');
select is(tests.state(602),'closed','A step the facilitator closed stays closed');
select is(tests.ctl(9,'reopen')->>'status','ok','Reopen still opens it');
select is(tests.state(602),'live','Open again after Reopen');
select is(tests.ctl(10,'next')->>'status','ok','Next, which closes it by moving on');
select is(tests.ctl(11,'go_live',jsonb_build_object('session',tests.id(602)))->>'status','ok','Go live on it once more');
select is(tests.state(602),'live','Moving on after a Reopen is not a close by the facilitator');

-- Close day keeps it closed.
select is(tests.ctl(12,'close_part',jsonb_build_object('part','Day 2'))->>'status','ok','The facilitator closes Day 2');
select is(tests.state(602),'closed','Closing the day closes signing');
select is(tests.ctl(13,'go_live',jsonb_build_object('session',tests.id(602)))->>'status','ok','Go live on Affirm together after Close day');
select is(tests.state(602),'closed','A closed day''s signing stays closed until Reopen');
reset role;
select is(tests.signed(602),2::bigint,'No signature was lost along the way');

-- A step left behind before the day closed stays closed too.
update public.sessions set state='ready',closed_at=null where engagement_id=tests.id(100);
update public.room_states set live_session_id=null,tv_content='holding' where engagement_id=tests.id(100);
select tests.login(1); set local role authenticated;
select is(tests.ctl(20,'go_live',jsonb_build_object('session',tests.id(602)))->>'status','ok','Go live on Affirm together');
select is(tests.ctl(21,'next')->>'status','ok','Next, which closes it');
select is(tests.ctl(22,'close_part',jsonb_build_object('part','Day 2'))->>'status','ok','Then Day 2 closes');
select is(tests.ctl(23,'go_live',jsonb_build_object('session',tests.id(602)))->>'status','ok','Go live on it after the day closed');
select is(tests.state(602),'closed','It stays closed: its day has closed');
reset role;

-- Another kind is never opened this way.
update public.sessions set state='ready',closed_at=null where engagement_id=tests.id(100);
update public.room_states set live_session_id=null,tv_content='holding' where engagement_id=tests.id(100);
select tests.login(1); set local role authenticated;
select is(tests.ctl(30,'go_live',jsonb_build_object('session',tests.id(603)))->>'status','ok','Go live on the closing wall');
select is(tests.ctl(31,'go_live',jsonb_build_object('session',tests.id(604)))->>'status','ok','Go live on the Day 1 wall, which closes it');
select is(tests.state(603),'closed','The wall closed');
select is(tests.ctl(32,'go_live',jsonb_build_object('session',tests.id(603)))->>'status','ok','Go live on the wall again');
select is(tests.state(603),'closed','A wall stays read-only, as before');
reset role;
select ok(not has_function_privilege('authenticated','private.sign_reopen_on_show()','execute'),'Browsers cannot call the trigger function');

-- ---------- Taking the remote through the follow-up while the room's own handover is open ----------
update public.sessions set state='ready',closed_at=null where engagement_id=tests.id(100);
update public.room_states set live_session_id=null,tv_content='holding' where engagement_id=tests.id(100);
select tests.login(1); set local role authenticated;
select is(tests.ctl(40,'go_live',jsonb_build_object('session',tests.id(602)))->>'status','ok','Go live on Affirm together');
select is(tests.hand(41,'give',jsonb_build_object('attendee',tests.id(503)))->>'status','ok','The lead hands Priya the remote in the room');
select is(public.followup_manage(tests.id(100),'issue',jsonb_build_object('attendee',tests.id(503),'sessions',jsonb_build_array(tests.id(602)),
  'opens_at',now()-interval '1 hour','closes_at',now()+interval '3 hours','token_hash',repeat('1',64),'code_hash',repeat('2',64)))->>'status','ok','And issues Priya follow-up access');
reset role;
set local role service_role; select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is(public.followup_enter(repeat('1',64),repeat('2',64),repeat('a',64))->>'status','ok','Priya enters the code on her phone');
select is(public.followup_take_remote(repeat('a',64))->>'status','ok','Priya takes the remote: the room''s handover was hers, so the follow-up carries it on');
reset role;
select is((select count(*) from tests.team_blocks where ended_at is null),1::bigint,'Still one open block');
select ok((select followup_id is not null and attendee_id=tests.id(503) and holder='team' from tests.team_blocks where ended_at is null),'The open block is now the follow-up''s, still Priya''s');
select is((select remote_holder_id from public.room_states where engagement_id=tests.id(100)),tests.id(503),'Priya holds the remote');
set local role service_role; select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is(public.followup_check(repeat('a',64))->>'holder','team','Her phone reads that she holds it');
select is(public.followup_press(repeat('a',64),tests.id(7042),'phones_down',jsonb_build_object('from',tests.live()))->>'status','ok','Her follow-up remote presses');
reset role;

-- The lead takes it back: the phone is told the lead has it and can ask.
select tests.login(1); set local role authenticated;
select is(tests.hand(43,'take_back')->>'status','ok','The lead takes it back');
reset role;
set local role service_role; select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is(public.followup_take_remote(repeat('a',64))->>'status','lead_has_it','Taking it while the lead has it says so');
reset role;

-- A room handover the lead holds, for a block that is not the follow-up's: lead_has_it, and the phone can ask.
select tests.login(1); set local role authenticated;
select is(tests.hand(44,'end')->>'status','ok','The lead ends that block');
select is(tests.hand(45,'give',jsonb_build_object('attendee',tests.id(505)))->>'status','ok','The lead hands Ben the remote in the room');
select is(tests.hand(46,'take_back')->>'status','ok','And takes it back');
reset role;
set local role service_role; select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is(public.followup_enter(repeat('1',64),repeat('2',64),repeat('b',64))->>'status','ok','Priya enters the code on another phone');
select is(public.followup_take_remote(repeat('b',64))->>'status','lead_has_it','The lead holds the room''s remote: lead_has_it, not busy');
select is(public.followup_check(repeat('b',64))->>'kind','remote','That phone is now the access''s remote');
select is(public.followup_ask(repeat('b',64))->>'status','ok','So it can ask for the remote');
reset role;
select ok((select followup_id is null and attendee_id=tests.id(505) from tests.team_blocks where ended_at is null),'Ben''s block is left as it was');

-- Someone else's block, held by them: busy.
select tests.login(1); set local role authenticated;
select is(tests.hand(47,'give',jsonb_build_object('attendee',tests.id(505)))->>'status','ok','The lead gives Ben the remote again');
reset role;
set local role service_role; select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is(public.followup_take_remote(repeat('b',64))->>'status','busy','Ben holds the room''s own handover: busy');
reset role;
select is((select remote_holder_id from public.room_states where engagement_id=tests.id(100)),tests.id(505),'Ben still holds it');
select ok((select followup_id is null from tests.team_blocks where ended_at is null),'And his block is not taken over');

-- With no block open, taking the remote starts the follow-up's own block, as before.
select tests.login(1); set local role authenticated;
select is(tests.hand(48,'end')->>'status','ok','The lead ends Ben''s block');
reset role;
set local role service_role; select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is(public.followup_take_remote(repeat('b',64))->>'status','ok','Priya takes the remote');
reset role;
select is((select via from tests.team_blocks where ended_at is null),'followup','The block comes from the follow-up access');
set local role authenticated; select tests.login(3);
select throws_ok($$select public.followup_take_remote(repeat('b',64))$$,'42501',null,'A participant still cannot reach the follow-up path');
reset role;

select * from finish();
rollback;
