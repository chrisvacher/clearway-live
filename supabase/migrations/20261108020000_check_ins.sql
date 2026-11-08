-- Milestone 7, step 2: the 30, 60 and 90-day check-ins (AFT-04, AFT-05).
--
-- After the retreat each owner gets one email a round, at 30, 60 and 90 days, with a link (no sign-in) to a short check-in on their own
-- first steps (Done, Under way, Stuck, and a note) and their own goals (Not started, On track, At risk, Off track, Done, and what would help).
-- Rounds are made when the retreat closes (or by hand from the Check-ins page). A daily scheduled run on the server sends every due round, one
-- email a person, and never to a practice address. The facilitator reads every answer, follows up on stuck steps and sees who has not answered.
-- Nothing here reads or writes CORE.
--
-- New:
--   private.check_in_rounds, check_in_recipients, check_in_answers   forced row-level security, no browser grant
--   private.retreat_closed_on (the contract: a fixture until step 4 replaces it), check_in_latest_for_view (the contract for the read-only copy)
--   private.check_in_owned, check_in_make_rounds, check_in_after_status, check_in_editable   helpers and the trigger that makes rounds
--   private.check_in_state, check_in_create, check_in_switch, check_in_send_guard, check_in_follow_up, check_in_open_as   (facilitators)
--   private.check_in_claim_due, check_in_round_begin, check_in_round_save, check_in_recipient_result, check_in_round_finish   (the server's send)
--   private.check_in_phone_read, check_in_phone_save   (the phone page, called from the server with the service role)
--   public wrappers (security invoker) for each of the above that a browser role or the server calls
--
-- Shared objects touched, each a superset of its newest definition:
--   private.reset_practice_room    the newest wrapper (the report's, 20261108010000), renamed reset_practice_room_pre_check_ins and wrapped; clears the three tables
--   private.rehearsal_control      the newest wrapper (the report's, 20261108010000), renamed rehearsal_control_pre_check_ins and wrapped; Clear test answers clears them too
-- Not touched, on purpose: ai_runs checks (no AI here) and the live room (a check-in is a public page with its own token, not a room page).
begin;

-- ---------- Records ----------
create table private.check_in_rounds (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 day smallint not null check(day in(30,60,90)),
 due_on date not null,
 status text not null default 'scheduled' check(status in('scheduled','sending','sent','off')),
 sent_at timestamptz,
 sent_by text check(sent_by is null or sent_by='schedule' or sent_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
 claimed_at timestamptz,
 snapshot jsonb check(snapshot is null or (jsonb_typeof(snapshot)='object' and pg_column_size(snapshot)<=4096)),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(engagement_id,day),
 unique(id,engagement_id)
);
create index check_in_rounds_due_idx on private.check_in_rounds(due_on) where status in('scheduled','sending');

create table private.check_in_recipients (
 id uuid primary key default gen_random_uuid(),
 round_id uuid not null,
 engagement_id uuid not null references public.engagements(id),
 email text not null check(email=lower(btrim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'),
 name text not null check(length(btrim(name)) between 1 and 200),
 attendee_id uuid,
 token_hash text not null check(token_hash ~ '^[0-9a-f]{64}$'),
 items jsonb not null default '{"steps":[],"goals":[]}' check(jsonb_typeof(items)='object' and pg_column_size(items)<=65536),
 send_result text check(send_result in('sent','practice_address','failed')),
 sent_at timestamptz,
 opened_at timestamptz,
 answered_at timestamptz,
 help text check(help is null or length(help)<=500),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,engagement_id),
 unique(round_id,email),
 unique(token_hash),
 foreign key(round_id,engagement_id) references private.check_in_rounds(id,engagement_id),
 foreign key(attendee_id,engagement_id) references public.attendees(id,engagement_id)
);
create index check_in_recipients_round_idx on private.check_in_recipients(round_id);
create index check_in_recipients_engagement_idx on private.check_in_recipients(engagement_id);
create index check_in_recipients_attendee_idx on private.check_in_recipients(attendee_id,engagement_id) where attendee_id is not null;

create table private.check_in_answers (
 id uuid primary key default gen_random_uuid(),
 recipient_id uuid not null references private.check_in_recipients(id),
 engagement_id uuid not null references public.engagements(id),
 first_step_id uuid,
 goal_id uuid,
 answer text not null,
 note text check(note is null or length(note)<=500),
 followed_up_at timestamptz,
 followed_up_by uuid references public.clearway_users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(first_step_id,engagement_id) references private.first_steps(id,engagement_id),
 foreign key(goal_id,engagement_id) references private.goals(id,engagement_id),
 check((first_step_id is null) <> (goal_id is null)),
 check((first_step_id is not null and answer in('done','under_way','stuck')) or (goal_id is not null and answer in('not_started','on_track','at_risk','off_track','done'))),
 check(followed_up_by is null or followed_up_at is not null)
);
create unique index check_in_answers_step_idx on private.check_in_answers(recipient_id,first_step_id) where first_step_id is not null;
create unique index check_in_answers_goal_idx on private.check_in_answers(recipient_id,goal_id) where goal_id is not null;
create index check_in_answers_engagement_idx on private.check_in_answers(engagement_id);
create index check_in_answers_goal_ref_idx on private.check_in_answers(goal_id,engagement_id) where goal_id is not null;
create index check_in_answers_step_ref_idx on private.check_in_answers(first_step_id,engagement_id) where first_step_id is not null;
create index check_in_answers_followed_by_idx on private.check_in_answers(followed_up_by) where followed_up_by is not null;

alter table private.check_in_rounds enable row level security;
alter table private.check_in_rounds force row level security;
revoke all on private.check_in_rounds from public,anon,authenticated;
grant select,insert,update,delete on private.check_in_rounds to service_role;
alter table private.check_in_recipients enable row level security;
alter table private.check_in_recipients force row level security;
revoke all on private.check_in_recipients from public,anon,authenticated;
grant select,insert,update,delete on private.check_in_recipients to service_role;
alter table private.check_in_answers enable row level security;
alter table private.check_in_answers force row level security;
revoke all on private.check_in_answers from public,anon,authenticated;
grant select,insert,update,delete on private.check_in_answers to service_role;

-- ---------- The contracts with other steps ----------
-- The retreat's last day once the retreat has closed, else null. This is step 2's fixture: it reads the end date only when the engagement is in
-- follow-up. Step 4 replaces it with day2_closed_at and the end date.
create function private.retreat_closed_on(p_engagement uuid) returns date
language sql stable security definer set search_path='' as $$
 select e.retreat_end_date from public.engagements e where e.id=p_engagement and not e.deleted and e.status='follow_up'
$$;

-- Each goal's newest status as its owner reported it, for the read-only copy (label and date, never the note).
create function private.check_in_latest_for_view(p_engagement uuid) returns table(goal_id uuid,status text,answered_on date)
language sql stable security definer set search_path='' as $$
 select distinct on(a.goal_id) a.goal_id,a.answer,a.updated_at::date
  from private.check_in_answers a join private.check_in_recipients r on r.id=a.recipient_id join private.check_in_rounds d on d.id=r.round_id
  join private.goals g on g.id=a.goal_id and g.engagement_id=a.engagement_id and not g.deleted
  where a.engagement_id=p_engagement and a.goal_id is not null and d.engagement_id=p_engagement
  order by a.goal_id,d.day desc,a.updated_at desc
$$;

-- ---------- Helpers ----------
create function private.check_in_eligible(p_engagement uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.engagements e where e.id=p_engagement and not e.deleted and e.type in('wayfinding','day_and_a_half','practice'))
$$;

-- Every first step and goal that has an owner with an email, with the owner as they are now. An attendee gives the attendee's own name and email.
create function private.check_in_owned(p_engagement uuid) returns table(kind text,id uuid,label text,on_date date,email text,name text,attendee_id uuid,ord integer)
language sql stable security definer set search_path='' as $$
 select 'step'::text,s.id,s.text,s.due_date,lower(btrim(coalesce(a.email,s.owner_email))),btrim(coalesce(a.name,s.owner_name)),s.owner_attendee_id,s.position
  from private.first_steps s join private.intent_cards c on c.id=s.card_id and c.engagement_id=s.engagement_id and not c.deleted
  left join public.attendees a on a.id=s.owner_attendee_id and a.engagement_id=s.engagement_id and not a.deleted
  where s.engagement_id=p_engagement and not s.deleted and coalesce(a.email,s.owner_email) is not null
 union all
 select 'goal'::text,g.id,g.title,g.end_date,lower(btrim(coalesce(a.email,g.owner_email))),btrim(coalesce(a.name,g.owner_name)),g.owner_attendee_id,g.position
  from private.goals g join private.vision_outcomes o on o.id=g.outcome_id and o.engagement_id=g.engagement_id and not o.deleted
  left join public.attendees a on a.id=g.owner_attendee_id and a.engagement_id=g.engagement_id and not a.deleted
  where g.engagement_id=p_engagement and not g.deleted and coalesce(a.email,g.owner_email) is not null
$$;

-- Rounds at 30, 60 and 90 days from a base date. Existing rounds are left as they are.
create function private.check_in_make_rounds(p_engagement uuid,p_base date) returns integer
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if p_base is null or not private.check_in_eligible(p_engagement) then return 0; end if;
 insert into private.check_in_rounds(engagement_id,day,due_on)
  select p_engagement,d,p_base+d from unnest(array[30,60,90]::smallint[]) d on conflict(engagement_id,day) do nothing;
 get diagnostics n=row_count;
 return n;
end $$;

-- Rounds are made when the retreat closes: the engagement moves to follow-up, or its end date is set while it is there.
create function private.check_in_after_status() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform private.check_in_make_rounds(new.id,private.retreat_closed_on(new.id));
 return new;
end $$;
create trigger check_in_after_status after update of status,retreat_end_date on public.engagements
 for each row when(new.status='follow_up') execute function private.check_in_after_status();

-- A link can be changed until the next round has gone out.
create function private.check_in_editable(p_round uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from private.check_in_rounds r join private.check_in_rounds n on n.engagement_id=r.engagement_id and n.day>r.day and n.status in('sending','sent') where r.id=p_round)
$$;

-- A round is skipped once a later round of the engagement is sending or sent: its link would be read-only from the start.
create function private.check_in_superseded(p_round uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.check_in_rounds r join private.check_in_rounds n on n.engagement_id=r.engagement_id and n.day>r.day and n.status in('sending','sent') where r.id=p_round)
$$;

-- ---------- The facilitator's page ----------
create function private.check_in_state(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare guard text:=private.discover_guard(p_engagement,false); e public.engagements; closed date; out jsonb;
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 select * into e from public.engagements where id=p_engagement and not deleted;
 closed:=private.retreat_closed_on(p_engagement);
 select jsonb_build_object('status','ok','server_time',clock_timestamp(),'type',e.type,'engagement_status',e.status,'eligible',private.check_in_eligible(p_engagement),
  'practice',e.type='practice','retreat_closed_on',closed,
  'can_switch_on',exists(select 1 from private.check_in_rounds o where o.engagement_id=p_engagement and o.status='off' and not private.check_in_superseded(o.id)),
  'owners',(select count(distinct o.email) from private.check_in_owned(p_engagement) o),
  'rounds',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'day',d.day,'due_on',d.due_on,'status',d.status,'sent_at',d.sent_at,'sent_by',d.sent_by,'superseded',d.status in('scheduled','off') and private.check_in_superseded(d.id),
     'recipients',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'email',r.email,'send_result',r.send_result,'sent_at',r.sent_at,'opened_at',r.opened_at,
        'answered_at',r.answered_at,'help',r.help,'practice',r.send_result='practice_address' or r.email ~* '[.](example|invalid|test)$',
        'steps',coalesce((select jsonb_agg(jsonb_build_object('id',x->>'id','text',x->>'text','due',x->>'due','answer',an.answer,'note',an.note,'answer_id',an.id,
            'followed_up_at',an.followed_up_at,'answered_at',an.updated_at) order by t.ord)
           from jsonb_array_elements(r.items->'steps') with ordinality t(x,ord) left join private.check_in_answers an on an.recipient_id=r.id and an.first_step_id=(x->>'id')::uuid),'[]'::jsonb),
        'goals',coalesce((select jsonb_agg(jsonb_build_object('id',x->>'id','title',x->>'text','end',x->>'due','answer',an.answer,'note',an.note,'answer_id',an.id,
            'followed_up_at',an.followed_up_at,'answered_at',an.updated_at) order by t.ord)
           from jsonb_array_elements(r.items->'goals') with ordinality t(x,ord) left join private.check_in_answers an on an.recipient_id=r.id and an.goal_id=(x->>'id')::uuid),'[]'::jsonb)
        ) order by r.name,r.id) from private.check_in_recipients r where r.round_id=d.id),'[]'::jsonb)
    ) order by d.day) from private.check_in_rounds d where d.engagement_id=p_engagement),'[]'::jsonb))
  into out;
 return out;
end $$;

-- Makes the three rounds, from the retreat's last day or, when that is not known, from the date the facilitator gives.
create function private.check_in_create(p_engagement uuid,p_base date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare guard text:=private.discover_guard(p_engagement,true); base date;
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 if not private.check_in_eligible(p_engagement) then return jsonb_build_object('status','not_available'); end if;
 perform private.discover_lock(p_engagement);
 if exists(select 1 from private.check_in_rounds where engagement_id=p_engagement) then return jsonb_build_object('status','exists'); end if;
 base:=coalesce(private.retreat_closed_on(p_engagement),p_base);
 if base is null then return jsonb_build_object('status','needs_date'); end if;
 if base<date '2020-01-01' or base>date '2100-01-01' then return jsonb_build_object('status','invalid_request'); end if;
 perform private.check_in_make_rounds(p_engagement,base);
 return jsonb_build_object('status','ok','base',base);
end $$;

-- Switch the rounds that have not gone out off, or back on. A round that has gone out is a record and stays.
create function private.check_in_switch(p_engagement uuid,p_on boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare guard text:=private.discover_guard(p_engagement,true); n integer;
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 if p_on is null then return jsonb_build_object('status','invalid_request'); end if;
 perform private.discover_lock(p_engagement);
 if p_on then update private.check_in_rounds r set status='scheduled',updated_at=clock_timestamp() where r.engagement_id=p_engagement and r.status='off' and not private.check_in_superseded(r.id);
 else update private.check_in_rounds set status='off',updated_at=clock_timestamp() where engagement_id=p_engagement and status='scheduled';
 end if;
 get diagnostics n=row_count;
 return jsonb_build_object('status','ok','changed',n);
end $$;

-- Send now: the facilitator's check, for the server to send. It says who pressed, so the round records it.
create function private.check_in_send_guard(p_engagement uuid,p_round uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare guard text:=private.discover_guard(p_engagement,true); d private.check_in_rounds;
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 select * into d from private.check_in_rounds where id=p_round and engagement_id=p_engagement;
 if not found then return jsonb_build_object('status','not_found'); end if;
 if not private.check_in_eligible(p_engagement) then return jsonb_build_object('status','not_available'); end if;
 if d.status='off' then return jsonb_build_object('status','off'); end if;
 if d.status='scheduled' and private.check_in_superseded(d.id) then return jsonb_build_object('status','superseded'); end if;
 if d.status='sent' and not exists(select 1 from private.check_in_recipients r where r.round_id=d.id and r.send_result='failed') then return jsonb_build_object('status','sent'); end if;
 return jsonb_build_object('status','ok','by',private.clearway_user_id(),'round_status',d.status);
end $$;

-- Marks one stuck step, or one goal at risk or off track, as followed up (or not).
create function private.check_in_follow_up(p_engagement uuid,p_answer uuid,p_done boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare guard text:=private.discover_guard(p_engagement,true); a private.check_in_answers;
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 if p_answer is null or p_done is null then return jsonb_build_object('status','invalid_request'); end if;
 perform private.discover_lock(p_engagement);
 select * into a from private.check_in_answers where id=p_answer and engagement_id=p_engagement for update;
 if not found then return jsonb_build_object('status','not_found'); end if;
 if not(a.answer in('stuck','at_risk','off_track')) then return jsonb_build_object('status','not_a_follow_up'); end if;
 if p_done then
  update private.check_in_answers set followed_up_at=coalesce(followed_up_at,clock_timestamp()),followed_up_by=coalesce(followed_up_by,private.clearway_user_id()) where id=a.id;
 else
  update private.check_in_answers set followed_up_at=null,followed_up_by=null where id=a.id;
 end if;
 return jsonb_build_object('status','ok');
end $$;

-- Open as this person: for a practice address only (one that is never emailed, or any address in the practice room). The server makes a fresh token and hands over its hash; the link it opens replaces
-- that row's old one. A real address is never touched, so an emailed link is never cut off by this.
create function private.check_in_open_as(p_engagement uuid,p_recipient uuid,p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare guard text:=private.discover_guard(p_engagement,true); r private.check_in_recipients;
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 if p_recipient is null or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('status','invalid_request'); end if;
 select * into r from private.check_in_recipients where id=p_recipient and engagement_id=p_engagement for update;
 if not found then return jsonb_build_object('status','not_found'); end if;
 if r.send_result is distinct from 'practice_address' and r.email !~* '[.](example|invalid|test)$' then return jsonb_build_object('status','not_a_practice_address'); end if;
 update private.check_in_recipients set token_hash=p_hash,updated_at=clock_timestamp() where id=r.id;
 return jsonb_build_object('status','ok');
end $$;

-- ---------- The server's send (service role) ----------
-- Rounds to send today. When a later round of the same engagement is due too (a run missed for days, or a base date in the past), only the
-- latest goes out and the earlier ones are put away, so nobody gets two check-ins at once.
create function private.check_in_claim_due(p_today date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare out jsonb;
begin
 if p_today is null then return jsonb_build_object('status','invalid_request'); end if;
 update private.check_in_rounds r set status='off',updated_at=clock_timestamp()
  where r.status='scheduled' and r.due_on<=p_today
   and exists(select 1 from private.check_in_rounds n where n.engagement_id=r.engagement_id and n.day>r.day and n.status='scheduled' and n.due_on<=p_today);
 update private.check_in_rounds r set status='off',updated_at=clock_timestamp() where r.status='scheduled' and private.check_in_superseded(r.id);
 select coalesce(jsonb_agg(jsonb_build_object('round',r.id,'engagement',r.engagement_id,'day',r.day,'due_on',r.due_on) order by r.due_on,r.id),'[]'::jsonb) into out
  from private.check_in_rounds r join public.engagements e on e.id=r.engagement_id and not e.deleted and e.status<>'closed'
  where private.check_in_eligible(r.engagement_id)
   and ((r.status='scheduled' and r.due_on<=p_today) or (r.status='sending' and r.claimed_at<clock_timestamp()-interval '10 minutes'));
 return jsonb_build_object('status','ok','rounds',out);
end $$;

-- Takes a round to send. The schedule takes it only when due; a facilitator's Send now takes it any time. A round another run holds is busy.
-- On a sent round, Send now takes the recipients whose email did not go and sends those again.
create function private.check_in_round_begin(p_round uuid,p_by text,p_today date,p_force boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d private.check_in_rounds; e public.engagements; t timestamptz:=clock_timestamp(); retry boolean:=false; pending jsonb; items jsonb; church text; next_on date;
begin
 if p_round is null or p_today is null or p_by is null or not(p_by='schedule' or p_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then return jsonb_build_object('status','invalid_request'); end if;
 select * into d from private.check_in_rounds where id=p_round for update;
 if not found then return jsonb_build_object('status','not_found'); end if;
 select * into e from public.engagements where id=d.engagement_id and not deleted;
 if not found or e.status='closed' then return jsonb_build_object('status','closed'); end if;
 if not private.check_in_eligible(d.engagement_id) then return jsonb_build_object('status','not_available'); end if;
 if d.status='off' then return jsonb_build_object('status','off'); end if;
 if d.status='scheduled' and private.check_in_superseded(d.id) then return jsonb_build_object('status','superseded'); end if;
 if d.status='scheduled' and not coalesce(p_force,false) and d.due_on>p_today then return jsonb_build_object('status','not_due'); end if;
 if d.status='sending' and d.claimed_at>t-interval '10 minutes' then return jsonb_build_object('status','busy'); end if;
 if d.status='sent' then
  if not coalesce(p_force,false) or not exists(select 1 from private.check_in_recipients r where r.round_id=d.id and r.send_result='failed') then return jsonb_build_object('status','sent'); end if;
  retry:=true;
  update private.check_in_recipients set send_result=null,updated_at=t where round_id=d.id and send_result='failed';
 end if;
 update private.check_in_rounds set status='sending',claimed_at=t,sent_by=p_by,updated_at=t where id=d.id;
 -- What the email says that can change between attempts (the church's name, the next check-in's date) is taken once, at the first begin,
 -- and kept, so a resumed or repeated send makes the same email as the first.
 if d.snapshot is null then
  select c.name into church from public.churches c where c.id=e.church_id;
  select min(n.due_on) into next_on from private.check_in_rounds n where n.engagement_id=d.engagement_id and n.day>d.day and n.status in('scheduled','sending');
  update private.check_in_rounds set snapshot=jsonb_build_object('church',church,'next_on',next_on) where id=d.id;
 else
  church:=d.snapshot->>'church'; next_on:=nullif(d.snapshot->>'next_on','')::date;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'email',r.email,'name',r.name,'items',r.items) order by r.name,r.id),'[]'::jsonb) into pending
  from private.check_in_recipients r where r.round_id=d.id and r.send_result is null;
 if exists(select 1 from private.check_in_recipients r where r.round_id=d.id) then items:=null;
 else
  select coalesce(jsonb_agg(jsonb_build_object('kind',o.kind,'id',o.id,'label',o.label,'date',o.on_date,'email',o.email,'name',o.name,'attendee',o.attendee_id,'ord',o.ord) order by o.ord,o.label,o.id),'[]'::jsonb) into items
   from private.check_in_owned(d.engagement_id) o;
 end if;
 return jsonb_build_object('status','ok','retry',retry,'day',d.day,'church',church,'title',e.title,'next_on',next_on,'practice_room',e.type='practice','recipients',pending,'owned',items);
end $$;

-- Saves the people a round goes to, worked out in code from the owned items, with a token hash each. Every item must belong to the person
-- as the records have it now, so the server cannot add a step to someone who does not own it.
create function private.check_in_round_save(p_round uuid,p_people jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d private.check_in_rounds; person jsonb; mine jsonb; bad boolean:=false; out jsonb;
begin
 if p_round is null or jsonb_typeof(p_people) is distinct from 'array' or jsonb_array_length(p_people)>200 then return jsonb_build_object('status','invalid_request'); end if;
 select * into d from private.check_in_rounds where id=p_round for update;
 if not found or d.status<>'sending' then return jsonb_build_object('status','not_sending'); end if;
 if exists(select 1 from private.check_in_recipients where round_id=d.id) then return jsonb_build_object('status','exists'); end if;
 for person in select * from jsonb_array_elements(p_people) loop
  if jsonb_typeof(person) is distinct from 'object' or coalesce(person->>'id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or coalesce(person->>'token_hash','') !~ '^[0-9a-f]{64}$' or coalesce(person->>'email','')<>lower(btrim(coalesce(person->>'email','')))
   or jsonb_typeof(person->'steps') is distinct from 'array' or jsonb_typeof(person->'goals') is distinct from 'array' then bad:=true; exit; end if;
  mine:=jsonb_build_object(
   'steps',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'text',o.label,'due',o.on_date) order by o.ord,o.label,o.id) from private.check_in_owned(d.engagement_id) o
      where o.kind='step' and o.email=person->>'email' and to_jsonb(o.id::text) in(select * from jsonb_array_elements(person->'steps'))),'[]'::jsonb),
   'goals',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'text',o.label,'due',o.on_date) order by o.ord,o.label,o.id) from private.check_in_owned(d.engagement_id) o
      where o.kind='goal' and o.email=person->>'email' and to_jsonb(o.id::text) in(select * from jsonb_array_elements(person->'goals'))),'[]'::jsonb));
  if jsonb_array_length(mine->'steps')<>jsonb_array_length(person->'steps') or jsonb_array_length(mine->'goals')<>jsonb_array_length(person->'goals')
   or jsonb_array_length(mine->'steps')+jsonb_array_length(mine->'goals')=0 then bad:=true; exit; end if;
  insert into private.check_in_recipients(id,round_id,engagement_id,email,name,attendee_id,token_hash,items)
   values((person->>'id')::uuid,d.id,d.engagement_id,person->>'email',left(btrim(coalesce(nullif(person->>'name',''),person->>'email')),200),
    (select a.id from public.attendees a where a.id=nullif(person->>'attendee','')::uuid and a.engagement_id=d.engagement_id and not a.deleted),person->>'token_hash',mine);
 end loop;
 if bad then raise exception 'check_in_round_save: invalid people' using errcode='22023'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'email',r.email,'name',r.name,'items',r.items) order by r.name,r.id),'[]'::jsonb) into out from private.check_in_recipients r where r.round_id=d.id;
 return jsonb_build_object('status','ok','recipients',out);
end $$;

create function private.check_in_recipient_result(p_recipient uuid,p_result text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if p_recipient is null or p_result is null or p_result not in('sent','practice_address','failed') then return jsonb_build_object('status','invalid_request'); end if;
 update private.check_in_recipients set send_result=p_result,sent_at=case when p_result='sent' then clock_timestamp() else sent_at end,updated_at=clock_timestamp()
  where id=p_recipient and (send_result is null or send_result='failed');
 if not found then return jsonb_build_object('status','unchanged'); end if;
 return jsonb_build_object('status','ok');
end $$;

-- A round is sent when every recipient has a result. Failed ones stay failed, and Send now can try them again.
create function private.check_in_round_finish(p_round uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d private.check_in_rounds; t timestamptz:=clock_timestamp();
begin
 if p_round is null then return jsonb_build_object('status','invalid_request'); end if;
 select * into d from private.check_in_rounds where id=p_round for update;
 if not found then return jsonb_build_object('status','not_found'); end if;
 if d.status<>'sending' then return jsonb_build_object('status','unchanged'); end if;
 if exists(select 1 from private.check_in_recipients r where r.round_id=d.id and r.send_result is null) then return jsonb_build_object('status','unfinished'); end if;
 update private.check_in_rounds set status='sent',sent_at=coalesce(sent_at,t),updated_at=t where id=d.id;
 return jsonb_build_object('status','ok','sent',(select count(*) from private.check_in_recipients r where r.round_id=d.id and r.send_result='sent'),
  'practice',(select count(*) from private.check_in_recipients r where r.round_id=d.id and r.send_result='practice_address'),
  'failed',(select count(*) from private.check_in_recipients r where r.round_id=d.id and r.send_result='failed'));
end $$;

-- ---------- The phone page (service role, from the server) ----------
create function private.check_in_phone_read(p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.check_in_recipients; d private.check_in_rounds; e public.engagements; church text; newest record; next_on date; first_name text;
begin
 if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('status','unknown'); end if;
 select * into r from private.check_in_recipients where token_hash=p_hash;
 if not found then return jsonb_build_object('status','unknown'); end if;
 select * into d from private.check_in_rounds where id=r.round_id;
 select * into e from public.engagements where id=r.engagement_id;
 select c.name into church from public.churches c where c.id=e.church_id;
 if e.deleted or e.status='closed' then return jsonb_build_object('status','ended','church',church); end if;
 select n.day,n.sent_at into newest from private.check_in_rounds n where n.engagement_id=d.engagement_id and n.status in('sending','sent') order by n.day desc limit 1;
 select min(n.due_on) into next_on from private.check_in_rounds n where n.engagement_id=d.engagement_id and n.day>d.day and n.status='scheduled';
 first_name:=private.first_name(r.name);
 return jsonb_build_object('status','ok','church',church,'first',first_name,'name',r.name,'day',d.day,'editable',private.check_in_editable(d.id),'newest_day',newest.day,'newest_sent_at',newest.sent_at,
  'sent_at',r.sent_at,'next_on',next_on,'help',r.help,'answered_at',r.answered_at,
  'steps',coalesce((select jsonb_agg(jsonb_build_object('id',x->>'id','text',x->>'text','due',x->>'due','answer',an.answer,'note',an.note) order by t.ord)
     from jsonb_array_elements(r.items->'steps') with ordinality t(x,ord) left join private.check_in_answers an on an.recipient_id=r.id and an.first_step_id=(x->>'id')::uuid),'[]'::jsonb),
  'goals',coalesce((select jsonb_agg(jsonb_build_object('id',x->>'id','title',x->>'text','end',x->>'due','answer',an.answer,'note',an.note) order by t.ord)
     from jsonb_array_elements(r.items->'goals') with ordinality t(x,ord) left join private.check_in_answers an on an.recipient_id=r.id and an.goal_id=(x->>'id')::uuid),'[]'::jsonb));
end $$;

-- One save: a step's answer and note, a goal's status and what would help, or the person's overall help text. Saving the same thing twice is the same.
create function private.check_in_phone_save(p_hash text,p_kind text,p_item uuid,p_answer text,p_note text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.check_in_recipients; e public.engagements; note text:=nullif(btrim(coalesce(p_note,'')),''); t timestamptz:=clock_timestamp(); owned boolean;
begin
 if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('status','unknown'); end if;
 if p_kind is null or p_kind not in('step','goal','help','open','finish') or (note is not null and length(note)>500) then return jsonb_build_object('status','invalid_request'); end if;
 select * into r from private.check_in_recipients where token_hash=p_hash for update;
 if not found then return jsonb_build_object('status','unknown'); end if;
 select * into e from public.engagements where id=r.engagement_id;
 if e.deleted or e.status='closed' then return jsonb_build_object('status','ended'); end if;
 -- Opening is recorded from the page itself after it loads, never from the server's render, so an email scanner's fetch is not an open.
 if p_kind='open' then
  update private.check_in_recipients set opened_at=coalesce(opened_at,t),updated_at=t where id=r.id;
  return jsonb_build_object('status','ok');
 end if;
 if not private.check_in_editable(r.round_id) then return jsonb_build_object('status','read_only'); end if;
 -- Answered means the person pressed Send my check-in. Taps before that are saved but do not count.
 if p_kind='finish' then
  if not exists(select 1 from private.check_in_answers a where a.recipient_id=r.id) then return jsonb_build_object('status','invalid_request'); end if;
  update private.check_in_recipients set answered_at=t,updated_at=t where id=r.id;
  return jsonb_build_object('status','ok');
 end if;
 if p_kind='help' then
  update private.check_in_recipients set help=note,updated_at=t where id=r.id;
  return jsonb_build_object('status','ok');
 end if;
 if p_item is null then return jsonb_build_object('status','invalid_request'); end if;
 if p_kind='step' then
  if p_answer is null or p_answer not in('done','under_way','stuck') then return jsonb_build_object('status','invalid_request'); end if;
  select exists(select 1 from jsonb_array_elements(r.items->'steps') x where x->>'id'=p_item::text) into owned;
  if not owned then return jsonb_build_object('status','invalid_request'); end if;
  insert into private.check_in_answers(recipient_id,engagement_id,first_step_id,answer,note,updated_at) values(r.id,r.engagement_id,p_item,p_answer,note,t)
   on conflict(recipient_id,first_step_id) where first_step_id is not null do update set answer=excluded.answer,note=excluded.note,updated_at=t,
    followed_up_at=case when private.check_in_answers.answer=excluded.answer then private.check_in_answers.followed_up_at end,
    followed_up_by=case when private.check_in_answers.answer=excluded.answer then private.check_in_answers.followed_up_by end;
 else
  if p_answer is null or p_answer not in('not_started','on_track','at_risk','off_track','done') then return jsonb_build_object('status','invalid_request'); end if;
  select exists(select 1 from jsonb_array_elements(r.items->'goals') x where x->>'id'=p_item::text) into owned;
  if not owned then return jsonb_build_object('status','invalid_request'); end if;
  insert into private.check_in_answers(recipient_id,engagement_id,goal_id,answer,note,updated_at) values(r.id,r.engagement_id,p_item,p_answer,note,t)
   on conflict(recipient_id,goal_id) where goal_id is not null do update set answer=excluded.answer,note=excluded.note,updated_at=t,
    followed_up_at=case when private.check_in_answers.answer=excluded.answer then private.check_in_answers.followed_up_at end,
    followed_up_by=case when private.check_in_answers.answer=excluded.answer then private.check_in_answers.followed_up_by end;
 end if;
 return jsonb_build_object('status','ok');
end $$;

-- ---------- Public wrappers: security invoker, every check is in the private function ----------
create function public.check_in_state(p_engagement uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.check_in_state(p_engagement) $$;
create function public.check_in_create(p_engagement uuid,p_base date) returns jsonb
language sql security invoker set search_path='' as $$ select private.check_in_create(p_engagement,p_base) $$;
create function public.check_in_switch(p_engagement uuid,p_on boolean) returns jsonb
language sql security invoker set search_path='' as $$ select private.check_in_switch(p_engagement,p_on) $$;
create function public.check_in_send_guard(p_engagement uuid,p_round uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.check_in_send_guard(p_engagement,p_round) $$;
create function public.check_in_follow_up(p_engagement uuid,p_answer uuid,p_done boolean) returns jsonb
language sql security invoker set search_path='' as $$ select private.check_in_follow_up(p_engagement,p_answer,p_done) $$;
create function public.check_in_open_as(p_engagement uuid,p_recipient uuid,p_hash text) returns jsonb
language sql security invoker set search_path='' as $$ select private.check_in_open_as(p_engagement,p_recipient,p_hash) $$;
create function public.check_in_claim_due(p_today date) returns jsonb
language sql security invoker set search_path='' as $$ select private.check_in_claim_due(p_today) $$;
create function public.check_in_round_begin(p_round uuid,p_by text,p_today date,p_force boolean) returns jsonb
language sql security invoker set search_path='' as $$ select private.check_in_round_begin(p_round,p_by,p_today,p_force) $$;
create function public.check_in_round_save(p_round uuid,p_people jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.check_in_round_save(p_round,p_people) $$;
create function public.check_in_recipient_result(p_recipient uuid,p_result text) returns jsonb
language sql security invoker set search_path='' as $$ select private.check_in_recipient_result(p_recipient,p_result) $$;
create function public.check_in_round_finish(p_round uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.check_in_round_finish(p_round) $$;
create function public.check_in_phone_read(p_hash text) returns jsonb
language sql security invoker set search_path='' as $$ select private.check_in_phone_read(p_hash) $$;
create function public.check_in_phone_save(p_hash text,p_kind text,p_item uuid,p_answer text,p_note text) returns jsonb
language sql security invoker set search_path='' as $$ select private.check_in_phone_save(p_hash,p_kind,p_item,p_answer,p_note) $$;

revoke all on function private.retreat_closed_on(uuid),private.check_in_latest_for_view(uuid),private.check_in_eligible(uuid),private.check_in_owned(uuid),private.check_in_make_rounds(uuid,date),
 private.check_in_after_status(),private.check_in_editable(uuid),private.check_in_superseded(uuid),
 private.check_in_state(uuid),private.check_in_create(uuid,date),private.check_in_switch(uuid,boolean),private.check_in_send_guard(uuid,uuid),private.check_in_follow_up(uuid,uuid,boolean),private.check_in_open_as(uuid,uuid,text),
 private.check_in_claim_due(date),private.check_in_round_begin(uuid,text,date,boolean),private.check_in_round_save(uuid,jsonb),private.check_in_recipient_result(uuid,text),private.check_in_round_finish(uuid),
 private.check_in_phone_read(text),private.check_in_phone_save(text,text,uuid,text,text),
 public.check_in_state(uuid),public.check_in_create(uuid,date),public.check_in_switch(uuid,boolean),public.check_in_send_guard(uuid,uuid),public.check_in_follow_up(uuid,uuid,boolean),public.check_in_open_as(uuid,uuid,text),
 public.check_in_claim_due(date),public.check_in_round_begin(uuid,text,date,boolean),public.check_in_round_save(uuid,jsonb),public.check_in_recipient_result(uuid,text),public.check_in_round_finish(uuid),
 public.check_in_phone_read(text),public.check_in_phone_save(text,text,uuid,text,text)
 from public,anon,authenticated;
grant execute on function private.check_in_state(uuid),private.check_in_create(uuid,date),private.check_in_switch(uuid,boolean),private.check_in_send_guard(uuid,uuid),private.check_in_follow_up(uuid,uuid,boolean),private.check_in_open_as(uuid,uuid,text),
 public.check_in_state(uuid),public.check_in_create(uuid,date),public.check_in_switch(uuid,boolean),public.check_in_send_guard(uuid,uuid),public.check_in_follow_up(uuid,uuid,boolean),public.check_in_open_as(uuid,uuid,text) to authenticated;
grant execute on function private.retreat_closed_on(uuid),private.check_in_latest_for_view(uuid),
 private.check_in_claim_due(date),private.check_in_round_begin(uuid,text,date,boolean),private.check_in_round_save(uuid,jsonb),private.check_in_recipient_result(uuid,text),private.check_in_round_finish(uuid),
 private.check_in_phone_read(text),private.check_in_phone_save(text,text,uuid,text,text),
 public.check_in_claim_due(date),public.check_in_round_begin(uuid,text,date,boolean),public.check_in_round_save(uuid,jsonb),public.check_in_recipient_result(uuid,text),public.check_in_round_finish(uuid),
 public.check_in_phone_read(text),public.check_in_phone_save(text,text,uuid,text,text) to service_role;

-- ---------- The practice room's reset and Clear test answers ----------
-- Each is the newest definition, renamed to _pre_check_ins and wrapped, so every earlier step's clearing stays in place. The practice room's
-- check-in rows are put away whole, so its rounds can be made and sent again.
create function private.check_in_clear(p_engagement uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 delete from private.check_in_answers where engagement_id=p_engagement;
 delete from private.check_in_recipients where engagement_id=p_engagement;
 delete from private.check_in_rounds where engagement_id=p_engagement;
end $$;

alter function private.reset_practice_room() rename to reset_practice_room_pre_check_ins;
alter function private.rehearsal_control(uuid,uuid,text) rename to rehearsal_control_pre_check_ins;

create function private.reset_practice_room() returns boolean
language plpgsql security definer set search_path='' as $$
declare eng uuid:='90000000-0000-4000-8000-000000000010'::uuid; ok boolean;
begin
 ok:=private.reset_practice_room_pre_check_ins();
 if ok then perform private.check_in_clear(eng); end if;
 return ok;
end $$;

create function private.rehearsal_control(p_engagement uuid,p_id uuid,p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare out jsonb;
begin
 out:=private.rehearsal_control_pre_check_ins(p_engagement,p_id,p_action);
 if p_action='clear' and p_engagement='90000000-0000-4000-8000-000000000010'::uuid and out->>'status'='ok' then perform private.check_in_clear(p_engagement); end if;
 return out;
end $$;

revoke all on function private.check_in_clear(uuid),private.reset_practice_room_pre_check_ins(),private.reset_practice_room(),private.rehearsal_control_pre_check_ins(uuid,uuid,text),private.rehearsal_control(uuid,uuid,text) from public,anon,authenticated;
grant execute on function private.reset_practice_room(),private.rehearsal_control(uuid,uuid,text) to authenticated;
commit;
