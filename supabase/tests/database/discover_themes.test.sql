-- Milestone 6, step 3: Discover themes drafted from conversation notes and Four Helpful Lists cards. The draft round and the worker's
-- claim, apply and fail; accept, rename, merge and reject; a theme by hand; the accepted-themes function steps 4 and 5 read; and who may
-- reach any of it: the lead, a co-facilitator, another engagement's facilitator, a participant, the scribe, a team facilitator, the TV and an unsigned browser.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('8d030000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(1000+n))::text,true); end $$;
create function tests.state() returns jsonb language sql as $$ select public.discover_state(tests.id(100)) $$;
create function tests.save(n integer,title text,figure text,rests integer) returns jsonb language sql as $$ select public.discover_finding_save(tests.id(100),tests.id(n),title,figure,rests) $$;
create function tests.note(n integer,kind text,person text,title text,body text,source text default 'paste') returns jsonb language sql as $$ select public.discover_note_add(tests.id(100),tests.id(n),kind,person,title,body,source) $$;
create function tests.count_of(t text) returns integer language plpgsql security definer set search_path='' as $$ declare n integer; begin
 execute format('select count(*)::integer from private.%I where engagement_id=$1 and not deleted',t) into n using tests.id(100); return n; end $$;
create function tests.q(sql text) returns text language plpgsql security definer set search_path='' as $$ declare v text; begin execute sql into v; return v; end $$;
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
-- Ben holds the remote for a team-led block: a team facilitator, who is a participant with a remote and no Clearway sign-in.
update room_states set remote_holder_id=tests.id(510) where engagement_id=tests.id(100);
insert into private.tv_devices(id,proof,engagement_id,label,paired_at) values(tests.id(450),repeat('a',64),tests.id(100),'Front TV',now());
insert into private.live_tv_sessions(id,engagement_id,auth_user_id,auth_session_id,device_id) values(tests.id(400),tests.id(100),tests.id(5),tests.id(1005),tests.id(450));
insert into sessions(id,engagement_id,title,part,position,state,interaction) values
 (tests.id(310),tests.id(100),'Five Lenses: Community','Day 1',1,'ready','wall'),
 (tests.id(320),tests.id(101),'Elsewhere','Day 1',1,'ready','wall');
create function tests.tstate() returns jsonb language sql as $$ select public.discover_themes_state(tests.id(100)) $$;
create function tests.act(theme uuid,action text,p jsonb default null) returns jsonb language sql as $$ select public.discover_theme_act(tests.id(100),theme,action,p) $$;
create function tests.themeid(lbl text) returns uuid language plpgsql security definer set search_path='' as $$ declare v uuid; begin
 select id into v from private.discover_themes where engagement_id=tests.id(100) and label=lbl and not deleted; return v; end $$;
create function tests.field(lbl text,col text) returns text language plpgsql security definer set search_path='' as $$ declare v text; begin
 execute format('select %I::text from private.discover_themes where engagement_id=$1 and label=$2 and not deleted',col) into v using tests.id(100),lbl; return v; end $$;
grant execute on all functions in schema tests to authenticated,anon,service_role;

-- ---------- The records ----------
select is((select count(*) from pg_class where oid='private.discover_theme_rounds'::regclass and relrowsecurity and relforcerowsecurity),1::bigint,'The round record forces row-level security');
select is((select count(*) from information_schema.role_table_grants where grantee in('authenticated','anon','public') and table_schema='private' and table_name='discover_theme_rounds'),0::bigint,'and no browser or anonymous role has a grant on it');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('discover_themes_state','discover_theme_act','discover_theme_add','discover_draft_start','discover_theme_due','discover_theme_claim','discover_theme_apply','discover_theme_fail') and p.prosecdef),0::bigint,'Every public themes function is a security invoker wrapper');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in('discover_themes_state','discover_theme_act','discover_theme_add','discover_draft_start','discover_theme_due','discover_theme_claim','discover_theme_apply','discover_theme_fail','discover_accepted_themes','discover_recount') and p.prosecdef),10::bigint,'and every private one is a security definer');
select is((select count(*) from pg_proc p where p.proname='four_lists_cards_for_themes' and p.pronamespace='private'::regnamespace),1::bigint,'The cards contract function exists (the stub, or step 2''s own)');
select is((select pg_get_function_result(p.oid) from pg_proc p where p.proname='four_lists_cards_for_themes' and p.pronamespace='private'::regnamespace),'TABLE(card_id uuid, session_id uuid, "column" text, text text, agree integer, folded_ids uuid[])','with the signature step 2 gives it');
select throws_ok($$insert into private.ai_runs(engagement_id,session_id,job,model,prompt_version,inputs) values(tests.id(100),null,'combine_words','m','v','{}')$$,'23514',null,'A live job still needs a session');
select lives_ok($$insert into private.ai_runs(engagement_id,session_id,job,model,prompt_version,inputs,status,finished_at) values(tests.id(100),null,'draft_discover_themes','m','v','{}','failed',now())$$,'The theme job is engagement-level and has none');
select lives_ok($$insert into private.ai_runs(engagement_id,session_id,job,model,prompt_version,inputs,status,finished_at) values(tests.id(100),null,'overnight_draft','m','v','{}','failed',now())$$,'The overnight draft still has none either');
select lives_ok($$insert into private.ai_runs(engagement_id,session_id,job,model,prompt_version,inputs,status,finished_at) values(tests.id(100),tests.id(310),'propose_candidates','m','v','{}','failed',now())$$,'An earlier job (candidates) is still allowed');
select lives_ok($$insert into private.ai_runs(engagement_id,session_id,job,model,prompt_version,inputs,status,finished_at) values(tests.id(100),tests.id(310),'fold_four_lists','m','v','{}','failed',now())$$,'and so is step 2''s fold job');
delete from private.ai_runs where engagement_id=tests.id(100);

-- ---------- Thin and strong are the same rules in code (lib/discover) and in the database ----------
select is((select array_agg(private.discover_is_thin(s,r,o)::text order by ord) from (values (1,'survey',9,87),(2,'survey',10,87),(3,'survey',10,200),(4,'survey',9,null),(5,'survey',10,null),(6,'conversations',1,5),(7,'conversations',2,5),(8,'conversations',0,0),(9,'four_lists',1,8),(10,'four_lists',2,8)) v(ord,s,r,o)),
 array['true','false','true','true','false','true','false','true','true','false'],'Thin: a survey theme under 10 respondents or under 10 percent; a conversation or card theme on one source or fewer');
select is((select array_agg(private.discover_is_strong(s,r,o)::text order by ord) from (values (1,'survey',35,87),(2,'survey',34,87),(3,'survey',10,null),(4,'conversations',2,5),(5,'conversations',1,2),(6,'conversations',4,5),(7,'four_lists',3,8),(8,'four_lists',2,8),(9,'survey',9,10)) v(ord,s,r,o)),
 array['true','false','false','true','false','true','false','false','false'],'Strong: 40 percent or more and not thin');

-- ---------- Who may use the themes ----------
set local role authenticated;
select tests.login(1);
select is(tests.tstate()->>'status','ok','The lead reads the themes');
select tests.login(2);
select is(tests.tstate()->>'status','ok','A co-facilitator reads them');
do $$ declare n integer; r jsonb; ids integer[]:=array[7,4,3,10,5,9]; i integer; begin
 for i in 1..6 loop
  perform tests.login(ids[i]);
  n:=0;
  r:=public.discover_themes_state(tests.id(100)); if r->>'status'='denied' then n:=n+1; end if;
  r:=public.discover_theme_act(tests.id(100),tests.id(1),'accept',null); if r->>'status'='denied' then n:=n+1; end if;
  r:=public.discover_theme_add(tests.id(100),tests.id(70+i),'conversations','A theme','',null); if r->>'status'='denied' then n:=n+1; end if;
  r:=public.discover_draft_start(tests.id(100),tests.id(80+i)); if r->>'status'='denied' then n:=n+1; end if;
  perform set_config('tests.denied_'||i,n::text,true);
 end loop;
end $$;
select is(current_setting('tests.denied_1'),'4','A facilitator of another engagement is denied all four functions');
select is(current_setting('tests.denied_2'),'4','A participant is denied all four');
select is(current_setting('tests.denied_3'),'4','The scribe is denied all four');
select is(current_setting('tests.denied_4'),'4','A team facilitator holding the remote is denied all four');
select is(current_setting('tests.denied_5'),'4','A TV is denied all four');
select is(current_setting('tests.denied_6'),'4','Someone with no place is denied all four');
select throws_ok($$select count(*) from private.discover_theme_rounds$$,'42501',null,'No signed-in role reads the round record directly');
select throws_ok($$select * from private.discover_accepted_themes(tests.id(100))$$,'42501',null,'or the accepted themes function');
select throws_ok($$select public.discover_theme_claim(tests.id(100),tests.id(1),'m','{}')$$,'42501',null,'The worker''s claim is not for a signed-in facilitator');
select throws_ok($$select public.discover_theme_apply(tests.id(1),tests.id(1),'{}','{}')$$,'42501',null,'nor its apply');
select throws_ok($$select public.discover_theme_fail(tests.id(1),tests.id(1),'x','{}')$$,'42501',null,'nor its fail');
select throws_ok($$select public.discover_theme_due(tests.id(100))$$,'42501',null,'nor its due check');
reset role;
set local role anon;
select throws_ok($$select public.discover_themes_state(tests.id(100))$$,'42501',null,'An unsigned browser cannot read the themes');
select throws_ok($$select public.discover_draft_start(tests.id(100),tests.id(1))$$,'42501',null,'or start a draft');
select throws_ok($$select public.discover_theme_act(tests.id(100),tests.id(1),'accept',null)$$,'42501',null,'or accept a theme');
select throws_ok($$select public.discover_theme_add(tests.id(100),tests.id(1),'conversations','x','',null)$$,'42501',null,'or add one');
reset role;

-- ---------- Start: nothing to read, AI off, then a round ----------
set local role authenticated;
select tests.login(1);
select is(public.discover_draft_start(tests.id(100),tests.id(500))->>'status','ai_off','With AI off for the engagement, Draft themes says so');
reset role;
update engagements set settings=settings||'{"ai_enabled":true}' where id=tests.id(100);
set local role authenticated;
select tests.login(1);
select is(public.discover_draft_start(tests.id(100),tests.id(500))->>'status','nothing','With no notes and no cards there is nothing to read');
select is(public.discover_draft_start(tests.id(100),null)->>'status','invalid_request','A press with no id is refused');

-- Five conversations and a set of cards. The names in the people field and the room are the names a theme must never carry.
select is(tests.note(1,'interview','Tasha Brown','Senior leaders','Newcomers tell me they cannot find a small group. Our groups are full and nobody knows how to join. We need a clear way in.')->>'status','ok','Five conversations are added');
select is(tests.note(2,'interview','Sam Lee','Associate pastor','I think small groups are hard to find for new families. Priya runs the welcome table and it is warm, but the next step is unclear.')->>'status','ok','one');
select is(tests.note(3,'input','Board','Board conversation','Volunteers are tired. The same ten people do everything.')->>'status','ok','two');
select is(tests.note(4,'input','Staff team','Staff conversation','Volunteers are stretched and we burn out our best people. Groups are hard to find too.')->>'status','ok','three');
select is(tests.note(5,'interview','Ruth Gomez','Worship pastor','We are proud of the music. Giving is steady and we are grateful.')->>'status','ok','four');
reset role;
insert into submissions(id,engagement_id,session_id,attendee_id,text,answers,phone_sent_at) values
 (tests.id(901),tests.id(100),tests.id(310),tests.id(504),'Easy to join a group','[]','2026-11-06 10:00:00+00'),
 (tests.id(902),tests.id(100),tests.id(310),tests.id(510),'A way into groups for newcomers','[]','2026-11-06 10:00:01+00');
-- A test-only replacement for step 2's function, inside this transaction only: the cards step 3 reads through the contract.
create or replace function private.four_lists_cards_for_themes(p_engagement uuid) returns table(card_id uuid,session_id uuid,"column" text,"text" text,agree integer,folded_ids uuid[])
language sql stable security definer set search_path='' as $$
 select v.a,v.b,v.c,v.d,v.e,v.f from (values
  (tests.id(901),tests.id(310),'right','Easy to join a group',0,array[]::uuid[]),
  (tests.id(902),tests.id(310),'missing','A way into groups for newcomers',1,array[tests.id(903)]),
  (tests.id(904),tests.id(310),'wrong','Volunteers are burning out',4,array[]::uuid[]),
  (tests.id(905),tests.id(310),'confused','Who decides what we do next?',2,array[]::uuid[]))
  v(a,b,c,d,e,f) where p_engagement=tests.id(100)
$$;
set local role authenticated;
select tests.login(1);
select is(public.discover_themes_state(tests.id(100))->'inputs','{"notes":5,"cards":4}'::jsonb,'The state counts what a draft would read');
select is(public.discover_themes_state(tests.id(100))->'round','null'::jsonb,'and there is no round yet');
select is(public.discover_draft_start(tests.id(100),tests.id(500))->>'status','ok','Draft themes starts a round');
select is(public.discover_draft_start(tests.id(100),tests.id(500))->>'status','duplicate','The same press again is the same round');
select is(public.discover_draft_start(tests.id(100),tests.id(501))->>'status','busy','another press while it runs is busy');
select is(public.discover_themes_state(tests.id(100))->'round'->>'status','pending','The page sees it pending');
reset role;
select is((select public.discover_theme_due(tests.id(100))),true,'The worker sees it due');
set local role service_role;
select is(public.discover_theme_claim(tests.id(100),tests.id(600),'x'::text,'{"other":"v"}')->>'status','invalid_request','A claim with no prompt version is refused');
select is(public.discover_theme_claim(tests.id(100),tests.id(600),'fake-model','{"draft_discover_themes":"themes-draft@1"}')->>'status','claimed','The worker claims it');
select is(public.discover_theme_claim(tests.id(100),tests.id(601),'fake-model','{"draft_discover_themes":"themes-draft@1"}')->>'status','busy','A second worker is told it is busy');
select is(public.discover_theme_due(tests.id(100)),false,'and nothing is due while the lease holds');
reset role;
select is((select job||' '||model||' '||prompt_version||' '||coalesce(session_id::text,'none') from private.ai_runs where engagement_id=tests.id(100) and job='draft_discover_themes'),'draft_discover_themes fake-model themes-draft@1 none','The run is logged with its model and prompt version');
select is((select jsonb_array_length(inputs->'notes') from private.ai_runs where job='draft_discover_themes' and engagement_id=tests.id(100)),5,'with five notes');
select is((select jsonb_array_length(inputs->'cards') from private.ai_runs where job='draft_discover_themes' and engagement_id=tests.id(100)),4,'and four cards');
select is((select (inputs->'notes'->0)->>'ref' from private.ai_runs where job='draft_discover_themes' and engagement_id=tests.id(100)),'n1','under short refs');
select ok((select not (inputs::text ~* 'Tasha|Brown|Sam Lee|Ruth|Gomez|Senior leaders|Associate pastor|Board conversation|Staff team|Worship pastor') from private.ai_runs where job='draft_discover_themes' and engagement_id=tests.id(100)),'The run holds no person and no note title: only text and kind');
select ok((select (inputs->'notes'->0) ?& array['ref','id','kind','text'] and not ((inputs->'notes'->0) ? 'person') from private.ai_runs where job='draft_discover_themes' and engagement_id=tests.id(100)),'A note is its ref, id, kind and text and nothing more');
select is((select inputs->'left_out' from private.ai_runs where job='draft_discover_themes' and engagement_id=tests.id(100)),'0'::jsonb,'None was left out for length');
select is((select status from private.discover_theme_rounds where engagement_id=tests.id(100)),'drafting','The round is drafting');

-- ---------- Apply: what is kept is code ----------
set local role service_role;
select is(public.discover_theme_apply((select id from private.ai_runs where job='draft_discover_themes' and engagement_id=tests.id(100)),tests.id(999),'{"themes":[]}','{}')->>'status','stale','A reply under a lease that is not the claim''s is refused');
reset role;
select set_config('tests.out1',$j${"themes":[
 {"source":"conversations","label":"Small groups are hard to find","detail":"Newcomers cannot find a way into a group.","sources":["n1","n2","n4"],"quote":{"text":"Newcomers tell me they cannot find a small group.","source":"n1"}},
 {"source":"conversations","label":"Volunteers are stretched","detail":"The same few people carry the work.","sources":["n3","n4"],"quote":{"text":"The same ten people do everything.","source":"n3"}},
 {"source":"conversations","label":"Tasha wants a clearer way in","detail":"A name in a label","sources":["n1"],"quote":{"text":"We need a clear way in.","source":"n1"}},
 {"source":"conversations","label":"Seventy percent feel it","detail":"70 percent of people say so.","sources":["n1","n2"],"quote":null},
 {"source":"conversations","label":"Nothing behind it","detail":"","sources":["n9"],"quote":null},
 {"source":"conversations","label":"Cards are not conversations","detail":"","sources":["f1"],"quote":null},
 {"source":"conversations","label":"small groups are hard to find","detail":"A repeat of the first","sources":["n1"],"quote":null},
 {"source":"conversations","label":"A warm welcome","detail":"The welcome table is warm.","sources":["n2"],"quote":{"text":"Priya runs the welcome table and it is warm","source":"n2"}},
 {"source":"conversations","label":"Proud of the music","detail":"Music and giving are strengths.","sources":["n5"],"quote":{"text":"We love our worship band, always.","source":"n5"}},
 {"source":"four_lists","label":"Newcomers need a way into groups","detail":"Cards ask for an easy first step.","sources":["f3","f4"],"quote":{"text":"A made up line the room never wrote","source":"f3"}},
 {"source":"four_lists","label":"Volunteers burn out","detail":"One card carries it.","sources":["f1"],"quote":{"text":"Volunteers are burning out","source":"f1"}},
 {"source":"nothing","label":"Not a kind","detail":"","sources":["n1"]},
 {"source":"conversations","label":"\"Quoted\" label","detail":"","sources":["n1"]}
]}$j$,false);
set local role service_role;
select is(public.discover_theme_apply((select id from private.ai_runs where job='draft_discover_themes' and engagement_id=tests.id(100)),tests.id(600),current_setting('tests.out1')::jsonb,'{"input_tokens":1200,"output_tokens":300,"cost_usd":0.02,"ms":2100}')->>'status','ok','The worker applies the reply under its lease');
reset role;
select is((select count(*)::integer from private.discover_themes where engagement_id=tests.id(100) and source<>'survey' and not deleted),6,'Six themes were kept of thirteen offered');
select is((select array_agg(label order by seq) from private.discover_themes where engagement_id=tests.id(100) and source<>'survey' and not deleted),array['Small groups are hard to find','Volunteers are stretched','A warm welcome','Proud of the music','Newcomers need a way into groups','Volunteers burn out'],'in the model''s order');
select is((select output->>'offered' from private.ai_runs where job='draft_discover_themes' and engagement_id=tests.id(100)),'6','The run records what was offered');
select is((select jsonb_agg(x->>'reason' order by x->>'reason') from private.ai_runs r,jsonb_array_elements(r.output->'refused') x where r.job='draft_discover_themes' and r.engagement_id=tests.id(100)),'["name","number","text","unsourced","unsourced"]'::jsonb,'and why it refused the rest: a name, a number no source has, a quoted label, a source that is not there, or a card ref in a conversation theme');
select is((select count(*)::integer from private.discover_themes where engagement_id=tests.id(100) and source<>'survey' and not deleted and status='draft' and ai_run is not null),6,'Every one is a draft and carries its AI run');
select is((select input_tokens||' '||output_tokens||' '||status from private.ai_runs where job='draft_discover_themes' and engagement_id=tests.id(100)),'1200 300 ok','Tokens and the result are logged');
select is((select status||' '||last_offered||' '||last_refused from private.discover_theme_rounds where engagement_id=tests.id(100)),'ready 6 5','The round is ready');
select is(tests.field('Small groups are hard to find','rests_on')||' of '||tests.field('Small groups are hard to find','out_of'),'3 of 5','A conversation theme rests on 3 of 5 conversations, counted from its sources');
select is(tests.field('Volunteers are stretched','rests_on')||' of '||tests.field('Volunteers are stretched','out_of'),'2 of 5','another on 2 of 5');
select is(tests.field('Proud of the music','rests_on')||' of '||tests.field('Proud of the music','out_of'),'1 of 5','and one on 1 of 5');
select is(tests.field('Small groups are hard to find','quotes'),'["Newcomers tell me they cannot find a small group."]','The quote is word for word from its source');
select is(tests.field('A warm welcome','quotes'),'[]','A quote that carries a name is dropped, and the theme kept');
select is(tests.field('Proud of the music','quotes'),'[]','A quote that is not in its source is dropped');
select is(tests.field('Newcomers need a way into groups','quotes'),'["A way into groups for newcomers"]','A Four Helpful Lists theme with no verbatim quote takes its most agreed card''s own words');
select is(tests.field('Newcomers need a way into groups','rests_on')||' of '||tests.field('Newcomers need a way into groups','out_of'),'2 of 5','and rests on the people behind its cards: the most behind one card (an agreement count of 1 and its writer), never fewer than its two writers; out of the most people any card shows');
select is(tests.field('Volunteers burn out','rests_on')||' of '||tests.field('Volunteers burn out','out_of'),'5 of 5','A card five people stand behind rests on 5');
select is((select count(*)::integer from private.discover_theme_sources where engagement_id=tests.id(100) and theme_id=tests.themeid('Small groups are hard to find') and note_id is not null and not deleted),3,'Its sources are the three notes');
select is((select count(*)::integer from private.discover_theme_sources where engagement_id=tests.id(100) and card_id is not null and not deleted),3,'and the cards behind the two card themes');
select is((select count(*)::integer from private.discover_themes where engagement_id=tests.id(100) and source='survey'),0,'No survey theme is drafted by AI');
select ok((select not (output::text ~* 'Tasha Brown|Sam Lee|Gomez') from private.ai_runs where job='draft_discover_themes' and engagement_id=tests.id(100)),'The run log holds no person from the people field');
select is((select test from private.discover_themes where id=tests.themeid('Small groups are hard to find')),false,'Themes drafted outside a rehearsal are real');

-- ---------- The page's state: sources, never the person ----------
set local role authenticated;
select tests.login(1);
select is(jsonb_array_length(tests.tstate()->'themes'),6,'The state lists six themes');
select ok(not (tests.tstate()::text ~* 'Tasha Brown|Sam Lee|Ruth Gomez'),'and never a note''s person');
select is((select jsonb_agg(s->>'title' order by s->>'title') from jsonb_array_elements(tests.tstate()->'themes') t,jsonb_array_elements(t->'sources') s where t->>'label'='Small groups are hard to find'),'["Associate pastor","Senior leaders","Staff conversation"]'::jsonb,'Each theme shows the notes it rests on, by title');
select is((select (t->>'ai')||' '||(t->>'by_hand') from jsonb_array_elements(tests.tstate()->'themes') t where t->>'label'='Volunteers burn out'),'true false','A drafted theme is marked AI');
select is((tests.tstate()->'round')->>'status','ready','The round is ready');
select is((tests.tstate()->'round'->>'offered')||' '||(tests.tstate()->'round'->>'refused'),'6 5','with what it offered and what it refused');
select is((select jsonb_array_length(tests.tstate()->'cards')),4,'The cards a hand-made theme may rest on are listed');
select is((select jsonb_array_length(tests.tstate()->'notes')),5,'with the notes');
select ok(not exists(select 1 from jsonb_array_elements(tests.tstate()->'notes') n where n ? 'person' or n ? 'body'),'by id, title and kind only');

-- ---------- Accept, undo, rename, reject, restore ----------
select is(tests.act(tests.themeid('Small groups are hard to find'),'accept')->>'status','ok','The lead accepts a theme');
select is(tests.act(tests.themeid('Small groups are hard to find'),'accept')->>'status','unchanged','Accepting again changes nothing');
select tests.login(2);
select is(tests.act(tests.themeid('Volunteers are stretched'),'accept')->>'status','ok','A co-facilitator accepts one too');
select is(tests.act(tests.themeid('Volunteers are stretched'),'rename','{"label":"  Volunteers   are worn out "}')->>'status','ok','and renames it');
select is((select t->>'label'||' / '||(t->>'renamed_from') from jsonb_array_elements(tests.tstate()->'themes') t where t->>'ai'='true' and t->>'label' like 'Volunteers are worn%'),'Volunteers are worn out / Volunteers are stretched','It keeps what it was called');
select is(tests.act(tests.themeid('Volunteers are worn out'),'rename','{"label":"Volunteers are stretched"}')->>'status','ok','Renaming it back');
select is((select t->>'renamed_from' from jsonb_array_elements(tests.tstate()->'themes') t where t->>'label'='Volunteers are stretched'),null,'forgets the rename');
select is(tests.act(tests.themeid('Volunteers are stretched'),'rename','{"label":""}')->>'status','invalid_request','An empty name is refused');
select is(tests.act(tests.themeid('Volunteers are stretched'),'rename',null)->>'status','invalid_request','and no name');
select is(tests.act(tests.themeid('Volunteers are stretched'),'undo')->>'status','ok','Undoing an accept');
select is(tests.field('Volunteers are stretched','status'),'draft','puts it back to a draft');
select is(tests.act(tests.themeid('Volunteers are stretched'),'undo')->>'status','unchanged','and undoing a draft does nothing');
select is(tests.act(tests.themeid('A warm welcome'),'reject')->>'status','ok','Rejecting a theme');
select is(tests.field('A warm welcome','status'),'rejected','marks it rejected');
select is(tests.act(tests.themeid('A warm welcome'),'restore')->>'status','ok','and it can be restored');
select is(tests.field('A warm welcome','status'),'draft','to a draft');
select is(tests.act(tests.themeid('A warm welcome'),'bogus')->>'status','invalid_request','An action that does not exist is refused');
select is(tests.act(tests.id(404),'accept')->>'status','not_found','and a theme that is not there');

-- ---------- Merge beneath a survivor, and split ----------
select is(tests.act(tests.themeid('Volunteers burn out'),'merge',jsonb_build_object('into',tests.themeid('Small groups are hard to find')))->>'status','cannot_merge','Themes of different kinds cannot merge');
select is(tests.act(tests.themeid('Volunteers are stretched'),'merge',jsonb_build_object('into',tests.themeid('Volunteers are stretched')))->>'status','not_found','A theme cannot merge into itself');
select is(tests.act(tests.themeid('Proud of the music'),'merge','{"into":"nope"}')->>'status','invalid_request','or into something that is not an id');
select is(tests.act(tests.themeid('Volunteers are stretched'),'merge',jsonb_build_object('into',tests.themeid('Small groups are hard to find')))->>'status','ok','Two conversation themes merge');
select is(tests.field('Small groups are hard to find','rests_on')||' of '||tests.field('Small groups are hard to find','out_of'),'4 of 5','The survivor now rests on the notes of both (n3 is the only one new: 4 of 5)');
select is(tests.field('Small groups are hard to find','quotes'),'["Newcomers tell me they cannot find a small group.", "The same ten people do everything."]','and carries both quotes');
select is(tests.field('Small groups are hard to find','status'),'accepted','A survivor keeps its own status');
select is(jsonb_array_length(tests.tstate()->'themes'),5,'The merged theme leaves the list');
select is((select jsonb_array_length(t->'members') from jsonb_array_elements(tests.tstate()->'themes') t where t->>'label'='Small groups are hard to find'),1,'and sits beneath its survivor');
select is((select jsonb_array_length(t->'sources') from jsonb_array_elements(tests.tstate()->'themes') t where t->>'label'='Small groups are hard to find'),5,'whose sources are both themes'' (five, with the note both name)');
select is(tests.act(tests.themeid('Volunteers are stretched'),'accept')->>'status','merged','A merged theme cannot be accepted on its own');
select is(tests.act(tests.themeid('Proud of the music'),'merge',jsonb_build_object('into',tests.themeid('Volunteers are stretched')))->>'status','cannot_merge','and nothing merges into it');
select is(tests.act(tests.themeid('Volunteers are stretched'),'split')->>'status','ok','Splitting it out');
select is(tests.field('Small groups are hard to find','rests_on')||' of '||tests.field('Small groups are hard to find','out_of'),'3 of 5','gives the survivor its own counts back');
select is(tests.field('Volunteers are stretched','rests_on'),'2','and the theme its own');
select is(tests.act(tests.themeid('Volunteers are stretched'),'split')->>'status','unchanged','Splitting a theme that is not merged does nothing');
-- An accepted theme merged into a draft makes the survivor accepted: the accepted words are not lost.
select is(tests.act(tests.themeid('Volunteers are stretched'),'accept')->>'status','ok','An accepted theme');
select is(tests.field('Proud of the music','status'),'draft','A draft theme');
select is(tests.act(tests.themeid('Volunteers are stretched'),'merge',jsonb_build_object('into',tests.themeid('Proud of the music')))->>'status','ok','takes the accepted theme beneath it');
select is(tests.field('Proud of the music','status'),'accepted','and becomes accepted, so accepted words are not lost');
select is(tests.field('Proud of the music','rests_on')||' of '||tests.field('Proud of the music','out_of'),'3 of 5','resting on all three notes');
select is(tests.act(tests.themeid('Volunteers are stretched'),'split')->>'status','ok','Split again');
select is(tests.act(tests.themeid('Volunteers are stretched'),'reject')->>'status','ok','Reject the one that was split out');
select is(tests.act(tests.themeid('Small groups are hard to find'),'merge',jsonb_build_object('into',tests.themeid('Volunteers are stretched')))->>'status','cannot_merge','Nothing merges into a rejected theme');

-- ---------- A theme by hand ----------
select is(public.discover_theme_add(tests.id(100),tests.id(700),'conversations','Leaders feel alone','Two leaders named it.',array[tests.id(1),tests.id(5)])->>'status','ok','The facilitator writes a theme by hand, resting on two notes');
select is(tests.field('Leaders feel alone','status')||' '||tests.field('Leaders feel alone','rests_on')||' of '||tests.field('Leaders feel alone','out_of'),'accepted 2 of 5','It is accepted at once and counted like any other');
select is((select (t->>'by_hand')||' '||(t->>'ai') from jsonb_array_elements(tests.tstate()->'themes') t where t->>'label'='Leaders feel alone'),'true false','It is not marked AI');
select is(public.discover_theme_add(tests.id(100),tests.id(700),'conversations','Leaders feel alone','',null)->>'status','duplicate','A repeat of its id is the same theme');
select is(public.discover_theme_add(tests.id(100),tests.id(701),'survey','A survey theme','',null)->>'status','invalid_request','A survey theme cannot be written here (findings make those)');
select is(public.discover_theme_add(tests.id(100),tests.id(701),'conversations','','',null)->>'status','invalid_request','A theme needs a name');
select is(public.discover_theme_add(tests.id(100),tests.id(701),'conversations','Unknown note','',array[tests.id(404)])->>'status','not_found','and notes that exist');
select is(public.discover_theme_add(tests.id(100),tests.id(702),'four_lists','Cards by hand','',array[tests.id(905)])->>'status','ok','A theme can rest on Four Helpful Lists cards');
select is(tests.field('Cards by hand','rests_on')||' of '||tests.field('Cards by hand','out_of'),'3 of 5','counted from the people behind the card');
select is(public.discover_theme_add(tests.id(100),tests.id(703),'conversations','No sources yet','Written before the notes',null)->>'status','ok','A theme may rest on nothing yet');
select is(public.discover_themes_state(tests.id(100))::text ~ 'No sources yet','true'::boolean,'and is listed');

-- ---------- Notes added and removed change the counts ----------
reset role;
insert into private.conversation_notes(id,engagement_id,kind,title,body,source_kind,word_count,created_at) values(tests.id(7),tests.id(100),'input','Elders','The elders want a clear plan.','paste',6,clock_timestamp());
set local role authenticated;
select tests.login(1);
select ok(true,'A sixth note is added');
select is(tests.field('Small groups are hard to find','out_of'),'6','Every conversation theme is now out of six');
select is(tests.field('Small groups are hard to find','rests_on'),'3','and what it rests on is unchanged');
select is((tests.tstate()->'round'->>'stale_notes'),'1','The page can say one note was added since the draft');
select is(public.discover_note_delete(tests.id(100),tests.id(1))->>'status','ok','A note that a theme rests on is removed');
select is(tests.field('Small groups are hard to find','rests_on')||' of '||tests.field('Small groups are hard to find','out_of'),'2 of 5','The theme rests on one fewer, out of one fewer');
select is(tests.field('Leaders feel alone','rests_on'),'1','A hand-made theme follows the same way');
select is(tests.field('Small groups are hard to find','quotes'),'[]','and a quote from the removed note goes with it');

-- ---------- Only accepted themes count ----------
select is(tests.save(1,'Welcoming culture','72%',60)->>'status','ok','A survey finding is saved');
select is(public.discover_total_set(tests.id(100),87)->>'status','ok','with a total');
reset role;
set local role service_role;
select is((select array_agg(label order by label) from private.discover_accepted_themes(tests.id(100))),array['Cards by hand','Leaders feel alone','No sources yet','Proud of the music','Small groups are hard to find','Welcoming culture'],'The accepted themes are the accepted ones and nothing else: not drafts, not the rejected, not a merged member');
select is((select thin||' '||strong from private.discover_accepted_themes(tests.id(100)) where label='Welcoming culture'),'false true','The survey theme: 60 of 87 is strong');
select is((select thin||' '||strong from private.discover_accepted_themes(tests.id(100)) where label='Small groups are hard to find'),'false true','2 of 5 is not thin; 40 percent is strong');
select is((select source||' '||rests_on||' '||out_of||' '||detail from private.discover_accepted_themes(tests.id(100)) where label='Welcoming culture'),'survey 60 87 72%','with its counts and detail');
select is((select count(*)::integer from private.discover_accepted_themes(tests.id(100)) where source='survey'),1,'Survey themes come from findings');
select is((select count(*)::integer from private.discover_accepted_themes(tests.id(101))),0,'Another engagement has none');
select is((select jsonb_array_length(quotes) from private.discover_accepted_themes(tests.id(100)) where label='Small groups are hard to find'),0,'Quotes are the sources'' words, and none was kept here');
reset role;
-- The quotes come with the kind and id of their source.
update private.discover_theme_sources set quote='We need a clear way in.' where theme_id=tests.themeid('Small groups are hard to find') and note_id=tests.id(2);
select is((select quotes from private.discover_accepted_themes(tests.id(100)) where label='Small groups are hard to find'),jsonb_build_array(jsonb_build_object('kind','note','id',tests.id(2),'quote','We need a clear way in.')),'Quotes come with the kind and id of their source');
select ok(not exists(select 1 from private.discover_accepted_themes(tests.id(100)) where quotes::text ~* 'Tasha|Sam Lee|Ruth'),'and never a person');

-- ---------- A failed try, a retry, and giving up ----------
set local role authenticated;
select tests.login(1);
select is(public.discover_draft_start(tests.id(100),tests.id(511))->>'status','ok','Once a round is ready, Redraft starts another');
select is((public.discover_themes_state(tests.id(100))->'round'->>'redraft'),'true','and the page knows it is a redraft');
reset role;
set local role service_role;
select is(public.discover_theme_claim(tests.id(100),tests.id(610),'fake-model','{"draft_discover_themes":"themes-draft@1"}')->>'status','claimed','A redraft is claimed');
reset role;
select ok((select inputs->'already' @> '[{"label":"Small groups are hard to find"}]' and inputs->'already' @> '[{"label":"Leaders feel alone"}]' and not (inputs->'already' @> '[{"label":"Volunteers are stretched"}]') from private.ai_runs where id=(select lease_run from private.discover_theme_rounds where engagement_id=tests.id(100))),'It is told which themes stand (accepted and offered), so it offers new ones beside them');
select is((select inputs->'rejected' from private.ai_runs where id=(select lease_run from private.discover_theme_rounds where engagement_id=tests.id(100))),'["Volunteers are stretched"]'::jsonb,'and which the facilitator rejected');
set local role service_role;
select is(public.discover_theme_fail((select lease_run from private.discover_theme_rounds where engagement_id=tests.id(100)),tests.id(610),'timeout','{"ms":50000}')->>'status','ok','The first failure is recorded');
select is(public.discover_theme_claim(tests.id(100),tests.id(611),'fake-model','{"draft_discover_themes":"themes-draft@1"}')->>'status','cooling','and the next try waits a moment');
reset role;
update private.discover_theme_rounds set last_failed_at=now()-interval '1 minute' where engagement_id=tests.id(100);
set local role service_role;
select is(public.discover_theme_due(tests.id(100)),true,'After the pause it is due again');
select is(public.discover_theme_claim(tests.id(100),tests.id(612),'fake-model','{"draft_discover_themes":"themes-draft@1"}')->>'status','claimed','and claimed');
select is(public.discover_theme_fail((select lease_run from private.discover_theme_rounds where engagement_id=tests.id(100)),tests.id(612),'unavailable','{"ms":10}')->>'gave_up','true','The second failure gives up');
reset role;
select is((select status||' '||attempts||' '||last_error from private.discover_theme_rounds where engagement_id=tests.id(100)),'failed 2 unavailable','The round is failed, with a reason that holds nothing from the notes');
set local role authenticated;
select tests.login(1);
select is((public.discover_themes_state(tests.id(100))->'round'->>'status'),'failed','The page sees it failed and says so');
select is(public.discover_theme_add(tests.id(100),tests.id(720),'conversations','Written while AI was down','',array[tests.id(2)])->>'status','ok','and the facilitator can still add a theme by hand');
select is(public.discover_draft_start(tests.id(100),tests.id(513))->>'status','ok','or press again');
reset role;

-- A redraft offers new themes beside the standing ones and never repeats them.
set local role service_role;
select is(public.discover_theme_claim(tests.id(100),tests.id(620),'fake-model','{"draft_discover_themes":"themes-draft@1"}')->>'status','claimed','The redraft is claimed');
reset role;
select set_config('tests.out2',$j${"themes":[
 {"source":"conversations","label":"Small groups are hard to find","detail":"Again","sources":["n1"]},
 {"source":"conversations","label":"Volunteers are stretched","detail":"Rejected earlier","sources":["n1"]},
 {"source":"conversations","label":"The next step is unclear","detail":"Warm welcome, then no clear step.","sources":["n1","n2"],"quote":{"text":"the next step is unclear","source":"n1"}}
]}$j$,false);
set local role service_role;
select is(public.discover_theme_apply((select lease_run from private.discover_theme_rounds where engagement_id=tests.id(100)),tests.id(620),current_setting('tests.out2')::jsonb,'{}')->>'status','ok','Applying the redraft');
reset role;
select is((select count(*)::integer from private.ai_runs where job='draft_discover_themes' and engagement_id=tests.id(100) and output->>'offered'='1'),1,'One new theme is offered');
select is((select count(*)::integer from private.discover_themes where engagement_id=tests.id(100) and label in('Small groups are hard to find','Volunteers are stretched') and not deleted),2,'and the accepted and the rejected ones are not offered a second time');
select is(tests.field('The next step is unclear','status'),'draft','The new theme is a draft beside them');
select is(tests.field('Small groups are hard to find','status'),'accepted','and the accepted one is still accepted');

-- ---------- The page ignores a round once there is nothing to read ----------
update private.conversation_notes set deleted=true where engagement_id=tests.id(100);
create or replace function private.four_lists_cards_for_themes(p_engagement uuid) returns table(card_id uuid,session_id uuid,"column" text,"text" text,agree integer,folded_ids uuid[])
language sql stable security definer set search_path='' as $$ select null::uuid,null::uuid,null::text,null::text,null::integer,null::uuid[] where false $$;
set local role authenticated;
select tests.login(1);
select is(public.discover_themes_state(tests.id(100))->'round','null'::jsonb,'With no notes and no cards the old round is not shown');
reset role;

-- ---------- A closed engagement stops writes ----------
update engagements set status='closed' where id=tests.id(100);
set local role authenticated;
select tests.login(1);
select is(public.discover_draft_start(tests.id(100),tests.id(530))->>'status','closed','Draft themes refuses on a closed engagement');
select is(tests.act(tests.themeid('Leaders feel alone'),'reject')->>'status','closed','and so does every change');
select is(public.discover_theme_add(tests.id(100),tests.id(731),'conversations','Late','',null)->>'status','closed','and adding a theme');
select is(public.discover_themes_state(tests.id(100))->>'status','ok','but the lead can still read');
reset role;

select * from finish();
rollback;
