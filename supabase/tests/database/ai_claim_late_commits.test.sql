-- AI claims answers that commit late (migration ai_claim_late_commits). live_submit stamps
-- server_received_at when its transaction starts, so an answer can commit after a claim with a
-- received time earlier than that claim. The next claim must still see it: on the wall
-- (grouping), in Q&A (folding) and for the wall summary's fresh count.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('87600000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.claim(session integer,lease integer) returns jsonb language sql as $$
 select public.ai_claim(tests.id(session),tests.id(lease),'claude-test-model','{"combine_words":"combine-words@1","group_wall":"group-wall@1","summarize_wall":"summarize-wall@1","fold_questions":"fold-questions@1"}') $$;
-- An answer stamped as received a moment ago, as one that committed after a claim would be.
create function tests.late(n integer,session integer,person integer,body text) returns void language sql as $$
 insert into public.submissions(id,engagement_id,session_id,attendee_id,text,answers,phone_sent_at,server_received_at,created_at)
 values(tests.id(n),tests.id(100),tests.id(session),tests.id(person),body,jsonb_build_array(jsonb_build_object('key',lower(body),'text',body)),now()-interval '2 seconds',
  clock_timestamp()-interval '2 seconds',clock_timestamp()-interval '2 seconds') $$;
create function tests.answers(c jsonb,list text) returns text[] language sql as $$ select array(select x->>'text' from jsonb_array_elements(c->'inputs'->list) x order by x->>'text') $$;
grant execute on all functions in schema tests to authenticated,anon,service_role;

insert into churches(id,name,timezone) values(tests.id(200),'Riverside Church','America/Toronto');
insert into engagements(id,church_id,title,settings) values(tests.id(100),tests.id(200),'AI room','{"ai_enabled":true}');
insert into attendees(id,engagement_id,name,email,room_role) values
 (tests.id(501),tests.id(100),'Priya Shah','p@example.org','participant'),(tests.id(502),tests.id(100),'Ben Ortiz','b@example.org','participant'),
 (tests.id(503),tests.id(100),'Ruth Ade','r@example.org','participant');
insert into sessions(id,engagement_id,title,part,position,interaction,prompt,state,max_sends,max_characters,max_words) values
 (tests.id(320),tests.id(100),'Wall','Day 1',0,'wall','What is worth celebrating?','live',20,280,50),
 (tests.id(330),tests.id(100),'Questions','Day 1',1,'qa','What do you want to ask?','open',20,200,50);

-- ---------- The wall: grouping ----------
select tests.late(1,320,501,'Three baptisms at Easter');
select tests.late(2,320,502,'Our Alpha course was full');
select is(tests.claim(320,901)->>'job','group_wall','Two open answers: grouping is due');
select is(tests.claim(320,999)->>'status','busy','A second claim while the first is leased is busy');
select is((select public.ai_apply(r.id,tests.id(901),'{"groups":[]}','{"ms":10}') from private.ai_runs r where r.session_id=tests.id(320) and r.status='running')->>'status','ok','The worker applies and lets go of the lease');
select is(tests.claim(320,902)->>'status','idle','Nothing new: idle');
-- Committed after that claim, received before it.
select tests.late(3,320,503,'Teenagers asking to be baptized');
select ok((select server_received_at<group_seen_at from public.submissions x,private.ai_sessions a where x.id=tests.id(3) and a.session_id=tests.id(320)),
 'The late answer was received before the last claim''s watermark');
select is(tests.claim(320,903)->>'job','group_wall','A late answer is still claimed for grouping');
select ok('Teenagers asking to be baptized'=any(tests.answers((select jsonb_build_object('inputs',inputs) from private.ai_runs where session_id=tests.id(320) and status='running'),'answers')),
 'and it is in the run''s inputs');
select is((select public.ai_apply(r.id,tests.id(903),'{"groups":[]}','{"ms":10}') from private.ai_runs r where r.session_id=tests.id(320) and r.status='running')->>'status','ok','Applied');
select is(tests.claim(320,904)->>'status','idle','Seen once, it does not make grouping due again');
-- A failed call still sends the work round again (ai_fail sets the watermark back).
select tests.late(4,320,501,'Young families staying after the service');
select is(tests.claim(320,905)->>'job','group_wall','Due again');
select is((select public.ai_fail(r.id,tests.id(905),'timeout','{"ms":20000}') from private.ai_runs r where r.session_id=tests.id(320) and r.status='running')->>'status','ok','The call fails');
update private.ai_sessions set last_failed_at=now()-interval '1 minute' where session_id=tests.id(320);
select is(tests.claim(320,906)->>'job','group_wall','After a failure the same answers are tried again');
select is((select public.ai_apply(r.id,tests.id(906),'{"groups":[]}','{"ms":10}') from private.ai_runs r where r.session_id=tests.id(320) and r.status='running')->>'status','ok','Applied');

-- ---------- The wall summary: fresh answers by id ----------
insert into private.ai_sessions(session_id,engagement_id) values(tests.id(320),tests.id(100)) on conflict do nothing;
update private.ai_sessions set summary_shown=true where session_id=tests.id(320);
create temp table sumclaim as select tests.claim(320,907) as c;
grant select on sumclaim to authenticated,anon,service_role;
select is((select c->>'job' from sumclaim),'summarize_wall','Show summary: a summary is due');
select is((select jsonb_array_length(c->'inputs'->'ids') from sumclaim),4,'The summary run records the ids it read');
select is((select public.ai_apply((c->>'run')::uuid,tests.id(907),'{"summary":"Baptisms and Alpha lead."}','{"ms":10}') from sumclaim)->>'status','ok','Applied');
-- Eight answers that commit late, each received before the summary's cut time: all fresh.
select tests.late(10+n,320,501+(n%3),'Late card '||n) from generate_series(1,8) n;
select ok((select bool_and(x.server_received_at<s.cut_at) from public.submissions x,private.ai_summaries s where x.id=any(array(select tests.id(10+n) from generate_series(1,8) n)) and s.session_id=tests.id(320)),
 'Every late card was received before the summary''s cut time');
-- Group them first so the summary check runs (the wall claims grouping only after the summary).
update private.ai_sessions set group_seen_at=now(),group_seen_ids=array(select id from public.submissions where session_id=tests.id(320)) where session_id=tests.id(320);
select is(tests.claim(320,908)->>'job','summarize_wall','Eight late answers make the summary due again');

-- ---------- Q&A: folding ----------
-- The Q&A step is open (taking late answers while the room is in its segment).
select tests.late(31,330,501,'When does the new building open?');
select tests.late(32,330,502,'How much will the building cost?');
select is(tests.claim(330,911)->>'job','fold_questions','Two questions: folding is due');
select is((select public.ai_apply(r.id,tests.id(911),'{"groups":[]}','{"ms":10}') from private.ai_runs r where r.session_id=tests.id(330) and r.status='running')->>'status','ok','Applied');
select is(tests.claim(330,912)->>'status','idle','Nothing new: idle');
select tests.late(33,330,503,'Can we visit the site before spring?');
select ok((select server_received_at<fold_seen_at from public.submissions x,private.ai_sessions a where x.id=tests.id(33) and a.session_id=tests.id(330)),
 'The late question was received before the last claim''s watermark');
select is(tests.claim(330,913)->>'job','fold_questions','A late question is still claimed for folding');
select ok(exists(select 1 from private.ai_runs r,jsonb_array_elements(r.inputs->'questions') q where r.session_id=tests.id(330) and r.status='running' and q->>'text'='Can we visit the site before spring?'),
 'and it is in the run''s inputs');
select is((select public.ai_apply(r.id,tests.id(913),'{"groups":[]}','{"ms":10}') from private.ai_runs r where r.session_id=tests.id(330) and r.status='running')->>'status','ok','Applied');
select is(tests.claim(330,914)->>'status','idle','Seen once, it does not make folding due again');

select * from finish();
rollback;
