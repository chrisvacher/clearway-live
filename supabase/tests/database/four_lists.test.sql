begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('87600000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(1000+n))::text,true); end $$;
create function tests.live() returns uuid language sql security definer set search_path='' as $$ select live_session_id from public.room_states where engagement_id=tests.id(100) $$;
create function tests.results() returns jsonb language sql security definer set search_path='' as $$ select results from public.room_states where engagement_id=tests.id(100) $$;
create function tests.version() returns bigint language sql security definer set search_path='' as $$ select version from public.room_states where engagement_id=tests.id(100) $$;
-- The room's entry for the group a card sits in.
create function tests.g(n integer) returns jsonb language sql security definer set search_path='' as $$
 select e from jsonb_array_elements((select results->'cards' from public.room_states where engagement_id=tests.id(100))) e where e->'ids' ? tests.id(n)::text $$;
create function tests.ctl(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$
 select public.room_control(tests.id(100),tests.id(n),action,jsonb_build_object('from',tests.live())||p) $$;
create function tests.fl(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$ select public.four_lists_control(tests.id(100),tests.id(n),action,p) $$;
create function tests.ai(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$ select public.ai_control(tests.id(100),tests.id(n),action,p) $$;
create function tests.card(n integer,session integer,col text,text text,action text default 'submit',revision integer default 0) returns jsonb language sql as $$
 select public.live_submit(tests.id(100),tests.id(n),tests.id(session),revision,action,text,now(),null,0,jsonb_build_object('column',col)) $$;
create function tests.agree(n integer,card integer,revision integer,on_ boolean,queued timestamptz default null) returns jsonb language sql as $$
 select public.four_lists_agree(tests.id(100),tests.id(n),tests.id(card),revision,on_,now(),queued,0) $$;
create function tests.save(n integer,kind text,options jsonb,part text default 'Discover',state text default 'ready',revision integer default null) returns jsonb language sql as $$
 select public.show_write(tests.id(100),'save',jsonb_build_object('id',tests.id(n),'revision',revision,'title','Step '||n,'part',part,'mode','live','interaction',kind,
  'prompt','Think about our church today.','phone_depth','','notes','','lands_in','','segment','','state',state,'planned_minutes',5,'max_sends',12,'max_characters',140,'max_words',30,
  'settings',jsonb_build_object('anonymous',true,'burst_minutes',4,'join_strip',false),'options',options)) $$;
create table tests.claims(name text primary key,j jsonb);
create function tests.claim(p_name text,session integer,lease integer) returns jsonb language plpgsql as $$
declare j jsonb;
begin
 j:=public.ai_claim(tests.id(session),tests.id(lease),'claude-test-model','{"fold_four_lists":"fold-four-lists@1","fold_questions":"fold-questions@1"}');
 insert into tests.claims(name,j) values(p_name,j) on conflict(name) do update set j=excluded.j;
 return j;
end $$;
create function tests.cl(name text) returns jsonb language sql as $$ select j from tests.claims where claims.name=cl.name $$;
-- The ref the run gave a card, by its text.
create function tests.ref(name text,t text) returns text language sql as $$
 select c->>'ref' from jsonb_array_elements(tests.cl(name)->'inputs'->'columns') col cross join lateral jsonb_array_elements(col->'cards') c where c->>'text'=t limit 1 $$;
create function tests.apply(name text,lease integer,output jsonb) returns jsonb language sql as $$
 select public.ai_apply((tests.cl(name)->>'run')::uuid,tests.id(lease),output,'{"input_tokens":900,"output_tokens":60,"cost_usd":0.0004,"ms":700}') $$;
create function tests.fold_id(member integer) returns uuid language sql security definer set search_path='' as $$ select id from private.four_list_folds where member_id=tests.id(member) order by created_at desc limit 1 $$;
create function tests.broadcasts() returns integer language sql security definer set search_path='' as $$
 select count(*)::integer from realtime.messages where topic like 'live:'||tests.id(100)||':%' and event='room' $$;
grant all on tests.claims to authenticated,anon,service_role;
grant execute on all functions in schema tests to authenticated,anon,service_role;

insert into churches(id,name,timezone) values(tests.id(200),'Riverside Church','America/Toronto'),(tests.id(201),'Other Church','America/Toronto');
insert into engagements(id,church_id,title,settings) values(tests.id(100),tests.id(200),'Discover room','{"ai_enabled":true}'),(tests.id(101),tests.id(201),'Other room','{"ai_enabled":true}');
insert into auth.users(id,email,email_confirmed_at)
select tests.id(n),case when n in(1,2,9) then 'fac'||n||'@clearway.co' else 'person'||n||'@example.org' end,now() from generate_series(1,9)n;
insert into auth.sessions(id,user_id) select tests.id(1000+n),tests.id(n) from generate_series(1,9)n;
insert into auth.identities(user_id,provider,provider_id,identity_data) select id,'google',id::text,jsonb_build_object('email',email,'email_verified',true) from auth.users where id in(tests.id(1),tests.id(2),tests.id(9));
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method) select gen_random_uuid(),tests.id(1000+n),now(),now(),'oauth' from unnest(array[1,2,9])n;
insert into clearway_users(id,auth_user_id,name,email,is_admin,team_hub_team_member_id) values
 (tests.id(701),tests.id(1),'Chris Vacher','fac1@clearway.co',false,tests.id(801)),
 (tests.id(702),tests.id(2),'Jaisy Tam','fac2@clearway.co',false,tests.id(802)),
 (tests.id(709),tests.id(9),'Other Facilitator','fac9@clearway.co',false,tests.id(809));
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values(tests.id(100),tests.id(701),'lead'),(tests.id(100),tests.id(702),'co_facilitator'),(tests.id(101),tests.id(709),'lead');
insert into attendees(id,engagement_id,auth_user_id,name,email,verified_at,room_role) values
 (tests.id(503),tests.id(100),tests.id(3),'Priya Shah','person3@example.org',now(),'participant'),
 (tests.id(505),tests.id(100),tests.id(5),'Ben Ortiz','person5@example.org',now(),'participant'),
 (tests.id(506),tests.id(100),tests.id(6),'Ruth Ade','person6@example.org',now(),'participant'),
 (tests.id(507),tests.id(100),tests.id(7),'Sam Lee','person7@example.org',now(),'participant'),
 (tests.id(508),tests.id(100),tests.id(8),'Krista Scribe','person8@example.org',now(),'scribe');
insert into device_sessions(engagement_id,attendee_id,auth_session_id) values(tests.id(100),tests.id(503),tests.id(1003)),(tests.id(100),tests.id(505),tests.id(1005)),
 (tests.id(100),tests.id(506),tests.id(1006)),(tests.id(100),tests.id(507),tests.id(1007)),(tests.id(100),tests.id(508),tests.id(1008));
insert into private.tv_devices(id,proof,engagement_id,label,paired_at) values(tests.id(450),repeat('a',64),tests.id(100),'Front TV',now());
insert into private.live_tv_sessions(id,engagement_id,auth_user_id,auth_session_id,device_id) values(tests.id(400),tests.id(100),tests.id(4),tests.id(1004),tests.id(450));

-- ---------- The kind, its tables and who can reach them ----------
select is((select row(input,one_per_person,counts,structured,shares_answers,spotlight,named)::text from private.interaction_kinds where kind='four_lists'),'(t,f,answers,t,t,none,never)','The Four Helpful Lists is registered: several cards per person, an empty structure before anyone answers');
select ok((select array_agg(kind) from private.interaction_kinds) @> array['word_cloud','wall','content','qa','lens','candidates'],'The earlier kinds stay registered');
select ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where oid in('private.four_list_cards'::regclass,'private.four_list_folds'::regclass,'private.four_list_agrees'::regclass)),'Cards, folds and agrees force row-level security');
select ok(not has_table_privilege('authenticated','private.four_list_cards','select') and not has_table_privilege('authenticated','private.four_list_folds','select')
 and not has_table_privilege('authenticated','private.four_list_agrees','select') and not has_table_privilege('anon','private.four_list_agrees','select'),'Browsers cannot read cards, folds or agrees');
select ok(not has_function_privilege('authenticated','private.four_lists_cards_for_themes(uuid)','execute') and not has_function_privilege('anon','private.four_lists_cards_for_themes(uuid)','execute')
 and has_function_privilege('service_role','private.four_lists_cards_for_themes(uuid)','execute'),'Only the server reads the cards contract');
select ok(not has_function_privilege('authenticated','private.results_four_lists(uuid,uuid,text[])','execute') and not has_function_privilege('authenticated','private.four_lists_board(uuid,boolean)','execute')
 and not has_function_privilege('authenticated','private.ai_claim_base4(uuid,uuid,text,jsonb)','execute') and not has_function_privilege('authenticated','private.reset_practice_room_base()','execute'),'Results, the board and the renamed originals are not callable by browsers');
select ok(not (select bool_or(prosecdef) from pg_proc where oid in('public.four_lists_agree(uuid,uuid,uuid,integer,boolean,timestamptz,timestamptz,double precision)'::regprocedure,
 'public.four_lists_my_agrees(uuid,uuid)'::regprocedure,'public.four_lists_control(uuid,uuid,text,jsonb)'::regprocedure,'public.four_lists_status(uuid,uuid)'::regprocedure,'public.four_lists_review(uuid)'::regprocedure)),'The public Four Helpful Lists functions are invokers');
select is(private.part_order('Discover'),1,'Discover runs first');
select is(private.part_order('Pre-call'),2,'then the Pre-call');
select is(private.part_order('Follow-up'),5,'and the Follow-up last');
select ok(exists(select 1 from pg_constraint where conname='ai_runs_job_check' and pg_get_constraintdef(oid) like '%fold_four_lists%' and pg_get_constraintdef(oid) like '%propose_candidates%' and pg_get_constraintdef(oid) like '%fold_questions%'),'The job check keeps every earlier job and adds fold_four_lists');

-- ---------- Steps ----------
set local role authenticated;
select tests.login(1);
select is(tests.save(310,'four_lists','{}')->>'status','ok','A Four Helpful Lists step saves, in the Discover part');
select is(tests.save(311,'four_lists','{"ai":false}')->>'status','ok','with AI switched off for the step');
select is(tests.save(312,'four_lists','{"ai":"yes"}')->>'status','invalid_request','AI is a yes or no setting');
select is(tests.save(312,'four_lists','{"color":"red"}')->>'status','invalid_request','An unknown setting is refused');
select is(tests.save(313,'wall','{}','Discover')->>'status','ok','Any step can sit in Discover');
select is(tests.save(314,'wall','{}','Somewhere else')->>'status','invalid_request','An unknown part is still refused');
reset role;
select is((select options from sessions where id=tests.id(310)),'{}'::jsonb,'The setting is off the page until it is chosen');
select is((select part from sessions where id=tests.id(310)),'Discover','The step lives in Discover');
set local role authenticated;

-- ---------- Cards land live ----------
select tests.login(1);
select is(tests.ctl(900,'go_live',jsonb_build_object('session',tests.id(310)))->>'status','ok','Go live on the Four Helpful Lists');
select is(tests.results()->>'total','0','Empty: no cards yet');
select is(tests.results()->'columns','{"right":0,"wrong":0,"missing":0,"confused":0}'::jsonb,'with the four columns, each empty');
select tests.login(3);
select is(tests.card(901,310,'right','Our people care for each other')->>'status','accepted','A card is accepted');
select is(tests.card(902,310,'sideways','Our people care for each other')->>'status','invalid_answer','A column that is not one of the four is refused');
select is(public.live_submit(tests.id(100),tests.id(903),tests.id(310),0,'submit','No column here',now(),null,0)->>'status','invalid_answer','A card with no column is refused');
select is(public.live_submit(tests.id(100),tests.id(903),tests.id(310),0,'submit','Extra keys',now(),null,0,'{"column":"right","x":1}')->>'status','invalid_answer','and so is one with anything else in its value');
select is(tests.card(904,310,'wrong',repeat('a',141))->>'status','limit','Over the step''s character limit is refused');
select is(tests.card(905,310,'wrong','This is shit')->>'status','filtered','The word filter screens cards');
select is(tests.card(906,310,'wrong','')->>'status','invalid_answer','An empty card is refused');
select is(tests.card(907,310,'missing','A clear plan for young families')->>'status','accepted','The same person adds a card to another column');
select is(tests.card(908,310,'right','Welcome for newcomers')->>'status','accepted','and a second to the first');
select is(tests.results()->>'total','3','Three cards on the count');
select is(tests.results()->>'people','1','from one person');
select is(tests.g(901)->>'column','right','A card carries its column');
select is((tests.g(901)->>'agree')::integer,0,'and no agreement yet');
select is((tests.results()->'columns'->>'right')::integer,2,'The column counts follow');
select tests.login(4);
select ok(public.live_snapshot(tests.id(100))->'state'->'results'->'cards' is not null,'The TV gets the cards');
select ok(public.live_snapshot(tests.id(100))::text not like '%87600000-0000-4000-8000-00000000050%','No attendee id travels to the TV');
select is(public.live_submit(tests.id(100),tests.id(909),tests.id(310),0,'submit','From a TV',now(),null,0,'{"column":"right"}')->>'status','denied','A TV cannot send a card');

-- ---------- Folding by the same words ----------
select tests.login(5);
select is(tests.card(910,310,'right','Our people care for each other!')->>'status','accepted','Ben writes the same words');
select is(tests.g(910)->>'id',tests.id(901)::text,'and it folds beneath the first card as it arrives');
select is((tests.g(901)->>'folded')::integer,1,'one card folded');
select is((tests.g(901)->>'agree')::integer,1,'Its writer counts as one person agreeing');
select ok(not (tests.g(901) ? 'ai'),'A fold by the same words is not marked AI');
select is(tests.card(911,310,'wrong','Our people care for each other')->>'status','accepted','The same words in another column');
select is(tests.g(911)->>'id',tests.id(911)::text,'stay in their own column: nothing folds across columns');
select is(tests.results()->>'total','5','Five cards on the count, folded ones included');
reset role;
select is((select made_by from private.four_list_folds where member_id=tests.id(910)),'words','The fold records that the same words made it');
select throws_ok(format($$insert into private.four_list_folds(engagement_id,session_id,survivor_id,member_id,made_by) values(%L,%L,%L,%L,'ai')$$,tests.id(100),tests.id(310),tests.id(901),tests.id(911)),'23514',null,'The database refuses a fold across columns');
set local role authenticated;

-- ---------- Agreeing ----------
select tests.login(6);
select is(tests.agree(950,907,0,true)->>'status','accepted','Ruth agrees with a card');
select is(tests.agree(950,907,0,true)->>'status','duplicate','A resend of the same press is a duplicate');
select is(tests.agree(951,907,0,true)->>'id',tests.id(950)::text,'An agree from her other phone lands on the same one');
select is((tests.g(907)->>'agree')::integer,1,'and counts once');
select is(tests.agree(950,907,2,false)->>'status','accepted','Her next press takes it back');
select is((tests.g(907)->>'agree')::integer,0,'the count ticks down');
select is(tests.agree(950,907,3,true)->>'status','accepted','and on again');
select is(tests.agree(950,907,9,true)->>'status','conflict','A press that skips a revision is refused');
select is(tests.agree(952,999,0,true)->>'status','missing','An agree with no card is refused');
select tests.login(7);
select is(tests.agree(950,907,1,true)->>'status','conflict','Another person reusing an agree id is refused');
select is((tests.g(907)->>'agree')::integer,1,'and changes nothing');
select tests.login(6);
reset role;
insert into attendees(id,engagement_id,auth_user_id,name,email,verified_at,room_role) values(tests.id(520),tests.id(101),tests.id(9),'Other Person','person9@example.org',now(),'participant');
insert into sessions(id,engagement_id,title,interaction) values(tests.id(330),tests.id(101),'Other engagement step','four_lists');
insert into submissions(id,engagement_id,session_id,attendee_id,text,answers,phone_sent_at,value) values(tests.id(331),tests.id(101),tests.id(330),tests.id(520),'A card elsewhere','[]'::jsonb,now(),'{"column":"right"}');
set local role authenticated;
select tests.login(6);
select is(tests.agree(952,331,0,true)->>'status','missing','An agree with another engagement''s card is refused');
select tests.login(3);
select is(tests.agree(953,907,0,true)->>'status','own','You cannot agree with your own card');
select is(tests.agree(953,901,0,true)->>'status','own','nor with a card folded with yours');
select is(tests.agree(953,910,0,true)->>'status','own','by either id');
select is(tests.agree(954,911,0,true)->>'status','accepted','Priya agrees with a card in another column');
select tests.login(7);
select is(tests.agree(955,910,0,true)->>'status','accepted','Sam agrees with the card folded beneath the first');
select is((tests.g(901)->>'agree')::integer,2,'It counts for the group: Ben who wrote it and Sam who agreed');
select tests.login(8);
select is(tests.agree(956,911,0,true)->>'status','accepted','A scribe is a person in the room and can agree');
select tests.login(4);
select is(tests.agree(957,907,0,true)->>'status','denied','A TV cannot agree');
select is(public.four_lists_my_agrees(tests.id(100))->>'status','denied','nor read agrees');
select tests.login(6);
select is(public.four_lists_my_agrees(tests.id(100))->'agrees','[{"id":"87600000-0000-4000-8000-000000000950","revision":3,"agreed":true,"card_id":"87600000-0000-4000-8000-000000000907"}]'::jsonb,'A phone reads only its own agrees');
select ok(jsonb_array_length(public.four_lists_my_agrees(tests.id(100),tests.id(310))->'cards')>0,'and the cards a self-paced phone can agree with');
select is(public.four_lists_my_agrees(tests.id(100),tests.id(313))->'cards','null'::jsonb,'but only for a Four Helpful Lists step');
-- Ranking: agreement, then arrival.
select is((select string_agg(e->>'text','|' order by (e->>'rank')::integer) from jsonb_array_elements(tests.results()->'cards') e where e->>'column'='right'),'Our people care for each other|Welcome for newcomers','Cards rise in their column by agreement, then arrival');
select tests.login(7);
select is(tests.agree(958,908,0,true)->>'status','accepted','Sam agrees with the second card');
select tests.login(6);
select is(tests.agree(959,908,0,true)->>'status','accepted','and so does Ruth');
select is((select string_agg(e->>'text','|' order by (e->>'rank')::integer) from jsonb_array_elements(tests.results()->'cards') e where e->>'column'='right'),'Our people care for each other|Welcome for newcomers','Two people each: ties go to the card that arrived first');

-- Phones down: agrees wait.
select tests.login(1);
select is(tests.ctl(960,'phones_down')->>'status','ok','Phones down');
select tests.login(7);
select is(tests.agree(961,907,0,true)->>'status','closed','An agree while phones are down is refused');
select is(tests.card(962,310,'right','Late card')->>'status','closed','and so is a card');
select tests.login(1);
select is(tests.ctl(963,'open_phones')->>'status','ok','Phones open');

-- ---------- The facilitator's controls ----------
select tests.login(3);
select is(tests.fl(970,'pin',jsonb_build_object('card',tests.id(901)))->>'status','denied','A phone cannot use the controls');
select is(public.four_lists_status(tests.id(100))->>'status','denied','nor read the panel');
select is(public.four_lists_review(tests.id(100))->>'status','denied','nor the review');
select tests.login(9);
select is(tests.fl(970,'pin',jsonb_build_object('card',tests.id(901)))->>'status','denied','A facilitator of another engagement cannot use them');
select is(public.four_lists_review(tests.id(100))->>'status','denied','nor read the review');
select is(public.four_lists_status(tests.id(100))->>'status','denied','nor the panel');
select tests.login(2);
select is(tests.fl(971,'pin',jsonb_build_object('card',tests.id(907)))->>'status','ok','A co-facilitator can pin');
select is(tests.g(907)->>'pinned','true','A pinned card says so');
select is(tests.fl(971,'pin',jsonb_build_object('card',tests.id(907)))->>'status','duplicate','A repeated press is a duplicate');
select is(tests.fl(972,'pin',jsonb_build_object('card',tests.id(907)))->>'status','unchanged','Pinning a pinned card changes nothing');
select is(tests.fl(973,'unpin',jsonb_build_object('card',tests.id(907)))->>'status','ok','and unpin');
select tests.login(1);
select is(jsonb_array_length(public.four_lists_status(tests.id(100))->'cards'),4,'The panel lists every group');
select is(jsonb_array_length(public.four_lists_status(tests.id(100))->'cards'->0->'members'),1,'with the folded card under its survivor');
select is(public.four_lists_status(tests.id(100))->'cards'->0->'members'->0->>'by','words','and who folded it');
select ok(public.four_lists_status(tests.id(100))::text not like '%87600000-0000-4000-8000-00000000050%','It names no one');
select is(tests.fl(974,'undo_fold',jsonb_build_object('merge',(public.four_lists_status(tests.id(100))->'cards'->0->'members'->0->>'merge')))->>'status','ok','Undo the fold');
select is(tests.g(910)->>'id',tests.id(910)::text,'The folded card is its own card again');
select is((tests.g(901)->>'folded')::integer,0,'and the survivor holds none');
select is((tests.g(910)->>'agree')::integer,1,'with Sam''s agreement on it');
select is(tests.fl(974,'undo_fold',jsonb_build_object('merge',tests.id(1)))->>'status','duplicate','A repeated press is a duplicate');
reset role;
select is(private.four_lists_fold_words(tests.id(910)),null,'A card whose fold was undone is never refolded by words');
set local role authenticated;
select tests.login(1);
select is(tests.fl(975,'hide',jsonb_build_object('card',tests.id(908)))->>'status','ok','Hide a card');
select is(tests.results()->>'total','4','and it leaves the count');
select ok((select tests.id(908)=any(hidden_ids) from room_states where engagement_id=tests.id(100)),'The room lists it as hidden');
select is((public.four_lists_status(tests.id(100))->'counts'->>'hidden')::integer,1,'The panel still lists it, hidden');
select is(tests.fl(976,'unhide',jsonb_build_object('card',tests.id(908)))->>'status','ok','Unhide it');
select is(tests.fl(977,'hide',jsonb_build_object('card',tests.id(999)))->>'status','missing','An unknown card is refused');
select is(tests.fl(978,'launch',jsonb_build_object('card',tests.id(908)))->>'status','invalid_request','An unknown action is refused');

-- ---------- AI folds ----------
select tests.login(3);
select tests.card(920,310,'wrong','Too many meetings in 2026');
select tests.card(921,310,'wrong','Meetings take up every week');
select tests.card(922,310,'wrong','"Busy" culture, 12 meetings');
select tests.login(5);
select tests.card(923,310,'wrong','Not enough volunteers');
select tests.card(924,310,'wrong','Hard to find volunteers');
select tests.card(925,310,'wrong','Volunteer shortage 12');
select tests.card(926,310,'right','A real heart for prayer');
select tests.card(927,310,'right','People pray for one another');
reset role;
create temporary table v0 as select tests.version() as v;
set local role service_role;
select is(tests.claim('first',310,901)->>'status','claimed','The worker claims the fold');
reset role;
select is(tests.cl('first')->>'job','fold_four_lists','The job folds four lists');
select is(jsonb_array_length(tests.cl('first')->'inputs'->'columns'),2,'It sees the columns that have two cards or more');
select ok((tests.cl('first')->'inputs')::text not like '%Priya%' and (tests.cl('first')->'inputs')::text not like '%'||tests.id(503)::text||'%' and (tests.cl('first')->'inputs')::text not like '%example.org%',
 'Inputs never carry names, emails or attendee ids');
select ok(tests.cl('first')->'inputs'->'columns'->0->'cards'->0 ? 'ref' and not (tests.cl('first')->'inputs'->'columns'->0->'cards'->0 ? 'attendee_id') and not (tests.cl('first')->'inputs'->'columns'->0->'cards'->0 ? 'attendee'),'Cards go by ref, with no person on them');
select is(tests.version(),(select v from v0),'Claiming changes nothing on screen');
set local role service_role;
select is(tests.claim('busy',310,902)->>'status','busy','A second trigger while it runs is busy, so nothing runs twice');
reset role;
-- Refused: a fold across columns, an unknown ref, five to a fold, a quoted card, a dropped number.
select is((tests.apply('first',901,jsonb_build_object('groups',jsonb_build_array(
  jsonb_build_object('survivor',tests.ref('first','Too many meetings in 2026'),'members',jsonb_build_array(tests.ref('first','People pray for one another'))),
  jsonb_build_object('survivor',tests.ref('first','Not enough volunteers'),'members',jsonb_build_array('zz9')),
  jsonb_build_object('survivor',tests.ref('first','Meetings take up every week'),'members',jsonb_build_array(tests.ref('first','"Busy" culture, 12 meetings'))),
  jsonb_build_object('survivor',tests.ref('first','Not enough volunteers'),'members',jsonb_build_array(tests.ref('first','Volunteer shortage 12'))),
  jsonb_build_object('survivor',tests.ref('first','Not enough volunteers'),'members',jsonb_build_array(tests.ref('first','Hard to find volunteers'))),
  jsonb_build_object('survivor',tests.ref('first','Too many meetings in 2026'),'members',jsonb_build_array(tests.ref('first','Meetings take up every week')))
 )))->>'status'),'ok','The worker applies its folds');
select is((select string_agg(r->>'reason',',' order by ord) from private.ai_runs x cross join lateral jsonb_array_elements(x.output->'refused') with ordinality t(r,ord) where x.id=(tests.cl('first')->>'run')::uuid),'column,unknown,quote,number','Refused: across columns, an unknown ref, a quote, a dropped number');
select is((select jsonb_array_length(output->'applied') from private.ai_runs where id=(tests.cl('first')->>'run')::uuid),2,'Two folds applied');
select ok(tests.version()>(select v from v0),'The folds reach the room as new versions');
select is((tests.g(920)->>'folded')::integer,1,'The meetings fold stands');
select is(tests.g(920)->>'ai','true','and is marked AI');
select is((tests.g(923)->>'folded')::integer,1,'The volunteer cards fold beneath one survivor');
select is(tests.g(922)->>'id',tests.id(922)::text,'The quoted card is left standing');
select is(tests.g(925)->>'id',tests.id(925)::text,'The card with a number the survivor lacks is left standing');
select ok((select bool_and(made_by='ai' and detail->>'run'=(tests.cl('first')->>'run') and detail->>'prompt_version'='fold-four-lists@1') from private.four_list_folds where made_by='ai'),'Each AI fold records its run, model and prompt version');
select is((select count(*) from private.ai_runs where job='fold_four_lists' and engagement_id=tests.id(100))::integer,1,'One run is logged');
set local role service_role;
select is(tests.claim('again',310,903)->>'status','idle','With nothing new, the fold job is idle');
reset role;

-- Pin keeps AI away; a pinned card is not even shown to the model.
set local role authenticated;
select tests.login(1);
select is(tests.fl(980,'pin',jsonb_build_object('card',tests.id(926)))->>'status','ok','Pin a card');
select tests.login(6);
select tests.card(930,310,'right','Prayer matters to our people');
select tests.card(931,310,'right','Prayer is strong here');
reset role;
set local role service_role;
select is(tests.claim('second',310,904)->>'status','claimed','New cards bring a new claim');
reset role;
select ok(not exists(select 1 from jsonb_array_elements(tests.cl('second')->'inputs'->'columns') col cross join lateral jsonb_array_elements(col->'cards') c where c->>'text'='A real heart for prayer'),'The pinned card is left out of what the model sees');
select is((tests.apply('second',904,jsonb_build_object('groups',jsonb_build_array(
  jsonb_build_object('survivor',tests.ref('second','People pray for one another'),'members',jsonb_build_array(tests.ref('second','Prayer matters to our people'))))))->>'status'),'ok','The worker applies a fold of two unpinned cards');
select is((tests.g(927)->>'folded')::integer,1,'It stands');
-- Standing: at least 60 percent of the cards stay standing.
set local role authenticated;
select tests.login(1);
select is(tests.ai(985,'undo_last',jsonb_build_object('session',tests.id(310)))->>'status','ok','Undo last AI change');
select is(tests.g(927)->>'id',tests.id(927)::text,'undoes everything that run did');
select is((tests.g(920)->>'folded')::integer,1,'and leaves earlier runs alone');
select is(tests.ai(985,'undo_last',jsonb_build_object('session',tests.id(310)))->>'status','duplicate','A repeated press is a duplicate');
select is(tests.fl(986,'undo_fold',jsonb_build_object('merge',tests.fold_id(924)))->>'status','ok','Undo one AI fold');
select is(tests.g(924)->>'id',tests.id(924)::text,'and that card is its own card again');
reset role;
select ok((select count(*) from private.four_list_folds where member_id=tests.id(924) and undone_at is not null)=1,'The undone fold stays as a record');
set local role authenticated;
select is(public.ai_status(tests.id(100))->'session'->>'interaction','four_lists','The AI panel reads a Four Helpful Lists step');
select is(jsonb_array_length(public.ai_status(tests.id(100))->'folds')>=3,true,'with the AI folds and their undo');
select is((public.ai_status(tests.id(100))->'session'->>'ai')::boolean,true,'AI is on');
select is(tests.ai(987,'ai_off',jsonb_build_object('session',tests.id(310)))->>'status','ok','Turn AI off for the step');
select is(tests.results()->>'ai','false','The room knows');
select ok(not (tests.g(920) ? 'ai') and (tests.g(920)->>'folded')::integer=0,'With AI off, no AI fold shows: no AI mark and no cards beneath');
select is(tests.g(921)->>'id',tests.id(921)::text,'and the cards AI folded stand alone on the TV');
select is(tests.g(923)->>'id',tests.id(923)::text,'in every column');
select ok(not exists(select 1 from jsonb_array_elements(tests.results()->'cards') e where e ? 'ai'),'The TV has no AI mark anywhere');
select ok(not exists(select 1 from jsonb_array_elements(public.four_lists_status(tests.id(100))->'cards') e where e ? 'ai'),'nor the panel''s cards');
select tests.login(7);
select tests.card(932,310,'wrong','Too many meetings in 2026');
select is(tests.g(932)->>'id',tests.id(920)::text,'With AI off, the same words still fold');
select tests.card(933,310,'wrong','Meetings are everywhere');
select is(tests.g(933)->>'id',tests.id(933)::text,'and similar words do not');
select tests.login(1);
select is(tests.ai(988,'ai_on',jsonb_build_object('session',tests.id(310)))->>'status','ok','Turn AI back on');
select is(tests.g(921)->>'id',tests.id(920)::text,'The AI folds come back with it');
select is(tests.g(920)->>'ai','true','marked AI again');
select is(tests.ai(989,'ai_on',jsonb_build_object('session',tests.id(310)))->>'status','unchanged','Turning it on twice changes nothing');
select tests.login(3);
select is(tests.ai(990,'ai_off',jsonb_build_object('session',tests.id(310)))->>'status','denied','A phone cannot turn AI off');
reset role;
set local role service_role;
select is(public.ai_fail((tests.cl('second')->>'run')::uuid,tests.id(904),'late',null)->>'status','stale','A fail for a run that already finished is stale');
select is(tests.claim('third',310,905)->>'status','claimed','A claim after new cards');
select is(public.ai_fail((tests.cl('third')->>'run')::uuid,tests.id(905),'the model was slow',null)->>'status','ok','A failed fold is logged');
reset role;
select is((select fold_seen_at from private.ai_sessions where session_id=tests.id(310)),null,'and the work is tried again after the cool-down');
select is((select status from private.ai_runs where id=(tests.cl('third')->>'run')::uuid),'failed','The run says failed');
-- The earlier AI jobs still take their own path.
select ok(exists(select 1 from pg_proc where oid='private.ai_claim_base4(uuid,uuid,text,jsonb)'::regprocedure),'The earlier claim stands behind this one');

-- ---------- The review (SET-05) ----------
set local role authenticated;
select tests.login(2);
select is(public.four_lists_review(tests.id(100))->>'status','ok','A co-facilitator reads the review');
select is(jsonb_array_length(public.four_lists_review(tests.id(100))->'sessions'),2,'It lists every Four Helpful Lists step of the engagement');
select ok(public.four_lists_review(tests.id(100))->'sessions'->0->'cards'->0 ? 'agree' and public.four_lists_review(tests.id(100))->'sessions'->0->'cards'->0 ? 'members','Each card carries its agreement count and its fold');
select ok(public.four_lists_review(tests.id(100))::text not like '%87600000-0000-4000-8000-00000000050%' and public.four_lists_review(tests.id(100))::text not like '%example.org%','It names no one');
select tests.login(3);
select is(public.four_lists_review(tests.id(100))->>'status','denied','A participant cannot read it');

-- ---------- The cards contract for Discover themes ----------
reset role;
select is((select count(*) from private.four_lists_cards_for_themes(tests.id(100)) where session_id=tests.id(310)),(select count(*) from jsonb_array_elements(private.four_lists_board(tests.id(310),false)))::bigint,'One row per visible card not folded away');
select is((select folded_ids from private.four_lists_cards_for_themes(tests.id(100)) where card_id=tests.id(920)),array[tests.id(921),tests.id(932)]::uuid[],'with the ids of the cards folded into it');
select is((select "column" from private.four_lists_cards_for_themes(tests.id(100)) where card_id=tests.id(907)),'missing','the column');
select is((select agree from private.four_lists_cards_for_themes(tests.id(100)) where card_id=tests.id(907)),1,'and the agreement count in people');
select ok(not exists(select 1 from private.four_lists_cards_for_themes(tests.id(100)) where card_id=tests.id(921)),'A folded card is not a row of its own');
set local role authenticated;
select tests.login(5);
select is(tests.agree(1030,920,0,true)->>'status','accepted','Ben agrees with the survivor');
select is(tests.agree(1031,932,0,true)->>'status','accepted','and with the card folded beneath it: one agreer, twice');
reset role;
select is((select people from private.four_lists_cards_for_themes(tests.id(100)) where card_id=tests.id(920)),(select array_agg(x order by x) from unnest(array[tests.id(503),tests.id(505),tests.id(507)]) x),'People: two writers (Priya and Ben, one fold) and a shared agreer (Sam) give the three distinct ids');
select is((select array_agg(card_id) from private.four_lists_cards_for_themes(tests.id(101))),array[tests.id(331)],'Another engagement gets only its own cards');
select is((select count(*) from private.four_lists_cards_for_themes(tests.id(100)) where session_id=tests.id(311)),0::bigint,'A step with no cards has none');

-- ---------- Withdrawing and changing ----------
set local role authenticated;
select tests.login(3);
select is(tests.card(920,310,'wrong','Too many meetings in 2026',action=>'withdraw',revision=>1)->>'status','accepted','A person can take a card back');
select is(tests.g(921)->>'id',tests.id(921)::text,'A survivor taken back leaves its folded cards standing');
select is(tests.card(907,310,'missing','A clear plan for families of every age','change',1)->>'status','accepted','A person can change a card');
select is(tests.g(907)->>'column','missing','and it keeps its column');

-- ---------- Practice room and rehearsal ----------
select tests.login(1);
select is(tests.ctl(995,'nothing_live')->>'status','ok','Nothing live');
select is(public.rehearsal_control(tests.id(100),tests.id(996),'start')->>'status','ok','Start a rehearsal');
select is(tests.ctl(997,'go_live',jsonb_build_object('session',tests.id(310)))->>'status','ok','Back on the Four Helpful Lists');
select tests.login(7);
select is(tests.card(940,310,'missing','A test card')->>'status','accepted','A rehearsal card');
select is(tests.agree(941,907,0,true)->>'status','accepted','and a rehearsal agree on a real card');
select tests.login(8);
select is(tests.agree(942,907,0,true)->>'status','accepted','The scribe''s rehearsal agree on the same card');
select tests.login(6);
select is(tests.agree(950,907,4,false)->>'status','accepted','Ruth takes back her real agree during the rehearsal');
reset role;
select is((select test from private.four_list_agrees where id=tests.id(941)),true,'The agree is marked test');
select is((select agreed from private.four_list_agrees where id=tests.id(950)),true,'Her real agree is left as it was: the rehearsal wrote a test row beside it');
select is((select count(*) from private.four_list_agrees where card_id=tests.id(907) and attendee_id=tests.id(506) and test and not agreed and not deleted),1::bigint,'The taking back is a test row');
select ok(not exists(select 1 from private.four_lists_cards_for_themes(tests.id(100)) where card_id=tests.id(940)),'A rehearsal card is not in the cards contract');
set local role authenticated;
select tests.login(1);
select is((public.control_status(tests.id(100))->'rehearsal'->>'test_answers')::integer,4,'The rehearsal count includes the agrees it made: a test card and three test agrees');
select is(public.rehearsal_control(tests.id(100),tests.id(1002),'end')->>'status','ok','End the rehearsal');
select tests.login(8);
select is(tests.agree(942,907,1,true)->>'status','accepted','The scribe presses the agree again, for real');
select tests.login(1);
select is(tests.ctl(998,'nothing_live')->>'status','ok','Nothing live');
select is(public.rehearsal_control(tests.id(100),tests.id(999),'clear')->>'status','ok','Clear test answers');
reset role;
select ok((select deleted from private.four_list_agrees where id=tests.id(941)),'clears the agree');
select ok((select deleted from private.four_list_cards where submission_id=tests.id(940)),'and the card');
select ok(not (select deleted from private.four_list_agrees where id=tests.id(950)),'but leaves the real agree');
select is((select agreed from private.four_list_agrees where id=tests.id(950)),true,'as Ruth had it: her rehearsal taking back is gone, so it stands again');
select ok(not (select deleted or test from private.four_list_agrees where id=tests.id(942)),'An agree pressed again for real after the rehearsal is not cleared');
select is((select count(*) from private.four_list_agrees where card_id=tests.id(907) and attendee_id=tests.id(506) and not deleted),1::bigint,'Ruth has one agree on the card again');
set local role authenticated;
select tests.login(1);
select is(tests.ctl(1001,'go_live',jsonb_build_object('session',tests.id(310)))->>'status','ok','Back on the step');
select is(tests.g(940),null,'The test card is gone from the room');
select is((tests.g(907)->>'agree')::integer,2,'and its rehearsal agrees: Ruth and the scribe still count, Sam''s test agree is gone');
reset role;

-- ---------- The limits in code: four to a fold at most, 60 percent standing, and what a person separated stays apart ----------
set local role authenticated;
select tests.login(1);
select is(tests.save(315,'four_lists','{}')->>'status','ok','A step for the limits');
select is(tests.ctl(1010,'go_live',jsonb_build_object('session',tests.id(315)))->>'status','ok','Go live on it');
select tests.login(3);
select tests.card(1011,315,'confused','Roles are unclear for staff');
select tests.card(1012,315,'confused','Nobody knows who decides');
select tests.login(5);
select tests.card(1013,315,'confused','Decisions are slow to reach us');
select tests.login(6);
select tests.card(1014,315,'confused','Unsure who owns volunteers');
select tests.login(7);
select tests.card(1015,315,'confused','Confusing talk between teams');
reset role;
set local role service_role;
select is(tests.claim('limits',315,910)->>'status','claimed','A claim on five cards');
reset role;
select is((tests.apply('limits',910,jsonb_build_object('groups',jsonb_build_array(
  jsonb_build_object('survivor',tests.ref('limits','Roles are unclear for staff'),'members',jsonb_build_array(tests.ref('limits','Nobody knows who decides'),tests.ref('limits','Decisions are slow to reach us'),tests.ref('limits','Unsure who owns volunteers'),tests.ref('limits','Confusing talk between teams'))),
  jsonb_build_object('survivor',tests.ref('limits','Roles are unclear for staff'),'members',jsonb_build_array(tests.ref('limits','Nobody knows who decides'),tests.ref('limits','Decisions are slow to reach us'),tests.ref('limits','Unsure who owns volunteers'))),
  jsonb_build_object('survivor',tests.ref('limits','Roles are unclear for staff'),'members',jsonb_build_array(tests.ref('limits','Nobody knows who decides'),tests.ref('limits','Decisions are slow to reach us')))
 )))->>'status'),'ok','The worker applies what the limits allow');
select is((select string_agg(r->>'reason',',' order by ord) from private.ai_runs x cross join lateral jsonb_array_elements(x.output->'refused') with ordinality t(r,ord) where x.id=(tests.cl('limits')->>'run')::uuid),'too_many,standing','Refused: five cards to a fold, then a fold that would leave under 60 percent standing');
select is((select jsonb_array_length(output->'applied') from private.ai_runs where id=(tests.cl('limits')->>'run')::uuid),1,'One fold applied: three cards, two of five folded, 60 percent still standing');
select is((select count(*) from private.four_list_folds where session_id=tests.id(315) and made_by='ai')::integer,2,'Two cards folded beneath the survivor');
set local role authenticated;
select tests.login(1);
select is(tests.fl(1016,'undo_fold',jsonb_build_object('merge',tests.fold_id(1012)))->>'status','ok','The facilitator undoes one of the folds');
select is(tests.fl(1019,'undo_fold',jsonb_build_object('merge',tests.fold_id(1013)))->>'status','ok','and the other');
select tests.login(3);
select tests.card(1017,315,'confused','Who leads our small groups?');
reset role;
set local role service_role;
select is(tests.claim('limits2',315,911)->>'status','claimed','A later claim');
reset role;
select is((tests.apply('limits2',911,jsonb_build_object('groups',jsonb_build_array(
  jsonb_build_object('survivor',tests.ref('limits2','Roles are unclear for staff'),'members',jsonb_build_array(tests.ref('limits2','Nobody knows who decides'))),
  jsonb_build_object('survivor',tests.ref('limits2','Nobody knows who decides'),'members',jsonb_build_array(tests.ref('limits2','Roles are unclear for staff')))
 )))->>'status'),'ok','The worker tries to fold them again, in both directions');
select is((select string_agg(r->>'reason',',' order by ord) from private.ai_runs x cross join lateral jsonb_array_elements(x.output->'refused') with ordinality t(r,ord) where x.id=(tests.cl('limits2')->>'run')::uuid),'kept_apart,kept_apart','Both are refused: the undo sticks whichever card is the survivor');
set local role authenticated;
select tests.login(1);
select is(tests.ctl(1018,'nothing_live')->>'status','ok','Nothing live');
reset role;
insert into sessions(id,engagement_id,title,interaction,mode,state,opens_at,closes_at) values(tests.id(316),tests.id(100),'Self-paced lists','four_lists','self_paced','ready',now()-interval '1 hour',now()+interval '1 hour');
select ok(private.ai_due(tests.id(100)) ? tests.id(316)::text,'AI looks at an open self-paced Four Helpful Lists step');
select ok(not (private.ai_due(tests.id(100)) ? tests.id(311)::text),'but not a step that is not open');
set local role service_role;
select is(tests.claim('selfpaced',316,912)->>'status','idle','and a claim on it is not refused as off');
reset role;

-- ---------- Discover in the shipped templates ----------
select ok((select bool_and(exists(select 1 from jsonb_array_elements(sessions) e where e->>'part'='Discover' and e->>'interaction'='four_lists' and e->>'mode'='live')) from private.templates where id in('c1ea0000-0000-4000-8000-000000000002','c1ea0000-0000-4000-8000-000000000003')),'Both Wayfinding templates open with one live Four Helpful Lists step');
select is((select count(*) from private.templates t cross join lateral jsonb_array_elements(t.sessions) e where t.id='c1ea0000-0000-4000-8000-000000000002' and e->>'part'='Discover'),1::bigint,'one, not more');
select is((select count(*) from private.templates t cross join lateral jsonb_array_elements(t.sessions) e where t.id='c1ea0000-0000-4000-8000-000000000002' and e->>'part'='Pre-call'),11::bigint,'The Pre-call keeps its eleven steps');

-- ---------- Existing behaviour holds ----------
select ok(pg_get_functiondef('private.show_write(uuid,text,jsonb)'::regprocedure) like '%''Discover'',''Pre-call'',''Day 1'',''Day 2'',''Follow-up''%','The run of show accepts the Discover part');
select ok(pg_get_functiondef('private.template_write(text,jsonb)'::regprocedure) like '%''Discover'',''Pre-call'',''Day 1'',''Day 2'',''Follow-up''%','Templates start steps in the Discover part');
select ok(pg_get_functiondef('private.template_write(text,jsonb)'::regprocedure) like '%mode=''live'' and part=''Pre-call''%','A saved template starts at its Pre-call, so Discover saves as days before it');
select ok(pg_get_functiondef('private.room_control(uuid,uuid,text,jsonb)'::regprocedure) like '%''Discover'',''Pre-call'',''Day 1'',''Day 2'',''Follow-up''%','Close part accepts the Discover part');
select ok(tests.broadcasts()>0,'Every change is broadcast');
set local role anon;
select throws_ok($$select public.four_lists_status('87600000-0000-4000-8000-000000000100'::uuid)$$,'42501',null,'Anonymous callers cannot read the panel');
select throws_ok($$select public.four_lists_review('87600000-0000-4000-8000-000000000100'::uuid)$$,'42501',null,'nor the review');
select throws_ok($$select public.four_lists_agree('87600000-0000-4000-8000-000000000100'::uuid,'87600000-0000-4000-8000-000000000001'::uuid,'87600000-0000-4000-8000-000000000001'::uuid,0,true,now())$$,'42501',null,'nor agree');
reset role;
select * from finish();
rollback;
