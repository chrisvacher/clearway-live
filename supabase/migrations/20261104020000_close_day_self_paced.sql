-- Fix after the practice-room run (November 3): Close the day closes self-paced steps too.
--
-- The PRD makes Close the day the backstop for anything still open: Close Pre-call, Close
-- Day 1, Close Day 2 and Close Follow-up close every step still open in that part, so the
-- overnight report works from a fixed set of answers. close_part only closed live-mode steps,
-- so a self-paced step in the part stayed open on phones after Close Day 1.
--
-- A self-paced step's state follows its clock (private.session_state): Ready before its open
-- time, Open between its times, Closed after. Closing one early therefore sets its close time
-- (closes_at) to the moment of the press, and records closed_at. Everything that reads the
-- window then agrees it is closed: the phones' own view, the control surface's self-paced
-- list, live_submit (with its 2-minute grace for answers queued before the close) and the
-- export. A self-paced step that has not opened yet, or has already closed, is untouched, and
-- so is a draft. Pressing Close the day when only a self-paced step is open now closes it
-- instead of answering unchanged.
--
-- Shared functions redefined: private.room_control only, copied from
-- 20261103040000_interaction_engine.sql. Only its close_part branch changes: it also locks
-- the part's self-paced rows and closes the open ones as above. Live steps close exactly as
-- before, the TV goes to its holding screen by the same rule, the press is logged in
-- private.room_controls, the version is raised once and broadcast, and the facilitator
-- notice is sent as before. Every other action is unchanged.
begin;

create or replace function private.room_control(p_engagement uuid,p_id uuid,p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 r public.room_states; cur public.sessions; target public.sessions; anchor public.sessions; done private.room_controls;
 v_live uuid; v_content text; v_down boolean; v_burst timestamptz; v_spot text; v_keys text[]; v_ids uuid[]; v_refresh bigint; v_tv boolean;
 item text; minutes integer; who text; navigation boolean; touches boolean:=true; room_changed boolean:=true; size text; v_part text;
 closed_live boolean; closed_self integer:=0; at_close timestamptz;
begin
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if not found or not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 if p_id is null or p_action is null or jsonb_typeof(p) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 select * into done from private.room_controls where id=p_id;
 if found then
  if done.engagement_id<>p_engagement or done.action<>p_action then return jsonb_build_object('status','conflict'); end if;
  return jsonb_build_object('status','duplicate','version',r.version);
 end if;
 navigation:=p_action in ('go_live','next','back','nothing_live','reopen');
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
  elsif p_action='nothing_live' then
   if cur.id is null then return jsonb_build_object('status','unchanged','version',r.version); end if;
  elsif p_action='reopen' then
   if cur.id is null or cur.state<>'closed' then return jsonb_build_object('status','invalid_state'); end if;
  end if;
  if p_action<>'reopen' then
   -- The step left behind stays open for late answers while the room is in its segment.
   if cur.id is not null and cur.state in ('live','phones_down') then update public.sessions set state='open' where id=cur.id; end if;
   if cur.id is not null then anchor:=cur;
   else select * into anchor from public.sessions where engagement_id=p_engagement and not deleted and shown_at is not null order by shown_at desc,id limit 1; end if;
   -- Moving to a step outside that segment ends it. Nothing live (a break) does not.
   if anchor.id is not null and p_action<>'nothing_live' and target.id is distinct from anchor.id
     and (anchor.segment='' or target.segment is distinct from anchor.segment or target.part is distinct from anchor.part) then
    update public.sessions set state='closed',closed_at=clock_timestamp()
     where engagement_id=p_engagement and not deleted and mode='live' and state in ('open','live','phones_down')
      and (id=anchor.id or (anchor.segment<>'' and sessions.segment=anchor.segment and sessions.part=anchor.part));
   end if;
  end if;
  if p_action='reopen' then
   update public.sessions set state='live',closed_at=null,shown_at=clock_timestamp() where id=cur.id;
   v_down:=false; v_burst:=null;
  elsif p_action='nothing_live' then
   v_live:=null; v_content:='holding'; v_down:=false; v_burst:=null;
  else
   -- A closed part's step is shown read-only until Reopen.
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
  if v_part is null or v_part not in ('Pre-call','Day 1','Day 2','Follow-up') then return jsonb_build_object('status','invalid_request'); end if;
  perform 1 from public.sessions where engagement_id=p_engagement and part=p->>'part' and not deleted order by id for update;
  update public.sessions set state='closed',closed_at=clock_timestamp()
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
 select split_part(btrim(name),' ',1) into who from public.clearway_users where id=private.clearway_user_id();
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','control','id',p_id,'action',p_action,'by',who,'version',r.version,'changed',room_changed));
 return jsonb_build_object('status','ok','version',r.version);
exception when invalid_text_representation then return jsonb_build_object('status','invalid_request');
end $$;

commit;
