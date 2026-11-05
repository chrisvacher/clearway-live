-- Milestone 4 practice-room fixes, batch 2. Live only, after merge and Chris's approval. No
-- session is started and no data is seeded.
--
-- What changes:
--   Affirm together (sign)        leaving the step closes signing, as every step left behind
--                                  closes; going live on it again now opens signing again, with
--                                  the signatures it has, unless the facilitator closed it
--                                  (Close signing) or closed its day (Close day). A new before-update trigger
--                                  on public.sessions; private.room_control is not redefined.
--   private.followup_take_remote  redefined from 20261104140000_handover_intent.sql, a superset:
--                                  when the room's own handover is still open, the same person
--                                  carries it on through the follow-up (the block is linked to
--                                  the access); while the lead holds it the phone is told so and
--                                  can ask for it; only a block of someone else is busy.
begin;

-- ---------- Affirm together opens again when it is shown again ----------
-- private.room_control shows a step by setting its shown_at, and leaves a closed step closed
-- (read-only until Reopen). For a sign step this looks at why it closed: the first press the
-- room logged at or after its close. Moving on (go_live, next, back) opens it again on this
-- showing, unless its day has been closed since. Close signing (close_signing), Close day
-- (close_part) or anything else keeps it closed. Signatures are never touched.
create function private.sign_reopen_on_show() returns trigger
language plpgsql security definer set search_path='' as $$
declare cause text; day_closed boolean;
begin
 if new.interaction<>'sign' or new.mode<>'live' or old.state<>'closed' or new.state<>'closed' or old.closed_at is null
   or new.shown_at is null or new.shown_at is not distinct from old.shown_at then return new; end if;
 select c.action into cause from private.room_controls c
  where c.engagement_id=new.engagement_id and not c.deleted and c.created_at>=old.closed_at order by c.created_at,c.id limit 1;
 if cause is null or cause not in ('go_live','next','back') then return new; end if;
 -- Close day logs no part, so its day is the one whose steps it closed in the same moment.
 select exists(select 1 from private.room_controls c where c.engagement_id=new.engagement_id and not c.deleted and c.action='close_part' and c.created_at>=old.closed_at
   and exists(select 1 from public.sessions s where s.engagement_id=new.engagement_id and s.part=new.part and not s.deleted
    and s.closed_at between c.created_at-interval '1 second' and c.created_at)) into day_closed;
 if day_closed then return new; end if;
 new.state:='live'; new.closed_at:=null;
 return new;
end $$;
create trigger sign_reopen_on_show before update of shown_at on public.sessions for each row execute function private.sign_reopen_on_show();

-- ---------- Taking the remote through the follow-up ----------
-- Taking the remote. The lead's own take-back is respected: the team facilitator asks, and
-- the lead hands it back. When the room's own handover (a block given in the room) is still
-- open: if it is this person's, the follow-up takes it over and the block becomes the
-- access's; if the lead holds it, this phone becomes the access's remote so it can ask for
-- it; if it is someone else's, it is busy until the lead ends it.
create or replace function private.followup_take_remote(p_grant_hash text) returns jsonb
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
 if blk.id is not null and blk.followup_id is distinct from a.id then
  if blk.attendee_id=a.attendee_id then
   update private.team_blocks set followup_id=a.id where id=blk.id returning * into blk;
  elsif blk.holder<>'lead' then
   return jsonb_build_object('status','busy');
  end if;
 end if;
 if blk.id is not null and blk.holder='lead' then
  -- This phone is the access's remote from now, so it can ask the lead for it.
  if g.kind is distinct from 'remote' then
   update private.followup_grants set ended_at=clock_timestamp() where access_id=a.id and kind='remote' and ended_at is null and id<>g.id;
   update private.followup_grants set kind='remote' where id=g.id;
  end if;
  return jsonb_build_object('status','lead_has_it');
 end if;
 update private.followup_grants set ended_at=clock_timestamp() where access_id=a.id and kind='remote' and ended_at is null and id<>g.id;
 update private.followup_grants set kind='remote' where id=g.id;
 if blk.id is null then
  insert into private.team_blocks(engagement_id,session_ids,attendee_id,via,followup_id) values(a.engagement_id,a.session_ids,a.attendee_id,'followup',a.id) returning * into blk;
 end if;
 update public.room_states set remote_holder_id=a.attendee_id,team_led_block_id=blk.id,results=private.live_results(a.engagement_id) where engagement_id=a.engagement_id returning * into r;
 perform private.fac_notice(a.engagement_id,jsonb_build_object('kind','handover','action','taken','by',private.first_name((select name from public.attendees where id=a.attendee_id)),'version',r.version,'changed',false));
 return jsonb_build_object('status','ok','version',r.version);
end $$;

revoke all on function private.sign_reopen_on_show(),private.followup_take_remote(text) from public,anon,authenticated;
grant execute on function private.followup_take_remote(text) to service_role;
commit;
