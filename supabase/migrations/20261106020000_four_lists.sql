-- Milestone 6, step 2: the Four Helpful Lists (INT-11) and its facilitator review (SET-05). Kind four_lists.
--
-- A card is a submission: its text, plus {"column": right|wrong|missing|confused} in value. A person
-- sends several. Agreeing is its own write, one row per person per card, toggled, never on a card the
-- person wrote (or one folded with theirs). Counts are people. Similar cards fold beneath a survivor
-- inside one column only: identical words fold as cards arrive (made_by 'words'); the fast live model
-- (job fold_four_lists) folds more, marked AI, with undo, pin and off. AI is never in the path from a
-- phone to the TV: a card and an agree reach the TV in the same write.
--
-- Shared objects changed (each a superset of its newest earlier definition):
--   private.ai_runs ai_runs_job_check   candidates (20261104170000) plus fold_four_lists
--   private.ai_on                        candidates (20261104170000) plus four_lists
--   private.ai_claim, ai_apply           candidates wrappers, renamed to _base4; four_lists is handled here, the rest delegate
--   private.ai_fail                      lens_summary wrapper, renamed to _base3; also sends a failed fold back for another try
--   private.ai_status, ai_control        lens_wall versions, renamed to _base; four_lists sessions are handled here
--   private.reset_practice_room          m4 acceptance fixes (20261104190000), renamed to _base; also clears the new tables
--   private.rehearsal_control            practice fixes 1 (20261105100000), renamed to _base; Clear test answers also clears the new tables
--   private.part_order                   gains the Discover part, ahead of the Pre-call
--   private.show_write, template_write   templates (20261103100000) and map templates (20261104180000), their text patched so
--                                        every part list gains Discover (nothing else in either function changes)
--   private.templates                    the two shipped Wayfinding templates gain one live Four Helpful Lists step in Discover
-- New: private.four_list_cards, four_list_folds, four_list_agrees and the functions below, and the cards
-- contract step 3 reads: private.four_lists_cards_for_themes(p_engagement).
begin;

insert into private.interaction_kinds(kind,label,input,one_per_person,counts,structured,shares_answers,spotlight,named,position) values
 ('four_lists','Four Helpful Lists',true,false,'answers',true,true,'none','never',35);

alter table private.ai_runs drop constraint ai_runs_job_check;
alter table private.ai_runs add constraint ai_runs_job_check check(job in ('combine_words','group_wall','summarize_wall','fold_questions','merge_reasons','group_lens','overnight_draft','draft_lens_summary','fold_lens_summary','propose_candidates','fold_four_lists'));

-- ---------- Tables ----------
-- A card's state beyond its submission: its column, the words folding matches on, and Pin.
create table private.four_list_cards (
 submission_id uuid primary key references public.submissions(id),
 engagement_id uuid not null references public.engagements(id),
 session_id uuid not null,
 col text not null check(col in ('right','wrong','missing','confused')),
 words text[] not null default array[]::text[],
 pinned boolean not null default false,
 pinned_by uuid references public.clearway_users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 foreign key(session_id,engagement_id) references public.sessions(id,engagement_id)
);
create index four_list_cards_session_idx on private.four_list_cards(session_id,engagement_id);
create index four_list_cards_engagement_idx on private.four_list_cards(engagement_id);
create index four_list_cards_pinned_by_idx on private.four_list_cards(pinned_by);

-- A fold: what words or AI folded beneath a survivor, and its undo. Never across columns.
create table private.four_list_folds (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 session_id uuid not null,
 survivor_id uuid not null references public.submissions(id),
 member_id uuid not null references public.submissions(id),
 made_by text not null check(made_by in ('words','ai')),
 detail jsonb not null default '{}' check(jsonb_typeof(detail)='object' and pg_column_size(detail)<=4096),
 undone_at timestamptz,
 undone_by uuid references public.clearway_users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 check(survivor_id<>member_id),
 foreign key(session_id,engagement_id) references public.sessions(id,engagement_id)
);
create unique index four_list_folds_member_idx on private.four_list_folds(member_id) where undone_at is null and not deleted;
create index four_list_folds_survivor_idx on private.four_list_folds(survivor_id);
create index four_list_folds_member_all_idx on private.four_list_folds(member_id);
create index four_list_folds_session_idx on private.four_list_folds(session_id,engagement_id);
create index four_list_folds_engagement_idx on private.four_list_folds(engagement_id);
create index four_list_folds_undone_idx on private.four_list_folds(undone_by);

-- Agreeing: one row per person per card, toggled. The id is made on the phone and each press raises the revision.
create table private.four_list_agrees (
 id uuid primary key,
 engagement_id uuid not null references public.engagements(id),
 session_id uuid not null,
 card_id uuid not null references public.submissions(id),
 attendee_id uuid not null,
 agreed boolean not null,
 revision integer not null check(revision between 0 and 1000000),
 phone_sent_at timestamptz not null,
 queued_at timestamptz,
 server_received_at timestamptz not null,
 test boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 foreign key(session_id,engagement_id) references public.sessions(id,engagement_id),
 foreign key(attendee_id,engagement_id) references public.attendees(id,engagement_id)
);
create unique index four_list_agrees_person_idx on private.four_list_agrees(card_id,attendee_id) where not deleted;
create index four_list_agrees_session_idx on private.four_list_agrees(session_id,engagement_id);
create index four_list_agrees_attendee_idx on private.four_list_agrees(attendee_id,engagement_id);
create index four_list_agrees_engagement_idx on private.four_list_agrees(engagement_id);

alter table private.four_list_cards enable row level security;
alter table private.four_list_cards force row level security;
alter table private.four_list_folds enable row level security;
alter table private.four_list_folds force row level security;
alter table private.four_list_agrees enable row level security;
alter table private.four_list_agrees force row level security;
revoke all on private.four_list_cards from public,anon,authenticated;
revoke all on private.four_list_folds from public,anon,authenticated;
revoke all on private.four_list_agrees from public,anon,authenticated;
grant select,insert,update,delete on private.four_list_cards to service_role;
grant select,insert,update,delete on private.four_list_folds to service_role;
grant select,insert,update,delete on private.four_list_agrees to service_role;
create trigger touch_record before update on private.four_list_cards for each row execute function private.touch_live_record('submission_id');
create trigger touch_record before update on private.four_list_folds for each row execute function private.touch_live_record('id');
create trigger touch_record before update on private.four_list_agrees for each row execute function private.touch_live_record('id');
-- A rehearsal's agrees are marked test, as its answers and Q&A votes are, so Clear test answers finds them.
create trigger mark_test before insert on private.four_list_agrees for each row execute function private.mark_test();

create function private.four_list_fold_check() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if (select col from private.four_list_cards where submission_id=new.survivor_id) is distinct from (select col from private.four_list_cards where submission_id=new.member_id) then
  raise exception 'A fold stays inside one column' using errcode='check_violation';
 end if;
 return new;
end $$;
create trigger four_list_fold_check before insert on private.four_list_folds for each row execute function private.four_list_fold_check();

-- ---------- Folding ----------
-- A card's group: the survivor it is folded beneath while that survivor stands, else itself.
create function private.four_lists_root(p_card uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select coalesce((select m.survivor_id from private.four_list_folds m join public.submissions s on s.id=m.survivor_id
   where m.member_id=p_card and m.undone_at is null and not m.deleted and not s.deleted and not s.withdrawn and not s.hidden),p_card)
$$;

-- With AI off (and on), a card with exactly the same words as a standing card in its column folds beneath
-- it as it arrives. A card already folded, a survivor, or one whose fold was undone is never refolded.
create function private.four_lists_fold_words(p_card uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare me private.four_list_cards; target uuid;
begin
 select k.* into me from private.four_list_cards k where k.submission_id=p_card and not k.deleted;
 if me.submission_id is null or cardinality(me.words)=0
   or exists(select 1 from private.four_list_folds m where m.member_id=p_card and not m.deleted)
   or exists(select 1 from private.four_list_folds m where m.survivor_id=p_card and m.undone_at is null and not m.deleted) then return null; end if;
 select c.submission_id into target
 from private.four_list_cards c join public.submissions x on x.id=c.submission_id
 where c.session_id=me.session_id and c.col=me.col and c.submission_id<>p_card and not c.deleted and c.words=me.words
  and not x.deleted and not x.withdrawn and not x.hidden
  and not exists(select 1 from private.four_list_folds m where m.member_id=c.submission_id and m.undone_at is null and not m.deleted)
 order by x.server_received_at,x.id limit 1;
 if target is null then return null; end if;
 insert into private.four_list_folds(engagement_id,session_id,survivor_id,member_id,made_by,detail) values(me.engagement_id,me.session_id,target,p_card,'words',jsonb_build_object('same_words',true));
 return target;
end $$;

-- Every card, however it arrives, records its column and words; a new one folds by words. Other kinds pass straight through.
-- Changing a card's text or column takes it out of any fold it was in.
create function private.four_lists_arrive() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_col text;
begin
 if not exists(select 1 from public.sessions s where s.id=new.session_id and s.interaction='four_lists') then return new; end if;
 v_col:=new.value->>'column';
 if v_col is null or v_col not in ('right','wrong','missing','confused') then return new; end if;
 insert into private.four_list_cards(submission_id,engagement_id,session_id,col,words) values(new.id,new.engagement_id,new.session_id,v_col,private.qa_words(new.text))
  on conflict(submission_id) do update set col=excluded.col,words=excluded.words;
 if tg_op='UPDATE' and (old.text is distinct from new.text or old.value is distinct from new.value) then
  update private.four_list_folds set undone_at=clock_timestamp() where (member_id=new.id or survivor_id=new.id) and undone_at is null and not deleted;
 end if;
 if tg_op='INSERT' and not new.withdrawn and not new.deleted then perform private.four_lists_fold_words(new.id); end if;
 return new;
end $$;
create trigger four_lists_arrive after insert or update of text,value on public.submissions for each row execute function private.four_lists_arrive();

-- ---------- The board: every number on screen, computed once ----------
-- One entry per standing group, ranked inside its column: agreement (people) high to low, then arrival.
-- Agreement counts each person once: those who agreed with any card in the group, and those who wrote a
-- card folded beneath the survivor, never the survivor's own writer.
-- p_all adds what only the facilitator sees: each fold's members and the hidden cards.
create function private.four_lists_board(p_session uuid,p_all boolean) returns jsonb
language sql stable security definer set search_path='' as $$
 with c as (
  select x.id,x.attendee_id,x.text,x.hidden,coalesce(x.server_received_at,x.created_at) as at,k.col,k.pinned,m.id as merge_id,m.survivor_id,m.made_by
  from public.submissions x join private.four_list_cards k on k.submission_id=x.id and not k.deleted
  left join private.four_list_folds m on m.member_id=x.id and m.undone_at is null and not m.deleted
  where x.session_id=p_session and not x.deleted and not x.withdrawn
 ), standing as (select * from c where not hidden
 ), rooted as (
  select s.*,case when s.survivor_id is not null and exists(select 1 from standing r where r.id=s.survivor_id) then s.survivor_id else s.id end as root from standing s
 ), grouped as (
  select r.root,count(*)::integer-1 as folded,bool_or(r.made_by='ai' and r.id<>r.root) as ai,
   jsonb_agg(r.id order by r.at,r.id) as ids,
   jsonb_agg(jsonb_build_object('id',r.id,'text',r.text,'merge',r.merge_id,'by',r.made_by) order by r.at,r.id) filter (where r.id<>r.root) as members
  from rooted r group by r.root
 ), people as (
  select r.root,v.attendee_id from private.four_list_agrees v join rooted r on r.id=v.card_id where v.agreed and not v.deleted
  union select r.root,r.attendee_id from rooted r where r.id<>r.root
 ), counted as (
  select p.root,count(distinct p.attendee_id)::integer as agree from people p join standing rt on rt.id=p.root where p.attendee_id is distinct from rt.attendee_id group by p.root
 ), ranked as (
  select g.*,rt.col,rt.text,rt.pinned,rt.at,coalesce(n.agree,0) as agree,
   row_number() over(partition by rt.col order by coalesce(n.agree,0) desc,rt.at,rt.id) as rank
  from grouped g join standing rt on rt.id=g.root left join counted n on n.root=g.root
 )
 select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',l.root,'column',l.col,'text',l.text,'agree',l.agree,'folded',l.folded,'ai',case when l.ai then true end,
   'pinned',case when l.pinned then true end,'ids',l.ids,'rank',l.rank,'at',(extract(epoch from l.at)*1000)::bigint,
   'members',case when p_all then coalesce(l.members,'[]'::jsonb) end))
   order by array_position(array['right','wrong','missing','confused'],l.col),l.rank),'[]'::jsonb)
  ||case when p_all then coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'column',h.col,'text',h.text,'agree',0,'folded',0,'ids',jsonb_build_array(h.id),'hidden',true,
     'pinned',h.pinned,'members','[]'::jsonb,'at',(extract(epoch from h.at)*1000)::bigint) order by h.at desc,h.id)
     from (select * from c where hidden and survivor_id is null order by at desc limit 100) h),'[]'::jsonb)
   else '[]'::jsonb end
 from ranked l
$$;

-- ---------- The kind's own functions ----------
create function private.parse_four_lists(p_session public.sessions,p_text text,p_value jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t text:=btrim(coalesce(p_text,'')); key text;
begin
 if jsonb_typeof(p_value) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_value) k where k<>'column')
  or p_value->>'column' is null or p_value->>'column' not in ('right','wrong','missing','confused') or length(t)=0 then return jsonb_build_object('status','invalid_answer'); end if;
 if length(t)>least(p_session.max_characters,280) then return jsonb_build_object('status','limit'); end if;
 if private.screen_text(t) then return jsonb_build_object('status','filtered'); end if;
 key:=coalesce(nullif(array_to_string(private.qa_words(t),' '),''),btrim(regexp_replace(lower(t),'[^[:alnum:][:space:]]','','g')),'');
 if key='' then key:=lower(t); end if;
 return jsonb_build_object('status','ok','text',t,'answers',jsonb_build_array(jsonb_build_object('text',t,'key',key)),'value',jsonb_build_object('column',p_value->>'column'));
end $$;

-- The count is the cards written (folded ones included); people are those who wrote them. The room gets the
-- top twelve of each column, with how many groups each column holds, so the TV can say how many more wait on phones.
create function private.results_four_lists(p_engagement uuid,p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$
 with b as (select e from jsonb_array_elements(private.four_lists_board(p_session,false)) e)
 select jsonb_build_object('total',(select coalesce(sum(1+(e->>'folded')::integer),0) from b)::integer,
  'people',(select count(distinct x.attendee_id) from public.submissions x where x.engagement_id=p_engagement and x.session_id=p_session and not x.deleted and not x.withdrawn and not x.hidden)::integer,
  'columns',jsonb_build_object('right',(select count(*) from b where e->>'column'='right'),'wrong',(select count(*) from b where e->>'column'='wrong'),
   'missing',(select count(*) from b where e->>'column'='missing'),'confused',(select count(*) from b where e->>'column'='confused')),
  'ai',private.ai_on(p_session),
  'cards',(select coalesce(jsonb_agg(e),'[]'::jsonb) from b where (e->>'rank')::integer<=12))
$$;
-- One setting: whether AI may fold similar cards (default on).
create function private.options_four_lists(p jsonb,p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select case when jsonb_typeof(p)='object' and not exists(select 1 from jsonb_object_keys(p) k where k<>'ai') and coalesce(jsonb_typeof(p->'ai'),'boolean')='boolean'
  then jsonb_strip_nulls(jsonb_build_object('ai',case when p ? 'ai' then (p->>'ai')::boolean end)) end
$$;
create function private.items_four_lists(p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('key',e->>'id','text',e->>'text','count',(e->>'agree')::integer,'hidden',coalesce((e->>'hidden')::boolean,false))),'[]'::jsonb)
 from jsonb_array_elements(private.four_lists_board(p_session,true)) e
$$;

-- ---------- Agreeing ----------
-- One agree per person per card, toggled, never on a card the person wrote (or one folded with theirs). It follows the
-- step's answer rules: while it is live and phones are up, while it takes late answers, in a self-paced window, or queued
-- before it closed and arriving within 2 minutes.
create function private.four_lists_agree(p_engagement uuid,p_id uuid,p_card uuid,p_revision integer,p_on boolean,p_sent timestamptz,p_queued timestamptz,p_uncertainty double precision) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; s public.sessions; q public.submissions; v private.four_list_agrees; who uuid; root uuid; received timestamptz:=clock_timestamp(); accepting boolean; vid uuid; rev integer;
begin
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if private.live_role(p_engagement) is distinct from 'participant' then return jsonb_build_object('status','denied'); end if;
 select id into who from public.attendees where engagement_id=p_engagement and id in(select private.room_attendee_ids());
 if who is null or r.engagement_id is null then return jsonb_build_object('status','denied'); end if;
 if p_id is null or p_card is null or p_on is null or p_revision is null or p_revision not between 0 and 1000000 or p_sent is null or not isfinite(p_sent)
   or (p_queued is not null and not isfinite(p_queued)) or p_uncertainty is null or p_uncertainty not between 0 and 60000 or p_uncertainty='NaN'::float8
   or p_sent>received+interval '1 minute' or p_queued>received+interval '1 minute' then return jsonb_build_object('status','invalid_request'); end if;
 select x.* into q from public.submissions x join public.sessions y on y.id=x.session_id and y.interaction='four_lists' and not y.deleted
  join private.four_list_cards k on k.submission_id=x.id and not k.deleted
  where x.id=p_card and x.engagement_id=p_engagement and not x.deleted;
 if q.id is null or q.withdrawn or q.hidden then return jsonb_build_object('status','missing'); end if;
 select * into s from public.sessions where id=q.session_id;
 accepting:=case when s.mode='self_paced' then s.state<>'draft' and private.session_state(s,received)='open'
  when r.live_session_id=s.id then s.state='live' and not r.phones_down and (r.burst_ends_at is null or r.burst_ends_at>received)
  else s.state='open' and s.mode='live' end;
 if not accepting and not (p_queued is not null and s.mode='live' and s.state='closed' and s.closed_at is not null and p_queued<=s.closed_at and p_sent<=s.closed_at
   and received<=s.closed_at+interval '2 minutes') then return jsonb_build_object('status','closed'); end if;
 root:=private.four_lists_root(p_card);
 if exists(select 1 from public.submissions x where x.attendee_id=who and not x.deleted and not x.withdrawn and not x.hidden and (x.id=root or x.id=p_card or x.id in(
   select m.member_id from private.four_list_folds m where m.survivor_id=root and m.undone_at is null and not m.deleted))) then return jsonb_build_object('status','own'); end if;
 select * into v from private.four_list_agrees where id=p_id;
 if found then
  if v.attendee_id<>who or v.card_id<>p_card or v.engagement_id<>p_engagement or v.deleted then return jsonb_build_object('status','conflict'); end if;
  if p_revision<=v.revision then return jsonb_build_object('status','duplicate','id',p_id,'revision',v.revision,'agreed',v.agreed,'version',r.version); end if;
  if p_revision<>v.revision+1 then return jsonb_build_object('status','conflict'); end if;
  update private.four_list_agrees set agreed=p_on,revision=p_revision,phone_sent_at=p_sent,queued_at=p_queued,server_received_at=received where id=p_id;
  vid:=p_id; rev:=p_revision;
 else
  select * into v from private.four_list_agrees where card_id=p_card and attendee_id=who and not deleted;
  if found then
   -- The same person on another phone: their latest press wins, on their one agree.
   update private.four_list_agrees set agreed=p_on,revision=v.revision+1,phone_sent_at=p_sent,queued_at=p_queued,server_received_at=received where id=v.id;
   vid:=v.id; rev:=v.revision+1;
  elsif p_revision<>0 then return jsonb_build_object('status','conflict');
  else
   insert into private.four_list_agrees(id,engagement_id,session_id,card_id,attendee_id,agreed,revision,phone_sent_at,queued_at,server_received_at)
    values(p_id,p_engagement,s.id,p_card,who,p_on,0,p_sent,p_queued,received);
   vid:=p_id; rev:=0;
  end if;
 end if;
 update public.room_states set results=private.live_results(p_engagement) where engagement_id=p_engagement returning * into r;
 return jsonb_build_object('status','accepted','id',vid,'revision',rev,'agreed',p_on,'version',r.version);
end $$;

-- A phone's own agrees, so it can show and toggle them after a reload or on a new phone. With a session, also the
-- cards a self-paced phone agrees with (the same top twelve per column the TV gets), because that phone has no live frame.
create function private.four_lists_my_agrees(p_engagement uuid,p_session uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare who uuid; s public.sessions;
begin
 if private.live_role(p_engagement) is distinct from 'participant' then return jsonb_build_object('status','denied'); end if;
 select id into who from public.attendees where engagement_id=p_engagement and id in(select private.room_attendee_ids());
 if who is null then return jsonb_build_object('status','denied'); end if;
 if p_session is not null then select * into s from public.sessions where id=p_session and engagement_id=p_engagement and not deleted and interaction='four_lists' and state<>'draft'; end if;
 return jsonb_build_object('status','ok','server_time',clock_timestamp(),
  'agrees',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'card_id',v.card_id,'agreed',v.agreed,'revision',v.revision) order by v.created_at,v.id)
   from (select * from private.four_list_agrees where engagement_id=p_engagement and attendee_id=who and not deleted order by created_at,id limit 2000) v),'[]'::jsonb),
  'mine',coalesce((select jsonb_agg(x.id order by x.id) from public.submissions x where x.engagement_id=p_engagement and x.attendee_id=who and not x.deleted and not x.withdrawn and x.session_id in
   (select y.id from public.sessions y where y.engagement_id=p_engagement and y.interaction='four_lists' and not y.deleted)),'[]'::jsonb),
  'cards',case when s.id is not null then (select coalesce(jsonb_agg(e),'[]'::jsonb) from jsonb_array_elements(private.four_lists_board(s.id,false)) e where (e->>'rank')::integer<=12) end);
end $$;

-- ---------- The facilitator's controls ----------
-- AI on and off, Undo last AI change (everything the latest fold run did), Undo fold, Pin and Unpin a card, Hide and Unhide a card.
-- Room row lock first, facilitator check, the press id for idempotency, one version raise.
create function private.four_lists_control(p_engagement uuid,p_id uuid,p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; done private.room_controls; s public.sessions; m private.four_list_folds; q public.submissions; run private.ai_runs; k private.four_list_cards;
 me uuid:=private.clearway_user_id(); logged text; before boolean; t timestamptz:=clock_timestamp(); who text; v_ids uuid[]; v_uuid text:='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'; v_ref text;
begin
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if r.engagement_id is null or not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 if p_id is null or p_action is null or jsonb_typeof(p) is distinct from 'object' or p_action not in ('ai_on','ai_off','undo_last','undo_fold','pin','unpin','hide','unhide') then
  return jsonb_build_object('status','invalid_request'); end if;
 logged:=case p_action when 'ai_on' then 'turn_ai_on' when 'ai_off' then 'turn_ai_off' when 'undo_last' then 'undo_last_ai_change' when 'undo_fold' then 'undo_fold'
  when 'pin' then 'pin_card' when 'unpin' then 'unpin_card' when 'hide' then 'hide_card' else 'unhide_card' end;
 select * into done from private.room_controls where id=p_id;
 if found then
  if done.engagement_id<>p_engagement or done.action<>logged then return jsonb_build_object('status','conflict'); end if;
  return jsonb_build_object('status','duplicate','version',r.version);
 end if;
 if p_action in ('ai_on','ai_off','undo_last') then
  v_ref:=p->>'session';
  if v_ref is null or v_ref !~ v_uuid then return jsonb_build_object('status','invalid_request'); end if;
  select * into s from public.sessions where id=v_ref::uuid and engagement_id=p_engagement and not deleted and interaction='four_lists';
  if s.id is null then return jsonb_build_object('status','missing'); end if;
  insert into private.ai_sessions(session_id,engagement_id) values(s.id,s.engagement_id) on conflict(session_id) do nothing;
  perform 1 from private.ai_sessions where session_id=s.id for update;
  if p_action in ('ai_on','ai_off') then
   if p_action='ai_on' and not exists(select 1 from public.engagements where id=p_engagement and settings->>'ai_enabled'='true') then return jsonb_build_object('status','engagement_off'); end if;
   before:=private.ai_on(s.id);
   update private.ai_sessions set ai=(p_action='ai_on') where session_id=s.id;
   if before=private.ai_on(s.id) then return jsonb_build_object('status','unchanged','version',r.version); end if;
  else
   select * into run from private.ai_runs where session_id=s.id and job='fold_four_lists' and status='ok' and changed and undone_at is null and not deleted order by created_at desc limit 1;
   if run.id is null then return jsonb_build_object('status','unchanged','version',r.version); end if;
   update private.four_list_folds set undone_at=t,undone_by=me where made_by='ai' and detail->>'run'=run.id::text and undone_at is null;
   update private.ai_runs set undone_at=t,undone_by=me where id=run.id;
  end if;
 elsif p_action='undo_fold' then
  if p->>'merge' is null or p->>'merge' !~ v_uuid then return jsonb_build_object('status','invalid_request'); end if;
  select * into m from private.four_list_folds where id=(p->>'merge')::uuid and engagement_id=p_engagement and not deleted;
  if m.id is null then return jsonb_build_object('status','missing'); end if;
  if m.undone_at is not null then return jsonb_build_object('status','unchanged','version',r.version); end if;
  update private.four_list_folds set undone_at=t,undone_by=me where id=m.id;
 else
  if p->>'card' is null or p->>'card' !~ v_uuid then return jsonb_build_object('status','invalid_request'); end if;
  select x.* into q from public.submissions x join public.sessions y on y.id=x.session_id and y.interaction='four_lists' and not y.deleted
   where x.id=(p->>'card')::uuid and x.engagement_id=p_engagement and not x.deleted and not x.withdrawn;
  if q.id is null then return jsonb_build_object('status','missing'); end if;
  select * into k from private.four_list_cards where submission_id=q.id and not deleted;
  if k.submission_id is null then return jsonb_build_object('status','missing'); end if;
  if p_action in ('pin','unpin') then
   if k.pinned=(p_action='pin') then return jsonb_build_object('status','unchanged','version',r.version); end if;
   update private.four_list_cards set pinned=(p_action='pin'),pinned_by=case when p_action='pin' then me end where submission_id=q.id;
  else
   -- A group hides and comes back as a whole, so its folded cards never pop out alone.
   update public.submissions x set hidden=(p_action='hide') where x.hidden is distinct from (p_action='hide') and (x.id=q.id or x.id in(
    select mm.member_id from private.four_list_folds mm where mm.survivor_id=q.id and mm.undone_at is null and not mm.deleted));
   if not found then return jsonb_build_object('status','unchanged','version',r.version); end if;
   if r.live_session_id=q.session_id then
    v_ids:=coalesce((select array_agg(x.id order by x.id) from public.submissions x where x.session_id=q.session_id and x.hidden and not x.deleted),array[]::uuid[]);
   else v_ids:=r.hidden_ids; end if;
  end if;
 end if;
 update public.room_states set hidden_ids=coalesce(v_ids,hidden_ids),results=private.live_results(p_engagement) where engagement_id=p_engagement returning * into r;
 insert into private.room_controls(id,engagement_id,actor_id,action,session_id,room_version,created_at) values(p_id,p_engagement,me,logged,r.live_session_id,r.version,t);
 select split_part(btrim(name),' ',1) into who from public.clearway_users where id=me;
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','control','id',p_id,'action',logged,'by',who,'version',r.version,'changed',true));
 return jsonb_build_object('status','ok','version',r.version);
exception when invalid_text_representation then return jsonb_build_object('status','invalid_request');
end $$;

-- The control surface's Four Helpful Lists panel: the live step, or the one asked for. Every card with its folds, pins and
-- hidden state. Facilitators only; the person on a card never appears.
create function private.four_lists_status(p_engagement uuid,p_session uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.room_states; s public.sessions; list jsonb;
begin
 if not coalesce(private.show_allowed(p_engagement),false) or private.live_role(p_engagement) is distinct from 'facilitator' then return jsonb_build_object('status','denied'); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted;
 if r.engagement_id is null then return jsonb_build_object('status','missing'); end if;
 if p_session is not null then select * into s from public.sessions where id=p_session and engagement_id=p_engagement and not deleted and interaction='four_lists'; end if;
 if s.id is null then select * into s from public.sessions where id=r.live_session_id and not deleted and interaction='four_lists'; end if;
 if s.id is null then return jsonb_build_object('status','ok','version',r.version,'session',null,'cards','[]'::jsonb); end if;
 list:=private.four_lists_board(s.id,true);
 return jsonb_build_object('status','ok','version',r.version,'session',jsonb_build_object('id',s.id,'title',s.title,'state',s.state,'live',s.id=r.live_session_id),'cards',list,
  'counts',jsonb_build_object('cards',(select coalesce(sum(1+(e->>'folded')::integer),0) from jsonb_array_elements(list) e where not coalesce((e->>'hidden')::boolean,false)),
   'folded',(select coalesce(sum((e->>'folded')::integer),0) from jsonb_array_elements(list) e),
   'hidden',(select count(*) from jsonb_array_elements(list) e where coalesce((e->>'hidden')::boolean,false))));
end $$;

-- ---------- SET-05: the facilitator's review ----------
-- Every Four Helpful Lists step of the engagement, every card by column with its agreement count (people) and its fold.
-- Read only. Facilitators and admins (the run of show's own rule). It names no one.
create function private.four_lists_review(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare e public.engagements;
begin
 if not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 select * into e from public.engagements where id=p_engagement and not deleted;
 if e.id is null then return jsonb_build_object('status','missing'); end if;
 return jsonb_build_object('status','ok','engagement',jsonb_build_object('id',e.id,'title',e.title),
  'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'part',s.part,'state',s.state,'cards',private.four_lists_board(s.id,true),
    'people',(select count(distinct x.attendee_id) from public.submissions x where x.session_id=s.id and not x.deleted and not x.withdrawn))
    order by private.part_order(s.part),s.position,s.id) from public.sessions s where s.engagement_id=p_engagement and s.interaction='four_lists' and not s.deleted),'[]'::jsonb));
end $$;

-- ---------- The cards contract (steps 2 and 3) ----------
-- One row per visible card that has not been folded away: its id, its step, its column, its text, how many people agree,
-- and the ids of the cards folded into it. Hidden, withdrawn and deleted cards are not rows. Service role only: Discover
-- themes read it on the server and never hand a person to a screen.
create function private.four_lists_cards_for_themes(p_engagement uuid) returns table(card_id uuid,session_id uuid,"column" text,"text" text,agree integer,folded_ids uuid[])
language sql stable security definer set search_path='' as $$
 select (e->>'id')::uuid,s.id,e->>'column',e->>'text',(e->>'agree')::integer,
  coalesce((select array_agg(i::uuid order by i) from jsonb_array_elements_text(e->'ids') i where i<>e->>'id'),array[]::uuid[])
 from public.sessions s cross join lateral jsonb_array_elements(private.four_lists_board(s.id,false)) e
 where s.engagement_id=p_engagement and s.interaction='four_lists' and not s.deleted
 order by s.id,array_position(array['right','wrong','missing','confused'],e->>'column'),(e->>'rank')::integer
$$;

-- ---------- AI: the shared functions, extended ----------
create or replace function private.ai_on(p_session uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select coalesce(e.settings->>'ai_enabled','false')='true'
   and (s.interaction in ('word_cloud','wall','qa','candidates','lens_summary','four_lists') or (s.interaction='grid' and s.options->>'preset'='pre_mortem') or (s.interaction='lens' and coalesce(s.options->>'seed','false')<>'true'))
   and coalesce(a.ai,case when jsonb_typeof(s.options->'ai')='boolean' then (s.options->>'ai')::boolean end,true)
  from public.sessions s join public.engagements e on e.id=s.engagement_id and not e.deleted
  left join private.ai_sessions a on a.session_id=s.id and not a.deleted
  where s.id=p_session and not s.deleted),false)
$$;

alter function private.ai_claim(uuid,uuid,text,jsonb) rename to ai_claim_base4;
alter function private.ai_apply(uuid,uuid,jsonb,jsonb) rename to ai_apply_base4;
alter function private.ai_fail(uuid,uuid,text,jsonb) rename to ai_fail_base3;
alter function private.ai_status(uuid,uuid) rename to ai_status_base;
alter function private.ai_control(uuid,uuid,text,jsonb) rename to ai_control_base;

-- The fold job: cards in the same column, at least two, when a card has arrived that no earlier claim saw.
-- A pinned card is left out, so the model never sees what it may not change.
create function private.ai_claim(p_session uuid,p_lease uuid,p_model text,p_versions jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.sessions; a private.ai_sessions; t timestamptz:=clock_timestamp(); v_inputs jsonb; v_run uuid;
begin
 select * into s from public.sessions where id=p_session and not deleted;
 if s.id is null or s.interaction<>'four_lists' then return private.ai_claim_base4(p_session,p_lease,p_model,p_versions); end if;
 if p_lease is null or p_model is null or length(p_model) not between 1 and 100 or jsonb_typeof(p_versions) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 if not private.ai_on(s.id) or s.state not in ('live','phones_down','open') then return jsonb_build_object('status','off'); end if;
 insert into private.ai_sessions(session_id,engagement_id) values(s.id,s.engagement_id) on conflict(session_id) do nothing;
 select * into a from private.ai_sessions where session_id=s.id for update;
 if a.lease_id is not null and a.lease_until>t then return jsonb_build_object('status','busy'); end if;
 -- A failed call cools down for ten seconds, so an outage never hammers the API.
 if a.last_failed_at is not null and a.last_failed_at>t-interval '10 seconds' and (a.last_ok_at is null or a.last_failed_at>a.last_ok_at) then
  return jsonb_build_object('status','cooling','ms',(extract(epoch from a.last_failed_at+interval '10 seconds'-t)*1000)::integer); end if;
 if a.lease_run is not null then update private.ai_runs set status='stale',finished_at=t where id=a.lease_run and status='running'; end if;
 if a.fold_seen_at is null or exists(select 1 from public.submissions x join private.four_list_cards k on k.submission_id=x.id and not k.deleted
   where x.session_id=s.id and not x.deleted and not x.withdrawn and not x.hidden and not x.id=any(a.fold_seen_ids)) then
  select jsonb_build_object('columns',coalesce(jsonb_agg(jsonb_build_object('column',z.col,'label',z.label,'cards',z.cards) order by z.ord),'[]'::jsonb)) into v_inputs
  from (
   select n.col,array_position(array['right','wrong','missing','confused'],n.col) as ord,
    case n.col when 'right' then 'What''s right?' when 'wrong' then 'What''s wrong?' when 'missing' then 'What''s missing?' else 'What''s confused?' end as label,
    jsonb_agg(jsonb_build_object('ref',left(n.col,1)||n.o,'id',n.id,'text',n.text,'agree',n.agree) order by n.o) as cards
   from (
    select kept.col,kept.id,kept.text,kept.agree,row_number() over(partition by kept.col order by kept.at,kept.id) as o
    from (
     select e->>'column' as col,e->>'id' as id,e->>'text' as text,(e->>'agree')::integer as agree,(e->>'at')::bigint as at,
      row_number() over(partition by e->>'column' order by (e->>'at')::bigint desc,e->>'id') as newest
     from jsonb_array_elements(private.four_lists_board(s.id,false)) e where not coalesce((e->>'pinned')::boolean,false)
    ) kept where kept.newest<=40
   ) n group by n.col having count(*)>=2
  ) z;
  if jsonb_array_length(coalesce(v_inputs->'columns','[]'::jsonb))=0 then v_inputs:=null; end if;
 end if;
 if v_inputs is null then return jsonb_build_object('status','idle'); end if;
 if coalesce(p_versions->>'fold_four_lists','') !~ '^[a-z0-9_.@-]{1,60}$' then return jsonb_build_object('status','invalid_request'); end if;
 update private.ai_sessions set fold_seen_at=t,fold_seen_ids=array(select x.id from public.submissions x join private.four_list_cards k on k.submission_id=x.id and not k.deleted
   where x.session_id=s.id and not x.deleted and not x.withdrawn and not x.hidden order by x.id) where session_id=s.id;
 insert into private.ai_runs(engagement_id,session_id,job,model,prompt_version,inputs,created_at) values(s.engagement_id,s.id,'fold_four_lists',p_model,p_versions->>'fold_four_lists',v_inputs,t) returning id into v_run;
 update private.ai_sessions set lease_id=p_lease,lease_run=v_run,lease_until=t+interval '45 seconds' where session_id=s.id;
 return jsonb_build_object('status','claimed','run',v_run,'job','fold_four_lists','prompt_version',p_versions->>'fold_four_lists','inputs',v_inputs);
end $$;

-- The model's folds under the limits in code: refs only from the run, one column, at least two cards and at most four to a fold,
-- no quotes, no number dropped, nothing pinned, nothing whose fold a facilitator undid, and at least 60 percent of the cards
-- left standing. Applied folds are marked AI and reach the TV as one version.
create function private.ai_apply(p_run uuid,p_lease uuid,p_output jsonb,p_usage jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run private.ai_runs; a private.ai_sessions; r public.room_states; s public.sessions; t timestamptz:=clock_timestamp(); v_ms integer;
 applied jsonb:='[]'::jsonb; refused jsonb:='[]'::jsonb; v_changed boolean:=false; g jsonb; refs jsonb; cur jsonb; reason text; survivor jsonb; members jsonb; member jsonb;
 before integer; standing integer; used text[]:=array[]::text[];
begin
 select * into run from private.ai_runs where id=p_run;
 if run.id is null or run.job<>'fold_four_lists' then return private.ai_apply_base4(p_run,p_lease,p_output,p_usage); end if;
 if p_lease is null then return jsonb_build_object('status','invalid_request'); end if;
 if run.engagement_id='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(run.engagement_id::text,7)); end if;
 -- The room row first, as every writer takes it, then the session's lease.
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
 -- Refs to the cards as the run saw them; the board as it stands now.
 select coalesce(jsonb_object_agg(c->>'ref',c||jsonb_build_object('column',col->>'column')),'{}'::jsonb) into refs
  from jsonb_array_elements(case when jsonb_typeof(run.inputs->'columns')='array' then run.inputs->'columns' else '[]'::jsonb end) col
  cross join lateral jsonb_array_elements(col->'cards') c;
 select coalesce(jsonb_object_agg(e->>'id',e),'{}'::jsonb) into cur from jsonb_array_elements(private.four_lists_board(run.session_id,false)) e;
 select count(*) into before from jsonb_object_keys(cur);
 standing:=before;
 for g in select v from jsonb_array_elements(case when jsonb_typeof(p_output->'groups')='array' then p_output->'groups' else '[]'::jsonb end) v limit 100 loop
  reason:=null; survivor:=refs->(g->>'survivor');
  members:=case when jsonb_typeof(g->'members')='array' then g->'members' else '[]'::jsonb end;
  if jsonb_typeof(g) is distinct from 'object' or survivor is null or jsonb_array_length(members)=0
    or exists(select 1 from jsonb_array_elements(members) x where jsonb_typeof(x)<>'string' or not refs ? (x#>>'{}') or x#>>'{}'=g->>'survivor')
    or (select count(distinct x#>>'{}') from jsonb_array_elements(members) x)<>jsonb_array_length(members)
    or g->>'survivor'=any(used) or exists(select 1 from jsonb_array_elements_text(members) x where x=any(used)) then reason:='unknown';
  elsif 1+jsonb_array_length(members)>4 then reason:='too_many';
  elsif not cur ? (survivor->>'id') then reason:='gone';
  elsif coalesce((cur->(survivor->>'id')->>'pinned')::boolean,false) then reason:='pinned';
  elsif private.ai_quoted(cur->(survivor->>'id')->>'text') then reason:='quote';
  else
   for member in select refs->x from jsonb_array_elements_text(members) x loop
    if not cur ? (member->>'id') or (cur->(member->>'id')->>'folded')::integer>0 then reason:='gone';
    elsif cur->(member->>'id')->>'column' is distinct from cur->(survivor->>'id')->>'column' then reason:='column';
    elsif coalesce((cur->(member->>'id')->>'pinned')::boolean,false) then reason:='pinned';
    elsif exists(select 1 from private.four_list_folds m where m.member_id=(member->>'id')::uuid and not m.deleted) then reason:='kept_apart';
    elsif private.ai_quoted(cur->(member->>'id')->>'text') then reason:='quote';
    elsif not private.ai_numbers(cur->(member->>'id')->>'text')<@private.ai_numbers(cur->(survivor->>'id')->>'text') then reason:='number';
    end if;
    exit when reason is not null;
   end loop;
   if reason is null and standing-jsonb_array_length(members)<0.6*before then reason:='standing'; end if;
  end if;
  if reason is null then
   insert into private.four_list_folds(engagement_id,session_id,survivor_id,member_id,made_by,detail,created_at)
    select run.engagement_id,run.session_id,(survivor->>'id')::uuid,(refs->x->>'id')::uuid,'ai',jsonb_build_object('run',run.id,'model',run.model,'prompt_version',run.prompt_version),t
    from jsonb_array_elements_text(members) x;
   standing:=standing-jsonb_array_length(members); v_changed:=true;
   used:=used||(g->>'survivor')||array(select jsonb_array_elements_text(members));
   applied:=applied||jsonb_build_array(jsonb_build_object('survivor',survivor->>'id','members',(select jsonb_agg(refs->x->>'id') from jsonb_array_elements_text(members) x)));
  else refused:=refused||jsonb_build_array(jsonb_build_object('group',g,'reason',reason)); end if;
 end loop;
 update private.ai_runs set status='ok',changed=v_changed,finished_at=t,ms=v_ms,output=jsonb_build_object('result',p_output,'applied',applied,'refused',refused),
  input_tokens=private.ai_usage(p_usage,'input_tokens',10000000)::integer,output_tokens=private.ai_usage(p_usage,'output_tokens',10000000)::integer,
  cost_usd=private.ai_usage(p_usage,'cost_usd',1000) where id=run.id;
 -- One version raise: the folds reach every screen as their own event.
 if v_changed and r.live_session_id=run.session_id then
  update public.room_states set results=private.live_results(run.engagement_id) where engagement_id=run.engagement_id;
 end if;
 return jsonb_build_object('status','ok','changed',v_changed,'applied',jsonb_array_length(applied),'refused',jsonb_array_length(refused));
end $$;

-- A failed fold sends its watermark back, so the work is tried again after the cool-down.
create function private.ai_fail(p_run uuid,p_lease uuid,p_error text,p_usage jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare out jsonb; j text; sid uuid;
begin
 select job,session_id into j,sid from private.ai_runs where id=p_run;
 out:=private.ai_fail_base3(p_run,p_lease,p_error,p_usage);
 if j='fold_four_lists' and out->>'status'='ok' then update private.ai_sessions set fold_seen_at=null where session_id=sid; end if;
 return out;
end $$;

-- The AI panel for a Four Helpful Lists step: the state every AI step has, plus the AI folds with their undo.
create function private.ai_status(p_engagement uuid,p_session uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.room_states; s public.sessions; a private.ai_sessions; t timestamptz:=clock_timestamp(); running private.ai_runs; last_change private.ai_runs; out jsonb;
begin
 out:=private.ai_status_base(p_engagement,p_session);
 if out->>'status' is distinct from 'ok' then return out; end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted;
 if p_session is not null then select * into s from public.sessions where id=p_session and engagement_id=p_engagement and not deleted; end if;
 if s.id is null then select * into s from public.sessions where id=r.live_session_id and not deleted; end if;
 if s.id is null or s.interaction<>'four_lists' then return out; end if;
 select * into a from private.ai_sessions where session_id=s.id and not deleted;
 if a.lease_run is not null and a.lease_until>t then select * into running from private.ai_runs where id=a.lease_run; end if;
 select * into last_change from private.ai_runs where session_id=s.id and job='fold_four_lists' and status='ok' and changed and undone_at is null and not deleted order by created_at desc limit 1;
 return out||jsonb_build_object('session',jsonb_build_object('id',s.id,'title',s.title,'interaction',s.interaction,'live',s.id=r.live_session_id,'ai',private.ai_on(s.id),
   'option',case when jsonb_typeof(s.options->'ai')='boolean' then (s.options->>'ai')::boolean else true end,'override',a.ai,'summary_available',false,'summary_shown',false),
  'state',jsonb_build_object('running',running.id is not null,'job',running.job,'running_ms',case when running.id is not null then (extract(epoch from t-running.created_at)*1000)::integer end,
   'last_ms',a.last_ms,'last_ok_at',a.last_ok_at,'last_failed_at',a.last_failed_at,
   'failing',a.last_failed_at is not null and (a.last_ok_at is null or a.last_failed_at>a.last_ok_at),
   'slow',(running.id is not null and t-running.created_at>interval '6 seconds') or (coalesce(a.last_ms,0)>6000 and a.last_ok_at>t-interval '2 minutes')),
  'last_change',case when last_change.id is not null then jsonb_build_object('run',last_change.id,'job',last_change.job,'at',last_change.created_at,'count',jsonb_array_length(coalesce(last_change.output->'applied','[]'::jsonb))) end,
  'folds',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'survivor',m.survivor_id,'member',m.member_id,
     'survivor_text',(select x.text from public.submissions x where x.id=m.survivor_id),'member_text',(select x.text from public.submissions x where x.id=m.member_id),
     'at',m.created_at,'undone',m.undone_at is not null) order by m.undone_at is not null,m.created_at desc,m.id)
    from (select * from private.four_list_folds where session_id=s.id and made_by='ai' and not deleted order by created_at desc limit 100) m),'[]'::jsonb));
end $$;

-- AI on, AI off and Undo last AI change reach a Four Helpful Lists step through the same press everything else uses.
create function private.ai_control(p_engagement uuid,p_id uuid,p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_ref text;
begin
 if p_action in ('ai_on','ai_off','undo_last') and jsonb_typeof(p)='object' then
  v_ref:=p->>'session';
  if v_ref ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
   if exists(select 1 from public.sessions where id=v_ref::uuid and engagement_id=p_engagement and interaction='four_lists' and not deleted) then
    return private.four_lists_control(p_engagement,p_id,p_action,p);
   end if;
  end if;
 end if;
 return private.ai_control_base(p_engagement,p_id,p_action,p);
end $$;

-- ---------- Practice room and rehearsal ----------
alter function private.reset_practice_room() rename to reset_practice_room_base;
alter function private.rehearsal_control(uuid,uuid,text) rename to rehearsal_control_base;

-- The practice room's reset also clears every card, fold and agree.
create function private.reset_practice_room() returns boolean
language plpgsql security definer set search_path='' as $$
declare eng uuid:='90000000-0000-4000-8000-000000000010'::uuid; ok boolean;
begin
 ok:=private.reset_practice_room_base();
 if ok then
  update private.four_list_agrees set deleted=true where engagement_id=eng and not deleted;
  update private.four_list_folds set deleted=true where engagement_id=eng and not deleted;
  update private.four_list_cards set deleted=true where engagement_id=eng and not deleted;
 end if;
 return ok;
end $$;

-- Clear test answers also clears the cards a rehearsal made, the folds on them and the agrees it made (on any card),
-- then raises one version so the TV's counts recompute.
create function private.rehearsal_control(p_engagement uuid,p_id uuid,p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare out jsonb; cleared uuid[]; r public.room_states;
begin
 if p_action='clear' and p_engagement is not null then
  select coalesce(array_agg(id order by id),array[]::uuid[]) into cleared from public.submissions where engagement_id=p_engagement and test and not deleted;
 end if;
 out:=private.rehearsal_control_base(p_engagement,p_id,p_action);
 if p_action='clear' and out->>'status'='ok' then
  update private.four_list_folds set deleted=true where engagement_id=p_engagement and not deleted and (survivor_id=any(cleared) or member_id=any(cleared));
  update private.four_list_agrees set deleted=true where engagement_id=p_engagement and not deleted and (test or card_id=any(cleared));
  update private.four_list_cards set deleted=true where engagement_id=p_engagement and not deleted and submission_id=any(cleared);
  update public.room_states set results=private.live_results(p_engagement) where engagement_id=p_engagement returning * into r;
  out:=out||jsonb_build_object('version',r.version);
 end if;
 return out;
end $$;

-- ---------- Public wrappers (the signed-in caller's own rights) ----------
create function public.four_lists_agree(p_engagement uuid,p_id uuid,p_card uuid,p_revision integer,p_on boolean,p_sent timestamptz,p_queued timestamptz default null,p_uncertainty double precision default 0) returns jsonb
language sql security invoker set search_path='' as $$ select private.four_lists_agree(p_engagement,p_id,p_card,p_revision,p_on,p_sent,p_queued,p_uncertainty) $$;
create function public.four_lists_my_agrees(p_engagement uuid,p_session uuid default null) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.four_lists_my_agrees(p_engagement,p_session) $$;
create function public.four_lists_control(p_engagement uuid,p_id uuid,p_action text,p jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.four_lists_control(p_engagement,p_id,p_action,p) $$;
create function public.four_lists_status(p_engagement uuid,p_session uuid default null) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.four_lists_status(p_engagement,p_session) $$;
create function public.four_lists_review(p_engagement uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.four_lists_review(p_engagement) $$;

-- ---------- The Discover part ----------
-- Discover runs ahead of the Pre-call: the conversations and the Four Helpful Lists that feed What We Heard.
create or replace function private.part_order(p_part text) returns integer language sql immutable security invoker set search_path='' as $$
 select array_position(array['Discover','Pre-call','Day 1','Day 2','Follow-up'],p_part)
$$;

-- show_write, template_write and room_control (Close part) keep every line they have; only their part lists gain Discover. The earlier
-- definitions are read from the database and rewritten, so nothing else in either function can drift.
do $patch$
declare f text; def text; patched text;
begin
 foreach f in array array['private.show_write(uuid,text,jsonb)','private.template_write(text,jsonb)','private.room_control(uuid,uuid,text,jsonb)'] loop
  def:=pg_get_functiondef(f::regprocedure);
  patched:=replace(def,'''Pre-call'',''Day 1'',''Day 2'',''Follow-up''','''Discover'',''Pre-call'',''Day 1'',''Day 2'',''Follow-up''');
  if patched=def then raise exception 'The part list in % did not patch cleanly',f; end if;
  execute patched;
 end loop;
end $patch$;

-- Both shipped Wayfinding templates open with Discover: one live Four Helpful Lists step for the board or team, a week
-- before the pre-call. The facilitator can switch it to self-paced in the run of show. An engagement already started from a
-- template keeps its sessions; only new engagements start with the step.
update private.templates set sessions=$tpl$[
 {"title":"Four Helpful Lists","part":"Discover","position":0,"mode":"live","interaction":"four_lists","day":-7,"clock":"19:00","planned_minutes":30,"state":"ready","prompt":"Think about our church today. Add a card to any of the four lists, then agree with the cards that ring true for you.","phone_depth":"Pick a list, add what comes to mind in a few words, then agree with other people's cards. Cards are anonymous.","segment":"Four Helpful Lists","lands_in":"What We Heard","options":{},"settings":{"anonymous":true,"burst_minutes":5,"join_strip":false},"max_sends":12,"max_characters":140,"max_words":30,"team_led":false,"notes":"Run this with the board or team a week before the pre-call. It is live: everyone adds cards on their phones and agrees with the cards they share. Similar cards fold together, marked with the AI icon, and you can undo any fold. Switch it to self-paced in the run of show if the team can't be together. The cards feed Discover themes and the Four Helpful Lists page of What We Heard."}
]$tpl$::jsonb||sessions
 where id in ('c1ea0000-0000-4000-8000-000000000002','c1ea0000-0000-4000-8000-000000000003')
  and not exists(select 1 from jsonb_array_elements(sessions) e where e->>'part'='Discover');

-- ---------- Grants ----------
revoke all on function private.four_list_fold_check(),private.four_lists_root(uuid),private.four_lists_fold_words(uuid),private.four_lists_arrive(),private.four_lists_board(uuid,boolean),
 private.parse_four_lists(public.sessions,text,jsonb),private.results_four_lists(uuid,uuid,text[]),private.options_four_lists(jsonb,uuid),private.items_four_lists(uuid,text[]),
 private.four_lists_agree(uuid,uuid,uuid,integer,boolean,timestamptz,timestamptz,double precision),private.four_lists_my_agrees(uuid,uuid),private.four_lists_control(uuid,uuid,text,jsonb),
 private.four_lists_status(uuid,uuid),private.four_lists_review(uuid),private.four_lists_cards_for_themes(uuid),
  private.ai_claim_base4(uuid,uuid,text,jsonb),private.ai_apply_base4(uuid,uuid,jsonb,jsonb),private.ai_fail_base3(uuid,uuid,text,jsonb),private.ai_claim(uuid,uuid,text,jsonb),
 private.ai_apply(uuid,uuid,jsonb,jsonb),private.ai_fail(uuid,uuid,text,jsonb),private.ai_status_base(uuid,uuid),private.ai_control_base(uuid,uuid,text,jsonb),
 private.ai_status(uuid,uuid),private.ai_control(uuid,uuid,text,jsonb),private.reset_practice_room_base(),private.reset_practice_room(),
 private.rehearsal_control_base(uuid,uuid,text),private.rehearsal_control(uuid,uuid,text),
 public.four_lists_agree(uuid,uuid,uuid,integer,boolean,timestamptz,timestamptz,double precision),public.four_lists_my_agrees(uuid,uuid),public.four_lists_control(uuid,uuid,text,jsonb),
 public.four_lists_status(uuid,uuid),public.four_lists_review(uuid)
 from public,anon,authenticated;
-- A phone, the control surface and the setup page call these as the signed-in caller; the checks are inside.
grant execute on function private.four_lists_agree(uuid,uuid,uuid,integer,boolean,timestamptz,timestamptz,double precision),private.four_lists_my_agrees(uuid,uuid),
 private.four_lists_control(uuid,uuid,text,jsonb),private.four_lists_status(uuid,uuid),private.four_lists_review(uuid),
 private.ai_status(uuid,uuid),private.ai_control(uuid,uuid,text,jsonb),private.reset_practice_room(),private.rehearsal_control(uuid,uuid,text),
 public.four_lists_agree(uuid,uuid,uuid,integer,boolean,timestamptz,timestamptz,double precision),public.four_lists_my_agrees(uuid,uuid),public.four_lists_control(uuid,uuid,text,jsonb),
 public.four_lists_status(uuid,uuid),public.four_lists_review(uuid) to authenticated;
-- The worker's claim, apply and fail keep their grants (service role); the renamed originals are for the wrappers.
grant execute on function private.ai_claim(uuid,uuid,text,jsonb),private.ai_apply(uuid,uuid,jsonb,jsonb),private.ai_fail(uuid,uuid,text,jsonb),
 private.ai_claim_base4(uuid,uuid,text,jsonb),private.ai_apply_base4(uuid,uuid,jsonb,jsonb),private.ai_fail_base3(uuid,uuid,text,jsonb) to service_role;
-- The cards contract: Discover themes read it on the server, with the service role.
grant execute on function private.four_lists_cards_for_themes(uuid) to service_role;
commit;
