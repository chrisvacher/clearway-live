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

-- ===== Milestone 6 practice-room fixes A =====
-- Finding 1: the AI folded unrelated cards. Finding 2: a folded card showed an agree nobody gave.
select ok(not has_function_privilege('authenticated','private.four_lists_share_word(text,text)','execute') and not has_function_privilege('anon','private.four_lists_stems(text)','execute')
 and has_function_privilege('service_role','private.four_lists_share_word(text,text)','execute'),'The word check is for the server only');

-- ---------- The word check ----------
select is(private.four_lists_share_word('Giving is strong and generous','Preaching is strong and clear'),false,'Giving and preaching share only "strong": refused');
select is(private.four_lists_share_word('Generous giving is a real strength','Preaching is strong and clear'),false,'"real" and "strength" are generic too: refused');
select is(private.four_lists_share_word('Our giving is generous','Preaching is strong and clear'),false,'"our" and "is" count for nothing: refused');
select is(private.four_lists_share_word('Roles of staff are confusing','Elder and staff roles are unclear'),true,'Roles of staff and elder and staff roles share "staff" and "roles": allowed');
select is(private.four_lists_share_word('Giving is strong and generous','Our giving is generous'),true,'Cards about the same subject share it');
select is(private.four_lists_share_word('We love giving','Gives are generous'),true,'-ing and a plural -s fold: giving and gives meet');
select is(private.four_lists_share_word('Volunteers are tired','A volunteer burned out'),true,'a plural folds');
select is(private.four_lists_share_word('Too many meetings in 2026','Meeting every week'),true,'meetings and meeting meet');
select is(private.four_lists_share_word('Kids ministries need help','Our kids ministry is growing'),true,'-ies folds to -y');
select is(private.four_lists_share_word('It is good','Very good'),false,'Cards with only generic words share nothing');
select is(private.four_lists_share_word('Parking is full','Giving is generous'),false,'Unrelated cards share nothing');
select is(private.four_lists_share_word('The church is really good','Our people are great'),false,'"church", "people" and the praise words are all dropped');
select is(private.four_lists_share_word(null,'Giving is generous'),false,'No text, no match');

-- ---------- The room: Riverside ----------
set local role authenticated;
select tests.login(1);
select is(tests.save(310,'four_lists','{}')->>'status','ok','A Four Helpful Lists step saves');
select is(tests.ctl(900,'go_live',jsonb_build_object('session',tests.id(310)))->>'status','ok','Go live');
select tests.login(3);
select tests.card(901,310,'right','Preaching is strong and clear');
select tests.card(902,310,'wrong','Elder and staff roles are unclear');
select tests.login(5);
select tests.card(903,310,'right','Giving is strong and generous');
select tests.card(904,310,'wrong','Roles of staff are confusing');
select tests.login(6);
select tests.card(905,310,'right','Generous giving is a real strength');
select tests.card(906,310,'missing','A plan to train new volunteers');
select tests.card(907,310,'missing','Parking near the doors');
select tests.login(7);
select tests.card(908,310,'right','Our giving is generous');
select tests.card(909,310,'missing','Somewhere quiet for prayer');
select tests.card(910,310,'missing','A way to meet other newcomers');

-- ---------- Finding 2, before any fold: agrees are people who pressed Agree ----------
select tests.login(6);
select is(tests.agree(950,902,0,true)->>'status','accepted','Ruth agrees with "Elder and staff roles are unclear"');
select is((tests.g(902)->>'agree')::integer,1,'It shows one agree');
select is((tests.g(904)->>'agree')::integer,0,'and "Roles of staff are confusing" shows none');
select tests.login(1);
select is(tests.agree(951,902,0,true)->>'status','denied','A facilitator is not in the room and cannot agree');

-- ---------- Finding 1: the AI tries the bad fold and is refused ----------
reset role;
set local role service_role;
select is(tests.claim('first',310,801)->>'status','claimed','The worker claims the fold');
reset role;
-- The reply the practice room's model gave: the three giving cards under the preaching card, because of "strong". Beside it
-- two good folds: the giving cards with each other, and the roles cards.
select is((tests.apply('first',801,jsonb_build_object('groups',jsonb_build_array(
  jsonb_build_object('survivor',tests.ref('first','Preaching is strong and clear'),'members',jsonb_build_array(tests.ref('first','Giving is strong and generous'),tests.ref('first','Generous giving is a real strength'),tests.ref('first','Our giving is generous'))),
  jsonb_build_object('survivor',tests.ref('first','Giving is strong and generous'),'members',jsonb_build_array(tests.ref('first','Generous giving is a real strength'),tests.ref('first','Our giving is generous'))),
  jsonb_build_object('survivor',tests.ref('first','Elder and staff roles are unclear'),'members',jsonb_build_array(tests.ref('first','Roles of staff are confusing')))
 )))->>'status'),'ok','The worker applies its reply');
select is((select string_agg(r->>'reason',',' order by ord) from private.ai_runs x cross join lateral jsonb_array_elements(x.output->'refused') with ordinality t(r,ord) where x.id=(tests.cl('first')->>'run')::uuid),'unrelated','The fold under "Preaching is strong and clear" is refused as unrelated');
select is((select jsonb_array_length(output->'applied') from private.ai_runs where id=(tests.cl('first')->>'run')::uuid),2,'and the two good folds stand');
select is((tests.g(901)->>'folded')::integer,0,'Nothing folded under the preaching card');
select is(tests.g(903)->>'id',tests.id(903)::text,'The giving card is still its own card in What''s right');
select is((tests.g(903)->>'folded')::integer,2,'with the other two giving cards beneath it');
select is(tests.g(904)->>'id',tests.id(902)::text,'"Roles of staff are confusing" folds beneath "Elder and staff roles are unclear"');

-- ---------- Finding 2, after the fold ----------
select is((tests.g(902)->>'folded')::integer,1,'One card folded beneath the survivor');
select is((tests.g(902)->>'agree')::integer,1,'The survivor shows only Ruth''s agree, not the folded card''s writer');
select is((tests.g(903)->>'agree')::integer,0,'The giving fold shows no agrees: its writers are not agreers');
set local role authenticated;
select tests.login(7);
select is(tests.agree(952,904,0,true)->>'status','accepted','Sam agrees with the folded card, by its own id');
select is((tests.g(902)->>'agree')::integer,2,'The survivor now shows two: Ruth and Sam');
select tests.login(6);
select is(tests.agree(953,904,0,true)->>'status','accepted','Ruth agrees with the folded card too');
select is((tests.g(902)->>'agree')::integer,2,'She still counts once');
select tests.login(5);
select is(tests.agree(954,904,0,true)->>'status','own','The writer of the folded card cannot agree with it');
select is(tests.agree(955,902,0,true)->>'status','own','nor with the card it folded beneath');
select is((tests.g(902)->>'agree')::integer,2,'The count has not moved');
select tests.login(1);
select is((select (e->>'agree')::integer from jsonb_array_elements(public.four_lists_status(tests.id(100))->'cards') e where e->>'id'=tests.id(902)::text),2,'The control surface shows the same two');
select is((select (e->>'agree')::integer from jsonb_array_elements(public.four_lists_review(tests.id(100))->'sessions'->0->'cards') e where e->>'id'=tests.id(902)::text),2,'and SET-05, which the CSV reads, the same two');
select tests.login(7);
select is((select (e->>'agree')::integer from jsonb_array_elements(public.four_lists_my_agrees(tests.id(100),tests.id(310))->'cards') e where e->>'id'=tests.id(902)::text),2,'and the phone the same two');
reset role;
select is((select agree from private.four_lists_cards_for_themes(tests.id(100)) where card_id=tests.id(902)),2,'and the cards the themes read');
select is((select count(*) from unnest((select people from private.four_lists_cards_for_themes(tests.id(100)) where card_id=tests.id(902))))::integer,4,'whose people are still every writer and agreer (themes count people who stand behind a card)');
-- Undo: each card gets its own agreers back, and the survivor never loses an agree it was given.
set local role authenticated;
select tests.login(1);
select is(tests.fl(960,'undo_fold',jsonb_build_object('merge',tests.fold_id(904)))->>'status','ok','Undo the fold');
select is((tests.g(902)->>'agree')::integer,1,'The survivor keeps Ruth''s agree');
select is((tests.g(904)->>'agree')::integer,2,'and the card has the two agrees it was given');
select is((tests.g(902)->>'folded')::integer,0,'Nothing is folded any more');
reset role;
select is((select count(*) from private.four_list_agrees where card_id=tests.id(902) and agreed and not deleted)::integer,1,'One agree row on the survivor, as pressed');
select * from finish();
rollback;
