-- Batch 1 (November 15): timers (TM-1 to TM-3). The burst countdown stays as it is; this is one more timer, separate from it.
--
-- 1. A step's timer is a generic step option, timer: count down (seconds), count up, or count to a clock time ("HH:MM" in
--    the church's time zone); shown on the TV and on phones or not; started when the step goes live or by hand; and it can
--    run through a later step in the run of show.
-- 2. The room holds one general timer at a time, room_states.timer: its kind, length, start, end, pause, where it shows, and
--    the steps it spans. Every surface works out the time left from these and the server clock, so nothing ticks in the
--    database and every screen agrees.
-- 3. When a step goes live: a running step timer stops if the room moves outside the steps it spans (a break, with nothing
--    live, keeps it running), and the new step's own timer starts if it is set to start on Go live and no timer is running.
--    A timer started by hand keeps running through every step until it is stopped.
-- 4. timer_control, for the facilitators (the control surface and the phone remote): start (asks before replacing a running
--    timer), start the live step's own timer, pause, resume, add or take off a minute, add five, reset and stop.
-- 5. The room state carries the timer.
begin;

-- ---------- 1. The step option ----------
create function private.step_timer(p jsonb,p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare kind text; secs integer; at text; thru uuid;
begin
 if p is null or jsonb_typeof(p)='null' then return 'null'::jsonb; end if;
 if jsonb_typeof(p)<>'object' or (select count(*) from jsonb_object_keys(p) k where k not in ('kind','seconds','at','tv','phones','start','through'))>0 then return null; end if;
 kind:=coalesce(p->>'kind','down');
 if kind not in ('down','up','to') then return null; end if;
 if kind='down' then
  if jsonb_typeof(p->'seconds')<>'number' or (p->>'seconds')::numeric<>trunc((p->>'seconds')::numeric) or (p->>'seconds')::numeric not between 10 and 14400 then return null; end if;
  secs:=(p->>'seconds')::integer;
 end if;
 if kind='to' then
  at:=p->>'at';
  if at is null or at !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return null; end if;
 end if;
 if (p ? 'tv' and jsonb_typeof(p->'tv')<>'boolean') or (p ? 'phones' and jsonb_typeof(p->'phones')<>'boolean') then return null; end if;
 if coalesce(p->>'start','live') not in ('live','hand') then return null; end if;
 if p ? 'through' and jsonb_typeof(p->'through')<>'null' then
  if p->>'through' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
  select id into thru from public.sessions where id=(p->>'through')::uuid and engagement_id=p_engagement and not deleted;
  if thru is null then return null; end if;
 end if;
 return jsonb_strip_nulls(jsonb_build_object('kind',kind,'seconds',secs,'at',at,'tv',coalesce((p->>'tv')::boolean,true),'phones',coalesce((p->>'phones')::boolean,false),
  'start',coalesce(p->>'start','live'),'through',thru));
end $$;
revoke all on function private.step_timer(jsonb,uuid) from public,anon,authenticated;

alter function private.session_options(text,jsonb,uuid) rename to session_options_pre_timer;
create function private.session_options(p_kind text,p jsonb,p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare out jsonb; t jsonb;
begin
 if jsonb_typeof(coalesce(p,'{}'::jsonb))<>'object' or not (p ? 'timer') then return private.session_options_pre_timer(p_kind,p,p_engagement); end if;
 t:=private.step_timer(p->'timer',p_engagement);
 if t is null then return null; end if;
 out:=private.session_options_pre_timer(p_kind,p-'timer',p_engagement);
 if out is null then return null; end if;
 return case when jsonb_typeof(t)='object' then out||jsonb_build_object('timer',t) else out end;
end $$;
revoke all on function private.session_options(text,jsonb,uuid),private.session_options_pre_timer(text,jsonb,uuid) from public,anon,authenticated;

-- ---------- 2. The room's timer ----------
alter table public.room_states add column timer jsonb;

-- A timer from a setting (a step's, or one started by hand): ends_at for down and to; started_at for every kind.
create function private.timer_make(p_engagement uuid,p jsonb,p_source text,p_from uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare kind text:=coalesce(p->>'kind','down'); secs integer; zone text; ends timestamptz; t timestamptz:=now();
begin
 if kind='down' then secs:=(p->>'seconds')::integer; ends:=t+make_interval(secs=>secs);
 elsif kind='to' then
  select c.timezone into zone from public.engagements e join public.churches c on c.id=e.church_id where e.id=p_engagement;
  ends:=((t at time zone coalesce(zone,'America/Toronto'))::date+(p->>'at')::time) at time zone coalesce(zone,'America/Toronto');
  if ends<=t then return null; end if;
  secs:=ceil(extract(epoch from ends-t))::integer;
 end if;
 return jsonb_strip_nulls(jsonb_build_object('id',gen_random_uuid(),'kind',kind,'seconds',secs,'length',secs,'at',p->>'at','started_at',t,'ends_at',ends,
  'tv',coalesce((p->>'tv')::boolean,true),'phones',coalesce((p->>'phones')::boolean,false),'source',p_source,'from',p_from,'through',p->>'through'));
end $$;
revoke all on function private.timer_make(uuid,jsonb,text,uuid) from public,anon,authenticated;

-- Whether a step sits inside the steps a timer spans, in run order (its own step through the one it runs through).
create function private.timer_spans(p_timer jsonb,p_session uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((
  select (private.part_order(s.part),s.position,s.id)>=(private.part_order(a.part),a.position,a.id)
     and (private.part_order(s.part),s.position,s.id)<=(private.part_order(b.part),b.position,b.id)
  from public.sessions s, public.sessions a, public.sessions b
  where s.id=p_session and a.id=(p_timer->>'from')::uuid and b.id=coalesce((p_timer->>'through')::uuid,(p_timer->>'from')::uuid)),false)
$$;
revoke all on function private.timer_spans(jsonb,uuid) from public,anon,authenticated;

-- ---------- 3. Steps going live ----------
create function private.timer_follows() returns trigger
language plpgsql security definer set search_path='' as $$
declare s public.sessions;
begin
 if new.live_session_id is not distinct from old.live_session_id then return new; end if;
 if new.timer is not null and new.timer->>'source'='step' and new.live_session_id is not null and not private.timer_spans(new.timer,new.live_session_id) then new.timer:=null; end if;
 if new.timer is null and new.live_session_id is not null then
  select * into s from public.sessions where id=new.live_session_id and not deleted;
  if jsonb_typeof(s.options->'timer')='object' and coalesce(s.options#>>'{timer,start}','live')='live' then
   new.timer:=private.timer_make(new.engagement_id,s.options->'timer','step',s.id);
  end if;
 end if;
 return new;
end $$;
revoke all on function private.timer_follows() from public,anon,authenticated;
create trigger timer_follows before update of live_session_id on public.room_states for each row execute function private.timer_follows();

-- ---------- 4. The controls ----------
create function private.timer_control(p_engagement uuid,p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; t jsonb; s public.sessions; secs integer; t_now timestamptz:=now(); made jsonb; shift interval;
begin
 if not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if not found then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 p:=coalesce(p,'{}'::jsonb); t:=r.timer;
 if p_action in ('start','start_step') then
  if t is not null and not coalesce((p->>'replace')::boolean,false) then return jsonb_build_object('status','running','timer',t); end if;
  if p_action='start' then
   made:=private.step_timer(p-'replace'-'through',p_engagement);
   if made is null or jsonb_typeof(made)<>'object' then return jsonb_build_object('status','invalid_request'); end if;
   t:=private.timer_make(p_engagement,made,'manual',null);
  else
   select * into s from public.sessions where id=r.live_session_id and not deleted;
   if s.id is null or jsonb_typeof(s.options->'timer')<>'object' then return jsonb_build_object('status','missing'); end if;
   t:=private.timer_make(p_engagement,s.options->'timer','step',s.id);
  end if;
  if t is null then return jsonb_build_object('status','past'); end if;
 elsif t is null then return jsonb_build_object('status','missing');
 elsif p_action in ('pause','resume') and t->>'kind'='to' then return jsonb_build_object('status','invalid_request');
 elsif p_action='pause' then
  if t ? 'paused_at' then return jsonb_build_object('status','unchanged','timer',t); end if;
  t:=t||jsonb_build_object('paused_at',t_now);
 elsif p_action='resume' then
  if not (t ? 'paused_at') then return jsonb_build_object('status','unchanged','timer',t); end if;
  shift:=t_now-(t->>'paused_at')::timestamptz;
  t:=(t-'paused_at')||jsonb_build_object('started_at',(t->>'started_at')::timestamptz+shift)
   ||case when t ? 'ends_at' then jsonb_build_object('ends_at',(t->>'ends_at')::timestamptz+shift) else '{}'::jsonb end;
 elsif p_action='add' then
  if jsonb_typeof(p->'seconds')<>'number' or (p->>'seconds')::integer not in (60,300,-60) then return jsonb_build_object('status','invalid_request'); end if;
  secs:=(p->>'seconds')::integer;
  -- Counting down or to a time, the end moves; counting up, the start moves back, so the shown time grows.
  if t ? 'ends_at' then t:=t||jsonb_build_object('ends_at',(t->>'ends_at')::timestamptz+make_interval(secs=>secs),'seconds',greatest(0,coalesce((t->>'seconds')::integer,0)+secs));
  else t:=t||jsonb_build_object('started_at',(t->>'started_at')::timestamptz-make_interval(secs=>secs)); end if;
 elsif p_action='reset' then
  -- Back to the length it was set to, held: Resume runs it again. Minutes added or taken off go with it.
  if t->>'kind'='to' then return jsonb_build_object('status','invalid_request'); end if;
  t:=t||jsonb_build_object('started_at',t_now,'paused_at',t_now)||case when t ? 'ends_at' then jsonb_build_object('ends_at',t_now+make_interval(secs=>(t->>'length')::integer),'seconds',(t->>'length')::integer) else '{}'::jsonb end;
 elsif p_action='stop' then t:=null;
 else return jsonb_build_object('status','invalid_request'); end if;
 update public.room_states set timer=t where engagement_id=p_engagement;
 return jsonb_build_object('status','ok','timer',t);
exception when invalid_text_representation then return jsonb_build_object('status','invalid_request');
end $$;
revoke all on function private.timer_control(uuid,text,jsonb) from public,anon;
grant execute on function private.timer_control(uuid,text,jsonb) to authenticated;
create function public.timer_control(p_engagement uuid,p_action text,p jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.timer_control(p_engagement,p_action,p) $$;
revoke all on function public.timer_control(uuid,text,jsonb) from public,anon;
grant execute on function public.timer_control(uuid,text,jsonb) to authenticated;

-- ---------- 5. The room state ----------
alter function private.live_public_state(uuid) rename to live_public_state_pre_timer;
create function private.live_public_state(p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select case when b ? 'state' then jsonb_set(b,'{state,timer}',coalesce(r.timer,'null'::jsonb)) else b end
  from (select private.live_public_state_pre_timer(p_engagement) b) x
  left join public.room_states r on r.engagement_id=p_engagement and not r.deleted
$$;
revoke all on function private.live_public_state(uuid),private.live_public_state_pre_timer(uuid) from public,anon,authenticated;

commit;
