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

-- Fixtures use real native OAuth/session records and per-room assignments.
create function tests.input(n integer) returns jsonb language sql as $$ select jsonb_build_object(
 'id',tests.id(n),'revision',null,'title','Planning session','part','Day 1','planned_start','2026-11-14T14:00:00Z','planned_minutes',20,'mode','live','opens_at',null,'closes_at',null,
 'interaction','wall','prompt','It is {base year + 10}.','phone_depth','Depth {base year + 3}','settings','{"anonymous":true,"burst_minutes":4,"join_strip":false}'::jsonb,
 'notes','EDITOR-NOTES-SECRET','lands_in','10-year Future','state','ready','max_sends',3,'max_characters',280,'max_words',50) $$;
grant execute on function tests.input(integer) to authenticated;
select ok(not has_function_privilege('anon','public.show_read(uuid,uuid,text)','execute'),'Anonymous cannot read run of show');
select ok(not has_function_privilege('anon','public.show_write(uuid,text,jsonb)','execute'),'Anonymous cannot edit');
select ok(not has_function_privilege('authenticated','private.show_version(uuid)','execute'),'Version helper not exposed');
select ok(not has_table_privilege('authenticated','public.sessions','update'),'No unguarded session updates');
select ok(not has_table_privilege('authenticated','private.session_notes','update'),'No unguarded notes updates');
select ok(not (select prosecdef from pg_proc where oid='public.show_write(uuid,text,jsonb)'::regprocedure),'Public write wrapper is invoker');
set local role authenticated;
select tests.login(n),is(public.show_read(tests.id(100))->>'status','denied','Non-facilitator role cannot read planning or notes'),
 is(public.show_write(tests.id(100),'save',tests.input(310))->>'status','denied','Non-facilitator role cannot edit') from unnest(array[3,4,5,6,8])n;
select tests.login(1);
select is(public.show_write(tests.id(100),'save',tests.input(310))->>'status','ok','Lead saves session and private notes');
select is(public.show_write(tests.id(100),'save',tests.input(310))->>'status','conflict','Retry cannot create a second session');
select is(public.show_read(tests.id(100))->'sessions'->1->>'notes','EDITOR-NOTES-SECRET','Facilitator reads its notes');
select is(public.show_write(tests.id(100),'save',tests.input(310)||'{"revision":0,"title":"Saved edit"}')->>'status','ok','Compare-and-save succeeds');
select is(public.show_write(tests.id(100),'save',tests.input(310)||'{"revision":0,"title":"Lost update"}')->>'status','conflict','Stale editor cannot overwrite');
select is((select title from public.sessions where id=tests.id(310)),'Saved edit','Stale edit leaves saved title intact');
select is(public.show_read(tests.id(100),tests.id(300),null)->>'status','invalid_request','Cursor requires list version');
select is(public.show_read(tests.id(100),null,'old')->>'status','changed','Paged reads reject a mixed version');
select is(public.show_write(tests.id(100),'save',tests.input(311)||'{"state":"live"}')->>'status','invalid_state','Saving never starts a live session');
select is(public.show_write(tests.id(100),'save',tests.input(311)||'{"max_sends":null}')->>'status','invalid_request','Null cannot bypass a limit');
select is(public.show_write(tests.id(100),'save',tests.input(311)||'{"planned_start":"infinity"}')->>'status','invalid_request','Infinite timestamps rejected');
select is(public.show_write(tests.id(100),'save',tests.input(311)||'{"settings":{"anonymous":false}}')->>'status','invalid_request','Named answers not silently enabled');
select is(public.show_write(tests.id(100),'save',tests.input(311)||'{"mode":"self_paced"}')->>'status','invalid_request','Self-paced needs an opening window');
select is(public.show_write(tests.id(100),'save',tests.input(311))->>'status','ok','Second session saved');
select is(public.show_write(tests.id(100),'reorder',jsonb_build_object('part','Day 1','order',jsonb_build_array(jsonb_build_object('id',tests.id(311),'revision',0))))->>'status','conflict','Partial order cannot drop a session');
select is(public.show_write(tests.id(100),'reorder',jsonb_build_object('part','Day 1','order',jsonb_build_array(jsonb_build_object('id',tests.id(311),'revision',0),jsonb_build_object('id',tests.id(301),'revision',0))))->>'status','conflict','Reorder cannot pull a session from another engagement');
select is(public.show_write(tests.id(100),'reorder',jsonb_build_object('part','Day 1','order',jsonb_build_array(jsonb_build_object('id',tests.id(311),'revision',0),jsonb_build_object('id',tests.id(310),'revision',1))))->>'status','ok','Full ordered part saved atomically');
select is((select position from public.sessions where id=tests.id(311)),0,'First session in order');
select is((select position from public.sessions where id=tests.id(310)),1,'Second session in order');
select is(public.show_write(tests.id(100),'remove',jsonb_build_object('id',tests.id(310),'revision',1))->>'status','conflict','Reorder invalidates a stale editor');
select is(public.show_write(tests.id(100),'remove',jsonb_build_object('id',tests.id(300),'revision',0))->>'status','running','Live session cannot be removed');
-- Save a live prompt and phone depth. No notes, planning, or depth in the broadcast projection.
select is(public.show_write(tests.id(100),'save',tests.input(300)||'{"revision":0,"interaction":"word_cloud","state":"live"}')->>'status','ok','Live prompt edits save without changing live state');
select is(public.live_snapshot(tests.id(100))->'session'->>'prompt','It is 2036.','TV prompt has horizon year');
select is((public.live_snapshot(tests.id(100))->'session'->>'revision')::integer,1,'Public content revision advances on Save');
select ok(not (public.live_snapshot(tests.id(100))::text like '%EDITOR-NOTES-SECRET%'),'Shared snapshot omits notes');
select tests.login(3);
select is(public.live_snapshot(tests.id(100))->>'phone_depth','Depth 2029','Participant receives saved phone-only depth');
select is((select count(*)::integer from private.session_notes),0,'Participant raw notes remain RLS hidden');
select tests.login(4);
select is(public.live_snapshot(tests.id(100))->>'phone_depth',null,'TV never receives phone depth');
select ok(not (public.live_snapshot(tests.id(100))::text like '%planned_start%'),'TV never receives timings');
select tests.login(2);
select is(public.show_read(tests.id(100))->>'status','ok','Assigned co-facilitator can read');
select is(public.show_write(tests.id(100),'remove',jsonb_build_object('id',tests.id(310),'revision',2))->>'status','ok','Co-facilitator removes inactive session');
select is((select count(*)::integer from public.sessions where id=tests.id(310)),0,'Soft-deleted session hidden');
select is((select count(*)::integer from private.session_notes where session_id=tests.id(310)),0,'Removed session notes hidden');
select tests.login(7);
select is(public.show_read(tests.id(100))->>'status','ok','Clearway admin can read');
reset role;
select ok((select deleted from public.sessions where id=tests.id(310)),'Removed session retained as soft delete');
select ok((select deleted from private.session_notes where session_id=tests.id(310)),'Notes retained as soft delete');
-- Simulate a failure after the room broadcast. Every part of Save rolls back.
create function tests.fail_save() returns trigger language plpgsql as $$ begin raise exception 'test save failure'; end $$;
create trigger z_test_save_failure after update on public.room_states for each row execute function tests.fail_save();
set local role authenticated; select tests.login(1);
select throws_ok($$select public.show_write(tests.id(100),'save',tests.input(311)||'{"revision":1,"title":"Should roll back","notes":"Should roll back"}')$$,'P0001','test save failure','Failure after broadcast rolls back Save');
select is((select title from public.sessions where id=tests.id(311)),'Planning session','Failed Save did not change title');
select is((select revision from public.sessions where id=tests.id(311)),1,'Failed Save did not advance session revision');
select is((select notes from private.session_notes where session_id=tests.id(311)),'EDITOR-NOTES-SECRET','Failed Save did not change notes');
reset role;
drop trigger z_test_save_failure on public.room_states;
update public.engagements set status='closed' where id=tests.id(100);
set local role authenticated; select tests.login(1);
select is(public.show_read(tests.id(100))->>'status','ok','Closed engagement can still be printed by its facilitator');
select is(public.show_write(tests.id(100),'save',tests.input(315))->>'status','closed','Closed engagement cannot be edited');
reset role;
select * from finish();
rollback;
