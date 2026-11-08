-- Milestone 7, step 4: Day 2 close, share links and the read-only copy (AFT-03).
--
-- Once Day 2 has closed the facilitator makes named links for the elders. A link opens a public page, with no sign-in and nothing to change: the
-- Clearway Map, the Vision Outcomes with their indicators, the 1-year goals with owners, end dates and the status each owner gave in their newest
-- check-in (a label and a date, never the note), the commander's intent cards with first steps, and the signed-off report once there is one.
-- Never raw answers, scribe cards, drafts, sources, signals, emails or notes. A link can be turned off. Nothing here reads or writes CORE.
--
-- New:
--   public.engagements.day2_closed_at                      set when the last retreat part closes (the trigger below) or by Mark the retreat closed
--   private.read_only_links                                forced row-level security, no browser grant
--   private.retreat_close, retreat_day2_closed             the one place Day 2 is closed, and the trigger on room controls beside overnight_day1_closed
--   private.retreat_mark_closed, retreat_reopen            the facilitator's Mark the retreat closed, and Undo for a mistaken mark
--   private.share_state, share_link_create, share_link_revoke   the Share page (facilitators)
--   private.read_only_view, ro_report                      the public page's one read, by the token's hash (service role only)
--   public wrappers (security invoker) for each of the above that a browser role or the server calls
--
-- Replaced, each a superset of what it was:
--   private.retreat_closed_on        step 2's fixture. The retreat's last day (the end date, else the day Day 2 closed in the church's time zone), null until Day 2 has closed
--   private.check_in_latest_for_view  step 2's contract: the same columns, with answered_on as the day in the church's time zone
--   private.check_in_after_status    step 2's status trigger is dropped: a status change alone makes no rounds. Rounds are made when Day 2 closes
-- Shared objects touched, each a superset of its newest definition at the time this migration runs:
--   private.reset_practice_room      the newest wrapper, renamed reset_practice_room_pre_read_only and wrapped; clears the links and Day 2's close
--   private.rehearsal_control        the newest wrapper, renamed rehearsal_control_pre_read_only and wrapped; Clear test answers does the same
begin;

-- ---------- Day 2 ----------
alter table public.engagements add column day2_closed_at timestamptz;
-- The rounds a close made, so Undo takes away those and nothing else (a round made by hand, or switched off, is the facilitator's).
alter table private.check_in_rounds add column made_by_close boolean not null default false;

-- The retreat's last day once Day 2 has closed, else null. The end date wins when it is set. Days are church days in the church's time zone.
create or replace function private.retreat_closed_on(p_engagement uuid) returns date
language sql stable security definer set search_path='' as $$
 select case when e.day2_closed_at is null then null else coalesce(e.retreat_end_date,(e.day2_closed_at at time zone coalesce(nullif(c.timezone,''),'America/Toronto'))::date) end
 from public.engagements e left join public.churches c on c.id=e.church_id where e.id=p_engagement and not e.deleted
$$;

-- Each goal's newest status as its owner reported it. Step 2's contract, the same columns; the date is the church's day, not UTC's.
create or replace function private.check_in_latest_for_view(p_engagement uuid) returns table(goal_id uuid,status text,answered_on date)
language sql stable security definer set search_path='' as $$
 select distinct on(a.goal_id) a.goal_id,a.answer,
   (a.updated_at at time zone coalesce((select nullif(c.timezone,'') from public.engagements e join public.churches c on c.id=e.church_id where e.id=p_engagement),'America/Toronto'))::date
  from private.check_in_answers a join private.check_in_recipients r on r.id=a.recipient_id join private.check_in_rounds d on d.id=r.round_id
  join private.goals g on g.id=a.goal_id and g.engagement_id=a.engagement_id and not g.deleted
  where a.engagement_id=p_engagement and a.goal_id is not null and d.engagement_id=p_engagement
  order by a.goal_id,d.day desc,a.updated_at desc
$$;

-- Engagements already in follow-up with a retreat end date: their retreat has closed, so sharing and the check-ins work for them too.
update public.engagements e set day2_closed_at=(e.retreat_end_date::timestamp at time zone coalesce((select nullif(c.timezone,'') from public.churches c where c.id=e.church_id),'America/Toronto'))
 where e.status='follow_up' and e.retreat_end_date is not null and not e.deleted and e.day2_closed_at is null;

-- Closes the retreat: records when, and makes the 30, 60 and 90-day check-in rounds (existing rounds are left as they are). It does nothing for an
-- engagement that is closed, deleted or already marked. Returns whether this call did it.
create function private.retreat_close(p_engagement uuid,p_at timestamptz) returns boolean
language plpgsql security definer set search_path='' as $$
declare had uuid[];
begin
 update public.engagements set day2_closed_at=p_at where id=p_engagement and not deleted and status<>'closed' and day2_closed_at is null;
 if not found then return false; end if;
 had:=array(select r.id from private.check_in_rounds r where r.engagement_id=p_engagement);
 perform private.check_in_make_rounds(p_engagement,private.retreat_closed_on(p_engagement));
 update private.check_in_rounds r set made_by_close=true where r.engagement_id=p_engagement and r.id<>all(had);
 return true;
end $$;

-- Ending a day is the room control close_part. The retreat closes when that call itself closes a Day 2 step (the half day of a day-and-a-half
-- engagement is its Day 2 too) and leaves none open. Closing Day 1 or another part, a step ending on its own, and a rehearsal on a real engagement
-- do not. A step closed in this transaction is one whose closed_at is not before the transaction began.
create function private.retreat_day2_closed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.action='close_part'
  and private.rehearsing(new.engagement_id) is null
  and exists(select 1 from public.sessions x where x.engagement_id=new.engagement_id and x.part='Day 2' and not x.deleted and x.state='closed' and x.closed_at>=transaction_timestamp())
  and not exists(select 1 from public.sessions x where x.engagement_id=new.engagement_id and x.part='Day 2' and not x.deleted and x.mode='live' and x.state in ('live','phones_down','open'))
  and not exists(select 1 from public.sessions x where x.engagement_id=new.engagement_id and x.part='Day 2' and not x.deleted and x.mode='self_paced' and x.state<>'draft' and x.closes_at>clock_timestamp()) then
  perform private.retreat_close(new.engagement_id,clock_timestamp());
 end if;
 return new;
end $$;
create trigger retreat_day2_closed after insert on private.room_controls for each row execute function private.retreat_day2_closed();

-- Step 2 made rounds when an engagement moved to follow-up. That is replaced by the close above, so a status change alone makes none.
drop trigger check_in_after_status on public.engagements;
drop function private.check_in_after_status();

-- Mark the retreat closed: the lead or a co-facilitator, when the room did not close Day 2 in the app.
create function private.retreat_mark_closed(p_engagement uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare guard text:=private.discover_guard(p_engagement,true); e public.engagements;
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 if not private.check_in_eligible(p_engagement) then return jsonb_build_object('status','not_available'); end if;
 perform private.discover_lock(p_engagement);
 select * into e from public.engagements where id=p_engagement and not deleted;
 if e.day2_closed_at is not null then return jsonb_build_object('status','already','closed_at',e.day2_closed_at); end if;
 -- Only once the retreat is under way or over: before that, neither the status nor the start date has got there.
 if e.status not in ('retreat','follow_up') and e.type<>'practice' and not (e.retreat_start_date is not null
  and e.retreat_start_date<=(clock_timestamp() at time zone coalesce((select nullif(c.timezone,'') from public.churches c where c.id=e.church_id),'America/Toronto'))::date) then
  return jsonb_build_object('status','too_early');
 end if;
 perform private.retreat_close(p_engagement,clock_timestamp());
 return jsonb_build_object('status','ok','closed_on',private.retreat_closed_on(p_engagement));
end $$;

-- Undo a mistaken mark, within the hour and before any check-in has gone out. The scheduled rounds this close made go with it (never one made by hand or switched off), and every link stops opening
-- until the retreat is closed again.
create function private.retreat_reopen(p_engagement uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare guard text:=private.discover_guard(p_engagement,true); e public.engagements;
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 perform private.discover_lock(p_engagement);
 select * into e from public.engagements where id=p_engagement and not deleted;
 if e.day2_closed_at is null then return jsonb_build_object('status','not_closed'); end if;
 if e.day2_closed_at<clock_timestamp()-interval '1 hour' then return jsonb_build_object('status','too_late'); end if;
 if exists(select 1 from private.check_in_rounds r where r.engagement_id=p_engagement and r.status in ('sending','sent'))
  or exists(select 1 from private.check_in_recipients r where r.engagement_id=p_engagement) then return jsonb_build_object('status','checkins_started'); end if;
 delete from private.check_in_rounds where engagement_id=p_engagement and made_by_close and status='scheduled';
 update public.engagements set day2_closed_at=null where id=p_engagement;
 return jsonb_build_object('status','ok');
end $$;

-- ---------- Read-only links ----------
create table private.read_only_links (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 name text not null check(length(btrim(name)) between 1 and 80),
 token_hash text not null check(token_hash ~ '^[0-9a-f]{64}$'),
 created_by uuid references public.clearway_users(id),
 created_at timestamptz not null default now(),
 revoked_by uuid references public.clearway_users(id),
 revoked_at timestamptz,
 last_opened_at timestamptz,
 open_count integer not null default 0 check(open_count>=0),
 unique(token_hash),
 check(revoked_by is null or revoked_at is not null)
);
create index read_only_links_engagement_idx on private.read_only_links(engagement_id,created_at);
create index read_only_links_created_by_idx on private.read_only_links(created_by) where created_by is not null;
create index read_only_links_revoked_by_idx on private.read_only_links(revoked_by) where revoked_by is not null;

alter table private.read_only_links enable row level security;
alter table private.read_only_links force row level security;
revoke all on private.read_only_links from public,anon,authenticated;
grant select,insert,update,delete on private.read_only_links to service_role;

-- ---------- The Share page (facilitators) ----------
-- Everything the page needs: whether Day 2 has closed, whether Undo is still on offer, the signed-off report (and whether it was changed since),
-- and each link with who made it and how often it was opened. A link's token and its hash never leave the database.
create function private.share_state(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare guard text:=private.discover_guard(p_engagement,false); e public.engagements; so private.report_sign_offs; out jsonb;
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 select * into e from public.engagements where id=p_engagement and not deleted;
 select * into so from private.report_sign_offs o where o.engagement_id=p_engagement and not o.deleted order by o.n desc limit 1;
 select jsonb_build_object('status','ok','server_time',clock_timestamp(),'type',e.type,'engagement_status',e.status,'eligible',private.check_in_eligible(p_engagement),'practice',e.type='practice',
  'timezone',coalesce((select nullif(c.timezone,'') from public.churches c where c.id=e.church_id),'America/Toronto'),
  'closed',e.day2_closed_at is not null,'closed_at',e.day2_closed_at,'closed_on',private.retreat_closed_on(p_engagement),
  'can_reopen',e.day2_closed_at is not null and e.day2_closed_at>=clock_timestamp()-interval '1 hour' and e.status<>'closed'
    and not exists(select 1 from private.check_in_rounds r where r.engagement_id=p_engagement and r.status in ('sending','sent'))
    and not exists(select 1 from private.check_in_recipients r where r.engagement_id=p_engagement),
  'report',case when so.id is not null then jsonb_build_object('n',so.n,'signed_at',so.signed_at,'stale',private.report_snapshot(p_engagement) is distinct from so.snapshot) end,
  'links',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'made_by',(select u.name from public.clearway_users u where u.id=l.created_by),'created_at',l.created_at,
     'opens',l.open_count,'last_opened_at',l.last_opened_at,'revoked_at',l.revoked_at,'revoked_by',(select u.name from public.clearway_users u where u.id=l.revoked_by),
     'state',case when l.revoked_at is not null then 'revoked' else 'active' end) order by l.created_at desc,l.id) from private.read_only_links l where l.engagement_id=p_engagement),'[]'::jsonb))
 into out;
 return out;
end $$;

-- Makes a link. The server makes the token (24 random bytes) and hands over only its SHA-256, so the database never holds the token. Available once Day 2 has closed.
create function private.share_link_create(p_engagement uuid,p_name text,p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare guard text:=private.discover_guard(p_engagement,true); e public.engagements; v_name text:=btrim(coalesce(p_name,'')); v_id uuid;
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 if length(v_name) not between 1 and 80 or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('status','invalid_request'); end if;
 if not private.check_in_eligible(p_engagement) then return jsonb_build_object('status','not_available'); end if;
 perform private.discover_lock(p_engagement);
 select * into e from public.engagements where id=p_engagement and not deleted;
 if e.day2_closed_at is null then return jsonb_build_object('status','not_closed'); end if;
 insert into private.read_only_links(engagement_id,name,token_hash,created_by) values(p_engagement,v_name,p_hash,private.clearway_user_id()) returning id into v_id;
 return jsonb_build_object('status','ok','id',v_id);
end $$;

-- Turns a link off at once. Turning off one already off is the same.
create function private.share_link_revoke(p_engagement uuid,p_link uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare guard text:=private.discover_guard(p_engagement,true); l private.read_only_links;
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 if p_link is null then return jsonb_build_object('status','invalid_request'); end if;
 perform private.discover_lock(p_engagement);
 select * into l from private.read_only_links where id=p_link and engagement_id=p_engagement for update;
 if not found then return jsonb_build_object('status','not_found'); end if;
 if l.revoked_at is not null then return jsonb_build_object('status','already'); end if;
 update private.read_only_links set revoked_at=clock_timestamp(),revoked_by=private.clearway_user_id() where id=l.id;
 return jsonb_build_object('status','ok');
end $$;

-- ---------- The public page (service role, from the server) ----------
-- The signed-off report as reading text: the newest sign-off with its sources already stripped (report_signed_for_view), then only what a reader needs.
-- Per section: its sentences that are not part of a table (text, whether it is a quote, its thin-data label), and the table when it has one, with each row's
-- cells and parts as text. No sentence, source or record ids, no origin.
create function private.ro_report(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v jsonb:=private.report_signed_for_view(p_engagement);
begin
 if v is null then return null; end if;
 return jsonb_build_object('n',v->'n','signed_at',v->'signed_at','sections',coalesce((
  select jsonb_agg(jsonb_build_object('key',s.value->>'key','heading',s.value->>'heading','kind',s.value->>'kind',
   'sentences',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('text',x.value->>'text','quote',coalesce((x.value->>'quote')::boolean,false),'thin',nullif(x.value->>'thin_label',''))) order by x.ord)
     from jsonb_array_elements(coalesce(s.value->'sentences','[]'::jsonb)) with ordinality x(value,ord)
     where not exists(select 1 from jsonb_array_elements(case when jsonb_typeof(s.value->'blocks'->'rows')='array' then s.value->'blocks'->'rows' else '[]'::jsonb end) rw(value),
        jsonb_array_elements(case when jsonb_typeof(rw.value->'parts')='array' then rw.value->'parts' else '[]'::jsonb end) pt(value) where pt.value->>'sentence_id'=x.value->>'id')),'[]'::jsonb),
   'table',case when jsonb_typeof(s.value->'blocks'->'rows')='array' and jsonb_array_length(s.value->'blocks'->'rows')>0 then jsonb_build_object(
     'columns',case when jsonb_typeof(s.value->'blocks'->'columns')='array' then s.value->'blocks'->'columns' else '[]'::jsonb end,
     'rows',(select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('title',nullif(rw.value->>'title',''),'group',nullif(rw.value->>'group',''),
        'cells',case when jsonb_typeof(rw.value->'cells')='array' then rw.value->'cells' else '[]'::jsonb end,
        'parts',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('role',pt.value->>'role','owner',nullif(pt.value->>'owner',''),'due',nullif(pt.value->>'due',''),
            'text',(select y.value->>'text' from jsonb_array_elements(coalesce(s.value->'sentences','[]'::jsonb)) y(value) where y.value->>'id'=pt.value->>'sentence_id' limit 1))) order by pt.ord)
          from jsonb_array_elements(case when jsonb_typeof(rw.value->'parts')='array' then rw.value->'parts' else '[]'::jsonb end) with ordinality pt(value,ord)),'[]'::jsonb))) order by rw.ord)
       from jsonb_array_elements(s.value->'blocks'->'rows') with ordinality rw(value,ord))) end
  ) order by s.ord) from jsonb_array_elements(coalesce(v->'sections','[]'::jsonb)) with ordinality s(value,ord)),'[]'::jsonb));
end $$;

-- The one read behind /v/<token>. It is keyed by the SHA-256 of the token and records the open (count and last opened) only when it shows the plan.
-- An unknown token, a link turned off, a retreat not yet closed (or marked closed by mistake and undone) and a closed engagement all give the same
-- answer, so the page says nothing about which. The payload carries no submissions, scribe cards, drafts, sources, signals, emails, check-in notes or
-- attendee ids: the Map's Key Issues keep the pre-mortem risks and leave out the scribe's tensions and questions.
create function private.read_only_view(p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l private.read_only_links; e public.engagements; c public.churches; m jsonb; v_outcomes jsonb; v_intents jsonb; v_issues jsonb; v_map jsonb; t timestamptz:=clock_timestamp();
 gone jsonb:=jsonb_build_object('status','unavailable');
begin
 if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then return gone; end if;
 select * into l from private.read_only_links where token_hash=p_hash for update;
 if not found or l.revoked_at is not null then return gone; end if;
 select * into e from public.engagements where id=l.engagement_id and not deleted;
 if not found or e.status='closed' or e.day2_closed_at is null then return gone; end if;
 select * into c from public.churches where id=e.church_id and not deleted;
 if not found then return gone; end if;
 update private.read_only_links set open_count=open_count+1,last_opened_at=t where id=l.id;
 m:=private.map_assemble(e.id);
 if m is null then return gone; end if;

 -- Vision Outcomes with their indicators, and under each every 1-year goal (not only those that meet CORE; an empty owner or date stays empty) with the status the owner gave in their newest check-in (a label and a date).
 select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('n',o.value->'n','title',o.value->'title','description',o.value->'description','status',o.value->'status','stop',o.value->'stop',
   'indicators',coalesce(o.value->'indicators','[]'::jsonb),
   'goals',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('title',g.title,'result',nullif(g.result,''),'owner',coalesce(a.name,nullif(g.owner_name,'')),'end_date',g.end_date,'season',g.season,
        'status',s.status,'status_on',s.answered_on)) order by g.position,g.id)
      from private.goals g
       join (select y.id,row_number() over(order by y.position,y.id)::text as rn from private.vision_outcomes y where y.engagement_id=e.id and not y.deleted) r on r.id=g.outcome_id
       left join public.attendees a on a.id=g.owner_attendee_id and a.engagement_id=g.engagement_id and not a.deleted
       left join private.check_in_latest_for_view(e.id) s on s.goal_id=g.id
      where g.engagement_id=e.id and not g.deleted and r.rn=o.value->>'n'),'[]'::jsonb))) order by o.ord),'[]'::jsonb) into v_outcomes
 from jsonb_array_elements(coalesce(m->'page1'->'vision'->'outcomes','[]'::jsonb)) with ordinality o(value,ord);

 -- The commander's intent cards with their first steps (owner and date). Numbered as the Vision Outcomes are.
 select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('n',x.rn,'outcome',x.title,'intent',nullif(x.intent,''),'must_do',nullif(x.must_do,''),'stop',nullif(x.what_we_stop,''),
   'steps',x.steps)) order by x.rn),'[]'::jsonb) into v_intents
 from (select r.rn,r.title,ic.intent,ic.must_do,ic.what_we_stop,
    coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('text',s.text,'owner',coalesce(a.name,s.owner_name),'due',s.due_date)) order by s.position,s.created_at,s.id)
      from private.first_steps s left join public.attendees a on a.id=s.owner_attendee_id and a.engagement_id=s.engagement_id and not a.deleted
      where s.card_id=ic.id and s.engagement_id=ic.engagement_id and not s.deleted),'[]'::jsonb) as steps
   from (select y.id,y.engagement_id,y.title,row_number() over(order by y.position,y.id) as rn from private.vision_outcomes y where y.engagement_id=e.id and not y.deleted) r
    join private.intent_cards ic on ic.outcome_id=r.id and ic.engagement_id=r.engagement_id and not ic.deleted) x
 where x.intent<>'' or x.must_do<>'' or x.what_we_stop<>'' or jsonb_array_length(x.steps)>0;

 -- The Map. Key Issues keep the pre-mortem risks only. The goals are listed under their outcomes, so the Map's own goal lists, ids and counts are left out.
 select coalesce(jsonb_agg(i.value order by i.ord),'[]'::jsonb) into v_issues
 from jsonb_array_elements(coalesce(m->'page2'->'issues'->'items','[]'::jsonb)) with ordinality i(value,ord) where i.value->>'kind'='risk';
 v_map:=jsonb_build_object(
  'page1',jsonb_build_object('mission',m->'page1'->'mission','purpose',m->'page1'->'purpose','values',m->'page1'->'values','strategy',m->'page1'->'strategy','future',m->'page1'->'future',
   'vision',jsonb_build_object('year',m->'page1'->'vision'->'year','empty',coalesce((m->'page1'->'vision'->>'empty')::boolean,false),'why',m->'page1'->'vision'->'why',
     'outcomes',coalesce((select jsonb_agg(jsonb_build_object('n',o.value->'n','title',o.value->'title','status',o.value->'status') order by o.ord)
        from jsonb_array_elements(coalesce(m->'page1'->'vision'->'outcomes','[]'::jsonb)) with ordinality o(value,ord)),'[]'::jsonb))),
  'page2',jsonb_build_object('priorities',m->'page2'->'priorities',
   'outlook',jsonb_build_object('year',m->'page2'->'outlook'->'year','metrics',m->'page2'->'outlook'->'metrics','celebrations',m->'page2'->'outlook'->'celebrations'),
   'rhythms',m->'page2'->'rhythms',
   'issues',case when jsonb_array_length(v_issues)=0 then jsonb_build_object('empty',true,'why','No risks recorded yet') else jsonb_build_object('items',v_issues) end));

 return jsonb_build_object('status','ok','church',c.name,'title',e.title,'years',m->'years','map',v_map,'outcomes',v_outcomes,'intents',v_intents,'report',private.ro_report(e.id));
end $$;

-- ---------- Public wrappers: security invoker, every check is in the private function ----------
create function public.retreat_mark_closed(p_engagement uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.retreat_mark_closed(p_engagement) $$;
create function public.retreat_reopen(p_engagement uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.retreat_reopen(p_engagement) $$;
create function public.share_state(p_engagement uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.share_state(p_engagement) $$;
create function public.share_link_create(p_engagement uuid,p_name text,p_hash text) returns jsonb
language sql security invoker set search_path='' as $$ select private.share_link_create(p_engagement,p_name,p_hash) $$;
create function public.share_link_revoke(p_engagement uuid,p_link uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.share_link_revoke(p_engagement,p_link) $$;
create function public.read_only_view(p_hash text) returns jsonb
language sql security invoker set search_path='' as $$ select private.read_only_view(p_hash) $$;

revoke all on function private.retreat_closed_on(uuid),private.retreat_close(uuid,timestamptz),private.retreat_day2_closed(),private.retreat_mark_closed(uuid),private.retreat_reopen(uuid),
 private.share_state(uuid),private.share_link_create(uuid,text,text),private.share_link_revoke(uuid,uuid),private.ro_report(uuid),private.read_only_view(text),
 public.retreat_mark_closed(uuid),public.retreat_reopen(uuid),public.share_state(uuid),public.share_link_create(uuid,text,text),public.share_link_revoke(uuid,uuid),public.read_only_view(text)
 from public,anon,authenticated;
grant execute on function private.retreat_mark_closed(uuid),private.retreat_reopen(uuid),private.share_state(uuid),private.share_link_create(uuid,text,text),private.share_link_revoke(uuid,uuid),
 public.retreat_mark_closed(uuid),public.retreat_reopen(uuid),public.share_state(uuid),public.share_link_create(uuid,text,text),public.share_link_revoke(uuid,uuid) to authenticated;
-- Step 2's contract function stays the server's, as it was.
grant execute on function private.retreat_closed_on(uuid),private.read_only_view(text),public.read_only_view(text) to service_role;

-- ---------- The practice room's reset and Clear test answers ----------
-- Each is the newest definition at the time this migration runs, renamed to _pre_read_only and wrapped, so every earlier step's clearing stays in place
-- whichever steps merged first. The practice room's links are put away whole and its Day 2 is open again, so the retreat can be closed and shared again.
create function private.ro_clear(p_engagement uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 delete from private.read_only_links where engagement_id=p_engagement;
 update public.engagements set day2_closed_at=null where id=p_engagement;
end $$;

alter function private.reset_practice_room() rename to reset_practice_room_pre_read_only;
alter function private.rehearsal_control(uuid,uuid,text) rename to rehearsal_control_pre_read_only;

create function private.reset_practice_room() returns boolean
language plpgsql security definer set search_path='' as $$
declare eng uuid:='90000000-0000-4000-8000-000000000010'::uuid; ok boolean;
begin
 ok:=private.reset_practice_room_pre_read_only();
 if ok then perform private.ro_clear(eng); end if;
 return ok;
end $$;

create function private.rehearsal_control(p_engagement uuid,p_id uuid,p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare out jsonb;
begin
 out:=private.rehearsal_control_pre_read_only(p_engagement,p_id,p_action);
 if p_action='clear' and p_engagement='90000000-0000-4000-8000-000000000010'::uuid and out->>'status'='ok' then perform private.ro_clear(p_engagement); end if;
 return out;
end $$;

revoke all on function private.ro_clear(uuid),private.reset_practice_room_pre_read_only(),private.reset_practice_room(),private.rehearsal_control_pre_read_only(uuid,uuid,text),private.rehearsal_control(uuid,uuid,text) from public,anon,authenticated;
grant execute on function private.reset_practice_room(),private.rehearsal_control(uuid,uuid,text) to authenticated;
commit;
