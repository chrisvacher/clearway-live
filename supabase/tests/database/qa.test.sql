begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('87400000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(1000+n))::text,true); end $$;
create function tests.live() returns uuid language sql security definer set search_path='' as $$ select live_session_id from public.room_states where engagement_id=tests.id(100) $$;
create function tests.results() returns jsonb language sql security definer set search_path='' as $$ select results from public.room_states where engagement_id=tests.id(100) $$;
create function tests.q(n integer) returns jsonb language sql security definer set search_path='' as $$
 select e from jsonb_array_elements((select results->'questions' from public.room_states where engagement_id=tests.id(100))) e where e->'ids' ? tests.id(n)::text $$;
create function tests.ctl(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$
 select public.room_control(tests.id(100),tests.id(n),action,jsonb_build_object('from',tests.live())||p) $$;
create function tests.qa(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$ select public.qa_control(tests.id(100),tests.id(n),action,p) $$;
create function tests.ask(n integer,session integer,text text,action text default 'submit',revision integer default 0) returns jsonb language sql as $$
 select public.live_submit(tests.id(100),tests.id(n),tests.id(session),revision,action,text,now(),null,0) $$;
create function tests.vote(n integer,question integer,revision integer,on_ boolean,queued timestamptz default null) returns jsonb language sql as $$
 select public.qa_vote(tests.id(100),tests.id(n),tests.id(question),revision,on_,now(),queued,0) $$;
create function tests.save(n integer,kind text,options jsonb,state text default 'ready',revision integer default null) returns jsonb language sql as $$
 select public.show_write(tests.id(100),'save',jsonb_build_object('id',tests.id(n),'revision',revision,'title','Step '||n,'part','Day 1','mode','live','interaction',kind,
  'prompt','What do you want to ask about the results?','phone_depth','','notes','','lands_in','','segment','','state',state,'planned_minutes',5,'max_sends',3,'max_characters',200,'max_words',50,
  'settings',jsonb_build_object('anonymous',true,'burst_minutes',4,'join_strip',false),'options',options)) $$;
create function tests.broadcasts() returns integer language sql security definer set search_path='' as $$
 select count(*)::integer from realtime.messages where topic like 'live:'||tests.id(100)||':%' and event='room' $$;
grant execute on all functions in schema tests to authenticated,anon,service_role;
-- Step 1's private.live_public_state, verbatim, to prove the redefinition keeps every field and rule.
create function tests.step1_state(p_engagement uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('state',jsonb_build_object('engagement_id',r.engagement_id,'live_session_id',r.live_session_id,'tv_content',r.tv_content,'phones_down',r.phones_down,'burst_ends_at',r.burst_ends_at,'spotlight_id',r.spotlight_id,'spotlight_key',r.spotlight_key,'hidden_ids',r.hidden_ids,'hidden_keys',r.hidden_keys,'remote_holder_id',r.remote_holder_id,'team_led_block_id',r.team_led_block_id,'show_tv_on_phones',r.show_tv_on_phones,'phone_refresh_version',r.phone_refresh_version,'results',r.results,'version',r.version),'session',case when s.id is not null then jsonb_build_object(
 'id',s.id,'title',s.title,'interaction',s.interaction,'prompt',private.fill_years(s.prompt,e.base_year),'state',s.state,'revision',s.revision,'base_year',e.base_year,
 'max_sends',s.max_sends,'max_characters',s.max_characters,'max_words',s.max_words,'options',private.public_options(s,e.settings),'kind',private.kind_public(s.interaction),
 'settings',jsonb_build_object('anonymous',s.settings->'anonymous','burst_minutes',s.settings->'burst_minutes','join_strip',s.settings->'join_strip')) end)||private.tv_room_info(p_engagement)
 from public.room_states r join public.engagements e on e.id=r.engagement_id left join public.sessions s on s.id=r.live_session_id and not s.deleted
 where r.engagement_id=p_engagement and not r.deleted
$$;
create function tests.same_state() returns boolean language sql stable security definer set search_path='' as $$
 select private.live_public_state(tests.id(100))-'qa' = tests.step1_state(tests.id(100)) and private.live_public_state(tests.id(100)) ? 'qa' $$;
grant execute on all functions in schema tests to authenticated,anon,service_role;

insert into churches(id,name,timezone) values(tests.id(200),'Riverside Church','America/Toronto');
insert into engagements(id,church_id,title,settings) values(tests.id(100),tests.id(200),'Questions room','{"scripture_translation":"NIV"}');
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
insert into private.tv_devices(id,proof,engagement_id,label,paired_at) values(tests.id(450),repeat('a',64),tests.id(100),'Front TV',now());
insert into private.live_tv_sessions(id,engagement_id,auth_user_id,auth_session_id,device_id) values(tests.id(400),tests.id(100),tests.id(4),tests.id(1004),tests.id(450));

-- The kind and its tables.
select is((select row(input,one_per_person,counts,structured,shares_answers,spotlight,named)::text from private.interaction_kinds where kind='qa'),'(t,f,answers,f,t,id,never)','Q&A is registered: several questions per person, counted as answers, Spotlight by question id');
select ok((select array_agg(kind) from private.interaction_kinds) @> array['word_cloud','wall','content','qa'],'The earlier kinds stay registered');
select ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where oid in('private.qa_questions'::regclass,'private.qa_merges'::regclass,'private.qa_votes'::regclass)),'Questions, merges and votes force row-level security');
select ok(not has_table_privilege('authenticated','private.qa_votes','select') and not has_table_privilege('authenticated','private.qa_merges','select') and not has_table_privilege('authenticated','private.qa_questions','select'),'Browsers cannot read votes, merges or question state directly');
select is(private.qa_words('How many people answered the survey?'),array['answered','people','survey'],'Matching words: lower case, no punctuation, common words removed');
select is(private.qa_words('Are the small groups growing?'),array['group','growing','small'],'A trailing s is dropped on longer words');
select is(private.qa_overlap(array['answered','people','survey'],array['people','survey','took']),0.66666666666666666667,'Two of three words is not enough');
select is(private.qa_overlap(array['budget','building','next','year'],array['budget','building','next','years']),0.75,'Three of four words is about three-quarters');

set local role authenticated;
select tests.login(1);
select is(tests.save(310,'qa','{}')->>'status','ok','A Q&A step saves');
select is(tests.save(311,'word_cloud','{}')->>'status','ok','A word cloud step saves');
select is(tests.save(312,'qa','{"any_time":"yes"}')->>'status','invalid_request','Questions any time is a yes or no setting');
select is(tests.save(312,'qa','{"color":"red"}')->>'status','invalid_request','An unknown Q&A setting is refused');
reset role;
select is((select options from sessions where id=tests.id(310)),'{"any_time":false}'::jsonb,'Questions any time is off by default');
set local role authenticated;

-- Asking: anonymous, up to 200 characters, through the word filter, several per person.
select tests.login(1);
select is(tests.ctl(900,'go_live',jsonb_build_object('session',tests.id(310)))->>'status','ok','Go live on the Q&A step');
select ok(tests.same_state(),'The shared state is step 1''s exactly, plus qa, with the Q&A step live');
select is(tests.results(),'{"total":0,"people":0,"words":[],"questions":[]}'::jsonb,'Empty: no questions yet');
select tests.login(3);
select is(tests.ask(901,310,'How many people answered the survey?')->>'status','accepted','A question is accepted');
select is(tests.ask(902,310,repeat('a',201))->>'status','limit','Over 200 characters is refused');
select is(tests.ask(903,310,'Is this shit real?')->>'status','filtered','The word filter screens questions');
select is((tests.q(901)->>'people')::integer,1,'The first question counts its asker');
select is((tests.results()->>'total')::integer,1,'and the count is one question');
-- Folding by matching words as questions arrive.
select tests.login(5);
select is(tests.ask(904,310,'How many people answered the survey??')->>'status','accepted','A near-duplicate is accepted');
select is(tests.q(904)->>'id',tests.id(901)::text,'and folds into the first question as it arrives');
select is((tests.q(901)->>'askers')::integer,2,'asked by 2');
select is((tests.q(901)->>'folded')::integer,1,'one question folded');
select is((tests.q(901)->>'score')::integer,4,'Each person who asked counts 2');
select is((tests.results()->>'total')::integer,1,'Still one question on the count');
select ok(not (tests.q(901) ? 'ai'),'A fold by matching words is not marked as AI');
select is(tests.ask(905,310,'How many people took the survey?')->>'status','accepted','A question with less overlap');
select isnt(tests.q(905)->>'id',tests.id(901)::text,'stays its own question');
select is(tests.ask(906,310,'Is the building really the main issue?')->>'status','accepted','Ben asks another question');
reset role;
select is((select made_by from private.qa_merges where member_id=tests.id(904)),'words','The merge records that matching words made it');
select ok(not exists(select 1 from private.qa_merges where member_id=tests.id(905)),'No merge for the different question');
set local role authenticated;

-- Votes: one per person per question, toggled, never your own.
select tests.login(6);
select is(tests.vote(950,906,0,true)->>'status','accepted','Ruth upvotes the building question');
select is(tests.vote(950,906,0,true)->>'status','duplicate','A resend of the same press is a duplicate');
select is(tests.vote(951,906,0,true)->>'id',tests.id(950)::text,'A second vote from another phone lands on the same one vote');
select is((tests.q(906)->>'votes')::integer,1,'and counts once');
select is((tests.q(906)->>'score')::integer,3,'Asker 2 plus one voter');
select tests.login(5);
select is(tests.vote(952,906,0,true)->>'status','own','You cannot vote for your own question');
select is(tests.vote(953,901,0,true)->>'status','own','nor for a question folded with yours');
select is(tests.vote(953,904,0,true)->>'status','own','by either id');
select tests.login(3);
select is(tests.vote(954,906,0,true)->>'status','accepted','Priya upvotes the building question');
select is((tests.q(906)->>'score')::integer,4,'It ties the folded question');
select is((tests.results()->'questions'->0->>'id'),tests.id(906)::text,'Ties go to the most recent activity');
select tests.login(6);
select is(tests.vote(950,906,2,false)->>'status','accepted','Ruth takes her vote back');
select is((tests.q(906)->>'votes')::integer,1,'The vote toggles off');
select is((tests.results()->'questions'->0->>'id'),tests.id(901)::text,'and the folded question leads again');
select is(tests.vote(950,906,5,true)->>'status','conflict','A press that skips a revision is refused');
select is(tests.vote(955,999,0,true)->>'status','missing','A vote on no question is refused');
select is(public.qa_my_votes(tests.id(100))->'votes','[{"id":"87400000-0000-4000-8000-000000000950","voted":false,"revision":2,"question_id":"87400000-0000-4000-8000-000000000906"}]'::jsonb,'A phone reads only its own votes');
select tests.login(4);
select ok(public.live_snapshot(tests.id(100))->'state'->'results'->'questions' is not null,'The TV gets the ranked questions');
select ok(public.live_snapshot(tests.id(100))::text not like '%87400000-0000-4000-8000-00000000050%','No attendee id travels to the TV');
select is(public.qa_vote(tests.id(100),tests.id(956),tests.id(906),0,true,now())->>'status','denied','A TV cannot vote');
select is(public.qa_my_votes(tests.id(100))->>'status','denied','nor read votes');

-- Phones down: votes and questions wait.
select tests.login(1);
select is(tests.ctl(907,'phones_down')->>'status','ok','Phones down');
select tests.login(7);
select is(tests.vote(957,906,0,true)->>'status','closed','A vote while phones are down is refused');
select is(tests.ask(958,310,'Who decides what goes in the final plan?')->>'status','closed','and so is a question');
select tests.login(1);
select is(tests.ctl(908,'open_phones')->>'status','ok','Phones open');
select tests.login(7);
select is(tests.ask(958,310,'Who decides what goes in the final plan?')->>'status','accepted','Sam asks');

-- The facilitator's controls: undo a fold, edit, Answered, Spotlight over any session, Hide.
select tests.login(3);
select is(public.qa_control(tests.id(100),tests.id(960),'answered',jsonb_build_object('question',tests.id(901)))->>'status','denied','A phone cannot use the Q&A controls');
select is(public.qa_status(tests.id(100))->>'status','denied','nor read the Q&A panel');
select tests.login(1);
select is(jsonb_array_length(public.qa_status(tests.id(100))->'questions'->0->'members'),1,'The panel lists the folded question');
select is(public.qa_status(tests.id(100))->'questions'->0->'members'->0->>'by','words','with who folded it');
select is(tests.qa(961,'undo_fold',jsonb_build_object('merge',(public.qa_status(tests.id(100))->'questions'->0->'members'->0->>'merge')))->>'status','ok','Undo the fold');
select is(tests.q(904)->>'id',tests.id(904)::text,'The folded question is its own row again');
select is((tests.q(901)->>'askers')::integer,1,'and the survivor is asked by 1');
select is((tests.results()->>'total')::integer,5,'Five questions on the count');
select is(tests.qa(961,'undo_fold',jsonb_build_object('merge',tests.id(1)))->>'status','duplicate','A repeated press is a duplicate');
reset role;
select is(private.qa_fold_words(tests.id(904)),null,'A question whose fold was undone is never refolded by words');
set local role authenticated;
select tests.login(1);
select is(tests.qa(962,'edit',jsonb_build_object('question',tests.id(905),'text','How many people took the survey, and when?'))->>'status','ok','Edit a question');
select is(tests.q(905)->>'text','How many people took the survey, and when?','The edited words show');
select is((tests.q(905)->>'edited')::boolean,true,'marked as edited');
select is(tests.qa(963,'edit',jsonb_build_object('question',tests.id(905),'text','Is this shit real?'))->>'status','filtered','An edit goes through the word filter too');
reset role;
select is(private.qa_fold_words(tests.id(905)),null,'An edited question is never refolded');
select is((select text from submissions where id=tests.id(905)),'How many people took the survey?','The asker''s own words stay in the record');
set local role authenticated;
select tests.login(1);
select is(tests.qa(964,'spotlight',jsonb_build_object('question',tests.id(906)))->>'status','ok','Spotlight a question');
select tests.login(4);
select is(public.live_snapshot(tests.id(100))->'qa'->'spotlight'->>'text','Is the building really the main issue?','The TV gets the spotlit question');
select is((public.live_snapshot(tests.id(100))->'qa'->'spotlight'->>'people')::integer,2,'with its count of people');
select tests.login(1);
select is(tests.ctl(965,'go_live',jsonb_build_object('session',tests.id(311)))->>'status','ok','Go live on the word cloud');
select ok(tests.same_state(),'and with another step live under a spotlit question');
select tests.login(4);
select is(public.live_snapshot(tests.id(100))->'qa'->'spotlight'->>'id',tests.id(906)::text,'The spotlight holds over any session');
select is(public.live_snapshot(tests.id(100))->'state'->>'spotlight_key',null,'and leaves the session''s own spotlight alone');
select tests.login(1);
select is(tests.qa(966,'answered',jsonb_build_object('question',tests.id(906)))->>'status','ok','Answered');
select tests.login(4);
select is(public.live_snapshot(tests.id(100))->'qa'->'spotlight','null'::jsonb,'Answered clears the spotlight');
select tests.login(1);
select is((public.qa_status(tests.id(100),tests.id(310))->'questions'->-1->>'answered')::boolean,true,'and marks it answered');
select is(tests.qa(967,'spotlight',jsonb_build_object('question',tests.id(906)))->>'status','invalid_state','An answered question is not spotlit');
select is(tests.qa(968,'unanswer',jsonb_build_object('question',tests.id(906)))->>'status','ok','Bring it back');
select is(tests.ctl(969,'go_live',jsonb_build_object('session',tests.id(310)))->>'status','ok','Back to the Q&A step');
select is((tests.results()->>'total')::integer,5,'Five questions again');
select is(tests.qa(970,'spotlight',jsonb_build_object('question',tests.id(958)))->>'status','ok','Spotlight another');
select is(tests.qa(971,'hide',jsonb_build_object('question',tests.id(958)))->>'status','ok','Hide it');
select is((select spotlight_id from room_states where engagement_id=tests.id(100)),null,'Hiding the spotlit question clears the spotlight');
select ok((select tests.id(958)=any(hidden_ids) from room_states where engagement_id=tests.id(100)),'The room lists it as hidden');
select is((tests.results()->>'total')::integer,4,'and it leaves the count');
select is((public.qa_status(tests.id(100))->'counts'->>'hidden')::integer,1,'The panel still lists it, hidden');
select is(tests.qa(972,'unhide',jsonb_build_object('question',tests.id(958)))->>'status','ok','Unhide it');
select is(tests.qa(973,'answered',jsonb_build_object('question',tests.id(999)))->>'status','missing','An unknown question is refused');

-- Questions any time: one pool for the engagement, asked from any session's phone.
select tests.login(3);
select is(public.qa_ask(tests.id(100),tests.id(980),'Will we talk about the building today?',now())->>'status','closed','No pool yet: Ask is refused');
select tests.login(1);
select is(tests.save(320,'qa','{"any_time":true}')->>'status','ok','A later Q&A step takes questions any time');
select is(tests.ctl(981,'go_live',jsonb_build_object('session',tests.id(311)))->>'status','ok','Go live on the word cloud');
select tests.login(4);
select is(public.live_snapshot(tests.id(100))->'qa'->'pool'->>'session_id',tests.id(320)::text,'Every surface knows the pool');
select is((public.live_snapshot(tests.id(100))->'qa'->'pool'->>'waiting')::integer,0,'Nothing waiting yet');
select tests.login(3);
select is(public.qa_ask(tests.id(100),tests.id(980),'Will we talk about the building today?',now())->>'status','accepted','Priya asks while the word cloud is live');
select is(public.qa_ask(tests.id(100),tests.id(980),'Will we talk about the building today?',now())->>'status','duplicate','A resend is a duplicate');
select is(public.qa_ask(tests.id(100),tests.id(982),'Is this shit real?',now())->>'status','filtered','The word filter screens it');
select is(public.qa_ask(tests.id(100),tests.id(983),repeat('b',201),now())->>'status','limit','and the 200 characters');
select is(public.qa_ask(tests.id(100),tests.id(984),'Will we talk about the budget too?',now())->>'status','accepted','A second question');
select is(public.qa_ask(tests.id(100),tests.id(985),'And the timeline?',now())->>'status','accepted','A third');
select is(public.qa_ask(tests.id(100),tests.id(986),'And staffing?',now())->>'status','limit','The step''s limit of questions per person holds');
select is((tests.results()->>'total')::integer,0,'The live word cloud''s count is untouched');
select tests.login(4);
select is((public.live_snapshot(tests.id(100))->'qa'->'pool'->>'waiting')::integer,3,'The pool counts the waiting questions');
select tests.login(1);
select is(public.qa_status(tests.id(100))->'session'->>'id',tests.id(320)::text,'The panel shows the pool when the live step is not Q&A');
select is(tests.qa(987,'spotlight',jsonb_build_object('question',tests.id(984)))->>'status','ok','Spotlight a pool question over the word cloud');
select tests.login(6);
select is(public.live_snapshot(tests.id(100))->'qa'->'spotlight'->>'text','Will we talk about the budget too?','Phones get it too');
select is(tests.vote(988,984,0,true)->>'status','closed','Votes wait until the pool step is on');
select tests.login(3);
select ok(exists(select 1 from jsonb_array_elements(public.phone_room(tests.id(100))->'answers') a where a->>'id'=tests.id(980)::text),'The asker''s phone holds its own pool question');

-- Existing behaviour holds: every field of the shared state and every phone field, exactly.
select tests.login(4);
select is((select array_agg(k order by k) from jsonb_object_keys(public.live_snapshot(tests.id(100))->'state') k),
 array['burst_ends_at','engagement_id','hidden_ids','hidden_keys','live_session_id','phone_refresh_version','phones_down','remote_holder_id','results','show_tv_on_phones','spotlight_id','spotlight_key','team_led_block_id','tv_content','version'],'The room state keeps every field');
select is((select array_agg(k order by k) from jsonb_object_keys(public.live_snapshot(tests.id(100))->'session') k),
 array['base_year','id','interaction','kind','max_characters','max_sends','max_words','options','prompt','revision','settings','state','title'],'The live step keeps every field');
select ok((select array_agg(k) from jsonb_object_keys(public.live_snapshot(tests.id(100))) k) @> array['state','session','display','presence','answers','qa'],'The shared state keeps the TV fields and adds qa');
select tests.login(1);
select is(tests.ctl(989,'spotlight','{"item":"hope"}')->>'status','missing','The session''s own Spotlight rules are unchanged');
select tests.login(3);
select is((select array_agg(k order by k) from jsonb_object_keys(public.phone_room(tests.id(100))) k),array['answers','name','server_time','sessions','status'],'The phone''s own view is unchanged');
select tests.login(1);
select is(tests.ctl(990,'nothing_live')->>'status','ok','Nothing live');
select ok(tests.same_state(),'and on the holding screen');
select tests.login(4);
select is(public.live_snapshot(tests.id(100))->'qa'->'spotlight'->>'id',tests.id(984)::text,'The spotlight holds over the holding screen too');
select is(public.live_snapshot(tests.id(100))->'session','null'::jsonb,'and no step is live');
reset role;
select ok(tests.broadcasts()>0,'Every change is broadcast');

-- Every new function is private or an invoker wrapper.
select ok(not (select bool_or(prosecdef) from pg_proc where oid in('public.qa_ask(uuid,uuid,text,timestamptz,timestamptz,double precision)'::regprocedure,
 'public.qa_vote(uuid,uuid,uuid,integer,boolean,timestamptz,timestamptz,double precision)'::regprocedure,'public.qa_my_votes(uuid)'::regprocedure,
 'public.qa_control(uuid,uuid,text,jsonb)'::regprocedure,'public.qa_status(uuid,uuid)'::regprocedure)),'The public Q&A functions are invokers');
select ok(not has_function_privilege('authenticated','private.results_qa(uuid,uuid,text[])','execute') and not has_function_privilege('authenticated','private.qa_board(uuid,boolean)','execute')
 and not has_function_privilege('authenticated','private.qa_fold_words(uuid)','execute'),'Results, the board and folding are not callable by browsers');
set local role anon;
select throws_ok($$select public.qa_status('87400000-0000-4000-8000-000000000100'::uuid)$$,'42501',null,'Anonymous callers cannot read the Q&A panel');
reset role;
select * from finish();
rollback;
