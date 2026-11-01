begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('86000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(1000+n),'user_metadata','{}')::text,true); end $$;
create function tests.send(eng integer,ses integer,n integer,answer text) returns jsonb language sql as $$
 select public.live_submit(tests.id(eng),tests.id(n),tests.id(ses),0,'submit',answer,now(),null,0)
$$;
grant execute on all functions in schema tests to authenticated,anon,service_role;
insert into churches(id,name,timezone) values(tests.id(200),'Church A','America/Toronto');
insert into engagements(id,church_id,title) values(tests.id(100),tests.id(200),'Cloud room'),(tests.id(101),tests.id(200),'Wall room');
insert into auth.users(id,email,email_confirmed_at) select tests.id(n),'person'||n||'@example.org',now() from generate_series(3,5)n;
insert into auth.sessions(id,user_id) select tests.id(1000+n),tests.id(n) from generate_series(3,5)n;
insert into attendees(id,engagement_id,auth_user_id,name,email,verified_at,room_role) values
 (tests.id(503),tests.id(100),tests.id(3),'Ruth','person3@example.org',now(),'participant'),
 (tests.id(505),tests.id(100),tests.id(5),'Ben','person5@example.org',now(),'participant'),
 (tests.id(504),tests.id(101),tests.id(4),'Grace','person4@example.org',now(),'participant');
insert into device_sessions(engagement_id,attendee_id,auth_session_id) values
 (tests.id(100),tests.id(503),tests.id(1003)),(tests.id(100),tests.id(505),tests.id(1005)),(tests.id(101),tests.id(504),tests.id(1004));
insert into sessions(id,engagement_id,title,prompt,state,interaction,max_characters,max_words,max_sends) values
 (tests.id(300),tests.id(100),'Celebration','One word','live','word_cloud',28,3,10),
 (tests.id(301),tests.id(101),'Celebration wall','What is worth celebrating?','live','wall',280,50,10);
update room_states set live_session_id=tests.id(300),tv_content='session' where engagement_id=tests.id(100);
update room_states set live_session_id=tests.id(301),tv_content='session' where engagement_id=tests.id(101);

-- The word filter: evasions are caught, Scripture language and innocent words pass.
select ok(private.screen_text(t),'Screened: '||t) from unnest(array['shit','F U C K','f.u.c.k','f-u-c-k','fuuuck','sh1t','$hit','f*ck','f**k','sh*t happens',
  'motherfuckers','bullshit','what the fuck','wanker','pissed','a*s','ass','retarded']) t;
select ok(not private.screen_text(t),'Kept: '||t) from unnest(array['Hope','Momentum','Young families','class','assess','pass','Hell','damn','God is good',
  'push it','retardant','Dickens','Arsenal','Titus','I a m','3 kids','100%','Seniors'' lunch serving the whole street','']) t;
select ok(not private.screen_text(null),'Null is not screened');
select ok(not has_function_privilege('authenticated','private.screen_text(text)','execute'),'Phones cannot probe the filter vocabulary');
select ok(not has_function_privilege('anon','private.screen_text(text)','execute'),'Anonymous callers cannot probe the filter vocabulary');

set local role authenticated;
-- The wall screens whole sentences; nothing filtered is stored or broadcast.
select tests.login(4);
select is(tests.send(101,301,900,'Teenagers asking to be baptized')->>'status','accepted','A wall sentence is accepted');
select is(tests.send(101,301,901,'This is f u c k i n g great')->>'status','filtered','A spaced-out word is filtered on the wall');
select is(tests.send(101,301,902,'Absolute bullsh1t budget meetings')->>'status','filtered','A disguised word is filtered on the wall');
select is((public.live_snapshot(tests.id(101))->>'version')::integer,2,'A filtered answer never raises the version');
select is(jsonb_array_length(public.live_snapshot(tests.id(101))->'answers'),1,'Only the accepted answer reaches the TV');

-- The word cloud: counts and square-root sizes computed once on the server,
-- with each word's arrival order for the single-mention row.
select tests.login(3);
select is(tests.send(100,300,910,'youth')->>'status','accepted','First word');
select is(tests.send(100,300,911,'alpha')->>'status','accepted','Second word');
select is(tests.send(100,300,912,'Youth, hope')->>'status','accepted','A comma splits one send');
select is(tests.send(100,300,913,'sh*t')->>'status','filtered','A starred word is filtered in the cloud');
select tests.login(5);
select is(tests.send(100,300,914,'youth')->>'status','accepted','Another phone repeats a word');
select is(tests.send(100,300,915,'momentum, f u c k')->>'status','filtered','One screened part holds the whole send');
reset role;
select is((select count(*)::integer from submissions where engagement_id=tests.id(100)),4,'Filtered sends are never stored');
create temporary table cloud as select w from room_states r cross join lateral jsonb_array_elements(r.results->'words') w where r.engagement_id=tests.id(100);
select is((select (w->>'count')::integer from cloud where w->>'key'='youth'),3,'Repeats are counted on the server');
select is((select w->>'level' from cloud where w->>'key'='youth'),'leader','The most mentioned word leads');
select is((select (w->>'size')::numeric from cloud where w->>'key'='youth'),168::numeric,'The leader is sized to the headline size');
select is((select round((w->>'size')::numeric,4) from cloud where w->>'key'='alpha'),56::numeric,'A single mention takes the TV minimum');
select is((select w->>'level' from cloud where w->>'key'='hope'),'single','A single mention stays a chip');
select is((select array_agg(w->>'key' order by (w->>'order')::integer) from cloud),array['youth','alpha','hope'],'Words carry their arrival order');
select is((select (results->>'total')::integer from room_states where engagement_id=tests.id(100)),5,'The total counts every visible answer');
select * from finish();
rollback;
