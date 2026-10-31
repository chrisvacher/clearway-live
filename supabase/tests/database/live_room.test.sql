begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('83000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(1000+n),'user_metadata','{"is_admin":true}')::text,true); end $$;
create function tests.send(n integer,rev integer default 0,action text default 'submit',answer text default 'Hope') returns jsonb language sql as $$
 select public.live_submit(tests.id(100),tests.id(n),tests.id(300),rev,action,answer,now(),null,0)
$$;
grant execute on all functions in schema tests to authenticated,anon,service_role;
insert into churches(id,name,timezone) values(tests.id(200),'Church A','America/Toronto'),(tests.id(201),'Church B','America/Toronto');
insert into engagements(id,church_id,title) values(tests.id(100),tests.id(200),'Live A'),(tests.id(101),tests.id(201),'Live B');
insert into auth.users(id,email,email_confirmed_at)
select tests.id(n),case when n in(1,2,6,7) then 'fac'||n||'@clearway.co' else 'person'||n||'@example.org' end,now() from generate_series(1,8)n;
insert into auth.sessions(id,user_id) select tests.id(1000+n),tests.id(n) from generate_series(1,8)n;
insert into auth.identities(user_id,provider,provider_id,identity_data)
select id,'google',id::text,jsonb_build_object('email',email,'email_verified',true) from auth.users where id in(tests.id(1),tests.id(2),tests.id(6),tests.id(7));
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method)
select gen_random_uuid(),tests.id(1000+n),now(),now(),'oauth' from unnest(array[1,2,6,7])n;
insert into clearway_users(id,auth_user_id,name,email,is_admin,team_hub_team_member_id)
select tests.id(700+n),tests.id(n),'Facilitator '||n,'fac'||n||'@clearway.co',n=7,tests.id(800+n) from unnest(array[1,2,6,7])n;
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values(tests.id(100),tests.id(701),'lead'),(tests.id(100),tests.id(702),'co_facilitator'),(tests.id(101),tests.id(706),'lead');
insert into attendees(id,engagement_id,auth_user_id,name,email,verified_at,room_role) values
 (tests.id(503),tests.id(100),tests.id(3),'Participant','person3@example.org',now(),'participant'),
 (tests.id(508),tests.id(100),tests.id(8),'Scribe','person8@example.org',now(),'scribe');
insert into device_sessions(engagement_id,attendee_id,auth_session_id) values(tests.id(100),tests.id(503),tests.id(1003)),(tests.id(100),tests.id(508),tests.id(1008));
insert into private.live_tv_sessions(id,engagement_id,auth_user_id,auth_session_id) values(tests.id(400),tests.id(100),tests.id(4),tests.id(1004));
insert into sessions(id,engagement_id,title,prompt,state) values(tests.id(300),tests.id(100),'Cloud','What gives you hope?','live'),(tests.id(301),tests.id(101),'Other session','Private other room','ready');
insert into private.session_notes(session_id,engagement_id,notes) values(tests.id(300),tests.id(100),'PRESENTER-SECRET');
update room_states set live_session_id=tests.id(300),tv_content='session' where engagement_id=tests.id(100);

select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid=t::regclass),t||' forces RLS')
 from unnest(array['public.sessions','public.room_states','public.submissions','private.session_notes','private.live_tv_sessions','private.room_transport','private.latency_logs'])t;
select ok(not has_function_privilege('anon','public.live_snapshot(uuid,uuid,bigint)','execute'),'No anonymous snapshot');
select ok(not has_function_privilege('authenticated','private.live_fingerprint(uuid)','execute'),'Transport membership cannot be enumerated');
select ok(not (select prosecdef from pg_proc where oid='public.live_submit(uuid,uuid,uuid,integer,text,text,timestamptz,timestamptz,double precision)'::regprocedure),'Public submit is invoker');
select ok(not has_table_privilege('authenticated','public.room_states','update'),'Clients cannot forge room versions');
select ok(not has_table_privilege('authenticated','public.submissions','insert'),'Clients cannot skip submission validation');

set local role authenticated;
select tests.login(3);
select is(private.live_role(tests.id(100)),'participant','Bound participant role');
select is(public.live_snapshot(tests.id(101))->>'status','denied','Participant cannot read another engagement');
select is((select count(*)::integer from sessions),0,'Participant cannot read draft sessions or planning fields');
select is((select count(*)::integer from private.session_notes),0,'Participant cannot read notes');
select is(tests.send(900)->>'status','accepted','Live answer accepted');
select is(tests.send(900)->>'status','duplicate','Resend is idempotent');
select is((select count(*)::integer from submissions),1,'Only one owned answer row');
select is((public.live_snapshot(tests.id(100))->>'version')::integer,2,'Duplicate did not increase the version');
select is(tests.send(900,2,'change','Care')->>'status','conflict','Revision gaps rejected');
select is(tests.send(900,1,'change','Care')->>'status','accepted','Answer changes in place');
select is(tests.send(901,0,'submit','in my finances')->>'status','accepted','Little words and plurals accepted');
select is((select answers->0->>'key' from submissions where id=tests.id(901)),'finance','Word normalization matches the PRD');
select is(tests.send(902,0,'submit','one two three four')->>'status','limit','Word limit enforced in database');
select is(tests.send(902,0,'submit','shit')->>'status','filtered','Profanity never published');
select is(tests.send(902,0,'submit','Hope')->>'status','accepted','Third send accepted');
select is(tests.send(903)->>'status','limit','Send limit enforced atomically');
select is(tests.send(900,2,'withdraw','')->>'status','accepted','Withdraw works without losing authorship history');
select is((public.live_snapshot(tests.id(100))->'state'->'results'->>'total')::integer,2,'Withdraw updates shared count');
select is(public.live_submit(tests.id(100),tests.id(999),tests.id(301),0,'submit','Cross room',now(),null,0)->>'status','invalid_session','Cross-room session rejected');
select is(public.live_submit(tests.id(100),tests.id(999),tests.id(300),0,'submit','Clock',now(),null,'NaN'::float8)->>'status','invalid_request','Non-finite time measurement rejected');
select is(public.live_ack(tests.id(100),1,now(),0),false,'Participant cannot spoof TV acknowledgement');
select tests.login(8);
select is((select count(*)::integer from submissions),0,'Scribe cannot read another author');
select is((select count(*)::integer from private.session_notes),0,'Scribe cannot read notes');
select tests.login(4);
select is(private.live_role(tests.id(100)),'tv','Native TV binding is recognized');
select is((select count(*)::integer from submissions),0,'TV cannot read authorship');
select is((select count(*)::integer from private.session_notes),0,'TV cannot read presenter notes');
select is((select count(*)::integer from sessions),0,'TV cannot read phone depth or planned timings');
select ok(not (public.live_snapshot(tests.id(100))::text like '%PRESENTER-SECRET%'),'TV snapshot omits notes');
select ok(not (public.live_snapshot(tests.id(100))::text like '%'||tests.id(503)||'%'),'TV snapshot omits attendee id');
select is(public.live_snapshot(tests.id(100))->>'phone_depth',null,'TV does not receive phone-only depth');
select is(tests.send(999)->>'status','denied','TV cannot submit as a participant');
select is(public.live_ack(tests.id(100),999999,now(),0),false,'TV cannot acknowledge a future version');
select is(public.live_ack(tests.id(100),6,now(),0),true,'TV can acknowledge a received version');
select tests.login(5);
select is(private.live_role(tests.id(100)),null,'Unbound user has no room role');
select is(public.live_snapshot(tests.id(100))->>'status','denied','User metadata cannot promote an outsider');
select tests.login(6);
select is(public.live_snapshot(tests.id(100))->>'status','denied','Other engagement facilitator denied');
select tests.login(1);
select is((select count(*)::integer from private.session_notes),1,'Assigned facilitator reads notes');
select is((select count(*)::integer from submissions),0,'Facilitator snapshot is anonymous, not an author table');
select tests.login(2);
select is((select count(*)::integer from private.session_notes),1,'Co-facilitator reads notes');
select tests.login(7);
select is((select count(*)::integer from private.session_notes),1,'Clearway admin reads notes');
reset role;

-- Failure after state/broadcast work rolls back answer, version and message together.
create function tests.fail_log() returns trigger language plpgsql as $$ begin raise exception 'test failure'; end $$;
create trigger fail_log before insert on private.latency_logs for each row execute function tests.fail_log();
set local role authenticated;
select tests.login(8);
select throws_ok($$select tests.send(910)$$,'P0001','test failure','Failed transaction is atomic');
reset role;
drop trigger fail_log on private.latency_logs;
select is((select count(*)::integer from submissions where id=tests.id(910)),0,'Failed answer did not persist');
select is((select version::integer from room_states where engagement_id=tests.id(100)),6,'Failed broadcast/version rolled back');
select ok(not exists(select 1 from realtime.messages where topic like 'live:'||tests.id(100)||':%' and (payload::text like '%PRESENTER-SECRET%' or payload::text like '%'||tests.id(503)||'%')),'Broadcasts contain neither notes nor attendee ids');

-- Large, stable pages bypass PostgREST's 1,000-row cap.
insert into submissions(id,engagement_id,session_id,attendee_id,text,answers,phone_sent_at)
select tests.id(10000+n),tests.id(100),tests.id(300),tests.id(503),'Team','[{"text":"Team","key":"team"}]',now() from generate_series(1,1205)n;
set local role authenticated;
select tests.login(4);
select is(jsonb_array_length(public.live_snapshot(tests.id(100))->'answers'),500,'First page is bounded at 500');
select is(jsonb_array_length(public.live_snapshot(tests.id(100),tests.id(10498),6)->'answers'),500,'Second page continues past 500');
select is(jsonb_array_length(public.live_snapshot(tests.id(100),tests.id(10998),6)->'answers'),207,'Third page continues past 1,000 without dropping answers');
select is(public.live_snapshot(tests.id(100),tests.id(10998),5)->>'status','changed','A changed version refuses a mixed snapshot');
select is(public.live_snapshot(tests.id(100),tests.id(10998))->>'status','invalid_request','Cursor requires a matching version');
select ok(private.can_receive_live(public.live_snapshot(tests.id(100))->>'topic'),'TV can join its private topic');
reset role;
select set_config('tests.old_topic',(select 'live:'||engagement_id||':'||channel_id from private.room_transport where engagement_id=tests.id(100)),true);
update device_sessions set revoked_at=now() where attendee_id=tests.id(503);
update room_states set phones_down=true where engagement_id=tests.id(100);
select isnt((select 'live:'||engagement_id||':'||channel_id from private.room_transport where engagement_id=tests.id(100)),current_setting('tests.old_topic'),'Revocation rotates the data channel before another event');
set local role authenticated;
select tests.login(3);
select is(public.live_snapshot(tests.id(100))->>'status','denied','Revoked native session immediately loses snapshot access');
select ok(not private.can_receive_live(current_setting('tests.old_topic')),'Revoked user cannot rejoin the old channel');
select tests.login(4);
select ok(not private.can_receive_live(current_setting('tests.old_topic')),'Old channel is retired even for an active TV');
reset role;
update engagements set status='closed' where id=tests.id(100);
set local role authenticated;
select tests.login(4);
select is(public.live_snapshot(tests.id(100))->>'status','denied','TV loses access when engagement closes');
reset role;
select * from finish();
rollback;
