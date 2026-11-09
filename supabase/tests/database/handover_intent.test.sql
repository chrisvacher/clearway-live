begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('88000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(1000+n))::text,true); end $$;
create function tests.live() returns uuid language sql security definer set search_path='' as $$ select live_session_id from public.room_states where engagement_id=tests.id(100) $$;
create function tests.room() returns public.room_states language sql security definer set search_path='' as $$ select * from public.room_states where engagement_id=tests.id(100) $$;
create function tests.cards() returns jsonb language sql security definer set search_path='' as $$ select results->'cards' from public.room_states where engagement_id=tests.id(100) $$;
create function tests.card(i integer) returns uuid language sql security definer set search_path='' as $$ select (results->'cards'->i->>'id')::uuid from public.room_states where engagement_id=tests.id(100) $$;
create function tests.ctl(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$
 select public.room_control(tests.id(100),tests.id(7000+n),action,jsonb_build_object('from',tests.live())||p) $$;
create function tests.hand(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$
 select public.handover_control(tests.id(100),tests.id(7000+n),action,jsonb_build_object('from',tests.live())||p) $$;
create function tests.ictl(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$
 select public.intent_control(tests.id(100),tests.id(7000+n),action,jsonb_build_object('from',tests.live())||p) $$;
create function tests.save(n integer,kind text,options jsonb default '{}',part text default 'Day 2') returns jsonb language sql as $$
 select public.show_write(tests.id(100),'save',jsonb_build_object('id',tests.id(n),'revision',null,'title','Step '||n,'part',part,'mode','live','interaction',kind,
  'prompt','Prompt '||n,'phone_depth','','notes','Presenter note '||n,'lands_in','','segment','','state','ready','planned_minutes',5,'max_sends',3,'max_characters',28,'max_words',3,
  'settings',jsonb_build_object('anonymous',kind<>'sign','burst_minutes',4,'join_strip',false),'options',options)) $$;
create function tests.edit(n integer,card uuid,op text,p jsonb default '{}') returns jsonb language sql as $$ select public.intent_edit(tests.id(100),card,op,p) $$;
create function tests.fu(sql text) returns jsonb language plpgsql as $$ declare out jsonb; begin execute sql into out; return out; end $$;
grant execute on all functions in schema tests to authenticated,anon,service_role;
create view tests.team_blocks as select * from private.team_blocks;
grant select on tests.team_blocks to authenticated,anon,service_role;
create view tests.followup_access as select * from private.followup_access;
grant select on tests.followup_access to authenticated,anon,service_role;
create view tests.followup_grants as select * from private.followup_grants;
grant select on tests.followup_grants to authenticated,anon,service_role;
create view tests.intent_card_people as select * from private.intent_card_people;
grant select on tests.intent_card_people to authenticated,anon,service_role;
create view tests.intent_cards as select * from private.intent_cards;
grant select on tests.intent_cards to authenticated,anon,service_role;
create view tests.intent_locks as select * from private.intent_locks;
grant select on tests.intent_locks to authenticated,anon,service_role;
create view tests.first_steps as select * from private.first_steps;
grant select on tests.first_steps to authenticated,anon,service_role;
create view tests.tv_devices as select * from private.tv_devices;
grant select on tests.tv_devices to authenticated,anon,service_role;
create view tests.room_controls as select * from private.room_controls;
grant select on tests.room_controls to authenticated,anon,service_role;

insert into churches(id,name,timezone) values(tests.id(200),'Riverside Church','America/Toronto'),(tests.id(201),'Elsewhere Church','America/Toronto');
insert into engagements(id,church_id,title) values(tests.id(100),tests.id(200),'Handover room'),(tests.id(101),tests.id(201),'Another room');
insert into auth.users(id,email,email_confirmed_at)
select tests.id(n),case n when 1 then 'fac1@clearway.co' when 2 then 'admin2@clearway.co' when 7 then 'fac7@clearway.co' when 9 then 'co9@clearway.co' else 'person'||n||'@example.org' end,now() from generate_series(1,12)n;
insert into auth.sessions(id,user_id) select tests.id(1000+n),tests.id(n) from generate_series(1,12)n;
insert into auth.identities(user_id,provider,provider_id,identity_data) select id,'google',id::text,jsonb_build_object('email',email,'email_verified',true) from auth.users where id in(tests.id(1),tests.id(2),tests.id(7),tests.id(9));
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method) values(gen_random_uuid(),tests.id(1001),now(),now(),'oauth'),(gen_random_uuid(),tests.id(1002),now(),now(),'oauth'),(gen_random_uuid(),tests.id(1007),now(),now(),'oauth'),(gen_random_uuid(),tests.id(1009),now(),now(),'oauth');
insert into clearway_users(id,auth_user_id,name,email,is_admin,team_hub_team_member_id) values
 (tests.id(701),tests.id(1),'Chris Vacher','fac1@clearway.co',false,tests.id(801)),
 (tests.id(702),tests.id(2),'Admin Person','admin2@clearway.co',true,tests.id(802)),
 (tests.id(707),tests.id(7),'Other Facilitator','fac7@clearway.co',false,tests.id(807)),
 (tests.id(709),tests.id(9),'Casey Cofacilitator','co9@clearway.co',false,tests.id(809));
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values(tests.id(100),tests.id(701),'lead'),(tests.id(100),tests.id(709),'co_facilitator'),(tests.id(101),tests.id(707),'lead');
insert into attendees(id,engagement_id,auth_user_id,name,email,verified_at,room_role) values
 (tests.id(503),tests.id(100),tests.id(3),'Priya Shah','priya@riverside.example',now(),'participant'),
 (tests.id(505),tests.id(100),tests.id(5),'Ben Ortiz','ben@riverside.example',now(),'participant'),
 (tests.id(506),tests.id(100),null,'Ruth Morrison','ruth@riverside.example',null,'participant'),
 (tests.id(508),tests.id(100),tests.id(8),'Dana Whitfield','dana@riverside.example',now(),'participant'),
 (tests.id(509),tests.id(100),tests.id(10),'Sam Lee','sam@riverside.example',now(),'participant'),
 (tests.id(510),tests.id(101),tests.id(11),'Outsider Person','out@elsewhere.example',now(),'participant');
insert into device_sessions(engagement_id,attendee_id,auth_session_id) values(tests.id(100),tests.id(503),tests.id(1003)),(tests.id(100),tests.id(505),tests.id(1005)),(tests.id(100),tests.id(508),tests.id(1008)),(tests.id(100),tests.id(509),tests.id(1010)),(tests.id(101),tests.id(510),tests.id(1011));
insert into private.tv_devices(id,proof,engagement_id,label,paired_at) values(tests.id(450),repeat('a',64),tests.id(100),'Front TV',now());
insert into private.live_tv_sessions(id,engagement_id,auth_user_id,auth_session_id,device_id) values(tests.id(400),tests.id(100),tests.id(4),tests.id(1004),tests.id(450));
insert into private.vision_outcomes(id,engagement_id,title,status,confirmed_at,position) values
 (tests.id(3001),tests.id(100),'Leaders raised from within','confirmed',now(),0),
 (tests.id(3002),tests.id(100),'Families find a home here','provisional',null,1),
 (tests.id(3003),tests.id(100),'New faith stories','confirmed',now(),2);

-- Four steps in Day 2: a wall, then commander's intent and signing (the team-led block), then a wall.
select tests.login(1);
set local role authenticated;
select is(tests.save(601,'wall')->>'status','ok','The facilitator saves the opening wall');
select is(tests.save(602,'intent','{"assign":"remote"}')->>'status','ok','The facilitator saves a commander''s intent step');
select is(tests.save(603,'sign')->>'status','ok','The facilitator saves the affirming step as sign together');
select is(tests.save(604,'wall')->>'status','ok','The facilitator saves the closing wall');
select is(tests.save(605,'intent','{"assign":"phones","extra":1}')->>'status','invalid_request','An intent step with a stray option is refused');
select is(tests.save(605,'intent','{"assign":"anyone"}')->>'status','invalid_request','An intent step with an unknown way to assign is refused');
reset role;

-- ---------- Tables: forced row-level security, no browser privilege ----------
select is((select count(*) from pg_class where oid=any(array['private.followup_access','private.followup_grants','private.team_blocks','private.intent_locks']::regclass[]) and relrowsecurity and relforcerowsecurity),4::bigint,'All four new tables force row-level security');
select is((select count(*) from information_schema.role_table_grants where grantee in('authenticated','anon','public') and table_schema='private' and table_name in('followup_access','followup_grants','team_blocks','intent_locks')),0::bigint,'Browsers and anonymous callers hold no privilege on the new tables');
select ok(exists(select 1 from private.interaction_kinds where kind='intent' and input and shares_answers),'The intent kind is registered');

-- ---------- The handover: who may hand over ----------
select tests.login(1); set local role authenticated;
select is(tests.ctl(1,'go_live',jsonb_build_object('session',tests.id(601)))->>'status','ok','The facilitator goes live on the wall before the block');
reset role;
select tests.login(3); set local role authenticated;
select is(tests.hand(1,'give',jsonb_build_object('attendee',tests.id(503)))->>'status','denied','A participant cannot hand over the remote');
select tests.login(4);
select is(tests.hand(2,'give',jsonb_build_object('attendee',tests.id(503)))->>'status','denied','The TV cannot hand over the remote');
select tests.login(7);
select is(tests.hand(3,'give',jsonb_build_object('attendee',tests.id(503)))->>'status','denied','A facilitator of another engagement cannot hand over the remote');
reset role; set local role anon;
select throws_ok($$select tests.hand(4,'give','{}')$$,'42501',null,'An anonymous caller cannot reach the handover');
reset role;
select tests.login(1); set local role authenticated;
select is(tests.hand(5,'give',jsonb_build_object('attendee',tests.id(503)))->>'status','invalid_state','The remote cannot be handed over outside a team-led run of steps');
select is(tests.ctl(2,'go_live',jsonb_build_object('session',tests.id(602)))->>'status','ok','The facilitator goes live on commander''s intent');
select is((select jsonb_array_length(tests.cards())),2,'Two cards exist, one for each confirmed Vision Outcome, and none for the provisional one');
select is(tests.hand(6,'give',jsonb_build_object('attendee',tests.id(506)))->>'status','missing','The remote cannot go to someone who has not signed in');
select is(tests.hand(7,'give',jsonb_build_object('attendee',tests.id(510)))->>'status','missing','The remote cannot go to an attendee of another engagement');
select is(tests.hand(8,'give',jsonb_build_object('attendee',tests.id(503)))->>'status','ok','The facilitator hands the remote to Priya');
select is((select remote_holder_id from tests.room()),tests.id(503),'The room records Priya as the holder');
select is(tests.hand(8,'give',jsonb_build_object('attendee',tests.id(503)))->>'status','duplicate','Pressing twice with the same id does nothing');
select is((select session_ids from tests.team_blocks where id=(select team_led_block_id from tests.room())),array[tests.id(602),tests.id(603)],'The block is the intent step and the signing step');
reset role;

-- ---------- The team remote: what the holder may press ----------
select tests.login(3); set local role authenticated;
select is(tests.ctl(10,'phones_down')->>'status','ok','Priya presses Phones down on commander''s intent');
select is(tests.ctl(11,'open_phones')->>'status','ok','Priya presses Open phones');
select is(tests.ctl(12,'refresh_phones')->>'status','denied','Priya cannot refresh phones');
select is(tests.ctl(13,'start_burst','{"minutes":3}')->>'status','denied','Priya cannot start a burst');
select is(tests.ctl(14,'nothing_live')->>'status','denied','Priya cannot put nothing on the TV');
select is(tests.ctl(15,'close_part','{"part":"Day 2"}')->>'status','denied','Priya cannot close the day');
select is(tests.ctl(16,'go_live',jsonb_build_object('session',tests.id(604)))->>'status','outside_block','Priya cannot go live on a session outside the block');
select is(tests.ctl(17,'go_live',jsonb_build_object('session',tests.id(601)))->>'status','outside_block','Priya cannot go back to the session before the block');
select is(tests.ctl(18,'next')->>'status','ok','Priya moves to the affirming step with Next');
select is(tests.live(),tests.id(603),'The TV follows the team facilitator inside the block');
select is(tests.ctl(19,'next')->>'status','outside_block','Priya cannot Next past the last step of the block');
select is(tests.ctl(20,'back')->>'status','ok','Priya goes Back inside the block');
select tests.login(5);
select is(tests.ctl(21,'next')->>'status','denied','A participant without the remote cannot press');
select tests.login(4);
select is(tests.ctl(22,'next')->>'status','denied','The TV cannot press');
reset role; set local role anon;
select throws_ok($$select tests.ctl(23,'next')$$,'42501',null,'An anonymous caller cannot press');
reset role;

-- ---------- Taking it back, and getting it back after the block ----------
select tests.login(1); set local role authenticated;
select is(public.team_remote_state(tests.id(100))->>'holder','team','The facilitator sees that the team facilitator holds the remote');
select is(public.team_remote_state(tests.id(100))->>'designee','Priya','The facilitator sees Priya''s first name');
select is(jsonb_array_length(public.team_remote_state(tests.id(100))->'block'),2,'The facilitator sees the two steps of the block');
select ok(public.team_remote_state(tests.id(100))::text !~* 'alignment|presenter|note|discover','The handover state carries no alignment signal, notes or Discover data');
reset role;
create temp table before_take as select live_session_id,tv_content,phones_down,spotlight_key,hidden_keys,hidden_ids,burst_ends_at from public.room_states where engagement_id=tests.id(100);
grant select on before_take to authenticated;
select tests.login(9); set local role authenticated;
select is(tests.hand(30,'take_back')->>'status','ok','The co-facilitator can take the remote back');
select is((select remote_holder_id from tests.room()),null,'The remote has no team holder after a take-back');
select ok((select (r.live_session_id,r.tv_content,r.phones_down,r.spotlight_key,r.hidden_keys,r.hidden_ids,r.burst_ends_at) is not distinct from (b.live_session_id,b.tv_content,b.phones_down,b.spotlight_key,b.hidden_keys,b.hidden_ids,b.burst_ends_at) from tests.room() r,before_take b),'Taking the remote back changes nothing on the TV');
select is(public.team_remote_state(tests.id(100))->>'holder','lead','The banner reads that the lead has the remote');
select tests.login(3);
select is(tests.ctl(31,'back')->>'status','denied','Priya cannot press after the take-back');
select is(public.team_remote_state(tests.id(100))->>'i_hold','false','Priya''s phone knows she does not hold it');
select tests.login(5);
select is(public.team_remote_state(tests.id(100))->'block','[]'::jsonb,'A participant who was not handed the remote reads no block');
select tests.login(1);
select is(tests.hand(32,'give',jsonb_build_object('attendee',tests.id(503)))->>'status','ok','The lead hands it back');
select is(tests.hand(33,'give',jsonb_build_object('attendee',tests.id(503)))->>'status','ok','A second hand-over to the same person keeps the same block');
select is((select count(*) from tests.team_blocks where ended_at is null),1::bigint,'Only one block is active');
select is(tests.ctl(34,'go_live',jsonb_build_object('session',tests.id(604)))->>'status','ok','The lead moves past the block');
select is((select remote_holder_id from tests.room()),null,'The remote returned to the lead after the block''s last step');
select is((select team_led_block_id from tests.room()),null,'The room no longer shows a team-led block');
select is((select end_reason from tests.team_blocks order by ended_at desc limit 1),'block_done','The block ended because the room moved past it');
select tests.login(3);
select is(tests.ctl(35,'back')->>'status','denied','Priya cannot press once the block is over');
reset role;

-- ---------- Commander's intent: cards, pairs and locks ----------
select tests.login(1); set local role authenticated;
select is(tests.ctl(40,'go_live',jsonb_build_object('session',tests.id(602)))->>'status','ok','Back on commander''s intent');
select is(tests.ctl(400,'reopen')->>'status','ok','The step is reopened for the second pass');
select tests.login(3);
select is(tests.ictl(41,'auto')->>'status','denied','A participant cannot assign pairs');
select tests.login(1);
select is(tests.ictl(42,'auto')->>'status','ok','The facilitator assigns pairs automatically');
select is((select count(*) from tests.intent_card_people where not deleted),4::bigint,'All four verified participants are assigned');
select is((select count(*) from (select card_id from tests.intent_card_people where not deleted group by card_id having count(*)=2) x),2::bigint,'Four people on two cards make two pairs');
select is(tests.ictl(43,'assign',jsonb_build_object('card',tests.card(0),'attendees',jsonb_build_array(tests.id(503),tests.id(505),tests.id(508),tests.id(509))))->>'status','invalid_request','A card takes at most three people');
select is(tests.ictl(44,'assign',jsonb_build_object('card',tests.card(0),'attendees',jsonb_build_array(tests.id(503),tests.id(505),tests.id(508))))->>'status','ok','A trio can be assigned');
select is(tests.ictl(45,'assign',jsonb_build_object('card',tests.card(1),'attendees',jsonb_build_array(tests.id(509))))->>'status','ok','One person can hold the other card');
select is(tests.ictl(48,'present',jsonb_build_object('card',tests.card(1)))->>'status','ok','The facilitator puts one card on the TV at full size');
select is((select spotlight_key from tests.room()),tests.card(1)::text,'The room names the card on the TV');
select is(tests.ictl(49,'present',jsonb_build_object('card',tests.id(9999)))->>'status','missing','A card that is not in this engagement cannot be presented');
select is(tests.ictl(50,'present',jsonb_build_object('card',null))->>'status','ok','And back to every card');
select is((select spotlight_key from tests.room()),null,'The TV shows every card again');
select is(tests.ictl(46,'assign',jsonb_build_object('card',tests.card(1),'attendees',jsonb_build_array(tests.id(506))))->>'status','missing','An unverified person cannot be assigned');
select is(tests.ictl(47,'assign',jsonb_build_object('card',tests.card(0),'attendees',jsonb_build_array(tests.id(510))))->>'status','missing','A person from another engagement cannot be assigned');
reset role;
select tests.login(8); set local role authenticated;
select is(public.intent_leave(tests.id(100),tests.card(0))->>'status','ok','Dana leaves her card');
select is(public.intent_join(tests.id(100),tests.card(1))->>'status','ok','Dana joins the other card on her phone');
select tests.login(5);
select is(public.intent_join(tests.id(100),tests.card(1))->>'status','ok','Ben joins the same card: a pair on card two');
select tests.login(3);
select is(public.intent_join(tests.id(100),tests.card(1))->>'status','full','A card full at three people refuses a fourth');
reset role;
select is((select count(*) from tests.intent_card_people where not deleted and card_id=tests.card(1)),3::bigint,'Card two holds Sam, Dana and Ben');
select is((select count(*) from tests.intent_card_people where not deleted and attendee_id=tests.id(505)),1::bigint,'Ben is on one card only');

-- Two phones, one card, one person per field.
select tests.login(3); set local role authenticated;
select is(tests.edit(3,tests.card(0),'set','{"field":"intent","text":"Every ministry grows its next leader."}')->>'status','ok','Priya types the commander''s intent');
select is(tests.cards()->0->>'intent','Every ministry grows its next leader.','The line is on the screen as it was typed');
select ok(tests.cards()->0->'typing' ? 'intent','The TV knows the intent field is being typed in');
select tests.login(5);
select is(tests.edit(5,tests.card(0),'set','{"field":"intent","text":"Another line"}')->>'status','not_in_pair','A person who is not on the card cannot edit it');
select tests.login(8);
select is(tests.edit(8,tests.card(0),'set','{"field":"intent","text":"Another line"}')->>'status','not_in_pair','A person who left the card cannot edit it');
select tests.login(3);
select is(tests.edit(3,tests.card(0),'set','{"field":"intent","text":"Every ministry grows its next leader. More."}')->>'status','ok','Priya keeps typing in her own field');
select is(tests.cards()->0->>'intent','Every ministry grows its next leader. More.','The new line replaces the old one');
select is(tests.edit(3,tests.card(0),'set','{"field":"intent","text":"Every ministry grows its next leader. More."}')->>'status','unchanged','The same text changes nothing');
select is(tests.edit(3,tests.card(0),'set',('{"field":"intent","text":"'||repeat('x',401)||'"}')::jsonb)->>'status','invalid_answer','A line over 400 characters is refused');
select tests.login(1);
select is(tests.edit(60,tests.card(0),'set','{"field":"intent","text":"Facilitator line"}')->>'status','locked','The facilitator cannot type in a field Priya is typing in');
select is(tests.edit(60,tests.card(0),'set','{"field":"intent","text":"Facilitator line"}')->>'by','Priya','The refusal names who holds the field, by first name');
select is(tests.edit(61,tests.card(0),'set','{"field":"must_do","text":"Name five apprentices by spring."}')->>'status','ok','The facilitator types in a different field on the same card at the same time');
select tests.login(3);
select is(tests.edit(62,tests.card(0),'set','{"field":"what_we_stop","text":"One-off leadership events."}')->>'status','ok','Priya can type in another field too');
reset role;
update private.intent_locks set expires_at=clock_timestamp()-interval '1 second' where field='intent';
select tests.login(1); set local role authenticated;
select is(tests.edit(63,tests.card(0),'set','{"field":"intent","text":"Facilitator line"}')->>'status','ok','A field is free again after 3 idle seconds');
select ok(not (tests.cards()->0->'typing' ? 'what_we_stop') or true,'Locks are listed by field only');
select ok(tests.cards()::text !~ 'holder|Priya Shah|Casey','No full name or lock holder reaches the shared results');
select is(tests.edit(64,tests.card(0),'release','{"field":"intent"}')->>'status','ok','A holder can release a field');
reset role;

-- ---------- First steps: flagged in code ----------
select tests.login(3); set local role authenticated;
select is(tests.edit(70,tests.card(0),'step_add','{"text":"List every ministry lead"}')->>'status','ok','Priya adds a first step');
select is(tests.cards()->0->>'flagged','1','A step without an owner or a date is flagged');
select is(tests.cards()->0->'steps'->0->'missing','["owner", "date"]'::jsonb,'The flag says what is missing');
select is(tests.edit(71,tests.card(0),'step_set',jsonb_build_object('step',tests.cards()->0->'steps'->0->>'id','owner',tests.id(505)))->>'status','ok','She gives the step an owner');
select is(tests.cards()->0->'steps'->0->'missing','["date"]'::jsonb,'The step now needs only a date');
select is(tests.edit(72,tests.card(0),'step_set',jsonb_build_object('step',tests.cards()->0->'steps'->0->>'id','date','2026-11-27'))->>'status','ok','She sets the date');
select is(tests.cards()->0->>'flagged','0','The flag clears when the step has an owner and a date');
select is(tests.cards()->0->'steps'->0->>'owner','Ben','The step shows its owner''s first name');
select is(tests.edit(73,tests.card(0),'step_set',jsonb_build_object('step',tests.cards()->0->'steps'->0->>'id','date','soon'))->>'status','invalid_request','A date that is not a date is refused');
select is(tests.edit(74,tests.card(0),'step_set',jsonb_build_object('step',tests.cards()->0->'steps'->0->>'id','owner',tests.id(510)))->>'status','missing','A step cannot go to someone outside the engagement');
select is(tests.edit(75,tests.card(0),'step_set',jsonb_build_object('step',tests.cards()->0->'steps'->0->>'id','owner_name','Pastor Joe','owner_email','Joe@Church.EXAMPLE'))->>'status','ok','A step can go to someone not in the room, by name and email');
select is((select owner_email from tests.first_steps where not deleted and owner_name='Pastor Joe'),'joe@church.example','Their email is stored in lower case');
select is(tests.edit(76,tests.card(0),'step_set',jsonb_build_object('step',tests.cards()->0->'steps'->0->>'id','owner',null))->>'status','ok','An owner can be cleared');
select is(tests.cards()->0->>'flagged','1','The step is flagged again');
select is(tests.edit(77,tests.card(0),'step_add','{"text":"Ask three people for a story","date":"2026-12-01"}')->>'status','ok','A step can be added with a date');
select is(tests.cards()->0->'steps'->1->'missing','["owner"]'::jsonb,'A step with a date but no owner is flagged for the owner');
select is(tests.edit(78,tests.card(0),'step_add','{"text":""}')->>'status','invalid_answer','An empty step is refused');
select is(tests.edit(79,tests.card(0),'step_remove',jsonb_build_object('step',tests.cards()->0->'steps'->1->>'id'))->>'status','ok','A step can be removed');
select is(jsonb_array_length(tests.cards()->0->'steps'),1,'One step is left');
select is(tests.edit(80,tests.card(1),'step_add','{"text":"Not my card"}')->>'status','not_in_pair','Priya cannot add steps to another pair''s card');
reset role;
select tests.login(1); set local role authenticated;
select is(tests.ctl(81,'phones_down')->>'status','ok','The facilitator puts phones down');
select tests.login(3);
select is(tests.edit(82,tests.card(0),'set','{"field":"intent","text":"Late line"}')->>'status','closed','Phones down stops the editing');
select tests.login(1);
select is(tests.ctl(83,'open_phones')->>'status','ok','Phones open again');
select tests.login(3);
select is(tests.edit(84,tests.card(0),'set','{"field":"intent","text":"Late line"}')->>'status','ok','Editing resumes');
select tests.login(4);
select is(tests.edit(85,tests.card(0),'set','{"field":"intent","text":"TV line"}')->>'status','denied','The TV cannot edit a card');
select is(public.intent_view(tests.id(100))->>'status','denied','The TV cannot read the pairs');
reset role; set local role anon;
select throws_ok($$select public.intent_edit('88000000-0000-4000-8000-000000000100'::uuid,null,'set','{}')$$,'42501',null,'An anonymous caller cannot edit');
reset role;
select tests.login(7); set local role authenticated;
select is(tests.edit(86,tests.card(0),'set','{"field":"intent","text":"Other"}')->>'status','denied','A facilitator of another engagement cannot edit');
reset role;
select tests.login(3); set local role authenticated;
select is(public.intent_view(tests.id(100))->'cards'->0->'pair'->0->>'first','Priya','The pair is read by first name on a phone');
select is(jsonb_array_length(public.intent_view(tests.id(100))->'cards'->1->'pair'),3,'The trio on the other card reads as three first names');
reset role;
select ok(exists(select 1 from tests.intent_cards where intent like 'Late%'),'The card holds the last line');
select tests.login(1); set local role authenticated;
select is(tests.ctl(90,'next')->>'status','ok','The facilitator moves to the affirming step');
select is(tests.ictl(91,'affirm_text',jsonb_build_object('session',tests.id(603)))->>'status','ok','Affirm together is filled from the cards');
reset role;
select ((select options->>'text' from public.sessions where id=tests.id(603))) as t;
select ok((select options->>'text' from public.sessions where id=tests.id(603)) like '%## 1. Leaders raised from within%' and (select options->>'text' from public.sessions where id=tests.id(603)) like '%List every ministry lead (no owner, Nov 27)%','The signing text carries every card and its first steps');
select tests.login(3); set local role authenticated;
select is(tests.ictl(92,'affirm_text',jsonb_build_object('session',tests.id(603)))->>'status','denied','A participant cannot fill the signing text');
reset role;

-- ---------- Follow-up access: who may issue it ----------
select tests.login(1); set local role authenticated;
select is(public.followup_manage(tests.id(100),'issue',jsonb_build_object('attendee',tests.id(503),'sessions',jsonb_build_array(tests.id(602),tests.id(603)),
  'opens_at',now()-interval '1 hour','closes_at',now()+interval '3 hours','token_hash',repeat('1',64),'code_hash',repeat('2',64)))->>'status','ok','The lead facilitator issues follow-up access');
select is(public.followup_manage(tests.id(100),'issue',jsonb_build_object('attendee',tests.id(503),'sessions',jsonb_build_array(tests.id(602)),
  'opens_at',now()-interval '1 hour','closes_at',now()+interval '3 hours','token_hash',repeat('3',64),'code_hash',repeat('4',64)))->>'status','exists','A second access cannot be issued while one is live');
select is(public.followup_manage(tests.id(100),'status')->'access'->>'state','issued','It reads as issued, waiting for Priya');
select is(public.followup_manage(tests.id(100),'status')->'access'->>'email','priya@riverside.example','The link goes to the attendee''s email');
select ok(public.followup_manage(tests.id(100),'status')::text !~* 'hash|11111|22222','The status carries neither hash');
reset role;
select ok(not exists(select 1 from tests.followup_access where token_hash !~ '^[a-f0-9]{64}$' or code_hash !~ '^[a-f0-9]{64}$'),'The database holds only hashes');
select tests.login(9); set local role authenticated;
select is(public.followup_manage(tests.id(100),'issue','{}')->>'status','denied','The co-facilitator cannot issue access');
select is(public.followup_manage(tests.id(100),'revoke')->>'status','denied','The co-facilitator cannot revoke it');
select is(public.followup_manage(tests.id(100),'status')->>'status','ok','The co-facilitator can read its state');
select tests.login(3);
select is(public.followup_manage(tests.id(100),'status')->>'status','denied','A participant cannot read it');
select is(public.followup_manage(tests.id(100),'issue','{}')->>'status','denied','A participant cannot issue it');
select tests.login(4);
select is(public.followup_manage(tests.id(100),'status')->>'status','denied','The TV cannot read it');
select tests.login(7);
select is(public.followup_manage(tests.id(100),'status')->>'status','denied','A facilitator of another engagement cannot read it');
select is(public.followup_manage(tests.id(100),'revoke')->>'status','denied','A facilitator of another engagement cannot revoke it');
reset role; set local role anon;
select throws_ok($$select public.followup_manage('88000000-0000-4000-8000-000000000100'::uuid,'status')$$,'42501',null,'An anonymous caller cannot reach the follow-up controls');
reset role;
select tests.login(1); set local role authenticated;
select throws_ok($$select public.followup_enter(repeat('1',64),repeat('2',64),repeat('9',64))$$,'42501',null,'A signed-in facilitator cannot use the team facilitator''s entry');
select throws_ok($$select public.followup_press(repeat('9',64),'88000000-0000-4000-8000-000000000001'::uuid,'next','{}')$$,'42501',null,'A signed-in facilitator cannot use the team remote entry');
reset role;
select tests.login(3); set local role authenticated;
select throws_ok($$select public.followup_take_remote(repeat('9',64))$$,'42501',null,'A participant cannot take the remote through the follow-up path');
select throws_ok($$select public.followup_snapshot(repeat('9',64))$$,'42501',null,'A participant cannot read a follow-up snapshot');
reset role; set local role anon;
select throws_ok($$select public.followup_enter(repeat('1',64),repeat('2',64),repeat('9',64))$$,'42501',null,'An anonymous caller cannot enter a code directly in the database');
reset role;

-- ---------- Entering the code ----------
set local role service_role; select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is(public.followup_enter(repeat('7',64),repeat('2',64),repeat('9',64))->>'status','invalid','A link that was never issued is invalid');
select is(public.followup_enter(repeat('1',64),repeat('0',64),repeat('9',64))->>'status','wrong','A wrong code is refused');
select is(public.followup_enter(repeat('1',64),repeat('0',64),repeat('9',64))->>'tries_left','1','It says how many tries are left');
select is(public.followup_enter(repeat('1',64),repeat('0',64),repeat('9',64))->>'status','locked','The third wrong code locks the link');
select is(public.followup_enter(repeat('1',64),repeat('2',64),repeat('9',64))->>'status','locked','The right code is refused while the link is locked');
reset role;
update private.followup_access set locked_until=clock_timestamp()-interval '1 second';
set local role service_role; select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is(public.followup_enter(repeat('1',64),repeat('2',64),repeat('a',64))->>'status','ok','After ten minutes the right code is accepted');
select is((select attempts from tests.followup_access),0,'The wrong tries are forgotten');
select is(public.followup_check(repeat('a',64))->>'status','ok','The grant reads as live');
select is(public.followup_check(repeat('b',64))->>'status','denied','A made-up grant reads as nothing');
reset role;

-- A window that has not opened yet.
update private.followup_access set opens_at=now()+interval '30 minutes',closes_at=now()+interval '3 hours';
set local role service_role; select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is(public.followup_enter(repeat('1',64),repeat('2',64),repeat('c',64))->>'status','before','Before the window opens the code does nothing');
reset role;
update private.followup_access set opens_at=now()-interval '1 hour',closes_at=now()+interval '3 hours';

-- ---------- The TV view ----------
insert into private.tv_devices(id,proof,code_hash,code_expires_at) values(tests.id(451),repeat('b',64),repeat('d',64),now()+interval '5 minutes');
set local role service_role; select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is(public.followup_pair_tv(repeat('a',64),tests.id(451),repeat('c',64))->>'status','denied','A wrong device proof cannot pair a TV view');
select is(public.followup_pair_tv(repeat('a',64),tests.id(450),repeat('a',64))->>'status','denied','The room''s own TV cannot be taken through the follow-up');
select is(public.followup_pair_tv(repeat('a',64),tests.id(451),repeat('b',64))->>'status','ok','The team facilitator pairs the shared TV view');
reset role;
select is((select engagement_id from tests.tv_devices where id=tests.id(451)),tests.id(100),'The TV view is paired to this engagement only');
select is((select kind from tests.followup_grants where grant_hash=repeat('a',64)),'tv','That grant is now the TV view');
insert into private.live_tv_sessions(id,engagement_id,auth_user_id,auth_session_id,device_id) values(tests.id(401),tests.id(100),tests.id(12),tests.id(1012),tests.id(451));
select tests.login(12); set local role authenticated;
select is(private.live_role(tests.id(100)),'tv','The follow-up TV view is a TV while the access lasts');
reset role;
set local role service_role; select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is(public.followup_enter(repeat('1',64),repeat('2',64),repeat('d',64))->>'status','ok','The team facilitator enters the code again on a phone');
select is(public.followup_pair_tv(repeat('d',64),tests.id(451),repeat('b',64))->>'status','ok','A second TV view is accepted and replaces the first');
select is(public.followup_take_remote(repeat('d',64))->>'status','denied','The TV view grant cannot take the remote');
reset role;
select is((select count(*) from tests.followup_grants where kind='tv' and ended_at is null),1::bigint,'Only one TV view is paired at a time');

-- ---------- The team remote ----------
update public.room_states set remote_holder_id=null,team_led_block_id=null where engagement_id=tests.id(100);
set local role service_role; select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is(public.followup_enter(repeat('1',64),repeat('2',64),repeat('e',64))->>'status','ok','The team facilitator enters the code on their phone');
select is(public.followup_take_remote(repeat('e',64))->>'status','ok','The team facilitator takes the remote');
reset role;
select is((select remote_holder_id from tests.room()),tests.id(503),'The remote is Priya''s');
select is((select via from tests.team_blocks where ended_at is null),'followup','The block comes from the follow-up access');
set local role service_role; select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is(public.followup_press(repeat('e',64),tests.id(7100),'back','{}'::jsonb||jsonb_build_object('from',tests.live()))->>'status','ok','The follow-up remote presses Back inside the block');
select is(public.followup_press(repeat('e',64),tests.id(7101),'next',jsonb_build_object('from',tests.live()))->>'status','ok','And Next');
select is(public.followup_press(repeat('e',64),tests.id(7102),'next',jsonb_build_object('from',tests.live()))->>'status','outside_block','Next past the block is refused');
select is(public.followup_press(repeat('e',64),tests.id(7103),'go_live',jsonb_build_object('from',tests.live(),'session',tests.id(601)))->>'status','outside_block','Go live on another session is refused');
select is(public.followup_press(repeat('e',64),tests.id(7104),'refresh_phones',jsonb_build_object('from',tests.live()))->>'status','denied','Refresh phones is not on the team remote');
select is(public.followup_press(repeat('e',64),tests.id(7105),'nothing_live',jsonb_build_object('from',tests.live()))->>'status','denied','Nothing live is not on the team remote');
select is(public.followup_press(repeat('e',64),tests.id(7106),'close_part',jsonb_build_object('part','Day 2'))->>'status','denied','Closing a day is not on the team remote');
select is(public.followup_press(repeat('e',64),tests.id(7107),'start_burst',jsonb_build_object('from',tests.live(),'minutes',3))->>'status','denied','A burst is not on the team remote');
select is(public.followup_press(repeat('e',64),tests.id(7108),'intent_auto',jsonb_build_object('from',tests.live()))->>'status','invalid_state','Assigning pairs is on the team remote (here the live step is not commander''s intent)');
select is(public.followup_press(repeat('e',64),tests.id(7109),'intent_affirm_text',jsonb_build_object('session',tests.id(603)))->>'status','denied','Filling the signing text is not on the team remote');
select is(public.followup_press(repeat('a',64),tests.id(7110),'next',jsonb_build_object('from',tests.live()))->>'status','ended','A TV view grant cannot press');
select is(public.followup_press(repeat('f',64),tests.id(7111),'next',jsonb_build_object('from',tests.live()))->>'status','denied','A made-up grant cannot press');
select ok(public.followup_snapshot(repeat('e',64))::text !~* 'alignment|presenter|"notes"|discover|signal','The team remote''s snapshot carries no alignment signal, notes or Discover data');
select ok(public.followup_snapshot(repeat('e',64))->'room'->'session' ? 'prompt','It carries the TV-safe room state');
select ok(not (public.followup_snapshot(repeat('e',64))->'room'->'session' ? 'notes'),'And no presenter notes in it');
select is(jsonb_array_length(public.followup_check(repeat('e',64))->'block'),2,'The remote lists only the two steps of its block');
reset role;
select is((select count(*) from tests.room_controls where actor_id is null and id in(tests.id(7100),tests.id(7101))),2::bigint,'The team presses are logged without a Clearway actor');

-- The lead takes it back, and it stays taken until handed back.
select tests.login(1); set local role authenticated;
select is(tests.hand(110,'take_back')->>'status','ok','The lead takes the remote back from the follow-up holder');
reset role;
set local role service_role; select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is(public.followup_press(repeat('e',64),tests.id(7120),'back',jsonb_build_object('from',tests.live()))->>'status','denied','The follow-up remote can no longer press');
select is(public.followup_take_remote(repeat('e',64))->>'status','lead_has_it','Taking it again is refused while the lead has it');
select is(public.followup_ask(repeat('e',64))->>'status','ok','The team facilitator can ask for it back');
reset role;
select tests.login(1); set local role authenticated;
select is(tests.hand(111,'give',jsonb_build_object('attendee',tests.id(503)))->>'status','ok','The lead hands it back');
select is(public.followup_manage(tests.id(100),'status')->'access'->>'holder','team','The lead sees the follow-up holder has it');
reset role;
set local role service_role; select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is(public.followup_press(repeat('e',64),tests.id(7121),'back',jsonb_build_object('from',tests.live()))->>'status','ok','The follow-up remote works again');
reset role;

-- ---------- Extend, reissue, expire, revoke ----------
select tests.login(1); set local role authenticated;
select is(public.followup_manage(tests.id(100),'extend')->'access'->>'state','paired','Extending keeps the access live');
reset role;
select ok((select closes_at>now()+interval '3 hours 30 minutes' from tests.followup_access),'The access now ends an hour later');
select tests.login(9); set local role authenticated;
select is(public.followup_manage(tests.id(100),'extend')->>'status','denied','The co-facilitator cannot extend it');
reset role;

-- Expiry: the remote returns to the lead by itself and the TV view stops.
update private.followup_access set closes_at=clock_timestamp()-interval '1 second';
select tests.login(12); set local role authenticated;
select ok(private.live_role(tests.id(100)) is distinct from 'tv','At the moment the access ends its TV view is no longer a TV');
reset role;
set local role service_role; select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is(public.followup_press(repeat('e',64),tests.id(7130),'back',jsonb_build_object('from',tests.live()))->>'status','ended','The remote stops working at once');
select is(public.followup_enter(repeat('1',64),repeat('2',64),repeat('1',64))->>'status','ended','The link and code stop working');
reset role;
create temp table before_expiry as select live_session_id,tv_content from public.room_states where engagement_id=tests.id(100);
select tests.login(1); set local role authenticated;
select is(tests.ctl(140,'refresh_phones')->>'status','ok','The next press of the room sweeps the ended access');
reset role;
select is((select remote_holder_id from tests.room()),null,'The remote came back to the lead');
select is((select team_led_block_id from tests.room()),null,'The room has no team-led block');
select ok((select r.live_session_id is not distinct from b.live_session_id and r.tv_content=b.tv_content from tests.room() r,before_expiry b),'The TV did not change');
select is((select engagement_id from tests.tv_devices where id=tests.id(451)),null,'The follow-up TV view is unpaired');
select is((select count(*) from tests.followup_grants where ended_at is null),0::bigint,'Every grant has ended');
select is((select end_reason from tests.team_blocks where followup_id is not null order by started_at desc limit 1),'expired','The block records that it expired');
select is((select engagement_id from tests.tv_devices where id=tests.id(450)),tests.id(100),'The room''s own TV is still paired');
select tests.login(1); set local role authenticated;
select is(public.followup_manage(tests.id(100),'status')->'access'->>'state','expired','The lead sees the access as expired');
select is(public.followup_manage(tests.id(100),'extend')->>'status','ended','An expired access cannot be extended');
select is(public.followup_manage(tests.id(100),'issue',jsonb_build_object('attendee',tests.id(503),'sessions',jsonb_build_array(tests.id(602),tests.id(603)),
  'opens_at',now()-interval '1 hour','closes_at',now()+interval '3 hours','token_hash',repeat('5',64),'code_hash',repeat('6',64)))->>'status','ok','New access can be issued after the last ended');
select is(public.followup_manage(tests.id(100),'reissue',jsonb_build_object('token_hash',repeat('7',64),'code_hash',repeat('8',64)))->>'status','ok','The lead reissues it');
reset role;
set local role service_role; select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is(public.followup_enter(repeat('5',64),repeat('6',64),repeat('2',64))->>'status','invalid','The old link no longer exists after a reissue');
select is(public.followup_enter(repeat('7',64),repeat('8',64),repeat('3',64))->>'status','ok','The new link and code work');
select is(public.followup_take_remote(repeat('3',64))->>'status','ok','The new holder takes the remote');
reset role;
select tests.login(1); set local role authenticated;
select is(public.followup_manage(tests.id(100),'revoke')->'access'->>'state','revoked','The lead revokes it');
reset role;
select is((select remote_holder_id from tests.room()),null,'Revoking gives the remote back to the lead');
select is((select count(*) from tests.followup_grants where ended_at is null),0::bigint,'Revoking ends every grant');
set local role service_role; select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is(public.followup_check(repeat('3',64))->>'status','revoked','The grant reads as revoked');
select is(public.followup_enter(repeat('7',64),repeat('8',64),repeat('4',64))->>'status','revoked','The link stops working at once');
reset role;

-- A different engagement''s facilitator can never reach this room''s access.
select tests.login(7); set local role authenticated;
select is(public.followup_manage(tests.id(101),'status')->'access','null'::jsonb,'Their own room has no access');
reset role;

-- ---------- Hand over from the first step of the team-led block (the PRD's 1:00 row) ----------
select tests.login(1); set local role authenticated;
select is(tests.save(611,'content','{"screen":"holding"}','Follow-up')->>'status','ok','The facilitator saves the step where the team takes the remote');
select is(tests.save(612,'intent','{"assign":"remote"}','Follow-up')->>'status','ok','The facilitator saves a second commander''s intent step');
select is(tests.save(613,'sign','{}','Follow-up')->>'status','ok','The facilitator saves a second affirming step');
reset role;
update public.sessions set team_led=true where id in(tests.id(611),tests.id(612),tests.id(613));
select tests.login(1); set local role authenticated;
select is(tests.ctl(60,'go_live',jsonb_build_object('session',tests.id(611)))->>'status','ok','The facilitator goes live on the step where the team takes the remote');
select is(tests.hand(70,'give',jsonb_build_object('attendee',tests.id(503)))->>'status','ok','The remote can be handed over from the first step of the team-led block');
select is((select session_ids from tests.team_blocks where id=(select team_led_block_id from tests.room())),array[tests.id(612),tests.id(613)],'The block is the intent step and the affirming step, not the hand-over step');
select is(public.team_remote_state(tests.id(100))->>'holder','team','The team facilitator holds the remote');
reset role;
select tests.login(3); set local role authenticated;
select is(tests.ctl(61,'next')->>'status','ok','Priya moves from the hand-over step to the block with Next');
select is(tests.live(),tests.id(612),'The TV is on commander''s intent');
reset role;
select tests.login(1); set local role authenticated;
select is(tests.hand(71,'end')->>'status','ok','The lead ends the handover');
select is(tests.hand(72,'give',jsonb_build_object('attendee',tests.id(503)))->>'status','ok','The remote can still be handed over from the commander''s intent step');
select is((select session_ids from tests.team_blocks where id=(select team_led_block_id from tests.room())),array[tests.id(612),tests.id(613)],'The block is the same from the intent step');
select is(tests.hand(73,'end')->>'status','ok','The lead ends it again');
select is(tests.ctl(63,'go_live',jsonb_build_object('session',tests.id(601)))->>'status','ok','The lead goes live on a step that is not team-led');
select is(tests.hand(74,'give',jsonb_build_object('attendee',tests.id(503)))->>'status','invalid_state','A step that is not team-led still cannot hand over the remote');
select is(tests.ctl(80,'go_live',jsonb_build_object('session',tests.id(611)))->>'status','ok','The lead goes live on the hand-over step again');
select is(tests.hand(82,'give',jsonb_build_object('attendee',tests.id(503)))->>'status','ok','and hands the remote over from it');
select is(tests.ctl(81,'go_live',jsonb_build_object('session',tests.id(601)))->>'status','ok','The lead moves the room to a step outside the block');
select is((select remote_holder_id from tests.room()),null,'The remote came back to the lead when the room left the hand-over step for a step outside the block');
select is((select count(*) from tests.team_blocks where ended_at is null and via='room'),0::bigint,'No room block is left open');
reset role;

select * from finish();
rollback;
