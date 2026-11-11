begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('81000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.payload(n integer,eng integer default 10) returns jsonb language sql immutable as $$
  select jsonb_build_object('engagement',tests.id(eng),'device',tests.id(100+n),'proof',lpad(n::text,64,'a'),
    'device_code',repeat('A',7)||chr(64+n),'rate_email',lpad('e'||n,64,'a'),
    'rate_device',lpad('d'||n,64,'a'),'rate_ip',lpad('f'||n,64,'a'))
$$;
create function tests.login(n integer,sid integer default null) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'session_id',tests.id(coalesce(sid,200+n)),'role','authenticated','user_metadata',jsonb_build_object('is_admin',true))::text,true);
end $$;
grant usage on schema tests to service_role,authenticated,anon;
grant execute on all functions in schema tests to service_role,authenticated,anon;
insert into churches(id,name,timezone) values(tests.id(20),'Room A church','America/Toronto'),(tests.id(21),'Room B church','America/Toronto');
insert into engagements(id,church_id,title,status) values(tests.id(10),tests.id(20),'Room A','pre_call'),(tests.id(11),tests.id(21),'Room B','retreat');
insert into auth.users(id,email,email_confirmed_at) values(tests.id(1),'ann@example.org',now()),(tests.id(2),'fac@clearway.co',now()),(tests.id(3),'other@clearway.co',now()),(tests.id(4),'unassigned@clearway.co',now());
insert into auth.identities(user_id,provider,provider_id,identity_data)
select id,'google',id::text,jsonb_build_object('email',email,'email_verified',true) from auth.users where id in(tests.id(2),tests.id(3),tests.id(4));
insert into auth.sessions(id,user_id) values(tests.id(201),tests.id(1)),(tests.id(202),tests.id(2)),(tests.id(203),tests.id(3)),(tests.id(204),tests.id(4)),(tests.id(211),tests.id(1));
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method)
select gen_random_uuid(),id,now(),now(),case when user_id=tests.id(1) then 'otp' else 'oauth' end from auth.sessions where id in(tests.id(201),tests.id(202),tests.id(203),tests.id(204),tests.id(211));
insert into clearway_users(id,auth_user_id,name,email,team_hub_team_member_id)
select tests.id(300+n),tests.id(n),'Facilitator '||n,case n when 2 then 'fac@clearway.co' when 3 then 'other@clearway.co' else 'unassigned@clearway.co' end,tests.id(400+n) from generate_series(2,4)n;
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values(tests.id(10),tests.id(302),'lead'),(tests.id(11),tests.id(303),'lead');
insert into attendees(id,engagement_id,name,email) values(tests.id(30),tests.id(10),'Ann Lee','ann@example.org'),(tests.id(31),tests.id(11),'Other person','other@example.org');

update engagements set how_the_room_decides='We decide by consensus.';
update clearway_users set is_admin=true where id=tests.id(304);
update engagements set type='team_workshop' where id=tests.id(11);
select ok(not has_function_privilege('anon','public.joining_save(uuid,jsonb)','execute'),'Anyone not signed in cannot save joining');
select ok(not has_function_privilege('anon','public.room_code_renew(uuid)','execute'),'Anyone not signed in cannot renew a room code');
select ok(not has_function_privilege('authenticated','public.tv_room_link(text)','execute'),'A browser cannot resolve room links itself');
set local role authenticated;
select tests.login(1);
select throws_ok($$select public.joining_save(tests.id(10),'{"link_name":"rooma"}')$$,'42501',null,'A participant cannot save joining');
select throws_ok($$select public.room_code_renew(tests.id(10))$$,'42501',null,'A participant cannot renew the room code');
select tests.login(3);
select throws_ok($$select public.joining_save(tests.id(10),'{"link_name":"rooma"}')$$,'42501',null,'A facilitator of another engagement cannot save joining');
select tests.login(2);
select is(public.joining_save(tests.id(10),'{"link_name":"Room-A Church"}')->>'link_name','roomachurch','The lead sets a link name, kept as lower case letters and digits');
select is(public.joining_save(tests.id(10),'{"link_name":"ab"}')->>'status','invalid_name','A name under three characters is refused');
select is(public.joining_save(tests.id(10),'{"link_name":"abcdef12"}')->>'status','invalid_name','A name shaped like a generated room code is refused');
select is(public.joining_save(tests.id(10),'{"link_name":"practice"}')->>'status','reserved_name','The practice room keeps its name');
select is(public.joining_save(tests.id(10),'{"link_name":"setup"}')->>'status','reserved_name','A page of the app is not a link name');
select is(public.joining_save(tests.id(10),'{"how_the_room_decides":"By consensus, together.","neutral_join_message":true}')->>'status','ok','How the room decides and the neutral message save together');
select is(public.joining_save(tests.id(10),'{"open_join":true}')->>'status','workshop_only','Open joining stays a team workshop setting');
select is(public.joining_save(tests.id(10),'{"open_join":"yes"}')->>'status','invalid_request','Open joining takes true or false');
select tests.login(3);
select is(public.joining_save(tests.id(11),'{"link_name":"roomachurch"}')->>'status','taken_name','A name another engagement holds is taken');
select throws_ok($$select public.joining_save(tests.id(11),'{"open_join":true}')$$,'42501',null,'A facilitator who is not an admin cannot turn open joining on');
select tests.login(4);
select is(public.joining_save(tests.id(11),'{"open_join":true,"link_name":"roomb"}')->>'status','ok','An admin turns open joining on for a team workshop and names its link');
reset role;
select is((select link_name from engagements where id=tests.id(10)),'roomachurch','The link name is stored');
select is((select how_the_room_decides from engagements where id=tests.id(10)),'By consensus, together.','How the room decides is stored');
select is((select settings->>'neutral_join_message' from engagements where id=tests.id(10)),'true','The neutral message setting is stored');
select is((select settings->>'open_join' from engagements where id=tests.id(11)),'true','Open joining is stored');
select is(private.tv_room_link('roomachurch'),tests.id(10),'The chosen name opens its room');
select is(private.tv_room_link('ROOMACHURCH'),tests.id(10),'In any case');
select is(private.tv_room_link((select room_code from engagements where id=tests.id(10))),tests.id(10),'The generated code still opens it');
select is(private.tv_room_link('nosuchroom'),null,'An unknown name opens nothing');
select throws_ok($$update engagements set link_name='Bad Name' where id=tests.id(10)$$,'23514',null,'The table refuses a malformed name');
select throws_ok($$update engagements set link_name='roomb' where id=tests.id(10)$$,'23505',null,'The table refuses a duplicate name');
set local role authenticated;
select tests.login(2);
select is(public.joining_save(tests.id(10),'{"link_name":""}')->>'status','ok','Clearing the name goes back to the generated code');
select isnt(public.room_code_renew(tests.id(10))->>'room_code',null,'The lead makes a new room code');
reset role;
select is((select link_name from engagements where id=tests.id(10)),null,'The name is cleared');
select ok((select room_code ~ '^[A-F0-9]{8}$' from engagements where id=tests.id(10)),'The new code has the generated shape');
select * from finish();
rollback;
