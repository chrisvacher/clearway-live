begin;
-- The Four Helpful Lists load test (50 phones, 3 cards each) on the practice room refused 26 of 150 cards as unavailable:
-- the database cancelled them at its 8 second statement limit while they waited for the room lock.
-- Every open control surface polls the follow-up status about twice a second, and that poll took the room lock (and the
-- practice room's advisory lock) every time, though a status read with nothing to sweep writes nothing. It joined the same
-- first-come queue as the phones for the whole retreat. A status read with no lapsed grant to sweep now reads without
-- the lock. Issue, extend, reissue and revoke, and a status that has a lapsed grant to sweep, lock first as they did.
-- Statuses, results and the order of writes are unchanged.
create or replace function private.followup_manage(p_engagement uuid,p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a private.followup_access; v_att public.attendees; sess uuid[]; bad integer; v_open timestamptz; v_close timestamp with time zone; st text; tv boolean; remote boolean; blk private.team_blocks; read_only boolean;
begin
 -- A status read with nothing to sweep changes nothing, so it does not queue for the room lock behind a room full of answers.
 -- Anything that writes, or a status that has a lapsed grant to sweep, takes the lock first as before.
 read_only:=p_action is not distinct from 'status' and not exists(select 1 from private.followup_access x where x.engagement_id=p_engagement and not x.deleted and x.swept_at is null
   and (x.revoked_at is not null or x.closes_at<=clock_timestamp()));
 if not read_only then
  if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
  perform 1 from public.room_states where engagement_id=p_engagement and not deleted for update;
 else
  perform 1 from public.room_states where engagement_id=p_engagement and not deleted;
 end if;
 if not found or not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 if p_action is null or p_action not in ('status','issue','extend','reissue','revoke') or jsonb_typeof(p) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 if p_action<>'status' and not private.is_lead(p_engagement) then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 if not read_only and private.followup_sweep(p_engagement) then update public.room_states set results=private.live_results(p_engagement) where engagement_id=p_engagement; end if;
 if read_only then
  select * into a from private.followup_access where engagement_id=p_engagement and not deleted order by issued_at desc,id limit 1;
 else
  select * into a from private.followup_access where engagement_id=p_engagement and not deleted order by issued_at desc,id limit 1 for update;
 end if;

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
commit;
