begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('87610000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(1000+n))::text,true); end $$;
create function tests.live() returns uuid language sql security definer set search_path='' as $$ select live_session_id from public.room_states where engagement_id=tests.id(100) $$;
create function tests.results() returns jsonb language sql security definer set search_path='' as $$ select results from public.room_states where engagement_id=tests.id(100) $$;
create function tests.ctl(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$
 select public.room_control(tests.id(100),tests.id(n),action,jsonb_build_object('from',tests.live())||p) $$;
create function tests.ls(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$ select public.lens_summary_control(tests.id(100),tests.id(n),action,p) $$;
create function tests.send(n integer,session integer,text_ text,value jsonb default null,action text default 'submit',revision integer default 0) returns jsonb language sql as $$
 select public.live_submit(tests.id(100),tests.id(n),tests.id(session),revision,action,text_,now(),null,0,value) $$;
-- A phone answers the version on the screen now.
create function tests.vid(lens integer default 1) returns uuid language sql security definer set search_path='' as $$
 select current_version_id from private.lens_summaries where engagement_id=tests.id(100) and lens=$1::smallint and not deleted $$;
create function tests.answer(n integer,response text,text_ text default 'Approve',v uuid default null) returns jsonb language sql as $$
 select tests.send(n,450,text_,jsonb_build_object('version',coalesce(v,tests.vid()),'response',response)) $$;
create function tests.sm(lens integer default 1) returns private.lens_summaries language sql security definer set search_path='' as $$
 select * from private.lens_summaries where engagement_id=tests.id(100) and lens=$1::smallint and not deleted $$;
create function tests.lines(v uuid) returns text[] language sql security definer set search_path='' as $$
 select array_agg(text order by position) from private.lens_summary_sentences where version_id=v and not deleted $$;
create function tests.versions(lens integer default 1) returns integer language sql security definer set search_path='' as $$
 select count(*)::integer from private.lens_summary_versions v join private.lens_summaries s on s.id=v.summary_id where s.engagement_id=tests.id(100) and s.lens=$1::smallint and not v.deleted $$;
-- Make the last suggestion old enough for AI to fold (the quiet seconds).
create function tests.quiet() returns void language plpgsql security definer set search_path='' as $$
begin
 alter table public.submissions disable trigger touch_record;
 update public.submissions set updated_at=updated_at-interval '10 seconds' where engagement_id=tests.id(100);
 alter table public.submissions enable trigger touch_record;
end $$;
-- Everything in this file runs in one transaction, so stamp times by hand where the order or the age matters.
create function tests.stamp(n integer,shift interval) returns void language plpgsql security definer set search_path='' as $$
begin
 alter table public.submissions disable trigger touch_record;
 update public.submissions set updated_at=clock_timestamp()+shift where id=tests.id(n);
 alter table public.submissions enable trigger touch_record;
end $$;
create function tests.fresh() returns void language plpgsql security definer set search_path='' as $$
begin
 alter table public.submissions disable trigger touch_record;
 update public.submissions set updated_at=clock_timestamp() where engagement_id=tests.id(100);
 alter table public.submissions enable trigger touch_record;
end $$;
-- Rebuild the room's results, as any later answer would.
create function tests.results_now() returns void language sql security definer set search_path='' as $$
 update public.room_states set results=private.live_results(engagement_id) where engagement_id=tests.id(100) $$;
create table tests.claims(name text primary key,j jsonb);
create function tests.claim(p_name text,session integer,lease integer) returns jsonb language plpgsql as $$
declare j jsonb;
begin
 j:=public.ai_claim(tests.id(session),tests.id(lease),'claude-test-model','{"combine_words":"combine-words@1","group_wall":"group-wall@1","summarize_wall":"summarize-wall@1","fold_questions":"fold-questions@1","group_lens":"group-lens@1","merge_reasons":"merge-reasons@1","draft_lens_summary":"draft-lens-summary@1","fold_lens_summary":"fold-lens-summary@1"}');
 insert into tests.claims(name,j) values(p_name,j) on conflict(name) do update set j=excluded.j;
 return j;
end $$;
create function tests.c(name text) returns jsonb language sql as $$ select j from tests.claims where claims.name=c.name $$;
create function tests.ref(name text,list text,t text) returns text language sql as $$
 select x->>'ref' from jsonb_array_elements(tests.c(name)->'inputs'->list) x where x->>'text'=t limit 1 $$;
create function tests.apply(name text,lease integer,output jsonb) returns jsonb language sql as $$
 select public.ai_apply((tests.c(name)->>'run')::uuid,tests.id(lease),output,'{"input_tokens":1200,"output_tokens":80,"cost_usd":0.0016,"ms":900}') $$;
grant all on tests.claims to authenticated,anon,service_role;
grant execute on all functions in schema tests to authenticated,anon,service_role;

insert into churches(id,name,timezone) values(tests.id(200),'Riverside Church','America/Toronto');
insert into engagements(id,church_id,title,base_year,settings) values(tests.id(100),tests.id(200),'Summary room',2026,'{"ai_enabled":true}');
update engagements set lens_names=array['Our people','Our neighbours','Our leaders','Our rhythms','Our learning'] where id=tests.id(100);
insert into auth.users(id,email,email_confirmed_at)
select tests.id(n),case when n=1 then 'fac1@clearway.co' else 'person'||n||'@example.org' end,now() from generate_series(1,7)n;
insert into auth.sessions(id,user_id) select tests.id(1000+n),tests.id(n) from generate_series(1,7)n;
insert into auth.identities(user_id,provider,provider_id,identity_data) select id,'google',id::text,jsonb_build_object('email',email,'email_verified',true) from auth.users where id=tests.id(1);
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method) values(gen_random_uuid(),tests.id(1001),now(),now(),'oauth');
insert into clearway_users(id,auth_user_id,name,email,is_admin,team_hub_team_member_id) values(tests.id(701),tests.id(1),'Chris Vacher','fac1@clearway.co',false,tests.id(801));
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values(tests.id(100),tests.id(701),'lead');
insert into attendees(id,engagement_id,auth_user_id,name,email,verified_at,room_role) values
 (tests.id(503),tests.id(100),tests.id(3),'Priya Shah','person3@example.org',now(),'participant'),
 (tests.id(505),tests.id(100),tests.id(5),'Ben Ortiz','person5@example.org',now(),'participant'),
 (tests.id(506),tests.id(100),tests.id(6),'Ruth Ade','person6@example.org',now(),'participant'),
 (tests.id(507),tests.id(100),tests.id(7),'Sam Lee','person7@example.org',now(),'participant');
insert into device_sessions(engagement_id,attendee_id,auth_session_id) values(tests.id(100),tests.id(503),tests.id(1003)),(tests.id(100),tests.id(505),tests.id(1005)),
 (tests.id(100),tests.id(506),tests.id(1006)),(tests.id(100),tests.id(507),tests.id(1007));
insert into sessions(id,engagement_id,title,part,position,interaction,prompt,state,max_sends,max_characters,max_words,mode,options) values
 (tests.id(410),tests.id(100),'Lens 1','Day 1',1,'lens','In {base year + 10}, our people ...','closed',8,200,50,'live','{"lens":1}'),
 (tests.id(411),tests.id(100),'Lens 2','Day 1',2,'lens','In {base year + 10}, our neighbours ...','closed',8,200,50,'live','{"lens":2}'),
 (tests.id(450),tests.id(100),'Sign off the 10-year Future','Day 1',9,'lens_summary','The 10-year Future, one lens at a time','ready',1,140,50,'live','{"lens":1}');
-- The Five Lenses exercise has run: lens 1 and lens 2 are open with their sentences; lens 3 has one and is not open.
insert into private.lens_openings(engagement_id,lens,session_id) values(tests.id(100),1,tests.id(410)),(tests.id(100),2,tests.id(411));
insert into private.lens_sentences(id,engagement_id,lens,source,text,session_id) values
 (tests.id(601),tests.id(100),1,'live','Zebrafish we eat together every week',tests.id(410)),
 (tests.id(602),tests.id(100),1,'live','Zebrafish we send people into the neighbourhood',tests.id(410)),
 (tests.id(603),tests.id(100),1,'live','Zebrafish people of every age lead',tests.id(410)),
 (tests.id(604),tests.id(100),1,'live','Zebrafish we pray before we plan',tests.id(410)),
 (tests.id(611),tests.id(100),2,'live','Quokka our street knows us by name',tests.id(411)),
 (tests.id(612),tests.id(100),2,'live','Quokka we run the community supper',tests.id(411)),
 (tests.id(621),tests.id(100),3,'live','Narwhal one lonely leader sentence',null);


-- ---------- Item 4: rehearsal scribe cards and files are marked and cleared ----------
insert into private.scribe_cards(id,engagement_id,session_id,kind,text,attendee_id,captured_at) values(tests.id(901),tests.id(100),tests.id(450),'quote','A real card, made outside a rehearsal.',tests.id(503),now());
insert into private.scribe_files(id,engagement_id,session_id,kind,name,content_type,bytes,storage_path,attendee_id,captured_at)
values(tests.id(902),tests.id(100),tests.id(450),'photo','real.jpg','image/jpeg',1000,tests.id(100)::text||'/'||tests.id(450)::text||'/'||tests.id(902)::text||'.jpg',tests.id(503),now());
select is((select test from private.scribe_cards where id=tests.id(901)),false,'A scribe card made outside a rehearsal is not a test');
select is((select test from private.scribe_files where id=tests.id(902)),false,'nor is a file');
set local role authenticated;
select tests.login(1);
select is(public.rehearsal_control(tests.id(100),tests.id(951),'start')->>'status','ok','The rehearsal starts');
reset role;
insert into private.scribe_cards(id,engagement_id,session_id,kind,text,attendee_id,captured_at) values(tests.id(903),tests.id(100),tests.id(450),'quote','A rehearsal card.',tests.id(503),now());
insert into private.scribe_files(id,engagement_id,session_id,kind,name,content_type,bytes,storage_path,attendee_id,captured_at)
values(tests.id(904),tests.id(100),tests.id(450),'photo','test.jpg','image/jpeg',1000,tests.id(100)::text||'/'||tests.id(450)::text||'/'||tests.id(904)::text||'.jpg',tests.id(503),now());
select is((select test from private.scribe_cards where id=tests.id(903)),true,'A scribe card made in a rehearsal is marked as a test');
select is((select test from private.scribe_files where id=tests.id(904)),true,'and so is a file');
set local role authenticated;
select tests.login(1);
select is(public.rehearsal_scribe_paths(tests.id(100)),array[tests.id(100)::text||'/'||tests.id(450)::text||'/'||tests.id(904)::text||'.jpg'],'The facilitator is told the stored bytes of the test files only');
select tests.login(3);
select is(public.rehearsal_scribe_paths(tests.id(100)),array[]::text[],'A participant is told nothing');
select tests.login(1);
select is(public.rehearsal_control(tests.id(100),tests.id(952),'end')->>'status','ok','The rehearsal ends');
select is(public.rehearsal_control(tests.id(100),tests.id(953),'clear')->>'status','ok','Clear test answers runs');
reset role;
select is((select deleted from private.scribe_cards where id=tests.id(903)),true,'Clear test answers puts away the rehearsal card');
select is((select deleted from private.scribe_files where id=tests.id(904)),true,'and the rehearsal file');
select is((select deleted from private.scribe_cards where id=tests.id(901)),false,'and leaves the real card');
select is((select deleted from private.scribe_files where id=tests.id(902)),false,'and the real file');
select is((select has_function_privilege('anon','public.rehearsal_scribe_paths(uuid)','execute')),false,'The paths function is not open to the public');

-- ---------- Item 5: the Seeding note ----------
select is((select count(*)::integer from private.templates where id in ('c1ea0000-0000-4000-8000-000000000002','c1ea0000-0000-4000-8000-000000000003') and sessions::text like '%Five Lenses screen''s planned time and stays open until Day 1 begins. If the call runs early or late, move its Opens time in the run of show.%'),2,'Both Wayfinding templates say the Seeding step opens at the planned time');
select is((select count(*)::integer from private.templates where sessions::text like '%goes up and stays open%'),0,'and none still promises it opens when the screen goes up');

-- ---------- Item 6: a draft and a fold may run past 420 characters ----------
set local role authenticated;
select tests.login(1);
select is(tests.ctl(1,'go_live',jsonb_build_object('session',tests.id(450)))->>'status','ok','The step goes live');
reset role;
select is(tests.claim('draft',450,911)->>'job','draft_lens_summary','AI claims the draft');
select is(tests.apply('draft',911,jsonb_build_object('sentences',jsonb_build_array(
 jsonb_build_object('text','We welcome every guest by name at the door before the service begins each week.','sources',jsonb_build_array(tests.ref('draft','sentences','Zebrafish we eat together every week'))),
 jsonb_build_object('text','We eat together every week and the tables are full of old and young alike.','sources',jsonb_build_array(tests.ref('draft','sentences','Zebrafish we eat together every week'))),
 jsonb_build_object('text','People of every age lead and every ministry has an apprentice at its side.','sources',jsonb_build_array(tests.ref('draft','sentences','Zebrafish people of every age lead'))),
 jsonb_build_object('text','We send people into the neighbourhood to listen first and to serve second.','sources',jsonb_build_array(tests.ref('draft','sentences','Zebrafish we send people into the neighbourhood'))),
 jsonb_build_object('text','We pray before we plan and we keep praying while we carry the plan out.','sources',jsonb_build_array(tests.ref('draft','sentences','Zebrafish we pray before we plan'))),
 jsonb_build_object('text','Our neighbours say they can count on us when the street needs a hand.','sources',jsonb_build_array(tests.ref('draft','sentences','Zebrafish we send people into the neighbourhood'))))))->>'applied','1',
 'A six line draft of more than 420 characters is applied');
select ok((select sum(length(t))+5 from unnest(tests.lines(tests.vid())) t)>420,'and it is longer than one screen');
select is(array_length(tests.lines(tests.vid()),1),6,'with all six lines');
select ok((select output::text not like '%too_long%' from private.ai_runs where id=(tests.c('draft')->>'run')::uuid),'and nothing is refused as too long');
select ok((tests.results()->'summary'->>'fit')::integer<6 and (tests.results()->'summary'->>'more')::integer>0 and (tests.results()->'summary'->>'fit')::integer+(tests.results()->'summary'->>'more')::integer=6,'The TV shows what fits and phones show the rest');
set local role authenticated;
select tests.login(5);
select is(tests.answer(1,'suggest','Add that we tell our stories out loud')->>'status','accepted','A person suggests a change');
reset role;
select tests.quiet();
select is(tests.claim('fold',450,922)->>'job','fold_lens_summary','AI folds it in');
select is(tests.apply('fold',922,jsonb_build_object('sentences',jsonb_build_array(
 jsonb_build_object('keep',tests.ref('fold','summary','We welcome every guest by name at the door before the service begins each week.')),
 jsonb_build_object('keep',tests.ref('fold','summary','We eat together every week and the tables are full of old and young alike.')),
 jsonb_build_object('keep',tests.ref('fold','summary','People of every age lead and every ministry has an apprentice at its side.')),
 jsonb_build_object('keep',tests.ref('fold','summary','We send people into the neighbourhood to listen first and to serve second.')),
 jsonb_build_object('keep',tests.ref('fold','summary','We pray before we plan and we keep praying while we carry the plan out.')),
 jsonb_build_object('keep',tests.ref('fold','summary','Our neighbours say they can count on us when the street needs a hand.')),
 jsonb_build_object('text','We tell our stories out loud.','suggestions',jsonb_build_array(tests.ref('fold','suggestions','Add that we tell our stories out loud'))))))->>'changed','true',
 'A fold that runs past 420 characters is applied, not thrown away');
select is(tests.versions(),2,'as version 2');
select is(array_length(tests.lines(tests.vid()),1),7,'with seven lines');
select ok((select output::text not like '%too_long%' from private.ai_runs where id=(tests.c('fold')->>'run')::uuid),'and nothing is refused as too long');
select ok((select changed from private.ai_runs where id=(tests.c('fold')->>'run')::uuid),'The run records the change');

select * from finish();
rollback;
