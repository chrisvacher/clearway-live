-- The live room, simple and predictable (November 16, before Pickering). Chris's three rules for the room:
--   1. Steps stay open until they are ended. Next, Back and Go live only change what the TV shows. Nothing closes except
--      End workshop, Close part (Close day), or Stop answers on that step. This replaces the November 1 rule that a step
--      closes when the room leaves its segment; it applies to every engagement, Wayfinding included, with Close day still
--      the Wayfinding boundary.
--   2. Anyone can go back. Any earlier step sent to the TV is live and answering; phones answer any step still open.
--   3. The TV comes from the live room (the app's part; here, a TV window whose workshop ended says so).
--
-- 1. sessions.closed_by says why a step is closed: 'stop' (Stop answers), 'part' (Close part) or 'end' (End workshop).
--    It clears whenever the step leaves closed. Steps closed before today are labelled: a workshop's as 'end' (the old
--    navigation rule or End closed them, and neither should keep a workshop step closed), anything else's as 'part'.
-- 2. room_control is redefined from its definition as it stands (handover_intent, with the later rewrites by discover
--    records, tv_screens and hide_response carried forward exactly; the image and timer migrations wrap it only through
--    room_states triggers, which are untouched). Changes: the navigation auto-close is gone; Stop answers and Take answers
--    are new presses, for the facilitators and the team facilitator inside their block; Close part records 'part'.
-- 3. End workshop records 'end' on the steps it closes, and marks each TV window it unpairs as ended. Reopening the
--    engagement reopens exactly the steps End closed. The TV pairing revocation itself is kept: an ended TV window shows
--    "Workshop ended" (status 'ended', for 12 hours) instead of a fresh code, until Open the TV pairs that same window.
-- 4. Start fresh: one press, refused while a step is live. Every answer, vote and AI/heard state in the engagement goes,
--    through the same chain as Clear test answers, every step goes back to Ready, the timer clears and phones reload.
--    TV pairings and phone sign-ins stay. Logged in the rehearsal log (fresh). Not for the practice engagement, which
--    keeps Reset practice room.
-- 5. control_status carries each live step's answer count for the run of show, and whether the last clear was Start fresh.
begin;

-- ---------- 1. Why a step is closed ----------
alter table public.sessions add column closed_by text check (closed_by in ('stop','part','end'));
create function private.session_closed_by() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.state<>'closed' then new.closed_by:=null; end if;
 return new;
end $$;
revoke all on function private.session_closed_by() from public,anon,authenticated;
create trigger session_closed_by before update of state on public.sessions for each row
 when (old.state is distinct from new.state) execute function private.session_closed_by();
update public.sessions s set closed_by=case when e.type='team_workshop' then 'end' else 'part' end
 from public.engagements e where e.id=s.engagement_id and s.state='closed' and s.mode='live' and s.closed_by is null;

-- ---------- 2. The room's controls ----------
create or replace function private.room_control(p_engagement uuid,p_id uuid,p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $function$
declare
 r public.room_states; cur public.sessions; target public.sessions; anchor public.sessions; done private.room_controls;
 v_live uuid; v_content text; v_down boolean; v_burst timestamptz; v_spot text; v_keys text[]; v_ids uuid[]; v_refresh bigint; v_tv boolean;
 item text; minutes integer; who text; navigation boolean; touches boolean:=true; room_changed boolean:=true; size text; v_part text;
 closed_live boolean; closed_self integer:=0; at_close timestamptz; actor text; blk uuid[];
begin
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if not found then return jsonb_build_object('status','denied'); end if;
 -- The facilitator presses everything. The team facilitator, on their phone or through a follow-up
 -- grant, presses only these, and only inside the team-led block.
 actor:=private.remote_actor(p_engagement);
 if actor is null or (actor='team' and coalesce(p_action,'') not in ('go_live','next','back','reopen','stop_answers','take_answers','phones_down','open_phones','spotlight','clear_spotlight','room_size')) then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 if p_id is null or p_action is null or jsonb_typeof(p) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 select * into done from private.room_controls where id=p_id;
 if found then
  if done.engagement_id<>p_engagement or done.action<>p_action then return jsonb_build_object('status','conflict'); end if;
  return jsonb_build_object('status','duplicate','version',r.version);
 end if;
 navigation:=p_action in ('go_live','next','back','nothing_live','reopen','tv_screen');
 if actor='team' then
  blk:=private.team_block(p_engagement,r.team_led_block_id);
  if p_action not in ('go_live','next','back') and not coalesce(r.live_session_id=any(blk),false) then return jsonb_build_object('status','outside_block'); end if;
 end if;
 -- A press made against a room that has already moved is refused, never replayed.
 if p_action not in ('refresh_phones','tv_on_phones','room_size','close_part') then
  if not (p ? 'from') or (p->>'from' is not null and p->>'from' !~ '^[0-9a-f-]{36}$') then return jsonb_build_object('status','invalid_request'); end if;
  if (p->>'from')::uuid is distinct from r.live_session_id then
   select c.name into who from private.room_controls x join public.clearway_users c on c.id=x.actor_id
    where x.engagement_id=p_engagement and x.room_version<=r.version order by x.created_at desc limit 1;
   return jsonb_build_object('status','moved','version',r.version,'live_session_id',r.live_session_id,
    'title',(select title from public.sessions where id=r.live_session_id),'by',split_part(btrim(coalesce(who,'')),' ',1));
  end if;
 end if;
 if r.live_session_id is not null then select * into cur from public.sessions where id=r.live_session_id and not deleted for update; end if;
 v_live:=r.live_session_id; v_content:=r.tv_content; v_down:=r.phones_down; v_burst:=r.burst_ends_at; v_spot:=r.spotlight_key;
 v_keys:=r.hidden_keys; v_ids:=r.hidden_ids; v_refresh:=r.phone_refresh_version; v_tv:=r.show_tv_on_phones;
 if v_burst is not null and v_burst<=clock_timestamp() then v_burst:=null; v_down:=v_live is not null; end if;

 if navigation then
  if p_action='go_live' then
   if p->>'session' is null or p->>'session' !~ '^[0-9a-f-]{36}$' then return jsonb_build_object('status','invalid_request'); end if;
   select * into target from public.sessions where id=(p->>'session')::uuid and engagement_id=p_engagement and not deleted for update;
   if not found or target.mode<>'live' then return jsonb_build_object('status','missing'); end if;
   if target.id=cur.id then return jsonb_build_object('status','unchanged','version',r.version); end if;
   if target.state='draft' then return jsonb_build_object('status','not_ready'); end if;
  elsif p_action in ('next','back') then
   if cur.id is not null then anchor:=cur;
   else select * into anchor from public.sessions where engagement_id=p_engagement and not deleted and shown_at is not null order by shown_at desc,id limit 1; end if;
   if p_action='back' and cur.id is null and anchor.id is not null then target:=anchor;
   elsif p_action='next' then
    select s.* into target from public.sessions s where s.engagement_id=p_engagement and not s.deleted and s.mode='live' and s.state<>'draft'
     and (anchor.id is null or (private.part_order(s.part),s.position,s.id)>(private.part_order(anchor.part),anchor.position,anchor.id))
     order by private.part_order(s.part),s.position,s.id limit 1;
   elsif anchor.id is not null then
    select s.* into target from public.sessions s where s.engagement_id=p_engagement and not s.deleted and s.mode='live' and s.state<>'draft'
     and (private.part_order(s.part),s.position,s.id)<(private.part_order(anchor.part),anchor.position,anchor.id)
     order by private.part_order(s.part) desc,s.position desc,s.id desc limit 1;
   end if;
   if target.id is null then return jsonb_build_object('status','no_session'); end if;
   perform 1 from public.sessions where id=target.id for update;
  elsif p_action='tv_screen' then
   if p->>'screen' is null or p->>'screen' not in ('blackout','join','holding') then return jsonb_build_object('status','invalid_request'); end if;
   if cur.id is null and r.tv_content=p->>'screen' then return jsonb_build_object('status','unchanged','version',r.version); end if;
  elsif p_action='nothing_live' then
   if cur.id is null then return jsonb_build_object('status','unchanged','version',r.version); end if;
  elsif p_action='reopen' then
   if cur.id is null or cur.state<>'closed' then return jsonb_build_object('status','invalid_state'); end if;
  end if;
  if actor='team' and p_action in ('go_live','next','back') and not coalesce(target.id=any(blk),false) then return jsonb_build_object('status','outside_block'); end if;
  if p_action<>'reopen' then
   -- The step left behind stays open and answering (November 16: steps stay open until they are ended). Next, Back,
   -- Go live, Home and the TV screens only change what the TV shows; nothing here closes a step.
   if cur.id is not null and cur.state in ('live','phones_down') then update public.sessions set state='open' where id=cur.id; end if;
  end if;
  if p_action='reopen' then
   update public.sessions set state='live',closed_at=null,shown_at=clock_timestamp() where id=cur.id;
   v_down:=false; v_burst:=null;
  elsif p_action='tv_screen' then
   v_live:=null; v_content:=p->>'screen'; v_down:=false; v_burst:=null;
  elsif p_action='nothing_live' then
   v_live:=null; v_content:='holding'; v_down:=false; v_burst:=null;
  else
   -- A step left open goes live and answering. A stopped or closed step stays stopped on the TV until Take answers.
   update public.sessions set state=case when state='closed' then 'closed' else 'live' end,shown_at=clock_timestamp() where id=target.id;
   v_live:=target.id; v_content:='session'; v_down:=false; v_burst:=null;
  end if;
  if v_live is distinct from r.live_session_id then
   v_spot:=null;
   v_keys:=coalesce((select hidden_keys from public.sessions where id=v_live),array[]::text[]);
   v_ids:=coalesce((select array_agg(x.id order by x.id) from public.submissions x where x.session_id=v_live and x.hidden and not x.deleted),array[]::uuid[]);
  end if;
 elsif p_action in ('start_burst','extend_burst','end_burst','phones_down','open_phones') then
  if cur.id is null or not coalesce((private.kind(cur.interaction)).input,false) or cur.state not in ('live','phones_down') then return jsonb_build_object('status','invalid_state'); end if;
  if p_action='start_burst' then
   minutes:=case when p->>'minutes' in ('3','4','5') then (p->>'minutes')::integer end;
   if minutes is null then return jsonb_build_object('status','invalid_request'); end if;
   if v_burst is not null then return jsonb_build_object('status','invalid_state'); end if;
   v_burst:=clock_timestamp()+make_interval(mins=>minutes); v_down:=false;
  elsif p_action='extend_burst' then
   if v_burst is null then return jsonb_build_object('status','invalid_state'); end if;
   v_burst:=least(v_burst+interval '1 minute',clock_timestamp()+interval '20 minutes');
  elsif p_action in ('end_burst','phones_down') then
   if (p_action='end_burst' and v_burst is null) or (p_action='phones_down' and v_down) then return jsonb_build_object('status','invalid_state'); end if;
   v_burst:=null; v_down:=true;
  else
   if not v_down then return jsonb_build_object('status','invalid_state'); end if;
   v_down:=false; v_burst:=null;
  end if;
  update public.sessions set state=case when v_down then 'phones_down' else 'live' end where id=cur.id and state is distinct from case when v_down then 'phones_down' else 'live' end;
 elsif p_action in ('spotlight','clear_spotlight','hide','unhide') then
  if cur.id is null or coalesce((private.kind(cur.interaction)).spotlight,'none')='none' then return jsonb_build_object('status','invalid_state'); end if;
  if p_action='clear_spotlight' then
   if v_spot is null then return jsonb_build_object('status','unchanged','version',r.version); end if;
   v_spot:=null;
  else
   item:=p->>'item';
   if item is null or length(item) not between 1 and 200 then return jsonb_build_object('status','invalid_request'); end if;
   if (private.kind(cur.interaction)).spotlight='id' then
    if item !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or not exists(select 1 from public.submissions where id=item::uuid and session_id=cur.id and not deleted and not withdrawn) then return jsonb_build_object('status','missing'); end if;
   elsif not exists(select 1 from public.submissions x cross join lateral jsonb_array_elements(x.answers) a
     where x.session_id=cur.id and not x.deleted and not x.withdrawn and a->>'key'=item)
     and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof(cur.options->'items')='array' then cur.options->'items' else '[]'::jsonb end) o where o->>'key'=item) then return jsonb_build_object('status','missing'); end if;
   if p_action='spotlight' then
    if item=any(v_keys) or ((private.kind(cur.interaction)).spotlight='id' and item::uuid=any(v_ids)) then return jsonb_build_object('status','hidden'); end if;
    v_spot:=item;
   elsif (private.kind(cur.interaction)).spotlight='id' then
    update public.submissions set hidden=(p_action='hide') where id=item::uuid and hidden is distinct from (p_action='hide');
    if not found then return jsonb_build_object('status','unchanged','version',r.version); end if;
    v_ids:=coalesce((select array_agg(x.id order by x.id) from public.submissions x where x.session_id=cur.id and x.hidden and not x.deleted),array[]::uuid[]);
    perform set_config('clearway.live_answer',(select jsonb_build_object('id',x.id,'session_id',x.session_id,'revision',x.revision,'withdrawn',false,'hidden',x.hidden,
     'text',case when not x.hidden then x.text end,'answers',case when not x.hidden then x.answers else '[]'::jsonb end) from public.submissions x where x.id=item::uuid)::text,true);
   else
    if (p_action='hide')=(item=any(v_keys)) then return jsonb_build_object('status','unchanged','version',r.version); end if;
    v_keys:=case when p_action='hide' then array_append(array_remove(v_keys,item),item) else array_remove(v_keys,item) end;
    update public.sessions set hidden_keys=v_keys where id=cur.id;
   end if;
   if p_action='hide' and v_spot=item then v_spot:=null; end if;
  end if;
 elsif p_action in ('stop_answers','take_answers') then
  -- Stop answers / Take answers (November 16): the live step, or the step named. A stopped step stays stopped when it
  -- goes live again, until Take answers. Phones can answer any step that is open.
  if p ? 'session' then
   if p->>'session' is null or p->>'session' !~ '^[0-9a-f-]{36}$' then return jsonb_build_object('status','invalid_request'); end if;
   select * into target from public.sessions where id=(p->>'session')::uuid and engagement_id=p_engagement and not deleted for update;
  elsif cur.id is not null then target:=cur;
  end if;
  if target.id is null or target.mode<>'live' then return jsonb_build_object('status','missing'); end if;
  if not coalesce((private.kind(target.interaction)).input,false) then return jsonb_build_object('status','invalid_state'); end if;
  if actor='team' and not coalesce(target.id=any(blk),false) then return jsonb_build_object('status','outside_block'); end if;
  if p_action='stop_answers' then
   if target.state='closed' then return jsonb_build_object('status','unchanged','version',r.version); end if;
   if target.state not in ('open','live','phones_down') then return jsonb_build_object('status','invalid_state'); end if;
   update public.sessions set state='closed',closed_at=clock_timestamp(),closed_by='stop' where id=target.id;
  else
   if target.state<>'closed' then return jsonb_build_object('status','unchanged','version',r.version); end if;
   update public.sessions set state=case when target.id=cur.id then 'live' else 'open' end,closed_at=null where id=target.id;
  end if;
  if target.id=cur.id then v_down:=false; v_burst:=null; end if;
 elsif p_action='refresh_phones' then v_refresh:=v_refresh+1;
 elsif p_action='tv_on_phones' then
  if jsonb_typeof(p->'on') is distinct from 'boolean' then return jsonb_build_object('status','invalid_request'); end if;
  v_tv:=(p->>'on')::boolean;
 elsif p_action='room_size' then
  size:=p->>'size';
  if size is null or size not in ('very_small','small','medium','large','very_large') then return jsonb_build_object('status','invalid_request'); end if;
  -- The appearance trigger raises the version and broadcasts this saved edit.
  update public.engagements set settings=settings||jsonb_build_object('room_size',size) where id=p_engagement and settings->>'room_size' is distinct from size;
  if not found then return jsonb_build_object('status','unchanged','version',r.version); end if;
  touches:=false;
 elsif p_action='close_part' then
  v_part:=p->>'part';
  if v_part is null or v_part not in ('Discover','Pre-call','Day 1','Day 2','Follow-up') then return jsonb_build_object('status','invalid_request'); end if;
  perform 1 from public.sessions where engagement_id=p_engagement and part=p->>'part' and not deleted order by id for update;
  update public.sessions set state='closed',closed_at=clock_timestamp(),closed_by='part'
   where engagement_id=p_engagement and part=p->>'part' and not deleted and mode='live' and state in ('live','phones_down','open');
  closed_live:=found;
  -- A self-paced step still open in that part closes now too: its close time becomes now, so
  -- the clock (private.session_state), the phones' window, the 2-minute grace for queued
  -- answers and the export all read the same close. One that has not opened yet is left alone.
  at_close:=clock_timestamp();
  update public.sessions set closes_at=at_close,closed_at=at_close
   where engagement_id=p_engagement and part=p->>'part' and not deleted and mode='self_paced' and state<>'draft' and opens_at<at_close and closes_at>at_close;
  get diagnostics closed_self=row_count;
  if not closed_live and closed_self=0 then return jsonb_build_object('status','unchanged','version',r.version); end if;
  -- Ending the day while one of its steps is on the TV goes to the holding screen.
  if cur.part=v_part then v_live:=null; v_content:='holding'; v_down:=false; v_burst:=null; v_spot:=null; v_keys:=array[]::text[]; v_ids:=array[]::uuid[];
  else room_changed:=false; end if;
 else return jsonb_build_object('status','invalid_request');
 end if;

 if touches then
  -- One update, one version, one verified broadcast. close_part on an earlier
  -- day still raises a version so every surface reads the closed steps.
  update public.room_states set live_session_id=v_live,tv_content=v_content,phones_down=v_down,burst_ends_at=v_burst,spotlight_key=v_spot,
   hidden_keys=v_keys,hidden_ids=v_ids,phone_refresh_version=v_refresh,show_tv_on_phones=v_tv,
   results=private.live_results_for(p_engagement,v_live,v_keys) where engagement_id=p_engagement returning * into r;
 else select * into r from public.room_states where engagement_id=p_engagement;
 end if;
 perform set_config('clearway.live_answer','',true);
 insert into private.room_controls(id,engagement_id,actor_id,action,session_id,room_version,created_at) values(p_id,p_engagement,private.clearway_user_id(),p_action,v_live,r.version,clock_timestamp());
 if actor='team' then select private.first_name(a.name) into who from public.attendees a where a.id=r.remote_holder_id;
 else select split_part(btrim(name),' ',1) into who from public.clearway_users where id=private.clearway_user_id(); end if;
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','control','id',p_id,'action',p_action,'by',who,'version',r.version,'changed',room_changed));
 return jsonb_build_object('status','ok','version',r.version);
exception when invalid_text_representation then return jsonb_build_object('status','invalid_request');
end $function$;


-- ---------- 3. End workshop, Reopen, and the TV window left on screen ----------
alter table private.tv_devices add column ended_engagement_id uuid references public.engagements(id) on delete set null, add column ended_at timestamptz;
create index tv_devices_ended_engagement_idx on private.tv_devices(ended_engagement_id);
-- Pairing the window again, by Open the TV or a code, clears the ended screen.
create function private.tv_device_paired_again() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.engagement_id is not null then new.ended_engagement_id:=null; new.ended_at:=null; end if;
 return new;
end $$;
revoke all on function private.tv_device_paired_again() from public,anon,authenticated;
create trigger tv_device_paired_again before update of engagement_id on private.tv_devices for each row execute function private.tv_device_paired_again();

create or replace function private.close_live_engagement() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if (new.status='closed' and old.status<>'closed') or (new.deleted and not old.deleted) then
    -- Match the editor: room before sessions, so closing cannot deadlock a Save.
    perform 1 from public.room_states where engagement_id=new.id for update;
    delete from auth.sessions where id in(select auth_session_id from private.live_tv_sessions where engagement_id=new.id and revoked_at is null and not deleted);
    -- The pairing is revoked; the window remembers which workshop ended, so it says so instead of showing a new code.
    update private.tv_devices set ended_engagement_id=case when new.deleted then null else engagement_id end,ended_at=case when new.deleted then null else clock_timestamp() end,
      engagement_id=null,paired_at=null,code_hash=null,code_expires_at=null,claim_id=null,claim_started_at=null where engagement_id=new.id;
    update private.live_tv_sessions set revoked_at=coalesce(revoked_at,clock_timestamp()) where engagement_id=new.id;
    update public.sessions set state='closed',closed_at=coalesce(closed_at,clock_timestamp()),closed_by='end' where engagement_id=new.id and state in ('live','phones_down','open');
    update public.room_states set live_session_id=null,tv_content='holding',phones_down=false,burst_ends_at=null,spotlight_id=null,
      hidden_ids=array[]::uuid[],remote_holder_id=null,team_led_block_id=null,show_tv_on_phones=false,
      results='{"total":0,"people":0,"words":[]}',deleted=new.deleted where engagement_id=new.id;
  end if;
  return new;
end $$;

-- Reopen workshop: the steps End closed take answers again. Steps stopped by hand or closed with their part stay closed.
create function private.reopen_ended_steps() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.status='closed' and new.status<>'closed' and not new.deleted then
  perform 1 from public.room_states where engagement_id=new.id and not deleted for update;
  update public.sessions set state='open',closed_at=null
   where engagement_id=new.id and not deleted and mode='live' and state='closed' and closed_by='end';
  update public.room_states set results=private.live_results(new.id) where engagement_id=new.id and not deleted;
 end if;
 return new;
end $$;
revoke all on function private.reopen_ended_steps() from public,anon,authenticated;
create trigger live_engagement_reopened after update of status on public.engagements for each row execute function private.reopen_ended_steps();

-- The TV window's own check: an ended window says so for 12 hours rather than offering a code.
do $patch$
declare def text; patched text;
begin
 def:=pg_get_functiondef('private.tv_device(text,jsonb)'::regprocedure);
 patched:=replace(def,E' if d.engagement_id is null then\n  if p_action<>''sync'' then return jsonb_build_object(''status'',''denied''); end if;\n',
  E' if d.engagement_id is null then\n  if p_action<>''sync'' then return jsonb_build_object(''status'',''denied''); end if;\n  if d.ended_engagement_id is not null and d.ended_at>now()-interval ''12 hours'' then return jsonb_build_object(''status'',''ended''); end if;\n');
 if patched=def then raise exception 'The unpaired branch in tv_device did not patch cleanly'; end if;
 execute patched;
end $patch$;

-- ---------- 4. Start fresh ----------
alter table private.rehearsal_log add column fresh boolean not null default false;
create function private.start_fresh(p_engagement uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; e public.engagements; done private.rehearsal_log; out jsonb; n_steps integer:=0;
begin
 if p_engagement is null or p_id is null then return jsonb_build_object('status','invalid_request'); end if;
 -- The room lock first, as every room press takes it.
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if not found or not coalesce(private.show_allowed(p_engagement),false) or private.live_role(p_engagement) is distinct from 'facilitator' then return jsonb_build_object('status','denied'); end if;
 select * into e from public.engagements where id=p_engagement and not deleted;
 if e.status='closed' then return jsonb_build_object('status','closed'); end if;
 if e.type='practice' then return jsonb_build_object('status','practice'); end if;
 select * into done from private.rehearsal_log where id=p_id;
 if found then
  if done.engagement_id<>p_engagement or not done.fresh then return jsonb_build_object('status','conflict'); end if;
  return jsonb_build_object('status','duplicate','answers',done.answers,'sessions',done.sessions,'version',r.version);
 end if;
 if r.live_session_id is not null then return jsonb_build_object('status','live','title',(select title from public.sessions where id=r.live_session_id)); end if;
 -- Everything answered in this room becomes a test answer, so Clear test answers takes all of it, with the AI's and
 -- What We Heard's work made from it, the way it takes a rehearsal's.
 update public.submissions set test=true where engagement_id=p_engagement and not deleted and not test;
 update private.qa_votes set test=true where engagement_id=p_engagement and not deleted and not test;
 update private.ranking_suggestions set test=true where engagement_id=p_engagement and not deleted and not test;
 update private.candidate_suggestions set test=true where engagement_id=p_engagement and not deleted and not test;
 update private.four_list_agrees set test=true where engagement_id=p_engagement and not deleted and not test;
 update private.heard_drafts set test=true where engagement_id=p_engagement and not deleted and not test;
 update private.signals set test=true where engagement_id=p_engagement and not deleted and not test;
 -- A running rehearsal ends with it.
 if private.rehearsing(p_engagement) is not null then
  insert into private.rehearsal_log(id,engagement_id,actor_id,action,created_at) values(gen_random_uuid(),p_engagement,private.clearway_user_id(),'end',clock_timestamp());
 end if;
 out:=private.rehearsal_control(p_engagement,p_id,'clear');
 if out->>'status' is distinct from 'ok' then raise exception 'Start fresh could not clear the answers: %',out->>'status'; end if;
 -- Every step back to Ready, as if it had never been shown. (session_reset clears its hidden words and shown time.)
 update public.sessions set state='ready',closed_at=null,shown_at=null,hidden_keys=array[]::text[]
  where engagement_id=p_engagement and not deleted and mode='live' and state<>'draft' and (state<>'ready' or shown_at is not null or cardinality(hidden_keys)>0);
 get diagnostics n_steps=row_count;
 -- One version for every surface. Phones reload, so nothing they held from before stays on screen; they stay signed in.
 update public.room_states set timer=null,spotlight_key=null,spotlight_id=null,hidden_keys=array[]::text[],hidden_ids=array[]::uuid[],phones_down=false,burst_ends_at=null,
   neutral_question=null,phone_refresh_version=phone_refresh_version+1,results=private.live_results(p_engagement)
  where engagement_id=p_engagement returning * into r;
 update private.rehearsal_log set fresh=true,sessions=n_steps where id=p_id and engagement_id=p_engagement;
 return out||jsonb_build_object('status','ok','sessions',n_steps,'version',r.version);
end $$;
create function public.start_fresh(p_engagement uuid,p_id uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.start_fresh(p_engagement,p_id) $$;
revoke all on function private.start_fresh(uuid,uuid),public.start_fresh(uuid,uuid) from public,anon,authenticated;
grant execute on function private.start_fresh(uuid,uuid),public.start_fresh(uuid,uuid) to authenticated;

-- ---------- 5. The run of show's counts ----------
do $patch$
declare def text; patched text;
begin
 def:=pg_get_functiondef('private.control_status(uuid)'::regprocedure);
 patched:=replace(def,E'  ''self_paced'',coalesce((select jsonb_agg(',
  E'  ''step_answers'',coalesce((select jsonb_object_agg(x.id,(select count(*) from public.submissions y where y.session_id=x.id and not y.deleted and not y.withdrawn and not y.hidden))\n    from public.sessions x where x.engagement_id=p_engagement and not x.deleted and x.mode=''live''),''{}''::jsonb),\n  ''answers_total'',(select count(*) from public.submissions y where y.engagement_id=p_engagement and not y.deleted and not y.withdrawn),\n  ''self_paced'',coalesce((select jsonb_agg(');
 if patched=def then raise exception 'The self-paced list in control_status did not patch cleanly'; end if;
 def:=patched;
 patched:=replace(def,'jsonb_build_object(''at'',last_clear.created_at,''answers'',last_clear.answers,','jsonb_build_object(''at'',last_clear.created_at,''fresh'',last_clear.fresh,''answers'',last_clear.answers,');
 if patched=def then raise exception 'The last clear in control_status did not patch cleanly'; end if;
 execute patched;
end $patch$;

commit;
