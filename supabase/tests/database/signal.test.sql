-- Milestone 6, step 5: the alignment signal. Who can read the cards and their evidence (the lead and a co-facilitator, and nobody else),
-- what a card may be (code, not prompt), replaced rather than duplicated, dismissed for the session, saved as a citation (aligned only),
-- silent only after phones first go down, and the neutral question on the TV: its payload holds the question and no theme, count or kind.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('8d050000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(1000+n))::text,true); end $$;
create function tests.state() returns jsonb language sql as $$ select public.signal_state(tests.id(100),tests.id(310)) $$;
create function tests.act(n integer,act_id integer,sig uuid,action text,p jsonb default '{}') returns jsonb language sql as $$ select public.signal_act(tests.id(100),tests.id(act_id),sig,action,p) $$;
create table tests.claims(name text primary key,j jsonb);
grant all on tests.claims to authenticated,anon,service_role;
create function tests.claim(p_name text,lease integer) returns jsonb language plpgsql as $$
declare j jsonb;
begin
 j:=public.ai_claim(tests.id(310),tests.id(lease),'claude-test-model','{"alignment_signal":"alignment-signal@1","combine_words":"combine-words@1","group_wall":"group-wall@1","summarize_wall":"summarize-wall@1","fold_questions":"fold-questions@1"}');
 insert into tests.claims(name,j) values(p_name,j) on conflict(name) do update set j=excluded.j;
 return j;
end $$;
create function tests.c(name text) returns jsonb language sql as $$ select j from tests.claims where claims.name=c.name $$;
create function tests.tref(name text,label text) returns text language sql as $$ select x->>'ref' from jsonb_array_elements(tests.c(name)->'inputs'->'themes') x where x->>'label'=label limit 1 $$;
create function tests.rref(name text,t text) returns text language sql as $$ select x->>'ref' from jsonb_array_elements(tests.c(name)->'inputs'->'room') x where x->>'text'=t limit 1 $$;
create function tests.apply(name text,lease integer,output jsonb) returns jsonb language sql as $$
 select public.ai_apply((tests.c(name)->>'run')::uuid,tests.id(lease),output,'{"input_tokens":2400,"output_tokens":300,"cost_usd":0.004,"ms":9000,"model":"claude-deep-test"}') $$;
-- The signal's watermark moved back, as if its last claim was a while ago.
create function tests.age() returns void language plpgsql security definer set search_path='' as $$ begin
 insert into private.ai_sessions(session_id,engagement_id) values(tests.id(310),tests.id(100)) on conflict(session_id) do nothing;
 update private.ai_sessions set signal_at=now()-interval '1 hour' where session_id=tests.id(310); end $$;
create function tests.say(n integer,t text,ago interval default '0') returns void language sql as $$
 insert into public.submissions(id,engagement_id,session_id,attendee_id,text,answers,phone_sent_at,server_received_at) values(gen_random_uuid(),tests.id(100),tests.id(310),tests.id(n),t,'[]'::jsonb,now(),now()-ago) $$;
create function tests.cards(kind text default null) returns integer language sql security definer set search_path='' as $$
 select count(*)::integer from private.signals where engagement_id=tests.id(100) and not deleted and (cards.kind is null or signals.kind=cards.kind) $$;
create function tests.card(kind text,label text) returns uuid language sql security definer set search_path='' as $$
 select g.id from private.signals g join private.discover_themes t on t.id=g.theme_id where g.engagement_id=tests.id(100) and not g.deleted and g.kind=card.kind and t.label=card.label limit 1 $$;
create function tests.q(sql text) returns text language plpgsql security definer set search_path='' as $$ declare v text; begin execute sql into v; return v; end $$;
grant execute on all functions in schema tests to authenticated,anon,service_role;

insert into churches(id,name,timezone) values(tests.id(200),'Riverside Church','America/Toronto'),(tests.id(201),'Lakeside Church','America/Toronto');
insert into engagements(id,church_id,title,settings) values(tests.id(100),tests.id(200),'Wayfinding room','{"ai_enabled":true}'),(tests.id(101),tests.id(201),'Another room','{"ai_enabled":true}');
insert into auth.users(id,email,email_confirmed_at)
select tests.id(n),case when n in(1,2,7) then 'fac'||n||'@clearway.co' else 'person'||n||'@example.org' end,now() from generate_series(1,10)n;
insert into auth.sessions(id,user_id) select tests.id(1000+n),tests.id(n) from generate_series(1,10)n;
insert into auth.identities(user_id,provider,provider_id,identity_data) select id,'google',id::text,jsonb_build_object('email',email,'email_verified',true) from auth.users where id in(tests.id(1),tests.id(2),tests.id(7));
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method) select gen_random_uuid(),tests.id(1000+n),now(),now(),'oauth' from unnest(array[1,2,7]) n;
insert into clearway_users(id,auth_user_id,name,email,is_admin,team_hub_team_member_id) values
 (tests.id(701),tests.id(1),'Chris Vacher','fac1@clearway.co',false,tests.id(801)),
 (tests.id(702),tests.id(2),'Jaisy Tam','fac2@clearway.co',false,tests.id(802)),
 (tests.id(707),tests.id(7),'Other Facilitator','fac7@clearway.co',false,tests.id(807));
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values(tests.id(100),tests.id(701),'lead'),(tests.id(100),tests.id(702),'co_facilitator'),(tests.id(101),tests.id(707),'lead');
insert into attendees(id,engagement_id,auth_user_id,name,email,verified_at,room_role) values
 (tests.id(503),tests.id(100),tests.id(3),'Krista Scribe','person3@example.org',now(),'scribe'),
 (tests.id(504),tests.id(100),tests.id(4),'Priya Shah','person4@example.org',now(),'participant'),
 (tests.id(510),tests.id(100),tests.id(10),'Ben Ortiz','person10@example.org',now(),'participant');
insert into device_sessions(engagement_id,attendee_id,auth_session_id) values
 (tests.id(100),tests.id(503),tests.id(1003)),(tests.id(100),tests.id(504),tests.id(1004)),(tests.id(100),tests.id(510),tests.id(1010));
update room_states set remote_holder_id=tests.id(510) where engagement_id=tests.id(100);
insert into private.tv_devices(id,proof,engagement_id,label,paired_at) values(tests.id(450),repeat('a',64),tests.id(100),'Front TV',now());
insert into private.live_tv_sessions(id,engagement_id,auth_user_id,auth_session_id,device_id) values(tests.id(400),tests.id(100),tests.id(5),tests.id(1005),tests.id(450));
insert into sessions(id,engagement_id,title,part,position,state,interaction,prompt) values
 (tests.id(310),tests.id(100),'Five Lenses: Community','Day 1',1,'live','wall','What does our community say about us?'),
 (tests.id(311),tests.id(100),'Lens summary','Day 1',2,'ready','lens_summary','Summary');
-- Three accepted survey themes: two strong, one thin; and one draft that must never be read.
insert into private.discover_themes(id,engagement_id,source,label,detail,rests_on,out_of,status) values
 (tests.id(601),tests.id(100),'survey','Welcoming culture','People feel welcome on a first visit.',60,100,'accepted'),
 (tests.id(602),tests.id(100),'survey','Prayer and care','Care in hard seasons.',50,100,'accepted'),
 (tests.id(603),tests.id(100),'survey','Young families','Families with small children.',5,100,'accepted'),
 (tests.id(604),tests.id(100),'survey','Draft idea','Not accepted.',60,100,'draft');
update room_states set live_session_id=tests.id(310),tv_content='session' where engagement_id=tests.id(100);

-- ---------- Records and functions ----------
select is((select count(*) from pg_class where oid='private.signals'::regclass and relrowsecurity and relforcerowsecurity),1::bigint,'Signals keep forced row-level security');
select is((select count(*) from information_schema.role_table_grants where grantee in('authenticated','anon','public') and table_schema='private' and table_name='signals'),0::bigint,'Browsers hold no privilege on them');
select is((select prosecdef from pg_proc where oid='public.signal_state(uuid,uuid)'::regprocedure),false,'The public read is a security invoker wrapper');
select is((select prosecdef from pg_proc where oid='public.signal_act(uuid,uuid,uuid,text,jsonb)'::regprocedure),false,'and so is the press');
select ok(not has_function_privilege('anon','public.signal_state(uuid,uuid)','execute') and not has_function_privilege('anon','public.signal_act(uuid,uuid,uuid,text,jsonb)','execute'),'An unsigned browser cannot call either');
select ok(not has_function_privilege('authenticated','public.ai_claim(uuid,uuid,text,jsonb)','execute') and has_function_privilege('service_role','public.ai_claim(uuid,uuid,text,jsonb)','execute'),'Only the worker claims, as before');
select ok(not has_function_privilege('authenticated','private.signal_claim(uuid,uuid,text,jsonb)','execute') and not has_function_privilege('authenticated','private.signal_input(uuid)','execute'),'The signal''s own claim and its input are not callable from a browser');
select ok((select pg_get_constraintdef(oid) like '%alignment_signal%' from pg_constraint where conname='ai_runs_job_check'),'The job check lists the signal');
select ok((select pg_get_constraintdef(oid) like '%draft_discover_themes%' and pg_get_constraintdef(oid) like '%fold_four_lists%' from pg_constraint where conname='ai_runs_job_check'),'and keeps the earlier jobs');

-- ---------- Nothing is due until there is input ----------
select tests.age();
select is(tests.claim('empty',900)->>'status','idle','No input, no run');
select tests.say(504,'we are a welcoming church');
select is(tests.claim('one',900)->>'status','idle','One new answer, not yet 45 seconds old: not due');

-- ---------- The first run: 8 answers ----------
select tests.say(504,'newcomers are greeted at the door');
select tests.say(510,'a welcome team meets every visitor');
select tests.say(504,'care for people in hospital');
select tests.say(510,'we should add a third service on Sunday');
select tests.say(504,'another service would help more families');
select tests.say(510,'meals when someone is sick');
select tests.say(504,'prayer chain works well');
select is(tests.claim('first',901)->>'status','claimed','Eight new answers make the run due');
select is(tests.c('first')->>'job','alignment_signal','and it is the signal job');
select is(jsonb_array_length(tests.c('first')->'inputs'->'themes'),3,'It reads the three accepted themes and not the draft');
select is(jsonb_array_length(tests.c('first')->'inputs'->'room'),8,'and the room''s eight answers');
select ok(tests.c('first')::text not like '%Priya%' and tests.c('first')::text not like '%Ben Ortiz%' and tests.c('first')::text not like '%'||tests.id(504)::text||'%','No name or attendee id reaches the model');
select ok((select lease_id is null and lease_run is null and signal_lease_id=tests.id(901) and signal_lease_until>now() from private.ai_sessions where session_id=tests.id(310)),'The signal holds its own lease and the live jobs'' lease stays free');
-- Another signal run waits for the first, even with new input and the 10 second floor past.
create temp table mark as select signal_at,signal_seen_at,signal_seen_ids,signal_phones_seen from private.ai_sessions where session_id=tests.id(310);
update private.ai_sessions set signal_at=now()-interval '1 hour',signal_seen_at=null where session_id=tests.id(310);
select is(private.signal_claim(tests.id(310),tests.id(902),'claude-test-model','{"alignment_signal":"alignment-signal@1"}'::jsonb)->>'status','busy','One signal run at a time for a session');
update private.ai_sessions a set signal_at=m.signal_at,signal_seen_at=m.signal_seen_at,signal_seen_ids=m.signal_seen_ids,signal_phones_seen=m.signal_phones_seen from mark m where a.session_id=tests.id(310);
-- A live job is claimed while the signal's lease is held: the live jobs' own claim is not made busy by it.
select isnt(private.ai_claim_pre_signal(tests.id(310),tests.id(903),'claude-test-model','{"alignment_signal":"alignment-signal@1","combine_words":"combine-words@1","group_wall":"group-wall@1","summarize_wall":"summarize-wall@1","fold_questions":"fold-questions@1"}'::jsonb)->>'status','busy','A live job is not made busy by the signal''s lease');
select ok((select signal_lease_id=tests.id(901) from private.ai_sessions where session_id=tests.id(310)),'and the signal keeps its lease');
update private.ai_sessions set lease_id=null,lease_run=null,lease_until=null where session_id=tests.id(310);
-- A signal lease that has run out lets the next claim through (the first run is put back afterwards for the rest of the file).
create temp table lease_mark as select signal_lease_id,signal_lease_run,signal_lease_until from private.ai_sessions where session_id=tests.id(310);
update private.ai_sessions set signal_lease_until=now()-interval '1 second',signal_at=now()-interval '1 hour',signal_seen_at=null where session_id=tests.id(310);
select is(private.signal_claim(tests.id(310),tests.id(904),'claude-test-model','{"alignment_signal":"alignment-signal@1"}'::jsonb)->>'status','claimed','An expired signal lease lets the next claim through');
select is((select status from private.ai_runs where id=(select signal_lease_run from lease_mark)),'stale','and the run that lost its lease is marked stale');
delete from private.ai_runs where id=(select signal_lease_run from private.ai_sessions where session_id=tests.id(310));
update private.ai_runs set status='running',finished_at=null where id=(select signal_lease_run from lease_mark);
update private.ai_sessions a set signal_lease_id=m.signal_lease_id,signal_lease_run=m.signal_lease_run,signal_lease_until=now()+interval '75 seconds',signal_at=n.signal_at,signal_seen_at=n.signal_seen_at,signal_seen_ids=n.signal_seen_ids,signal_phones_seen=n.signal_phones_seen from lease_mark m,mark n where a.session_id=tests.id(310);
-- A practice reset and Clear test answers both drop the signal's lease, so the panel does not read "Reading the room" afterwards.
select ok(pg_get_functiondef('private.reset_practice_room_pre_read_back()'::regprocedure) like '%signal_lease_id=null,signal_lease_run=null,signal_lease_until=null%','The practice reset clears the signal''s lease');
select ok(pg_get_functiondef('private.rehearsal_control_pre_read_back(uuid,uuid,text)'::regprocedure) like '%signal_lease_id=null,signal_lease_run=null,signal_lease_until=null%','and so does Clear test answers');

-- A card that cannot stand is refused by code: a quote, a tone of correction, silent while phones are up, aligned on a thin theme.
select is(tests.apply('first',901,jsonb_build_object('complete',true,'cards',jsonb_build_array(
 jsonb_build_object('kind','aligned','theme',tests.tref('first','Welcoming culture'),'title','Welcome is in the room','line','Several answers speak of greeting and welcome, as the survey did.','ask','What does welcome look like to you here?','room',jsonb_build_array(tests.rref('first','we are a welcoming church'),tests.rref('first','a welcome team meets every visitor'))),
 jsonb_build_object('kind','divergent','theme',tests.tref('first','Welcoming culture'),'title','Talk of more services','line','Some answers turn toward adding a service, a different direction from the survey.','ask','What would we gain or lose by adding a service?','room',jsonb_build_array(tests.rref('first','we should add a third service on Sunday'),tests.rref('first','another service would help more families'))),
 jsonb_build_object('kind','thin','theme',tests.tref('first','Young families'),'title','Families come up once','line','One answer touches families, which few survey answers named.','room',jsonb_build_array(tests.rref('first','another service would help more families'))),
 jsonb_build_object('kind','silent','theme',tests.tref('first','Prayer and care'),'title','Prayer has not come up','line','Nothing yet on prayer.','room','[]'::jsonb),
 jsonb_build_object('kind','aligned','theme',tests.tref('first','Young families'),'title','Families are here','line','Families are named.','room',jsonb_build_array(tests.rref('first','another service would help more families'))),
 jsonb_build_object('kind','divergent','theme',tests.tref('first','Prayer and care'),'title','The room is wrong about prayer','line','The room is wrong to skip this.','room',jsonb_build_array(tests.rref('first','prayer chain works well'))),
 jsonb_build_object('kind','aligned','theme',tests.tref('first','Prayer and care'),'title','"Prayer" in quotes','line','Care is named in the room.','room',jsonb_build_array(tests.rref('first','meals when someone is sick')))
)))->>'status','ok','The apply runs');
select is(tests.cards(),3,'Three cards stand: aligned, divergent and thin');
select is((select jsonb_array_length(output->'refused') from private.ai_runs where id=(tests.c('first')->>'run')::uuid),4,'Four were refused by code');
select ok((select string_agg(x->>'reason',',' order by x->>'reason') from private.ai_runs r,jsonb_array_elements(r.output->'refused') x where r.id=(tests.c('first')->>'run')::uuid)='not_strong,phones_up,quote,tone','for phones up, a thin theme, a quote and a tone of correction');
select is((select changed from private.ai_runs where id=(tests.c('first')->>'run')::uuid),false,'The run does not count as an AI change, so Undo last AI change never lands on it');
select is((select concat_ws(',',status,model,prompt_version,input_tokens,output_tokens) from private.ai_runs where id=(tests.c('first')->>'run')::uuid),'ok,claude-deep-test,alignment-signal@1,2400,300','and it is logged with the deeper model, its prompt version and its tokens');
select is((select (evidence->'room'->>'answers')::integer from private.signals where id=tests.card('aligned','Welcoming culture')),2,'Evidence counts are worked out in code');
select is((select evidence->'theme'->>'label' from private.signals where id=tests.card('aligned','Welcoming culture')),'Welcoming culture','and carry the theme');
select ok((select (evidence->'theme'->>'strong')::boolean and evidence->'theme'->>'source'='survey' and (evidence->'theme'->>'rests_on')::integer=60 from private.signals where id=tests.card('aligned','Welcoming culture')),'its strength and its source');
select is((select kind from private.signals where id=tests.card('divergent','Welcoming culture')),'divergent','A divergent card is keyed on the theme it departs from');
-- The signal does not read as AI being slow.
select ok((select last_ms is null and last_ok_at is null and last_failed_at is null from private.ai_sessions where session_id=tests.id(310)),'A signal run of nine seconds leaves the live jobs'' timing alone, so it is never "AI is slow"');

-- ---------- Who may read ----------
set local role authenticated;
select tests.login(1);
select is(tests.state()->>'status','ok','The lead reads the cards');
select is(jsonb_array_length(tests.state()->'signals'),3,'three of them');
select tests.login(2);
select is(tests.state()->>'status','ok','A co-facilitator reads them');
select tests.login(7);
select is(tests.state()->>'status','denied','A facilitator of another engagement does not');
select tests.login(4);
select is(tests.state()->>'status','denied','A participant does not');
select tests.login(3);
select is(tests.state()->>'status','denied','The scribe does not');
select tests.login(10);
select is(tests.state()->>'status','denied','A team facilitator holding the remote does not');
select tests.login(5);
select is(tests.state()->>'status','denied','A TV does not');
select tests.login(9);
select is(tests.state()->>'status','denied','Someone with no place in the room does not');
select throws_ok($$select count(*) from private.signals$$,'42501',null,'No signed-in role reads the table directly');
select throws_ok($$select count(*) from private.ai_runs$$,'42501',null,'nor the runs that hold the evidence');
reset role;
set local role anon;
select throws_ok($$select public.signal_state(tests.id(100),tests.id(310))$$,'42501',null,'An unsigned browser cannot read');
select throws_ok($$select public.signal_act(tests.id(100),tests.id(900),tests.id(900),'dismiss','{}')$$,'42501',null,'or press');
reset role;

-- ---------- Presses by every other role are denied ----------
create table tests.denied(who text,action text,status text);
grant all on tests.denied to authenticated,anon,service_role;
set local role authenticated;
do $$ declare names text[]:=array['another facilitator','participant','scribe','team facilitator','TV','no place']; ids integer[]:=array[7,4,3,10,5,9]; i integer; sg uuid; begin
 sg:=tests.card('aligned','Welcoming culture');
 for i in 1..6 loop
  perform tests.login(ids[i]);
  insert into tests.denied values(names[i],'dismiss',public.signal_act(tests.id(100),tests.id(950+i),sg,'dismiss','{}')->>'status');
  insert into tests.denied values(names[i],'ask',public.signal_act(tests.id(100),tests.id(960+i),sg,'ask','{"text":"What do you notice?"}')->>'status');
  insert into tests.denied values(names[i],'back',public.signal_act(tests.id(100),tests.id(970+i),null,'back','{}')->>'status');
 end loop;
end $$;
reset role;
select is((select count(*) from tests.denied),18::bigint,'Six other roles tried three presses each');
select is((select count(*) from tests.denied where status<>'denied'),0::bigint,'and every one was denied: dismiss, ask and back');
select is(tests.cards(),3,'and nothing changed');
select is((select neutral_question from room_states where engagement_id=tests.id(100)),null,'and the TV holds no question');

-- ---------- Save as a citation: aligned only ----------
set local role authenticated;
select tests.login(1);
select is(tests.act(1,1,tests.card('divergent','Welcoming culture'),'save_citation')->>'status','invalid_state','A divergent card cannot be saved as a citation');
select is(tests.act(1,2,tests.card('aligned','Welcoming culture'),'save_citation')->>'status','ok','An aligned one can');
select is(tests.act(1,2,tests.card('aligned','Welcoming culture'),'save_citation')->>'status','duplicate','and the same press twice does nothing more');
select is(tests.act(1,3,tests.card('aligned','Welcoming culture'),'save_citation')->>'status','unchanged','Saving it again is unchanged');
reset role;
select ok((select saved_as_citation_at is not null from private.signals where id=tests.card('aligned','Welcoming culture')),'The citation is stored on the card');

-- ---------- The neutral question ----------
set local role authenticated;
select tests.login(1);
select is(tests.act(1,10,tests.card('divergent','Welcoming culture'),'ask','{"text":"What do you think about Welcoming culture?"}')->>'status','names_signal','A question that names the theme is refused');
select is(tests.act(1,11,tests.card('divergent','Welcoming culture'),'ask','{"text":"Do 60% of us agree?"}')->>'status','names_signal','and one with a figure');
select is(tests.act(1,12,tests.card('divergent','Welcoming culture'),'ask','{"text":"The signal says we diverge. Why?"}')->>'status','names_signal','and one that names the signal');
select is(tests.act(1,13,tests.card('divergent','Welcoming culture'),'ask','{"text":"This is shit?"}')->>'status','filtered','Words the filter refuses stay off the TV');
reset role;
update room_states set spotlight_key='sample' where engagement_id=tests.id(100);
set local role authenticated;
select tests.login(1);
select is(tests.act(1,14,tests.card('divergent','Welcoming culture'),'ask','{"text":"What would adding a service change for us?"}')->>'status','ok','A neutral question goes up');
reset role;
select is((select spotlight_key from room_states where engagement_id=tests.id(100)),null,'A spotlight put up before the question comes down with it');
select is((select neutral_question from room_states where engagement_id=tests.id(100)),'What would adding a service change for us?','The room holds only its text');
select ok((select (private.live_public_state(tests.id(100))->'state'->>'neutral_question')='What would adding a service change for us?'),'The TV payload carries it');
select ok(private.live_public_state(tests.id(100))::text !~* '(welcoming culture|aligned|divergent|silent|thin data|signal|evidence|ask_sent)','and no theme, signal kind or evidence');
select ok((select count(*) from jsonb_object_keys(private.live_public_state(tests.id(100))->'state') k where k like '%signal%' or k like '%theme%' or k like '%kind%')=0,'and no key for one');
select ok((select on_tv from private.signals where id=tests.card('divergent','Welcoming culture')) and (select ask_sent from private.signals where id=tests.card('divergent','Welcoming culture'))='What would adding a service change for us?','The card records what was sent');
select is((select private.live_public_state(tests.id(100))->'state'->>'live_session_id'),tests.id(310)::text,'The live step is still the live step beneath it');
select is(tests.q($$select private.live_public_state(tests.id(100))->'state'->>'tv_content'$$),'session','The TV stays on the session');
set local role authenticated;
select tests.login(2);
select is(tests.state()->'ask'->>'text','What would adding a service change for us?','A co-facilitator sees what is on the TV');
select is(tests.act(2,20,null,'back')->>'status','ok','Back to the session takes it down');
select is(tests.act(2,21,null,'back')->>'status','unchanged','and pressing again changes nothing');
reset role;
select is((select neutral_question from room_states where engagement_id=tests.id(100)),null,'The question is gone');
select ok(not (select on_tv from private.signals where id=tests.card('divergent','Welcoming culture')),'and its card is no longer on the TV');
select is(tests.q($$select (private.live_public_state(tests.id(100))->'state' ? 'neutral_question')::text$$),'false','The payload has no question key');
-- A question comes down when the room moves on.
set local role authenticated;
select tests.login(1);
select is(tests.act(1,22,tests.card('divergent','Welcoming culture'),'ask','{"text":"What do you notice about our Sundays?"}')->>'status','ok','Put one up again');
reset role;
update room_states set tv_content='holding' where engagement_id=tests.id(100);
select is((select neutral_question from room_states where engagement_id=tests.id(100)),null,'It leaves with the step: the layer is over a live step only');
select ok(not (select on_tv from private.signals where id=tests.card('divergent','Welcoming culture')),'and its card is no longer marked on the TV');
update room_states set tv_content='session' where engagement_id=tests.id(100);
set local role authenticated;
select tests.login(1);
select is(tests.act(1,23,tests.card('divergent','Welcoming culture'),'ask','{"text":"What do you notice about our Sundays?"}')->>'status','ok','and once more');
reset role;
update room_states set live_session_id=tests.id(311) where engagement_id=tests.id(100);
select is((select neutral_question from room_states where engagement_id=tests.id(100)),null,'A change of step takes it down too');
select ok(not (select on_tv from private.signals where id=tests.card('divergent','Welcoming culture')),'and its card is no longer marked on the TV there either');
update room_states set live_session_id=tests.id(310) where engagement_id=tests.id(100);
set local role authenticated;
select tests.login(1);
select is(tests.act(1,24,tests.card('divergent','Welcoming culture'),'ask','{"text":"What do you notice about our Sundays?"}')->>'status','ok','Put it up for the next check');
reset role;

-- ---------- Replaced, not duplicated; dismissed stays dismissed ----------
select tests.age();
select tests.say(504,'we are still a welcoming church',interval '90 seconds');
select is(tests.claim('third',903)->>'status','claimed','One answer 45 seconds old makes it due');
select is(jsonb_array_length(tests.c('third')->'inputs'->'raised'),3,'The run is told which cards are already up');
select is(tests.apply('third',903,jsonb_build_object('complete',true,'cards',jsonb_build_array(
 jsonb_build_object('kind','aligned','theme',tests.tref('third','Welcoming culture'),'title','Welcome keeps coming up','line','Answers keep speaking of a welcoming church, as the survey did.','ask','What makes a visit feel welcoming?','room',jsonb_build_array(tests.rref('third','we are still a welcoming church'),tests.rref('third','we are a welcoming church'),tests.rref('third','a welcome team meets every visitor')))
)))->>'status','ok','Applied');
select is(tests.cards('aligned'),1,'The same kind and theme again replaces the card');
select is((select title from private.signals where id=tests.card('aligned','Welcoming culture')),'Welcome keeps coming up','with the new words');
select ok((select saved_as_citation_at is not null from private.signals where id=tests.card('aligned','Welcoming culture')),'and the saved citation stays saved');
select is((select (evidence->'room'->>'answers')::integer from private.signals where id=tests.card('aligned','Welcoming culture')),3,'and its evidence moves with it');
select is(tests.cards(),3,'No duplicate anywhere');
set local role authenticated;
select tests.login(1);
select is(tests.act(1,30,tests.card('divergent','Welcoming culture'),'dismiss')->>'status','ok','Dismiss a card');
select is(jsonb_array_length(tests.state()->'signals'),2,'It leaves the list');
reset role;
select tests.age();
select tests.say(510,'a third service is the way forward',interval '90 seconds');
select is(tests.claim('fourth',904)->>'status','claimed','Another run');
select is(tests.apply('fourth',904,jsonb_build_object('complete',true,'cards',jsonb_build_array(
 jsonb_build_object('kind','divergent','theme',tests.tref('fourth','Welcoming culture'),'title','Talk of more services again','line','More answers turn toward a service.','room',jsonb_build_array(tests.rref('fourth','a third service is the way forward')))
)))->>'status','ok','Applied');
select is((select output->'refused'->0->>'reason' from private.ai_runs where id=(tests.c('fourth')->>'run')::uuid),'dismissed','A dismissed card stays dismissed for the session');
select is(tests.cards('divergent'),1,'and is not raised a second time');
select is((select count(*) from private.signals where kind='divergent' and engagement_id=tests.id(100) and not deleted and dismissed_at is null),0::bigint,'as a live card');

-- ---------- Silent only after phones first go down ----------
select is((select phones_down_at from private.ai_sessions where session_id=tests.id(310)),null,'Phones have not been down in this step');
select is(tests.state()->>'held','1','The panel says one silent theme is waiting');
update sessions set state='phones_down' where id=tests.id(310);
select ok((select phones_down_at is not null from private.ai_sessions where session_id=tests.id(310)),'Phones going down is recorded the first time');
select tests.age();
select is(tests.claim('fifth',905)->>'status','claimed','Phones going down makes a run due without new answers');
select is((tests.c('fifth')->'inputs'->>'phones_down')::boolean,true,'and the run is told');
select is(tests.apply('fifth',905,jsonb_build_object('complete',true,'cards',jsonb_build_array(
 jsonb_build_object('kind','silent','theme',tests.tref('fifth','Prayer and care'),'title','Prayer has not come up','line','Nothing in the room yet speaks of prayer or care in hard seasons.','ask','Where have you felt cared for here?','room','[]'::jsonb),
 jsonb_build_object('kind','silent','theme',tests.tref('fifth','Young families'),'title','Families are quiet','line','Nobody has mentioned families.','room','[]'::jsonb)
)))->>'status','ok','Applied');
select is(tests.cards('silent'),1,'A silent card on a strong theme stands; one on a thin theme is refused');
create temp table kept(id uuid);
insert into kept select tests.card('silent','Prayer and care');
-- Two more runs with phones down and nothing said about prayer: the silent card stays, and it is the same card.
select tests.age();
select tests.say(510,'the coffee is good',interval '90 seconds');
select is(tests.claim('fifth_b',911)->>'status','claimed','A run with phones still down');
select is(tests.apply('fifth_b',911,'{"complete":true,"cards":[]}'::jsonb)->>'status','ok','says nothing about prayer');
select tests.age();
select tests.say(510,'parking is tight',interval '90 seconds');
select is(tests.claim('fifth_c',912)->>'status','claimed','and another');
select is(tests.apply('fifth_c',912,'{"complete":true,"cards":[]}'::jsonb)->>'status','ok','also says nothing about prayer');
select is(tests.cards('silent'),1,'The silent card is still there after two runs with no mention');
select is(tests.card('silent','Prayer and care'),(select id from kept),'and it is the same card');
select is(tests.state()->>'held','0','and nothing is held back now');
-- The room raises it: a run that raises an aligned card on the theme retires the silent one.
select tests.age();
select tests.say(504,'we pray for each other and care in hard seasons',interval '90 seconds');
select is(tests.claim('sixth',906)->>'status','claimed','The room raises prayer');
select is(tests.apply('sixth',906,jsonb_build_object('complete',true,'cards',jsonb_build_array(
 jsonb_build_object('kind','aligned','theme',tests.tref('sixth','Prayer and care'),'title','Prayer and care are in the room','line','Answers now speak of praying for each other and of care.','room',jsonb_build_array(tests.rref('sixth','we pray for each other and care in hard seasons')))
)))->>'status','ok','Applied');
select is(tests.cards('silent'),0,'The silent card is retired once the theme is raised');
select is(tests.cards('aligned'),2,'and an aligned card takes its place');

-- ---------- A failed call: watermark back, live timing untouched ----------
select tests.age();
select tests.say(510,'one more answer',interval '90 seconds');
select is(tests.claim('seventh',907)->>'status','claimed','A run');
select is(public.ai_fail((tests.c('seventh')->>'run')::uuid,tests.id(907),'timeout','{"ms":25000}'::jsonb)->>'status','ok','fails');
select ok((select signal_failed_at is not null and signal_seen_at is null and signal_lease_id is null and last_failed_at is null from private.ai_sessions where session_id=tests.id(310)),'Its watermark goes back and the live jobs'' failure marker is untouched');
select is((select status from private.ai_runs where id=(tests.c('seventh')->>'run')::uuid),'failed','The run is logged as failed');
select tests.age();
select is(private.signal_claim(tests.id(310),tests.id(908),'claude-test-model','{"alignment_signal":"alignment-signal@1"}'::jsonb)->>'status','cooling','It waits 30 seconds before trying again');

-- ---------- AI off: nothing is claimed, an apply is discarded ----------
update engagements set settings='{"ai_enabled":false}' where id=tests.id(100);
select tests.age();
select is(tests.claim('ninth',909)->>'status','off','With AI off the worker is told so');
select is((select count(*) from private.ai_runs where job='alignment_signal' and status='running')::integer,0,'and no signal run starts');
update engagements set settings='{"ai_enabled":true}' where id=tests.id(100);

-- ---------- The room window: the newest 120 of 125 inputs, and the seen set holds all of them ----------
-- The claim builds its room inputs and its seen set from one scan. The window is the newest 120 (ties on arrival time broken by id),
-- numbered oldest first; the seen set is every input.
update submissions set deleted=true where session_id=tests.id(310);
update private.scribe_cards set deleted=true where session_id=tests.id(310);
update private.ai_sessions set signal_seen_at=null,signal_seen_ids=array[]::uuid[],signal_phones_seen=false,signal_failed_at=null,signal_lease_id=null,signal_lease_run=null,signal_lease_until=null,lease_id=null,lease_run=null,lease_until=null where session_id=tests.id(310);
-- Inputs 5 and 6 arrived at the same moment, so the cut falls between two ties: the smaller id stays in the window, the larger one leaves it.
insert into submissions(id,engagement_id,session_id,attendee_id,text,answers,phone_sent_at,server_received_at)
select case g when 5 then '8d050000-0000-4000-8000-0000000fff01'::uuid when 6 then '8d050000-0000-4000-8000-0000000fff02'::uuid else gen_random_uuid() end,
 tests.id(100),tests.id(310),tests.id(504),'in-'||lpad(g::text,3,'0'),'[]'::jsonb,now(),
 now()-interval '1 day'+(case when g<=5 then least(g,5) else g-1 end)*interval '1 second'
from generate_series(1,125) g;
select is((select count(*)::integer from private.signal_input(tests.id(310))),125,'The step holds 125 inputs');
select tests.age();
select is(tests.claim('window',920)->>'status','claimed','125 new inputs make the run due');
select is(jsonb_array_length(tests.c('window')->'inputs'->'room'),120,'The room is cut to the newest 120');
select is((tests.c('window')->'inputs'->'room'->0)->>'ref','r1','and numbered from r1');
select is((tests.c('window')->'inputs'->'room'->0)->>'text','in-005','r1 is the oldest of the newest 120: of two inputs that tie at the cut the smaller id stays');
select is((tests.c('window')->'inputs'->'room'->119)->>'text','in-125','the last ref is the newest input');
select is((select count(*)::integer from jsonb_array_elements(tests.c('window')->'inputs'->'room') x where x->>'text' in('in-001','in-002','in-003','in-004','in-006')),0,'The five oldest are not in the room');
select is((select string_agg(x->>'ref',',' order by (x->>'ref')) from jsonb_array_elements(tests.c('window')->'inputs'->'room') x where x->>'text' in('in-005','in-006','in-007')),'r1,r2','and refs run oldest first');
select is((select cardinality(signal_seen_ids) from private.ai_sessions where session_id=tests.id(310)),125,'The seen set holds all 125 inputs, those outside the window too');
select is((select count(*)::integer from private.signal_input(tests.id(310)) i join private.ai_sessions a on a.session_id=tests.id(310) where i.id=any(a.signal_seen_ids)),125,'and they are the step''s inputs');

select * from finish();
rollback;
