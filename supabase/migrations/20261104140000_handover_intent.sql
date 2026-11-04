-- Milestone 4, step 6: the remote changing hands (D2-11), commander's intent (INT-16,
-- D2-12 to D2-14) and the team facilitator's scoped follow-up access. Live only, after
-- merge and Chris's approval. No session is started and no data is seeded.
--
-- What is new:
--   private.team_blocks        the run of sessions a team facilitator leads, who holds the remote
--   private.followup_access    a link and code the lead issues for one block; hashed, expiring
--   private.followup_grants    what one entered code is allowed to be: the TV view or the remote
--   private.intent_locks       one person per field, released after 3 idle seconds
--   the intent kind            one card per confirmed Vision Outcome, edited live
--   private.room_control       redefined: the same presses, now also for the team remote, limited
--   private.live_role          redefined: a follow-up TV view stops being a TV when its access ends
--
-- Nothing here reads the alignment signal, presenter notes or Discover data into a team
-- surface: the team remote reads only the block's session titles and the TV-safe room state.
begin;

insert into private.interaction_kinds(kind,label,input,one_per_person,counts,structured,shares_answers,spotlight,named,position) values
 ('intent','Commander''s intent',true,false,'none',true,true,'none','never',160);

create function private.first_name(p text) returns text
language sql immutable security invoker set search_path='' as $$ select split_part(btrim(coalesce(p,'')),' ',1) $$;

-- ---------- Follow-up access ----------
create table private.followup_access (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 attendee_id uuid not null,
 email text not null check(email=lower(btrim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' and length(email)<=254),
 session_ids uuid[] not null check(cardinality(session_ids) between 1 and 12),
 token_hash text not null check(token_hash ~ '^[a-f0-9]{64}$'),
 code_hash text not null check(code_hash ~ '^[a-f0-9]{64}$'),
 opens_at timestamptz not null,
 closes_at timestamptz not null,
 attempts integer not null default 0 check(attempts between 0 and 3),
 locked_until timestamptz,
 revoked_at timestamptz,
 swept_at timestamptz,
 issued_at timestamptz not null default clock_timestamp(),
 issued_by uuid references public.clearway_users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 check(closes_at>opens_at and closes_at<=opens_at+interval '24 hours'),
 unique(id,engagement_id),
 foreign key(attendee_id,engagement_id) references public.attendees(id,engagement_id)
);
create unique index followup_access_token_idx on private.followup_access(token_hash) where not deleted;
create index followup_access_room_idx on private.followup_access(engagement_id,closes_at desc);
create index followup_access_open_idx on private.followup_access(engagement_id) where swept_at is null and not deleted;
create index followup_access_attendee_idx on private.followup_access(attendee_id,engagement_id);
alter table private.followup_access enable row level security;
alter table private.followup_access force row level security;
revoke all on private.followup_access from public,anon,authenticated;
grant select,insert,update,delete on private.followup_access to service_role;
create trigger touch_record before update on private.followup_access for each row execute function private.touch_live_record('id');

-- A grant is one entered code on one device. It becomes the TV view or the remote, never both.
create table private.followup_grants (
 id uuid primary key default gen_random_uuid(),
 access_id uuid not null,
 engagement_id uuid not null references public.engagements(id),
 grant_hash text not null check(grant_hash ~ '^[a-f0-9]{64}$'),
 kind text check(kind in ('tv','remote')),
 tv_device_id uuid references private.tv_devices(id),
 ended_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 foreign key(access_id,engagement_id) references private.followup_access(id,engagement_id)
);
create unique index followup_grants_hash_idx on private.followup_grants(grant_hash);
create unique index followup_grants_one_remote on private.followup_grants(access_id) where kind='remote' and ended_at is null and not deleted;
create unique index followup_grants_one_tv on private.followup_grants(access_id) where kind='tv' and ended_at is null and not deleted;
create index followup_grants_access_idx on private.followup_grants(access_id,engagement_id);
create index followup_grants_device_idx on private.followup_grants(tv_device_id) where tv_device_id is not null;
alter table private.followup_grants enable row level security;
alter table private.followup_grants force row level security;
revoke all on private.followup_grants from public,anon,authenticated;
grant select,insert,update,delete on private.followup_grants to service_role;
create trigger touch_record before update on private.followup_grants for each row execute function private.touch_live_record('id');

-- ---------- The team-led block ----------
-- room_states.team_led_block_id points here. The active block is the one with no end.
create table private.team_blocks (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 session_ids uuid[] not null check(cardinality(session_ids) between 1 and 12),
 attendee_id uuid not null,
 holder text not null default 'team' check(holder in ('team','lead')),
 via text not null check(via in ('room','followup')),
 followup_id uuid,
 started_at timestamptz not null default clock_timestamp(),
 ended_at timestamptz,
 end_reason text check(end_reason is null or end_reason in ('block_done','lead_ended','revoked','expired','reset','replaced')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 unique(id,engagement_id),
 foreign key(attendee_id,engagement_id) references public.attendees(id,engagement_id),
 foreign key(followup_id,engagement_id) references private.followup_access(id,engagement_id)
);
create unique index team_blocks_active_idx on private.team_blocks(engagement_id) where ended_at is null and not deleted;
create index team_blocks_attendee_idx on private.team_blocks(attendee_id,engagement_id);
create index team_blocks_followup_idx on private.team_blocks(followup_id,engagement_id) where followup_id is not null;
alter table private.team_blocks enable row level security;
alter table private.team_blocks force row level security;
revoke all on private.team_blocks from public,anon,authenticated;
grant select,insert,update,delete on private.team_blocks to service_role;
create trigger touch_record before update on private.team_blocks for each row execute function private.touch_live_record('id');

-- ---------- Field locks ----------
create table private.intent_locks (
 card_id uuid not null,
 field text not null check(field ~ '^(intent|must_do|what_we_stop|step:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'),
 engagement_id uuid not null references public.engagements(id),
 holder_key text not null check(length(holder_key) between 1 and 80),
 holder_name text not null check(length(holder_name)<=60),
 expires_at timestamptz not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 primary key(card_id,field),
 foreign key(card_id,engagement_id) references private.intent_cards(id,engagement_id)
);
create index intent_locks_room_idx on private.intent_locks(engagement_id);
alter table private.intent_locks enable row level security;
alter table private.intent_locks force row level security;
revoke all on private.intent_locks from public,anon,authenticated;
grant select,insert,update,delete on private.intent_locks to service_role;
create trigger touch_record before update on private.intent_locks for each row execute function private.touch_live_record('card_id');

-- ---------- Who is acting ----------
create function private.is_lead(p_engagement uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select private.show_allowed(p_engagement)),false) and ((select private.is_admin()) or exists(
  select 1 from public.engagement_facilitators f where f.engagement_id=p_engagement and f.role='lead' and not f.deleted and f.clearway_user_id=(select private.clearway_user_id())))
$$;

create function private.team_block(p_engagement uuid,p_block uuid) returns uuid[]
language sql stable security definer set search_path='' as $$
 select coalesce((select session_ids from private.team_blocks where id=p_block and engagement_id=p_engagement and not deleted and ended_at is null),array[]::uuid[])
$$;

-- The run of team-led sessions around one session: consecutive Commander's intent and
-- Sign together steps, in the order of the run of show.
create function private.team_run(p_engagement uuid,p_session uuid) returns uuid[]
language sql stable security definer set search_path='' as $$
 with ordered as (
  select s.id,s.interaction,row_number() over(order by private.part_order(s.part),s.position,s.id) rn
  from public.sessions s where s.engagement_id=p_engagement and not s.deleted and s.mode='live'),
 marked as (select id,rn,rn-row_number() over(order by rn) grp from ordered where interaction in('intent','sign'))
 select array_agg(id order by rn) from marked where grp=(select grp from marked where id=p_session)
$$;

create function private.followup_live(p_access uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.followup_access a where a.id=p_access and not a.deleted and a.revoked_at is null
  and a.opens_at<=clock_timestamp() and a.closes_at>clock_timestamp())
$$;

-- The attendee a follow-up remote stands for, or null. The grant id is set for one
-- transaction by private.followup_press after the grant's hash has been checked.
create function private.followup_actor(p_engagement uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select a.attendee_id from private.followup_grants g join private.followup_access a on a.id=g.access_id and a.engagement_id=g.engagement_id
 where g.id=case when current_setting('clearway.followup_grant',true) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then current_setting('clearway.followup_grant',true)::uuid end
  and g.kind='remote' and g.ended_at is null and not g.deleted and a.engagement_id=p_engagement and private.followup_live(a.id)
$$;

-- facilitator: the Clearway facilitator (as show_allowed). team: whoever holds the remote
-- in a team-led block, on their phone in the room or through a follow-up grant.
create function private.remote_actor(p_engagement uuid) returns text
language sql stable security definer set search_path='' as $$
 select case
  when coalesce((select private.show_allowed(p_engagement)),false) then 'facilitator'
  when exists(select 1 from public.room_states r join private.team_blocks b on b.id=r.team_led_block_id and b.engagement_id=r.engagement_id and b.ended_at is null and not b.deleted
    where r.engagement_id=p_engagement and not r.deleted and r.remote_holder_id is not null and b.holder='team' and b.attendee_id=r.remote_holder_id and (
     (r.remote_holder_id in (select private.room_attendee_ids()) and (select private.live_role(p_engagement))='participant')
     or private.followup_actor(p_engagement)=r.remote_holder_id)) then 'team'
 end
$$;

-- A follow-up TV view stops being a TV the moment its access ends, whether or not the
-- sweep has run yet.
create function private.followup_tv_blocked(p_device uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select p_device is not null and exists(select 1 from private.followup_grants g join private.followup_access a on a.id=g.access_id
  where g.tv_device_id=p_device and (g.ended_at is not null or a.revoked_at is not null or a.closes_at<=clock_timestamp()))
$$;

create or replace function private.live_role(p_engagement uuid) returns text
language sql stable security definer set search_path='' as $$
  select case
    when private.is_admin() or private.can_facilitate(p_engagement) then 'facilitator'
    when exists(select 1 from public.attendees a where a.engagement_id=p_engagement and a.id in(select private.room_attendee_ids())) then 'participant'
    when private.has_auth_session() and exists(select 1 from private.live_tv_sessions t where t.engagement_id=p_engagement
      and t.auth_user_id=(select auth.uid()) and t.auth_session_id=private.auth_session_id() and t.revoked_at is null and not t.deleted
      and not private.followup_tv_blocked(t.device_id)) then 'tv'
    end
  where (select auth.uid()) is not null and exists(select 1 from public.engagements e join public.churches c on c.id=e.church_id
    where e.id=p_engagement and not e.deleted and e.status<>'closed' and not c.deleted)
$$;

-- Take a TV view off an engagement, exactly as the facilitator's Unpair does.
create function private.followup_unpair(p_device uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 delete from auth.sessions where id in(select auth_session_id from private.live_tv_sessions where device_id=p_device and revoked_at is null and not deleted);
 update private.live_tv_sessions set revoked_at=coalesce(revoked_at,now()) where device_id=p_device and revoked_at is null;
 update private.tv_devices set engagement_id=null,paired_at=null,claim_id=null,claim_started_at=null,code_hash=null,code_expires_at=null where id=p_device;
end $$;

-- End whatever an expired or revoked access still holds: its grants, its TV view and its
-- block. Returns true when it ended a block, so the caller clears the room's remote.
create function private.followup_sweep(p_engagement uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare a private.followup_access; g private.followup_grants; ended boolean:=false;
begin
 for a in select * from private.followup_access x where x.engagement_id=p_engagement and not x.deleted and x.swept_at is null
   and (x.revoked_at is not null or x.closes_at<=clock_timestamp()) order by x.id for update loop
  for g in select * from private.followup_grants where access_id=a.id and ended_at is null and not deleted order by id for update loop
   if g.tv_device_id is not null then perform private.followup_unpair(g.tv_device_id); end if;
   update private.followup_grants set ended_at=clock_timestamp(),tv_device_id=null where id=g.id;
  end loop;
  update private.team_blocks set ended_at=clock_timestamp(),end_reason=case when a.revoked_at is not null then 'revoked' else 'expired' end
   where followup_id=a.id and ended_at is null and not deleted;
  if found then ended:=true; end if;
  update private.followup_access set swept_at=clock_timestamp() where id=a.id;
 end loop;
 return ended;
end $$;

-- ---------- The remote returns by itself ----------
-- One before-update trigger on the room, so every path that moves the room is covered:
-- the remote, the control surface, Close day, a practice reset.
create function private.team_block_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare blk private.team_blocks; swept boolean; who text;
begin
 swept:=private.followup_sweep(new.engagement_id);
 if new.team_led_block_id is not null then
  select * into blk from private.team_blocks where id=new.team_led_block_id;
  if not found or blk.ended_at is not null then
   new.remote_holder_id:=null; new.team_led_block_id:=null;
  elsif old.live_session_id is distinct from new.live_session_id and old.live_session_id=any(blk.session_ids)
    and (new.live_session_id is null or not (new.live_session_id=any(blk.session_ids))) then
   update private.team_blocks set ended_at=clock_timestamp(),end_reason='block_done',holder='lead' where id=blk.id;
   new.remote_holder_id:=null; new.team_led_block_id:=null;
   perform private.fac_notice(new.engagement_id,jsonb_build_object('kind','handover','action','returned','version',new.version,'changed',false));
  end if;
 elsif old.team_led_block_id is not null then
  update private.team_blocks set ended_at=clock_timestamp(),end_reason=coalesce(end_reason,'reset') where id=old.team_led_block_id and ended_at is null;
 end if;
 -- Commander's intent comes up: a card for every confirmed Vision Outcome is ready before anyone types.
 if new.live_session_id is distinct from old.live_session_id and exists(select 1 from public.sessions s where s.id=new.live_session_id and s.interaction='intent' and not s.deleted) then
  perform private.intent_sync(new.engagement_id);
  new.results:=private.live_results_for(new.engagement_id,new.live_session_id,new.hidden_keys);
 end if;
 return new;
end $$;
create trigger team_block_guard before update on public.room_states for each row execute function private.team_block_guard();

-- ---------- INT-16 Commander's intent ----------
-- Options: who assigns the pairs. The remote assigns by default; "phones" lets people pick.
create function private.options_intent(p jsonb,p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if p_engagement is null or jsonb_typeof(p) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p) f where f<>'assign') then return null; end if;
 if p ? 'assign' and (jsonb_typeof(p->'assign') is distinct from 'string' or p->>'assign' not in ('remote','phones')) then return null; end if;
 return jsonb_build_object('assign',coalesce(p->>'assign','remote'));
end $$;

-- Phones do not send answers to this kind. They edit the card through intent_edit.
create function private.parse_intent(p_session public.sessions,p_text text,p_value jsonb) returns jsonb
language sql stable security definer set search_path='' as $$ select jsonb_build_object('status','closed') $$;

-- One card for each confirmed Vision Outcome, made when the step comes up.
create function private.intent_sync(p_engagement uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 insert into private.intent_cards(engagement_id,outcome_id)
 select o.engagement_id,o.id from private.vision_outcomes o where o.engagement_id=p_engagement and o.status='confirmed' and not o.deleted
  and not exists(select 1 from private.intent_cards c where c.outcome_id=o.id and c.engagement_id=o.engagement_id and not c.deleted);
end $$;

-- The cards as the TV and the phones read them. A first step's flags are decided here, in
-- code (private.first_step_flags): a step without an owner or a date is flagged.
create function private.results_intent(p_engagement uuid,p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$
 with cards as (
  select c.id,o.title,row_number() over(order by o.position,o.id) n,c.intent,c.must_do,c.what_we_stop
  from private.intent_cards c join private.vision_outcomes o on o.id=c.outcome_id and o.engagement_id=c.engagement_id
  where c.engagement_id=p_engagement and not c.deleted and not o.deleted and o.status='confirmed'),
 steps as (
  select s.card_id,jsonb_agg(jsonb_build_object('id',s.id,'text',s.text,'owner',nullif(private.first_name(coalesce(a.name,s.owner_name)),''),'date',s.due_date,'missing',f.flags->'missing',
   'typing',exists(select 1 from private.intent_locks l where l.card_id=s.card_id and l.field='step:'||s.id and not l.deleted and l.expires_at>clock_timestamp()))
   order by s.position,s.created_at,s.id) as list,count(*) filter (where (f.flags->>'flagged')::boolean) as flagged
  from private.first_steps s left join public.attendees a on a.id=s.owner_attendee_id and a.engagement_id=s.engagement_id
   cross join lateral (select private.first_step_flags(s.id) as flags) f
  where s.engagement_id=p_engagement and not s.deleted group by s.card_id),
 card_json as (
  select c.n,jsonb_build_object('id',c.id,'number',c.n,'title',c.title,'intent',c.intent,'must_do',c.must_do,'what_we_stop',c.what_we_stop,
   'steps',coalesce(s.list,'[]'::jsonb),'flagged',coalesce(s.flagged,0),
   'filled',(c.intent<>'')::integer+(c.must_do<>'')::integer+(c.what_we_stop<>'')::integer+(coalesce(jsonb_array_length(s.list),0)>0)::integer,
   'pair',(select count(*) from private.intent_card_people p where p.card_id=c.id and not p.deleted),
   'typing',coalesce((select jsonb_agg(l.field order by l.field) from private.intent_locks l where l.card_id=c.id and l.field !~ '^step:' and not l.deleted and l.expires_at>clock_timestamp()),'[]'::jsonb)) as j,
   (c.intent<>'' or c.must_do<>'' or c.what_we_stop<>'' or coalesce(jsonb_array_length(s.list),0)>0) as started
  from cards c left join steps s on s.card_id=c.id)
 select jsonb_build_object('total',count(*) filter (where started),
  'people',(select count(distinct p.attendee_id) from private.intent_card_people p where p.engagement_id=p_engagement and not p.deleted),
  'assign',coalesce((select options->>'assign' from public.sessions where id=p_session),'remote'),
  'cards',coalesce(jsonb_agg(j order by n),'[]'::jsonb)) from card_json
$$;

create function private.items_intent(p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('key',c->>'id','text',(c->>'number')||'. '||(c->>'title')||' · '||(c->>'filled')||' of 4'||case when (c->>'flagged')::integer>0 then ' · step needs an owner or date' else '' end,
   'count',jsonb_array_length(c->'steps'),'hidden',false) order by (c->>'number')::integer),'[]'::jsonb)
 from jsonb_array_elements(coalesce((select private.results_intent(s.engagement_id,s.id,p_hidden)->'cards' from public.sessions s where s.id=p_session),'[]'::jsonb)) c
$$;

-- ---------- Who may edit a card ----------
create function private.intent_actor(p_engagement uuid) returns table(kind text,key text,name text,attendee uuid)
language sql stable security definer set search_path='' as $$
 select 'facilitator'::text,'fac:'||(select private.clearway_user_id())::text,private.first_name((select name from public.clearway_users where id=(select private.clearway_user_id()))),null::uuid
  where coalesce((select private.show_allowed(p_engagement)),false) and (select private.clearway_user_id()) is not null
 union all
 select 'participant'::text,a.id::text,private.first_name(a.name),a.id from public.attendees a
  where a.engagement_id=p_engagement and a.id in(select private.room_attendee_ids()) and not a.deleted and a.verified_at is not null
   and not coalesce((select private.show_allowed(p_engagement)),false)
 limit 1
$$;

-- Take or keep a field for 3 seconds. The holder is refused only while someone else's
-- lock is still running; an idle lock is simply taken over.
create function private.intent_lock(p_card uuid,p_engagement uuid,p_field text,p_key text,p_name text) returns text
language plpgsql security definer set search_path='' as $$
declare holder text;
begin
 insert into private.intent_locks(card_id,field,engagement_id,holder_key,holder_name,expires_at)
 values(p_card,p_field,p_engagement,p_key,left(p_name,60),clock_timestamp()+interval '3 seconds')
 on conflict(card_id,field) do update set holder_key=excluded.holder_key,holder_name=excluded.holder_name,expires_at=excluded.expires_at,deleted=false
  where private.intent_locks.holder_key=excluded.holder_key or private.intent_locks.expires_at<=clock_timestamp() or private.intent_locks.deleted;
 if found then return null; end if;
 select holder_name into holder from private.intent_locks where card_id=p_card and field=p_field;
 return coalesce(holder,'Someone');
end $$;

-- ---------- Editing a card from a phone or the control surface ----------
-- ops: set {field,text}, step_add {text,owner?,date?}, step_set {step,text?,owner?,owner_name?,owner_email?,date?},
-- step_remove {step}, release {field}. Each is one change, one version, one broadcast.
create function private.intent_edit(p_engagement uuid,p_card uuid,p_op text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; cur public.sessions; c private.intent_cards; act record; v_field text; v_text text; st private.first_steps; held text; v_id uuid;
 v_owner uuid; v_date date; n integer; changed boolean:=false; v_name text; v_email text; v_key text;
begin
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if not found then return jsonb_build_object('status','denied'); end if;
 select * into act from private.intent_actor(p_engagement);
 if act.kind is null then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 if p_card is null or p_op is null or p_op not in ('set','step_add','step_set','step_remove','release') or jsonb_typeof(p) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 select * into c from private.intent_cards where id=p_card and engagement_id=p_engagement and not deleted for update;
 if not found then return jsonb_build_object('status','missing'); end if;
 if act.kind='participant' then
  select * into cur from public.sessions where id=r.live_session_id and not deleted;
  if cur.id is null or cur.interaction<>'intent' or cur.state<>'live' or r.phones_down or (r.burst_ends_at is not null and r.burst_ends_at<=clock_timestamp()) then return jsonb_build_object('status','closed'); end if;
  if not exists(select 1 from private.intent_card_people x where x.card_id=c.id and x.attendee_id=act.attendee and not x.deleted) then return jsonb_build_object('status','not_in_pair'); end if;
 end if;

 if p_op='release' then
  v_field:=p->>'field';
  if v_field is null or v_field !~ '^(intent|must_do|what_we_stop|step:[0-9a-f-]{36})$' then return jsonb_build_object('status','invalid_request'); end if;
  delete from private.intent_locks where card_id=c.id and field=v_field and holder_key=act.key;
  return jsonb_build_object('status','ok','version',r.version);
 end if;

 if p_op='set' then
  v_field:=p->>'field'; v_text:=p->>'text';
  if v_field is null or v_field not in ('intent','must_do','what_we_stop') or jsonb_typeof(p->'text') is distinct from 'string' then return jsonb_build_object('status','invalid_request'); end if;
  v_text:=regexp_replace(v_text,'[\r\n]+',' ','g');
  if length(v_text)>400 or v_text ~ '[\x00-\x08\x0b-\x1f]' then return jsonb_build_object('status','invalid_answer'); end if;
  held:=private.intent_lock(c.id,p_engagement,v_field,act.key,act.name);
  if held is not null then return jsonb_build_object('status','locked','by',held,'version',r.version); end if;
  if (case v_field when 'intent' then c.intent when 'must_do' then c.must_do else c.what_we_stop end)=v_text then return jsonb_build_object('status','unchanged','version',r.version); end if;
  if v_field='intent' then update private.intent_cards set intent=v_text where id=c.id;
  elsif v_field='must_do' then update private.intent_cards set must_do=v_text where id=c.id;
  else update private.intent_cards set what_we_stop=v_text where id=c.id; end if;
  changed:=true;
 elsif p_op='step_add' then
  v_text:=regexp_replace(coalesce(p->>'text',''),'[\r\n]+',' ','g');
  if jsonb_typeof(p->'text') is distinct from 'string' or length(btrim(v_text)) not between 1 and 280 or v_text ~ '[\x00-\x08\x0b-\x1f]' then return jsonb_build_object('status','invalid_answer'); end if;
  select count(*) into n from private.first_steps where card_id=c.id and not deleted;
  if n>=12 then return jsonb_build_object('status','limit'); end if;
  v_id:=gen_random_uuid();
  insert into private.first_steps(id,engagement_id,card_id,text,position) values(v_id,p_engagement,c.id,v_text,n);
  held:=private.intent_lock(c.id,p_engagement,'step:'||v_id,act.key,act.name);
  changed:=true;
  p:=p||jsonb_build_object('step',v_id);
  if p ? 'owner' or p ? 'owner_name' or p ? 'date' then p_op:='step_set'; p:=p-'text'; end if;
 end if;

 if p_op='step_remove' then
  if p->>'step' is null or p->>'step' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return jsonb_build_object('status','invalid_request'); end if;
  update private.first_steps set deleted=true where id=(p->>'step')::uuid and card_id=c.id and not deleted;
  if not found then return jsonb_build_object('status','missing'); end if;
  delete from private.intent_locks where card_id=c.id and field='step:'||(p->>'step');
  changed:=true;
 elsif p_op='step_set' then
  if p->>'step' is null or p->>'step' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return jsonb_build_object('status','invalid_request'); end if;
  select * into st from private.first_steps where id=(p->>'step')::uuid and card_id=c.id and not deleted for update;
  if not found then return jsonb_build_object('status','missing'); end if;
  if p ? 'text' then
   v_text:=regexp_replace(coalesce(p->>'text',''),'[\r\n]+',' ','g');
   if jsonb_typeof(p->'text') is distinct from 'string' or length(btrim(v_text)) not between 1 and 280 or v_text ~ '[\x00-\x08\x0b-\x1f]' then return jsonb_build_object('status','invalid_answer'); end if;
   v_key:='step:'||st.id;
   held:=private.intent_lock(c.id,p_engagement,v_key,act.key,act.name);
   if held is not null then return jsonb_build_object('status','locked','by',held,'version',r.version); end if;
   if v_text is distinct from st.text then update private.first_steps set text=v_text where id=st.id; changed:=true; end if;
  end if;
  if p ? 'owner' then
   if p->'owner'='null'::jsonb then update private.first_steps set owner_attendee_id=null,owner_name=null,owner_email=null where id=st.id; changed:=true;
   else
    if jsonb_typeof(p->'owner') is distinct from 'string' or p->>'owner' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return jsonb_build_object('status','invalid_request'); end if;
    v_owner:=(p->>'owner')::uuid;
    if not exists(select 1 from public.attendees where id=v_owner and engagement_id=p_engagement and not deleted) then return jsonb_build_object('status','missing'); end if;
    update private.first_steps set owner_attendee_id=v_owner,owner_name=null,owner_email=null where id=st.id; changed:=true;
   end if;
  elsif p ? 'owner_name' then
   v_name:=btrim(coalesce(p->>'owner_name','')); v_email:=lower(btrim(coalesce(p->>'owner_email','')));
   if length(v_name) not between 1 and 200 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then return jsonb_build_object('status','invalid_answer'); end if;
   update private.first_steps set owner_attendee_id=null,owner_name=v_name,owner_email=v_email where id=st.id; changed:=true;
  end if;
  if p ? 'date' then
   if p->'date'='null'::jsonb then update private.first_steps set due_date=null where id=st.id and due_date is not null; changed:=changed or found;
   else
    if jsonb_typeof(p->'date') is distinct from 'string' or p->>'date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return jsonb_build_object('status','invalid_request'); end if;
    v_date:=(p->>'date')::date;
    update private.first_steps set due_date=v_date where id=st.id and due_date is distinct from v_date; changed:=changed or found;
   end if;
  end if;
  v_id:=st.id;
 end if;

 if not changed then return jsonb_build_object('status','unchanged','version',r.version); end if;
 update public.room_states set results=private.live_results(p_engagement) where engagement_id=p_engagement returning * into r;
 return jsonb_build_object('status','ok','version',r.version,'step',v_id);
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then return jsonb_build_object('status','invalid_request');
end $$;

-- ---------- Joining a card from a phone ----------
create function private.intent_join(p_engagement uuid,p_card uuid,p_leave boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; cur public.sessions; act record; n integer;
begin
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if not found then return jsonb_build_object('status','denied'); end if;
 select * into act from private.intent_actor(p_engagement);
 if act.kind is distinct from 'participant' then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 select * into cur from public.sessions where id=r.live_session_id and not deleted;
 if cur.id is null or cur.interaction<>'intent' or cur.state<>'live' or r.phones_down then return jsonb_build_object('status','closed'); end if;
 if p_card is null or not exists(select 1 from private.intent_cards where id=p_card and engagement_id=p_engagement and not deleted) then return jsonb_build_object('status','missing'); end if;
 if p_leave then
  update private.intent_card_people set deleted=true where card_id=p_card and attendee_id=act.attendee and not deleted;
  if not found then return jsonb_build_object('status','unchanged','version',r.version); end if;
 else
  if exists(select 1 from private.intent_card_people where card_id=p_card and attendee_id=act.attendee and not deleted) then return jsonb_build_object('status','unchanged','version',r.version); end if;
  select count(*) into n from private.intent_card_people where card_id=p_card and not deleted;
  if n>=3 then return jsonb_build_object('status','full','version',r.version); end if;
  -- One card each: joining this one leaves the last.
  update private.intent_card_people set deleted=true where engagement_id=p_engagement and attendee_id=act.attendee and not deleted;
  insert into private.intent_card_people(card_id,attendee_id,engagement_id) values(p_card,act.attendee,p_engagement)
   on conflict(card_id,attendee_id) do update set deleted=false;
 end if;
 update public.room_states set results=private.live_results(p_engagement) where engagement_id=p_engagement returning * into r;
 return jsonb_build_object('status','ok','version',r.version);
end $$;

-- What a phone or the control surface needs to edit: the pairs by first name, who holds
-- which field, and the people a step can be given to. Never sent to the TV.
create function private.intent_view(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare act record;
begin
 select * into act from private.intent_actor(p_engagement);
 if act.kind is null or private.live_role(p_engagement) not in ('facilitator','participant') then return jsonb_build_object('status','denied'); end if;
 return jsonb_build_object('status','ok','me',act.attendee,'kind',act.kind,
  'cards',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,
    'pair',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'first',private.first_name(a.name)) order by a.name,a.id) from private.intent_card_people p join public.attendees a on a.id=p.attendee_id and a.engagement_id=p.engagement_id
      where p.card_id=c.id and not p.deleted and not a.deleted),'[]'::jsonb),
    'locks',coalesce((select jsonb_agg(jsonb_build_object('field',l.field,'by',l.holder_name,'mine',l.holder_key=act.key) order by l.field) from private.intent_locks l
      where l.card_id=c.id and not l.deleted and l.expires_at>clock_timestamp()),'[]'::jsonb)) order by o.position,o.id)
    from private.intent_cards c join private.vision_outcomes o on o.id=c.outcome_id and o.engagement_id=c.engagement_id
    where c.engagement_id=p_engagement and not c.deleted and not o.deleted and o.status='confirmed'),'[]'::jsonb),
  'people',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'first',private.first_name(a.name)) order by a.name,a.id) from public.attendees a
    where a.engagement_id=p_engagement and not a.deleted and a.verified_at is not null),'[]'::jsonb));
end $$;

-- ---------- Pairs: from the remote, or picked on phones ----------
-- Pair assignment works from the facilitator's remote, from the team remote, or from a
-- follow-up remote. Actions: assign {card,attendees}, auto, clear {card?}, affirm_text {session}.
create function private.intent_control(p_engagement uuid,p_id uuid,p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; cur public.sessions; done private.room_controls; actor text; who text; v_card uuid; ids uuid[]; people uuid[]; cards uuid[]; m integer; txt text; target public.sessions; v_spot text;
begin
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if not found then return jsonb_build_object('status','denied'); end if;
 actor:=private.remote_actor(p_engagement);
 if actor is null or (p_action='affirm_text' and actor<>'facilitator') then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 if p_id is null or p_action is null or p_action not in ('assign','auto','clear','present','affirm_text') or jsonb_typeof(p) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 select * into done from private.room_controls where id=p_id;
 if found then
  if done.engagement_id<>p_engagement or done.action<>'intent_'||p_action then return jsonb_build_object('status','conflict'); end if;
  return jsonb_build_object('status','duplicate','version',r.version);
 end if;
 if p_action<>'affirm_text' then
  if not (p ? 'from') or (p->>'from' is not null and p->>'from' !~ '^[0-9a-f-]{36}$') then return jsonb_build_object('status','invalid_request'); end if;
  if (p->>'from')::uuid is distinct from r.live_session_id then return jsonb_build_object('status','moved','version',r.version,'live_session_id',r.live_session_id); end if;
  if actor='team' and not coalesce(r.live_session_id=any(private.team_block(p_engagement,r.team_led_block_id)),false) then return jsonb_build_object('status','outside_block'); end if;
  select * into cur from public.sessions where id=r.live_session_id and not deleted for update;
  if cur.id is null or cur.interaction<>'intent' then return jsonb_build_object('status','invalid_state'); end if;
  perform private.intent_sync(p_engagement);
 end if;

 if p_action='assign' then
  if p->>'card' is null or p->>'card' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or jsonb_typeof(p->'attendees') is distinct from 'array' or jsonb_array_length(p->'attendees')>3 then return jsonb_build_object('status','invalid_request'); end if;
  v_card:=(p->>'card')::uuid;
  if not exists(select 1 from private.intent_cards where id=v_card and engagement_id=p_engagement and not deleted) then return jsonb_build_object('status','missing'); end if;
  select coalesce(array_agg(distinct x::uuid),array[]::uuid[]) into ids from jsonb_array_elements_text(p->'attendees') x;
  if cardinality(ids)<>jsonb_array_length(p->'attendees') or exists(select 1 from unnest(ids) u where not exists(select 1 from public.attendees a where a.id=u and a.engagement_id=p_engagement and not a.deleted and a.verified_at is not null)) then return jsonb_build_object('status','missing'); end if;
  update private.intent_card_people set deleted=true where engagement_id=p_engagement and not deleted and (card_id=v_card or attendee_id=any(ids));
  insert into private.intent_card_people(card_id,attendee_id,engagement_id) select v_card,u,p_engagement from unnest(ids) u
   on conflict(card_id,attendee_id) do update set deleted=false;
 elsif p_action='auto' then
  select coalesce(array_agg(a.id order by a.name,a.id),array[]::uuid[]) into people from public.attendees a
   where a.engagement_id=p_engagement and not a.deleted and a.verified_at is not null and a.room_role='participant';
  select coalesce(array_agg(c.id order by o.position,o.id),array[]::uuid[]) into cards from private.intent_cards c join private.vision_outcomes o on o.id=c.outcome_id and o.engagement_id=c.engagement_id
   where c.engagement_id=p_engagement and not c.deleted and not o.deleted and o.status='confirmed';
  m:=cardinality(cards);
  if m=0 or cardinality(people)=0 then return jsonb_build_object('status','invalid_state'); end if;
  update private.intent_card_people set deleted=true where engagement_id=p_engagement and not deleted;
  for i in 1..cardinality(people) loop
   insert into private.intent_card_people(card_id,attendee_id,engagement_id) values(cards[((i-1) % m)+1],people[i],p_engagement)
    on conflict(card_id,attendee_id) do update set deleted=false;
  end loop;
 elsif p_action='clear' then
  if p ? 'card' and (p->>'card' is null or p->>'card' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then return jsonb_build_object('status','invalid_request'); end if;
  update private.intent_card_people set deleted=true where engagement_id=p_engagement and not deleted and (not (p ? 'card') or card_id=(p->>'card')::uuid);
  if not found then return jsonb_build_object('status','unchanged','version',r.version); end if;
 elsif p_action='present' then
  -- One card at full size on the TV, or back to all of them. The spotlight clears with the step.
  if p ? 'card' and p->'card'<>'null'::jsonb then
   if jsonb_typeof(p->'card') is distinct from 'string' or p->>'card' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or not exists(select 1 from private.intent_cards where id=(p->>'card')::uuid and engagement_id=p_engagement and not deleted) then return jsonb_build_object('status','missing'); end if;
   v_spot:=p->>'card';
  end if;
  if v_spot is not distinct from r.spotlight_key then return jsonb_build_object('status','unchanged','version',r.version); end if;
 else
  -- Affirm together reuses sign together: the cards become the text the room signs.
  if p->>'session' is null or p->>'session' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return jsonb_build_object('status','invalid_request'); end if;
  select * into target from public.sessions where id=(p->>'session')::uuid and engagement_id=p_engagement and not deleted for update;
  if target.id is null or target.interaction<>'sign' then return jsonb_build_object('status','missing'); end if;
  txt:=private.intent_affirmation(p_engagement);
  if txt is null or length(txt)>20000 then return jsonb_build_object('status','invalid_state'); end if;
  update public.sessions set options=options||jsonb_build_object('text',txt) where id=target.id;
 end if;

 update public.room_states set results=private.live_results(p_engagement),spotlight_key=case when p_action='present' then v_spot else spotlight_key end where engagement_id=p_engagement returning * into r;
 insert into private.room_controls(id,engagement_id,actor_id,action,session_id,room_version,created_at) values(p_id,p_engagement,private.clearway_user_id(),'intent_'||p_action,r.live_session_id,r.version,clock_timestamp());
 who:=case when actor='team' then (select private.first_name(a.name) from public.attendees a where a.id=r.remote_holder_id) else (select private.first_name(name) from public.clearway_users where id=private.clearway_user_id()) end;
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','control','id',p_id,'action','intent_'||p_action,'by',who,'version',r.version,'changed',true));
 return jsonb_build_object('status','ok','version',r.version);
exception when invalid_text_representation then return jsonb_build_object('status','invalid_request');
end $$;

-- The cards as the plain text a room signs. Section titles are "## Title", which the
-- sign phone expands. Nothing here is a name.
create function private.intent_affirmation(p_engagement uuid) returns text
language sql stable security definer set search_path='' as $$
 select nullif(string_agg(block,E'\n\n' order by n),'') from (
  select row_number() over(order by o.position,o.id) n,
   '## '||row_number() over(order by o.position,o.id)||'. '||o.title||E'\n'
   ||'Commander''s intent: '||coalesce(nullif(btrim(c.intent),''),'Not written yet')||E'\n'
   ||'The must-do: '||coalesce(nullif(btrim(c.must_do),''),'Not written yet')||E'\n'
   ||'What we''ll stop: '||coalesce(nullif(btrim(c.what_we_stop),''),'Not written yet')||E'\n'
   ||'Next 30 days: '||coalesce((select string_agg(s.text||' ('||coalesce(nullif(private.first_name(coalesce(a.name,s.owner_name)),''),'no owner')||', '||coalesce(to_char(s.due_date,'Mon FMDD'),'no date')||')','; ' order by s.position,s.id)
     from private.first_steps s left join public.attendees a on a.id=s.owner_attendee_id and a.engagement_id=s.engagement_id where s.card_id=c.id and not s.deleted),'No steps yet') as block
  from private.intent_cards c join private.vision_outcomes o on o.id=c.outcome_id and o.engagement_id=c.engagement_id
  where c.engagement_id=p_engagement and not c.deleted and not o.deleted and o.status='confirmed') x
$$;

-- ---------- The remote changing hands ----------
-- give {attendee,sessions?}, take_back, end. Facilitators only: the lead or the co-facilitator.
-- Taking it back never touches the TV: the live step, the spotlight and the hidden items stay.
create function private.handover_control(p_engagement uuid,p_id uuid,p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; done private.room_controls; blk private.team_blocks; v_att uuid; sess uuid[]; who text; person text; bad integer;
begin
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if not found or not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 if p_id is null or p_action is null or p_action not in ('give','take_back','end') or jsonb_typeof(p) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 select * into done from private.room_controls where id=p_id;
 if found then
  if done.engagement_id<>p_engagement or done.action<>'handover_'||p_action then return jsonb_build_object('status','conflict'); end if;
  return jsonb_build_object('status','duplicate','version',r.version);
 end if;
 if not (p ? 'from') or (p->>'from' is not null and p->>'from' !~ '^[0-9a-f-]{36}$') then return jsonb_build_object('status','invalid_request'); end if;
 if (p->>'from')::uuid is distinct from r.live_session_id then return jsonb_build_object('status','moved','version',r.version,'live_session_id',r.live_session_id); end if;
 perform private.followup_sweep(p_engagement);
 select * into blk from private.team_blocks where engagement_id=p_engagement and ended_at is null and not deleted for update;

 if p_action='give' then
  if p->>'attendee' is null or p->>'attendee' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return jsonb_build_object('status','invalid_request'); end if;
  v_att:=(p->>'attendee')::uuid;
  select private.first_name(name) into person from public.attendees where id=v_att and engagement_id=p_engagement and not deleted and verified_at is not null;
  if person is null then return jsonb_build_object('status','missing'); end if;
  if p ? 'sessions' then
   if jsonb_typeof(p->'sessions') is distinct from 'array' or jsonb_array_length(p->'sessions') not between 1 and 12 then return jsonb_build_object('status','invalid_request'); end if;
   select array_agg(x::uuid order by ord) into sess from jsonb_array_elements_text(p->'sessions') with ordinality t(x,ord);
   select count(*) into bad from unnest(sess) u where not exists(select 1 from public.sessions s where s.id=u and s.engagement_id=p_engagement and not s.deleted and s.mode='live');
   if bad>0 or (select count(distinct u) from unnest(sess) u)<>cardinality(sess) then return jsonb_build_object('status','missing'); end if;
  else
   sess:=private.team_run(p_engagement,r.live_session_id);
  end if;
  if sess is null or cardinality(sess)=0 then return jsonb_build_object('status','invalid_state'); end if;
  if blk.id is not null and blk.attendee_id=v_att and blk.session_ids=sess then
   update private.team_blocks set holder='team' where id=blk.id;
  else
   if blk.id is not null then update private.team_blocks set ended_at=clock_timestamp(),end_reason='replaced' where id=blk.id; end if;
   insert into private.team_blocks(engagement_id,session_ids,attendee_id,via) values(p_engagement,sess,v_att,'room') returning * into blk;
  end if;
  update public.room_states set remote_holder_id=v_att,team_led_block_id=blk.id,results=private.live_results(p_engagement) where engagement_id=p_engagement returning * into r;
 elsif p_action='take_back' then
  if blk.id is null or blk.holder<>'team' then return jsonb_build_object('status','unchanged','version',r.version); end if;
  update private.team_blocks set holder='lead' where id=blk.id;
  -- The TV does not change: only who holds the remote.
  update public.room_states set remote_holder_id=null where engagement_id=p_engagement returning * into r;
 else
  if blk.id is null then return jsonb_build_object('status','unchanged','version',r.version); end if;
  update private.team_blocks set ended_at=clock_timestamp(),end_reason='lead_ended' where id=blk.id;
  update public.room_states set remote_holder_id=null,team_led_block_id=null where engagement_id=p_engagement returning * into r;
 end if;
 insert into private.room_controls(id,engagement_id,actor_id,action,session_id,room_version,created_at) values(p_id,p_engagement,private.clearway_user_id(),'handover_'||p_action,r.live_session_id,r.version,clock_timestamp());
 select private.first_name(name) into who from public.clearway_users where id=private.clearway_user_id();
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','handover','id',p_id,'action',p_action,'by',who,'to',person,'version',r.version,'changed',false));
 return jsonb_build_object('status','ok','version',r.version);
exception when invalid_text_representation then return jsonb_build_object('status','invalid_request');
end $$;

-- Who has the remote, for the facilitator's banner and the holder's phone. The block's
-- sessions go only to a facilitator and to the person who was handed it. Never the
-- alignment signal, presenter notes or Discover data.
create function private.team_remote_state(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare role text; b private.team_blocks; me uuid; lead text; person text; ends timestamptz; sessions jsonb:='[]'::jsonb; r public.room_states;
begin
 role:=private.live_role(p_engagement);
 if role is null or role not in ('facilitator','participant') then return jsonb_build_object('status','denied'); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted;
 select * into b from private.team_blocks where engagement_id=p_engagement and ended_at is null and not deleted;
 if b.id is null or r.team_led_block_id is distinct from b.id then return jsonb_build_object('status','ok','active',false); end if;
 select a.id into me from public.attendees a where a.engagement_id=p_engagement and a.id in(select private.room_attendee_ids()) and not a.deleted limit 1;
 select private.first_name(c.name) into lead from public.engagement_facilitators f join public.clearway_users c on c.id=f.clearway_user_id
  where f.engagement_id=p_engagement and f.role='lead' and not f.deleted;
 select private.first_name(name) into person from public.attendees where id=b.attendee_id;
 select closes_at into ends from private.followup_access where id=b.followup_id;
 if role='facilitator' or me=b.attendee_id then
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'interaction',s.interaction,'state',s.state) order by t.ord),'[]'::jsonb) into sessions
   from unnest(b.session_ids) with ordinality t(id,ord) join public.sessions s on s.id=t.id and not s.deleted;
 end if;
 return jsonb_build_object('status','ok','active',true,'holder',b.holder,'via',b.via,'designee',person,'lead',lead,
  'designee_id',case when role='facilitator' then b.attendee_id end,'i_am_designee',coalesce(me=b.attendee_id,false),
  'i_hold',coalesce(me=b.attendee_id and b.holder='team',false),'block',sessions,'ends_at',ends,'live_session_id',r.live_session_id);
end $$;

-- ---------- Follow-up access, from the lead facilitator ----------
-- issue {attendee,sessions,opens_at,closes_at,token_hash,code_hash,email?}, extend, reissue {token_hash,code_hash}, revoke, status.
-- The server makes the link and the code, keeps them for one reply, and hands this function
-- only their hashes: the database never holds either one.
create function private.followup_manage(p_engagement uuid,p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a private.followup_access; v_att public.attendees; sess uuid[]; bad integer; v_open timestamptz; v_close timestamp with time zone; st text; tv boolean; remote boolean; blk private.team_blocks;
begin
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 perform 1 from public.room_states where engagement_id=p_engagement and not deleted for update;
 if not found or not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 if p_action is null or p_action not in ('status','issue','extend','reissue','revoke') or jsonb_typeof(p) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 if p_action<>'status' and not private.is_lead(p_engagement) then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 if private.followup_sweep(p_engagement) then update public.room_states set results=private.live_results(p_engagement) where engagement_id=p_engagement; end if;
 select * into a from private.followup_access where engagement_id=p_engagement and not deleted order by issued_at desc,id limit 1 for update;

 if p_action='issue' then
  if a.id is not null and a.revoked_at is null and a.closes_at>clock_timestamp() then return jsonb_build_object('status','exists'); end if;
  if p->>'attendee' is null or p->>'attendee' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or jsonb_typeof(p->'sessions') is distinct from 'array' or jsonb_array_length(p->'sessions') not between 1 and 12
    or p->>'token_hash' is null or p->>'token_hash' !~ '^[a-f0-9]{64}$' or p->>'code_hash' is null or p->>'code_hash' !~ '^[a-f0-9]{64}$' or p->>'opens_at' is null or p->>'closes_at' is null then return jsonb_build_object('status','invalid_request'); end if;
  select * into v_att from public.attendees where id=(p->>'attendee')::uuid and engagement_id=p_engagement and not deleted and verified_at is not null;
  if v_att.id is null then return jsonb_build_object('status','missing'); end if;
  select array_agg(x::uuid order by ord) into sess from jsonb_array_elements_text(p->'sessions') with ordinality t(x,ord);
  select count(*) into bad from unnest(sess) u where not exists(select 1 from public.sessions s where s.id=u and s.engagement_id=p_engagement and not s.deleted and s.mode='live');
  if bad>0 or (select count(distinct u) from unnest(sess) u)<>cardinality(sess) then return jsonb_build_object('status','missing'); end if;
  v_open:=(p->>'opens_at')::timestamptz; v_close:=(p->>'closes_at')::timestamptz;
  if v_close<=clock_timestamp() or v_close<=v_open or v_close>v_open+interval '24 hours' then return jsonb_build_object('status','invalid_window'); end if;
  insert into private.followup_access(engagement_id,attendee_id,email,session_ids,token_hash,code_hash,opens_at,closes_at,issued_by)
   values(p_engagement,v_att.id,lower(btrim(coalesce(nullif(p->>'email',''),v_att.email))),sess,p->>'token_hash',p->>'code_hash',v_open,v_close,private.clearway_user_id()) returning * into a;
  return jsonb_build_object('status','ok','id',a.id,'email',a.email,'first',private.first_name(v_att.name),'opens_at',a.opens_at,'closes_at',a.closes_at);
 end if;

 if p_action<>'status' and (a.id is null or a.revoked_at is not null or a.closes_at<=clock_timestamp()) then
  return jsonb_build_object('status',case when a.id is null then 'missing' else 'ended' end);
 end if;
 if p_action='extend' then
  if a.closes_at+interval '1 hour'>a.opens_at+interval '24 hours' then return jsonb_build_object('status','limit'); end if;
  update private.followup_access set closes_at=closes_at+interval '1 hour' where id=a.id returning * into a;
 elsif p_action='reissue' then
  if p->>'token_hash' is null or p->>'token_hash' !~ '^[a-f0-9]{64}$' or p->>'code_hash' is null or p->>'code_hash' !~ '^[a-f0-9]{64}$' then return jsonb_build_object('status','invalid_request'); end if;
  -- Everything the old code opened is closed: the TV view, the remote and the block.
  declare g private.followup_grants; begin
   for g in select * from private.followup_grants where access_id=a.id and ended_at is null and not deleted order by id for update loop
    if g.tv_device_id is not null then perform private.followup_unpair(g.tv_device_id); end if;
    update private.followup_grants set ended_at=clock_timestamp(),tv_device_id=null where id=g.id;
   end loop;
  end;
  update private.team_blocks set ended_at=clock_timestamp(),end_reason='revoked' where followup_id=a.id and ended_at is null;
  update private.followup_access set token_hash=p->>'token_hash',code_hash=p->>'code_hash',attempts=0,locked_until=null where id=a.id returning * into a;
  update public.room_states set results=private.live_results(p_engagement) where engagement_id=p_engagement;
 elsif p_action='revoke' then
  update private.followup_access set revoked_at=clock_timestamp() where id=a.id returning * into a;
  perform private.followup_sweep(p_engagement);
  -- The remote goes back to the lead; the guard trigger clears the holder. The TV does not change.
  update public.room_states set results=private.live_results(p_engagement) where engagement_id=p_engagement;
 end if;

 if a.id is null then return jsonb_build_object('status','ok','access',null,'now',clock_timestamp()); end if;
 select exists(select 1 from private.followup_grants where access_id=a.id and kind='tv' and ended_at is null and not deleted) into tv;
 select exists(select 1 from private.followup_grants where access_id=a.id and kind='remote' and ended_at is null and not deleted) into remote;
 select * into blk from private.team_blocks where followup_id=a.id and ended_at is null and not deleted;
 st:=case when a.revoked_at is not null then 'revoked' when a.closes_at<=clock_timestamp() then 'expired'
  when a.closes_at<=clock_timestamp()+interval '15 minutes' then 'expiring' when remote or tv then 'paired' else 'issued' end;
 return jsonb_build_object('status','ok','now',clock_timestamp(),'access',jsonb_build_object('id',a.id,'state',st,'attendee',a.attendee_id,
  'first',(select private.first_name(name) from public.attendees where id=a.attendee_id),'email',a.email,'opens_at',a.opens_at,'closes_at',a.closes_at,
  'locked',a.locked_until is not null and a.locked_until>clock_timestamp(),'tv',tv,'remote',remote,'holder',blk.holder,
  'sessions',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'title',s.title) order by t.ord),'[]'::jsonb) from unnest(a.session_ids) with ordinality t(id,ord) join public.sessions s on s.id=t.id)));
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then return jsonb_build_object('status','invalid_request');
end $$;

-- ---------- Follow-up access, from the team facilitator (server only) ----------
-- Entering the link and code. Three wrong codes lock the link for ten minutes.
create function private.followup_enter(p_token_hash text,p_code_hash text,p_grant_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a private.followup_access; 
begin
 if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' or p_code_hash is null or p_code_hash !~ '^[a-f0-9]{64}$' or p_grant_hash is null or p_grant_hash !~ '^[a-f0-9]{64}$' then return jsonb_build_object('status','invalid_request'); end if;
 select * into a from private.followup_access where token_hash=p_token_hash and not deleted for update;
 if not found then return jsonb_build_object('status','invalid'); end if;
 perform 1 from public.room_states where engagement_id=a.engagement_id and not deleted for update;
 if exists(select 1 from public.engagements e where e.id=a.engagement_id and (e.status='closed' or e.deleted)) then return jsonb_build_object('status','ended'); end if;
 if a.revoked_at is not null then return jsonb_build_object('status','revoked'); end if;
 if a.closes_at<=clock_timestamp() then return jsonb_build_object('status','ended'); end if;
 if a.opens_at>clock_timestamp() then return jsonb_build_object('status','before','opens_at',a.opens_at); end if;
 if a.locked_until is not null and a.locked_until>clock_timestamp() then return jsonb_build_object('status','locked','until',a.locked_until); end if;
 if a.code_hash<>p_code_hash then
  update private.followup_access set attempts=case when attempts+1>=3 then 0 else attempts+1 end,
   locked_until=case when attempts+1>=3 then clock_timestamp()+interval '10 minutes' else locked_until end where id=a.id returning * into a;
  if a.locked_until is not null and a.locked_until>clock_timestamp() then return jsonb_build_object('status','locked','until',a.locked_until); end if;
  return jsonb_build_object('status','wrong','tries_left',3-a.attempts);
 end if;
 update private.followup_access set attempts=0,locked_until=null where id=a.id;
 insert into private.followup_grants(access_id,engagement_id,grant_hash) values(a.id,a.engagement_id,p_grant_hash);
 return jsonb_build_object('status','ok','access',a.id,'closes_at',a.closes_at);
exception when unique_violation then return jsonb_build_object('status','invalid_request');
end $$;

-- The state of one grant, for the follow-up page and the team remote. TV-safe: titles of the
-- block's sessions, first names, times. Never notes, the alignment signal or Discover data.
create function private.followup_check(p_grant_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g private.followup_grants; a private.followup_access; blk private.team_blocks; r public.room_states; church text;
begin
 if p_grant_hash is null or p_grant_hash !~ '^[a-f0-9]{64}$' then return jsonb_build_object('status','denied'); end if;
 select * into g from private.followup_grants where grant_hash=p_grant_hash and not deleted;
 if not found then return jsonb_build_object('status','denied'); end if;
 select * into a from private.followup_access where id=g.access_id;
 if a.revoked_at is not null then return jsonb_build_object('status','revoked'); end if;
 if g.ended_at is not null or a.closes_at<=clock_timestamp() then return jsonb_build_object('status','ended'); end if;
 select * into r from public.room_states where engagement_id=a.engagement_id and not deleted;
 select * into blk from private.team_blocks where followup_id=a.id and ended_at is null and not deleted;
 select c.name into church from public.engagements e join public.churches c on c.id=e.church_id where e.id=a.engagement_id;
 return jsonb_build_object('status','ok','kind',g.kind,'first',(select private.first_name(name) from public.attendees where id=a.attendee_id),'church',church,
  'closes_at',a.closes_at,'opens_at',a.opens_at,'holder',blk.holder,'lead',(select private.first_name(c.name) from public.engagement_facilitators f join public.clearway_users c on c.id=f.clearway_user_id where f.engagement_id=a.engagement_id and f.role='lead' and not f.deleted),
  'engagement',a.engagement_id,'live_session_id',r.live_session_id,
  'block',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'interaction',s.interaction,'state',s.state) order by t.ord),'[]'::jsonb) from unnest(a.session_ids) with ordinality t(id,ord) join public.sessions s on s.id=t.id and not s.deleted));
end $$;

-- The TV view in its own tab. The tab already holds its own device cookie; the proof
-- is what proves the two are the same browser. The main TV can never be taken this way.
create function private.followup_pair_tv(p_grant_hash text,p_device uuid,p_proof text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g private.followup_grants; a private.followup_access; d private.tv_devices; old uuid;
begin
 if p_grant_hash is null or p_grant_hash !~ '^[a-f0-9]{64}$' or p_device is null or p_proof is null or p_proof !~ '^[a-f0-9]{64}$' then return jsonb_build_object('status','invalid_request'); end if;
 select * into g from private.followup_grants where grant_hash=p_grant_hash and not deleted;
 if not found then return jsonb_build_object('status','denied'); end if;
 select * into a from private.followup_access where id=g.access_id;
 perform 1 from public.room_states where engagement_id=a.engagement_id and not deleted for update;
 select * into a from private.followup_access where id=g.access_id for update;
 select * into g from private.followup_grants where id=g.id for update;
 if g.ended_at is not null or not private.followup_live(a.id) then return jsonb_build_object('status','ended'); end if;
 if g.kind='remote' then return jsonb_build_object('status','denied'); end if;
 if not private.tv_limit('followup-tv:'||a.id::text,20,300) then return jsonb_build_object('status','limited'); end if;
 select * into d from private.tv_devices where id=p_device and proof=p_proof and not deleted for update;
 if not found then return jsonb_build_object('status','denied'); end if;
 if d.engagement_id is not null and not exists(select 1 from private.followup_grants x where x.tv_device_id=d.id and x.access_id=a.id and x.ended_at is null) then return jsonb_build_object('status','denied'); end if;
 -- One TV view at a time: a new one replaces the last.
 for old in select tv_device_id from private.followup_grants where access_id=a.id and kind='tv' and ended_at is null and not deleted and id<>g.id and tv_device_id is distinct from d.id loop
  perform private.followup_unpair(old);
 end loop;
 update private.followup_grants set ended_at=clock_timestamp(),tv_device_id=null where access_id=a.id and kind='tv' and ended_at is null and id<>g.id;
 update private.tv_devices set engagement_id=a.engagement_id,label='Follow-up TV view',paired_at=now(),code_hash=null,code_expires_at=null,claim_id=null,claim_started_at=null where id=d.id;
 update private.followup_grants set kind='tv',tv_device_id=d.id where id=g.id;
 update public.room_states set results=private.live_results(a.engagement_id) where engagement_id=a.engagement_id;
 return jsonb_build_object('status','ok');
end $$;

-- Taking the remote. The lead's own take-back is respected: the team facilitator asks, and
-- the lead hands it back.
create function private.followup_take_remote(p_grant_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g private.followup_grants; a private.followup_access; blk private.team_blocks; r public.room_states;
begin
 if p_grant_hash is null or p_grant_hash !~ '^[a-f0-9]{64}$' then return jsonb_build_object('status','denied'); end if;
 select * into g from private.followup_grants where grant_hash=p_grant_hash and not deleted;
 if not found then return jsonb_build_object('status','denied'); end if;
 select * into a from private.followup_access where id=g.access_id;
 select * into r from public.room_states where engagement_id=a.engagement_id and not deleted for update;
 select * into a from private.followup_access where id=g.access_id for update;
 select * into g from private.followup_grants where id=g.id for update;
 if g.ended_at is not null or not private.followup_live(a.id) then return jsonb_build_object('status','ended'); end if;
 if g.kind='tv' then return jsonb_build_object('status','denied'); end if;
 select * into blk from private.team_blocks where engagement_id=a.engagement_id and ended_at is null and not deleted for update;
 if blk.id is not null and blk.followup_id is distinct from a.id then return jsonb_build_object('status','busy'); end if;
 if blk.id is not null and blk.holder='lead' then return jsonb_build_object('status','lead_has_it'); end if;
 update private.followup_grants set ended_at=clock_timestamp() where access_id=a.id and kind='remote' and ended_at is null and id<>g.id;
 update private.followup_grants set kind='remote' where id=g.id;
 if blk.id is null then
  insert into private.team_blocks(engagement_id,session_ids,attendee_id,via,followup_id) values(a.engagement_id,a.session_ids,a.attendee_id,'followup',a.id) returning * into blk;
 end if;
 update public.room_states set remote_holder_id=a.attendee_id,team_led_block_id=blk.id,results=private.live_results(a.engagement_id) where engagement_id=a.engagement_id returning * into r;
 perform private.fac_notice(a.engagement_id,jsonb_build_object('kind','handover','action','taken','by',private.first_name((select name from public.attendees where id=a.attendee_id)),'version',r.version,'changed',false));
 return jsonb_build_object('status','ok','version',r.version);
end $$;

-- Asking the lead for the remote back after the lead took it.
create function private.followup_ask(p_grant_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g private.followup_grants; a private.followup_access;
begin
 if p_grant_hash is null or p_grant_hash !~ '^[a-f0-9]{64}$' then return jsonb_build_object('status','denied'); end if;
 select * into g from private.followup_grants where grant_hash=p_grant_hash and not deleted and ended_at is null and kind='remote';
 if not found then return jsonb_build_object('status','denied'); end if;
 select * into a from private.followup_access where id=g.access_id;
 if not private.followup_live(a.id) then return jsonb_build_object('status','ended'); end if;
 if not private.tv_limit('followup-ask:'||a.id::text,6,300) then return jsonb_build_object('status','limited'); end if;
 perform private.fac_notice(a.engagement_id,jsonb_build_object('kind','handover','action','asked','by',private.first_name((select name from public.attendees where id=a.attendee_id)),'changed',false));
 return jsonb_build_object('status','ok');
end $$;

-- A press from the team facilitator's remote. The grant is checked here; the press itself
-- then goes through the room's own control, which holds the limits.
create function private.followup_press(p_grant_hash text,p_id uuid,p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g private.followup_grants; a private.followup_access; out jsonb;
begin
 if p_grant_hash is null or p_grant_hash !~ '^[a-f0-9]{64}$' or p_action is null then return jsonb_build_object('status','denied'); end if;
 select * into g from private.followup_grants where grant_hash=p_grant_hash and not deleted;
 if not found then return jsonb_build_object('status','denied'); end if;
 select * into a from private.followup_access where id=g.access_id;
 if g.ended_at is not null or g.kind is distinct from 'remote' or not private.followup_live(a.id) then return jsonb_build_object('status','ended'); end if;
 perform set_config('clearway.followup_grant',g.id::text,true);
 begin
  if p_action like 'intent\_%' then out:=private.intent_control(a.engagement_id,p_id,substr(p_action,8),p);
  else out:=private.room_control(a.engagement_id,p_id,p_action,p); end if;
 exception when others then perform set_config('clearway.followup_grant','',true); raise;
 end;
 perform set_config('clearway.followup_grant','',true);
 return out;
end $$;

-- What the team remote polls: the TV-safe room state and the cards' pairs by first name.
create function private.followup_snapshot(p_grant_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c jsonb; a private.followup_access; g private.followup_grants;
begin
 c:=private.followup_check(p_grant_hash);
 if c->>'status'<>'ok' then return c; end if;
 select * into g from private.followup_grants where grant_hash=p_grant_hash;
 select * into a from private.followup_access where id=g.access_id;
 return c||jsonb_build_object('room',private.live_public_state(a.engagement_id),
  'pairs',coalesce((select jsonb_agg(jsonb_build_object('card',k.id,'people',coalesce((select jsonb_agg(private.first_name(x.name) order by x.name,x.id) from private.intent_card_people p join public.attendees x on x.id=p.attendee_id and x.engagement_id=p.engagement_id where p.card_id=k.id and not p.deleted),'[]'::jsonb)))
    from private.intent_cards k where k.engagement_id=a.engagement_id and not k.deleted),'[]'::jsonb));
end $$;

-- ---------- The room's remote controls, for the handover ----------
-- room_control as it was (Close day, step 6 of milestone 3), with one change: who may press.
-- remote_actor says facilitator or team. A team press is limited to the actions the team remote
-- shows and to the sessions of its block; everything else is refused.
create or replace function private.room_control(p_engagement uuid,p_id uuid,p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
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
 if actor is null or (actor='team' and coalesce(p_action,'') not in ('go_live','next','back','reopen','phones_down','open_phones','spotlight','clear_spotlight','hide','unhide','room_size')) then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 if p_id is null or p_action is null or jsonb_typeof(p) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 select * into done from private.room_controls where id=p_id;
 if found then
  if done.engagement_id<>p_engagement or done.action<>p_action then return jsonb_build_object('status','conflict'); end if;
  return jsonb_build_object('status','duplicate','version',r.version);
 end if;
 navigation:=p_action in ('go_live','next','back','nothing_live','reopen');
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
  elsif p_action='nothing_live' then
   if cur.id is null then return jsonb_build_object('status','unchanged','version',r.version); end if;
  elsif p_action='reopen' then
   if cur.id is null or cur.state<>'closed' then return jsonb_build_object('status','invalid_state'); end if;
  end if;
  if actor='team' and p_action in ('go_live','next','back') and not coalesce(target.id=any(blk),false) then return jsonb_build_object('status','outside_block'); end if;
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
 if actor='team' then select private.first_name(a.name) into who from public.attendees a where a.id=r.remote_holder_id;
 else select split_part(btrim(name),' ',1) into who from public.clearway_users where id=private.clearway_user_id(); end if;
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','control','id',p_id,'action',p_action,'by',who,'version',r.version,'changed',room_changed));
 return jsonb_build_object('status','ok','version',r.version);
exception when invalid_text_representation then return jsonb_build_object('status','invalid_request');
end $$;

-- ---------- Public entry points (security invoker) ----------
create function public.handover_control(p_engagement uuid,p_id uuid,p_action text,p jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.handover_control(p_engagement,p_id,p_action,p) $$;
create function public.intent_control(p_engagement uuid,p_id uuid,p_action text,p jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.intent_control(p_engagement,p_id,p_action,p) $$;
create function public.intent_edit(p_engagement uuid,p_card uuid,p_op text,p jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.intent_edit(p_engagement,p_card,p_op,p) $$;
create function public.intent_join(p_engagement uuid,p_card uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.intent_join(p_engagement,p_card,false) $$;
create function public.intent_leave(p_engagement uuid,p_card uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.intent_join(p_engagement,p_card,true) $$;
create function public.intent_view(p_engagement uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.intent_view(p_engagement) $$;
create function public.team_remote_state(p_engagement uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.team_remote_state(p_engagement) $$;
create function public.followup_manage(p_engagement uuid,p_action text,p jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select private.followup_manage(p_engagement,p_action,p) $$;

create function public.followup_enter(p_token_hash text,p_code_hash text,p_grant_hash text) returns jsonb
language sql security invoker set search_path='' as $$ select private.followup_enter(p_token_hash,p_code_hash,p_grant_hash) $$;
create function public.followup_check(p_grant_hash text) returns jsonb
language sql security invoker set search_path='' as $$ select private.followup_check(p_grant_hash) $$;
create function public.followup_pair_tv(p_grant_hash text,p_device uuid,p_proof text) returns jsonb
language sql security invoker set search_path='' as $$ select private.followup_pair_tv(p_grant_hash,p_device,p_proof) $$;
create function public.followup_take_remote(p_grant_hash text) returns jsonb
language sql security invoker set search_path='' as $$ select private.followup_take_remote(p_grant_hash) $$;
create function public.followup_ask(p_grant_hash text) returns jsonb
language sql security invoker set search_path='' as $$ select private.followup_ask(p_grant_hash) $$;
create function public.followup_press(p_grant_hash text,p_id uuid,p_action text,p jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.followup_press(p_grant_hash,p_id,p_action,p) $$;
create function public.followup_snapshot(p_grant_hash text) returns jsonb
language sql security invoker set search_path='' as $$ select private.followup_snapshot(p_grant_hash) $$;

revoke all on function
 private.first_name(text),private.is_lead(uuid),private.team_block(uuid,uuid),private.team_run(uuid,uuid),private.followup_live(uuid),private.followup_actor(uuid),private.remote_actor(uuid),
 private.followup_tv_blocked(uuid),private.followup_unpair(uuid),private.followup_sweep(uuid),private.team_block_guard(),
 private.options_intent(jsonb,uuid),private.parse_intent(public.sessions,text,jsonb),private.intent_sync(uuid),private.results_intent(uuid,uuid,text[]),private.items_intent(uuid,text[]),
 private.intent_actor(uuid),private.intent_lock(uuid,uuid,text,text,text),private.intent_edit(uuid,uuid,text,jsonb),private.intent_join(uuid,uuid,boolean),private.intent_view(uuid),
 private.intent_control(uuid,uuid,text,jsonb),private.intent_affirmation(uuid),private.handover_control(uuid,uuid,text,jsonb),private.team_remote_state(uuid),private.followup_manage(uuid,text,jsonb),
 private.followup_enter(text,text,text),private.followup_check(text),private.followup_pair_tv(text,uuid,text),private.followup_take_remote(text),private.followup_ask(text),private.followup_press(text,uuid,text,jsonb),private.followup_snapshot(text),
 public.handover_control(uuid,uuid,text,jsonb),public.intent_control(uuid,uuid,text,jsonb),public.intent_edit(uuid,uuid,text,jsonb),public.intent_join(uuid,uuid),public.intent_leave(uuid,uuid),public.intent_view(uuid),
 public.team_remote_state(uuid),public.followup_manage(uuid,text,jsonb),public.followup_enter(text,text,text),public.followup_check(text),public.followup_pair_tv(text,uuid,text),public.followup_take_remote(text),
 public.followup_ask(text),public.followup_press(text,uuid,text,jsonb),public.followup_snapshot(text)
 from public,anon,authenticated;
grant execute on function
 private.handover_control(uuid,uuid,text,jsonb),private.intent_control(uuid,uuid,text,jsonb),private.intent_edit(uuid,uuid,text,jsonb),private.intent_join(uuid,uuid,boolean),private.intent_view(uuid),
 private.team_remote_state(uuid),private.followup_manage(uuid,text,jsonb),
 public.handover_control(uuid,uuid,text,jsonb),public.intent_control(uuid,uuid,text,jsonb),public.intent_edit(uuid,uuid,text,jsonb),public.intent_join(uuid,uuid),public.intent_leave(uuid,uuid),public.intent_view(uuid),
 public.team_remote_state(uuid),public.followup_manage(uuid,text,jsonb) to authenticated;
-- The team facilitator is not signed in to anything. Only the server, holding the service key, reaches these.
grant execute on function
 private.followup_enter(text,text,text),private.followup_check(text),private.followup_pair_tv(text,uuid,text),private.followup_take_remote(text),private.followup_ask(text),private.followup_press(text,uuid,text,jsonb),private.followup_snapshot(text),
 public.followup_enter(text,text,text),public.followup_check(text),public.followup_pair_tv(text,uuid,text),public.followup_take_remote(text),public.followup_ask(text),public.followup_press(text,uuid,text,jsonb),public.followup_snapshot(text) to service_role;
commit;
