begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('8b000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
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
update engagements set how_the_room_decides='We decide by consensus.';
update clearway_users set is_admin=true where id=tests.id(304);
insert into engagements(id,church_id,title,type) values('90000000-0000-4000-8000-000000000010',tests.id(20),'Permanent practice','practice');
create function tests.church_body() returns jsonb language sql as $$ select '{"name":"Room A church","timezone":"America/Toronto","values":["Faithfulness"],"leadership_rhythms":["Weekly"]}'::jsonb $$;
create function tests.body(skin text default null,type text default 'wayfinding') returns jsonb language sql as $$
  select jsonb_build_object('title','Room A','type',type,'status','pre_call','base_year',2030,'lens_names',jsonb_build_array('Congregation','Community','Leadership','Operations','Learning'),
   'how_the_room_decides','We decide by consensus.','settings',jsonb_build_object('room_size','very_small'))||case when skin is null then '{}'::jsonb else jsonb_build_object('skin',skin) end $$;
grant execute on function tests.church_body(),tests.body(text,text) to authenticated;

-- Default and constraint
select is((select skin from engagements where id=tests.id(10)),'clearway','A new engagement is a Clearway engagement');
select is((select data_type||'/'||is_nullable||'/'||column_default from information_schema.columns where table_schema='public' and table_name='engagements' and column_name='skin'),'text/NO/''clearway''::text','The skin is required text that defaults to clearway');
select throws_ok($$update engagements set skin='other' where id=tests.id(10)$$,'23514',null,'The table refuses a skin that is not clearway or novetera');
select throws_ok($$update engagements set skin=null where id=tests.id(10)$$,'23502',null,'The table refuses an empty skin');
select lives_ok($$update engagements set skin='novetera' where id=tests.id(11); update engagements set skin='clearway' where id=tests.id(11)$$,'Both skins are accepted');

-- Who may change it
select ok(not has_column_privilege('authenticated','public.engagements','skin','update'),'No browser role can update the skin directly');
set local role authenticated;
select tests.login(1);
select throws_ok($$select public.save_engagement(tests.id(10),tests.church_body(),tests.body('novetera'),tests.id(302),null)$$,'42501',null,'A participant cannot change the skin');
select tests.login(3);
select throws_ok($$select public.save_engagement(tests.id(10),tests.church_body(),tests.body('novetera'),tests.id(302),null)$$,'42501',null,'A facilitator of another engagement cannot change the skin');
select tests.login(2);
select throws_ok($$select public.save_engagement(tests.id(10),tests.church_body(),tests.body('novetera'),tests.id(302),null)$$,'42501',null,'The lead who is not an admin cannot change the skin');
select throws_ok($$update public.engagements set skin='novetera' where id=tests.id(10)$$,'42501',null,'The lead cannot update the skin directly either');
select is(public.save_engagement(tests.id(10),tests.church_body(),tests.body('clearway'),tests.id(302),null),tests.id(10),'The lead can save Details with the skin unchanged');
select is(public.save_engagement(tests.id(10),tests.church_body(),tests.body(),tests.id(302),null),tests.id(10),'A save that sends no skin leaves it alone');
select tests.login(4);
select throws_ok($$select public.save_engagement(tests.id(10),tests.church_body(),tests.body('other'),tests.id(302),null)$$,'23514',null,'A skin that is not a brand is refused');
select throws_ok($$select public.save_engagement(tests.id(10),tests.church_body(),jsonb_set(tests.body(),'{skin}','5'),tests.id(302),null)$$,'23514',null,'A skin that is not text is refused');
select is((select skin from engagements where id=tests.id(10)),'clearway','Refused saves leave the skin as it was');
select is(public.save_engagement(tests.id(10),tests.church_body(),tests.body('novetera'),tests.id(302),null),tests.id(10),'An admin changes the skin through the Details save');
select is((select skin from engagements where id=tests.id(10)),'novetera','The skin is stored');
select is((select title from engagements where id=tests.id(10)),'Room A','The rest of the save still applies');
select is(public.save_engagement('90000000-0000-4000-8000-000000000010',tests.church_body(),tests.body('novetera','practice'),tests.id(304),null),'90000000-0000-4000-8000-000000000010'::uuid,'An admin changes the practice room''s skin');
reset role;
select is((select skin from engagements where id='90000000-0000-4000-8000-000000000010'),'novetera','The practice room keeps the skin it was given');

-- Who may read it
select ok(not has_function_privilege('authenticated','public.tv_room_resolve(text)','execute') and not has_function_privilege('anon','public.tv_room_resolve(text)','execute'),'Only the server resolves a room code to its skin');
select ok(has_function_privilege('service_role','public.tv_room_resolve(text)','execute'),'The server can resolve a code to its skin');
select is(private.tv_room_resolve((select room_code from engagements where id=tests.id(10))),jsonb_build_object('id',tests.id(10),'skin','novetera'),'A room code opens its engagement and names its skin');
select is(private.tv_room_resolve('nosuchroom'),null,'An unknown code names nothing');
select is(private.room_public_info(tests.id(10))->>'skin','novetera','The public join page lookup carries the skin');
select is(private.room_public_info(tests.id(10))->>'church','Room A church','The join page still carries what it did');
select is((select count(*)::integer from jsonb_object_keys(private.room_public_info(tests.id(10))||'{}')),
 (select count(*)::integer from jsonb_object_keys(private.room_public_info_pre_skin(tests.id(10))))+1,'The join page lookup gained the skin and nothing else');
select is(private.tv_room_info(tests.id(10))#>>'{display,skin}','novetera','The TV and phone display carries the skin');
select is(private.tv_room_info(tests.id(10))#>>'{display,church}','Room A church','The display still carries what it did');
select is((select count(*)::integer from jsonb_object_keys(private.tv_room_info(tests.id(10))->'display')),(select count(*)::integer from jsonb_object_keys(private.tv_room_info_pre_skin(tests.id(10))->'display'))+1,'The display gained the skin and nothing else');
select is(private.tv_room_info(tests.id(11))#>>'{display,skin}','clearway','A Clearway engagement says clearway');
select is(private.live_public_state(tests.id(10))#>>'{display,skin}','novetera','The live snapshot carries the skin');
set local role authenticated;
select tests.login(2);
select is(public.engagement_archive(tests.id(10))#>>'{records,engagements,0,skin}','novetera','The JSON archive includes the skin');
select is(public.engagement_archive(tests.id(10))#>>'{records,engagements,0,title}','Room A','The archive still includes the engagement');
select is(public.engagement_archive(tests.id(10))->>'status','ok','The archive still answers ok');
select tests.login(3);
select is(public.engagement_archive(tests.id(10))->>'status','denied','The archive still refuses someone who is not on the engagement');
reset role;

-- A change of skin reaches a room that is already open
update room_states set version=version where engagement_id=tests.id(11);
select lives_ok($$update engagements set skin='novetera' where id=tests.id(11)$$,'A skin change on an open room goes through the live results update');
update engagements set skin='clearway' where id=tests.id(11);

-- Reset keeps the skin
set local role authenticated;
select tests.login(4);
select is(public.reset_practice_room(),true,'An admin resets the practice room');
reset role;
select is((select skin from engagements where id='90000000-0000-4000-8000-000000000010'),'novetera','Reset practice room keeps the skin');
set local session_replication_role=replica;
update engagements set updated_at=now()-interval '1 day' where type='practice';
set local session_replication_role=origin;
set local role service_role;
select is(public.nightly_practice_reset()->>'status','reset','The nightly reset runs on the idle practice room');
reset role;
select is((select skin from engagements where id='90000000-0000-4000-8000-000000000010'),'novetera','The nightly practice reset keeps the skin');
select is((select skin from engagements where id=tests.id(10)),'novetera','Other engagements keep theirs');
select * from finish();
rollback;
