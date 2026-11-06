-- Milestone 6, step 4: What We Heard drafted from the accepted themes (PRE-08). Matching the run of show's steps by source, the accepted themes by
-- source (conversation themes split by the kind of note), the drafting round and the worker's claim, apply and fail, edit, discard and applied,
-- the AI job check, the practice room, and who may reach any of it: the lead, a co-facilitator, another engagement's facilitator, a participant,
-- the scribe, a team facilitator, the TV and an unsigned browser.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('ae040000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(1000+n))::text,true); end $$;
create function tests.hstate() returns jsonb language sql as $$ select public.discover_heard_state(tests.id(100)) $$;
create function tests.note(n integer,kind text,person text,title text,body text) returns jsonb language sql as $$ select public.discover_note_add(tests.id(100),tests.id(n),kind,person,title,body,'paste') $$;
create function tests.theme(n integer,source text,label text,detail text,srcs uuid[]) returns jsonb language sql as $$ select public.discover_theme_add(tests.id(100),tests.id(n),source,label,detail,srcs) $$;
create function tests.q(sql text) returns text language plpgsql security definer set search_path='' as $$ declare v text; begin execute sql into v; return v; end $$;
-- The ref the latest claim gave a theme or a quote, read from the run's inputs.
create function tests.tref(lbl text,k text default null) returns text language plpgsql security definer set search_path='' as $$ declare v text; begin
 select x.value->>'ref' into v from private.ai_runs r,jsonb_array_elements(r.inputs->'sources') s,jsonb_array_elements(s.value->'themes') x
  where r.job='draft_what_we_heard' and r.engagement_id=tests.id(100) and r.status='running' and x.value->>'label'=lbl and (k is null or s.value->>'key'=k); return v; end $$;
create function tests.qref(lbl text,part text,k text default null) returns text language plpgsql security definer set search_path='' as $$ declare v text; begin
 select q.value->>'ref' into v from private.ai_runs r,jsonb_array_elements(r.inputs->'sources') s,jsonb_array_elements(s.value->'themes') x,jsonb_array_elements(x.value->'quotes') q
  where r.job='draft_what_we_heard' and r.engagement_id=tests.id(100) and r.status='running' and x.value->>'label'=lbl and q.value->>'text' like '%'||part||'%' and (k is null or s.value->>'key'=k); return v; end $$;
create function tests.run() returns uuid language plpgsql security definer set search_path='' as $$ declare v uuid; begin
 select id into v from private.ai_runs where job='draft_what_we_heard' and engagement_id=tests.id(100) and status='running'; return v; end $$;
create function tests.lastrun() returns uuid language plpgsql security definer set search_path='' as $$ declare v uuid; begin
 select id into v from private.ai_runs where job='draft_what_we_heard' and engagement_id=tests.id(100) order by created_at desc,id limit 1; return v; end $$;
create function tests.draft(k text,col text) returns text language plpgsql security definer set search_path='' as $$ declare v text; begin
 execute format('select %I::text from private.heard_drafts where engagement_id=$1 and source_key=$2 and not deleted',col) into v using tests.id(100),k; return v; end $$;
grant execute on all functions in schema tests to authenticated,anon,service_role;

insert into churches(id,name,timezone) values(tests.id(200),'Riverside Church','America/Toronto'),(tests.id(201),'Lakeside Church','America/Toronto');
insert into engagements(id,church_id,title) values(tests.id(100),tests.id(200),'Wayfinding room'),(tests.id(101),tests.id(201),'Another room');
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
-- The four What We Heard steps as the templates make them (the survey one already carries a basis after the source), one that is not a headline, one in another room.
insert into sessions(id,engagement_id,title,part,position,state,interaction,prompt,phone_depth,options) values
 (tests.id(310),tests.id(100),'What we heard: Survey','Pre-call',4,'draft','content','','The detail under this headline.','{"screen":"headline","source":"Congregational survey · 87 respondents"}'),
 (tests.id(311),tests.id(100),'What we heard: Four Helpful Lists','Pre-call',5,'draft','content','','','{"screen":"headline","source":"Four Helpful Lists"}'),
 (tests.id(312),tests.id(100),'What we heard: Board and staff input','Pre-call',6,'draft','content','','','{"screen":"headline","source":"Board and staff input conversations"}'),
 (tests.id(313),tests.id(100),'What we heard: Leadership interviews','Pre-call',7,'draft','content','','','{"screen":"headline","source":"Leadership interviews"}'),
 (tests.id(314),tests.id(100),'A scripture','Pre-call',2,'draft','content','','','{"screen":"scripture","reference":"Habakkuk 2:2"}'),
 (tests.id(315),tests.id(100),'Another leadership interviews step','Day 1',1,'draft','content','','','{"screen":"headline","source":"Leadership interviews"}'),
 (tests.id(320),tests.id(101),'Elsewhere survey','Pre-call',4,'draft','content','','','{"screen":"headline","source":"Congregational survey"}');
-- A test-only replacement for step 2's function, inside this transaction only: the cards step 3 reads through the contract.
create or replace function private.four_lists_cards_for_themes(p_engagement uuid) returns table(card_id uuid,session_id uuid,"column" text,"text" text,agree integer,folded_ids uuid[],people uuid[])
language sql stable security definer set search_path='' as $$
 select v.a,v.b,v.c,v.d,v.e,v.f,v.g from (values
  (tests.id(904),tests.id(310),'wrong','Volunteers are burning out',4,array[]::uuid[],array[tests.id(601),tests.id(602),tests.id(603),tests.id(604),tests.id(605)]),
  (tests.id(905),tests.id(310),'confused','Who decides what we do next?',2,array[]::uuid[],array[tests.id(603),tests.id(604),tests.id(606)]))
  v(a,b,c,d,e,f,g) where p_engagement=tests.id(100)
$$;

-- ---------- The records ----------
select is((select count(*) from pg_class where oid in('private.heard_rounds'::regclass,'private.heard_drafts'::regclass) and relrowsecurity and relforcerowsecurity),2::bigint,'Both records force row-level security');
select is((select count(*) from information_schema.role_table_grants where grantee in('authenticated','anon','public') and table_schema='private' and table_name in('heard_rounds','heard_drafts')),0::bigint,'and no browser or anonymous role has a grant on either');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'discover_heard\_%' and p.prosecdef),0::bigint,'Every public What We Heard function is a security invoker wrapper');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in('discover_heard_state','discover_heard_start','discover_heard_edit','discover_heard_discard','discover_heard_applied','discover_heard_due','discover_heard_claim','discover_heard_apply','discover_heard_fail','heard_steps','heard_themes','heard_inputs') and p.prosecdef),12::bigint,'and every private one is a security definer');
select throws_ok($$insert into private.ai_runs(engagement_id,session_id,job,model,prompt_version,inputs) values(tests.id(100),null,'combine_words','m','v','{}')$$,'23514',null,'A live job still needs a session');
select lives_ok($$insert into private.ai_runs(engagement_id,session_id,job,model,prompt_version,inputs,status,finished_at) values(tests.id(100),null,'draft_what_we_heard','m','v','{}','failed',now())$$,'The What We Heard job is engagement-level and has none');
select lives_ok($$insert into private.ai_runs(engagement_id,session_id,job,model,prompt_version,inputs,status,finished_at) values(tests.id(100),null,'draft_discover_themes','m','v','{}','failed',now())$$,'step 3''s theme job still has none either');
select lives_ok($$insert into private.ai_runs(engagement_id,session_id,job,model,prompt_version,inputs,status,finished_at) values(tests.id(100),null,'overnight_draft','m','v','{}','failed',now())$$,'nor does the overnight draft');
select lives_ok($$insert into private.ai_runs(engagement_id,session_id,job,model,prompt_version,inputs,status,finished_at) values(tests.id(100),tests.id(310),'fold_four_lists','m','v','{}','failed',now())$$,'step 2''s fold job is still allowed');
select lives_ok($$insert into private.ai_runs(engagement_id,session_id,job,model,prompt_version,inputs,status,finished_at) values(tests.id(100),tests.id(310),'propose_candidates','m','v','{}','failed',now())$$,'and the candidates job');
delete from private.ai_runs where engagement_id=tests.id(100);

-- ---------- Matching the steps ----------
select is((select array_agg(private.heard_source_key(s)::text order by ord) from (values (1,'Congregational survey'),(2,'Congregational survey · 87 respondents'),(3,'four helpful lists'),(4,'Board and staff input conversations · 3 conversations'),(5,'Leadership interviews'),(6,'Leadership'),(7,null)) v(ord,s)),
 array['survey','survey','four_lists','input','interviews',null,null]::text[],'A step is matched by the words before the first " · "');
select is((select array_agg(source_key||':'||session_id::text order by source_key) from private.heard_steps(tests.id(100))),
 array['four_lists:'||tests.id(311),'input:'||tests.id(312),'interviews:'||tests.id(313),'survey:'||tests.id(310)],'Each source gets its first step in the run of show: a second interviews step on Day 1 comes after the Pre-call one');

-- ---------- Who may use it ----------
set local role authenticated;
select tests.login(1);
select is(tests.hstate()->>'status','ok','The lead reads the state');
select tests.login(2);
select is(tests.hstate()->>'status','ok','A co-facilitator reads it');
do $$ declare n integer; r jsonb; ids integer[]:=array[7,4,3,10,5,9]; i integer; begin
 for i in 1..6 loop
  perform tests.login(ids[i]);
  n:=0;
  r:=public.discover_heard_state(tests.id(100)); if r->>'status'='denied' then n:=n+1; end if;
  r:=public.discover_heard_start(tests.id(100),tests.id(80+i)); if r->>'status'='denied' then n:=n+1; end if;
  r:=public.discover_heard_edit(tests.id(100),'survey','{"line":"x"}'); if r->>'status'='denied' then n:=n+1; end if;
  r:=public.discover_heard_discard(tests.id(100),'survey'); if r->>'status'='denied' then n:=n+1; end if;
  r:=public.discover_heard_applied(tests.id(100),'survey',tests.id(310)); if r->>'status'='denied' then n:=n+1; end if;
  perform set_config('tests.denied_'||i,n::text,true);
 end loop;
end $$;
select is(current_setting('tests.denied_1'),'5','A facilitator of another engagement is denied all five functions');
select is(current_setting('tests.denied_2'),'5','A participant is denied all five');
select is(current_setting('tests.denied_3'),'5','The scribe is denied all five');
select is(current_setting('tests.denied_4'),'5','A team facilitator holding the remote is denied all five');
select is(current_setting('tests.denied_5'),'5','A TV is denied all five');
select is(current_setting('tests.denied_6'),'5','Someone with no place is denied all five');
select throws_ok($$select count(*) from private.heard_rounds$$,'42501',null,'No signed-in role reads the round record directly');
select throws_ok($$select count(*) from private.heard_drafts$$,'42501',null,'or the drafts');
select throws_ok($$select * from private.heard_themes(tests.id(100))$$,'42501',null,'or the themes by source');
select throws_ok($$select public.discover_heard_claim(tests.id(100),tests.id(1),'m','{}')$$,'42501',null,'The worker''s claim is not for a signed-in facilitator');
select throws_ok($$select public.discover_heard_apply(tests.id(1),tests.id(1),'{}','{}')$$,'42501',null,'nor its apply');
select throws_ok($$select public.discover_heard_fail(tests.id(1),tests.id(1),'x','{}')$$,'42501',null,'nor its fail');
select throws_ok($$select public.discover_heard_due(tests.id(100))$$,'42501',null,'nor its due check');
reset role;
set local role anon;
select throws_ok($$select public.discover_heard_state(tests.id(100))$$,'42501',null,'An unsigned browser cannot read the state');
select throws_ok($$select public.discover_heard_start(tests.id(100),tests.id(1))$$,'42501',null,'or start a draft');
select throws_ok($$select public.discover_heard_edit(tests.id(100),'survey','{"line":"x"}')$$,'42501',null,'or edit one');
select throws_ok($$select public.discover_heard_discard(tests.id(100),'survey')$$,'42501',null,'or discard one');
select throws_ok($$select public.discover_heard_applied(tests.id(100),'survey',tests.id(310))$$,'42501',null,'or mark one applied');
reset role;

-- ---------- Nothing accepted yet, and AI off ----------
set local role authenticated;
select tests.login(1);
select is(public.discover_heard_start(tests.id(100),tests.id(500))->>'status','ai_off','With AI off for the engagement, Draft What We Heard says so');
reset role;
update engagements set settings=settings||'{"ai_enabled":true}' where id=tests.id(100);
set local role authenticated;
select tests.login(1);
select is(public.discover_heard_start(tests.id(100),tests.id(500))->>'status','nothing','With no accepted theme there is nothing to draft from');
select is(public.discover_heard_start(tests.id(100),null)->>'status','invalid_request','A press with no id is refused');
select is((select jsonb_agg(s->>'themes' order by s->>'key') from jsonb_array_elements(tests.hstate()->'sources') s),'["0","0","0","0"]'::jsonb,'Every source reads no accepted themes');
select is((select s->'step'->>'title' from jsonb_array_elements(tests.hstate()->'sources') s where s->>'key'='survey'),'What we heard: Survey','and each source names its step');

-- Findings, five notes (three interviews and two input conversations) and accepted themes.
select is(public.discover_total_set(tests.id(100),87)->>'status','ok','The survey total is 87');
select is(public.discover_finding_save(tests.id(100),tests.id(1),'A clear way into groups','31%',27)->>'status','ok','Three findings are saved');
select is(public.discover_finding_save(tests.id(100),tests.id(2),'People under 30','6',6)->>'status','ok','one');
select is(public.discover_finding_save(tests.id(100),tests.id(3),'Decision making is unclear','33%',33)->>'status','ok','two');
select is(tests.note(11,'interview','Tasha Brown','Senior leaders','Newcomers tell me they cannot find a small group. Our groups are full.')->>'status','ok','Five notes are added');
select is(tests.note(12,'interview','Sam Lee','Associate pastor','Priya runs the welcome table and it is warm, but the next step is unclear.')->>'status','ok','one');
select is(tests.note(13,'input','Board','Board conversation','Volunteers are tired. The same ten people do everything.')->>'status','ok','two');
select is(tests.note(14,'input','Staff team','Staff conversation','Volunteers are stretched. Groups are hard to find too.')->>'status','ok','three');
select is(tests.note(15,'interview','Ruth Gomez','Worship pastor','We are proud of the music.')->>'status','ok','four');
select is(tests.theme(21,'conversations','Small groups are hard to find','Newcomers cannot find a way in.',array[tests.id(11),tests.id(12),tests.id(14)])->>'status','ok','A conversation theme rests on two interviews and one input conversation');
select is(tests.theme(22,'conversations','Volunteers are stretched','The same few people carry the work.',array[tests.id(13),tests.id(14)])->>'status','ok','one on two input conversations');
select is(tests.theme(23,'conversations','Worship is a strength','People are proud of the music.',array[tests.id(15)])->>'status','ok','one on a single interview');
select is(tests.theme(24,'four_lists','Volunteers are burning out','Volunteers carry too much.',array[tests.id(904)])->>'status','ok','a Four Helpful Lists theme on one card');
select is(tests.theme(25,'conversations','A draft one','Not accepted',array[tests.id(11)])->>'status','ok','and one that is then undone');
select is(public.discover_theme_act(tests.id(100),tests.id(25),'undo',null)->>'status','ok','so it is not accepted');
reset role;
-- The room's own words, as step 3 stores them against each source. One carries a name, one belongs to an input conversation.
update private.discover_theme_sources set quote='Newcomers tell me they cannot find a small group.' where theme_id=tests.id(21) and note_id=tests.id(11);
update private.discover_theme_sources set quote='Priya runs the welcome table' where theme_id=tests.id(21) and note_id=tests.id(12);
update private.discover_theme_sources set quote='Groups are hard to find too.' where theme_id=tests.id(21) and note_id=tests.id(14);
update private.discover_theme_sources set quote='The same ten people do everything.' where theme_id=tests.id(22) and note_id=tests.id(13);
update private.discover_theme_sources set quote='We are proud of the music.' where theme_id=tests.id(23) and note_id=tests.id(15);
update private.discover_theme_sources set quote='Volunteers are burning out' where theme_id=tests.id(24) and card_id=tests.id(904);

select is((select string_agg(source_key||' '||label||' '||figure||' '||count_text||' '||thin::text,' | ' order by source_key,seq) from private.heard_themes(tests.id(100)) where source_key in('interviews','input')),
 'input Small groups are hard to find 1 of 2 1 of 2 conversations true | input Volunteers are stretched 2 of 2 2 of 2 conversations false | interviews Small groups are hard to find 2 of 3 2 of 3 interviews false | interviews Worship is a strength 1 of 3 1 of 3 interviews true',
 'A conversation theme counts once for each kind of note it rests on, out of the notes of that kind, and a theme on no note of a kind is not in it');
select is((select string_agg(source_key||' '||label||' '||figure||' '||count_text||' '||thin::text,' | ' order by source_key,seq) from private.heard_themes(tests.id(100)) where source_key in('survey','four_lists')),
 'four_lists Volunteers are burning out 5 of 6 5 of 6 people false | survey A clear way into groups 31% 27 of 87 respondents false | survey People under 30 6 6 of 87 respondents true | survey Decision making is unclear 33% 33 of 87 respondents false',
 'A survey theme carries its finding''s own figure and a Four Helpful Lists theme counts the people behind its cards');
select is((select jsonb_agg(t->>'text' order by t->>'text') from private.heard_themes(tests.id(100)) h,jsonb_array_elements(h.quotes) t where h.source_key='interviews'),'["Newcomers tell me they cannot find a small group.","We are proud of the music."]'::jsonb,
 'The interviews'' quotes are interview quotes only, and a quote that carries a name is left out');
select is((select jsonb_agg(t->>'label' order by t->>'text') from private.heard_themes(tests.id(100)) h,jsonb_array_elements(h.quotes) t where h.source_key='input'),'["Board or staff conversation","Board or staff conversation"]'::jsonb,'and the input conversations'' are marked as theirs');
select is((select count(*)::integer from private.heard_themes(tests.id(100)) where theme_id=tests.id(25)),0,'A theme that is not accepted is in no source');

set local role authenticated;
select tests.login(1);
select is((select jsonb_agg((s->>'themes')||'/'||(s->>'thin_themes') order by s->>'key') from jsonb_array_elements(tests.hstate()->'sources') s),'["1/0","2/1","2/1","3/1"]'::jsonb,'The page counts the accepted themes and the thin ones for each source: four_lists, input, interviews, survey');

-- ---------- Draft What We Heard ----------
select is(public.discover_heard_start(tests.id(100),tests.id(500))->>'status','ok','Draft What We Heard starts a round');
select is(public.discover_heard_start(tests.id(100),tests.id(500))->>'status','duplicate','The same press again is the same round');
select is(public.discover_heard_start(tests.id(100),tests.id(501))->>'status','busy','another press while it runs is busy');
select is(tests.hstate()->'round'->>'status','pending','The page sees it pending');
reset role;
select is((select public.discover_heard_due(tests.id(100))),true,'The worker sees it due');
set local role service_role;
select is(public.discover_heard_claim(tests.id(100),tests.id(600),'x'::text,'{"other":"v"}')->>'status','invalid_request','A claim with no prompt version is refused');
select is(public.discover_heard_claim(tests.id(100),tests.id(600),'fake-model','{"draft_what_we_heard":"heard-draft@1"}')->>'status','claimed','The worker claims the round');
select is(public.discover_heard_claim(tests.id(100),tests.id(601),'fake-model','{"draft_what_we_heard":"heard-draft@1"}')->>'status','busy','A second claim while the lease holds is busy');
reset role;
select is((select job||' '||model||' '||prompt_version||' '||coalesce(session_id::text,'none') from private.ai_runs where engagement_id=tests.id(100) and job='draft_what_we_heard'),'draft_what_we_heard fake-model heard-draft@1 none','The run is logged with its job, model and prompt version and no session');
select is((select jsonb_agg(s->>'key' order by ord) from private.ai_runs r,jsonb_array_elements(r.inputs->'sources') with ordinality x(s,ord) where r.job='draft_what_we_heard'),'["survey","four_lists","input","interviews"]'::jsonb,'The model reads each source that has a step and accepted themes, in the templates'' order');
select is((select count(*)::integer from private.ai_runs r,jsonb_array_elements(r.inputs->'sources') s,jsonb_array_elements(s.value->'themes') x where r.job='draft_what_we_heard' and r.engagement_id=tests.id(100)),8,'with the accepted themes of each');
select ok((select not (inputs::text ~* 'Tasha|Brown|Sam Lee|Ruth|Gomez|Senior leaders|Associate pastor|Board conversation|Staff team|Worship pastor|Priya|Shah|Ortiz|Scribe') from private.ai_runs where job='draft_what_we_heard' and engagement_id=tests.id(100)),'No person, no note title and no attendee is in what the model reads');
select ok((select not (inputs::text ~* 'Priya runs') from private.ai_runs where job='draft_what_we_heard' and engagement_id=tests.id(100)),'and a quote that carried a name is not there');
select is((select inputs->'sources'->0->>'basis' from private.ai_runs where job='draft_what_we_heard' and engagement_id=tests.id(100)),'87 respondents','The survey''s basis is its total');
select is((select string_agg(s->>'basis','|' order by ord) from private.ai_runs r,jsonb_array_elements(r.inputs->'sources') with ordinality x(s,ord) where r.job='draft_what_we_heard'),'87 respondents|6 people|2 conversations|3 interviews','the others'' are the people, conversations or interviews they are out of');

-- The apply keeps a headline only under the rules that are code.
select is((select jsonb_array_length(output->'refused') from private.ai_runs where job='draft_what_we_heard' and engagement_id=tests.id(100)),null,'Nothing has been applied yet');
set local role service_role;
select is(public.discover_heard_apply(tests.run(),tests.id(699),'{"headlines":[]}','{}')->>'status','stale','An apply with a lease that is not the claim''s is stale');
select is(public.discover_heard_apply(tests.run(),tests.id(600),
 jsonb_build_object('headlines',jsonb_build_array(
  jsonb_build_object('source','survey','lead',tests.tref('A clear way into groups'),'themes',jsonb_build_array(tests.tref('A clear way into groups'),tests.tref('Decision making is unclear'),'t99'),
   'line','named **a clear way into groups** as what to improve','detail','27 of 87 survey answers asked for a clear way into a group.','quotes',jsonb_build_array()),
  jsonb_build_object('source','survey','lead',tests.tref('People under 30'),'line','a second survey headline is ignored','detail','x'),
  jsonb_build_object('source','interviews','lead',tests.tref('Small groups are hard to find','interviews'),'themes',jsonb_build_array(tests.tref('Small groups are hard to find','interviews')),
   'line','interviews named **small groups** as hard to find','detail','Two of three interviews said newcomers cannot find a way in.',
   'quotes',jsonb_build_array(tests.qref('Small groups are hard to find','Newcomers','interviews'),'q99')),
  jsonb_build_object('source','input','lead','t99','line','a lead that is not on the page','detail','x'),
  jsonb_build_object('source','input','lead',tests.tref('Volunteers are stretched'),'line','Ruth said volunteers are stretched','detail','The same people carry the work.'),
  jsonb_build_object('source','input','lead',tests.tref('Volunteers are stretched'),'line','9 conversations said volunteers are stretched','detail','The same people carry the work.'),
  jsonb_build_object('source','input','lead',tests.tref('Volunteers are stretched'),'line','**volunteers** are **stretched**','detail','The same people carry the work.'),
  jsonb_build_object('source','input','lead',tests.tref('Volunteers are stretched'),'line','"Volunteers are stretched"','detail','The same people carry the work.'),
  jsonb_build_object('source','input','lead',tests.tref('Volunteers are stretched'),'line','conversations named **volunteers** as stretched','detail','Both input conversations said the same few people carry the work.'),
  jsonb_build_object('source','four_lists','lead',tests.tref('Volunteers are burning out'),'line','people on the lists said **volunteers** are burning out','detail','Five of six people wrote or agreed with this.'),
  jsonb_build_object('source','nowhere','lead','t1','line','x','detail','x'))),
 '{"input_tokens":1200,"output_tokens":300,"cost_usd":0.02,"ms":4200}')->>'offered','4','The apply keeps one headline for each of the four sources');
select is(public.discover_heard_apply(tests.lastrun(),tests.id(600),'{"headlines":[]}','{}')->>'status','stale','A run that has finished is not applied twice');
reset role;
select is((select count(*)::integer from private.heard_drafts where engagement_id=tests.id(100) and not deleted),4,'Four drafts stand, one for each source');
select is((select string_agg(r->>'source'||':'||(r->>'reason'),',' order by r->>'source',r->>'reason') from private.ai_runs a,jsonb_array_elements(a.output->'refused') r where a.job='draft_what_we_heard' and a.engagement_id=tests.id(100)),
 'input:name,input:number,input:text,input:text,input:unsourced','Refused: no lead on the page, a name, a number no source has, two bold phrases, a quote mark');
select is((select output->>'offered'||' '||(output->>'kept') from private.ai_runs where job='draft_what_we_heard' and engagement_id=tests.id(100)),'4 0','The run records what it offered and kept');
select is(tests.draft('survey','number'),'31%','The number on a headline is its lead theme''s own figure');
select is(tests.draft('interviews','number'),'2 of 3','a count for the others');
select is(tests.draft('survey','line'),'named **a clear way into groups** as what to improve','The line is the model''s, with its one bold phrase');
select is(tests.draft('survey','basis'),'87 respondents','The basis for the source line is kept');
select is((select count(*)::integer from private.heard_drafts where engagement_id=tests.id(100) and not deleted and thin),0,'None of these leads is thin');
select is((select jsonb_agg(c->>'label'||' '||(c->>'count') order by c->>'label') from private.heard_drafts d,jsonb_array_elements(d.rests) c where d.source_key='survey' and d.engagement_id=tests.id(100) and not d.deleted),
 '["A clear way into groups 27 of 87 respondents","Decision making is unclear 33 of 87 respondents"]'::jsonb,'A headline shows what it rests on, and an unknown ref is dropped');
select is((select jsonb_array_length(quotes) from private.heard_drafts where source_key='interviews' and engagement_id=tests.id(100) and not deleted),1,'Quotes are chosen by ref and an unknown ref is dropped');
select is((select quotes->0->>'text'||' / '||(quotes->0->>'label') from private.heard_drafts where source_key='interviews' and engagement_id=tests.id(100) and not deleted),'Newcomers tell me they cannot find a small group. / Leadership interview','A quote is the room''s own words, word for word, marked with its source and never a person');
select is((select quotes->0->>'text' from private.heard_drafts where source_key='four_lists' and engagement_id=tests.id(100) and not deleted),'Volunteers are burning out','With no quote chosen, the lead theme''s own quote stands in');
select is((select count(*)::integer from private.heard_drafts where engagement_id=tests.id(100) and not deleted and (line||detail||quotes::text||rests::text) ~* 'Tasha|Sam Lee|Ruth|Priya|Shah|Ortiz|Gomez'),0,'No draft carries a name');
select is((select count(*)::integer from private.heard_drafts where engagement_id=tests.id(100) and ai_run is not null and not by_hand and not edited and applied_at is null),4,'Each is an AI draft, not yet edited or applied');
select is((select input_tokens||' '||output_tokens||' '||status from private.ai_runs where job='draft_what_we_heard' and engagement_id=tests.id(100)),'1200 300 ok','Tokens and status are logged');
select is((select status from private.heard_rounds where engagement_id=tests.id(100)),'ready','The round is ready');

-- ---------- The page's state with drafts ----------
set local role authenticated;
select tests.login(2);
select is((select s->'draft'->>'line' from jsonb_array_elements(tests.hstate()->'sources') s where s->>'key'='survey'),'named **a clear way into groups** as what to improve','The co-facilitator reads the same draft');
select is((select s->'draft'->>'stale' from jsonb_array_elements(tests.hstate()->'sources') s where s->>'key'='survey'),'false','A draft is not stale until a theme changes after it');
select is(tests.hstate()->'round'->>'offered','4','and the page reads what the round offered');
reset role;
update private.discover_themes set label='A clearer way into groups' where id=(select theme_id from private.discover_theme_sources where finding_id=tests.id(1));
set local role authenticated;
select tests.login(1);
select is((select s->'draft'->>'stale' from jsonb_array_elements(tests.hstate()->'sources') s where s->>'key'='survey'),'true','A theme that changes after the draft marks it stale');

-- ---------- Edit, discard, applied ----------
select is(public.discover_heard_edit(tests.id(100),'survey','{"number":"31%","line":"named **a clearer way into groups** as what to improve","detail":"27 of 87 asked for a clear way into a group.\n\nRead it with care."}')->>'status','ok','The facilitator edits a draft');
select is(tests.draft('survey','edited'),'true','It is marked edited');
select is(tests.draft('survey','detail'),E'27 of 87 asked for a clear way into a group.\n\nRead it with care.','and a paragraph break in the detail is kept');
select is(public.discover_heard_edit(tests.id(100),'survey','{"line":"one **two** and **three**"}')->>'status','invalid_request','Two bold phrases are refused');
select is(public.discover_heard_edit(tests.id(100),'survey','{"line":""}')->>'status','invalid_request','an empty line is refused');
select is(public.discover_heard_edit(tests.id(100),'survey',jsonb_build_object('line',repeat('x',141)))->>'status','invalid_request','a line over 140 characters is refused');
select is(public.discover_heard_edit(tests.id(100),'survey','{"line":"fine","number":"1234567890123"}')->>'status','invalid_request','and a number over 12');
select is(public.discover_heard_edit(tests.id(100),'poll','{"line":"x"}')->>'status','invalid_request','A source that is not one of the four is refused');
select is(public.discover_heard_edit(tests.id(100),'survey','{"line":"x","keep":"all"}')->>'status','invalid_request','and so is a keep that is not a list');
select is(public.discover_heard_edit(tests.id(100),'interviews','{"line":"Interviews named **small groups**","number":"2 of 3","detail":"Two interviews.","keep":[]}')->>'status','ok','Quotes can be taken out with keep');
select is(tests.draft('interviews','quotes'),'[]','and are gone from the draft');
select is(public.discover_heard_discard(tests.id(100),'interviews')->>'status','ok','A draft can be discarded');
select is(public.discover_heard_discard(tests.id(100),'interviews')->>'status','unchanged','and discarding again changes nothing');
select is(public.discover_heard_edit(tests.id(100),'interviews','{"line":"Interviews named **groups** as hard to find","number":"2 of 3"}')->>'status','ok','A source with no draft takes one written by hand');
select is(tests.draft('interviews','by_hand')||' '||coalesce(tests.draft('interviews','ai_run'),'none')||' '||tests.draft('interviews','thin'),'true none false','It is marked by hand, has no AI run and is not thin');
select is(public.discover_heard_applied(tests.id(100),'survey',tests.id(310))->>'status','ok','Applied is recorded for the source''s own step');
select is(public.discover_heard_applied(tests.id(100),'survey',tests.id(311))->>'status','not_found','but not for another source''s step');
select is(public.discover_heard_applied(tests.id(100),'survey',tests.id(320))->>'status','not_found','or for another engagement''s');
select is((select s->'draft'->>'applied_at' is not null from jsonb_array_elements(tests.hstate()->'sources') s where s->>'key'='survey'),true,'The page reads it as applied');
select is(public.discover_heard_edit(tests.id(100),'survey','{"line":"named **a clearer way** as what to improve"}')->>'status','ok','Editing an applied draft');
select is((select s->'draft'->>'applied_at' from jsonb_array_elements(tests.hstate()->'sources') s where s->>'key'='survey'),null,'puts it back to not yet applied');

-- A second round: a draft the facilitator edited and has not applied is kept; the rest are replaced; a thin lead is marked thin.
select is(public.discover_heard_discard(tests.id(100),'interviews')->>'status','ok','The hand-written interviews draft is put away so the next round can offer one');
select is(public.discover_heard_start(tests.id(100),tests.id(502))->>'status','ok','Draft What We Heard can be pressed again once the round is ready');
reset role;
select is((select public.discover_heard_due(tests.id(100))),true,'and it is due');
set local role service_role;
select is(public.discover_heard_claim(tests.id(100),tests.id(610),'fake-model','{"draft_what_we_heard":"heard-draft@1"}')->>'status','claimed','The worker claims it');
select is(public.discover_heard_apply(tests.run(),tests.id(610),
 jsonb_build_object('headlines',jsonb_build_array(
  jsonb_build_object('source','survey','lead',tests.tref('People under 30'),'line','survey answers came from **people under 30**','detail','Six answers cannot speak for every young adult.'),
  jsonb_build_object('source','interviews','lead',tests.tref('Worship is a strength'),'line','interview named **worship** as a strength','detail','One of three interviews said people are proud of the music.',
   'quotes',jsonb_build_array(tests.qref('Worship is a strength','music'))))),'{}')->>'status','ok','A second apply');
reset role;
select is((select output->>'offered'||' '||(output->>'kept') from private.ai_runs where job='draft_what_we_heard' and engagement_id=tests.id(100) and id<>(select ai_run from private.heard_drafts where source_key='four_lists' and not deleted and engagement_id=tests.id(100))),'1 1','It offers one and keeps the one the facilitator edited');
select is(tests.draft('survey','line'),'named **a clearer way** as what to improve','The edited survey draft is as the facilitator left it');
select is(tests.draft('interviews','thin'),'true','A thin lead makes a thin draft');
select is(tests.draft('interviews','thin_reason'),'1 of 3 interviews','with its count as the reason');
select is(tests.draft('interviews','number'),'1 of 3','and its own figure');
select is((select count(*)::integer from private.heard_drafts where engagement_id=tests.id(100) and source_key='interviews'),3,'Discarded and replaced drafts stay as deleted rows, never overwritten');
select is((select count(*)::integer from private.heard_drafts where engagement_id=tests.id(100) and not deleted),4,'and four drafts stand');

-- ---------- AI off while drafting, failure and retry ----------
set local role authenticated;
select tests.login(1);
select is(public.discover_heard_start(tests.id(100),tests.id(503))->>'status','ok','Another round starts');
reset role;
set local role service_role;
select is(public.discover_heard_claim(tests.id(100),tests.id(620),'fake-model','{"draft_what_we_heard":"heard-draft@1"}')->>'status','claimed','and is claimed');
select is(public.discover_heard_fail(tests.run(),tests.id(620),'timeout','{"ms":9000}')->>'gave_up','false','A first failure is retried');
reset role;
select is((select status||' '||attempts from private.heard_rounds where engagement_id=tests.id(100)),'pending 1','The round waits to try again');
set local role service_role;
select is(public.discover_heard_claim(tests.id(100),tests.id(621),'fake-model','{"draft_what_we_heard":"heard-draft@1"}')->>'status','cooling','and a claim during the pause is cooling');
reset role;
update private.heard_rounds set last_failed_at=now()-interval '5 minutes' where engagement_id=tests.id(100);
set local role service_role;
select is(public.discover_heard_claim(tests.id(100),tests.id(622),'fake-model','{"draft_what_we_heard":"heard-draft@1"}')->>'status','claimed','After the pause it is claimed again');
select is(public.discover_heard_fail(tests.run(),tests.id(622),'unavailable','{"ms":9000}')->>'gave_up','true','A second failure gives up');
select is(public.discover_heard_fail(tests.lastrun(),tests.id(622),'unavailable','{}')->>'status','stale','and a run that has failed is not failed twice');
reset role;
select is((select status from private.heard_rounds where engagement_id=tests.id(100)),'failed','The round is failed');
select is((select count(*)::integer from private.heard_drafts where engagement_id=tests.id(100) and not deleted),4,'and the drafts already there are untouched');
select is((select count(*)::integer from private.ai_runs where engagement_id=tests.id(100) and job='draft_what_we_heard' and status='failed' and error in('timeout','unavailable')),2,'Both failures are in the run log');
set local role authenticated;
select tests.login(1);
select is(tests.hstate()->'round'->>'status','failed','The page reads the failure');
select is(public.discover_heard_edit(tests.id(100),'input','{"line":"Input conversations named **volunteers**","number":"2 of 2"}')->>'status','ok','and the facilitator writes one by hand meanwhile');
reset role;
update engagements set settings=settings||'{"ai_enabled":false}' where id=tests.id(100);
set local role authenticated;
select tests.login(1);
select is(public.discover_heard_start(tests.id(100),tests.id(504))->>'status','ai_off','With AI off, Draft What We Heard says so again');
select is(public.discover_heard_edit(tests.id(100),'four_lists','{"line":"Edited with AI off","number":"5 of 6"}')->>'status','ok','but editing still works');
reset role;
update engagements set settings=settings||'{"ai_enabled":true}' where id=tests.id(100);

-- ---------- A source with no step ----------
update sessions set deleted=true where id=tests.id(312);
select is((select count(*)::integer from private.heard_steps(tests.id(100)) where source_key='input'),0,'A source whose step is removed has none');
set local role authenticated;
select tests.login(1);
select is(public.discover_heard_edit(tests.id(100),'input','{"line":"No step to hold this"}')->>'status','no_step','and a draft for it is refused');
select is((select s->'step' from jsonb_array_elements(tests.hstate()->'sources') s where s->>'key'='input'),'null'::jsonb,'The page reads it as no step');
reset role;
update sessions set deleted=false where id=tests.id(312);

-- ---------- The practice room: Clear test answers and the reset ----------
insert into engagements(id,church_id,title,type) values('90000000-0000-4000-8000-000000000010',tests.id(200),'Permanent practice','practice');
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values('90000000-0000-4000-8000-000000000010',tests.id(701),'lead');
insert into sessions(id,engagement_id,title,part,position,state,interaction,options) values(tests.id(330),'90000000-0000-4000-8000-000000000010','What we heard: Survey','Pre-call',4,'draft','content','{"screen":"headline","source":"Congregational survey"}'),
 (tests.id(331),'90000000-0000-4000-8000-000000000010','What we heard: Interviews','Pre-call',7,'draft','content','{"screen":"headline","source":"Leadership interviews"}');
set local role authenticated;
select tests.login(1);
select is(public.discover_heard_edit('90000000-0000-4000-8000-000000000010','survey','{"line":"Real draft before any rehearsal","number":"5"}')->>'status','ok','A draft written in the practice room before any rehearsal');
select is(public.rehearsal_control('90000000-0000-4000-8000-000000000010',tests.id(851),'start')->>'status','ok','The rehearsal starts');
select is(public.discover_heard_edit('90000000-0000-4000-8000-000000000010','interviews','{"line":"Draft made in the rehearsal","number":"3"}')->>'status','ok','and one during it');
reset role;
select is((select test from private.heard_drafts where engagement_id='90000000-0000-4000-8000-000000000010' and source_key='interviews' and not deleted),true,'A draft made in a rehearsal is a test');
select is((select test from private.heard_drafts where engagement_id='90000000-0000-4000-8000-000000000010' and source_key='survey' and not deleted),false,'and one made before it is not');
set local role authenticated;
select tests.login(1);
select is(public.rehearsal_control('90000000-0000-4000-8000-000000000010',tests.id(852),'end')->>'status','ok','The rehearsal ends');
select is(public.rehearsal_control('90000000-0000-4000-8000-000000000010',tests.id(853),'clear')->>'status','ok','Clear test answers runs');
reset role;
select is((select deleted from private.heard_drafts where engagement_id='90000000-0000-4000-8000-000000000010' and source_key='interviews' order by seq desc limit 1),true,'It puts away the test draft');
select is((select deleted from private.heard_drafts where engagement_id='90000000-0000-4000-8000-000000000010' and source_key='survey' limit 1),false,'and keeps the one made before the rehearsal');
select is((select count(*)::integer from private.heard_drafts where engagement_id=tests.id(100) and not deleted),4,'and no draft in another engagement');
insert into private.heard_rounds(engagement_id,status) values('90000000-0000-4000-8000-000000000010','ready');
set local role authenticated;
select tests.login(1);
select is(public.reset_practice_room(),true,'The practice room resets');
reset role;
select is((select count(*)::integer from private.heard_drafts where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted),0,'No draft is left in the practice room');
select is((select count(*)::integer from private.heard_rounds where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted),0,'and no round');
select is((select count(*)::integer from private.heard_drafts where engagement_id=tests.id(100) and not deleted),4,'The first engagement keeps its drafts');
select is((select count(*)::integer from private.survey_findings where engagement_id=tests.id(100) and not deleted),3,'and earlier steps'' records are still intact (the reset still runs them)');

select * from finish();
rollback;
