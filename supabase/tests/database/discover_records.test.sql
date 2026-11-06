-- Milestone 6, step 1: Discover records. Survey findings with their theme, the survey total, conversation notes,
-- the signals record, and who may reach any of it: the lead, a co-facilitator, another engagement's facilitator,
-- a participant, the scribe, a team facilitator, the TV and an unsigned browser.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('8d010000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
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

-- ---------- The records: forced row-level security, no browser grant ----------
select is((select count(*) from pg_class where oid=any(array['private.survey_findings','private.conversation_notes','private.discover_themes','private.discover_theme_sources','private.signals']::regclass[]) and relrowsecurity and relforcerowsecurity),5::bigint,'All five new tables force row-level security');
select is((select count(*) from information_schema.role_table_grants where grantee in('authenticated','anon','public') and table_schema='private' and table_name in('survey_findings','conversation_notes','discover_themes','discover_theme_sources','signals')),0::bigint,'Browsers and anonymous callers hold no privilege on them');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'discover\_%' and p.prosecdef),0::bigint,'Every public Discover function is a security invoker wrapper');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in('discover_state','discover_total_set','discover_finding_save','discover_finding_delete','discover_note_add','discover_note_update','discover_note_delete','discover_note_read') and p.prosecdef),8::bigint,'and every private one is security definer');
select is((select has_column_privilege('authenticated','public.engagements','survey_respondents','update')),false,'The survey total is written only through its function, not by a browser update');

-- ---------- Who may read ----------
set local role authenticated;
select tests.login(1);
select is(tests.state()->>'status','ok','The lead reads Discover');
select tests.login(2);
select is(tests.state()->>'status','ok','A co-facilitator reads Discover');
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
select throws_ok($$select count(*) from private.survey_findings$$,'42501',null,'No signed-in role reads a finding table directly');
select throws_ok($$select count(*) from private.conversation_notes$$,'42501',null,'nor the notes');
select throws_ok($$select count(*) from private.signals$$,'42501',null,'nor the signals');
select throws_ok($$select count(*) from private.discover_themes$$,'42501',null,'nor the themes');
select throws_ok($$select count(*) from private.discover_theme_sources$$,'42501',null,'nor what they rest on');
reset role;
set local role anon;
select throws_ok($$select public.discover_state(tests.id(100))$$,'42501',null,'An unsigned browser cannot call the read');
select throws_ok($$select public.discover_finding_save(tests.id(100),tests.id(900),'x','1%',5)$$,'42501',null,'or save a finding');
select throws_ok($$select public.discover_note_add(tests.id(100),tests.id(900),'interview',null,'x','x','paste')$$,'42501',null,'or add a note');
select throws_ok($$select public.discover_note_read(tests.id(100),tests.id(900))$$,'42501',null,'or read a note');
reset role;
set local role authenticated;

-- ---------- Who may write: every other role is denied, every function ----------
select tests.login(1);
select is(tests.save(1,'Welcoming culture','72%',60)->>'status','ok','The lead saves a finding (the setup, before the others try)');
select is(tests.note(1,'interview','Pastor Dan Lee','Dan interview','We want a church that sends people out.')->>'status','ok','and adds a note');
do $$ declare n integer; r jsonb; names text[]:=array['Facilitator of another engagement','Participant','Scribe','Team facilitator','TV','No place']; ids integer[]:=array[7,4,3,10,5,9]; i integer; begin
 for i in 1..6 loop
  perform tests.login(ids[i]);
  n:=0;
  r:=public.discover_total_set(tests.id(100),50); if r->>'status'='denied' then n:=n+1; end if;
  r:=public.discover_finding_save(tests.id(100),tests.id(60+i),'A finding','10%',20); if r->>'status'='denied' then n:=n+1; end if;
  r:=public.discover_finding_delete(tests.id(100),tests.id(1)); if r->>'status'='denied' then n:=n+1; end if;
  r:=public.discover_note_add(tests.id(100),tests.id(60+i),'input',null,'A note','Some text','paste'); if r->>'status'='denied' then n:=n+1; end if;
  r:=public.discover_note_update(tests.id(100),tests.id(1),'input','Someone','Changed'); if r->>'status'='denied' then n:=n+1; end if;
  r:=public.discover_note_delete(tests.id(100),tests.id(1)); if r->>'status'='denied' then n:=n+1; end if;
  r:=public.discover_note_read(tests.id(100),tests.id(1)); if r->>'status'='denied' then n:=n+1; end if;
  r:=public.discover_state(tests.id(100)); if r->>'status'='denied' then n:=n+1; end if;
  perform set_config('tests.denied_'||i,n::text,true);
 end loop;
end $$;
select is(current_setting('tests.denied_1'),'8','A facilitator of another engagement is denied all eight functions');
select is(current_setting('tests.denied_2'),'8','A participant is denied all eight');
select is(current_setting('tests.denied_3'),'8','The scribe is denied all eight');
select is(current_setting('tests.denied_4'),'8','A team facilitator is denied all eight');
select is(current_setting('tests.denied_5'),'8','A TV is denied all eight');
select is(current_setting('tests.denied_6'),'8','Someone with no place is denied all eight');
reset role;
select is(tests.count_of('survey_findings'),1,'Nothing was written by them: one finding');
select is(tests.count_of('conversation_notes'),1,'one note');
select is((select survey_respondents from engagements where id=tests.id(100)),null,'and no survey total');
set local role authenticated;

-- ---------- The survey total ----------
select tests.login(2);
select is(public.discover_total_set(tests.id(100),0)->>'status','invalid_request','A total of zero is refused');
select is(public.discover_total_set(tests.id(100),1000001)->>'status','invalid_request','and one past a million');
select is(public.discover_total_set(tests.id(100),50)->>'status','below_findings','A total below a finding''s respondents (60) is refused');
select is(public.discover_total_set(tests.id(100),50)->>'most','60','and says the most it must hold');
select is(public.discover_total_set(tests.id(100),87)->>'status','ok','A co-facilitator sets the total at 87');
select is(tests.state()->>'survey_respondents','87','and it reads back');
select is(tests.q($q$select out_of from private.discover_themes where engagement_id=tests.id(100) and source='survey'$q$),'87'::text,'The finding''s survey theme now rests on 60 of 87');

-- ---------- Survey findings ----------
select tests.login(1);
select is(tests.save(2,'Under-30s feel unheard','6',6)->>'status','ok','A second finding, a count');
select is(tests.save(3,'x','abc',5)->>'status','invalid_request','A figure with no number is refused');
select is(tests.save(3,'','10%',5)->>'status','invalid_request','an empty title');
select is(tests.save(3,repeat('a',121),'10%',5)->>'status','invalid_request','a title over 120 characters');
select is(tests.save(3,'x',repeat('1',41),5)->>'status','invalid_request','a figure over 40 characters');
select is(tests.save(3,'x','10%',0)->>'status','invalid_request','respondents under one');
select is(tests.save(3,'x','10%',null)->>'status','invalid_request','no respondents');
select is(public.discover_finding_save(tests.id(100),null,'x','10%',5)->>'status','invalid_request','no id');
select is(tests.save(3,'Too many','90%',88)->>'status','exceeds_total','Respondents above the survey total are refused');
select is(tests.save(3,'Small group access','31%',27)->>'status','ok','A third finding');
select is((tests.save(3,'Small group access','31%',27))->>'created','false','Saving it again is the same save');
select is(tests.count_of('survey_findings'),3,'Three findings');
select is(tests.count_of('discover_themes'),3,'and three themes, one for each finding');
select is(tests.q($q$select count(*)::integer from private.discover_themes where engagement_id=tests.id(100) and source='survey' and status='accepted' and not deleted$q$),'3'::text,'every one a survey theme and accepted');
select is(tests.q($q$select rests_on||' of '||out_of||' '||label||' '||detail from private.discover_themes t join private.discover_theme_sources s on s.theme_id=t.id where s.finding_id=tests.id(3)$q$),'27 of 87 Small group access 31%'::text,'The theme carries the finding''s counts, label and figure');
select is(tests.q($q$select count(*)::integer from private.discover_theme_sources where engagement_id=tests.id(100) and finding_id is not null and not deleted$q$),'3'::text,'Each theme rests on its one finding');
select is(tests.save(3,'Small groups, easy to join','33%',29)->>'status','ok','Editing a finding');
select is(tests.q($q$select label||' '||rests_on||' '||detail from private.discover_themes t join private.discover_theme_sources s on s.theme_id=t.id where s.finding_id=tests.id(3)$q$),'Small groups, easy to join 29 33%'::text,'updates its theme in the same call');
select is(tests.count_of('discover_themes'),3,'without making a second theme');
select is(tests.save(1,'Welcoming culture','72%',60)->>'status','ok','Saving a finding unchanged');
select is((select count(*)::integer from jsonb_array_elements(tests.state()->'findings') f where f->>'theme_id' is not null),3,'Every finding in the state names its theme');
select is((tests.state()->'findings'->2)->>'title','Small groups, easy to join','Findings are listed in the order they were added');
select tests.login(7);
select is(public.discover_finding_save(tests.id(100),tests.id(1),'Hijack','1%',5)->>'status','denied','Another engagement''s facilitator cannot edit it');
select tests.login(1);
select is(public.discover_finding_save(tests.id(101),tests.id(1),'Hijack','1%',5)->>'status','denied','and the lead cannot use another engagement''s id');
select is(public.discover_finding_delete(tests.id(100),tests.id(404))->>'status','not_found','Deleting a finding that is not there says so');
select is(public.discover_finding_delete(tests.id(100),tests.id(2))->>'status','ok','Deleting a finding');
select is(tests.count_of('discover_themes'),2,'takes its theme with it');
select is(tests.count_of('discover_theme_sources'),2,'and what the theme rested on');
select is(tests.save(2,'Brought back','6',6)->>'status','not_found','A removed finding cannot be saved again under its id');
select is(public.discover_total_set(tests.id(100),null)->>'status','ok','The total can be cleared');
select is(tests.q($q$select count(*)::integer from private.discover_themes where engagement_id=tests.id(100) and source='survey' and not deleted and out_of is not null$q$),'0'::text,'and then the themes rest on no total');
select is(tests.save(4,'Tiny sample','50%',3)->>'status','ok','With no total any count under it is allowed');
select is(public.discover_total_set(tests.id(100),87)->>'status','ok','Total back to 87');

-- ---------- Notes ----------
select is(tests.note(2,'input','Elders','Elders conversation','The elders want a clear plan for the next three years.')->>'status','ok','An input conversation by paste');
select is(tests.note(3,'interview',null,'Staff interview','Short note.','docx')->>'status','ok','A note read from a Word file, with no person');
select is(tests.note(4,'interview','Ruth','Text file','Notes.','txt')->>'status','ok','a text file');
select is(tests.note(5,'interview',null,'PDF','Notes.','pdf')->>'status','ok','and a PDF');
select is(tests.note(6,'meeting',null,'Bad kind','x')->>'status','invalid_request','Another kind is refused');
select is(tests.note(6,'interview',null,'Bad source','x','video')->>'status','invalid_request','Another source is refused');
select is(tests.note(6,'interview',null,'','x')->>'status','invalid_request','An empty title is refused');
select is(tests.note(6,'interview',repeat('a',201),'x','x')->>'status','invalid_request','A person over 200 characters is refused');
select is(tests.note(6,'interview',null,'Empty','   ')->>'status','empty','Text of only spaces is empty');
select is(tests.note(6,'interview',null,'Long',repeat('a',60001))->>'status','too_long','Text over 60,000 characters is too long');
select is(tests.note(6,'interview',null,'Just right',repeat('a',60000))->>'status','ok','Exactly 60,000 characters is kept');
select is(tests.q($q$select char_count from private.conversation_notes where id=tests.id(6)$q$),'60000'::text,'with its character count');
select is(tests.note(2,'input','Elders','Elders conversation','The elders want a clear plan for the next three years.')->>'status','duplicate','A repeat of the same id is a duplicate');
select is(tests.count_of('conversation_notes'),6,'Six notes (the first, the five just added)');
select tests.login(7);
select is(public.discover_note_add(tests.id(101),tests.id(2),'input',null,'x','x','paste')->>'status','conflict','A note id that belongs to another engagement is a conflict, even for the facilitator of the engagement that tries it');
select is(public.discover_note_read(tests.id(101),tests.id(2))->>'status','not_found','and cannot be read through it');
select tests.login(1);
select is(public.discover_note_read(tests.id(100),tests.id(2))->>'body','The elders want a clear plan for the next three years.','The facilitator reads a note''s text');
select is(public.discover_note_read(tests.id(100),tests.id(2))->>'person','Elders','with its person');
select is(public.discover_note_read(tests.id(100),tests.id(2))->>'word_count','11','and its word count');
select is((select jsonb_agg(n->>'person' order by n->>'title') from jsonb_array_elements(tests.state()->'notes') n where n->>'title' in('Elders conversation','Dan interview')),'["Pastor Dan Lee","Elders"]'::jsonb,'The list carries the person for the facilitator''s screen');
select ok(not exists(select 1 from jsonb_array_elements(tests.state()->'notes') n where n ? 'body'),'but not the text');
select is(public.discover_note_update(tests.id(100),tests.id(2),'interview','Elder board','Elders interview')->>'status','ok','A note can be retitled and its kind changed');
select is((select n->>'kind' from jsonb_array_elements(tests.state()->'notes') n where n->>'title'='Elders interview'),'interview','and the list shows it');
select is(public.discover_note_update(tests.id(100),tests.id(2),'meeting',null,'x')->>'status','invalid_request','Not to another kind');
select is(public.discover_note_update(tests.id(100),tests.id(404),'input',null,'x')->>'status','not_found','Or a note that is not there');
select is(public.discover_note_delete(tests.id(100),tests.id(5))->>'status','ok','A note is deleted');
select is(public.discover_note_read(tests.id(100),tests.id(5))->>'status','not_found','and cannot be read again');
select is(public.discover_note_delete(tests.id(100),tests.id(5))->>'status','not_found','or deleted twice');
select is(tests.note(5,'interview',null,'PDF','Notes.','pdf')->>'status','duplicate','Its id is not reused');

-- A note's theme sources go when the note does.
reset role;
insert into private.discover_themes(id,engagement_id,source,label,rests_on,out_of,status) values(tests.id(900),tests.id(100),'conversations','Clear plan',1,4,'draft');
insert into private.discover_theme_sources(engagement_id,theme_id,note_id,quote) values(tests.id(100),tests.id(900),tests.id(3),'A clear plan');
set local role authenticated;
select tests.login(1);
select is((select (t->>'sources')::integer from jsonb_array_elements(tests.state()->'themes') t where t->>'id'=tests.id(900)::text),1,'A drafted theme shows what it rests on');
select is(public.discover_note_delete(tests.id(100),tests.id(3))->>'status','ok','Deleting the note it rests on');
select is((select (t->>'sources')::integer from jsonb_array_elements(tests.state()->'themes') t where t->>'id'=tests.id(900)::text),0,'leaves it resting on nothing');
select is(tests.state()->'themes'->0->>'source','survey','Themes list survey themes first, then the others in order');

-- ---------- Counts ----------
select is((select count(*)::integer from jsonb_array_elements(tests.state()->'notes')),4,'Four notes remain');
select is((select count(*)::integer from jsonb_array_elements(tests.state()->'findings')),3,'Three findings remain');

-- ---------- A closed engagement is read-only ----------
reset role;
update engagements set status='closed' where id=tests.id(100);
set local role authenticated;
select tests.login(1);
select is(tests.state()->>'status','ok','A closed engagement can still be read');
select is(tests.save(5,'Late finding','10%',10)->>'status','closed','but not written: findings');
select is(tests.note(7,'input',null,'Late note','text')->>'status','closed','notes');
select is(public.discover_total_set(tests.id(100),90)->>'status','closed','or the total');
select is(public.discover_note_delete(tests.id(100),tests.id(2))->>'status','closed','or deletes');
reset role;
update engagements set status='setup' where id=tests.id(100);

-- ---------- Signals: the record, with its rules (no browser function reads or writes it yet) ----------
select lives_ok($$insert into private.signals(id,engagement_id,session_id,kind,theme_id,evidence) values(tests.id(950),tests.id(100),tests.id(310),'aligned',(select theme_id from private.discover_theme_sources where finding_id=tests.id(1)),'{"room":"3 sentences"}')$$,'An aligned signal is recorded for a theme');
select throws_ok($$insert into private.signals(engagement_id,session_id,kind,theme_id) values(tests.id(100),tests.id(310),'aligned',(select theme_id from private.discover_theme_sources where finding_id=tests.id(1)))$$,'23505',null,'The same kind and theme in a session replaces its card, never doubles it');
select throws_ok($$insert into private.signals(engagement_id,session_id,kind) values(tests.id(100),tests.id(310),'neutral')$$,'23514',null,'Only aligned, divergent, silent and thin are kinds');
select throws_ok($$insert into private.signals(engagement_id,session_id,kind,saved_as_citation_at) values(tests.id(100),tests.id(310),'silent',now())$$,'23514',null,'Only an aligned signal is saved as a citation');
select throws_ok($$insert into private.signals(engagement_id,session_id,kind) values(tests.id(100),tests.id(320),'thin')$$,'23503',null,'A signal belongs to a session of its own engagement');
select throws_ok($$insert into private.signals(engagement_id,session_id,kind,evidence) values(tests.id(100),tests.id(310),'thin','[]')$$,'23514',null,'Evidence is an object');
select is(tests.count_of('signals'),1,'One signal stands');

-- ---------- Table rules ----------
select throws_ok($$insert into private.discover_theme_sources(engagement_id,theme_id) values(tests.id(100),tests.id(900))$$,'23514',null,'A theme source names exactly one of a finding, a note or a card');
select throws_ok($$insert into private.discover_theme_sources(engagement_id,theme_id,card_id,note_id) values(tests.id(100),tests.id(900),tests.id(1),tests.id(2))$$,'23514',null,'not two');
select lives_ok($$insert into private.discover_theme_sources(engagement_id,theme_id,card_id,quote) values(tests.id(100),tests.id(900),tests.id(777),'A card')$$,'A Four Helpful Lists card can be a source');
select throws_ok($$insert into private.discover_theme_sources(engagement_id,theme_id,note_id) values(tests.id(101),tests.id(900),tests.id(2))$$,'23503',null,'but never across engagements');
select throws_ok($$insert into private.discover_themes(engagement_id,source,label,status) values(tests.id(100),'poll','x','draft')$$,'23514',null,'A theme source is survey, four_lists or conversations');
select throws_ok($$insert into private.discover_themes(engagement_id,source,label,status) values(tests.id(100),'conversations','x','maybe')$$,'23514',null,'A theme is draft, accepted or rejected');
select throws_ok($$insert into private.discover_themes(engagement_id,source,label,quotes) values(tests.id(100),'conversations','x','["a","b","c","d"]')$$,'23514',null,'A theme keeps up to three quotes');
select throws_ok($$update private.discover_themes set merged_into=id where id=tests.id(900)$$,'23514',null,'A theme cannot merge into itself');
select lives_ok($$update private.discover_themes set merged_into=(select theme_id from private.discover_theme_sources where finding_id=tests.id(1)) where id=tests.id(900)$$,'but into another theme of its engagement');

-- ---------- Rehearsal and the practice reset ----------
insert into engagements(id,church_id,title,type) values('90000000-0000-4000-8000-000000000010',tests.id(200),'Permanent practice','practice');
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values('90000000-0000-4000-8000-000000000010',tests.id(701),'lead');
insert into sessions(id,engagement_id,title,part,position,state,interaction) values(tests.id(330),'90000000-0000-4000-8000-000000000010','Practice step','Day 1',1,'ready','wall');
set local role authenticated;
select tests.login(1);
select is(public.discover_finding_save('90000000-0000-4000-8000-000000000010',tests.id(800),'Real finding','50%',20)->>'status','ok','A finding saved in the practice room before any rehearsal');
select is(public.discover_note_add('90000000-0000-4000-8000-000000000010',tests.id(801),'interview','Real person','Real note','Real text','paste')->>'status','ok','and a note');
select is(public.rehearsal_control('90000000-0000-4000-8000-000000000010',tests.id(851),'start')->>'status','ok','The rehearsal starts');
select is(public.discover_finding_save('90000000-0000-4000-8000-000000000010',tests.id(802),'Test finding','40%',15)->>'status','ok','A finding saved during the rehearsal');
select is(public.discover_note_add('90000000-0000-4000-8000-000000000010',tests.id(803),'input',null,'Test note','Test text','paste')->>'status','ok','and a note');
reset role;
insert into private.signals(id,engagement_id,session_id,kind) values(tests.id(951),'90000000-0000-4000-8000-000000000010',tests.id(330),'thin');
insert into private.discover_themes(id,engagement_id,source,label) values(tests.id(901),'90000000-0000-4000-8000-000000000010','conversations','Test theme');
insert into private.discover_theme_sources(engagement_id,theme_id,note_id) values('90000000-0000-4000-8000-000000000010',tests.id(901),tests.id(803));
select is((select test from private.survey_findings where id=tests.id(800)),false,'A finding made before the rehearsal is not a test');
select is((select test from private.survey_findings where id=tests.id(802)),true,'one made in the rehearsal is');
select is((select test from private.conversation_notes where id=tests.id(803)),true,'and so is a note');
select is((select test from private.discover_themes where id=tests.id(901)),true,'a theme');
select is((select test from private.signals where id=tests.id(951)),true,'and a signal');
set local role authenticated;
select tests.login(1);
select is((public.control_status('90000000-0000-4000-8000-000000000010')->'rehearsal'->>'test_answers')::integer,4,'The rehearsal count includes the finding, the note, the drafted theme and the signal, not the finding''s own survey theme');
select is(public.rehearsal_control('90000000-0000-4000-8000-000000000010',tests.id(852),'end')->>'status','ok','The rehearsal ends');
select is(public.rehearsal_control('90000000-0000-4000-8000-000000000010',tests.id(853),'clear')->>'status','ok','Clear test answers runs');
reset role;
select is((select deleted from private.survey_findings where id=tests.id(802)),true,'It puts away the test finding');
select is((select deleted from private.conversation_notes where id=tests.id(803)),true,'the test note');
select is((select deleted from private.discover_themes where id=tests.id(901)),true,'the test theme');
select is((select deleted from private.discover_theme_sources where theme_id=tests.id(901)),true,'what it rested on');
select is((select deleted from private.signals where id=tests.id(951)),true,'the test signal');
select is((select count(*)::integer from private.discover_themes t join private.discover_theme_sources s on s.theme_id=t.id where s.finding_id=tests.id(802) and not t.deleted),0,'and the survey theme the test finding made');
select is((select deleted from private.survey_findings where id=tests.id(800)),false,'and leaves the real finding');
select is((select deleted from private.conversation_notes where id=tests.id(801)),false,'and the real note');
select is((select count(*)::integer from private.discover_themes t join private.discover_theme_sources s on s.theme_id=t.id where s.finding_id=tests.id(800) and not t.deleted),1,'and the real finding''s theme');
-- The reset clears everything in the practice room, and nothing in another room.
update engagements set survey_respondents=40 where id='90000000-0000-4000-8000-000000000010';
update private.signals set deleted=false where id=tests.id(951);
set local role authenticated;
select tests.login(1);
select is(public.reset_practice_room(),true,'The practice room resets');
reset role;
select is((select count(*)::integer from private.survey_findings where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted),0,'No finding is left in the practice room');
select is((select count(*)::integer from private.conversation_notes where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted),0,'no note');
select is((select count(*)::integer from private.discover_themes where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted),0,'no theme');
select is((select count(*)::integer from private.discover_theme_sources where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted),0,'no theme source');
select is((select count(*)::integer from private.signals where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted),0,'no signal');
select is((select survey_respondents from engagements where id='90000000-0000-4000-8000-000000000010'),null,'and no survey total');
select is(tests.count_of('survey_findings'),3,'The first engagement keeps its three findings');
select is(tests.count_of('conversation_notes'),4,'and its notes');

select * from finish();
rollback;
