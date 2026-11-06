-- Milestone 6, step 1: the Four Helpful Lists (INT-11, SET-05).
-- Live only, after merge and Chris's approval. No session is started and nothing is seeded except the
-- "Board discovery session" template (the shipped templates are seeded by migration).
--
-- One kind, `four_lists`, registered in private.interaction_kinds with its own parse_, results_, options_
-- and items_ functions. A card is an ordinary answer (public.submissions): the text is the card and
-- value.column says which of the four lists it belongs to (right, wrong, missing, confused). Phones add
-- several cards (the session's max_sends, 12 by default), so the engine's outbox, ids, hide, withdraw,
-- test marking, CSV and recap all apply unchanged.
--
-- Agreements are their own table, private.four_list_agreements: one row per person per card, set on or off
-- (so a resend never toggles twice), never the card's own author, and never read by a participant
-- directly. The TV's results carry the counts and no names. AI is never in the path from phone to TV:
-- the card and each agreement are stored and broadcast first; groups arrive later as their own event.
--
-- AI grouping (job group_four_lists) reuses the wall's tables (private.ai_groups, private.ai_group_members)
-- so Undo, Redo, Pin, Rename, Undo last AI change and AI off all work as on the wall. The claim and apply
-- are wrappers that handle a four_lists session and pass every other kind to the function that was there.
-- The merge limits are code: never more than four answers into a group in one step, a group is never
-- across two columns, at least two answers to make a group, twelve groups at most, pinned groups untouched,
-- renamed labels kept, labels through the word filter, answers that were taken out are not offered again.
--
-- The review after the session (SET-05): private.four_list_review holds, per card, the facilitator's edited
-- words, keep or set aside, a merge into another card of the same column, and the two marks step 4 reads:
-- feeds What We Heard, feeds Strategic Tensions (only from What's wrong? and What's confused?).
-- private.four_lists_marks(engagement) is the read step 4 uses.
--
-- Shared objects redefined (each a superset of the latest definition on main):
--   private.ai_runs ai_runs_job_check   keeps every job and adds group_four_lists
--   private.ai_on                        keeps every branch and adds four_lists
--   private.reset_practice_room          keeps every table it clears and adds the two new tables
--   private.rehearsal_control            keeps everything it clears and counts, and clears test agreements (counted with votes)
--   private.ai_claim, ai_apply, ai_fail, ai_status, ai_control   wrappers: the functions that were there are renamed
--                                        ai_claim_base5, ai_apply_base5, ai_fail_base4, ai_status_base1, ai_control_base1
begin;

insert into private.interaction_kinds(kind,label,input,one_per_person,counts,structured,shares_answers,spotlight,named,position) values
 ('four_lists','Four Helpful Lists',true,false,'answers',false,true,'id','never',26);

alter table private.ai_runs drop constraint ai_runs_job_check;
alter table private.ai_runs add constraint ai_runs_job_check check(job in ('combine_words','group_wall','summarize_wall','fold_questions','merge_reasons','group_lens','overnight_draft','draft_lens_summary','fold_lens_summary','propose_candidates','group_four_lists'));

-- ---------- Tables ----------
create table private.four_list_agreements (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 session_id uuid not null,
 submission_id uuid not null references public.submissions(id),
 attendee_id uuid not null,
 agreed boolean not null default true,
 test boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 foreign key(session_id,engagement_id) references public.sessions(id,engagement_id),
 foreign key(attendee_id,engagement_id) references public.attendees(id,engagement_id)
);
create unique index four_list_agreements_person_idx on private.four_list_agreements(submission_id,attendee_id) where not deleted;
create index four_list_agreements_session_idx on private.four_list_agreements(session_id,engagement_id);
create index four_list_agreements_attendee_idx on private.four_list_agreements(attendee_id,engagement_id);
create index four_list_agreements_engagement_idx on private.four_list_agreements(engagement_id);

create table private.four_list_review (
 submission_id uuid primary key references public.submissions(id),
 engagement_id uuid not null references public.engagements(id),
 session_id uuid not null,
 edited_text text check(edited_text is null or length(btrim(edited_text)) between 1 and 200),
 kept boolean not null default true,
 merged_into uuid references public.submissions(id),
 feeds_heard boolean not null default false,
 feeds_tensions boolean not null default false,
 reviewed_by uuid,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 foreign key(session_id,engagement_id) references public.sessions(id,engagement_id),
 check(merged_into is null or merged_into<>submission_id),
 check(kept or (not feeds_heard and not feeds_tensions)),
 check(merged_into is null or (not feeds_heard and not feeds_tensions))
);
create index four_list_review_session_idx on private.four_list_review(session_id,engagement_id);
create index four_list_review_engagement_idx on private.four_list_review(engagement_id);
create index four_list_review_merged_idx on private.four_list_review(merged_into);

alter table private.four_list_agreements enable row level security;
alter table private.four_list_agreements force row level security;
revoke all on private.four_list_agreements from public,anon,authenticated;
grant select,insert,update,delete on private.four_list_agreements to service_role;
create trigger touch_record before update on private.four_list_agreements for each row execute function private.touch_live_record('id');
create trigger mark_test before insert on private.four_list_agreements for each row execute function private.mark_test();
alter table private.four_list_review enable row level security;
alter table private.four_list_review force row level security;
revoke all on private.four_list_review from public,anon,authenticated;
grant select,insert,update,delete on private.four_list_review to service_role;
create trigger touch_record before update on private.four_list_review for each row execute function private.touch_live_record('submission_id');

comment on table private.four_list_agreements is 'One person agreeing with one Four Helpful Lists card. Anonymous in every reader; participants never read it directly.';
comment on table private.four_list_review is 'The facilitator''s review of a Four Helpful Lists card after the session: edited words, kept or set aside, merged, and the marks step 4 (What We Heard) reads.';

-- ---------- Switches ----------
create or replace function private.ai_on(p_session uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select coalesce(e.settings->>'ai_enabled','false')='true'
   and (s.interaction in ('word_cloud','wall','qa','candidates','lens_summary','four_lists') or (s.interaction='grid' and s.options->>'preset'='pre_mortem') or (s.interaction='lens' and coalesce(s.options->>'seed','false')<>'true'))
   and coalesce(a.ai,case when jsonb_typeof(s.options->'ai')='boolean' then (s.options->>'ai')::boolean end,true)
  from public.sessions s join public.engagements e on e.id=s.engagement_id and not e.deleted
  left join private.ai_sessions a on a.session_id=s.id and not a.deleted
  where s.id=p_session and not s.deleted),false)
$$;

-- ---------- Options ----------
create function private.options_four_lists(p jsonb,p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select case when jsonb_typeof(p)='object' and not exists(select 1 from jsonb_object_keys(p) k where k<>'ai') and coalesce(jsonb_typeof(p->'ai'),'boolean')='boolean'
  then jsonb_strip_nulls(jsonb_build_object('ai',case when p ? 'ai' then (p->>'ai')::boolean end)) end
$$;

-- ---------- Parsing a card ----------
-- The wall's rules (length, word filter), plus the list: value.column names one of the four. A card is
-- at most 200 characters whatever the session's limit says.
create function private.parse_four_lists(p_session public.sessions,p_text text,p_value jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare parsed jsonb;
begin
 if jsonb_typeof(p_value) is distinct from 'object' or p_value->>'column' is null or p_value->>'column' not in ('right','wrong','missing','confused')
  or exists(select 1 from jsonb_object_keys(p_value) k where k<>'column') then return jsonb_build_object('status','invalid_answer'); end if;
 if p_text is null or length(btrim(p_text))=0 then return jsonb_build_object('status','invalid_answer'); end if;
 if length(btrim(p_text))>200 then return jsonb_build_object('status','limit'); end if;
 parsed:=private.parse_text_answers(p_session,p_text,false);
 if parsed->>'status'<>'ok' then return parsed; end if;
 return parsed||jsonb_build_object('value',jsonb_build_object('column',p_value->>'column'));
end $$;

-- ---------- Reading the cards ----------
-- A session's standing cards: not removed, withdrawn or hidden from the TV, in one of the four lists.
create function private.fl_cards(p_session uuid) returns table(id uuid,col text,text text,received timestamptz,attendee_id uuid)
language sql stable security definer set search_path='' as $$
 select x.id,x.value->>'column',x.text,coalesce(x.server_received_at,x.created_at),x.attendee_id
 from public.submissions x join public.sessions s on s.id=x.session_id and s.interaction='four_lists' and not s.deleted
 where x.session_id=p_session and not x.deleted and not x.withdrawn and not x.hidden and x.value->>'column' in ('right','wrong','missing','confused')
$$;

-- What the TV draws. Each unit is one card, or the cards AI grouped (two or more standing members, in one
-- column). A group's unit takes the id of its survivor, the member with the most agreement (then the
-- oldest), so that card's element stays in place and the others glide into it. agree is the number of
-- different people who agreed with any member. Per column the TV gets the first 8 units by agreement, with
-- the column's counts for "+ n more on phones". No name and no author id is in the results.
create function private.results_four_lists(p_engagement uuid,p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$
 with s as (select * from public.sessions where id=p_session and engagement_id=p_engagement and not deleted and interaction='four_lists'),
 o as (select private.ai_on(p_session) as ai),
 c as (select f.*,(select count(*) from private.four_list_agreements a where a.submission_id=f.id and a.agreed and not a.deleted)::integer as n from private.fl_cards(p_session) f),
 gm as (
  select g.id as gid,g.label,g.pinned,c.* from private.ai_groups g
  join private.ai_group_members x on x.group_id=g.id and x.removed_at is null and not x.deleted
  join c on c.id=x.submission_id
  where g.session_id=p_session and g.undone_at is null and not g.deleted and (select ai from o)
 ),
 valid as (select gid from gm group by gid having count(*)>=2 and count(distinct col)=1),
 grouped as (
  select (array_agg(m.id order by m.n desc,m.received,m.id))[1] as id,min(m.col) as col,max(m.label) as label,bool_or(m.pinned) as pinned,count(*)::integer as held,
   (select count(distinct a.attendee_id) from private.four_list_agreements a where a.submission_id=any(array_agg(m.id)) and a.agreed and not a.deleted)::integer as agree,
   (array_agg(m.id order by m.n desc,m.received,m.id))[1:12] as ids,min(m.received) as received
  from gm m where m.gid in (select gid from valid) group by m.gid
 ),
 units as (
  select c.id,c.col,c.text,c.n as agree,1 as held,false as ai,false as pinned,array[c.id] as ids,c.received from c where c.id not in (select m.id from gm m where m.gid in (select gid from valid))
  union all
  select g.id,g.col,g.label,g.agree,g.held,true,g.pinned,g.ids,g.received from grouped g
 ),
 ranked as (select u.*,row_number() over(order by u.received,u.id)::integer as ord,row_number() over(partition by u.col order by u.agree desc,u.received,u.id)::integer as place from units u)
 select jsonb_build_object('total',(select count(*) from c),'people',(select count(distinct attendee_id) from c),'words','[]'::jsonb,'ai',exists(select 1 from ranked where ai),
  'columns',(select jsonb_object_agg(k.col,jsonb_build_object('cards',(select count(*) from c where c.col=k.col),'units',(select count(*) from ranked r where r.col=k.col)))
    from (values ('right'),('wrong'),('missing'),('confused')) k(col)),
  'cards',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'col',r.col,'text',r.text,'agree',r.agree,'held',r.held,'ai',r.ai,'pinned',r.pinned,'ids',to_jsonb(r.ids),'order',r.ord)
    order by r.col,r.place) from ranked r where r.place<=8),'[]'::jsonb))
$$;

-- The control surface's items: every standing card, newest first, hidden ones last, with the agreement count.
create function private.items_four_lists(p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('key',w.id,'text',w.text,'count',w.n,'hidden',w.hidden,'column',w.col) order by w.hidden,w.at desc,w.id),'[]'::jsonb)
 from (select x.id,x.text,x.hidden,x.value->>'column' as col,x.server_received_at as at,
   (select count(*) from private.four_list_agreements a where a.submission_id=x.id and a.agreed and not a.deleted)::integer as n
  from public.submissions x join public.sessions s on s.id=x.session_id and s.interaction='four_lists'
  where x.session_id=p_session and not x.deleted and not x.withdrawn order by x.server_received_at desc,x.id limit 500) w
$$;

-- ---------- Agreeing (a phone) ----------
-- Set on or off, so a resend never toggles twice. Not your own card; only while the session takes input:
-- live and not phones down, a late-answers session that is open, or a self-paced session that is open.
create function private.four_lists_agree(p_engagement uuid,p_card uuid,p_on boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; s public.sessions; q public.submissions; who uuid; received timestamptz:=clock_timestamp(); accepting boolean; n integer;
begin
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if private.live_role(p_engagement) is distinct from 'participant' then return jsonb_build_object('status','denied'); end if;
 select id into who from public.attendees where engagement_id=p_engagement and id in(select private.room_attendee_ids());
 if who is null or r.engagement_id is null then return jsonb_build_object('status','denied'); end if;
 if p_card is null or p_on is null then return jsonb_build_object('status','invalid_request'); end if;
 select x.* into q from public.submissions x join public.sessions y on y.id=x.session_id and y.interaction='four_lists' and not y.deleted
  where x.id=p_card and x.engagement_id=p_engagement and not x.deleted;
 if q.id is null or q.withdrawn or q.hidden then return jsonb_build_object('status','missing'); end if;
 select * into s from public.sessions where id=q.session_id;
 accepting:=case when s.mode='self_paced' then private.session_state(s,received)='open'
  when r.live_session_id=s.id then s.state='live' and not r.phones_down and (r.burst_ends_at is null or r.burst_ends_at>received)
  else s.state='open' and s.mode='live' end;
 if not accepting then return jsonb_build_object('status','closed'); end if;
 if q.attendee_id=who then return jsonb_build_object('status','own'); end if;
 insert into private.four_list_agreements(engagement_id,session_id,submission_id,attendee_id,agreed) values(p_engagement,s.id,q.id,who,p_on)
  on conflict(submission_id,attendee_id) where not deleted do update set agreed=excluded.agreed,updated_at=received;
 if r.live_session_id=s.id then update public.room_states set results=private.live_results(p_engagement) where engagement_id=p_engagement returning * into r; end if;
 select count(*) into n from private.four_list_agreements where submission_id=q.id and agreed and not deleted;
 return jsonb_build_object('status','accepted','agreed',p_on,'card',q.id,'count',n,'version',r.version);
end $$;

-- A phone's read of the session's cards: everyone's cards (they are on the TV), the count on each, and
-- which ones this person agreed with or wrote. No name and no author id.
create function private.four_lists_read(p_engagement uuid,p_session uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare who uuid; s public.sessions; at_now timestamptz:=clock_timestamp();
begin
 if private.live_role(p_engagement) is distinct from 'participant' then return jsonb_build_object('status','denied'); end if;
 select id into who from public.attendees where engagement_id=p_engagement and id in(select private.room_attendee_ids());
 if who is null then return jsonb_build_object('status','denied'); end if;
 select * into s from public.sessions where id=p_session and engagement_id=p_engagement and interaction='four_lists' and not deleted;
 if s.id is null or s.state='draft' then return jsonb_build_object('status','missing'); end if;
 if not (s.shown_at is not null or s.state in ('live','phones_down','open','closed') or (s.mode='self_paced' and private.session_state(s,at_now) in ('open','closed'))) then return jsonb_build_object('status','missing'); end if;
 return jsonb_build_object('status','ok','server_time',at_now,'session',s.id,
  'cards',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'col',w.col,'text',w.text,'agree',w.n,'mine',w.mine,'own',w.own) order by w.col,w.n desc,w.received,w.id)
   from (select f.id,f.col,f.text,f.received,f.attendee_id=who as own,
     (select count(*) from private.four_list_agreements a where a.submission_id=f.id and a.agreed and not a.deleted)::integer as n,
     exists(select 1 from private.four_list_agreements a where a.submission_id=f.id and a.attendee_id=who and a.agreed and not a.deleted) as mine
    from private.fl_cards(s.id) f order by f.received desc limit 600) w),'[]'::jsonb));
end $$;

-- ---------- The review after the session (SET-05) ----------
-- Facilitators only. Every card the session kept, with the agreement counts (a merged card holds the people who
-- agreed with any of its cards), what the facilitator did to it, and the two marks.
create function private.four_lists_review_read(p_engagement uuid,p_session uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s public.sessions;
begin
 if not coalesce(private.wf_facilitates(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 select * into s from public.sessions where id=p_session and engagement_id=p_engagement and interaction='four_lists' and not deleted;
 if s.id is null then return jsonb_build_object('status','missing'); end if;
 return jsonb_build_object('status','ok','session',s.id,'title',s.title,'ai',private.ai_on(s.id),
  'took_part',(select count(distinct p) from (select x.attendee_id p from public.submissions x where x.session_id=s.id and not x.deleted and not x.withdrawn and x.value ? 'column'
    union select a.attendee_id from private.four_list_agreements a where a.session_id=s.id and not a.deleted and a.agreed) z),
  'cards',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'col',w.col,'text',coalesce(w.edited_text,w.text),'original',w.text,'edited',w.edited_text is not null,'hidden',w.hidden,
     'kept',w.kept,'merged_into',w.merged_into,'agree',w.agree,'heard',w.feeds_heard,'tensions',w.feeds_tensions,'members',w.members,'at',w.at)
     order by w.col,w.merged_into is not null,w.agree desc,w.at,w.id)
   from (select x.id,x.value->>'column' as col,x.text,x.hidden,x.server_received_at as at,v.edited_text,coalesce(v.kept,true) as kept,v.merged_into,
     coalesce(v.feeds_heard,false) as feeds_heard,coalesce(v.feeds_tensions,false) as feeds_tensions,
     (select count(distinct a.attendee_id) from private.four_list_agreements a where a.agreed and not a.deleted
       and (a.submission_id=x.id or a.submission_id in(select m.submission_id from private.four_list_review m where m.merged_into=x.id and not m.deleted))) as agree,
     (select count(*) from private.four_list_review m where m.merged_into=x.id and not m.deleted) as members
    from public.submissions x left join private.four_list_review v on v.submission_id=x.id and not v.deleted
    where x.session_id=s.id and not x.deleted and not x.withdrawn and x.value->>'column' in ('right','wrong','missing','confused') order by x.server_received_at,x.id limit 1000) w),'[]'::jsonb));
end $$;

-- One review press. Setting a state, so a repeat changes nothing. Actions: edit {card,text}, keep {card,kept},
-- merge {cards:[survivor,member...]}, unmerge {card}, mark {card,heard,tensions}.
create function private.four_lists_review(p_engagement uuid,p_session uuid,p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.sessions; me uuid:=private.clearway_user_id(); c public.submissions; v private.four_list_review; ids uuid[]; first public.submissions; x uuid; txt text;
 v_heard boolean; v_tensions boolean;
begin
 if not coalesce(private.wf_facilitates(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 if p_action is null or p_action not in ('edit','keep','merge','unmerge','mark') or jsonb_typeof(p) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 select * into s from public.sessions where id=p_session and engagement_id=p_engagement and interaction='four_lists' and not deleted;
 if s.id is null then return jsonb_build_object('status','missing'); end if;
 if p_action='merge' then
  if jsonb_typeof(p->'cards') is distinct from 'array' or jsonb_array_length(p->'cards') not between 2 and 20 then return jsonb_build_object('status','invalid_request'); end if;
  ids:=array(select e::uuid from jsonb_array_elements_text(p->'cards') e);
  if (select count(distinct i) from unnest(ids) i)<>cardinality(ids) then return jsonb_build_object('status','invalid_request'); end if;
  select * into first from public.submissions where id=ids[1] and session_id=s.id and not deleted and not withdrawn;
  if first.id is null then return jsonb_build_object('status','missing'); end if;
  if exists(select 1 from private.four_list_review m where m.submission_id=first.id and m.merged_into is not null and not m.deleted) then return jsonb_build_object('status','invalid_state'); end if;
  if exists(select 1 from unnest(ids) i where not exists(select 1 from public.submissions y where y.id=i and y.session_id=s.id and not y.deleted and not y.withdrawn and y.value->>'column'=first.value->>'column')) then
   return jsonb_build_object('status','invalid_state'); end if;
  insert into private.four_list_review(submission_id,engagement_id,session_id,reviewed_by) values(first.id,p_engagement,s.id,me) on conflict(submission_id) do update set deleted=false;
  foreach x in array ids[2:] loop
   -- A card that already holds others passes them on to the survivor.
   update private.four_list_review set merged_into=first.id,reviewed_by=me,deleted=false where merged_into=x and not deleted;
   insert into private.four_list_review(submission_id,engagement_id,session_id,merged_into,feeds_heard,feeds_tensions,reviewed_by) values(x,p_engagement,s.id,first.id,false,false,me)
    on conflict(submission_id) do update set merged_into=first.id,feeds_heard=false,feeds_tensions=false,reviewed_by=me,deleted=false;
  end loop;
  return jsonb_build_object('status','ok');
 end if;
 if not (p->>'card' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then return jsonb_build_object('status','invalid_request'); end if;
 select * into c from public.submissions where id=(p->>'card')::uuid and session_id=s.id and not deleted and not withdrawn;
 if c.id is null then return jsonb_build_object('status','missing'); end if;
 insert into private.four_list_review(submission_id,engagement_id,session_id,reviewed_by) values(c.id,p_engagement,s.id,me) on conflict(submission_id) do update set deleted=false;
 select * into v from private.four_list_review where submission_id=c.id;
 if p_action='edit' then
  txt:=btrim(regexp_replace(coalesce(p->>'text',''),'\s+',' ','g'));
  if length(txt)=0 or length(txt)>200 then return jsonb_build_object('status','invalid_request'); end if;
  if private.screen_text(txt) then return jsonb_build_object('status','filtered'); end if;
  update private.four_list_review set edited_text=case when txt=c.text then null else txt end,reviewed_by=me where submission_id=c.id;
 elsif p_action='keep' then
  if jsonb_typeof(p->'kept') is distinct from 'boolean' then return jsonb_build_object('status','invalid_request'); end if;
  -- Setting a card aside takes its marks with it and lets the cards merged into it stand on their own.
  update private.four_list_review set kept=(p->>'kept')::boolean,feeds_heard=case when (p->>'kept')::boolean then feeds_heard else false end,
   feeds_tensions=case when (p->>'kept')::boolean then feeds_tensions else false end,reviewed_by=me where submission_id=c.id;
  if not (p->>'kept')::boolean then update private.four_list_review set merged_into=null where merged_into=c.id and not deleted; end if;
 elsif p_action='unmerge' then
  update private.four_list_review set merged_into=null,reviewed_by=me where submission_id=c.id;
 else
  if jsonb_typeof(p->'heard') is distinct from 'boolean' or jsonb_typeof(p->'tensions') is distinct from 'boolean' then return jsonb_build_object('status','invalid_request'); end if;
  v_heard:=(p->>'heard')::boolean; v_tensions:=(p->>'tensions')::boolean;
  if not v.kept or v.merged_into is not null then return jsonb_build_object('status','invalid_state'); end if;
  if v_tensions and c.value->>'column' not in ('wrong','confused') then return jsonb_build_object('status','invalid_state'); end if;
  update private.four_list_review set feeds_heard=v_heard,feeds_tensions=v_tensions,reviewed_by=me where submission_id=c.id;
 end if;
 return jsonb_build_object('status','ok');
end $$;

-- What step 4 (What We Heard) and the signal read: the cards the facilitator marked, with the words, the list,
-- the people who agreed (a merged card adds its cards' people) and the people who took part. Facilitators and the service role.
create function private.four_lists_marks(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if (select auth.role()) is distinct from 'service_role' and not coalesce(private.wf_facilitates(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 return jsonb_build_object('status','ok','cards',coalesce((select jsonb_agg(jsonb_build_object('session',w.session_id,'card',w.id,'col',w.col,'text',w.text,'agree',w.agree,'took_part',w.took,'heard',w.feeds_heard,'tensions',w.feeds_tensions)
   order by w.session_id,w.col,w.agree desc,w.id)
  from (select x.id,x.session_id,x.value->>'column' as col,coalesce(v.edited_text,x.text) as text,v.feeds_heard,v.feeds_tensions,
    (select count(distinct a.attendee_id) from private.four_list_agreements a where a.agreed and not a.deleted
      and (a.submission_id=x.id or a.submission_id in(select m.submission_id from private.four_list_review m where m.merged_into=x.id and not m.deleted))) as agree,
    (select count(distinct p) from (select y.attendee_id p from public.submissions y where y.session_id=x.session_id and not y.deleted and not y.withdrawn and y.value ? 'column'
      union select a.attendee_id from private.four_list_agreements a where a.session_id=x.session_id and not a.deleted and a.agreed) z) as took
   from private.four_list_review v join public.submissions x on x.id=v.submission_id
   where v.engagement_id=p_engagement and not v.deleted and v.kept and v.merged_into is null and (v.feeds_heard or v.feeds_tensions) and not x.deleted and not x.withdrawn) w),'[]'::jsonb));
end $$;

create function public.four_lists_agree(p_engagement uuid,p_card uuid,p_on boolean) returns jsonb
language sql security invoker set search_path='' as $$ select private.four_lists_agree(p_engagement,p_card,p_on) $$;
create function public.four_lists_read(p_engagement uuid,p_session uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.four_lists_read(p_engagement,p_session) $$;
create function public.four_lists_review_read(p_engagement uuid,p_session uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.four_lists_review_read(p_engagement,p_session) $$;
create function public.four_lists_review(p_engagement uuid,p_session uuid,p_action text,p jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.four_lists_review(p_engagement,p_session,p_action,p) $$;
create function public.four_lists_marks(p_engagement uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.four_lists_marks(p_engagement) $$;

-- ---------- AI: the worker's claim for a four_lists session ----------
alter function private.ai_claim(uuid,uuid,text,jsonb) rename to ai_claim_base5;
alter function private.ai_apply(uuid,uuid,jsonb,jsonb) rename to ai_apply_base5;
alter function private.ai_fail(uuid,uuid,text,jsonb) rename to ai_fail_base4;
alter function private.ai_status(uuid,uuid) rename to ai_status_base1;
alter function private.ai_control(uuid,uuid,text,jsonb) rename to ai_control_base1;

-- Due when a card no earlier claim saw is open and some list holds two open cards (or an unpinned group could take it).
create function private.ai_claim(p_session uuid,p_lease uuid,p_model text,p_versions jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.sessions; a private.ai_sessions; t timestamptz:=clock_timestamp(); v_inputs jsonb; v_run uuid;
begin
 select * into s from public.sessions where id=p_session and not deleted;
 if s.id is null or s.interaction<>'four_lists' then return private.ai_claim_base5(p_session,p_lease,p_model,p_versions); end if;
 if p_lease is null or p_model is null or length(p_model) not between 1 and 100 or jsonb_typeof(p_versions) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 if not private.ai_on(s.id) or s.state not in ('live','phones_down','open') then return jsonb_build_object('status','off'); end if;
 insert into private.ai_sessions(session_id,engagement_id) values(s.id,s.engagement_id) on conflict(session_id) do nothing;
 select * into a from private.ai_sessions where session_id=s.id for update;
 if a.lease_id is not null and a.lease_until>t then return jsonb_build_object('status','busy'); end if;
 if a.last_failed_at is not null and a.last_failed_at>t-interval '10 seconds' and (a.last_ok_at is null or a.last_failed_at>a.last_ok_at) then
  return jsonb_build_object('status','cooling','ms',(extract(epoch from a.last_failed_at+interval '10 seconds'-t)*1000)::integer); end if;
 if a.lease_run is not null then update private.ai_runs set status='stale',finished_at=t where id=a.lease_run and status='running'; end if;
 if not exists(select 1 from private.ai_wall_open(s.id) o where a.group_seen_at is null or not o.id=any(a.group_seen_ids))
  or not (exists(select 1 from private.ai_wall_open(s.id) o join private.fl_cards(s.id) c on c.id=o.id group by c.col having count(*)>=2)
   or exists(select 1 from private.ai_wall_groups(s.id) g where not g.pinned)) then return jsonb_build_object('status','idle'); end if;
 if coalesce(p_versions->>'group_four_lists','') !~ '^[a-z0-9_.@-]{1,60}$' then return jsonb_build_object('status','invalid_request'); end if;
 select jsonb_build_object(
  'answers',coalesce((select jsonb_agg(jsonb_build_object('ref','a'||ord,'id',id,'column',col,'text',text) order by ord)
    from (select o.id,o.text,c.col,row_number() over(order by o.received,o.id) as ord from (select * from private.ai_wall_open(s.id) limit 60) o join private.fl_cards(s.id) c on c.id=o.id) z),'[]'::jsonb),
  'groups',coalesce((select jsonb_agg(jsonb_build_object('ref','g'||ord,'id',id,'label',label,'pinned',pinned,'renamed',z.renamed,'count',z.n,'examples',to_jsonb(coalesce(z.texts,array[]::text[])),
      'column',(select c.col from private.ai_group_members gm join private.fl_cards(s.id) c on c.id=gm.submission_id where gm.group_id=z.id and gm.removed_at is null and not gm.deleted limit 1)) order by ord)
    from (select g.*,row_number() over(order by g.created_at,g.id) as ord from private.ai_wall_groups(s.id) g) z),'[]'::jsonb)) into v_inputs;
 update private.ai_sessions set group_seen_at=t,group_seen_ids=array(select o.id from private.ai_wall_open(s.id) o order by o.id) where session_id=s.id;
 insert into private.ai_runs(engagement_id,session_id,job,model,prompt_version,inputs,created_at) values(s.engagement_id,s.id,'group_four_lists',p_model,p_versions->>'group_four_lists',v_inputs,t) returning id into v_run;
 update private.ai_sessions set lease_id=p_lease,lease_run=v_run,lease_until=t+interval '45 seconds' where session_id=s.id;
 return jsonb_build_object('status','claimed','run',v_run,'job','group_four_lists','prompt_version',p_versions->>'group_four_lists','inputs',v_inputs);
end $$;

-- The model's groups under the merge limits, which are code: at most four answers into a group per step, all in one
-- list, at least two to make a group, twelve groups at most, pinned groups untouched, a renamed label kept, labels
-- through the word filter, only answers still open. One version raise.
create function private.ai_apply(p_run uuid,p_lease uuid,p_output jsonb,p_usage jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run private.ai_runs; a private.ai_sessions; r public.room_states; s public.sessions; t timestamptz:=clock_timestamp(); v_ms integer;
 applied jsonb:='[]'::jsonb; refused jsonb:='[]'::jsonb; v_changed boolean:=false; g jsonb; refs jsonb; reason text; used text[]:=array[]::text[];
 v_group uuid; v_label text; picks jsonb; all_picks jsonb; v_col text; groups_now integer;
begin
 select * into run from private.ai_runs where id=p_run;
 if run.id is null or run.job<>'group_four_lists' then return private.ai_apply_base5(p_run,p_lease,p_output,p_usage); end if;
 if p_lease is null then return jsonb_build_object('status','invalid_request'); end if;
 if run.engagement_id='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(run.engagement_id::text,7)); end if;
 select * into r from public.room_states where engagement_id=run.engagement_id and not deleted for update;
 select * into a from private.ai_sessions where session_id=run.session_id for update;
 select * into run from private.ai_runs where id=p_run;
 if run.status<>'running' or a.lease_id is distinct from p_lease or a.lease_run is distinct from p_run then return jsonb_build_object('status','stale'); end if;
 v_ms:=private.ai_usage(p_usage,'ms',600000)::integer;
 select * into s from public.sessions where id=run.session_id;
 update private.ai_sessions set lease_id=null,lease_run=null,lease_until=null,last_ok_at=t,last_ms=v_ms where session_id=run.session_id;
 if not private.ai_on(run.session_id) or s.deleted then
  update private.ai_runs set status='discarded',finished_at=t,ms=v_ms,input_tokens=private.ai_usage(p_usage,'input_tokens',10000000)::integer,
   output_tokens=private.ai_usage(p_usage,'output_tokens',10000000)::integer,cost_usd=private.ai_usage(p_usage,'cost_usd',1000) where id=run.id;
  return jsonb_build_object('status','discarded');
 end if;
 if jsonb_typeof(p_output) is distinct from 'object' or pg_column_size(p_output)>131072 then p_output:='{}'::jsonb; end if;
 select coalesce(jsonb_object_agg(x->>'ref',x),'{}'::jsonb) into refs from (select jsonb_array_elements(run.inputs->'answers') x union all select jsonb_array_elements(run.inputs->'groups') x) z;
 select count(*) into groups_now from private.ai_wall_groups(run.session_id);
 for g in select v from jsonb_array_elements(case when jsonb_typeof(p_output->'groups')='array' then p_output->'groups' else '[]'::jsonb end) v limit 40 loop
  reason:=null; v_group:=null;
  select coalesce(jsonb_agg(refs->x order by ord),'[]'::jsonb) into all_picks from jsonb_array_elements_text(case when jsonb_typeof(g->'answers')='array' then g->'answers' else '[]'::jsonb end) with ordinality y(x,ord)
   where refs ? x and refs->x ? 'text' and not x=any(used)
    and exists(select 1 from private.ai_wall_open(run.session_id) o where o.id=(refs->x->>'id')::uuid);
  v_col:=case when refs ? (g->>'group') and refs->(g->>'group') ? 'label' then refs->(g->>'group')->>'column' else all_picks->0->>'column' end;
  select coalesce(jsonb_agg(p),'[]'::jsonb) into picks from jsonb_array_elements(all_picks) p where p->>'column'=v_col;
  if jsonb_array_length(picks)<jsonb_array_length(all_picks) then
   refused:=refused||jsonb_build_array(jsonb_build_object('group',g->>'group','answers',(select jsonb_agg(p->>'ref') from jsonb_array_elements(all_picks) p where p->>'column' is distinct from v_col),'reason','column'));
  end if;
  if jsonb_array_length(picks)>4 then
   refused:=refused||jsonb_build_array(jsonb_build_object('group',g->>'group','answers',(select jsonb_agg(p->>'ref') from jsonb_array_elements(picks) with ordinality q(p,o) where o>4),'reason','too_many'));
   picks:=(select jsonb_agg(p order by o) from jsonb_array_elements(picks) with ordinality q(p,o) where o<=4);
  end if;
  v_label:=private.ai_label(g->>'label');
  if refs ? (g->>'group') and refs->(g->>'group') ? 'label' then
   select x.id into v_group from private.ai_groups x where x.id=(refs->(g->>'group')->>'id')::uuid and x.session_id=run.session_id and x.undone_at is null and not x.deleted;
   if v_group is null then reason:='gone';
   elsif (select pinned from private.ai_groups where id=v_group) then reason:='pinned';
   end if;
   if reason is null and v_label is not null and (select renamed_by is null and label<>v_label from private.ai_groups where id=v_group) then
    update private.ai_groups set label=v_label,ai_label=v_label where id=v_group; v_changed:=true;
   end if;
  elsif g->>'group' is not null and g->>'group' ~ '^n[0-9]{1,3}$' then
   if v_label is null then reason:='label';
   elsif jsonb_array_length(picks)<2 then reason:='too_few';
   elsif groups_now>=12 then reason:='too_many_groups';
   else
    insert into private.ai_groups(engagement_id,session_id,label,ai_label,run_id,created_at) values(run.engagement_id,run.session_id,v_label,v_label,run.id,t) returning id into v_group;
    groups_now:=groups_now+1;
   end if;
  else reason:='unknown';
  end if;
  if reason is null and jsonb_array_length(picks)>0 then
   insert into private.ai_group_members(group_id,submission_id,engagement_id,session_id,run_id,created_at)
    select v_group,(p->>'id')::uuid,run.engagement_id,run.session_id,run.id,t from jsonb_array_elements(picks) p;
   used:=used||array(select p->>'ref' from jsonb_array_elements(picks) p); v_changed:=true;
   applied:=applied||jsonb_build_array(jsonb_build_object('group',v_group,'answers',(select jsonb_agg(p->>'id') from jsonb_array_elements(picks) p)));
  elsif reason is not null then refused:=refused||jsonb_build_array(jsonb_build_object('group',g->>'group','reason',reason)); end if;
 end loop;
 update private.ai_runs set status='ok',changed=v_changed,finished_at=t,ms=v_ms,output=jsonb_build_object('result',p_output,'applied',applied,'refused',refused),
  input_tokens=private.ai_usage(p_usage,'input_tokens',10000000)::integer,output_tokens=private.ai_usage(p_usage,'output_tokens',10000000)::integer,
  cost_usd=private.ai_usage(p_usage,'cost_usd',1000) where id=run.id;
 if v_changed and r.live_session_id=run.session_id then
  update public.room_states set results=private.live_results(run.engagement_id) where engagement_id=run.engagement_id;
 end if;
 return jsonb_build_object('status','ok','changed',v_changed,'applied',jsonb_array_length(applied),'refused',jsonb_array_length(refused));
end $$;

-- A failed grouping tries the same cards again after the cool-down.
create function private.ai_fail(p_run uuid,p_lease uuid,p_error text,p_usage jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare res jsonb; j text;
begin
 select job into j from private.ai_runs where id=p_run;
 res:=private.ai_fail_base4(p_run,p_lease,p_error,p_usage);
 if j='group_four_lists' and res->>'status'='ok' then
  update private.ai_sessions set group_seen_at=null where session_id=(select session_id from private.ai_runs where id=p_run);
 end if;
 return res;
end $$;

-- ---------- The facilitator's AI panel ----------
create function private.ai_status(p_engagement uuid,p_session uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare out jsonb; r public.room_states; s public.sessions; a private.ai_sessions; t timestamptz:=clock_timestamp(); running private.ai_runs; last_change private.ai_runs; last_group private.ai_runs;
begin
 out:=private.ai_status_base1(p_engagement,p_session);
 if out->>'status'<>'ok' then return out; end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted;
 if p_session is not null then select * into s from public.sessions where id=p_session and engagement_id=p_engagement and not deleted; end if;
 if s.id is null then select * into s from public.sessions where id=r.live_session_id and not deleted; end if;
 if s.id is null or s.interaction<>'four_lists' then return out; end if;
 select * into a from private.ai_sessions where session_id=s.id and not deleted;
 if a.lease_run is not null and a.lease_until>t then select * into running from private.ai_runs where id=a.lease_run; end if;
 select * into last_change from private.ai_runs where session_id=s.id and status='ok' and changed and undone_at is null and job<>'summarize_wall' and not deleted order by created_at desc limit 1;
 select * into last_group from private.ai_runs where session_id=s.id and job='group_four_lists' and status='ok' and not deleted order by created_at desc limit 1;
 return out||jsonb_build_object('session',jsonb_build_object('id',s.id,'title',s.title,'interaction',s.interaction,'live',s.id=r.live_session_id,'ai',private.ai_on(s.id),
   'option',case when jsonb_typeof(s.options->'ai')='boolean' then (s.options->>'ai')::boolean else true end,'override',a.ai,'summary_available',false,'summary_shown',false),
  'state',jsonb_build_object('running',running.id is not null,'job',running.job,'running_ms',case when running.id is not null then (extract(epoch from t-running.created_at)*1000)::integer end,
   'last_ms',a.last_ms,'last_ok_at',a.last_ok_at,'last_failed_at',a.last_failed_at,
   'failing',a.last_failed_at is not null and (a.last_ok_at is null or a.last_failed_at>a.last_ok_at),
   'slow',(running.id is not null and t-running.created_at>interval '6 seconds') or (coalesce(a.last_ms,0)>6000 and a.last_ok_at>t-interval '2 minutes')),
  'last_change',case when last_change.id is not null then jsonb_build_object('run',last_change.id,'job',last_change.job,'at',last_change.created_at,'count',jsonb_array_length(coalesce(last_change.output->'applied','[]'::jsonb))) end,
  'groups',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'label',g.label,'ai_label',g.ai_label,'pinned',g.pinned,'renamed',g.renamed_by is not null,
     'undone',g.undone_at is not null,'at',g.created_at,
     'column',(select x.value->>'column' from private.ai_group_members gm join public.submissions x on x.id=gm.submission_id where gm.group_id=g.id and gm.removed_at is null and not gm.deleted limit 1),
     'members',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'text',x.text) order by x.server_received_at,x.id) from private.ai_group_members gm join public.submissions x on x.id=gm.submission_id
       where gm.group_id=g.id and gm.removed_at is null and not gm.deleted and not x.deleted and not x.withdrawn and not x.hidden),'[]'::jsonb))
     order by g.undone_at is not null,g.created_at,g.id) from (select * from private.ai_groups where session_id=s.id and not deleted order by created_at desc limit 60) g),'[]'::jsonb),
  'answers',(select count(*) from private.fl_cards(s.id)),
  'grouped',(select count(*) from private.ai_group_members gm join private.ai_groups g on g.id=gm.group_id and g.undone_at is null and not g.deleted
     join public.submissions x on x.id=gm.submission_id and not x.deleted and not x.withdrawn and not x.hidden where gm.session_id=s.id and gm.removed_at is null and not gm.deleted),
  'waiting',(select count(*) from private.ai_wall_open(s.id) o where last_group.id is null or o.received>last_group.created_at),
  'summary',null);
end $$;

-- ---------- The AI controls for a four_lists session ----------
-- The group presses (undo, redo, pin, rename) are the base function's and work on any session's groups. The three that
-- name a session (AI on, AI off, Undo last AI change) are handled here for a four_lists session.
create function private.ai_control(p_engagement uuid,p_id uuid,p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; done private.room_controls; me uuid:=private.clearway_user_id(); s public.sessions; run private.ai_runs; logged text; before boolean; t timestamptz:=clock_timestamp(); who text;
begin
 if p_action not in ('ai_on','ai_off','undo_last') or jsonb_typeof(p) is distinct from 'object' or p->>'session' is null
  or p->>'session' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  or not exists(select 1 from public.sessions x where x.id=(p->>'session')::uuid and x.engagement_id=p_engagement and x.interaction='four_lists' and not x.deleted)
 then return private.ai_control_base1(p_engagement,p_id,p_action,p); end if;
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if r.engagement_id is null or not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 if p_id is null then return jsonb_build_object('status','invalid_request'); end if;
 logged:=case p_action when 'ai_on' then 'turn_ai_on' when 'ai_off' then 'turn_ai_off' else 'undo_last_ai_change' end;
 select * into done from private.room_controls where id=p_id;
 if found then
  if done.engagement_id<>p_engagement or done.action<>logged then return jsonb_build_object('status','conflict'); end if;
  return jsonb_build_object('status','duplicate','version',r.version);
 end if;
 select * into s from public.sessions where id=(p->>'session')::uuid;
 insert into private.ai_sessions(session_id,engagement_id) values(s.id,s.engagement_id) on conflict(session_id) do nothing;
 perform 1 from private.ai_sessions where session_id=s.id for update;
 if p_action in ('ai_on','ai_off') then
  if p_action='ai_on' and not exists(select 1 from public.engagements where id=p_engagement and settings->>'ai_enabled'='true') then return jsonb_build_object('status','engagement_off'); end if;
  before:=private.ai_on(s.id);
  update private.ai_sessions set ai=(p_action='ai_on') where session_id=s.id;
  if before=private.ai_on(s.id) then return jsonb_build_object('status','unchanged','version',r.version); end if;
 else
  select * into run from private.ai_runs where session_id=s.id and status='ok' and changed and undone_at is null and job<>'summarize_wall' and not deleted order by created_at desc limit 1;
  if run.id is null then return jsonb_build_object('status','unchanged','version',r.version); end if;
  update private.ai_groups set undone_at=t,undone_by=me where run_id=run.id and undone_at is null;
  update private.ai_group_members gm set removed_at=t,removed_by=me where gm.run_id=run.id and gm.removed_at is null
   and not exists(select 1 from private.ai_groups x where x.id=gm.group_id and x.run_id=run.id);
  update private.ai_runs set undone_at=t,undone_by=me where id=run.id;
 end if;
 update public.room_states set results=private.live_results(p_engagement) where engagement_id=p_engagement returning * into r;
 insert into private.room_controls(id,engagement_id,actor_id,action,session_id,room_version,created_at) values(p_id,p_engagement,me,logged,r.live_session_id,r.version,t);
 select split_part(btrim(name),' ',1) into who from public.clearway_users where id=me;
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','control','id',p_id,'action',logged,'by',who,'version',r.version,'changed',true));
 return jsonb_build_object('status','ok','version',r.version);
exception when invalid_text_representation then return jsonb_build_object('status','invalid_request');
end $$;

-- ---------- The practice reset: step 1's list of tables, every later table kept, and the new two ----------
create or replace function private.reset_practice_room() returns boolean
language plpgsql security definer set search_path='' as $$
declare eng uuid:='90000000-0000-4000-8000-000000000010'::uuid; target_sessions uuid[];
begin
 if not ((select private.is_admin()) or private.can_facilitate(eng)) then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended(eng::text,7));
 if not exists(select 1 from public.engagements where id=eng and type='practice' and not deleted) then return false; end if;
 perform 1 from public.room_states where engagement_id=eng for update;
 update public.submissions set deleted=true where engagement_id=eng and not deleted;
 update private.four_list_review set deleted=true where engagement_id=eng and not deleted;
 update private.four_list_agreements set deleted=true where engagement_id=eng and not deleted;
 update private.latency_logs set deleted=true where engagement_id=eng and not deleted;
 delete from private.lens_summary_locks where engagement_id=eng;
 update private.scribe_cards set deleted=true where engagement_id=eng and not deleted;
 update private.scribe_files set deleted=true where engagement_id=eng and not deleted;
 update private.candidate_suggestions set deleted=true where engagement_id=eng and not deleted;
 update private.candidate_sources set deleted=true where engagement_id=eng and not deleted;
 update private.candidates set deleted=true,outcome_id=null where engagement_id=eng and not deleted;
 update private.candidate_boards set deleted=true,decision_id=null where engagement_id=eng and not deleted;
 update private.lens_summary_responses set deleted=true where engagement_id=eng and not deleted;
 update private.lens_summary_sources set deleted=true where engagement_id=eng and not deleted;
 update private.lens_summary_sentences set deleted=true where engagement_id=eng and not deleted;
 update private.lens_summaries set deleted=true,current_version_id=null,signed_off_version_id=null,decision_id=null where engagement_id=eng and not deleted;
 update private.lens_summary_versions set deleted=true where engagement_id=eng and not deleted;
 update private.lens_sentences set deleted=true where engagement_id=eng and not deleted;
 update private.lens_openings set deleted=true where engagement_id=eng and not deleted;
 update private.overnight_publications set withdrawn_at=coalesce(withdrawn_at,clock_timestamp()) where engagement_id=eng and withdrawn_at is null;
 delete from private.review_presence where engagement_id=eng;
 update private.draft_photo_texts set deleted=true where engagement_id=eng and not deleted;
 update private.draft_notes set deleted=true where engagement_id=eng and not deleted;
 update private.draft_sources set deleted=true where engagement_id=eng and not deleted;
 update private.draft_bullets set deleted=true where engagement_id=eng and not deleted;
 update private.draft_outcomes set deleted=true where engagement_id=eng and not deleted;
 update private.overnight_rounds set deleted=true where engagement_id=eng and not deleted;
 update private.first_steps set deleted=true where engagement_id=eng and not deleted;
 update private.intent_card_people set deleted=true where engagement_id=eng and not deleted;
 update private.intent_cards set deleted=true where engagement_id=eng and not deleted;
 update private.goal_risks set deleted=true where engagement_id=eng and not deleted;
 update private.goals set deleted=true where engagement_id=eng and not deleted;
 update private.risk_mitigations set deleted=true where engagement_id=eng and not deleted;
 update private.risks set deleted=true where engagement_id=eng and not deleted;
 update private.outcome_indicators set deleted=true where engagement_id=eng and not deleted;
 update private.vision_outcomes set deleted=true,decision_id=null where engagement_id=eng and not deleted;
 update private.decisions set deleted=true where engagement_id=eng and not deleted;
 update private.key_metrics set deleted=true where engagement_id=eng and not deleted;
 update private.celebrations set deleted=true where engagement_id=eng and not deleted;
 update private.map_drafts set deleted=true where engagement_id=eng and not deleted;
 update public.sessions set state='ready',closed_at=null where engagement_id=eng and not deleted and state in ('live','phones_down','closed','open');
 select array_agg(distinct auth_session_id) into target_sessions from public.device_sessions where engagement_id=eng;
 update public.device_sessions set revoked_at=coalesce(revoked_at,now()) where engagement_id=eng;
 update private.room_auth_devices set revoked_at=coalesce(revoked_at,now()),granted_at=null,claim_id=null,claim_started_at=null,deleted=true where engagement_id=eng;
 update private.room_auth_challenges set consumed_at=coalesce(consumed_at,now()),deleted=true where engagement_id=eng;
 update public.join_requests set deleted=true where engagement_id=eng;
 update public.attendees set deleted=true where engagement_id=eng;
 -- Preserve device audit rows, while invalidating JWT access and refresh immediately.
 delete from auth.sessions where id=any(coalesce(target_sessions,array[]::uuid[]));
 update public.engagements set status='setup' where id=eng;
 update public.room_states set live_session_id=null,tv_content='holding',phones_down=false,burst_ends_at=null,spotlight_id=null,
   hidden_ids=array[]::uuid[],remote_holder_id=null,team_led_block_id=null,show_tv_on_phones=false,
   results='{"total":0,"people":0,"words":[]}' where engagement_id=eng;
 return true;
end $$;

-- ---------- Clear test answers: step 6a's version plus test agreements (counted with the votes) ----------
create or replace function private.rehearsal_control(p_engagement uuid,p_id uuid,p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; done private.rehearsal_log; since timestamptz; began timestamptz; cleared uuid[]; n_votes integer:=0; n_suggestions integer:=0; n_sessions integer:=0; n_agree integer:=0;
begin
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if not found or not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 if p_id is null or p_action is null or p_action not in ('start','end','clear') then return jsonb_build_object('status','invalid_request'); end if;
 select * into done from private.rehearsal_log where id=p_id;
 if found then
  if done.engagement_id<>p_engagement or done.action<>p_action then return jsonb_build_object('status','conflict'); end if;
  return jsonb_build_object('status','duplicate','answers',done.answers,'votes',done.votes,'suggestions',done.suggestions,'sessions',done.sessions,'version',r.version);
 end if;
 since:=private.rehearsing(p_engagement);
 if p_action='start' then
  if since is not null then return jsonb_build_object('status','unchanged','since',since); end if;
  insert into private.rehearsal_log(id,engagement_id,actor_id,action,created_at) values(p_id,p_engagement,private.clearway_user_id(),'start',clock_timestamp());
  return jsonb_build_object('status','ok','since',private.rehearsing(p_engagement));
 elsif p_action='end' then
  if since is null then return jsonb_build_object('status','unchanged'); end if;
  insert into private.rehearsal_log(id,engagement_id,actor_id,action,created_at) values(p_id,p_engagement,private.clearway_user_id(),'end',clock_timestamp());
  return jsonb_build_object('status','ok');
 end if;
 -- Clear test answers: never while a session is on the TV and phones.
 if r.live_session_id is not null then
  return jsonb_build_object('status','live','title',(select title from public.sessions where id=r.live_session_id));
 end if;
 -- The steps a rehearsal reached since the last clear.
 select min(l.created_at) into began from private.rehearsal_log l where l.engagement_id=p_engagement and l.action='start' and not l.deleted
  and l.created_at>coalesce((select max(c.created_at) from private.rehearsal_log c where c.engagement_id=p_engagement and c.action='clear' and not c.deleted),'-infinity'::timestamptz);
 perform 1 from public.sessions where engagement_id=p_engagement and not deleted order by id for update;
 select coalesce(array_agg(id order by id),array[]::uuid[]) into cleared from public.submissions where engagement_id=p_engagement and test and not deleted;
 update public.submissions set deleted=true where id=any(cleared);
 update private.latency_logs set deleted=true where submission_id=any(cleared) and not deleted;
 update private.qa_questions set deleted=true where submission_id=any(cleared) and not deleted;
 update private.qa_merges set deleted=true where engagement_id=p_engagement and (survivor_id=any(cleared) or member_id=any(cleared)) and not deleted;
 update private.qa_votes set deleted=true where engagement_id=p_engagement and (test or question_id=any(cleared)) and not deleted;
 get diagnostics n_votes=row_count;
 -- Four Helpful Lists: test agreements, and anything agreed with or reviewed on a cleared card (counted with the votes).
 update private.four_list_agreements set deleted=true where engagement_id=p_engagement and (test or submission_id=any(cleared)) and not deleted;
 get diagnostics n_agree=row_count;
 n_votes:=n_votes+n_agree;
 update private.four_list_review set deleted=true where engagement_id=p_engagement and (submission_id=any(cleared) or merged_into=any(cleared)) and not deleted;
 update private.ranking_suggestions set deleted=true where engagement_id=p_engagement and test and not deleted;
 get diagnostics n_suggestions=row_count;
 -- Candidate suggestions a rehearsal made go with it (step 8: the one gap the candidates step listed).
 update private.candidate_suggestions set deleted=true where engagement_id=p_engagement and test and not deleted;
 -- Scribe cards and files a rehearsal made go with it; the app removes the stored bytes (private.rehearsal_scribe_paths, read first).
 update private.scribe_cards set deleted=true where engagement_id=p_engagement and test and not deleted;
 update private.scribe_files set deleted=true where engagement_id=p_engagement and test and not deleted;
 -- Step 5: nothing AI made from test answers survives into the real session.
 perform private.ai_clear(p_engagement,cleared);
 -- A real answer that a test answer replaced stands again.
 update public.submissions set withdrawn=false,replaced_by=null where engagement_id=p_engagement and replaced_by=any(cleared) and not deleted and not test;
 -- Steps the rehearsal reached go back to Ready, unless real answers live in them.
 if began is not null then
  update public.sessions x set state='ready',closed_at=null
   where x.engagement_id=p_engagement and not x.deleted and x.mode='live' and x.state in ('open','closed') and x.shown_at>=began
    and not exists(select 1 from public.submissions y where y.session_id=x.id and not y.deleted);
  get diagnostics n_sessions=row_count;
 end if;
 insert into private.rehearsal_log(id,engagement_id,actor_id,action,answers,votes,suggestions,sessions,created_at)
  values(p_id,p_engagement,private.clearway_user_id(),'clear',cardinality(cleared),n_votes,n_suggestions,n_sessions,clock_timestamp());
 -- One version for every surface: a spotlit test question clears, counts recompute.
 update public.room_states set spotlight_id=case when spotlight_id=any(cleared) then null else spotlight_id end,results=private.live_results(p_engagement)
  where engagement_id=p_engagement returning * into r;
 return jsonb_build_object('status','ok','answers',cardinality(cleared),'votes',n_votes,'suggestions',n_suggestions,'sessions',n_sessions,'version',r.version);
end $$;

-- ---------- The Board discovery session template (shipped) ----------
-- Welcome, the Four Helpful Lists, close: 45 minutes, for a board or an elder team before the retreat.
insert into private.templates(id,name,description,kind,shared,sessions) values('c1ea0000-0000-4000-8000-000000000004','Board discovery session',
 'A 45-minute discovery session for a board or elder team: a welcome, the Four Helpful Lists (What''s right? What''s wrong? What''s missing? What''s confused?) on phones and the TV, and a close. Review the cards afterwards and mark which ones feed What We Heard and Strategic Tensions. Prompts and notes are starting points.','shipped',true,$tpl$[
 {"title":"Welcome","part":"Pre-call","position":0,"mode":"live","interaction":"content","offset":0,"planned_minutes":5,"state":"ready",
  "prompt":"","phone_depth":"","segment":"","lands_in":"",
  "options":{"screen":"holding","outline":"Welcome and prayer\nThe Four Helpful Lists\nWhat we noticed"},
  "settings":{"anonymous":true,"burst_minutes":4,"join_strip":true},"max_sends":3,"max_characters":28,"max_words":3,
  "notes":"Put this up as people arrive and ask everyone to join on their phone. Say that cards are anonymous and that nothing here is a vote."},
 {"title":"The Four Helpful Lists","part":"Pre-call","position":1,"mode":"live","interaction":"four_lists","offset":5,"planned_minutes":35,"state":"ready",
  "prompt":"Think about our church today. What is right? What is wrong? What is missing? What is confused?","phone_depth":"","segment":"","lands_in":"",
  "options":{"ai":true},
  "settings":{"anonymous":true,"burst_minutes":4,"join_strip":false},"max_sends":12,"max_characters":200,"max_words":50,
  "notes":"Give people ten quiet minutes to add cards to any list, then ask them to tap Agree on cards they share. Read each list aloud, starting with the biggest agreement, and ask what surprises the group. AI slides similar cards together; Undo is on your control surface."},
 {"title":"Close","part":"Pre-call","position":2,"mode":"live","interaction":"content","offset":40,"planned_minutes":5,"state":"ready",
  "prompt":"Thank you. We will bring back what we heard.","phone_depth":"","segment":"","lands_in":"","options":{"screen":"prayer"},
  "settings":{"anonymous":true,"burst_minutes":4,"join_strip":false},"max_sends":3,"max_characters":28,"max_words":3,
  "notes":"Name one thing you heard in more than one list. Close in prayer, then review the cards on the control surface."}
]$tpl$::jsonb) on conflict(id) do nothing;

-- ---------- Grants ----------
-- The replaced functions (ai_on, reset_practice_room, rehearsal_control) keep the grants they had; the renamed originals
-- keep theirs; the new wrappers take the same grants the originals had.
revoke all on function private.options_four_lists(jsonb,uuid),private.parse_four_lists(public.sessions,text,jsonb),private.fl_cards(uuid),private.results_four_lists(uuid,uuid,text[]),
 private.items_four_lists(uuid,text[]),private.four_lists_agree(uuid,uuid,boolean),private.four_lists_read(uuid,uuid),private.four_lists_review_read(uuid,uuid),
 private.four_lists_review(uuid,uuid,text,jsonb),private.four_lists_marks(uuid),
 public.four_lists_agree(uuid,uuid,boolean),public.four_lists_read(uuid,uuid),public.four_lists_review_read(uuid,uuid),public.four_lists_review(uuid,uuid,text,jsonb),public.four_lists_marks(uuid),
 private.ai_claim(uuid,uuid,text,jsonb),private.ai_apply(uuid,uuid,jsonb,jsonb),private.ai_fail(uuid,uuid,text,jsonb),private.ai_status(uuid,uuid),private.ai_control(uuid,uuid,text,jsonb)
 from public,anon,authenticated;
grant execute on function private.four_lists_agree(uuid,uuid,boolean),private.four_lists_read(uuid,uuid),private.four_lists_review_read(uuid,uuid),private.four_lists_review(uuid,uuid,text,jsonb),
 private.four_lists_marks(uuid),public.four_lists_agree(uuid,uuid,boolean),public.four_lists_read(uuid,uuid),public.four_lists_review_read(uuid,uuid),public.four_lists_review(uuid,uuid,text,jsonb),
 public.four_lists_marks(uuid),private.ai_status(uuid,uuid),private.ai_control(uuid,uuid,text,jsonb) to authenticated;
grant execute on function private.four_lists_marks(uuid),public.four_lists_marks(uuid),
 private.ai_claim(uuid,uuid,text,jsonb),private.ai_apply(uuid,uuid,jsonb,jsonb),private.ai_fail(uuid,uuid,text,jsonb) to service_role;
commit;
